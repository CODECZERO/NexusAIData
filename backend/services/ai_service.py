"""
Lumina AI v4.0 - AI Chat Service
Using NVIDIA NIM API (deepseek-ai/deepseek-r1-distill-qwen-32b)
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, AsyncGenerator

import requests
from loguru import logger

from models import ChatIntent, ChatMessage, DashboardRole


class AIService:
    """AI chat integration using Nvidia NIM API with streaming support."""

    def __init__(self):
        self.api_key = None
        self.url = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1/chat/completions")
        self.model = os.getenv("NVIDIA_MODEL", "meta/llama-3.3-70b-instruct")

    def initialize(self):
        """Initialize AI client configuration."""
        self.api_key = os.getenv("NVIDIA_API_KEY")

        if self.api_key and "your_nvidia_api_key_here" not in self.api_key:
            logger.info(f"✅ AI Chat: Nvidia NIM initialized ({self.model})")
        else:
            self.api_key = None # Invalidate dummy strings
            logger.warning("⚠️ AI Chat: NVIDIA_API_KEY is missing or contains placeholder. AI features will stay in offline/guidance mode.")

    @property
    def is_available(self) -> bool:
        return bool(self.api_key)

    async def parse_nexus_intent(self, message: str, context: dict[str, Any]) -> dict[str, Any]:
        """Deeply analyze user intent and return structured actions + answer."""
        if not self.is_available:
            return {"answer": "AI service offline.", "actions": []}

        cols = context.get('columns', [])
        filename = context.get('filename', 'dataset')
        
        prompt = f"""You are the Nexus Agentic Copilot. Your goal is to orchestrate the platform for the user.
Dataset: {filename}
Columns: {cols}

User request: "{message}"

Analyze if the user wants to:
1. RUN A SIMULATION: If they ask about impact, "what if", optimization, or reaching a goal.
2. CLEAN DATA: If they ask to fix outliers, missing values, or general cleaning.
3. VISUALIZE: If they want to see a specific chart or pattern.
4. NAVIGATE: If they want to "go to" a specific tab (Dashboard, Quality, Simulation, Predict, PowerBI).

Return a JSON object:
{{
  "answer": "A proactive, helpful response describing what you are doing.",
  "actions": [
    {{
      "action_type": "simulate" | "clean" | "visualize" | "navigate",
      "description": "Short label for the action card",
      "payload": {{ ... }}
    }}
  ],
  "suggested_questions": ["3 relevant follow-up questions"]
}}

Payload formats:
- simulate: {{"target_column": "Col", "levers": {{ "Col": weight }}, "is_multi": boolean}}
- clean: {{"suggested_action": "description of fix"}}
- visualize: {{"chart_type": "bar", "columns": ["A", "B"]}}
- navigate: {{"target_tab": "dashboard" | "quality" | "simulation" | "predict" | "powerbi"}}

