"""
Lumina AI v4.0 — Recommendation Engine
Generates role-specific features, chart recommendations, and dashboard blueprints
based on the actual uploaded dataset.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd


class RecommendationEngine:
    """Generates comprehensive role-specific recommendations from dataset analysis."""

    def generate_all(self, df: pd.DataFrame, filename: str, analysis: dict[str, Any] | None = None) -> dict[str, Any]:
        """Generate all recommendations based on the dataset."""
        import pandas as pd
        meta = self._extract_metadata(df, filename)
        return {
            "dataset_summary": meta,
            "executive": self._executive_recommendations(meta, analysis),
            "analyst": self._analyst_recommendations(meta, analysis),
            "scientist": self._scientist_recommendations(meta, analysis),
            "engineer": self._engineer_recommendations(meta, analysis),
            "dashboard_blueprints": self._dashboard_blueprints(meta, analysis),
            "advanced_charts": self._chart_recommendations(meta),
            "premium_capabilities": self._premium_capabilities(df, meta, analysis),
        }

    def _extract_metadata(self, df: pd.DataFrame, filename: str) -> dict[str, Any]:
        import pandas as pd
        numeric_cols = df.select_dtypes("number").columns.tolist()
        categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
        datetime_cols = [c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])]
        bool_cols = df.select_dtypes("bool").columns.tolist()
        high_card = [c for c in categorical_cols if df[c].nunique() > 20]
        low_card = [c for c in categorical_cols if df[c].nunique() <= 20]
        has_time = len(datetime_cols) > 0
        has_geo = any(kw in c.lower() for c in df.columns for kw in ["lat", "lon", "city", "country", "state", "region", "zip", "postal"])
        has_money = len([c for c in numeric_cols if df[c].std() > df[c].mean() * 0.1 and not any(kw in c.lower() for kw in ["id", "key", "code", "index"])]) > 0 if len(df) > 1 else False
        has_id = any(kw in c.lower() for c in df.columns for kw in ["id", "key", "code", "index"])
        null_pcts = {c: round(df[c].isna().mean() * 100, 1) if len(df) > 0 else 0.0 for c in df.columns}
        return {
            "filename": filename,
            "rows": len(df),
            "cols": len(df.columns),
            "columns": df.columns.tolist(),
            "numeric_cols": numeric_cols,
            "categorical_cols": categorical_cols,
            "datetime_cols": datetime_cols,
            "bool_cols": bool_cols,
            "high_cardinality": high_card,
            "low_cardinality": low_card,
            "has_time_series": has_time,
            "has_geo": has_geo,
            "has_monetary": has_money,
            "has_id": has_id,
            "null_pcts": null_pcts,
            "memory_mb": round(df.memory_usage(deep=True).sum() / 1e6, 2),
            "dtypes": {c: str(d) for c, d in df.dtypes.items()},
        }

    # ═══════════════════════════════════════════════════════════════
    # ROLE 1: Executive / Business Manager
    # ═══════════════════════════════════════════════════════════════

    def _executive_recommendations(self, meta: dict, analysis: dict | None) -> dict:
        cols = meta["columns"]
        num = meta["numeric_cols"][:5]
        cat = meta["low_cardinality"][:3]
        dt = meta["datetime_cols"][:1]

        features = [
            "📊 One-Click Executive Summary — auto-generated natural-language report with key metrics, trends, and risks",
            "📈 KPI Dashboard — real-time top-line KPI cards (totals, averages, growth rates) requiring zero configuration",
            "🎯 Goal Tracker — set target values for any metric and visualize progress with gauges/bullet charts",
            "📱 Mobile-First View — responsive dashboard optimized for quick checks on phone/tablet",
            "🔔 Anomaly Alerts — automated notifications when any metric moves beyond 2σ from its trend",
            "📅 Period Comparisons — one-click YoY, MoM, WoW comparisons for every numeric field",
            "🧹 No-Code Filters — drop-down slicers for every categorical column, no SQL required",
            "📤 One-Click PDF/PowerPoint Export — presentation-ready slides auto-generated from dashboard visuals",
            f"📊 One-Click Power BI Dashboard — auto-generates a full .pbix-ready structure with KPI cards ({', '.join(num[:3])}), slicers ({', '.join(cat[:2] or ['categories'])}), drill-down pages, bookmarks, tooltips, mobile view, and executive summary page",
            f"📊 One-Click Excel Dashboard — auto-generates a fully interactive workbook with dynamic KPI cards (formulas), PivotCharts, slicers/timelines{' on ' + dt[0] if dt else ''}, conditional formatting, and a one-page executive overview",
        ]

        charts = []
        if num and cat:
            charts.append({"type": "Gauge / Bullet Chart", "columns": f"Key metric: {num[0]}", "reason": "Shows progress toward a business target at a glance", "dashboard": "Both"})
            charts.append({"type": "Bar Chart (Grouped)", "columns": f"X: {cat[0]}, Y: {num[0]}", "reason": f"Compares {num[0]} across {cat[0]} categories clearly", "dashboard": "Both"})
        if dt:
            charts.append({"type": "Sparkline / KPI Trend", "columns": f"Date: {dt[0]}, Values: {', '.join(num[:2])}", "reason": "Mini trend lines inside KPI cards for quick pattern recognition", "dashboard": "Power BI"})
        charts.append({"type": "Donut Chart", "columns": f"Category: {cat[0] if cat else 'top categorical'}, Value: {num[0] if num else 'count'}", "reason": "Shows proportional breakdown for executive audiences", "dashboard": "Both"})

        return {"features": features, "charts": charts}

    # ═══════════════════════════════════════════════════════════════
    # ROLE 2: Data Analyst
    # ═══════════════════════════════════════════════════════════════

    def _analyst_recommendations(self, meta: dict, analysis: dict | None) -> dict:
        num = meta["numeric_cols"]
        cat = meta["categorical_cols"]
        dt = meta["datetime_cols"]
        cols = meta["columns"]

        measures_list = ", ".join([f"SUM({c}), AVG({c})" for c in num[:3]]) if num else "COUNT(*)"

        features = [
            "🔍 Smart Column Explorer — click any column to see full distribution, outliers, correlations, and sample values",
            "📊 Pivot Table Builder — drag-and-drop pivot table creation with aggregation options (sum, avg, count, median)",
            "🔗 Cross-Column Analysis — select any 2+ columns for cross-tabulation, chi-square tests, and group comparisons",
            "📈 Automated Trend Detection — flags statistically significant trends with p-values and confidence intervals",
            "🧮 Calculated Fields — create new columns using formulas (ratios, running totals, lag values) without writing code",
            "📋 Data Quality Scorecard — column-level quality metrics (nulls, duplicates, outliers, type mismatches) with fix suggestions",
            "🔄 Scheduled Reports — configure daily/weekly automated analysis runs with email delivery",
            "📤 SQL Query Generator — auto-generates SQL queries for any analysis you perform, exportable for use in other tools",
            f"📊 Auto Power BI Dashboard — generates complete .pbix structure with data model relationships, interactive KPI cards (DAX: {measures_list}), slicers on {', '.join(cat[:2]) if cat else 'categories'}, drill-through pages, bookmarks, tooltip pages, and publish-ready layout",
            f"📊 Auto Excel Dashboard — generates complete interactive workbook with PivotTables, dynamic KPI cards (GETPIVOTDATA formulas), slicers, conditional formatting, sparklines, and refreshable data connections",
        ]

        charts = []
        if len(num) >= 2:
            charts.append({"type": "Scatter Plot", "columns": f"X: {num[0]}, Y: {num[1]}{', Color: ' + cat[0] if cat else ''}", "reason": f"Reveals correlation between {num[0]} and {num[1]}", "dashboard": "Both"})
        if cat and num:
            charts.append({"type": "Box Plot", "columns": f"X: {cat[0]}, Y: {num[0]}", "reason": f"Shows distribution spread of {num[0]} across {cat[0]} groups", "dashboard": "Power BI"})
        if dt and num:
            charts.append({"type": "Line Chart with Moving Average", "columns": f"X: {dt[0]}, Y: {num[0]}", "reason": f"Tracks {num[0]} over time with smoothed trend overlay", "dashboard": "Both"})
        charts.append({"type": "Heatmap", "columns": f"All numeric: {', '.join(num[:5])}", "reason": "Correlation matrix reveals hidden relationships between variables", "dashboard": "Power BI"})

        return {"features": features, "charts": charts}

    # ═══════════════════════════════════════════════════════════════
    # ROLE 3: Data Scientist
    # ═══════════════════════════════════════════════════════════════

    def _scientist_recommendations(self, meta: dict, analysis: dict | None) -> dict:
        num = meta["numeric_cols"]
        cat = meta["categorical_cols"]
        dt = meta["datetime_cols"]

        features = [
            "📊 Distribution Analysis — automatic histogram, KDE, Q-Q plots, and normality tests (Shapiro-Wilk, K-S) for every numeric column",
            "🔗 Correlation Deep Dive — Pearson, Spearman, Kendall correlations with p-values, VIF scores, and multicollinearity detection",
            "🤖 Auto-ML Pipeline — one-click model training (regression/classification/clustering) with cross-validation and hyperparameter tuning",
            "📈 Feature Importance — SHAP values, permutation importance, and mutual information scores for model interpretability",
            "🧪 A/B Test Calculator — built-in statistical testing (t-test, chi-square, Mann-Whitney) with effect size and power analysis",
            "🔮 Forecast Lab — time-series forecasting with ARIMA, Prophet-style decomposition, and confidence intervals",
            "📉 Dimensionality Reduction — PCA, t-SNE, UMAP visualization of high-dimensional data with explained variance plots",
            "🧬 Anomaly Decomposition — isolation forest, DBSCAN, LOF results with anomaly severity scores and feature contributions",
            f"📊 Power BI + Excel Templates — pre-built statistical visuals (correlation heatmaps on [{', '.join(num[:4])}], distribution charts, forecast lines{' on ' + dt[0] if dt else ''}) extendable with Python/R visuals in Power BI",
            "🧮 Jupyter Notebook Export — all statistical analyses exportable as reproducible Jupyter notebooks with code + visuals",
        ]

        charts = []
        if len(num) >= 2:
            charts.append({"type": "Violin Plot", "columns": f"Variables: {', '.join(num[:4])}", "reason": "Shows probability density shape — richer than box plots for distribution comparison", "dashboard": "Power BI (Python visual)"})
        if len(num) >= 3:
            charts.append({"type": "Bubble Chart", "columns": f"X: {num[0]}, Y: {num[1]}, Size: {num[2]}{', Color: ' + cat[0] if cat else ''}", "reason": "Encodes 3-4 dimensions simultaneously for multivariate exploration", "dashboard": "Both"})
        charts.append({"type": "Histogram + KDE Overlay", "columns": f"Variable: {num[0] if num else 'primary metric'}", "reason": "Checks distribution shape and identifies skewness before modeling", "dashboard": "Power BI"})
        if dt and num:
            charts.append({"type": "Decomposition Plot (Trend + Seasonal + Residual)", "columns": f"Date: {dt[0]}, Value: {num[0]}", "reason": "Separates time-series signal from noise for accurate forecasting", "dashboard": "Power BI (Python visual)"})

        return {"features": features, "charts": charts}

    # ═══════════════════════════════════════════════════════════════
    # ROLE 4: Data Engineer
    # ═══════════════════════════════════════════════════════════════

    def _engineer_recommendations(self, meta: dict, analysis: dict | None) -> dict:
        null_cols = [c for c, p in meta["null_pcts"].items() if p > 5]

        features = [
            f"🔍 Schema Profiler — complete column type analysis across all {meta['cols']} columns with type mismatch detection",
            f"⚠️ Null Detection — {len(null_cols)} columns with >5% nulls flagged: [{', '.join(null_cols[:5])}{'...' if len(null_cols) > 5 else ''}]",
            "🧹 Auto-Cleaning Pipeline — generates Python/pandas code that handles nulls, duplicates, type coercion, and standardization",
            "📊 Data Lineage Tracker — tracks all transformations (enrichment, cleaning, feature engineering) with reversible audit trail",
            "🔄 Incremental Load Detection — identifies columns suitable for incremental refresh (datetime, auto-increment IDs)",
            "📐 Schema Validation — validates column types, value ranges, and constraints against expected schema definition",
            "⚡ Performance Profiler — identifies memory-intensive columns and suggests optimizations (downcasting, categorical conversion)",
            "🔗 Join Key Detection — identifies potential primary/foreign key columns based on cardinality and naming patterns",
            f"📊 Power BI Data Model — recommends star schema design with fact/dimension tables, relationships, incremental refresh on [{', '.join(meta['datetime_cols'][:2] or ['date columns'])}]",
            "📊 Excel Power Query — generates M queries for data connections, refresh schedules, and ETL transformations",
        ]

        charts = []
        charts.append({"type": "Stacked Bar (Null Distribution)", "columns": f"X: All columns, Y: Null% vs Valid%", "reason": "Shows data completeness across all fields for pipeline health monitoring", "dashboard": "Both"})
        if meta["categorical_cols"]:
            charts.append({"type": "Treemap", "columns": f"Category: {meta['categorical_cols'][0]}, Size: count", "reason": f"Shows cardinality distribution of {meta['categorical_cols'][0]} — helps detect data skew", "dashboard": "Power BI"})
        charts.append({"type": "Histogram (Row Size Distribution)", "columns": f"Row memory usage across columns", "reason": "Identifies oversized text fields or inefficient dtypes for memory optimization", "dashboard": "Power BI"})
        if meta["datetime_cols"]:
            charts.append({"type": "Area Chart (Data Volume Over Time)", "columns": f"X: {meta['datetime_cols'][0]}, Y: row count per period", "reason": "Shows data ingestion patterns — helps design incremental load strategies", "dashboard": "Both"})

        return {"features": features, "charts": charts}

    # ═══════════════════════════════════════════════════════════════
    # DASHBOARD BLUEPRINTS
    # ═══════════════════════════════════════════════════════════════

    def _dashboard_blueprints(self, meta: dict, analysis: dict | None) -> dict:
        num = meta["numeric_cols"]
        cat = meta["low_cardinality"]
        dt = meta["datetime_cols"]
        all_cat = meta["categorical_cols"]

        # Power BI Blueprint
        kpi_cards = []
        for c in num[:6]:
            kpi_cards.append({
                "measure": c,
                "dax_sum": f'Total_{c} = SUM(Data[{c}])',
                "dax_avg": f'Avg_{c} = AVERAGE(Data[{c}])',
                "dax_yoy": f'YoY_{c} = DIVIDE([Total_{c}] - CALCULATE([Total_{c}], SAMEPERIODLASTYEAR(Calendar[Date])), CALCULATE([Total_{c}], SAMEPERIODLASTYEAR(Calendar[Date])))'
                if dt else None,
            })

        powerbi = {
            "pages": [
                {"name": "Executive Overview", "visuals": ["KPI cards strip", "Top-line trend chart", "Category breakdown bar", "Key metrics table"]},
                {"name": "Detailed Analysis", "visuals": ["Cross-filter matrix", "Scatter plot", "Distribution histograms", "Correlation heatmap"]},
                {"name": "Trends & Forecasts", "visuals": ["Time-series line charts", "Moving averages", "Forecast ribbons", "Seasonality decomposition"]} if dt else None,
                {"name": "Quality & Insights", "visuals": ["Data quality scorecard", "Anomaly flags table", "Recommendations panel", "Auto-clean actions"]},
            ],
            "kpi_cards": kpi_cards,
            "slicers": [f"Slicer: {c} (dropdown)" for c in cat[:4]] + ([f"Timeline slicer: {dt[0]}"] if dt else []),
            "drilldown": [f"Drill from {cat[0]} → {cat[1]}" if len(cat) >= 2 else "Drill from category → row detail"],
            "bookmarks": ["Executive View (KPIs only)", "Analyst Deep Dive", "Data Quality Focus", "Full Detail Mode"],
            "mobile_tips": ["Stack KPI cards vertically", "Use card visuals over charts for small screens", "Enable phone layout in report settings", "Use bookmarks for quick navigation"],
            "publish_settings": ["Schedule refresh daily", "Enable row-level security if needed", "Set up email subscriptions for executives", "Create a Power BI App for distribution"],
        }

        # Excel Blueprint
        excel = {
            "layout": "Multi-sheet: Overview (1-page dashboard) + Raw Data + PivotAnalysis + Charts + Quality",
            "kpi_cards": [
                f'=GETPIVOTDATA("{c}", PivotAnalysis!$A$1)' for c in num[:4]
            ] + [
                f'=COUNTIF(RawData!{c}:1, "<>"&"")/COUNTA(RawData!A:A)*100 — for fill rate' for c in all_cat[:2]
            ],
            "slicers": [f"Slicer connected to PivotTable for: {c}" for c in cat[:4]] + ([f"Timeline for: {dt[0]}"] if dt else []),
            "pivot_charts": [
                f"PivotChart: {num[0]} by {cat[0]} (bar chart)" if num and cat else "PivotChart: summary metrics",
                f"PivotChart: {num[0]} over {dt[0]} (line chart)" if num and dt else None,
                f"PivotChart: Distribution of {cat[0]} (pie chart)" if cat else None,
            ],
            "conditional_formatting": [
                "Red/Yellow/Green color scales on numeric KPI cells",
                "Data bars on metric columns in pivot tables",
                "Icon sets (↑ ↓ →) for trend indicators",
                f"Highlight cells where null% > 10% in quality sheet",
            ],
            "refresh": [
                "Power Query connection to source CSV/database",
                "Refresh All button on Overview sheet",
                "Schedule via Power Automate if using SharePoint",
            ],
        }

        # Clean None from pages
        powerbi["pages"] = [p for p in powerbi["pages"] if p is not None]
        excel["pivot_charts"] = [p for p in excel["pivot_charts"] if p is not None]

        return {"powerbi": powerbi, "excel": excel}

    # ═══════════════════════════════════════════════════════════════
    # ADVANCED CHART RECOMMENDATIONS
    # ═══════════════════════════════════════════════════════════════

    def _chart_recommendations(self, meta: dict) -> list[dict]:
        num = meta["numeric_cols"]
        cat = meta["categorical_cols"]
        low_cat = meta["low_cardinality"]
        dt = meta["datetime_cols"]
        charts: list[dict] = []

        # 1. Line chart (time series)
        if dt and num:
            charts.append({
                "id": 1, "type": "Line Chart",
                "columns": {"x": dt[0], "y": num[0]},
                "reason": f"Tracks {num[0]} trend over {dt[0]} — essential for time-series analysis",
                "best_role": "Analyst", "role_reason": "Analysts need to monitor metric trends daily",
                "dashboard": "Both",
            })

        # 2. Stacked Bar
        if low_cat and num:
            charts.append({
                "id": 2, "type": "Stacked Bar Chart",
                "columns": {"x": low_cat[0], "y": num[0], "stack": low_cat[1] if len(low_cat) > 1 else "N/A"},
                "reason": f"Compares {num[0]} composition across {low_cat[0]} categories",
                "best_role": "Executive", "role_reason": "Quick visual breakdown of key metric by business segments",
                "dashboard": "Both",
            })

        # 3. Scatter
        if len(num) >= 2:
            charts.append({
                "id": 3, "type": "Scatter Plot",
                "columns": {"x": num[0], "y": num[1], "color": low_cat[0] if low_cat else "N/A"},
                "reason": f"Reveals correlation pattern between {num[0]} and {num[1]}",
                "best_role": "Scientist", "role_reason": "Critical for identifying relationships before modeling",
                "dashboard": "Power BI",
            })

        # 4. Histogram
        if num:
            charts.append({
                "id": 4, "type": "Histogram",
                "columns": {"value": num[0]},
                "reason": f"Shows distribution shape of {num[0]} — reveals skewness, modality, outliers",
                "best_role": "Scientist", "role_reason": "Distribution checks are prerequisite for statistical modeling",
                "dashboard": "Power BI",
            })

        # 5. Heatmap (correlation)
        if len(num) >= 3:
            charts.append({
                "id": 5, "type": "Heatmap (Correlation Matrix)",
                "columns": {"variables": num[:6]},
                "reason": "Maps all pairwise correlations — reveals multicollinearity and hidden relationships",
                "best_role": "Scientist", "role_reason": "Essential for feature selection and model diagnostics",
                "dashboard": "Power BI",
            })

        # 6. Box Plot
        if low_cat and num:
            charts.append({
                "id": 6, "type": "Box Plot",
                "columns": {"x": low_cat[0], "y": num[0]},
                "reason": f"Compares {num[0]} distribution (median, IQR, outliers) across {low_cat[0]}",
                "best_role": "Analyst", "role_reason": "Identifies group differences and outliers in categorical breakdowns",
                "dashboard": "Power BI",
            })

        # 7. Treemap
        if cat and num:
            charts.append({
                "id": 7, "type": "Treemap",
                "columns": {"category": cat[0], "size": num[0]},
                "reason": f"Shows hierarchical proportions of {num[0]} across {cat[0]}",
                "best_role": "Executive", "role_reason": "Intuitive proportional view — easier than pie charts for large categories",
                "dashboard": "Power BI",
            })

        # 8. Area chart
        if dt and len(num) >= 2:
            charts.append({
                "id": 8, "type": "Stacked Area Chart",
                "columns": {"x": dt[0], "y": [num[0], num[1]]},
                "reason": f"Shows cumulative contribution of {num[0]} and {num[1]} over time",
                "best_role": "Analyst", "role_reason": "Reveals composition changes in time-series data",
                "dashboard": "Both",
            })

        # 9. Waterfall
        if low_cat and num:
            charts.append({
                "id": 9, "type": "Waterfall Chart",
                "columns": {"category": low_cat[0], "value": num[0]},
                "reason": f"Decomposes how {low_cat[0]} segments contribute to total {num[0]}",
                "best_role": "Executive", "role_reason": "Shows positive/negative contributions — excellent for P&L or variance analysis",
                "dashboard": "Power BI",
            })

        # 10. Funnel
        if low_cat:
            charts.append({
                "id": 10, "type": "Funnel Chart",
                "columns": {"stage": low_cat[0], "count": "record count"},
                "reason": f"Visualizes conversion/dropout across {low_cat[0]} stages",
                "best_role": "Executive", "role_reason": "Shows bottlenecks in business processes like sales funnels",
                "dashboard": "Power BI",
            })

        # 11. Bubble chart
        if len(num) >= 3 and low_cat:
            charts.append({
                "id": 11, "type": "Bubble Chart",
                "columns": {"x": num[0], "y": num[1], "size": num[2], "color": low_cat[0]},
                "reason": "Encodes 4 dimensions in one visual for multivariate exploration",
                "best_role": "Scientist", "role_reason": "Reveals clusters and patterns across multiple variables simultaneously",
                "dashboard": "Power BI",
            })

        # 12. Null distribution bar
        charts.append({
            "id": 12, "type": "Horizontal Bar (Data Completeness)",
            "columns": {"y": "all columns", "x": "null percentage"},
            "reason": "Shows data quality at a glance — which columns need attention",
            "best_role": "Engineer", "role_reason": "Data quality monitoring is the engineer's primary concern",
            "dashboard": "Both",
        })

        # 13. Gauge
        if num:
            charts.append({
                "id": 13, "type": "Gauge Chart",
                "columns": {"value": f"avg({num[0]})", "target": "business goal"},
                "reason": f"Shows current {num[0]} performance against target — instant comprehension",
                "best_role": "Executive", "role_reason": "KPI progress tracking without cognitive load",
                "dashboard": "Power BI",
            })

        # 14. Geographic map
        if meta["has_geo"]:
            geo_col = next((c for c in meta["columns"] if any(k in c.lower() for k in ["city", "country", "state", "region"])), "location")
            charts.append({
                "id": 14, "type": "Filled Map / Choropleth",
                "columns": {"location": geo_col, "value": num[0] if num else "count"},
                "reason": f"Geospatial visualization of {num[0] if num else 'records'} by {geo_col}",
                "best_role": "Executive", "role_reason": "Regional performance comparison on an intuitive map",
                "dashboard": "Power BI",
            })

        # Ensure at least 12
        if len(charts) < 12 and num:
            charts.append({
                "id": len(charts) + 1, "type": "Donut Chart",
                "columns": {"category": cat[0] if cat else "top_category", "value": num[0]},
                "reason": f"Shows proportional split of {num[0]} — use sparingly for ≤6 categories",
                "best_role": "Executive", "role_reason": "Quick part-of-whole comprehension for presentations",
                "dashboard": "Excel",
            })

        return charts

    # ═══════════════════════════════════════════════════════════════
    # v6.0 PREMIUM CAPABILITIES
    # ═══════════════════════════════════════════════════════════════

    def _premium_capabilities(self, df: pd.DataFrame, meta: dict, analysis: dict | None) -> dict:
        import pandas as pd
        num = meta["numeric_cols"]
        cat = meta["categorical_cols"]
        low_cat = meta["low_cardinality"]
        dt = meta["datetime_cols"]
        cols = meta["columns"]
        filename = meta["filename"]

        # ── Conversational Analytics ──────────────────────────────
        follow_ups = []
        if num:
            follow_ups.append(f"What are the top 5 highest values in {num[0]}?")
            follow_ups.append(f"Show me the distribution of {num[0]} — is it skewed?")
        if cat and num:
            follow_ups.append(f"Which {cat[0]} category has the highest average {num[0]}?")
        if dt and num:
            follow_ups.append(f"What is the trend of {num[0]} over {dt[0]} — is it growing or declining?")
            follow_ups.append(f"Can you forecast {num[0]} for the next 6 months using {dt[0]}?")
        if len(follow_ups) < 5:
            follow_ups.append(f"Are there any anomalies or outliers in this dataset?")
        follow_ups = follow_ups[:5]

        # ── Automated Report Structure ────────────────────────────
        report_structure = {
            "format": "PDF / PowerPoint",
            "slides": [
                {"name": "Title Slide", "content": f"Lumina AI Analysis Report — {filename}", "includes": ["Company name placeholder", "Report date", f"Dataset: {meta['rows']} rows × {meta['cols']} columns"]},
                {"name": "Executive Summary", "content": "3–5 bullet highlights auto-generated from top insights", "includes": [f"Key metrics: {', '.join(num[:4])}", f"Segments: {', '.join(low_cat[:3]) if low_cat else 'N/A'}"]},
                {"name": "Top 5 Insights by ROI", "content": "Ranked insights with estimated business impact", "includes": ["Impact level (High/Medium/Low)", "Estimated ₹/$ value", "Recommended action"]},
                {"name": "Key Charts", "content": "6–8 auto-selected visualizations", "includes": [
                    f"Trend chart: {num[0]} over {dt[0]}" if dt and num else "Distribution chart",
                    f"Category breakdown: {num[0]} by {cat[0]}" if cat and num else "Summary metrics",
                    "Correlation heatmap" if len(num) >= 3 else "Top metrics bar chart",
                    "Data quality scorecard",
                ]},
                {"name": "Strategic Recommendations", "content": "Actionable next steps based on analysis", "includes": ["Quick wins (1 week)", "Medium-term improvements (1 month)", "Long-term strategy (quarterly)"]},
                {"name": "Appendix", "content": "Reference materials", "includes": ["Data glossary", "Methodology notes", "Raw summary tables", "Column statistics"]},
            ]
        }

        # ── Insight Ranking & ROI Calculator ──────────────────────
        insights_roi = []
        if meta["has_monetary"] and num:
            # Dynamic target col: highest relative variance non-ID numeric
            money_col = max((c for c in num if not any(k in c.lower() for k in ["id", "key", "code"])), key=lambda c: df[c].std() / max(df[c].mean(), 1), default=num[0])
            insights_roi.append({
                "insight": f"Top 20% of {cat[0] if cat else 'records'} drive ~80% of {money_col}",
                "impact": "High",
                "estimated_value": f"Focus on top performers could increase {money_col} by 15–25%",
                "action": f"Create targeted strategies for top-performing {cat[0] if cat else 'segments'}"
            })

        null_heavy = [c for c, p in meta["null_pcts"].items() if p > 20]
        if null_heavy:
            insights_roi.append({
                "insight": f"{len(null_heavy)} columns have >20% missing data: {', '.join(null_heavy[:3])}",
                "impact": "Medium",
                "estimated_value": "Fixing data completeness improves model accuracy by 10–30%",
                "action": "Implement data collection improvements and imputation strategies"
            })

        if dt and num:
            insights_roi.append({
                "insight": f"Time-series forecasting on {num[0]} using {dt[0]} can predict future performance",
                "impact": "High",
                "estimated_value": "Proactive planning could reduce costs by 5–15%",
                "action": f"Deploy ARIMA/Prophet forecasting model on {num[0]}"
            })

        if len(num) >= 2:
            insights_roi.append({
                "insight": f"Correlation analysis between {num[0]} and {num[1]} may reveal hidden drivers",
                "impact": "Medium",
                "estimated_value": "Understanding key drivers improves decision accuracy by 20%",
                "action": f"Run regression analysis with {num[0]} as target variable"
            })

        if cat and num:
            insights_roi.append({
                "insight": f"Segment-level analysis of {num[0]} by {cat[0]} reveals performance disparities",
                "impact": "High",
                "estimated_value": "Targeted segment optimization can improve overall metrics by 10–20%",
                "action": f"Deep-dive into underperforming {cat[0]} categories"
            })

        # ── Industry Benchmarking ─────────────────────────────────
        detected_industry = "General Business"
        industry_keywords = {
            "Retail / E-Commerce": ["product", "sku", "cart", "order", "shipping", "discount"],
            "Finance / Banking": ["loan", "interest", "credit", "debit", "account", "balance", "transaction"],
            "Healthcare": ["patient", "diagnosis", "treatment", "hospital", "medicine", "prescription"],
            "Real Estate": ["property", "rent", "sqft", "bedroom", "listing", "mortgage"],
            "HR / People Analytics": ["employee", "salary", "department", "hire", "attrition", "designation"],
            "Marketing": ["campaign", "click", "impression", "conversion", "ctr", "cpc", "ad"],
            "Manufacturing": ["batch", "defect", "production", "quality", "machine", "yield"],
            "Education": ["student", "grade", "course", "enrollment", "gpa", "marks"],
        }
        cols_lower = [c.lower() for c in cols]
        for industry, keywords in industry_keywords.items():
            matches = sum(1 for kw in keywords if any(kw in cl for cl in cols_lower))
            if matches >= 2:
                detected_industry = industry
                break

        benchmarks = {
            "detected_industry": detected_industry,
            "note": f"Industry auto-detected as '{detected_industry}' based on column names: {', '.join(cols[:8])}",
            "comparisons": [
                f"Compare your key metrics against 2026 {detected_industry} industry averages",
                "Benchmarking data can be added via the AI Chat Sidebar for live comparison",
            ],
        }

        # ── Multi-File Support ────────────────────────────────────
        id_cols = [c for c in cols if any(k in c.lower() for k in ["id", "key", "code"])]
        multi_file = {
            "join_keys": id_cols[:3] if id_cols else ["No obvious join keys detected — use row index or create a common identifier"],
            "merge_strategy": "LEFT JOIN recommended (preserve all rows from primary dataset)",
            "conflict_resolution": "For duplicate columns, suffix with _source1 / _source2",
            "unified_model_tip": "Upload multiple files → Lumina will auto-detect join keys and suggest a star schema combining all sources",
        }

        # ── Customization & Collaboration ─────────────────────────
        customization = {
            "branding": {
                "suggested_palette": ["#0A0E1A (Deep Navy)", "#00E5FF (Cyan Accent)", "#1A1F2E (Dark Card)", "#F5F5F5 (Light Text)", "#FFD700 (Gold Highlight)"],
                "fonts": ["Inter (primary)", "JetBrains Mono (code/data)", "Outfit (headings)"],
                "logo_placement": "Top-left corner of dashboard header, 40px height",
                "company_header": f"Auto-populated from filename: {filename.replace('.csv', '').replace('.xlsx', '').replace('_', ' ').title()}"
            },
            "sharing": [
                "Secure shareable links (view-only or edit mode)",
                "Embedded report iframes for integration into company portals",
                "Team comment threads per chart / KPI card",
                "Export to Notion / Confluence / Google Slides"
            ],
            "version_history": [
                "Snapshot saving after each major analysis",
                "Change log tracking all filter/chart/KPI modifications",
                "Rollback to any previous dashboard state"
            ],
            "scheduled_refresh": [
                "Auto-refresh intervals: hourly / daily / weekly",
                "Email alerts when KPIs breach defined thresholds",
                "Slack/Teams webhook integration for real-time notifications"
            ]
        }

        # ── AI Chat Sidebar Spec ──────────────────────────────────
        chat_sidebar = {
            "position": "Right side of dashboard window",
            "width": "25% of viewport (collapsible)",
            "capabilities": [
                "Filter data by any column value via natural language",
                "Add/remove KPI cards dynamically",
                "Change chart types and color schemes",
                "Run what-if scenarios (e.g., 'increase discount by 5%')",
                "Generate forecasts on demand",
                "Highlight outliers and anomalies",
                "Apply date range filters",
                "Export current view as PDF/PPT",
                "Switch between dashboard roles (Executive/Analyst/Scientist/Engineer)",
            ],
            "example_queries": [
                f"Show only rows where {cat[0]} = '{cat[0]}_value'" if cat else "Filter by top category",
                f"Add a KPI card for average {num[0]}" if num else "Add a new metric card",
                f"Change the bar chart to a treemap",
                f"What-if: increase {num[0]} by 10%" if num else "Run a what-if scenario",
                f"Forecast {num[0]} for next 6 months" if num and dt else "Show trend analysis",
            ]
        }

        return {
            "conversational_analytics": follow_ups,
            "automated_report": report_structure,
            "insight_ranking": insights_roi,
            "industry_benchmarking": benchmarks,
            "multi_file_support": multi_file,
            "customization": customization,
            "chat_sidebar": chat_sidebar,
        }
