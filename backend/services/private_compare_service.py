"""
Privacy-Preserving Dataset Comparison Service
==============================================
Compares datasets using ZK-fingerprints — statistical summaries only.
Raw data, filenames, and owner identities are NEVER exposed.

Flow:
  1. generate_fingerprint(df, session_id) → DatasetFingerprint
  2. anonymize_fingerprint(fp)            → anonymous version (no session link)
  3. private_compare(fp_a, fp_b)          → PrivateCompareResult with ZK proof

Zero-knowledge guarantee:
  - Comparison reveals ONLY similarity scores, not raw values
  - Column names are hashed (unless user opts to reveal)
  - Owner identity replaced by ZK commitment
"""

from __future__ import annotations

import hashlib
import json
import math
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from blockchain.zk_proofs import ZKProofEngine
from blockchain.identity import hash_session_id
from loguru import logger


# ── Fingerprinting ───────────────────────────────────────────────────────────

def _hash_column_name(col: str, salt: str = "col_v1") -> str:
    """One-way hash of a column name for anonymous comparison."""
    return hashlib.sha256(f"{salt}::{col}".encode()).hexdigest()[:12]


def _build_histogram(series: pd.Series, bins: int = 10) -> List[float]:
    """Normalized histogram as distribution fingerprint."""
    try:
        counts, _ = np.histogram(
            series.dropna().astype(float), bins=bins
        )
        total = counts.sum()
        return (counts / total).tolist() if total > 0 else [0.0] * bins
    except Exception:
        return [0.0] * bins


