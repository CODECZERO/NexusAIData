"""
Lumina AI v4.0 — Tier 3: Data Enrichment Engine
Temporal, geographic, text, and business feature enrichment.
"""

from __future__ import annotations

from typing import Any, Optional, TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    import numpy as np
    import pandas as pd

from models import EnrichmentResult


class DataEnrichmentEngine:
    """
    Detects enrichable columns and adds derived features.
    Each enricher is an independent, injectable service following SOLID.
    """

    async def enrich(self, df: pd.DataFrame) -> tuple[pd.DataFrame, EnrichmentResult]:
        """Run all applicable enrichments."""
        import pandas as pd
        import numpy as np
        logger.info(f"Starting enrichment pipeline on {df.shape[1]} columns")

        enrichments_applied: list[str] = []
        new_columns: list[str] = []
        code_lines: list[str] = [
            "# Lumina AI — Data Enrichment Code",
            "import pandas as pd",
            "import numpy as np",
            "",
        ]

        original_cols = set(df.columns)

        # Detect and apply enrichments
        date_cols = self._detect_date_columns(df)
        numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
        text_cols = self._detect_text_columns(df)

        # Temporal enrichment
        for col in date_cols:
            try:
                df = self._temporal_enrich(df, col)
                enrichments_applied.append(f"Temporal features from '{col}'")
                code_lines.extend(self._temporal_code(col))
            except Exception as e:
                logger.warning(f"Temporal enrichment failed for {col}: {e}")

        # Business feature enrichment
        if len(numeric_cols) >= 1:
            try:
                date_col = date_cols[0] if date_cols else None
                df, biz_enrichments = self._business_enrich(df, numeric_cols, date_col)
                enrichments_applied.extend(biz_enrichments)
            except Exception as e:
                logger.warning(f"Business enrichment failed: {e}")

        # Text enrichment (if VADER available)
        try:
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
            has_vader = True
        except ImportError:
            has_vader = False

        if has_vader:
            for col in text_cols[:2]:  # Limit to 2 text columns
                try:
                    df = self._text_enrich(df, col)
                    enrichments_applied.append(f"Text analytics from '{col}'")
                except Exception as e:
                    logger.warning(f"Text enrichment failed for {col}: {e}")

        # Track new columns
        new_columns = [c for c in df.columns if c not in original_cols]

        result = EnrichmentResult(
            enrichments_applied=enrichments_applied,
            new_columns_added=new_columns,
            enrichment_code="\n".join(code_lines),
            row_count_after=len(df),
            column_count_after=len(df.columns),
        )

        logger.info(f"Enrichment complete: {len(new_columns)} new columns added")
        return df, result

    # ── Column Detectors ─────────────────────────────────────────────────────

    @staticmethod
    def _detect_date_columns(df: pd.DataFrame) -> list[str]:
        """Find columns that are or look like dates."""
        import pandas as pd
        date_cols: list[str] = []
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                date_cols.append(col)
            elif df[col].dtype == object:
                try:
                    sample = df[col].dropna().head(20)
                    parsed = pd.to_datetime(sample, format="mixed", dayfirst=False, errors="coerce")
                    if parsed.notna().sum() > 15:
                        # Convert the column
                        df[col] = pd.to_datetime(df[col], format="mixed", dayfirst=False, errors="coerce")
                        date_cols.append(col)
                except Exception:
                    pass
        return date_cols

    @staticmethod
    def _detect_text_columns(df: pd.DataFrame) -> list[str]:
        """Find columns that contain free text (avg length > 30)."""
        import pandas as pd
        text_cols: list[str] = []
        for col in df.select_dtypes(include=["object"]).columns:
            non_null = df[col].dropna()
            if len(non_null) > 0:
                avg_len = non_null.astype(str).apply(len).mean()
                if avg_len > 30:
                    text_cols.append(col)
        return text_cols

    # ── Temporal Enrichment ──────────────────────────────────────────────────

    @staticmethod
    def _temporal_enrich(df: pd.DataFrame, date_col: str) -> pd.DataFrame:
        """Extract temporal features from a date column."""
        import pandas as pd
        d = pd.to_datetime(df[date_col], format="mixed", dayfirst=False, errors="coerce")

        new_cols = {
            f"{date_col}_year": d.dt.year,
            f"{date_col}_quarter": d.dt.quarter,
            f"{date_col}_month": d.dt.month,
            f"{date_col}_month_name": d.dt.month_name(),
            f"{date_col}_day_of_week": d.dt.day_name(),
            f"{date_col}_is_weekend": d.dt.dayofweek.isin([5, 6]),
            f"{date_col}_day": d.dt.day,
            f"{date_col}_days_since_first": (d - d.min()).dt.days,
        }

        # Season mapping
        season_map = {
            12: "Winter", 1: "Winter", 2: "Winter",
            3: "Spring", 4: "Spring", 5: "Spring",
            6: "Summer", 7: "Summer", 8: "Summer",
            9: "Autumn", 10: "Autumn", 11: "Autumn",
        }
        new_cols[f"{date_col}_season"] = d.dt.month.map(season_map)

        # Holiday detection
        try:
            import holidays as holidays_lib
            has_holidays = True
        except ImportError:
            has_holidays = False

        if has_holidays:
            try:
                country_holidays = holidays_lib.country_holidays("IN")
                new_cols[f"{date_col}_is_holiday"] = d.apply(
                    lambda x: x in country_holidays if pd.notna(x) else False
                )
            except Exception:
                pass

        # Business day
        new_cols[f"{date_col}_business_day"] = d.apply(
            lambda x: x.weekday() < 5 if pd.notna(x) else False
        )

        return df.assign(**new_cols)

    @staticmethod
    def _temporal_code(date_col: str) -> list[str]:
        return [
            f"# Temporal enrichment for '{date_col}'",
            f"d = pd.to_datetime(df['{date_col}'], format='mixed', dayfirst=False, errors='coerce')",
            f"df['{date_col}_year'] = d.dt.year",
            f"df['{date_col}_quarter'] = d.dt.quarter",
            f"df['{date_col}_month'] = d.dt.month",
            f"df['{date_col}_month_name'] = d.dt.month_name()",
            f"df['{date_col}_day_of_week'] = d.dt.day_name()",
            f"df['{date_col}_is_weekend'] = d.dt.dayofweek.isin([5, 6])",
            "",
        ]

    # ── Business Feature Enrichment ──────────────────────────────────────────

    @staticmethod
    def _business_enrich(
        df: pd.DataFrame, numeric_cols: list[str], date_col: Optional[str] = None
    ) -> tuple[pd.DataFrame, list[str]]:
        """Create derived business features from numeric columns."""
        import pandas as pd
        import numpy as np
        enrichments: list[str] = []
        primary_num = numeric_cols[0]

        if date_col:
            # Sort by date for rolling metrics
            df = df.sort_values(date_col)
            
            # Rolling averages
            df[f"{primary_num}_7d_rolling_avg"] = df[primary_num].rolling(7, min_periods=1).mean()
            df[f"{primary_num}_30d_rolling_avg"] = df[primary_num].rolling(30, min_periods=1).mean()
            enrichments.append(f"Rolling averages for '{primary_num}'")
            
            # Cumulative sum
            df[f"{primary_num}_cumsum"] = df[primary_num].cumsum()
            enrichments.append(f"Cumulative sum for '{primary_num}'")

        # Percent change (only makes sense if ordered, but widely applicable)
        df[f"{primary_num}_pct_change"] = df[primary_num].pct_change() * 100
        enrichments.append(f"Period-over-period change for '{primary_num}'")

        # Quartile Binning (e.g., Sales Tier)
        try:
            df[f"{primary_num}_tier"] = pd.qcut(df[primary_num], q=4, labels=["Low", "Medium", "High", "Top"], duplicates="drop")
            enrichments.append(f"Quartile binning for '{primary_num}'")
        except Exception:
            pass

        # Smart Ratio Detection
        # Instead of hunting for "sales" and "profit", automatically generate a ratio 
        # between the top two numeric features (if they are non-IDs and positive)
        valid_nums = [c for c in numeric_cols if not any(k in c.lower() for k in ["id", "key", "code"])]
        
        if len(valid_nums) >= 2:
            # Sort by coefficient of variation (std/mean) to find volume and efficiency proxies
            sorted_by_cv = sorted(valid_nums, key=lambda c: df[c].std() / max(df[c].mean(), 1e-5), reverse=True)
            col_volume = sorted_by_cv[0] # Highest relative variance
            col_efficiency = sorted_by_cv[1] # Second highest
            
            # Create a ratio using zero-safe division
            safe_denominator = df[col_volume].replace(0, np.nan)
            df[f"{col_efficiency}_to_{col_volume}_ratio"] = df[col_efficiency] / safe_denominator
            enrichments.append(f"Derived efficiency ratio: '{col_efficiency}' / '{col_volume}'")

        return df, enrichments

    # ── Text Enrichment ──────────────────────────────────────────────────────

    @staticmethod
    def _text_enrich(df: pd.DataFrame, text_col: str) -> pd.DataFrame:
        """Extract NLP and pattern features from a text column."""
        s = df[text_col].fillna("")

        new_cols: dict[str, Any] = {
            f"{text_col}_word_count": s.apply(lambda x: len(str(x).split())),
            f"{text_col}_char_count": s.apply(lambda x: len(str(x))),
        }
        
        # Extract potential year embedded in IDs (e.g. CA-2023-152156 -> 2023)
        year_pattern = s.str.extract(r'\b(19\d{2}|20\d{2})\b', expand=False)
        if year_pattern.notna().sum() > len(df) * 0.1:  # If at least 10% have it
            new_cols[f"{text_col}_extracted_year"] = year_pattern

        # Sentiment (if VADER available)
        try:
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
            analyzer = SentimentIntensityAnalyzer()
            new_cols[f"{text_col}_sentiment"] = s.apply(
                lambda x: analyzer.polarity_scores(str(x))["compound"]
            )
            new_cols[f"{text_col}_sentiment_label"] = new_cols[f"{text_col}_sentiment"].apply(
                lambda x: "positive" if x > 0.05 else ("negative" if x < -0.05 else "neutral")
            )
        except ImportError:
            pass

        return df.assign(**new_cols)