Rules:
- If multiple actions are appropriate, include them.
- If the user just wants to talk, return actions: [].
- Return ONLY JSON. No markdown.
"""
        try:
            raw = await self.get_completion(prompt, temperature=0.2)
            if not raw: return {"answer": "I'm having trouble thinking right now.", "actions": []}
            
            # Cleanup
            if "```" in raw:
                raw = raw.split("```")[-2].strip()
                if raw.startswith("json"): raw = raw[4:].strip()
            
            return json.loads(raw)
        except Exception as e:
            logger.error(f"Nexus parsing error: {e}")
            return {"answer": f"Parsing error: {e}", "actions": []}

    def detect_intent(self, message: str) -> ChatIntent:
        """Detect user intent from chat message."""
        msg_lower = message.lower()

        if any(w in msg_lower for w in ["drop", "delete", "remove", "add column", "impute", "replace", "rename", "modify", "change", "update", "clean", "fix", "resolve", "correct", "handle", "repair", "address", "patch", "edit"]):
            return ChatIntent.MODIFY
        elif any(w in msg_lower for w in ["filter", "show only", "where", "limit to", "isolate", "exclude", "include", "find rows", "search for"]):
            return ChatIntent.FILTER
        elif any(w in msg_lower for w in ["highlight", "mark", "color", "emphasize", "spotlight", "flag", "shade"]):
            return ChatIntent.HIGHLIGHT
        elif any(w in msg_lower for w in ["why", "explain", "root cause", "reason", "how come", "what caused", "understand", "diagnose", "clarify"]):
            return ChatIntent.EXPLAIN
        elif any(w in msg_lower for w in ["compare", "vs", "versus", "difference", "benchmark", "against", "contrast", "instead of", "correlate"]):
            return ChatIntent.COMPARE
        elif any(w in msg_lower for w in ["forecast", "predict", "next", "future", "trend", "estimate", "project", "upcoming", "what if"]):
            return ChatIntent.FORECAST
        elif any(w in msg_lower for w in ["drill", "break down", "by", "group", "segment", "categorize", "split by", "aggregate", "summarize"]):
            return ChatIntent.DRILL
        elif any(w in msg_lower for w in ["extract", "pull", "get data", "fetch", "scrape", "gather", "retrieve", "mine", "collect"]):
            return ChatIntent.ENRICH
        elif any(w in msg_lower for w in ["export", "download", "pdf", "excel", "save", "print", "generate report", "output"]):
            return ChatIntent.EXPORT
        elif any(w in msg_lower for w in ["chart", "graph", "plot", "dashboard", "visual", "insert", "add", "draw", "visualize", "diagram"]):
            return ChatIntent.CHART_EDIT
        elif any(w in msg_lower for w in ["simulate", "what if", "scenario", "predict impact", "if i change", "suppose", "assume", "goal seek", "reach", "target of", "how do i get", "optimize", "maximize", "minimize", "roi", "best lever"]):
            return ChatIntent.SIMULATE
        else:
            return ChatIntent.GENERAL

    async def generate_pandas_code(self, message: str, columns: list[str], dtypes: dict | None = None, data_sample: str | None = None, audit_report: str | None = None) -> str | None:
        """Generate safe pandas code to modify the dataframe 'df'. Supports multi-line."""
        if not self.is_available:
            return None

        dtypes_str = ""
        if dtypes:
            dtypes_str = "\nColumn dtypes: " + ", ".join(f"{k}: {v}" for k, v in list(dtypes.items())[:25])

        sample_str = ""
        if data_sample:
            sample_str = f"\nSample data (first 3 rows):\n{data_sample}"

        report_str = ""
        if audit_report:
            report_str = f"\nData Quality / Anomaly Report:\n{audit_report}"

        prompt = f"""You are a Python data engineer. The user wants to modify their dataset.
Columns: {columns}
{dtypes_str}
{sample_str}
{report_str}

User request: "{message}"

Write Python pandas code that modifies the variable `df` (a pandas DataFrame) to fulfill the request.
You may write MULTIPLE lines of code. The variable `df` is already defined. You can use `pd` (pandas) and `np` (numpy).
After your code runs, the resulting `df` will be saved.

PRECISION & QUALITY RULES:
- PRECISION OVER- **SIMULATE Intent**: You are a **Strategic Data Consultant**. Detect if the user is asking a point-scenario ("What if X happens?") or a Goal-Seeking question ("How do I reach target Y?"). 
    - Narrate the impact on the target metric.
    - Highlight **Secondary Impacts** (knock-on effects).
    - Provide **Prescriptive Advice** based on ROI (Investment vs Impact).
    - If a goal is reached, explain the specific lever changes needed.
- **PRECISION OVER DESTRUCTION**: If the user asks to "fix anomalies" or "clean data", do NOT perform broad filters that drop valid rows. Use the specific indices or conditions identified in the Data Quality / Anomaly Report above.
- SURGICAL REPAIR: Favor imputation (replacing with median/mode) or flagging instead of dropping, unless the user explicitly said "remove" or "drop".
- CHUNK EFFICIENCY: For large data, favor vectorized pandas operations (e.g. df.loc, df.fillna) rather than loops or .apply().
- MEMORY SAFETY: Always modify `df` in-place where possible. Avoid creating large intermediate copies of the dataframe (e.g. avoid `new_df = df.copy()`). 
- PRESERVATION: If you aren't 100% sure a row is bad, KEEP IT.

