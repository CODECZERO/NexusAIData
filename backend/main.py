"""
Lumina AI v4.0 — FastAPI Main Application
Entry point with CORS, WebSocket chat, lifespan events, and router mounts.
"""

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore", message="urllib3.*doesn't match a supported version")

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np # Added by user
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger

from models import ChatIntent, ChatMessage, ChatRequest, DashboardRole
from routers.api import router as api_router, sessions, get_df, get_simulation_engine # Modified by user
from services.ai_service import ai_service
from services.cache_service import cache_service

# Load environment
load_dotenv()

async def background_cleanup():
    """Background task to prune old sessions every hour."""
    from routers.api import prune_stale_sessions
    while True:
        try:
            # Safely prune sessions older than 24 hours
            await prune_stale_sessions(max_age_hours=24)
        except Exception as e:
            logger.error(f"Cleanup error in background worker: {e}")
        await asyncio.sleep(3600)  # Run every hour


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Lumina AI v4.0 starting...")

    # Initialize services in parallel for faster startup (Render 503 prevention)
    from services.rag_service import rag_service
    from routers.api import load_sessions_metadata
    
    await asyncio.gather(
        cache_service.initialize(),
        rag_service.initialize(),
        asyncio.to_thread(load_sessions_metadata)
    )

    # Initialize AI Service
    ai_service.initialize()

    # Create upload dir
    os.makedirs(os.getenv("UPLOAD_DIR", "./uploads"), exist_ok=True)

    # Sync Midnight configuration from bridge (dynamic discovery)
    from services.midnight_service import midnight_service
    await midnight_service.sync_config_from_bridge()

    # Check Midnight Proof Server connectivity
    try:
        from blockchain.zk_proofs import ZKProofEngine
        proof_status = await ZKProofEngine.check_proof_server()
        if proof_status.get("healthy"):
            logger.info(f"Midnight Proof Server connected at {proof_status['url']}")
        else:
            logger.warning(f"Midnight Proof Server unreachable at {proof_status['url']} — blockchain ops will use simulation mode")
    except Exception as e:
        logger.warning(f"Proof server check skipped: {e}")

    # Start background cleanup
    app.state.cleanup_task = asyncio.create_task(background_cleanup())

    logger.info("Lumina AI v4.0 ready")
    yield

    # Cleanup
    if hasattr(app.state, "cleanup_task"):
        app.state.cleanup_task.cancel()
        
    await cache_service.close()
    logger.info("🛑 Lumina AI v4.0 shutdown")


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Lumina AI",
    description="Full-Stack Data Intelligence Platform v4.0",
    version="4.0.0",
    lifespan=lifespan,
)

# CORS - Permissive for production deployment flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── Auth Middleware ──────────────────────────────────────────────────────────
from fastapi import Request, Response
from fastapi.responses import JSONResponse

@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    """Optional API Key authentication. Enabled if LUMINA_API_KEY is set in .env."""
    # Diagnostic logging for Render 503 investigation
    if request.method == "OPTIONS":
        logger.debug(f"Preflight request: {request.url.path} from {request.headers.get('origin')}")
    
    # Always allow CORS preflight and health-check pings (HEAD) to bypass authentication
    if request.method in ["OPTIONS", "HEAD"]:
        return await call_next(request)
        
    lumina_key = os.getenv("LUMINA_API_KEY")
    if lumina_key and request.url.path.startswith("/api") and request.url.path != "/api/health":
        api_key_header = request.headers.get("X-API-Key")
        api_key_query = request.query_params.get("api_key")
        if api_key_header != lumina_key and api_key_query != lumina_key:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing API authentication"}
            )
    return await call_next(request)

# Mount API router
app.include_router(api_router)

# Mount Midnight Blockchain router
from routers.blockchain_api import router as blockchain_router
app.include_router(blockchain_router)


# ── HTTP Streaming Chat ────────────────────────────────────────────────────────
from fastapi.responses import StreamingResponse