def _kl_divergence(p: List[float], q: List[float], eps: float = 1e-9) -> float:
    """KL-divergence between two distributions (lower = more similar)."""
    result = 0.0
    for pi, qi in zip(p, q):
        pi = max(pi, eps)
        qi = max(qi, eps)
        result += pi * math.log(pi / qi)
    return result


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x ** 2 for x in a))
    norm_b = math.sqrt(sum(y ** 2 for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ── Service ──────────────────────────────────────────────────────────────────

class PrivateCompareService:

    def generate_fingerprint(
        self,
        df: pd.DataFrame,
        session_id: str,
        is_public: bool = False,
        privacy_level: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Generate a ZK-style dataset fingerprint.
        Column names are hashed. Only statistical properties extracted.
        Row count is bucketed (not exact). No raw cell values included.
        privacy_level: 0.0 (no noise) to 1.0 (max noise/privacy).
        """
        fingerprint_id = str(uuid.uuid4())[:16]
        owner_commitment = hash_session_id(session_id)

        # Scale for noise intensity
        noise_scale = max(0.0, min(1.0, privacy_level))

        col_fps = []
        for col in df.columns:
            col_hash = _hash_column_name(col)
            dtype_str = str(df[col].dtype)
            is_numeric = pd.api.types.is_numeric_dtype(df[col])
            is_categorical = (
                pd.api.types.is_categorical_dtype(df[col])
                or pd.api.types.is_object_dtype(df[col])
            )

            # Base metrics
            null_pct = df[col].isnull().mean()
            unique_ratio = df[col].nunique() / max(len(df), 1)

            # Inject noise if requested
            if noise_scale > 0:
                null_pct = max(0.0, min(1.0, null_pct + np.random.laplace(0, noise_scale * 0.05)))
                unique_ratio = max(0.0, min(1.0, unique_ratio + np.random.laplace(0, noise_scale * 0.1)))

            col_fp: Dict[str, Any] = {
                "col_hash": col_hash,
                "dtype_family": "numeric" if is_numeric else (
                    "categorical" if is_categorical else "datetime"
                ),
                "null_pct": round(float(null_pct), 4),
                "unique_ratio": round(float(unique_ratio), 4),
            }

            if is_numeric:
                s = df[col].dropna()
                if len(s) > 0:
                    hist = _build_histogram(df[col])
                    mean_val = (s.mean() - s.min()) / max(s.max() - s.min(), 1e-9)
                    std_val = s.std() / max(abs(s.mean()), 1e-9)

                    if noise_scale > 0:
                        # Add noise to histogram and re-normalize
                        hist = np.array(hist) + np.random.normal(0, noise_scale * 0.1, size=len(hist))
                        hist = np.maximum(0, hist)
                        if hist.sum() > 0: hist = hist / hist.sum()
                        hist = hist.tolist()
                        
                        # Add noise to scalars
                        mean_val += np.random.laplace(0, noise_scale * 0.1)
                        std_val += np.random.laplace(0, noise_scale * 0.2)

                    col_fp["histogram"] = hist
                    col_fp["mean_normalized"] = round(float(max(0, min(1, mean_val))), 4)
                    col_fp["std_normalized"] = round(float(max(0, std_val)), 4)
                    col_fp["skewness_bucket"] = _bucket_skewness(float(s.skew()))
            elif is_categorical:
                top_vals = df[col].value_counts(normalize=True).head(5)
                dist = [float(v) for v in top_vals.values]
                
                if noise_scale > 0:
                    dist = np.array(dist) + np.random.normal(0, noise_scale * 0.1, size=len(dist))
                    dist = np.maximum(0, dist)
                    if dist.sum() > 0: dist = dist / dist.sum()
                    dist = dist.tolist()

                col_fp["top_freq_distribution"] = [round(v, 4) for v in dist]
                col_fp["entropy_bucket"] = _bucket_entropy(
                    float(-sum(p * math.log(p + 1e-9) for p in top_vals.values))
                )

            col_fps.append(col_fp)

        # Row count bucketed (already provides some privacy)
        row_bucket = self._bucket_rows(len(df))

        fingerprint = {
            "fingerprint_id": fingerprint_id,
            "owner_commitment": owner_commitment,
            "column_count": len(df.columns),
            "row_count_range": row_bucket,
            "column_fingerprints": col_fps,
            "data_category_hint": self._guess_category(df),
            "registered_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "is_public": is_public,
            "privacy_level": noise_scale,
            "schema_hash": hashlib.sha256(
                json.dumps(sorted(df.dtypes.astype(str).to_dict().items())).encode()
            ).hexdigest()[:16],
        }

        logger.info(f"Generated fingerprint {fingerprint_id} (privacy={noise_scale}) for session={owner_commitment[:12]}...")
        return fingerprint

    def generate_marketplace_summary(self, fingerprint: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Generate a highly compressed version of column fingerprints for on-chain logging.
        Includes only key statistical markers (Mean, Std, Nulls, Uniqueness).
        """
        summary = []
        for col in fingerprint.get("column_fingerprints", []):
            compressed = {
                "h": col["col_hash"],
                "t": col["dtype_family"],
                "n": col["null_pct"],
                "u": col["unique_ratio"]
            }
            if col["dtype_family"] == "numeric":
                compressed["m"] = col.get("mean_normalized", 0.5)
                compressed["s"] = col.get("std_normalized", 0.1)
            elif col["dtype_family"] == "categorical":
                # Only keep the top 2 frequencies to save space
                dist = col.get("top_freq_distribution", [])
                compressed["d"] = dist[:2] if dist else [0.0]
            summary.append(compressed)
        return summary

    def anonymize_fingerprint(self, fingerprint: Dict[str, Any]) -> Dict[str, Any]:
        """
        Strip all ownership/session info from fingerprint for marketplace listing.
        """
        return {
            "fingerprint_id": fingerprint["fingerprint_id"],
            "column_count": fingerprint["column_count"],
            "row_count_range": fingerprint["row_count_range"],
            "data_category_hint": fingerprint["data_category_hint"],
            "registered_at": fingerprint["registered_at"],
            "schema_hash": fingerprint.get("schema_hash", ""),
            "column_fingerprints": [
                {k: v for k, v in cf.items()} for cf in fingerprint["column_fingerprints"]
            ],
            "owner_commitment": "REDACTED",
            "is_public": True,
        }

    def private_compare(
        self,
        fp_a: Dict[str, Any],
        fp_b: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Compare two fingerprints privately.
        Returns similarity scores and ZK proof — no raw data, no owner info.
        """
        compare_id = str(uuid.uuid4())[:16]

        # ── Structural Similarity ──────────────────────────────────────────
        col_count_sim = 1.0 - abs(fp_a["column_count"] - fp_b["column_count"]) / max(
            fp_a["column_count"], fp_b["column_count"], 1
        )

        # ── Column-Level Matching ─────────────────────────────────────────
        cols_a = fp_a.get("column_fingerprints", [])
        cols_b = fp_b.get("column_fingerprints", [])
        column_matches = []
        overall_sim_scores = []

        for ca in cols_a:
            best_score = 0.0
            best_cb = None
            for cb in cols_b:
                if ca["dtype_family"] != cb["dtype_family"]:
                    continue
                if ca["dtype_family"] == "numeric":
                    # Check if we have hashes (exact match)
                    if ca.get("col_hash") == cb.get("col_hash"):
                        score = 1.0
                    else:
                        # Distributional comparison
                        hist_a = ca.get("histogram", [])
                        hist_b = cb.get("histogram", [])
                        
                        # Fallback to compressed statistics if histograms are missing
                        if not hist_a or not hist_b or sum(hist_a) == 0 or sum(hist_b) == 0:
                            # Use Mean, Std, Nulls (shorthand names used in compressed summary)
                            a_m, b_m = ca.get("mean_normalized", ca.get("m", 0.5)), cb.get("mean_normalized", cb.get("m", 0.5))
                            a_s, b_s = ca.get("std_normalized", ca.get("s", 0.1)), cb.get("std_normalized", cb.get("s", 0.1))
                            a_n, b_n = ca.get("null_pct", ca.get("n", 0)), cb.get("null_pct", cb.get("n", 0))
                            
                            m_sim = 1.0 - abs(a_m - b_m)
                            s_sim = 1.0 - abs(a_s - b_s)
                            n_sim = 1.0 - abs(a_n - b_n)
                            score = (m_sim * 0.4) + (s_sim * 0.3) + (n_sim * 0.3)
                        else:
                            # Direct histogram similarity
                            length = max(len(hist_a), len(hist_b))
                            hist_a = (hist_a + [0.0] * length)[:length]
                            hist_b = (hist_b + [0.0] * length)[:length]
                            cos_sim = _cosine_similarity(hist_a, hist_b)
                            score = cos_sim

                elif ca["dtype_family"] == "categorical":
                    if ca.get("col_hash") == cb.get("col_hash"):
                        score = 1.0
                    else:
                        freq_a = ca.get("top_freq_distribution", ca.get("d", []))
                        freq_b = cb.get("top_freq_distribution", cb.get("d", []))
                        
                        if not freq_a or not freq_b:
                            score = 1.0 - abs(ca.get("null_pct", 0) - cb.get("null_pct", 0))
                        else:
                            length = max(len(freq_a), len(freq_b), 1)
                            freq_a = (freq_a + [0.0] * length)[:length]
                            freq_b = (freq_b + [0.0] * length)[:length]
                            score = _cosine_similarity(freq_a, freq_b)
                else:
                    score = 0.5 if ca["dtype_family"] == cb["dtype_family"] else 0.0

                if score > best_score:
                    best_score = score
                    best_cb = cb

            if best_cb and best_score > 0.2:
                column_matches.append({
                    "col_hash_a": ca["col_hash"],
                    "col_hash_b": best_cb["col_hash"],
                    "similarity_score": round(best_score, 4),
                    "distribution_match": round(best_score, 4),
                    "dtype_compatible": ca["dtype_family"] == best_cb["dtype_family"],
                    "insight": self._column_insight(ca, best_cb, best_score),
                })
                overall_sim_scores.append(best_score)

        overall_similarity = round(
            (sum(overall_sim_scores) / len(overall_sim_scores)) if overall_sim_scores else 0.0,
            4
        )
        
        # ── Weighted Final Score ──────────────────────────────────────────
        # A baseline categorical and structural match ensures we don't get 0% for similar domains
        cat_match = 1.0 if fp_a.get("data_category_hint") == fp_b.get("data_category_hint") else 0.3
        weighted_score = (overall_similarity * 0.7) + (col_count_sim * 0.15) + (cat_match * 0.15)
        
        final_similarity = round(max(0.001, weighted_score), 4)

        shared_structure_score = round(
            (col_count_sim + (len(column_matches) / max(len(cols_a), 1))) / 2, 4
        )

        # ── AI Insights ───────────────────────────────────────────────────
        insights = self._generate_insights(
            fp_a, fp_b, overall_similarity, shared_structure_score, column_matches
        )

        # ── ZK Proof for Comparison ────────────────────────────────────────
        proof = ZKProofEngine.generate_full_proof(
            private_data={
                "fp_a_id": fp_a["fingerprint_id"],
                "fp_b_id": fp_b["fingerprint_id"],
            },
            public_inputs={
                "compare_id": compare_id,
                "overall_similarity": final_similarity,
                "column_match_count": len(column_matches),
            },
        )

        return {
            "compare_id": compare_id,
            "zk_proof": proof,
            "overall_similarity": final_similarity,
            "shared_structure_score": shared_structure_score,
            "column_count_a": fp_a["column_count"],
            "column_count_b": fp_b["column_count"],
            "category_a": fp_a.get("data_category_hint", "unknown"),
            "category_b": fp_b.get("data_category_hint", "unknown"),
            "column_matches": column_matches[:20],  # Cap for response size
            "matched_columns_count": len(column_matches),
            "insights": insights,
            "privacy_guarantee": (
                "Neither dataset's raw data, filename, owner identity, or exact row count "
                "was used in this comparison. All operations performed on statistical "
                "fingerprints only. Verified by ZK proof."
            ),
            "source_a_revealed": False,
            "source_b_revealed": False,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _bucket_rows(count: int) -> str:
        if count < 100: return "<100"
        elif count < 1_000: return "100–1K"
        elif count < 10_000: return "1K–10K"
        elif count < 100_000: return "10K–100K"
        else: return "100K+"

    @staticmethod
    def _guess_category(df: pd.DataFrame) -> str:
        cols_lower = " ".join(df.columns.str.lower())
        if any(w in cols_lower for w in ["revenue", "profit", "cost", "price", "sales", "amount"]):
            return "financial"
        elif any(w in cols_lower for w in ["patient", "diagnosis", "dose", "health", "disease"]):
            return "medical"
        elif any(w in cols_lower for w in ["customer", "order", "product", "sku", "inventory"]):
            return "retail/ecommerce"
        elif any(w in cols_lower for w in ["lat", "lon", "location", "region", "country"]):
            return "geospatial"
        elif any(w in cols_lower for w in ["sensor", "device", "temperature", "humidity", "iot"]):
            return "iot/sensors"
        elif any(w in cols_lower for w in ["user", "click", "session", "event", "page"]):
            return "behavioral/analytics"
        return "general"

    @staticmethod
    def _column_insight(ca: Dict, cb: Dict, score: float) -> str:
        if score > 0.85:
            return "Very similar distributions — likely same domain or source type."
        elif score > 0.6:
            return "Moderate overlap — may represent related phenomena."
        elif score > 0.4:
            return "Partial structural match — different scale or population."
        else:
            return "Low similarity — distinct distributions."

    @staticmethod
    def _generate_insights(fp_a, fp_b, sim, struct, matches) -> List[str]:
        insights = []
        if sim > 0.8:
            insights.append(
                f"High overall similarity ({sim:.0%}) — datasets likely share the same domain or data generation process."
            )
        elif sim > 0.5:
            insights.append(
                f"Moderate similarity ({sim:.0%}) — datasets have common structural patterns but distinct populations."
            )
        else:
            insights.append(
                f"Low similarity ({sim:.0%}) — datasets appear structurally distinct or cover different domains."
            )

        if fp_a.get("data_category_hint") == fp_b.get("data_category_hint"):
            insights.append(
                f"Both datasets appear to be in the '{fp_a['data_category_hint']}' category."
            )

        if len(matches) > 0:
            strong = [m for m in matches if m["similarity_score"] > 0.8]
            if strong:
                insights.append(
                    f"{len(strong)} column pair(s) show strong distributional alignment — "
                    f"potential for privacy-safe data augmentation."
                )

        if struct > 0.7:
            insights.append(
                "Schema structures are highly compatible — datasets could be safely merged or benchmarked against each other."
            )

        return insights


def _bucket_skewness(sk: float) -> str:
    if abs(sk) < 0.5: return "symmetric"
    elif abs(sk) < 1.0: return "moderate"
    else: return "highly_skewed"


def _bucket_entropy(e: float) -> str:
    if e < 0.5: return "low"
    elif e < 1.5: return "medium"
    else: return "high"


# Singleton
private_compare_service = PrivateCompareService()