CRITICAL RULES - FAILURE TO OBEY WILL CRASH THE SYSTEM:
- Return ONLY raw, valid, executable Python code.
- Do NOT output ANY markdown formatting (no ```python blocks).
- Do NOT output any conversational text or explanations.
- You MUST ONLY use the EXACT column names provided above.
- Do NOT import pandas or numpy.
- Do NOT print anything.
- Always assign the final result back to `df`.

Example input: "fix all rows where profit is negative by capping it at 0"
Example output:
df.loc[df['Profit'] < 0, 'Profit'] = 0

Example input: "drop the columns that have over 90% missing values as identified in the report"
Example output:
df = df.drop(columns=['OldCol1', 'OldCol2'])
"""
        try:
            import requests
            import asyncio
            headers = {
                "accept": "application/json",
                "content-type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 1024,
                "stream": False
            }
            res = await asyncio.to_thread(
                requests.post, self.url, json=payload, headers=headers, timeout=60
            )
            res.raise_for_status()
            data = res.json()
            raw = data["choices"][0]["message"]["content"].strip()
            
            # Strip markdown fences
            if "```python" in raw:
                raw = raw.split("```python", 1)[1]
                if "```" in raw:
                    raw = raw.split("```", 1)[0]
            elif "```" in raw:
                raw = raw.split("```", 1)[1]
                if "```" in raw:
                    raw = raw.split("```", 1)[0]
            
            code = raw.strip()
            
            # Safety: block dangerous operations
            blocked = ["import os", "import sys", "subprocess", "open(", "exec(", "eval(", "__import__", "shutil", "rmdir", "unlink"]
            if any(b in code for b in blocked):
                logger.warning(f"Blocked unsafe code: {code[:100]}")
                return None
            
            # Must reference df
            if "df" in code:
                return code
        except Exception as e:
            logger.error(f"Error generating pandas code: {e}")
        return None

    async def generate_sql_query(self, message: str, columns: list[str], dtypes: dict | None = None, filename: str = "data") -> str | None:
        """Generate valid DuckDB SQL from natural language."""
        if not self.is_available:
            return None

        schema_str = ", ".join(f"{col} ({dtypes.get(col, 'Unknown')})" if dtypes else col for col in columns)
        
        prompt = f"""You are a DuckDB SQL Expert. The user wants to query their dataset.
Table name: 'data'
Columns: {schema_str}

User request: "{message}"

Rules:
- Return ONLY the raw SQL query.
- Use 'data' as the table name.
- DuckDB supports standard SQL, including CTEs, window functions, and AGGREGATES.
- No markdown formatting. No ```sql blocks.
- If you can't satisfy the request with the columns available, return "ERROR: <reason>".

Example output: SELECT sum(Sales) FROM data WHERE Region = 'North' GROUP BY Category
"""
        try:
            import requests
            import asyncio
            headers = {
                "accept": "application/json",
                "content-type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.05,
                "max_tokens": 512,
                "stream": False
            }
            res = await asyncio.to_thread(
                requests.post, self.url, json=payload, headers=headers, timeout=60
            )
            res.raise_for_status()
            data = res.json()
            raw = data["choices"][0]["message"]["content"].strip()
            
            # Clean up markdown if any
            if "```" in raw:
                raw = raw.split("```")[-2].replace("sql", "").strip() if "```sql" in raw else raw.split("```")[-2].strip()
            
            return raw
        except Exception as e:
            logger.error(f"Error generating SQL query: {e}")
            return None

    async def get_completion(self, prompt: str, temperature: float = 0.1) -> str | None:
        """Simple non-streaming completion for internal tasks."""
        if not self.is_available:
            return None
        try:
            import requests
            import asyncio
            headers = {
                "accept": "application/json",
                "content-type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": 1024,
                "stream": False
            }
            res = await asyncio.to_thread(
                requests.post, self.url, json=payload, headers=headers, timeout=60
            )
            res.raise_for_status()
            data = res.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"AI Completion failed: {e}")
            return None

    async def chat_stream(
        self,
        messages: list[ChatMessage],
        context: dict[str, Any],
        role: DashboardRole = DashboardRole.ANALYST,
    ) -> AsyncGenerator[str, None]:
        """Stream AI response tokens from Nvidia API, with non-streaming fallback."""
        if not self.is_available:
            yield "⚠️ AI Chat is not configured. Please set `NVIDIA_API_KEY` in your `.env` file.\n\n"
            yield f"Current analysis context: **{context.get('filename', 'Unknown')}** ({context.get('row_count', 0)} rows)."
            return

        system_prompt = self._build_system_prompt(context, role)
        
        # Build messages for API
        api_messages = [{"role": "system", "content": system_prompt}]
        for m in messages:
            api_messages.append({"role": m.role, "content": m.content})

        try:
            import requests as req_lib
            import asyncio

            headers = {
                "accept": "application/json",
                "content-type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }

            # ── Strategy 1: Try streaming first ──────────────────
            logger.info(f"Attempting streaming from Nvidia API ({self.model})...")
            streaming_worked = False
            
            try:
                payload_stream = {
                    "model": self.model,
                    "messages": api_messages,
                    "temperature": 0.2,
                    "top_p": 0.7,
                    "max_tokens": 4096,
                    "stream": True
                }

                token_queue: asyncio.Queue = asyncio.Queue()
                loop = asyncio.get_event_loop()

                def _do_stream():
                    try:
                        resp = req_lib.post(
                            self.url, json=payload_stream, headers=headers,
                            stream=True, timeout=(15, 120)  # (connect, read) timeout
                        )
                        resp.raise_for_status()
                        
                        # Check if response is actually streaming (SSE) or a single JSON blob
                        content_type = resp.headers.get('content-type', '')
                        if 'text/event-stream' not in content_type and 'application/json' in content_type:
                            # Server returned non-streaming JSON despite stream=True
                            try:
                                data = resp.json()
                                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                                if content:
                                    loop.call_soon_threadsafe(token_queue.put_nowait, ("fallback", content))
                            except Exception:
                                pass
                            return
                        
                        got_content = False
                        for line in resp.iter_lines(decode_unicode=True):
                            if not line or not line.startswith("data: "):
                                continue
                            data_str = line[len("data: "):]
                            if data_str.strip() == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                # Try content first, then reasoning_content (some models put answers there)
                                content = delta.get("content", "") or ""
                                if not content and "reasoning_content" in delta:
                                    content = delta.get("reasoning_content", "") or ""
                                if content:
                                    got_content = True
                                    loop.call_soon_threadsafe(token_queue.put_nowait, ("token", content))
                            except Exception:
                                pass
                        
                        if not got_content:
                            loop.call_soon_threadsafe(token_queue.put_nowait, ("no_content", None))
                            
                    except Exception as e:
                        logger.warning(f"Streaming failed: {e}")
                        loop.call_soon_threadsafe(token_queue.put_nowait, ("error", e))
                    finally:
                        loop.call_soon_threadsafe(token_queue.put_nowait, ("done", None))

                loop = asyncio.get_event_loop()
                loop.run_in_executor(None, _do_stream)

                # Wait for tokens with a 10s timeout for first data
                first_token_timeout = 10.0
                got_first = False
                
                while True:
                    try:
                        if not got_first:
                            item = await asyncio.wait_for(token_queue.get(), timeout=first_token_timeout)
                        else:
                            item = await asyncio.wait_for(token_queue.get(), timeout=120)
                    except asyncio.TimeoutError:
                        if not got_first:
                            logger.warning("Streaming: No data in 10s, falling back to non-streaming")
                            break
                        else:
                            break
                    
                    msg_type, msg_data = item
                    
                    if msg_type == "token":
                        got_first = True
                        streaming_worked = True
                        yield msg_data
                    elif msg_type == "fallback":
                        # Server returned full response as JSON
                        streaming_worked = True
                        # Yield in chunks for smooth UX
                        for i in range(0, len(msg_data), 8):
                            yield msg_data[i:i+8]
                            await asyncio.sleep(0.02)
                        break
                    elif msg_type == "done":
                        if got_first:
                            streaming_worked = True
                        break
                    elif msg_type == "error":
                        break
                    elif msg_type == "no_content":
                        break
                        
            except Exception as e:
                logger.warning(f"Streaming attempt failed: {e}")

            # ── Strategy 2: Non-streaming fallback ───────────────
            if not streaming_worked:
                logger.info(f"Falling back to non-streaming request ({self.model})...")
                try:
                    payload_sync = {
                        "model": self.model,
                        "messages": api_messages,
                        "temperature": 0.2,
                        "top_p": 0.7,
                        "max_tokens": 4096,
                        "stream": False
                    }
                    
                    resp = await asyncio.to_thread(
                        req_lib.post, self.url, json=payload_sync, headers=headers, timeout=180
                    )
                    
                    if resp.status_code == 200:
                        data = resp.json()
                        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                        if content:
                            # Simulate streaming by yielding in small chunks
                            for i in range(0, len(content), 6):
                                yield content[i:i+6]
                                await asyncio.sleep(0.015)
                        else:
                            yield "*(AI returned empty response. Please try again.)*"
                    else:
                        yield f"\n\n*(API Error: HTTP {resp.status_code} — {resp.text[:200]})*"
                        
                except req_lib.exceptions.ReadTimeout:
                    yield "\n\n*(Response timed out after 180s. Try a shorter question.)*"
                except Exception as e:
                    logger.error(f"Non-streaming fallback also failed: {e}")
                    yield f"\n\n*(API Error: {str(e)})*"

        except Exception as e:
            logger.error(f"Raw NVIDIA API error: {e}")
            yield f"\n\n*(Note: API Connection failed. Error: {str(e)})*"

    def _build_system_prompt(self, context: dict[str, Any], role: DashboardRole) -> str:
        """Build concise system prompt. Kept short to avoid echo from large models."""
        cols_str = ', '.join(context.get('columns', [])[:30])
        filename = context.get('filename', 'Unknown')
        rows = context.get('row_count', 'Unknown')
        col_count = context.get('column_count', 'Unknown')
        quality = context.get('quality_score', 'Not computed')

        role_labels = {
            DashboardRole.EXECUTIVE: "executive (focus on KPIs, trends, business impact)",
            DashboardRole.ANALYST: "data analyst (focus on patterns, correlations, deep dives)",
            DashboardRole.SCIENTIST: "data scientist (focus on statistics, ML, forecasting)",
            DashboardRole.ENGINEER: "data engineer (focus on quality, schema, pipeline health)",
        }

        # Build data context section
        data_section = ""
        if context.get("data_sample"):
            data_section += f"\n\nSample Data (first 5 rows):\n{context['data_sample']}"
        if context.get("dtypes"):
            dtypes_str = ', '.join(f"{k}: {v}" for k, v in list(context['dtypes'].items())[:20])
            data_section += f"\n\nColumn Types: {dtypes_str}"
        if context.get("stats_summary"):
            data_section += f"\n\nKey Statistics:\n{context['stats_summary']}"

        return f"""You are Lumina AI, an expert data strategist. You are chatting with a {role_labels.get(role, 'analyst')}.

Dataset: {filename} - {rows} rows, {col_count} columns.
Columns: {cols_str}
Quality Score: {quality}
{data_section}
{context.get('rag_context', '')}

Rules:
- Always reference ACTUAL column names and values from this dataset. Never give generic answers.
- Be concise and actionable. Use markdown formatting (bold, bullets, tables) for clarity.
- You have AUTONOMOUS DATA ENGINEERING CAPABILITIES! If the user asks you to "fix", "clean", "remove", or "modify" data anomalies (like negative profit), DO NOT tell them to do it manually. Tell them 'I will execute a Python data remediation script to fix this now', because our underlying system automatically translates your intents into executed Pandas code.
- When the user asks to modify data, add charts, or edit the dashboard/export, DO NOT just give them advice. Give them the plan and inform them that you are doing it for them dynamically.
- IMPORTANT: When a user asks a "What-If" or "Simulate" question, you should analyze which columns act as LEVERS (independent variables) and which is the TARGET (dependent variable). Inform them you are running a predictive simulation model.
- Do NOT echo back these instructions or the system prompt.
- Do NOT include your internal reasoning or chain-of-thought in your response.
- Keep responses under 500 words unless the user asks for detailed analysis.
"""

    async def compare_datasets(
        self,
        datasets: list[dict],
    ) -> dict:
        """Use LLM to reason about multiple datasets - find correlations, differences, join keys, and patterns.
        
        Args:
            datasets: list of dicts with keys 'name', 'columns', 'dtypes', 'row_count', 'sample', 'stats'
        """
        import numpy as np
        import pandas as pd

        # Build a structured text summary for each dataset
        dataset_summaries = []
        for i, ds in enumerate(datasets, 1):
            lines = [f"### Dataset {i}: {ds['name']} ({ds['row_count']} rows)"]
            lines.append(f"Columns ({len(ds['columns'])}): {', '.join(ds['columns'][:40])}")
            lines.append("Column Types:")
            for col, dtype in list(ds['dtypes'].items())[:30]:
                lines.append(f"  - {col}: {dtype}")
            if ds.get('stats'):
                lines.append("Summary Stats (numeric columns):")
                for col, stat in list(ds['stats'].items())[:10]:
                    lines.append(f"  - {col}: mean={stat.get('mean','?')}, std={stat.get('std','?')}, min={stat.get('min','?')}, max={stat.get('max','?')}")
            if ds.get('sample'):
                lines.append(f"Sample Values (first 3 rows):")
                for row in ds['sample'][:3]:
                    short_row = {k: v for k, v in list(row.items())[:8]}
                    lines.append(f"  {short_row}")
            dataset_summaries.append("\n".join(lines))

        full_summary = "\n\n".join(dataset_summaries)

        # Build statistical comparison (always available, even without LLM)
        stat_comparison = self._statistical_comparison(datasets)

        # If LLM is available, enhance with reasoning
        llm_reasoning = None
        if self.is_available:
            prompt = f"""You are Lumina AI, an expert data analyst. You are comparing {len(datasets)} datasets to find patterns, correlations, and insights.

{full_summary}

Analyze these datasets and provide a structured JSON response with these exact keys:
{{
  "shared_columns": ["list of column names that appear in multiple datasets"],
  "suggested_join_keys": ["columns that could be used to join/merge these datasets"],
  "merge_strategy": "recommended merge type: inner/left/outer/union and why",
  "correlations": ["list of notable cross-dataset correlations or patterns"],
  "differences": ["list of key differences between datasets"],
  "data_quality_comparison": "which dataset has better quality and why",
  "actionable_insights": ["list of 3-5 specific actionable insights from comparing these datasets"],
  "recommended_charts": [
    {{"title": "chart title", "type": "chart type", "x_col": "x column", "y_col": "y column", "description": "why this chart is useful"}}
  ]
}}

Be specific - reference actual column names and values. Return ONLY valid JSON, no markdown fences."""

            try:
                import asyncio
                payload = {
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You are a data analysis expert. Return only valid JSON. No markdown fences."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.4,
                    "max_tokens": 4096,
                    "stream": False,
                }
                headers = {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "authorization": f"Bearer {self.api_key}",
                }
                resp = await asyncio.to_thread(
                    requests.post, self.url, json=payload, headers=headers, timeout=60
                )
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    # Strip markdown code fences if present
                    content = content.strip()
                    if content.startswith("```json"):
                        content = content[len("```json"):].strip()
                    elif content.startswith("```"):
                        content = content[len("```"):].strip()
                    if content.endswith("```"):
                        content = content[:-len("```")].strip()
                    import json as json_mod
                    llm_reasoning = json_mod.loads(content)
                else:
                    logger.warning(f"LLM comparison failed with status {resp.status_code}")
            except Exception as e:
                logger.warning(f"LLM comparison error: {e}")

        return {
            "dataset_count": len(datasets),
            "datasets": [{"name": ds["name"], "row_count": ds["row_count"], "columns": ds["columns"][:30]} for ds in datasets],
            "statistical_comparison": stat_comparison,
            "llm_reasoning": llm_reasoning,
        }

    def _statistical_comparison(self, datasets: list[dict]) -> dict:
        """Pure statistical cross-dataset comparison (no LLM needed)."""
        # Find shared columns
        all_col_sets = [set(ds["columns"]) for ds in datasets]
        shared = set.intersection(*all_col_sets) if all_col_sets else set()
        
        # Find unique columns per dataset
        unique_per_ds = []
        for i, ds in enumerate(datasets):
            others = set.union(*(s for j, s in enumerate(all_col_sets) if j != i)) if len(all_col_sets) > 1 else set()
            unique_per_ds.append({
                "dataset": ds["name"],
                "unique_columns": list(set(ds["columns"]) - others)[:15],
            })

        # Compare numeric stats for shared columns
        shared_stats = {}
        for col in list(shared)[:10]:
            col_stats = {}
            for ds in datasets:
                if ds.get("stats") and col in ds["stats"]:
                    col_stats[ds["name"]] = ds["stats"][col]
            if len(col_stats) > 1:
                shared_stats[col] = col_stats

        return {
            "shared_columns": list(shared)[:20],
            "shared_column_count": len(shared),
            "unique_columns_per_dataset": unique_per_ds,
            "shared_column_stats": shared_stats,
        }

    async def generate_dataset_insights(
        self, analysis: dict, df_head: str, row_count: int, col_count: int
    ) -> list[dict]:
        """Use LLM to generate top 5 ranked insights for a single dataset based on stats."""
        if not self.is_available:
            return []
            
        import json
        
        # ── Build COMPACT summary (not the raw dump!) ─────────────
        compact = []
        compact.append(f"Dataset: {row_count} rows × {col_count} cols")
        
        # Column names + types (1 line)
        profile = analysis.get("profile", {})
        col_profiles = profile.get("column_profiles", [])
        if col_profiles:
            col_info = ", ".join(f"{cp.get('name','')}({cp.get('dtype_family',{}).get('value','') if isinstance(cp.get('dtype_family'), dict) else cp.get('dtype_family','')})" for cp in col_profiles[:15])
            compact.append(f"Columns: {col_info}")
        
        # Key numeric stats (compact)
        num_stats = []
        for cp in col_profiles:
            dtype = cp.get('dtype_family', '')
            if isinstance(dtype, dict):
                dtype = dtype.get('value', '')
            if dtype == 'numeric' and cp.get('mean') is not None:
                num_stats.append(f"{cp['name']}: mean={cp.get('mean',''):.2f}, std={cp.get('std',''):.2f}, min={cp.get('min_val','')}, max={cp.get('max_val','')}")
        if num_stats:
            compact.append("Numeric stats:\n" + "\n".join(num_stats[:6]))
        
        # Category value counts (compact)
        cat_stats = []
        for cp in col_profiles:
            dtype = cp.get('dtype_family', '')
            if isinstance(dtype, dict):
                dtype = dtype.get('value', '')
            if dtype == 'categorical' and cp.get('top_values'):
                top = cp['top_values'][:3]
                cat_stats.append(f"{cp['name']}: {top}")
        if cat_stats:
            compact.append("Categories:\n" + "\n".join(cat_stats[:4]))
        
        # Quality score
        quality = analysis.get("quality", {})
        if quality.get("overall_score"):
            compact.append(f"Quality: {quality['overall_score']}/100, {quality.get('total_issues', 0)} issues")
        
        stats_summary = "\n".join(compact)
        
        # Trim df_head to 5 lines max  
        head_lines = df_head.strip().split("\n")[:4]
        df_head_compact = "\n".join(head_lines)
        
        prompt = f"""Dataset ({row_count} rows, {col_count} cols). Sample:
{df_head_compact}

Stats:
{stats_summary}

Give exactly 5 business insights as a JSON array. Each object has keys:
- "insight_class": e.g. "Anomaly", "Risk", "Trend", "Correlation", "Top Performer"
- "title": specific title
- "description": 1-2 sentences with numbers
- "impact": "High"/"Medium"/"Low"
- "roi_estimate": estimated value
- "action": recommendation

Return ONLY valid JSON array. No markdown, no explanation."""

        try:
            import requests as req_lib
            import asyncio
            import time
            
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "You are a data analysis expert. Return only valid JSON. No markdown fences, no explanation."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.4,
                "max_tokens": 2048,
                "stream": False,
            }
            headers = {
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": f"Bearer {self.api_key}",
            }
            
            # Retry with exponential backoff (3 attempts)
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    timeout_sec = 180 + (attempt * 60)  # 180s, 240s, 300s
                    logger.info(f"LLM insight attempt {attempt + 1}/{max_retries} (timeout={timeout_sec}s)")
                    
                    response = await asyncio.to_thread(
                        req_lib.post, self.url, json=payload, headers=headers, timeout=timeout_sec
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        content = data.get("choices", [])[0].get("message", {}).get("content", "")
                        
                        if not content:
                            logger.warning("AI model returned empty content for insights.")
                            break

                        # Strip markdown fences if present
                        content = content.strip()
                        if content.startswith("```json"):
                            content = content[len("```json"):].strip()
                        elif content.startswith("```"):
                            content = content[len("```"):].strip()
                        if content.endswith("```"):
                            content = content[:-len("```")].strip()
                            
                        parsed = json.loads(content)
                        if isinstance(parsed, list):
                            return parsed
                        elif isinstance(parsed, dict) and "insights" in parsed:
                            return parsed["insights"]
                        break  # Valid response but unexpected format
                        
                    elif response.status_code == 429:
                        wait_time = 2 ** (attempt + 1)
                        logger.warning(f"Rate limited, retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                    else:
                        logger.warning(f"LLM returned status {response.status_code}, attempt {attempt + 1}")
                        break
                        
                except (req_lib.exceptions.ReadTimeout, req_lib.exceptions.ConnectionError) as timeout_err:
                    if attempt < max_retries - 1:
                        wait_time = 2 ** (attempt + 1)
                        logger.warning(f"Timeout on attempt {attempt + 1}, retrying in {wait_time}s: {timeout_err}")
                        await asyncio.sleep(wait_time)
                    else:
                        logger.warning(f"All {max_retries} LLM attempts failed. Generating fallback insights.")
                        
        except Exception as e:
            logger.error(f"Failed to generate dataset insights via LLM: {e}")
        
        # ── Fallback: Generate rule-based insights from data stats ────
        logger.info("Generating fallback rule-based insights from data statistics")
        fallback_insights = []
        try:
            profile_data = analysis.get("profile", {})
            col_profiles = profile_data.get("column_profiles", [])
            quality_data = analysis.get("quality", {})
            
            # Insight 1: Data completeness
            null_cols = [cp for cp in col_profiles if cp.get("null_pct", 0) > 5]
            if null_cols:
                worst = max(null_cols, key=lambda x: x.get("null_pct", 0))
                fallback_insights.append({
                    "insight_class": "Data Quality",
                    "title": f"Missing Data Alert: {worst.get('name', 'Unknown')} ({worst.get('null_pct', 0):.1f}% null)",
                    "description": f"{len(null_cols)} columns have >5% missing values. Column '{worst.get('name')}' has the highest rate at {worst.get('null_pct', 0):.1f}%.",
                    "impact": "High" if worst.get("null_pct", 0) > 20 else "Medium",
                    "roi_estimate": "Improved model accuracy by 5-15% after imputation",
                    "action": "Apply appropriate imputation strategy (median for numeric, mode for categorical) or investigate data collection pipeline."
                })
            
            # Insight 2: High cardinality columns
            id_cols = [cp for cp in col_profiles if cp.get("looks_like_id", False)]
            if id_cols:
                fallback_insights.append({
                    "insight_class": "Data Structure",
                    "title": f"Found {len(id_cols)} Identifier Column(s)",
                    "description": f"Columns {', '.join(c.get('name', '') for c in id_cols[:3])} appear to be unique identifiers. These should be excluded from statistical analysis.",
                    "impact": "Low",
                    "roi_estimate": "Cleaner analysis, avoid garbage correlations",
                    "action": "Remove ID columns before running ML models or correlation analysis."
                })
            
            # Insight 3: Numeric distribution skew
            skewed = [cp for cp in col_profiles if cp.get("dtype_family") == "numeric" and abs(cp.get("skewness", 0)) > 2]
            if skewed:
                s = skewed[0]
                fallback_insights.append({
                    "insight_class": "Distribution",
                    "title": f"Highly Skewed: {s.get('name', '')} (skew={s.get('skewness', 0):.2f})",
                    "description": f"{len(skewed)} numeric columns have extreme skewness (|skew| > 2). Consider log or Box-Cox transformation.",
                    "impact": "Medium",
                    "roi_estimate": "Better model performance after normalization",
                    "action": "Apply log transformation or Box-Cox before training predictive models."
                })
            
            # Insight 4: Overall quality
            overall_score = quality_data.get("overall_score", 0)
            if overall_score:
                fallback_insights.append({
                    "insight_class": "Quality Score",
                    "title": f"Data Quality Score: {overall_score}/100",
                    "description": f"Dataset received a quality score of {overall_score}. {quality_data.get('total_issues', 0)} issues found across {len(col_profiles)} columns.",
                    "impact": "High" if overall_score < 60 else "Medium" if overall_score < 80 else "Low",
                    "roi_estimate": "Clean data drives 20-30% better decision-making",
                    "action": "Review critical issues first, then apply the auto-cleaning script."
                })
            
            # Insight 5: Dataset size
            fallback_insights.append({
                "insight_class": "Scale",
                "title": f"Dataset: {row_count:,} Records × {col_count} Features",
                "description": f"With {row_count:,} records, this dataset is {'well-suited for ML' if row_count > 1000 else 'small — consider data augmentation'}. {col_count} features available for analysis.",
                "impact": "Low",
                "roi_estimate": "Baseline understanding of dataset scope",
                "action": "Proceed with exploratory analysis, then select appropriate ML algorithms based on data size."
            })
            
        except Exception as fallback_err:
            logger.warning(f"Fallback insight generation also failed: {fallback_err}")
            
        return fallback_insights[:5]



# Global instance
ai_service = AIService()
