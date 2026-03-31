"""
Lumina AI v4.0 — API Router
All REST endpoints for the analytics platform.
"""

from __future__ import annotations

import io
import os
import shutil
import uuid
import pickle
import json
import time
import gc
from datetime import datetime, timedelta
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd
    import numpy as np
    import duckdb
    import chardet
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from loguru import logger

from models import (
    ChatRequest,
    DashboardRole,
    FullAnalysisResult,
    PrescriptiveInsights,
    SessionInfo,
    SimulationRequest,
    SimulationResult,
    SimulationArchitectResponse,
    UploadResponse,
    DataHealthReport,
    CleaningAction,
    DataHealthIssue,
    PivotResult,
    ExecutiveSummary,
    ReportExportRequest,
    AnomalyReport,
    DataDriftReport,
    ForecastHorizon,
    PivotRequest
)
from services.ai_service import ai_service
from services.cache_service import cache_service

router = APIRouter(prefix="/api", tags=["api"])

# Lazy service getters
_services: dict[str, Any] = {}

def get_profiler():
    if "profiler" not in _services:
        from services.data_profiler import DataProfiler
        _services["profiler"] = DataProfiler()
    return _services["profiler"]

def get_auditor():
    if "auditor" not in _services:
        from services.quality_auditor import DataQualityAuditor
        _services["auditor"] = DataQualityAuditor()
    return _services["auditor"]

def get_enricher():
    if "enricher" not in _services:
        from services.enrichment_engine import DataEnrichmentEngine
        _services["enricher"] = DataEnrichmentEngine()
    return _services["enricher"]

def get_ml_pipeline():
    if "ml_pipeline" not in _services:
        from services.ml_pipeline import MLPipeline
        _services["ml_pipeline"] = MLPipeline()
    return _services["ml_pipeline"]

def get_narrator():
    if "narrator" not in _services:
        from services.insight_narrator import InsightNarrator
        _services["narrator"] = InsightNarrator()
    return _services["narrator"]

def get_chart_factory():
    if "chart_factory" not in _services:
        from services.chart_factory import ChartFactory
        _services["chart_factory"] = ChartFactory()
    return _services["chart_factory"]

def get_export_service():
    if "export_service" not in _services:
        from services.export_service import ExportService
        _services["export_service"] = ExportService()
    return _services["export_service"]

def get_recommendation_engine():
    if "recommendation_engine" not in _services:
        from services.recommendation_engine import RecommendationEngine
        _services["recommendation_engine"] = RecommendationEngine()
    return _services["recommendation_engine"]

def get_hypothesis_tester():
    if "hypothesis_tester" not in _services:
        from services.hypothesis_tester import HypothesisTester
        _services["hypothesis_tester"] = HypothesisTester()
    return _services["hypothesis_tester"]

def get_forecaster():
    if "forecaster" not in _services:
        from services.forecasting_service import ForecastingService
        _services["forecaster"] = ForecastingService()
    return _services["forecaster"]

def get_pivoter():
    if "pivoter" not in _services:
        from services.pivot_service import PivotService
        _services["pivoter"] = PivotService()
    return _services["pivoter"]

def get_cleaning_service():
    if "cleaning_service" not in _services:
        from services.data_cleaning_service import DataCleaningService
        _services["cleaning_service"] = DataCleaningService()
    return _services["cleaning_service"]

def get_simulation_engine():
    if "simulation" not in _services:
        from services.simulation_engine import SimulationEngine
        _services["simulation"] = SimulationEngine()
    return _services["simulation"]

def get_executive_reporter():
    if "executive_reporter" not in _services:
        from services.executive_report_service import ExecutiveReportService
        _services["executive_reporter"] = ExecutiveReportService()
    return _services["executive_reporter"]

def get_anomaly_service():
    if "anomaly_service" not in _services:
        from services.anomaly_detection_service import AnomalyDetectionService
        _services["anomaly_service"] = AnomalyDetectionService(ai_service=ai_service)
    return _services["anomaly_service"]

# In-memory session store (metadata storage)
sessions: dict[str, dict[str, Any]] = {}
SESSIONS_FILE = os.path.join(os.getenv("UPLOAD_DIR", "./uploads"), "sessions.json")

def log_lineage(sid: str, action: str, details: str, code: str | None = None):
    """Log a transformation to the session's lineage manifest."""
    if sid not in sessions:
        return
    
    entry = {
        "timestamp": datetime.now().isoformat(),
        "action": action,
        "details": details,
        "code": code
    }
    
    if "lineage" not in sessions[sid]:
        sessions[sid]["lineage"] = []
    
    sessions[sid]["lineage"].insert(0, entry) # Most recent first
    save_sessions_metadata()