@app.post("/api/chat/{session_id}")
async def http_chat_stream(session_id: str, request: ChatRequest):
    """Streaming AI chat via HTTP instead of unstable WebSockets."""
    
    # Build context from session
    try:
        from routers.api import sessions, get_df, save_df, execute_chunked_mutation, execute_sql_from_chat, log_lineage
        session = sessions.get(session_id)
        if not session:
            error_msg = "Session not found. (The server may have restarted due to a code update. Please re-upload your data to continue.)"
            return StreamingResponse(
                iter([json.dumps({"type": "error", "content": error_msg}) + "\n"]), 
                media_type="application/x-ndjson"
            )

        context: dict[str, Any] = {
            "filename": session.get("filename", "Unknown"),
            "row_count": session.get("row_count", 0),
            "column_count": session.get("column_count", 0),
            "columns": [], # Loaded if needed below
        }

        # Enrich with actual data so AI can reference real values
        try:
            df = get_df(session_id)
            context["columns"] = df.columns.tolist()[:30]
            try:
                context["data_sample"] = df.head(5).to_markdown(index=False)
            except Exception:
                context["data_sample"] = df.head(5).to_string(index=False)
            context["dtypes"] = {col: str(dtype) for col, dtype in df.dtypes.items()}
            try:
                stats = df.describe(include="all").fillna("").to_markdown()
            except Exception:
                stats = df.describe().to_string()
            context["stats_summary"] = stats[:2000]  # Cap to avoid token overflow
        except Exception as e:
            logger.error(f"Error loading DF for chat context: {e}")

        # Enrich with RAG Context
        try:
            from services.rag_service import rag_service
            rag_context = await rag_service.retrieve_context(session_id, request.message)
            if rag_context:
                context["rag_context"] = rag_context
        except Exception as e:
            logger.error(f"Failed to retrieve RAG context for chat: {e}")

        if session.get("analysis"):
            analysis = session["analysis"]
            if isinstance(analysis, dict):
                quality = analysis.get("quality", {})
                if quality:
                    context["quality_score"] = quality.get("overall_score", 0)
                ml_res = analysis.get("ml_results", {})
                if ml_res:
                    anomalies = ml_res.get("anomalies", {})
                    if anomalies:
                        context["anomaly_count"] = anomalies.get("anomaly_count", 0)
            else:
                if analysis.quality:
                    context["quality_score"] = analysis.quality.overall_score
                if analysis.ml_results and analysis.ml_results.anomalies:
                    context["anomaly_count"] = analysis.ml_results.anomalies.anomaly_count
    except Exception as e:
        logger.error(f"Error building Chat context for session {session_id}: {e}")
        context = {"filename": "Unknown", "row_count": 0, "column_count": 0, "columns": []}

    async def event_generator():
        # Store user message history conceptually
        # (For a true REST API, the client should send the whole history, but we'll adapt to current prompt)
        chat_history = [ChatMessage(role="user", content=request.message)]

        intent = ai_service.detect_intent(request.message)
        yield json.dumps({"type": "intent", "intent": intent.value}) + "\n"

        if intent == ChatIntent.MODIFY:
            yield json.dumps({"type": "token", "content": "🔧 **Analyzing your data modification request...**\n"}) + "\n"
            
            df = get_df(session_id)
            # Provide richer context
            try:
                sample_str = df.head(3).to_markdown(index=False)
            except Exception:
                sample_str = df.head(3).to_string(index=False)
            dtypes_dict = {col: str(dtype) for col, dtype in df.dtypes.items()}
            
            # Extract detailed audit report for surgical fixing
            audit_report = ""
            if session.get("analysis"):
                ana = session["analysis"]
                issues_list = []
                if hasattr(ana, "quality") and ana.quality:
                    for issue in (ana.quality.critical_issues + ana.quality.high_issues)[:5]:
                        issues_list.append(f"- {issue.issue_type} in {issue.column or 'dataset'}: {issue.description} ({issue.rows_affected} rows)")
                
                anomaly_list = []
                if hasattr(ana, "ml_results") and ana.ml_results and ana.ml_results.anomalies:
                    for row in ana.ml_results.anomalies.anomaly_rows[:10]:
                        anomaly_list.append(f"- Anomaly detected with {row.get('anomaly_confidence')}% confidence. Key values: {row}")

                if issues_list:
                    audit_report += "### Quality Issues:\n" + "\n".join(issues_list) + "\n"
                if anomaly_list:
                    audit_report += "\n### Sample Anomalies (Outliers):\n" + "\n".join(anomaly_list) + "\n"

            code = await ai_service.generate_pandas_code(
                request.message,
                df.columns.tolist(),
                dtypes=dtypes_dict,
                data_sample=sample_str,
                audit_report=audit_report if audit_report else None
            )
            
            if code:
                # Show the plan first
                yield json.dumps({"type": "token", "content": f"\n**📋 Generated Code:**\n```python\n{code}\n```\n\n**Executing (Chunked Transformation)...**\n"}) + "\n"
                try:
                    res = await execute_chunked_mutation(session_id, code)
                    rows_before = res["rows_before"]
                    rows_after = res["rows_after"]
                    
                    # Bust cache so frontend pulls fresh analysis
                    from services.cache_service import cache_service
                    import asyncio
                    asyncio.create_task(cache_service.clear_session(session_id))
                    
                    # Build preview (fetch small sample from disk)
                    new_df_preview = get_df(session_id, sample=True, max_rows=5)
                    try:
                        preview = new_df_preview.to_markdown(index=False)
                    except Exception:
                        preview = new_df_preview.to_string(index=False)
                    
                    success_msg = (
                        f"\n✅ **Data Modified Successfully!**\n"
                        f"- **Before:** {rows_before} rows\n"
                        f"- **After:** {rows_after} rows\n\n"
                        f"**Preview (first 5 rows):**\n{preview}\n\n"
                        f"### 📥 Download Modified Data:\n"
                        f"- [Excel Dashboard](/api/export/{session_id}/excel?advanced=true)\n"
                        f"- [Power BI Blueprint](/api/export/{session_id}/powerbi)\n"
                    )
                    yield json.dumps({"type": "token", "content": success_msg}) + "\n"
                    yield json.dumps({"type": "data_updated"}) + "\n"
                except Exception as e:
                    yield json.dumps({"type": "token", "content": f"\n❌ **Execution Error:** `{str(e)}`\n\nPlease rephrase your request or try a simpler modification."}) + "\n"
            else:
                # Fall back to general chat for explanation
                yield json.dumps({"type": "token", "content": "\n*(Could not generate safe code. Let me explain what I can do instead...)*\n"}) + "\n"
                async for token in ai_service.chat_stream(chat_history, context, request.role):
                    yield json.dumps({"type": "token", "content": token}) + "\n"

        elif intent == ChatIntent.SIMULATE:
            yield json.dumps({"type": "token", "content": "🔮 **Running Decision Support Engine...**\n"}) + "\n"
            
            # Improved Target Detection
            df = get_df(session_id)
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            target = numeric_cols[0] if numeric_cols else "Target"
            for col in numeric_cols:
                if col.lower() in request.message.lower():
                    target = col
                    break
            
            sim_engine = get_simulation_engine()
            try:
                # NEW: Optimal Mix / Constraint Detection
                import re
                from models import PinnedScenario
                
                goal_match = re.search(r'(?:reach|target|goal|to)\s+([\d,.]+)', request.message.lower())
                is_goal_seek = bool(goal_match and any(w in request.message.lower() for w in ["reach", "target", "goal", "how do i"]))
                # NEW: Multi-Objective Detection
                multi_targets: Dict[str, float] = {}
                # Simple regex for "maximize X but minimize Y"
                for col in numeric_cols:
                    if f"maximize {col.lower()}" in request.message.lower() or f"increase {col.lower()}" in request.message.lower():
                        multi_targets[col] = 1.0
                    elif f"minimize {col.lower()}" in request.message.lower() or f"reduce {col.lower()}" in request.message.lower():
                        multi_targets[col] = -1.0
                    elif f"keep {col.lower()} stable" in request.message.lower():
                        multi_targets[col] = 0.0

                is_multi_obj = len(multi_targets) > 1
                is_optimal_mix = any(w in request.message.lower() for w in ["best combination", "optimal mix", "best way", "maximize", "minimize"])
                is_pin = any(w in request.message.lower() for w in ["pin this", "save scenario", "keep this"])
                is_export = any(w in request.message.lower() for w in ["export", "download report", "analyst report"])
                
                constraints: Dict[str, Tuple[float, float]] = {}
                # ... (constraints logic as before)
                if "constrained by" in request.message.lower() or "limit" in request.message.lower():
                    limit_match = re.search(r'limit\s+([a-zA-Z_]+)\s+to\s+([-]?\d+)%', request.message.lower())
                    if limit_match:
                        col_name = limit_match.group(1)
                        l_val = float(limit_match.group(2))
                        constraints[col_name] = (float(min(0.0, l_val)), float(max(0.0, l_val)))
                
                results = await sim_engine.run_simulation(df, target)
                
                # Multi-Objective Path
                if is_multi_obj:
                    multi_mix = await sim_engine.find_multi_objective_mix(df, multi_targets, constraints)
                    results.constrained_results.append(multi_mix)
                    tradeoffs = await sim_engine.calculate_tradeoffs(multi_mix)
                    results.insights.extend(tradeoffs)

                # Single-Objective Optimal Mix
                elif is_optimal_mix:
                    opt_mix = await sim_engine.find_optimal_mix(df, target, constraints)
                    results.constrained_results.append(opt_mix)

                # Goal Seek (as before)
                if is_goal_seek and goal_match:
                    try:
                        target_val = float(goal_match.group(1).replace(',', ''))
                        levers = [l.column for l in results.sensitivity_scans if l.has_positive_impact]
                        if levers:
                            gs_result = await sim_engine.run_goal_seek(df, target, levers[0], target_val)
                            results.insights.append(f"🎯 **Goal Target**: To reach {target_val:,.0f}, you need to change `{levers[0]}` by **{gs_result.required_change_pct:+.1f}%**.")
                    except: pass

                # Update session
                if session_id in sessions:
                    session = sessions[session_id]
                    if "analysis" in session and session["analysis"]:
                        # Pinning logic
                        if is_pin:
                            to_pin = results.constrained_results[0] if results.constrained_results else results.scenarios[0]
                            session["analysis"].simulation.pinned_scenarios.append(PinnedScenario(
                                scenario_id=getattr(to_pin, 'scenario_id', 'custom'),
                                name=f"Saved Strategy: {target}",
                                results=to_pin
                            ))
                        session["analysis"].simulation = results

                # Narration
                yield json.dumps({"type": "token", "content": f"### 🔮 Decision Support: `{target}` Optimization\n"}) + "\n"
                
                # Check for anomalies
                anomalies = sim_engine.check_anomalies(df, target)
                results.insights.extend(anomalies)

                # Export Link (Mocked for now as text)
                if is_export:
                    report_md = await sim_engine.generate_markdown_report(results)
                    yield json.dumps({"type": "token", "content": f"\n{report_md}\n\n"}) + "\n"
                    yield json.dumps({"type": "token", "content": "✅ **Report Generated.** You can copy the section above.\n"}) + "\n"
                
                # Analyst Guardrails
                if results.insights:
                    for insight in results.insights:
                        yield json.dumps({"type": "token", "content": f"{insight}\n"}) + "\n"
                    yield json.dumps({"type": "token", "content": "\n"}) + "\n"

                # Optimal Mix Insight
                if is_optimal_mix and results.constrained_results:
                    mix = results.constrained_results[0]
                    yield json.dumps({"type": "token", "content": f"🚀 **Optimal Strategy Found!** By combining shifts across multiple levers, we can improve `{target}` by **{mix.improvement_pct:+.1f}%**.\n\n"}) + "\n"
                    yield json.dumps({"type": "token", "content": "**Recommended Mix:**\n"}) + "\n"
                    for l, p in mix.levers.items():
                        yield json.dumps({"type": "token", "content": f"- `{l}`: **{p:+.1f}%**\n"}) + "\n"
                    
                    if mix.explanations:
                        yield json.dumps({"type": "token", "content": "\n**🧠 Causal Attribution (SHAP Reasoning):**\n"}) + "\n"
                        for xai in mix.explanations:
                            yield json.dumps({"type": "token", "content": f"- `{xai.column}` contributes ~{abs(xai.contribution_pct):.1f}% to the growth via {xai.direction} pressure.\n"}) + "\n"
                    yield json.dumps({"type": "token", "content": "\n---\n"}) + "\n"
                
                # Goal Seek Insight
                if is_goal_seek and goal_match and results.scenarios:
                    try:
                        target_val = float(goal_match.group(1).replace(',', ''))
                        # Use the best lever for goal seeking if available
                        seek_lever = results.optimization.best_lever if (results.optimization and results.optimization.best_lever) else results.scenarios[0].liver_column
                        
                        gs_result = await sim_engine.goal_seek(df, target, target_val, seek_lever)
                        if gs_result.is_feasible:
                            yield json.dumps({"type": "token", "content": f"🎯 **Goal Achieved!** To reach your target of **{target_val:,.0f}**, you should adjust `{gs_result.lever_column}` (change: **{gs_result.required_change_pct:+.1f}%**).\n\n"}) + "\n"
                        else:
                            yield json.dumps({"type": "token", "content": f"⚠️ **Stretch Goal:** A direct increase in `{seek_lever}` might not reach **{target_val:,.0f}** alone. The forecast peaks at ~{gs_result.predicted_outcome:,.0f}.\n\n"}) + "\n"
                    except Exception as gs_err:
                        logger.error(f"Goal seek error: {gs_err}")

                # ROI / Best Lever
                opt = results.optimization
                if opt:
                    yield json.dumps({"type": "token", "content": f"💡 **Strategist Recommendation**: Focus on `{opt.best_lever}`. It has the highest **ROI Density**—every 1% investment yields a **{opt.max_roi_pct:.2f}%** return in `{target}`.\n\n"}) + "\n"

                for s in results.scenarios[:2]:
                    impact_str = "increase" if s.impact_pct > 0 else "decrease"
                    conf_low, conf_high = s.uncertainty_range if s.uncertainty_range else (0, 0)
                    
                    yield json.dumps({"type": "token", "content": f"#### {s.name}\n"}) + "\n"
                    yield json.dumps({"type": "token", "content": f"- **Expected Impact**: **{abs(s.impact_pct):.1f}% {impact_str}**.\n"}) + "\n"
                    yield json.dumps({"type": "token", "content": f"- **80% Confidence Range**: {results.baseline_value + conf_low:,.2f} to {results.baseline_value + conf_high:,.2f}\n"}) + "\n"
                    
                    if s.secondary_impacts:
                        yield json.dumps({"type": "token", "content": "**🔗 Causal Linkages:** " + ", ".join([f"`{imp['column']}` (~{imp['estimated_impact_pct']:+.1f}%)" for imp in s.secondary_impacts[:2]]) + "\n\n"}) + "\n"

                yield json.dumps({"type": "token", "content": f"\n---\n*Relational model confidence: {results.model_score*100:.1f}% R²*\n"}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "token", "content": f"⚠️ **Simulation Engine Error:** {str(e)}\n"}) + "\n"

        elif intent == ChatIntent.CHART_EDIT:
            yield json.dumps({"type": "token", "content": "*(Planning dashboard modification...)*\n"}) + "\n"
            try:
                # 1. Stream the AI's explanation/plan
                async for token in ai_service.chat_stream(chat_history, context, request.role):
                    yield json.dumps({"type": "token", "content": token}) + "\n"
                
                # 2. Extract potential columns for the chart
                words = request.message.lower().split()
                cols_to_use = [col for col in context.get('columns', []) if col.lower() in words]
                
                # 3. Trigger mutation if columns/actions detected
                if cols_to_use or any(w in words for w in ["theme", "color", "layout", "insert", "add"]):
                    chart_data = {
                        "columns": cols_to_use,
                        "type": "bar" if "bar" in words else "line" if "line" in words else "scatter" if "scatter" in words else "pie" if "pie" in words else "kpi",
                        "theme": "dark" if "dark" in words else "light" if "light" in words else None
                    }
                    
                    # Store in session for export
                    if "custom_charts" not in session:
                        session["custom_charts"] = []
                    session["custom_charts"].append(chart_data)

                    yield json.dumps({
                        "type": "dashboard_mutate", 
                        "action": "add_chart" if any(w in words for w in ["add", "insert", "chart", "graph"]) else "update_layout",
                        "value": chart_data,
                        "message": f"\n\n✅ **Action Taken:** Dashboard modified. [Download Updated Excel](/api/export/{session_id}/excel?advanced=true)"
                    }) + "\n"
            except Exception as e:
                logger.error(f"Chart edit failed: {e}")
                yield json.dumps({"type": "error", "content": f"Failed to modify dashboard: {str(e)}"}) + "\n"

        elif intent == ChatIntent.EXPORT:
            yield json.dumps({"type": "token", "content": "*(Preparing requested export...)*\n"}) + "\n"
            try:
                # 1. Stream the AI's explanation
                async for token in ai_service.chat_stream(chat_history, context, request.role):
                    yield json.dumps({"type": "token", "content": token}) + "\n"
                
                # 2. Provide direct links
                yield json.dumps({
                    "type": "token",
                    "content": f"\n\n### 📥 Download Links:\n- [Excel Dashboard (Advanced)](/api/export/{session_id}/excel?advanced=true)\n- [Power BI Blueprint (.zip)](/api/export/{session_id}/powerbi)"
                }) + "\n"
            except Exception as e:
                logger.error(f"Export prep failed: {e}")
                yield json.dumps({"type": "error", "content": "Failed to prepare export links."}) + "\n"

        elif intent == ChatIntent.FILTER:
            yield json.dumps({"type": "token", "content": "*(Applying dynamic dashboard filter...)*\n"}) + "\n"
            try:
                async for token in ai_service.chat_stream(chat_history, context, request.role):
                    yield json.dumps({"type": "token", "content": token}) + "\n"

                words = request.message.replace("?", "").replace("!", "").replace(".", "").split()
                filter_val = next((w for w in reversed(words) if len(w) > 2), None)
                
                if filter_val:
                    yield json.dumps({
                        "type": "dashboard_mutate",
                        "action": "filter",
                        "value": filter_val,
                        "message": f"\n*(Filtered dashboard to show only data matching: '{filter_val}')*"
                    }) + "\n"
            except Exception as e:
                logger.error(f"Filter stream failed: {e}")
                yield json.dumps({"type": "error", "content": "Failed to apply dashboard filter."}) + "\n"

        elif intent == ChatIntent.ENRICH:
            yield json.dumps({"type": "token", "content": "*(Running data enrichment pipeline...)*\n"}) + "\n"
            try:
                from services.enrichment_engine import DataEnrichmentEngine
                enricher_engine = DataEnrichmentEngine()
                
                # 1. Run enrichment
                df = get_df(session_id)
                enriched_df, enrichment_res = await enricher_engine.enrich(df)
                save_df(session_id, enriched_df)
                session["analysis"] = None # Trigger re-analysis on next load
                
                # 2. Inform user via stream
                summary = f"Added {len(enrichment_res.new_columns_added)} new features: {', '.join(enrichment_res.new_columns_added[:5])}"
                log_lineage(session_id, "Data Enrichment", summary)
                yield json.dumps({"type": "token", "content": f"✅ **Enrichment Complete:** {summary}\n\n"}) + "\n"
                
                # 3. Stream the AI's explanation of what was done
                async for token in ai_service.chat_stream(chat_history, context, request.role):
                    yield json.dumps({"type": "token", "content": token}) + "\n"
                
                yield json.dumps({"type": "data_updated"}) + "\n"
            except Exception as e:
                logger.error(f"Enrichment failed: {e}")
                yield json.dumps({"type": "error", "content": f"Failed to enrich data: {str(e)}"}) + "\n"

        else:
            try:
                # ── Analyst Power Feature: Try NL2SQL first for general data questions ─────
                if intent in (ChatIntent.GENERAL, ChatIntent.DRILL, ChatIntent.EXPLAIN, ChatIntent.COMPARE):
                    sql_res = await execute_sql_from_chat(session_id, request.message)
                    if sql_res:
                        yield json.dumps(sql_res) + "\n"
                        # Also stream a short AI thought about the results
                        chat_history.append(ChatMessage(role="assistant", content=f"I ran this SQL: {sql_res.get('sql')}. Here are the results: {sql_res.get('content')}"))
                
                async for token in ai_service.chat_stream(chat_history, context, request.role):
                    yield json.dumps({"type": "token", "content": token}) + "\n"
            except Exception as stream_err:
                logger.error(f"Stream generation error: {stream_err}")
                yield json.dumps({"type": "token", "content": "\n\n*(Connection interrupted returning results. Please try again.)*"}) + "\n"

        # Send completion
        yield json.dumps({"type": "done", "intent": intent.value}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


# ── Root ─────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "name": "Lumina AI",
        "version": "4.0.0",
        "description": "Full-Stack Data Intelligence Platform",
        "docs": "/docs",
        "health": "/api/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
        log_level="info",
    )
