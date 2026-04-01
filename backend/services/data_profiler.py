"""
Lumina AI v4.0 — Tier 1: Data Profiler
Exhaustive column-by-column statistical profiling.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
from loguru import logger
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd
    import numpy as np

from models import (
    ColumnProfile,
    CorrelationPair,
    DatasetProfile,
    DtypeFamily,
)




class DataProfiler:
    """Single Responsibility: Exhaustive column-by-column profiling."""

    async def profile_dataset(self, df: pd.DataFrame) -> DatasetProfile:
        """Profile the entire dataset asynchronously with memory-safe sampling."""
        import pandas as pd
        import numpy as np
        from concurrent.futures import ProcessPoolExecutor
        
        # Initialize executor lazily at the function level
        executor = ProcessPoolExecutor(max_workers=1)
        try:
            original_row_count = len(df)
            MAX_PROFILING_ROWS = 50000
            
            # Memory-safe sampling for massive datasets
            if original_row_count > MAX_PROFILING_ROWS:
                logger.warning(f"Dataset too large ({original_row_count} rows). Sampling {MAX_PROFILING_ROWS} rows for profiling.")
                df_sampled = df.sample(n=MAX_PROFILING_ROWS, random_state=42)
            else:
                df_sampled = df
                
            logger.info(f"Profiling dataset: {df_sampled.shape[0]} rows × {df_sampled.shape[1]} columns (Original: {original_row_count})")
    
            loop = asyncio.get_event_loop()
            column_profiles = []
    
            for col in df_sampled.columns:
                try:
                    profile = await loop.run_in_executor(
                        executor, self._profile_column, df_sampled, col
                    )
                    column_profiles.append(profile)
                except Exception as e:
                    logger.warning(f"Error profiling column {col}: {e}")
                    column_profiles.append(
                        ColumnProfile(
                            name=col,
                            dtype_raw=str(df_sampled[col].dtype),
                            dtype_family=DtypeFamily.UNKNOWN,
                        )
                    )
    
            correlation_pairs = self._correlation_matrix(df_sampled)
    
            return DatasetProfile(
                row_count=original_row_count, # Report actual count
                column_count=len(df_sampled.columns),
                memory_usage_mb=round(df.memory_usage(deep=True).sum() / 1e6, 2),
                duplicate_rows=int(df_sampled.duplicated().sum()),
                duplicate_pct=round(df_sampled.duplicated().mean() * 100, 2),
                column_profiles=column_profiles,
                correlation_pairs=correlation_pairs,
                cardinality_map={c: int(df_sampled[c].nunique()) for c in df_sampled.columns},
                sparsity_map={c: round(float(df_sampled[c].isnull().mean()), 4) for c in df_sampled.columns},
            )
        finally:
            executor.shutdown(wait=False)

    @staticmethod
    def _detect_dtype_family(s: pd.Series) -> DtypeFamily:
        """Detect the semantic data type family of a column."""
        import pandas as pd
        name = s.name.lower() if hasattr(s, 'name') and isinstance(s.name, str) else ""
        
        # 1. Geographic detection (by name heuristics)
        geo_keywords = ["lat", "lon", "city", "country", "state", "region", "zip", "postal", "address", "county"]
        if any(k in name for k in geo_keywords):
            return DtypeFamily.GEOGRAPHIC

        # 2. ID detection (high cardinality + name heuristics)
        non_null = s.dropna()
        unique_ratio = non_null.nunique() / len(non_null) if len(non_null) > 0 else 0
        id_keywords = ["id", "key", "code", "guid", "uuid", "index", "hash"]
        if unique_ratio > 0.9 and any(k in name for k in id_keywords):
            return DtypeFamily.ID

        if pd.api.types.is_bool_dtype(s):
            return DtypeFamily.BOOLEAN
        if pd.api.types.is_numeric_dtype(s):
            return DtypeFamily.NUMERIC
        if pd.api.types.is_datetime64_any_dtype(s):
            return DtypeFamily.DATETIME

        # Try parsing as datetime
        if s.dtype == object:
            non_null = s.dropna()
            if len(non_null) > 0:
                try:
                    pd.to_datetime(non_null.head(20), format="mixed", dayfirst=False, errors="coerce")
                    return DtypeFamily.DATETIME
                except (ValueError, TypeError):
                    pass

            # Text vs categorical: if avg length > 50 or unique ratio > 0.5
            if len(non_null) > 0:
                avg_len = non_null.astype(str).apply(len).mean()
                unique_ratio = non_null.nunique() / len(non_null) if len(non_null) > 0 else 0
                if avg_len > 50 or unique_ratio > 0.8:
                    return DtypeFamily.TEXT
            return DtypeFamily.CATEGORICAL

        return DtypeFamily.UNKNOWN

    @staticmethod
    def _profile_column(df: pd.DataFrame, col: str) -> ColumnProfile:
        """Profile a single column — runs in executor."""
        import pandas as pd
        import numpy as np
        s = df[col]
        dtype_family = DataProfiler._detect_dtype_family(s)

        # Common base stats
        null_count = int(s.isnull().sum())
        total = len(s)
        non_null = s.dropna()
        sample_size = min(5, len(non_null))
        sample_values = non_null.sample(sample_size, random_state=42).tolist() if sample_size > 0 else []

        # Serialize sample values to JSON-safe types
        safe_samples = []
        for v in sample_values:
            try:
                if isinstance(v, (np.integer,)):
                    safe_samples.append(int(v))
                elif isinstance(v, (np.floating,)):
                    safe_samples.append(float(v))
                elif isinstance(v, (pd.Timestamp,)):
                    safe_samples.append(str(v))
                else:
                    safe_samples.append(str(v))
            except Exception:
                safe_samples.append(str(v))

        base: dict[str, Any] = {
            "name": col,
            "dtype_raw": str(s.dtype),
            "dtype_family": dtype_family,
            "null_count": null_count,
            "null_pct": round(null_count / total * 100, 2) if total > 0 else 0,
            "unique_count": int(s.nunique()),
            "unique_pct": round(s.nunique() / total * 100, 2) if total > 0 else 0,
            "sample_values": safe_samples,
        }

        if dtype_family == DtypeFamily.NUMERIC:
            base.update(DataProfiler._numeric_stats(s))
        elif dtype_family == DtypeFamily.DATETIME:
            base.update(DataProfiler._datetime_stats(s, col))
        elif dtype_family in (DtypeFamily.CATEGORICAL, DtypeFamily.ID, DtypeFamily.GEOGRAPHIC):
            base.update(DataProfiler._categorical_stats(s))
        elif dtype_family == DtypeFamily.TEXT:
            base.update(DataProfiler._text_stats(s))

        return ColumnProfile(**base)

    @staticmethod
    def _numeric_stats(s: pd.Series) -> dict[str, Any]:
        """Compute numeric column statistics."""
        import numpy as np
        from scipy import stats
        non_null = s.dropna()
        if len(non_null) == 0:
            return {}

        result: dict[str, Any] = {
            "mean": round(float(non_null.mean()), 4),
            "median": round(float(non_null.median()), 4),
            "std": round(float(non_null.std()), 4),
            "variance": round(float(non_null.var()), 4),
            "min": float(non_null.min()),
            "max": float(non_null.max()),
            "range": float(non_null.max() - non_null.min()),
            "q1": round(float(non_null.quantile(0.25)), 4),
            "q3": round(float(non_null.quantile(0.75)), 4),
            "iqr": round(float(non_null.quantile(0.75) - non_null.quantile(0.25)), 4),
            "skewness": round(float(non_null.skew()), 4),
            "kurtosis": round(float(non_null.kurtosis()), 4),
            "zero_count": int((non_null == 0).sum()),
            "negative_count": int((non_null < 0).sum()),
        }

        # Coefficient of variation
        mean_val = non_null.mean()
        if mean_val != 0:
            result["cv"] = round(float(non_null.std() / mean_val * 100), 2)

        # Outliers via z-score
        if len(non_null) >= 3:
            try:
                z = np.abs(stats.zscore(non_null))
                result["outlier_count_zscore"] = int((z > 3).sum())
            except Exception:
                result["outlier_count_zscore"] = 0

        # Outliers via IQR
        q1 = non_null.quantile(0.25)
        q3 = non_null.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        result["outlier_count_iqr"] = int(((non_null < lower) | (non_null > upper)).sum())

        # Normality test
        if len(non_null) >= 8:
            try:
                _, p_value = stats.normaltest(non_null)
                result["is_normal"] = bool(p_value > 0.05)
            except Exception:
                result["is_normal"] = None

        # Percentiles
        result["percentiles"] = {
            str(p): round(float(non_null.quantile(p / 100)), 4)
            for p in [1, 5, 10, 25, 50, 75, 90, 95, 99]
        }

        return result

    @staticmethod
    def _datetime_stats(s: pd.Series, col: str) -> dict[str, Any]:
        """Compute datetime column statistics."""
        import pandas as pd
        try:
            d = pd.to_datetime(s, format="mixed", dayfirst=False, errors="coerce").dropna()
        except Exception:
            return {}

        if len(d) == 0:
            return {}

        result: dict[str, Any] = {
            "min_date": str(d.min()),
            "max_date": str(d.max()),
            "date_range_days": int((d.max() - d.min()).days),
        }

        # Granularity
        try:
            diffs = d.sort_values().diff().dropna()
            if len(diffs) > 0:
                mode_diff = diffs.mode()[0]
                if mode_diff >= pd.Timedelta(days=365):
                    result["granularity"] = "yearly"
                elif mode_diff >= pd.Timedelta(days=28):
                    result["granularity"] = "monthly"
                elif mode_diff >= pd.Timedelta(days=7):
                    result["granularity"] = "weekly"
                elif mode_diff >= pd.Timedelta(days=1):
                    result["granularity"] = "daily"
                elif mode_diff >= pd.Timedelta(hours=1):
                    result["granularity"] = "hourly"
                else:
                    result["granularity"] = f"{int(mode_diff.seconds / 60)} minutes"
        except Exception:
            pass

        day_dist = d.dt.dayofweek.value_counts()
        result["day_of_week_dist"] = {str(k): int(v) for k, v in day_dist.items()}

        month_dist = d.dt.month.value_counts()
        result["month_dist"] = {str(k): int(v) for k, v in month_dist.items()}

        year_dist = d.dt.year.value_counts()
        result["year_dist"] = {str(k): int(v) for k, v in year_dist.items()}

        return result

    @staticmethod
    def _categorical_stats(s: pd.Series) -> dict[str, Any]:
        """Compute categorical column statistics."""
        from scipy import stats
        vc = s.value_counts()
        total = len(s)

        result: dict[str, Any] = {
            "top_10_values": {str(k): int(v) for k, v in vc.head(10).items()},
            "bottom_10_values": {str(k): int(v) for k, v in vc.tail(10).items()},
            "is_binary": s.nunique() == 2,
            "is_high_cardinality": s.nunique() > 50,
            "looks_like_id": s.nunique() / total > 0.95 if total > 0 else False,
        }

        # Entropy
        if len(vc) > 0:
            result["entropy"] = round(float(stats.entropy(vc.values)), 4)

        # Concentration of top 3
        top3_sum = vc.head(3).sum()
        result["concentration_top3"] = round(float(top3_sum / total * 100), 2) if total > 0 else 0

        return result

    @staticmethod
    def _text_stats(s: pd.Series) -> dict[str, Any]:
        """Compute text column statistics."""
        non_null = s.dropna().astype(str)
        if len(non_null) == 0:
            return {}

        lengths = non_null.apply(len)
        return {
            "avg_length": round(float(lengths.mean()), 2),
            "max_length": int(lengths.max()),
        }

    @staticmethod
    def _correlation_matrix(df: pd.DataFrame) -> list[CorrelationPair]:
        """Extract significant correlation pairs."""
        import pandas as pd
        import numpy as np
        num = df.select_dtypes(include=np.number)
        if num.shape[1] < 2:
            return []

        try:
            corr = num.corr()
        except Exception:
            return []

        pairs: list[CorrelationPair] = []
        cols = corr.columns.tolist()

        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                r = corr.iloc[i, j]
                if pd.notna(r) and abs(r) > 0.3:
                    pairs.append(
                        CorrelationPair(
                            col_a=cols[i],
                            col_b=cols[j],
                            pearson_r=round(float(r), 4),
                            strength="strong" if abs(r) > 0.7 else "moderate",
                            direction="positive" if r > 0 else "negative",
                        )
                    )

        return sorted(pairs, key=lambda x: abs(x.pearson_r), reverse=True)