def save_sessions_metadata():
    """Persist session metadata to disk."""
    try:
        # We don't want to save the 'df' or 'analysis' objects directly in JSON
        serializable_sessions = {}
        for sid, data in sessions.items():
            clean_data = data.copy()
            clean_data["df"] = None
            clean_data["analysis"] = None
            clean_data["enriched_df"] = None
            serializable_sessions[sid] = clean_data
            
        with open(SESSIONS_FILE, "w") as f:
            json.dump(serializable_sessions, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save sessions metadata: {e}")

def load_sessions_metadata():
    """Load session metadata from disk on startup."""
    global sessions
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r") as f:
                loaded = json.load(f)
                sessions.update(loaded)
            logger.info(f"✅ Loaded {len(sessions)} sessions from persistence")
        except Exception as e:
            logger.error(f"Failed to load sessions metadata: {e}")

async def prune_stale_sessions(max_age_hours: int = 24):
    """Remove sessions and files older than max_age_hours."""
    now = datetime.now()
    to_delete = []
    
    for sid, data in sessions.items():
        try:
            created_at = datetime.fromisoformat(data["created_at"])
            if now - created_at > timedelta(hours=max_age_hours):
                to_delete.append(sid)
        except Exception:
            # If date parsing fails, mark for deletion anyway if it's potentially corrupt
            to_delete.append(sid)
            
    for sid in to_delete:
        logger.info(f"🧹 Pruning stale session: {sid}")
        data = sessions.pop(sid, {})
        
        # Delete raw file
        filepath = data.get("filepath")
        if filepath and os.path.exists(filepath):
            try: os.remove(filepath)
            except: pass
            
        # Delete pickle
        pickle_path = os.path.join(UPLOAD_DIR, f"{sid}.pkl")
        if os.path.exists(pickle_path):
            try: os.remove(pickle_path)
            except: pass
            
        # Proactively flush from Redis/DiskCache
        try:
            await cache_service.clear_session(sid)
        except Exception as e:
            logger.warning(f"Failed to clear cache for pruned session {sid}: {e}")
    
    if to_delete:
        save_sessions_metadata()

def clean_numpy(obj: Any) -> Any:
    """Recursively convert numpy types to native Python types for JSON serialization."""
    import numpy as np
    import math
    
    if isinstance(obj, dict):
        return {k: clean_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_numpy(v) for v in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, (np.floating, float)):
        val = float(obj)
        return None if math.isnan(val) else val
    elif isinstance(obj, np.ndarray):
        return clean_numpy(obj.tolist())
    else:
        return obj

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_session(sid: str) -> dict:
    if sid not in sessions:
        raise HTTPException(status_code=404, detail=f"Session '{sid}' not found")
    return sessions[sid]


async def _store_df_to_cache(sid: str, df: 'pd.DataFrame', tag: str = "df"):
    """Pickle and store DataFrame in cache service."""
    import pandas as pd
    try:
        buffer = io.BytesIO()
        pickle.dump(df, buffer)
        await cache_service.set(f"{sid}:{tag}", buffer.getvalue(), ttl=7200)
    except Exception as e:
        logger.error(f"Failed to store DF to cache for {sid}:{tag}: {e}")

async def _load_df_from_cache(sid: str, tag: str = "df") -> 'pd.DataFrame' | None:
    """Retrieve and unpickle DataFrame from cache service."""
    import pandas as pd
    try:
        data = await cache_service.get(f"{sid}:{tag}")
        if data:
            return pickle.loads(data)
    except Exception as e:
        logger.error(f"Failed to load DF from cache for {sid}:{tag}: {e}")
    return None

async def get_df(sid: str, sample: bool = False, max_rows: int = 50000) -> 'pd.DataFrame':
    """Load DataFrame with priority: Memory -> Cache -> Disk -> Raw."""
    import pandas as pd
    session = get_session(sid)
    
    # Priority 1: Check cache (Redis/DiskCache)
    tag = "df"
    df = await _load_df_from_cache(sid, tag)
    if df is not None:
        if sample and len(df) > max_rows:
            return df.sample(n=max_rows, random_state=42)
        return df

    # Priority 2: Load from mutated state (pickle)
    pickle_path = os.path.join(os.getenv("UPLOAD_DIR", "./uploads"), f"{sid}.pkl")
    if os.path.exists(pickle_path):
        try:
            with open(pickle_path, "rb") as f:
                df = pickle.load(f)
            # Store back to cache for faster next access
            await _store_df_to_cache(sid, df, tag)
            if sample and len(df) > max_rows:
                return df.sample(n=max_rows, random_state=42)
            return df
        except Exception as e:
            logger.error(f"Error loading pickle for {sid}: {e}")

    # Priority 3: Load from raw source file
    filepath = session.get("filepath")
    if filepath and os.path.exists(filepath):
        from .api import parse_file # Prevent circular import if needed or use global
        try:
            nrows = max_rows if sample else None
            df = parse_file(filepath, session["filename"], nrows=nrows)
            if not sample: # Cache full DF only
                await _store_df_to_cache(sid, df, tag)
            return df
        except Exception as e:
            logger.error(f"Error parsing raw file for {sid}: {e}")
            raise HTTPException(500, f"Could not parse data file: {str(e)}")
    
    raise HTTPException(404, "Data for this session is no longer available on disk or cache")


async def save_df(sid: str, df: 'pd.DataFrame'):
    """Save DataFrame to disk and cache, then clear from memory."""
    import pandas as pd
    # 1. Save to Disk
    pickle_path = os.path.join(os.getenv("UPLOAD_DIR", "./uploads"), f"{sid}.pkl")
    with open(pickle_path, "wb") as f:
        pickle.dump(df, f)
    
    # 2. Save to Cache
    await _store_df_to_cache(sid, df, "df")
    
    if sid in sessions:
        # Clear all heavy references in metadata
        sessions[sid]["df"] = None 
        sessions[sid]["enriched_df"] = None
        sessions[sid]["row_count"] = len(df)
        sessions[sid]["memory_usage_mb"] = round(df.memory_usage(deep=True).sum() / 1e6, 2)
        save_sessions_metadata()
    
    # 3. Aggressive GC
    gc.collect()


async def execute_chunked_mutation(sid: str, code: str) -> dict:
    """
    Execute AI-generated pandas code on a dataset in chunks to maintain O(1) memory.
    Supports CSV/TSV natively.
    """
    session = get_session(sid)
    filename = session["filename"]
    filepath = session["filepath"]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"

    if ext not in ("csv", "tsv", "txt"):
        # For non-text formats, we currently load the full DF 
        # (This can be extended to chunked excel/parquet later)
        import pandas as pd
        import numpy as np
        df = await get_df(sid)
        local_vars = {"df": df, "pd": pd, "np": np}
        exec(code, {"pd": pd, "np": np}, local_vars)
        new_df = local_vars["df"]
        await save_df(sid, new_df)
        return {"rows_before": len(df), "rows_after": len(new_df)}

    # Chunked Processing for Text Formats
    temp_path = filepath + ".tmp"
    chunk_size = 50000
    rows_before = session.get("row_count", 0)
    rows_after: int = 0
    header = True
    sep = "," if ext == "csv" else "\t"

    try:
        # Detect encoding
        with open(filepath, "rb") as f:
            encoding = chardet.detect(f.read(20000))["encoding"] or "utf-8"

        # Process in chunks
        import pandas as pd
        import numpy as np
        import chardet
        for chunk in pd.read_csv(filepath, sep=sep, chunksize=chunk_size, encoding=encoding, on_bad_lines="skip", low_memory=True):
            # Execute mutation on chunk
            local_vars = {"df": chunk, "pd": pd, "np": np}
            try:
                exec(code, {"pd": pd, "np": np}, local_vars)
                transformed_chunk = local_vars["df"]
            except Exception as e:
                logger.error(f"Chunk transformation error: {e}")
                transformed_chunk = chunk # Fallback to original if this specific chunk fails

            if isinstance(transformed_chunk, pd.DataFrame):
                # Write chunk to temp file
                transformed_chunk.to_csv(temp_path, mode='a', index=False, header=header, sep=sep, encoding=encoding)
                rows_after += len(transformed_chunk)
                header = False # Only write header for first chunk

        # Log lineage
        log_lineage(sid, "Pandas Transformation", f"Transformed {rows_after} rows using chunked execution.", code)

        # Atomic Swap
        if os.path.exists(temp_path):
            os.replace(temp_path, filepath)
        
        # Invalidate metadata & pickles
        pickle_path = os.path.join(UPLOAD_DIR, f"{sid}.pkl")
        if os.path.exists(pickle_path):
            os.remove(pickle_path)
        
        # Update session metadata
        session["row_count"] = rows_after
        session["memory_usage_mb"] = round(os.path.getsize(filepath) / 1e6, 2)
        session["df"] = None # Force reload
        session["analysis"] = None # Trigger re-analysis
        session["enriched_df"] = None
        save_sessions_metadata()

        return {"rows_before": rows_before, "rows_after": rows_after}

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise e


# ── Health ───────────────────────────────────────────────────────────────────

@router.get("/data/{session_id}/health", response_model=DataHealthReport)
async def get_data_health(session_id: str):
    """Get the comprehensive data health report for a session."""
    df: pd.DataFrame = await get_df(session_id)
    return await get_cleaning_service().analyze_health(df, session_id)

@router.post("/data/{session_id}/engineer")
async def engineer_feature(session_id: str, goal: str):
    """Agentic feature engineering based on a user goal."""
    df = await get_df(session_id)
    new_df = await get_cleaning_service().agentic_feature_engineering(df, goal)
    await save_df(session_id, new_df)
    return {"success": True, "columns": new_df.columns.tolist()}


# ── Upload ───────────────────────────────────────────────────────────────────

async def execute_sql_from_chat(sid: str, message: str) -> dict | None:
    """Try to answer a chat question using NL2SQL."""
    session = get_session(sid)
    df = await get_df(sid, sample=True, max_rows=5) # Get columns/types
    
    # Generate SQL
    sql = await ai_service.generate_sql_query(
        message, 
        df.columns.tolist(), 
        dtypes={col: str(dtype) for col, dtype in df.dtypes.items()}
    )
    
    if sql and not sql.startswith("ERROR"):
        try:
            import duckdb
            filepath = session["filepath"]
            # Use DuckDB to query the CSV file directly
            ext = session["filename"].rsplit(".", 1)[-1].lower()
            if ext == "parquet":
                query = sql.replace("data", f"read_parquet('{filepath}')")
            else:
                query = sql.replace("data", f"read_csv_auto('{filepath}')")
            
            res_df = duckdb.query(query).df()
            
            # Format results for chat
            if res_df.empty:
                return {"type": "token", "content": "\n*(The query returned no results.)*\n", "sql": sql}
            
            # Cap results for chat
            preview_df = res_df.head(10)
            try:
                preview = preview_df.to_markdown(index=False)
            except Exception:
                preview = preview_df.to_string(index=False)
                
            summary = f"\n**📊 Logic Found (SQL):**\n```sql\n{sql}\n```\n**Results:**\n{preview}\n"
            if len(res_df) > 10:
                summary += f"\n*(Showing top 10 of {len(res_df)} rows)*"
            
            return {"type": "token", "content": summary, "sql": sql}
        except Exception as e:
            logger.error(f"NL2SQL Execution failed: {e}")
            return {"type": "token", "content": f"\n*(SQL Execution Error: {str(e)})*\n", "sql": sql}
    
    return None


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload a data file and create a session."""
    filename = file.filename or "unknown.csv"
    logger.info(f"Uploading file: {filename}")

    # Create session
    session_id = str(uuid.uuid4())[:8]
    filepath = os.path.join(UPLOAD_DIR, f"{session_id}_{filename}")

    # Proactively prune old sessions to clear Redis/Disk space
    await prune_stale_sessions(max_age_hours=24)

    # Stream to disk directly (O(1) Memory)
    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream file to disk: {str(e)}")

    # Parse metadata (Smart Chunking)
    try:
        df_preview = parse_file(filepath, filename, nrows=100)
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    # Calculate full metadata without full load
    stats = get_df_metadata(filepath, filename)

    # Store metadata
    sessions[session_id] = {
        "session_id": session_id,
        "filename": filename,
        "filepath": filepath,
        "row_count": stats["row_count"],
        "column_count": stats["column_count"],
        "memory_usage_mb": stats["memory_usage_mb"],
        "created_at": datetime.now().isoformat(),
        "analysis": None,
        "enriched_df": None,
        "df": None
    }
    save_sessions_metadata()

    # Note: We don't save_df(session_id, df) here because we want to keep it on disk as the raw file.
    # Lazy loading in get_df will handle reading it when needed.

    # Preview
    preview = df_preview.head(5).fillna("").to_dict(orient="records")
    clean_preview = clean_numpy(preview)

    return UploadResponse(
        session_id=session_id,
        filename=filename,
        row_count=stats["row_count"],
        column_count=stats["column_count"],
        columns=df_preview.columns.tolist() if hasattr(df_preview, 'columns') else [],
        dtypes={col: str(dtype) for col, dtype in df_preview.dtypes.items()} if hasattr(df_preview, 'dtypes') else {},
        memory_usage_mb=sessions[session_id]["memory_usage_mb"],
        preview=clean_preview
    )


@router.post("/upload/batch")
async def upload_batch(files: list[UploadFile] = File(...)):
    """Upload multiple files at once."""
    results = []
    for f in files:
        result = await upload_file(f)
        results.append(result)
    return {"sessions": [r.model_dump() for r in results], "count": len(results)}


@router.get("/download/{sid}/csv")
async def download_csv(sid: str, enriched: bool = True):
    """Download the (optionally enriched) DataFrame as CSV."""
    session = get_session(sid)
    
    async def generate():
        # Load in chunks to stay memory efficient
        filepath = session.get("filepath")
        if not filepath or not os.path.exists(filepath):
             # Fallback to cache/enriched cache
             df = await _load_df_from_cache(sid, "enriched_df") if enriched else None
             if df is None:
                 df = await get_df(sid)
             yield df.to_csv(index=False)
             return

        # If it's a CSV, stream it. If it's something else, use pandas chunking
        ext = session["filename"].rsplit(".", 1)[-1].lower()
        if ext == "csv" and not enriched:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    yield line
        else:
            # For Excel/Parquet or enriched data, read/stream via pandas
            df = await _load_df_from_cache(sid, "enriched_df") if enriched else await get_df(sid)
            # Chunking the output
            chunk_size = 1000
            for i in range(0, len(df), chunk_size):
                yield df.iloc[i:i+chunk_size].to_csv(index=False, header=(i==0))

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="lumina_{sid}_data.csv"'},
    )


def parse_file(path: str, filename: str, nrows: int | None = None) -> 'pd.DataFrame':
    """Parse file from disk path into DataFrame."""
    import pandas as pd
    import chardet
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"

    if ext in ("csv", "tsv", "txt"):
        # Detect encoding from the start of the file
        try:
            with open(path, "rb") as f:
                encoding = chardet.detect(f.read(20000))["encoding"] or "utf-8"
        except Exception:
            encoding = "utf-8"

        # For CSV/TSV, we use chunked detection
        try:
            df = pd.read_csv(
                path,
                sep="," if ext == "csv" else "\t",
                nrows=nrows,
                encoding=encoding,
                on_bad_lines="skip",
                low_memory=True
            )
        except Exception:
            df = pd.read_csv(path, nrows=nrows, on_bad_lines="skip", encoding="latin-1")

    elif ext in ("xlsx", "xls"):
        df = pd.read_excel(path, nrows=nrows)

    elif ext == "parquet":
        # Parquet is naturally chunked, but pd.read_parquet doesn't support nrows directly.
        # We can use pyarrow to read first N rows if needed.
        df = pd.read_parquet(path)
        if nrows:
            df = df.head(nrows)

    elif ext == "json":
        df = pd.read_json(path)
        if nrows:
            df = df.head(nrows)

    else:
        raise ValueError(f"Unsupported file format: .{ext}")

    if df.empty and (not nrows or nrows > 0):
        # Only error if we actually expected rows
        raise ValueError("File is empty or could not be parsed")

    # Auto-detect and convert date columns
    for col in df.select_dtypes(include=["object"]).columns:
        try:
            sample = df[col].dropna().head(20)
            parsed = pd.to_datetime(sample, format="mixed", dayfirst=False, errors="coerce")
            if parsed.notna().sum() > 15:
                df[col] = pd.to_datetime(df[col], format="mixed", dayfirst=False, errors="coerce")
        except Exception:
            pass

    return df


def get_df_metadata(path: str, filename: str) -> dict:
    """Get metadata (rows, cols, memory) from file on disk without full load."""
    import pandas as pd
    import chardet
    import os
    
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"
    
    row_count = 0
    col_count = 0
    mem_mb = 0.0

    if ext in ("csv", "tsv", "txt"):
        # Use simple line counting for speed (O(N) with low memory)
        try:
            # Detect encoding for headers
            with open(path, "rb") as f:
                encoding = chardet.detect(f.read(5000))["encoding"] or "utf-8"

            with open(path, "rb") as f:
                row_count = sum(1 for _ in f) - 1 # Skip header
            
            # Get columns from first line
            sep = "," if ext == "csv" else "\t"
            with open(path, "r", encoding=encoding, errors="ignore") as f:
                first_line = f.readline()
                col_count = len(first_line.split(sep))
            
            mem_mb = round(os.path.getsize(path) / 1e6, 2)
        except Exception:
             # Fallback to pandas if counting fails
             df = parse_file(path, filename, nrows=1)
             col_count = len(df.columns)
             row_count = 0 # unknown

    else:
        # For non-text formats, we might have to load at least part of it
        df = parse_file(path, filename)
        row_count = len(df)
        col_count = len(df.columns)
        mem_mb = round(df.memory_usage(deep=True).sum() / 1e6, 2)

    return {
        "row_count": max(0, row_count),
        "column_count": col_count,
        "memory_usage_mb": mem_mb
    }


# ── Profile ──────────────────────────────────────────────────────────────────

@router.get("/profile/{sid}")
async def get_profile(sid: str):
    """Get full data profile."""
    import pandas as pd
    df = await get_df(sid, sample=True)
    session = get_session(sid)

    # Check cache
    cached = await cache_service.get(f"{sid}:profile")
    if cached:
        return cached

    profile = await get_profiler().profile_dataset(df)
    result = profile.model_dump()

    await cache_service.set(f"{sid}:profile", result)
    return result


# ── Quality ──────────────────────────────────────────────────────────────────

@router.get("/quality/{sid}")
async def get_quality(sid: str):
    """Get data quality audit report."""
    import pandas as pd
    df = await get_df(sid, sample=True)

    cached = await cache_service.get(f"{sid}:quality")
    if cached:
        return cached

    report = await get_auditor().full_audit(df)
    result = report.model_dump()

    await cache_service.set(f"{sid}:quality", result)
    return result


# ── Enrichment ───────────────────────────────────────────────────────────────

@router.get("/enrich/{sid}")
async def enrich_data(sid: str):
    """Trigger data enrichment pipeline."""
    import pandas as pd
    session = get_session(sid)
    df = (await get_df(sid)).copy()

    enriched_df, result = await get_enricher().enrich(df)
    await _store_df_to_cache(sid, enriched_df, "enriched_df")
    
    del df, enriched_df
    import gc
    gc.collect()

    return result.model_dump()


# ── Full Analysis ────────────────────────────────────────────────────────────

@router.get("/analysis/{sid}")
async def get_full_analysis(sid: str):
    """Run full 5-tier analysis pipeline."""
    session = get_session(sid)
    df = await get_df(sid, sample=True)

    cached = await cache_service.get(f"{sid}:analysis")
    if cached:
        return cached

    logger.info(f"Running full analysis for session {sid}")

    # Tier 1: Profile (Fast)
    profile = await get_profiler().profile_dataset(df)

    # Build initial analysis result
    analysis = FullAnalysisResult(
        session_id=sid,
        filename=session["filename"],
        profile=profile,
        lineage=session.get("lineage", [])
    )

    # Cache immediately (fast response)
    session["analysis"] = analysis
    result = clean_numpy(analysis.model_dump())
    await cache_service.set(f"{sid}:analysis", result, ttl=7200)
    await cache_service.set(f"{sid}:analysis_status", "processing", ttl=7200)

    # Fire heavy analysis tiers (ML, Quality, Hypothesis) as BACKGROUND TASK
    async def _run_heavy_analysis(sid: str, analysis_obj):
        try:
            import pandas as pd
            import numpy as np
            
            logger.info(f"Background heavy analysis started for {sid}")
            session_ref = sessions.get(sid)
            if not session_ref: return

            # LOAD FULL DF FROM CACHE/DISK (Memory-efficient load)
            df_full = await get_df(sid, sample=False)

            # Run quality audit
            quality_report = await get_auditor().full_audit(df_full)
            
            # Run hypothesis tests
            tests = await get_hypothesis_tester().run_all_tests(df_full)
            
            # ML Pipelines (Parallel)
            enriched_df, enrichment = await get_enricher().enrich(df_full.copy())
            await _store_df_to_cache(sid, enriched_df, "enriched_df")

            # Tier 4: ML
            ml_results = await get_ml_pipeline().run_full_pipeline(enriched_df)

            # Update analysis object
            analysis_obj.quality = quality_report
            analysis_obj.hypothesis_tests = tests
            analysis_obj.enrichment = enrichment
            analysis_obj.ml_results = ml_results

            # Tier 5: Prescriptive — generate rule-based insights FAST
            narrator = get_narrator()
            prescriptive = PrescriptiveInsights(
                executive_summary=narrator._executive_summary(analysis_obj, df_full),
                key_metrics=narrator._extract_key_metrics(analysis_obj, df_full),
                ranked_insights=narrator._generate_ranked_insights(analysis_obj, df_full),
                what_if_scenarios=narrator._generate_what_if_scenarios(analysis_obj, df_full),
                analyst_recommendations=narrator._analyst_recommendations(analysis_obj),
                scientist_recommendations=narrator._scientist_recommendations(analysis_obj),
                engineer_recommendations=narrator._engineer_recommendations(analysis_obj),
            )
            analysis_obj.prescriptive = prescriptive

            # Generate charts
            charts = get_chart_factory().generate_all_charts(analysis_obj, enriched_df)
            analysis_obj.charts = charts

            # Cache the fully updated analysis
            updated_result = clean_numpy(analysis_obj.model_dump())
            await cache_service.set(f"{sid}:analysis", updated_result, ttl=7200)
            await cache_service.set(f"{sid}:analysis_status", "complete", ttl=7200)
            
            # Fire RAG Context Indexing
            from services.rag_service import rag_service
            try:
                await rag_service.index_dataset(sid, df_full)
            except Exception as e:
                logger.error(f"RAG Indexing Failed: {e}")
                
            logger.info(f"✅ Background heavy analysis complete for {sid}")
            
            # Explicit GC to reclaim memory from heavy ML objects
            # Capture stats for thread safety before del
            df_full_head = df_full.head(3).to_string()
            df_full_len = len(df_full)
            df_full_cols_len = len(df_full.columns)
            
            del df_full, enriched_df
            gc.collect()

            # Fire LLM insight enrichment as a secondary background task
            from services.ai_service import ai_service
            if ai_service.is_available:
                try:
                    stats_dict = analysis_obj.model_dump()
                    llm_insights = await ai_service.generate_dataset_insights(
                        stats_dict, df_full_head, df_full_len, df_full_cols_len
                    )
                    if llm_insights:
                        from models import RankedInsight
                        ranked = [RankedInsight(
                            insight_class=str(i.get("insight_class", "Observation")),
                            title=str(i.get("title", "Insight")),
                            description=str(i.get("description", "")),
                            impact=str(i.get("impact", "Medium")),
                            roi_estimate=str(i.get("roi_estimate", "N/A")),
                            action=str(i.get("action", ""))
                        ) for i in llm_insights[:10]]
                        
                        # Update cached analysis again
                        if session_ref and session_ref.get("analysis"):
                            session_ref["analysis"].prescriptive.ranked_insights = ranked
                            final_updated = clean_numpy(session_ref["analysis"].model_dump())
                            await cache_service.set(f"{sid}:analysis", final_updated, ttl=7200)
                            await cache_service.set(f"{sid}:llm_insights", {
                                "status": "ready",
                                "insights": [r.model_dump() for r in ranked]
                            }, ttl=7200)
                        logger.info(f"✅ LLM insights enriched for session {sid}")
                except Exception as e:
                    logger.warning(f"Background LLM enrichment failed: {e}")
                    await cache_service.set(f"{sid}:llm_insights", {
                        "status": "failed", "error": str(e)
                    }, ttl=7200)

        except Exception as heavy_e:
            logger.error(f"Error in background heavy analysis for {sid}: {heavy_e}")
            await cache_service.set(f"{sid}:analysis_status", "error", ttl=7200)

    import asyncio
    asyncio.create_task(_run_heavy_analysis(sid, analysis))
    logger.info(f"Async analysis pipeline dispatch complete for {sid}")
    return result

# ── Analysis Polling ─────────────────────────────────────────────────────────

@router.get("/analysis_status/{sid}")
async def get_analysis_status(sid: str):
    """Poll for background heavy analysis completion."""
    status = await cache_service.get(f"{sid}:analysis_status")
    return {"status": status or "unknown"}

# ── LLM Insights Polling ─────────────────────────────────────────────────────

@router.get("/insights/{sid}")
async def get_llm_insights(sid: str):
    """Poll for LLM-enriched insights (non-blocking)."""
    get_session(sid)  # validate session exists
    cached = await cache_service.get(f"{sid}:llm_insights")
    if cached:
        return cached
    return {"status": "pending"}

# ── Recommendations ──────────────────────────────────────────────────────────

@router.get("/recommendations/{sid}")
async def get_recommendations(sid: str):
    """Generate role-specific recommendations and dashboard blueprints."""
    import pandas as pd
    session = get_session(sid)
    df = await get_df(sid)

    cached = await cache_service.get(f"{sid}:recommendations")
    if cached:
        return cached

    # Get analysis if available
    analysis_data = None
    if session.get("analysis"):
        analysis_data = session["analysis"].model_dump()

    result = get_recommendation_engine().generate_all(df, session["filename"], analysis_data)
    await cache_service.set(f"{sid}:recommendations", result, ttl=7200)
    return result


# ── Charts ───────────────────────────────────────────────────────────────────

@router.get("/charts/{sid}")
async def get_charts(sid: str, role: DashboardRole = DashboardRole.ANALYST):
    """Get chart configurations filtered by role."""
    session = get_session(sid)

    if session.get("analysis") is None:
        # Run analysis first
        await get_full_analysis(sid)

    analysis = session["analysis"]
    charts = [
        c.model_dump()
        for c in analysis.charts
        if role in c.role_visibility
    ]

    return {"charts": charts, "role": role.value, "total": len(charts)}


@router.get("/charts/{sid}/{chart_id}")
async def get_single_chart(sid: str, chart_id: str):
    """Get a single chart by ID."""
    session = get_session(sid)

    if session.get("analysis") is None:
        await get_full_analysis(sid)

    analysis = session["analysis"]
    for chart in analysis.charts:
        if chart.chart_id == chart_id:
            return chart.model_dump()

    raise HTTPException(status_code=404, detail=f"Chart '{chart_id}' not found")


# ── ML Endpoints ─────────────────────────────────────────────────────────────

@router.get("/forecast/{sid}")
async def get_forecast(sid: str):
    """Get forecasting results."""
    import pandas as pd
    df = await get_df(sid, sample=True)
    date_cols = [c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])]
    numeric_cols = df.select_dtypes("number").columns.tolist()

    if not date_cols or not numeric_cols:
        raise HTTPException(400, "Need date + numeric columns for forecasting")

    result = await get_ml_pipeline().run_forecasting(df, date_cols[0], numeric_cols[0])
    return result.model_dump()


@router.get("/segments/{sid}")
async def get_segments(sid: str):
    """Get segmentation results."""
    import pandas as pd
    import numpy as np
    df = await get_df(sid, sample=True)
    numeric_cols = df.select_dtypes("number").columns.tolist()

    if len(numeric_cols) < 2:
        raise HTTPException(400, "Need at least 2 numeric columns for segmentation")

    result = await get_ml_pipeline().run_segmentation(df, numeric_cols)
    return clean_numpy(result.model_dump())


@router.get("/anomalies/{sid}")
async def get_anomalies(sid: str):
    """Get anomaly detection results."""
    df = await get_df(sid, sample=True)
    result = await get_ml_pipeline().run_anomaly_detection(df)
    return clean_numpy(result.model_dump())


@router.get("/features/{sid}")
async def get_features(sid: str, target: str = ""):
    """Get feature importance results."""
    df = await get_df(sid, sample=True)
    numeric_cols = df.select_dtypes("number").columns.tolist()

    if not target and numeric_cols:
        target = numeric_cols[0]
    if target not in df.columns:
        raise HTTPException(400, f"Target column '{target}' not found")

    result = await get_ml_pipeline().run_feature_importance(df, target)
    return clean_numpy(result.model_dump())


@router.get("/trends/{sid}")
async def get_trends(sid: str):
    """Get trend analysis results."""
    import pandas as pd
    df = await get_df(sid, sample=True)
    date_cols = [c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])]
    numeric_cols = df.select_dtypes("number").columns.tolist()

    if not date_cols or not numeric_cols:
        raise HTTPException(400, "Need date + numeric columns for trend analysis")

    result = await get_ml_pipeline().run_trend_analysis(df, date_cols[0], numeric_cols[0])
    return clean_numpy(result.model_dump())


# ── Export ───────────────────────────────────────────────────────────────────

async def _ensure_analysis_object(sid: str, session: dict):
    """Ensure session['analysis'] contains a FullAnalysisResult object, reconstructing from cache if needed."""
    if session.get("analysis") is None:
        cached = await get_full_analysis(sid)
        if isinstance(cached, dict):
            from models import FullAnalysisResult
            session["analysis"] = FullAnalysisResult(**cached)

@router.get("/export/{sid}/excel")
async def export_excel(sid: str, advanced: bool = False):
    """Export as Excel workbook."""
    session = get_session(sid)
    df = await get_df(sid)

    await _ensure_analysis_object(sid, session)

    custom_charts = session.get("custom_charts", [])
    import pandas as pd
    content = await get_export_service().export_excel(df, session["analysis"], advanced=advanced, custom_charts=custom_charts)
    filename = f"lumina_advanced_dashboard_{sid}.xlsx" if advanced else f"lumina_{sid}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/export/{sid}/powerbi")
async def export_powerbi(sid: str):
    """Export as PowerBI Data Model (.csv + instructions blueprint for .pbix)."""
    session = get_session(sid)
    df = await get_df(sid)

    await _ensure_analysis_object(sid, session)

    custom_charts = session.get("custom_charts", [])
    import pandas as pd
    content = await get_export_service().export_powerbi(df, session["analysis"], custom_charts=custom_charts)
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=lumina_powerbi_{sid}.zip"},
    )

@router.get("/export/{sid}/html")
async def export_html(sid: str):
    """Export as standalone HTML dashboard."""
    session = get_session(sid)
    await _ensure_analysis_object(sid, session)

    html = await get_export_service().export_html(session["analysis"])
    return HTMLResponse(content=html)


@router.get("/export/{sid}/notebook")
async def export_notebook(sid: str):
    """Export analysis as an executable Jupyter Notebook."""
    session = get_session(sid)
    import pandas as pd
    df = await get_df(sid)
    await _ensure_analysis_object(sid, session)

    notebook = await get_export_service().export_notebook(df, session["analysis"])
    return Response(
        content=notebook.encode(),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=lumina_{sid}.ipynb"},
    )


@router.get("/export/{sid}/pdf")
async def export_pdf(sid: str):
    """Export as printable HTML (use browser Print → PDF)."""
    session = get_session(sid)
    await _ensure_analysis_object(sid, session)
    html = await get_export_service().export_pdf_html(session["analysis"])
    return HTMLResponse(content=html)
@router.post("/compare")
async def compare_datasets(req: CompareRequest):
    """Compare multiple uploaded datasets using LLM reasoning."""
    if len(req.session_ids) < 2:
        raise HTTPException(400, "Need at least 2 session IDs to compare")

    datasets = []
    import pandas as pd
    import numpy as np
    for sid in req.session_ids:
        if sid not in sessions:
            raise HTTPException(404, f"Session '{sid}' not found")
        session = sessions[sid]
        df = await get_df(sid)

        # Build summary for the LLM
        stats = {}
        for col in df.select_dtypes(include=np.number).columns[:15]:
            stats[col] = {
                "mean": round(float(df[col].mean()), 4) if pd.notna(df[col].mean()) else None,
                "std": round(float(df[col].std()), 4) if pd.notna(df[col].std()) else None,
                "min": round(float(df[col].min()), 4) if pd.notna(df[col].min()) else None,
                "max": round(float(df[col].max()), 4) if pd.notna(df[col].max()) else None,
            }

        sample = df.head(3).fillna("").to_dict(orient="records")
        # Ensure sample values are JSON-serializable
        clean_sample = clean_numpy(sample)

        datasets.append({
            "name": session["filename"],
            "columns": df.columns.tolist(),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
            "row_count": len(df),
            "stats": clean_numpy(stats),
            "sample": clean_sample,
        })

    result = await ai_service.compare_datasets(datasets)
    return clean_numpy(result)


# ── Session Management ───────────────────────────────────────────────────────

@router.delete("/session/{sid}")
async def delete_session(sid: str):
    """Cleanup session data."""
    if sid in sessions:
        session = sessions.pop(sid)
        # Delete uploaded file
        filepath = session.get("filepath")
        if filepath and os.path.exists(filepath):
            os.remove(filepath)
        
        # Delete pickle
        pickle_path = os.path.join(UPLOAD_DIR, f"{sid}.pkl")
        if os.path.exists(pickle_path):
            os.remove(pickle_path)

        # Clear cache
        await cache_service.clear_session(sid)
        save_sessions_metadata()
    return {"message": "Cache invalidated", "session_id": sid}

@router.post("/sql/{session_id}")
async def run_sql_query(session_id: str, request: dict):
    """Run a DuckDB SQL query against the session's data file."""
    session = get_session(session_id)
    query = request.get("query")
    if not query:
        raise HTTPException(400, "Query is required")
        
    filepath = session["filepath"]
    if not os.path.exists(filepath):
        raise HTTPException(404, "Data file not found")
        
    try:
        # Create a view from the file path and run the query
        # DuckDB can read CSV/Parquet directly from paths
        # We'll use 'data' as the table name
        
        # Determine format
        fmt = "read_csv_auto"
        if filepath.endswith(".parquet"):
            fmt = "read_parquet"
        
        sql = query.replace("data", f"{fmt}('{filepath}')")
        
        # Execute query
        df_res = duckdb.query(sql).df()
        
        # Limit results for response safety
        if len(df_res) > 500:
            df_res = df_res.head(500)
            
        return {
            "columns": df_res.columns.tolist(),
            "rows": df_res.replace({np.nan: None}).to_dict(orient="records"),
            "count": len(df_res),
            "truncated": len(df_res) >= 500
        }
    except Exception as e:
        logger.error(f"SQL Error: {e}")
        raise HTTPException(500, f"SQL Query failed: {str(e)}")
    raise HTTPException(status_code=404, detail="Session not found")


@router.get("/sessions")
async def list_sessions():
    """List all active sessions."""
    sessions_list = []
    for sid, data in sessions.items():
        sessions_list.append(SessionInfo(
            session_id=sid,
            filename=data["filename"],
            row_count=data.get("row_count", 0),
            column_count=data.get("column_count", 0),
            created_at=data["created_at"],
            analysis_complete=data.get("analysis") is not None,
        ).model_dump())
    return {"sessions": sessions_list}


# ── Health ───────────────────────────────────────────────────────────────────

@router.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    """Health check with cache stats."""
    cache_stats = await cache_service.get_stats()
    return {
        "status": "healthy",
        "version": "4.0",
        "active_sessions": len(sessions),
        "cache": cache_stats,
        "timestamp": datetime.now().isoformat(),
    }

@router.post("/simulation/{session_id}")
async def run_simulation(session_id: str, target: str, request: Optional[SimulationRequest] = None):
    """Run a what-if simulation on a specific target attribute."""
    df = await get_df(session_id)
    sim_engine = get_simulation_engine()
    
    try:
        levers = request.levers if request else None
        multi_targets = request.multi_targets if request else None
        
        if multi_targets:
            # Phase 9: Multi-Objective Path
            result = await sim_engine.run_simulation(df, target) # Baseline sim
            multi_mix = await sim_engine.find_multi_objective_mix(df, multi_targets)
            result.constrained_results.append(multi_mix)
            tradeoffs = await sim_engine.calculate_tradeoffs(multi_mix)
            result.insights.extend(tradeoffs)
        else:
            # Standard simulation
            result = await sim_engine.run_simulation(df, target, custom_levers=levers)
        
        # Store in session
        if session_id in sessions:
            if "analysis" in sessions[session_id] and sessions[session_id]["analysis"]:
                sessions[session_id]["analysis"].simulation = result
            
        return result
    except Exception as e:
        logger.error(f"Simulation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/simulation/{session_id}/architect")
async def simulation_architect(session_id: str, request: ChatRequest):
    """AI configuration for a simulation based on user goals."""
    df = await get_df(session_id)
    columns = df.columns.tolist()
    sample_data = df.head(3).to_dict(orient="records")
    
    prompt = f"""You are the NexusAI Strategic Analyst. 
The user wants to run a simulation but isn't sure which columns to target.
Analyze their goal and available columns.

Columns: {columns}
Sample: {json.dumps(sample_data, default=str)}
User Goal: "{request.message}"

Return JSON (no markdown):
{{
  "targets": {{"ColumnName": weight}},
  "rationale": "Briefly explain why."
}}
Weights: 1=Maximize, -1=Minimize, 0=Stable.
"""
    raw = await ai_service.get_completion(prompt)
    if not raw:
        return SimulationArchitectResponse(targets={}, rationale="AI service unavailable.")
    
    try:
        # Basic cleanup for stray markdown
        if "```" in raw:
            raw = raw.split("```")[-2].strip()
            if raw.startswith("json"): raw = raw[4:].strip()
            
        data = json.loads(raw)
        return SimulationArchitectResponse(**data)
    except Exception as e:
        logger.error(f"Architect Parse Error: {e} | Raw: {raw}")
        return SimulationArchitectResponse(
            targets={}, 
            rationale="I couldn't map your goal to specific columns. Try rephrasing or selecting columns manually."
        )

@router.post("/chat/nexus/{session_id}")
async def nexus_copilot(session_id: str, request: ChatRequest):
    """Structured Agentic Copilot endpoint."""
    df = await get_df(session_id)
    
    context = {
        "filename": sessions[session_id].get("filename", "dataset"),
        "columns": df.columns.tolist(),
        "row_count": len(df),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()}
    }
    
    # Analyze intent and generate actions
    nexus_res = await ai_service.parse_nexus_intent(request.message, context)
    
    return nexus_res

