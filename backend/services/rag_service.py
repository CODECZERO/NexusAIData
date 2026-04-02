import os
import json
import asyncio
from typing import Any, List, Dict
from loguru import logger

try:
    import redis.asyncio as aioredis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

class RedisRAGService:
    """
    Fast Retrieval-Augmented Generation (RAG) using Upstash Redis.
    Indexes a DataFrame into Redis Hashes/Sets to provide deep semantic context 
    to the LLM beyond just the first 5 rows limit.
    """
    def __init__(self):
        self._redis = None
        self.redis_url = os.getenv("REDIS_URL")

    async def initialize(self):
        if HAS_REDIS and self.redis_url:
            try:
                self._redis = aioredis.from_url(
                    self.redis_url, 
                    decode_responses=True,
                    socket_connect_timeout=1,
                    socket_timeout=1
                )
                await self._redis.ping()
                logger.info("✅ Redis RAG Service connected")
            except Exception as e:
                logger.warning(f"⚠️ Redis RAG connection failed: {e}")
                self._redis = None
                
    @property
    def is_available(self) -> bool:
        return self._redis is not None

    async def index_dataset(self, session_id: str, df: 'pd.DataFrame'):
        """Build a semantic index of the dataset in Redis."""
        import pandas as pd
        if not self.is_available: return
        
        try:
            logger.info(f"Indexing dataset {session_id} into Redis RAG...")
            
            # 1. Index Column Metadata & Unique Values (Context Dictionary)
            schema = {}
            for col in df.columns:
                col_type = str(df[col].dtype)
                schema[col] = {"type": col_type}
                
                # For categorical columns, store top 20 unique values for RAG lookups
                if df[col].dtype == 'object' or df[col].nunique() < 50:
                    top_vals = df[col].value_counts().head(20).to_dict()
                    schema[col]["top_values"] = top_vals
            
            await self._redis.setex(
                f"rag:schema:{session_id}",
                86400, # 24 hr TTL
                json.dumps(schema)
            )

            # 2. Index Anomaly Signatures for rapid troubleshooting context
            if 'Anomaly_Flag' in df.columns:
                anomalies = df[df['Anomaly_Flag'] == True]
                if not anomalies.empty:
                    # Store a representative sample of anomalies for the LLM
                    anomaly_records = anomalies.head(20).to_dict(orient='records')
                    await self._redis.setex(
                        f"rag:anomalies:{session_id}",
                        86400,
                        json.dumps(anomaly_records)
                    )
            
            logger.info(f"✅ Redis RAG Index built for {session_id}")
            
        except Exception as e:
            logger.error(f"Failed to index dataset in Redis RAG: {e}")

    async def retrieve_context(self, session_id: str, query: str) -> str:
        """Retrieve relevant context strings for the LLM based on the user's query."""
        if not self.is_available: 
            return "RAG Context: Unavailable"
            
        context_blocks = []
        
        try:
            query_lower = query.lower()
            
            # Check Schema/Values if asking about specific columns
            schema_json = await self._redis.get(f"rag:schema:{session_id}")
            if schema_json:
                schema = json.loads(schema_json)
                relevant_cols = [col for col in schema.keys() if col.lower() in query_lower]
                
                if relevant_cols:
                    col_ctx = "RAG Data Dictionary Context (Relevant Columns):\n"
                    for c in relevant_cols:
                        c_data = schema[c]
                        col_ctx += f"- Column '{c}' ({c_data['type']})\n"
                        if "top_values" in c_data:
                            vals = ", ".join([f"{k} (count:{v})" for k,v in list(c_data["top_values"].items())[:5]])
                            col_ctx += f"  Top values: {vals}\n"
                    context_blocks.append(col_ctx)

            # Check Anomalies if asking about issues/fixing/anomalies
            if "anomal" in query_lower or "fix" in query_lower or "issue" in query_lower or "reason" in query_lower:
                anomalies_json = await self._redis.get(f"rag:anomalies:{session_id}")
                if anomalies_json:
                    anomalies = json.loads(anomalies_json)
                    anom_ctx = f"RAG Anomaly Context (Sample of {len(anomalies)} actual anomalous rows):\n"
                    for a in anomalies[:5]: # Provide top 5 anomaly examples
                        anom_ctx += str(a) + "\n"
                    context_blocks.append(anom_ctx)
                    
            if not context_blocks:
                return ""
                
            return "\n\n=== REDIS RAG DEEP CONTEXT ===\n" + "\n\n".join(context_blocks) + "\n=============================\n"
            
        except Exception as e:
            logger.error(f"RAG retrieval error: {e}")
            return ""

rag_service = RedisRAGService()