@router.get("/data/{session_id}/forecast")
async def get_forecast(
    session_id: str, 
    target_col: str, 
    date_col: Optional[str] = None, 
    stride: ForecastHorizon = ForecastHorizon.MONTHS,
    horizon: int = 6
):
    """Generate a time-series forecast."""
    df = await get_df(session_id)
    forecaster = get_forecaster()
    
    result = forecaster.generate_forecast(
        df, target_col, date_col, stride, horizon
    )
    result.session_id = session_id
    return result

@router.post("/data/{session_id}/pivot")
async def get_pivot(session_id: str, request: PivotRequest):
    """Generate a pivot table summary."""
    df = await get_df(session_id)
    pivoter = get_pivoter()
    
    try:
        return pivoter.generate_pivot(df, request, session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/analysis/{sid}/summary", response_model=ExecutiveSummary)
async def get_executive_summary_report(sid: str):
    """Generate high-level strategic meta-narrative."""
    # Try to load full analysis from cache
    cached_analysis = await cache_service.get(f"{sid}:analysis")
    if not cached_analysis:
         # Try to load from session
         session = get_session(sid)
         analysis = session.get("analysis")
         if not analysis:
             raise HTTPException(400, "Full analysis must be run before generating summary.")
    else:
         analysis = FullAnalysisResult(**cached_analysis)

    summary = await get_executive_reporter().generate_executive_summary(analysis)
    return summary

@router.post("/export/{sid}/report")
async def export_executive_report(sid: str, request: ReportExportRequest):
    """Generate professional PPTX or PDF report deck."""
    cached_analysis = await cache_service.get(f"{sid}:analysis")
    if not cached_analysis:
        raise HTTPException(400, "Analysis not found. Run analysis first.")
    
    analysis = FullAnalysisResult(**cached_analysis)
    summary = await get_executive_reporter().generate_executive_summary(analysis)
    
    if request.format == "pptx":
        report_bytes = await get_executive_reporter().export_to_pptx(analysis, summary)
        return Response(
            content=report_bytes,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f'attachment; filename="NexusAI_Report_{sid}.pptx"'}
        )
    else:
        # Fallback to PDF-like HTML
        from services.export_service import ExportService
        html = await ExportService().export_pdf_html(analysis)
        return HTMLResponse(content=html)

@router.get("/analysis/{session_id}/anomalies", response_model=AnomalyReport)
async def get_anomalies(session_id: str):
    df = await get_df(session_id, sample=True)
    service = get_anomaly_service()
    return await service.detect_anomalies(df, session_id)

@router.get("/analysis/{session_id}/drift", response_model=DataDriftReport)
async def get_drift(session_id: str, baseline_sid: Optional[str] = None):
    df = await get_df(session_id, sample=True)
    
    if not baseline_sid:
         baseline_df = df.copy()
    else:
        baseline_df = await get_df(baseline_sid, sample=True)
              
    service = get_anomaly_service()
    return await service.check_data_drift(baseline_df, df, session_id)
