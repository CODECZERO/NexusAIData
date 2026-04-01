"""
Lumina AI v4.0 — Chart Factory
Generates Plotly chart configurations for React frontend rendering.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    import numpy as np
    import pandas as pd

from models import ChartConfig, DashboardRole, FullAnalysisResult


# Theme colors matching the frontend design system
COLORS = {
    "primary": "#00E5FF",
    "secondary": "#7B2FFF",
    "success": "#00FF87",
    "danger": "#FF3D57",
    "warning": "#FFB800",
    "bg": "#07090F",
    "bg_dark": "#07090F",
    "card_bg": "#0F1117",
    "text": "#E8ECF4",
    "muted": "#6B7280",
    "border": "#1E2333",
    "palette": [
        "#00E5FF", "#7B2FFF", "#00FF87", "#FF3D57", "#FFB800",
        "#FF6B9D", "#36D7B7", "#A855F7", "#F472B6", "#34D399",
    ],
}

PLOTLY_LAYOUT_BASE: dict[str, Any] = {
    "paper_bgcolor": "rgba(0,0,0,0)",
    "plot_bgcolor": "rgba(0,0,0,0)",
    "font": {"family": "DM Sans, sans-serif", "color": COLORS["text"], "size": 12},
    "margin": {"l": 50, "r": 30, "t": 40, "b": 50},
    "xaxis": {"gridcolor": COLORS["border"], "zerolinecolor": COLORS["border"]},
    "yaxis": {"gridcolor": COLORS["border"], "zerolinecolor": COLORS["border"]},
    "legend": {"font": {"size": 11}},
    "hoverlabel": {"bgcolor": COLORS["card_bg"], "font_size": 12},
}


class ChartFactory:
    """Generates Plotly chart configurations from analysis results."""

    def generate_all_charts(
        self, analysis: FullAnalysisResult, df: pd.DataFrame
    ) -> list[ChartConfig]:
        """Generate all charts for the dashboard."""
        import pandas as pd
        logger.info("Generating chart configurations")
        charts: list[ChartConfig] = []

        # KPI cards (always generated)
        charts.extend(self._generate_kpi_cards(analysis, df))

        # Profile-based charts
        if analysis.profile:
            charts.extend(self._profile_charts(analysis, df))

        # Advanced multi-column combinations
        charts.extend(self._advanced_charts(df))

        # Quality charts
        if analysis.quality:
            charts.extend(self._quality_charts(analysis))

        # ML charts
        if analysis.ml_results:
            charts.extend(self._ml_charts(analysis, df))

        # Sort by priority
        charts.sort(key=lambda c: c.priority)

        logger.info(f"Generated {len(charts)} chart configurations")
        return charts

    # ── KPI Cards ────────────────────────────────────────────────────────────

    def _generate_kpi_cards(
        self, analysis: FullAnalysisResult, df: pd.DataFrame
    ) -> list[ChartConfig]:
        import pandas as pd
        import numpy as np
        cards = []

        # Total rows
        cards.append(ChartConfig(
            chart_id="kpi_total_rows",
            chart_type="kpi",
            title="Total Records",
            kpi_value=f"{len(df):,}",
            kpi_label="rows",
            kpi_trend="neutral",
            priority=1,
        ))

        # Columns
        cards.append(ChartConfig(
            chart_id="kpi_total_cols",
            chart_type="kpi",
            title="Attributes",
            kpi_value=str(len(df.columns)),
            kpi_label="columns",
            kpi_trend="neutral",
            priority=1,
        ))

        # Quality score
        if analysis.quality:
            score = analysis.quality.overall_score
            cards.append(ChartConfig(
                chart_id="kpi_quality_score",
                chart_type="kpi",
                title="Data Quality",
                kpi_value=f"{score:.0f}",
                kpi_label=f"Grade {analysis.quality.grade.value}",
                kpi_trend="up" if score >= 75 else "down",
                priority=1,
            ))

        # Anomalies
        if analysis.ml_results and analysis.ml_results.anomalies:
            a = analysis.ml_results.anomalies
            cards.append(ChartConfig(
                chart_id="kpi_anomalies",
                chart_type="kpi",
                title="Anomalies",
                kpi_value=str(a.anomaly_count),
                kpi_label=f"{a.anomaly_pct:.1f}% of data",
                kpi_trend="down" if a.anomaly_count > 0 else "up",
                priority=1,
            ))

        # Primary numeric stat
        numeric_cols = df.select_dtypes(include=np.number).columns
        if len(numeric_cols) > 0:
            col = numeric_cols[0]
            cards.append(ChartConfig(
                chart_id="kpi_primary_metric",
                chart_type="kpi",
                title=f"Total {col}",
                kpi_value=f"{df[col].sum():,.2f}",
                kpi_label=f"avg: {df[col].mean():,.2f}",
                kpi_trend="neutral",
                priority=1,
            ))

        return cards

    # ── Profile Charts ───────────────────────────────────────────────────────

    def _profile_charts(
        self, analysis: FullAnalysisResult, df: pd.DataFrame
    ) -> list[ChartConfig]:
        import pandas as pd
        import numpy as np
        charts = []

        # Null distribution bar
        null_data = {
            cp.name: cp.null_pct
            for cp in analysis.profile.column_profiles
            if cp.null_pct > 0
        }
        if null_data:
            charts.append(ChartConfig(
                chart_id="null_distribution",
                chart_type="bar",
                title="Missing Values by Column",
                description="Percentage of null values per column — highlights data completeness issues",
                plotly_data=[{
                    "type": "bar",
                    "x": list(null_data.keys()),
                    "y": list(null_data.values()),
                    "marker": {"color": COLORS["danger"], "opacity": 0.85,
                               "line": {"color": COLORS["border"], "width": 1}},
                    "text": [f"{v:.1f}%" for v in null_data.values()],
                    "textposition": "auto",
                    "textfont": {"color": COLORS["text"], "size": 10},
                    "hovertemplate": "<b>%{x}</b><br>Missing: %{y:.1f}%<br>Action: Review & impute<extra></extra>",
                }],
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": "Null Rate (%)"},
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": "Column Name"},
                },
                role_visibility=[DashboardRole.ANALYST, DashboardRole.ENGINEER],
                priority=3,
            ))

        # Correlation heatmap
        if analysis.profile.correlation_pairs:
            cols_involved = set()
            for p in analysis.profile.correlation_pairs[:20]:
                cols_involved.add(p.col_a)
                cols_involved.add(p.col_b)

            cols_list = sorted(cols_involved)
            num_df = df[cols_list].select_dtypes(include=np.number)
            if len(num_df.columns) >= 2:
                corr_matrix = num_df.corr()
                charts.append(ChartConfig(
                    chart_id="correlation_heatmap",
                    chart_type="heatmap",
                    title="Correlation Matrix",
                    description="Pearson correlations between numeric columns",
                    plotly_data=[{
                        "type": "heatmap",
                        "z": corr_matrix.values.round(2).tolist(),
                        "x": corr_matrix.columns.tolist(),
                        "y": corr_matrix.index.tolist(),
                        "colorscale": [
                            [0, "#FF3D57"], [0.5, "#0F1117"], [1, "#00E5FF"]
                        ],
                        "zmin": -1, "zmax": 1,
                        "hovertemplate": "%{x} vs %{y}: %{z:.2f}<extra></extra>",
                    }],
                    plotly_layout={
                        **PLOTLY_LAYOUT_BASE,
                        "height": 500,
                    },
                    role_visibility=[DashboardRole.SCIENTIST, DashboardRole.ANALYST],
                    priority=4,
                ))

        # Dtype distribution pie
        dtype_counts: dict[str, int] = {}
        for cp in analysis.profile.column_profiles:
            family = cp.dtype_family.value
            dtype_counts[family] = dtype_counts.get(family, 0) + 1

        charts.append(ChartConfig(
            chart_id="dtype_distribution",
            chart_type="pie",
            title="Column Type Distribution",
            plotly_data=[{
                "type": "pie",
                "labels": list(dtype_counts.keys()),
                "values": list(dtype_counts.values()),
                "marker": {"colors": COLORS["palette"][:len(dtype_counts)]},
                "hole": 0.4,
                "textinfo": "label+percent",
                "textfont": {"color": COLORS["text"]},
            }],
            plotly_layout={**PLOTLY_LAYOUT_BASE, "showlegend": True},
            role_visibility=[DashboardRole.ENGINEER],
            priority=5,
        ))

        # Top numeric column distributions (up to 12)
        num_count = 0
        for i, cp in enumerate(analysis.profile.column_profiles):
            if cp.dtype_family.value != "numeric" or num_count >= 12:
                continue
            num_count += 1
            col_data = df[cp.name].dropna()
            if len(col_data) == 0:
                continue

            charts.append(ChartConfig(
                chart_id=f"dist_{cp.name}",
                chart_type="histogram",
                title=f"Distribution: {cp.name}",
                description=f"Mean: {cp.mean:.2f}, Std: {cp.std:.2f}" if cp.mean else "",
                plotly_data=[{
                    "type": "histogram",
                    "x": col_data.tolist()[:5000],
                    "marker": {"color": COLORS["primary"], "opacity": 0.7},
                    "nbinsx": 40,
                }],
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": cp.name},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": "Count"},
                },
                role_visibility=[DashboardRole.SCIENTIST],
                priority=6,
            ))

        # Categorical top values bar chart (up to 4)
        cat_count = 0
        for cp in analysis.profile.column_profiles:
            if cp.dtype_family.value != "categorical" or not cp.top_10_values or cat_count >= 4:
                continue
            if cp.looks_like_id:
                continue
            cat_count += 1

            top_vals = dict(list(cp.top_10_values.items())[:10])
            charts.append(ChartConfig(
                chart_id=f"cat_{cp.name}",
                chart_type="bar",
                title=f"Top Values: {cp.name}",
                description=f"{cp.unique_count} unique values — showing top 10 by frequency",
                plotly_data=[{
                    "type": "bar",
                    "x": list(top_vals.keys()),
                    "y": list(top_vals.values()),
                    "marker": {"color": COLORS["secondary"], "opacity": 0.85,
                               "line": {"color": COLORS["border"], "width": 1}},
                    "text": [f"{v:,}" for v in top_vals.values()],
                    "textposition": "auto",
                    "textfont": {"color": COLORS["text"], "size": 10},
                    "hovertemplate": "<b>%{x}</b><br>Count: %{y:,}<extra></extra>",
                }],
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": f"{cp.name}"},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": "Record Count"},
                },
                role_visibility=[DashboardRole.ANALYST, DashboardRole.EXECUTIVE],
                priority=5,
            ))

        return charts

    # ── Quality Charts ───────────────────────────────────────────────────────

    def _quality_charts(self, analysis: FullAnalysisResult) -> list[ChartConfig]:
        charts = []
        q = analysis.quality

        # Issue severity distribution
        severity_data = {
            "Critical": len(q.critical_issues),
            "High": len(q.high_issues),
            "Medium": len(q.medium_issues),
            "Low": len(q.low_issues),
        }
        severity_colors = [COLORS["danger"], COLORS["warning"], COLORS["primary"], COLORS["muted"]]

        total_issues = sum(severity_data.values())
        charts.append(ChartConfig(
            chart_id="quality_severity",
            chart_type="bar",
            title="Data Quality Audit — Issues by Severity",
            description=f"{total_issues} total issues detected across all severity levels",
            plotly_data=[{
                "type": "bar",
                "x": list(severity_data.keys()),
                "y": list(severity_data.values()),
                "marker": {"color": severity_colors,
                           "line": {"color": COLORS["border"], "width": 1}},
                "text": [str(v) for v in severity_data.values()],
                "textposition": "auto",
                "textfont": {"color": COLORS["text"], "size": 12, "family": "JetBrains Mono"},
                "hovertemplate": "<b>%{x}</b><br>Issues: %{y}<br>Priority: Resolve immediately<extra></extra>",
            }],
            plotly_layout={
                **PLOTLY_LAYOUT_BASE,
                "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": "Severity Level"},
                "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": "Issue Count"},
            },
            role_visibility=[DashboardRole.ENGINEER, DashboardRole.ANALYST],
            priority=3,
        ))

        # Quality score gauge
        charts.append(ChartConfig(
            chart_id="quality_gauge",
            chart_type="gauge",
            title="Overall Quality Score",
            plotly_data=[{
                "type": "indicator",
                "mode": "gauge+number+delta",
                "value": q.overall_score,
                "gauge": {
                    "axis": {"range": [0, 100]},
                    "bar": {"color": COLORS["primary"]},
                    "steps": [
                        {"range": [0, 40], "color": "rgba(255,61,87,0.2)"},
                        {"range": [40, 75], "color": "rgba(255,184,0,0.2)"},
                        {"range": [75, 100], "color": "rgba(0,255,135,0.2)"},
                    ],
                    "threshold": {
                        "line": {"color": COLORS["success"], "width": 4},
                        "thickness": 0.75,
                        "value": 90,
                    },
                },
                "title": {"text": f"Grade {q.grade.value}", "font": {"size": 16}},
            }],
            plotly_layout={**PLOTLY_LAYOUT_BASE, "height": 300},
            role_visibility=[DashboardRole.ENGINEER, DashboardRole.ANALYST],
            priority=2,
        ))

        return charts

    # ── ML Charts ────────────────────────────────────────────────────────────

    def _ml_charts(
        self, analysis: FullAnalysisResult, df: pd.DataFrame
    ) -> list[ChartConfig]:
        import pandas as pd
        import numpy as np
        charts = []
        ml = analysis.ml_results

        # Segmentation scatter
        if ml.segmentation and ml.segmentation.scatter_data:
            scatter = ml.segmentation.scatter_data
            clusters = set(d["cluster"] for d in scatter)

            traces = []
            for cluster_id in sorted(clusters):
                cluster_points = [d for d in scatter if d["cluster"] == cluster_id]
                color_idx = cluster_id % len(COLORS["palette"])
                traces.append({
                    "type": "scatter",
                    "mode": "markers",
                    "x": [p["x"] for p in cluster_points],
                    "y": [p["y"] for p in cluster_points],
                    "name": cluster_points[0]["name"] if cluster_points else f"Cluster {cluster_id}",
                    "marker": {
                        "color": COLORS["palette"][color_idx],
                        "size": 6,
                        "opacity": 0.7,
                    },
                })

            charts.append(ChartConfig(
                chart_id="segmentation_scatter",
                chart_type="scatter",
                title=f"Customer Segmentation — {ml.segmentation.optimal_k} Clusters Identified",
                description="KMeans clustering with silhouette optimization — each color represents a distinct behavioral segment",
                plotly_data=traces,
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": "Principal Component 1"},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": "Principal Component 2"},
                    "height": 450,
                },
                role_visibility=[DashboardRole.SCIENTIST, DashboardRole.ANALYST],
                priority=3,
            ))

            # Segment size pie
            if ml.segmentation.segment_counts:
                charts.append(ChartConfig(
                    chart_id="segment_sizes",
                    chart_type="pie",
                    title="Segment Size Distribution",
                    description="Proportion of records in each cluster — larger segments indicate dominant behavioral patterns",
                    plotly_data=[{
                        "type": "pie",
                        "labels": list(ml.segmentation.segment_counts.keys()),
                        "values": list(ml.segmentation.segment_counts.values()),
                        "marker": {"colors": COLORS["palette"][:len(ml.segmentation.segment_counts)]},
                        "hole": 0.4,
                        "textinfo": "label+percent",
                        "textfont": {"color": COLORS["text"], "size": 11},
                        "hovertemplate": "<b>%{label}</b><br>Records: %{value:,}<br>Share: %{percent}<extra></extra>",
                    }],
                    plotly_layout={**PLOTLY_LAYOUT_BASE},
                    role_visibility=[DashboardRole.ANALYST],
                    priority=4,
                ))

        # Feature importance bar
        if ml.feature_importance and ml.feature_importance.xgb_importance:
            importance = ml.feature_importance.xgb_importance
            sorted_imp = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:15]

            charts.append(ChartConfig(
                chart_id="feature_importance",
                chart_type="bar",
                title="Predictive Feature Importance (XGBoost)",
                description=f"Target: {ml.feature_importance.target_col} — top features that drive predictions",
                plotly_data=[{
                    "type": "bar",
                    "x": [v for _, v in sorted_imp],
                    "y": [k for k, _ in sorted_imp],
                    "orientation": "h",
                    "marker": {"color": COLORS["secondary"], "opacity": 0.85,
                               "line": {"color": COLORS["border"], "width": 1}},
                    "text": [f"{v:.3f}" for _, v in sorted_imp],
                    "textposition": "auto",
                    "textfont": {"color": COLORS["text"], "size": 9},
                    "hovertemplate": "<b>%{y}</b><br>Importance: %{x:.4f}<extra></extra>",
                }],
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": "Feature Importance Score"},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": "Feature Name"},
                    "height": max(300, len(sorted_imp) * 25),
                    "margin": {"l": 150, "r": 30, "t": 40, "b": 50},
                },
                role_visibility=[DashboardRole.SCIENTIST],
                priority=3,
            ))

        # Forecast line chart
        if ml.forecast and ml.forecast.forecast_data:
            # Historical data
            date_col = ml.forecast.date_col
            value_col = ml.forecast.value_col

            if date_col in df.columns and value_col in df.columns:
                historical = df.groupby(date_col)[value_col].sum().reset_index().sort_values(date_col)
                hist_dates = [str(d) for d in historical[date_col].tolist()[-90:]]
                hist_values = historical[value_col].tolist()[-90:]

                # Get best model forecast
                best = ml.forecast.best_model
                fc_data = [d for d in ml.forecast.forecast_data if d.get("model") == best]

                traces = [
                    {
                        "type": "scatter",
                        "mode": "lines",
                        "x": hist_dates,
                        "y": hist_values,
                        "name": "Historical",
                        "line": {"color": COLORS["primary"], "width": 2},
                    },
                ]

                if fc_data:
                    traces.append({
                        "type": "scatter",
                        "mode": "lines",
                        "x": [d["date"] for d in fc_data],
                        "y": [d["predicted"] for d in fc_data],
                        "name": f"Forecast ({best})",
                        "line": {"color": COLORS["success"], "width": 2, "dash": "dash"},
                    })

                    # Confidence interval if available
                    if "lower" in fc_data[0] and "upper" in fc_data[0]:
                        traces.append({
                            "type": "scatter",
                            "mode": "lines",
                            "x": [d["date"] for d in fc_data] + [d["date"] for d in reversed(fc_data)],
                            "y": [d["upper"] for d in fc_data] + [d["lower"] for d in reversed(fc_data)],
                            "fill": "toself",
                            "fillcolor": "rgba(0,255,135,0.1)",
                            "line": {"color": "rgba(0,0,0,0)"},
                            "name": "95% Confidence",
                        })

                charts.append(ChartConfig(
                    chart_id="forecast_chart",
                    chart_type="line",
                    title=f"Forecast: {value_col}",
                    description=f"Best model: {best} (MAPE: {ml.forecast.best_mape:.1f}%)" if ml.forecast.best_mape else "",
                    plotly_data=traces,
                    plotly_layout={
                        **PLOTLY_LAYOUT_BASE,
                        "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": "Date"},
                        "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": value_col},
                        "height": 400,
                    },
                    role_visibility=[DashboardRole.SCIENTIST, DashboardRole.ANALYST],
                    priority=2,
                ))

        return charts

    # ── Advanced Multi-Column Charts ─────────────────────────────────────────

    def _advanced_charts(self, df: pd.DataFrame) -> list[ChartConfig]:
        import pandas as pd
        import numpy as np
        charts = []
        num_cols = df.select_dtypes(include=np.number).columns.tolist()
        cat_cols = [c for c in df.select_dtypes(include=["object"]).columns if 1 < df[c].nunique() <= 20]
        date_cols = [c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])]

        # Ensure we don't crash on very small datasets
        if df.empty or not num_cols:
            return charts

        # 1. Stacked Bar (Cat vs Num)
        if cat_cols and num_cols:
            cat = cat_cols[0]
            num = num_cols[0]
            grouped = df.groupby(cat)[num].sum().sort_values(ascending=False).head(10)
            charts.append(ChartConfig(
                chart_id=f"stacked_bar_{cat}_{num}",
                chart_type="bar",
                title=f"Total {num} by {cat}",
                description=f"Top 10 {cat} values ranked by cumulative {num}",
                plotly_data=[{
                    "type": "bar",
                    "x": grouped.index.tolist(),
                    "y": grouped.values.tolist(),
                    "marker": {"color": COLORS["primary"], "opacity": 0.85,
                               "line": {"color": COLORS["border"], "width": 1}},
                    "text": [f"{v:,.0f}" for v in grouped.values],
                    "textposition": "auto",
                    "textfont": {"color": COLORS["text"], "size": 10},
                    "hovertemplate": "<b>%{x}</b><br>Total: %{y:,.2f}<extra></extra>",
                }],
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "barmode": "stack",
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": cat},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": f"Total {num}"},
                },
                role_visibility=[DashboardRole.EXECUTIVE, DashboardRole.ANALYST],
                priority=2,
            ))

        # 2. Scatter Plot (Num1 vs Num2 color Cat)
        if len(num_cols) >= 2 and cat_cols:
            num1, num2, cat = num_cols[0], num_cols[1], cat_cols[0]
            sample = df.dropna(subset=[num1, num2, cat]).sample(min(2000, len(df)))
            
            traces = []
            for i, cat_val in enumerate(sample[cat].unique()[:10]):
                mask = sample[cat] == cat_val
                traces.append({
                    "type": "scatter",
                    "mode": "markers",
                    "name": str(cat_val),
                    "x": sample.loc[mask, num1].tolist(),
                    "y": sample.loc[mask, num2].tolist(),
                    "marker": {"size": 8, "opacity": 0.7, "color": COLORS["palette"][i % len(COLORS["palette"])]},
                    "hovertemplate": f"<b>{cat_val}</b><br>{num1}: %{{x:,.2f}}<br>{num2}: %{{y:,.2f}}<extra></extra>",
                })

            charts.append(ChartConfig(
                chart_id=f"scatter_{num1}_{num2}",
                chart_type="scatter",
                title=f"Correlation Analysis: {num1} vs {num2}",
                description=f"Color-coded by {cat} — identify patterns and outliers across segments",
                plotly_data=traces,
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": num1},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": num2},
                },
                role_visibility=[DashboardRole.SCIENTIST, DashboardRole.ANALYST],
                priority=3,
            ))

        # 3. Box Plot (Cat vs Num)
        if cat_cols and num_cols:
            cat = cat_cols[0]
            num = num_cols[0] if len(num_cols) == 1 else num_cols[1]
            sample = df.dropna(subset=[cat, num]).sample(min(5000, len(df)))
            
            traces = []
            for i, cat_val in enumerate(sample[cat].unique()[:8]):
                mask = sample[cat] == cat_val
                traces.append({
                    "type": "box",
                    "name": str(cat_val),
                    "y": sample.loc[mask, num].tolist(),
                    "marker": {"color": COLORS["palette"][i % len(COLORS["palette"])]},
                })
                
            charts.append(ChartConfig(
                chart_id=f"boxplot_{cat}_{num}",
                chart_type="box",
                title=f"Statistical Distribution: {num} by {cat}",
                description=f"Box plots showing median, quartiles, and outliers — compare spread across {cat} values",
                plotly_data=traces,
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": f"{cat} Category"},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": f"{num} Value"},
                },
                role_visibility=[DashboardRole.SCIENTIST, DashboardRole.ANALYST],
                priority=4,
            ))

        # 4. Treemap (Cat vs Num)
        if cat_cols and num_cols:
            cat = cat_cols[0] if len(cat_cols) == 1 else cat_cols[1]
            num = num_cols[0]
            grouped = df.groupby(cat)[num].sum().reset_index()
            grouped = grouped[grouped[num] > 0] # Treemap needs positive
            if not grouped.empty:
                charts.append(ChartConfig(
                    chart_id=f"treemap_{cat}",
                    chart_type="treemap",
                    title=f"Revenue Composition: {num} by {cat}",
                    description=f"Area size represents proportional contribution — quickly identify dominant {cat} segments",
                    plotly_data=[{
                        "type": "treemap",
                        "labels": grouped[cat].astype(str).tolist(),
                        "parents": [""] * len(grouped),
                        "values": grouped[num].tolist(),
                        "textinfo": "label+value+percent root",
                        "textfont": {"size": 12, "color": COLORS["text"]},
                        "hovertemplate": "<b>%{label}</b><br>Value: %{value:,.0f}<br>Share: %{percentRoot:.1%}<extra></extra>",
                        "marker": {"colors": COLORS["palette"][:len(grouped)], "line": {"width": 2, "color": COLORS["bg_dark"]}},
                    }],
                    plotly_layout=PLOTLY_LAYOUT_BASE,
                    role_visibility=[DashboardRole.EXECUTIVE, DashboardRole.ANALYST],
                    priority=2,
                ))

        # 5. Waterfall (Contrib)
        if cat_cols and num_cols:
            cat = cat_cols[0]
            num = num_cols[0]
            grouped = df.groupby(cat)[num].sum().sort_values(ascending=False).head(8)
            charts.append(ChartConfig(
                chart_id=f"waterfall_{cat}",
                chart_type="waterfall",
                title=f"Cumulative {num} Contribution by {cat}",
                description=f"Waterfall shows how each {cat} contributes to the total — green bars add, red bars subtract",
                plotly_data=[{
                    "type": "waterfall",
                    "x": grouped.index.tolist() + ["Total"],
                    "y": grouped.values.tolist() + [grouped.values.sum()],
                    "measure": ["relative"] * len(grouped) + ["total"],
                    "connector": {"line": {"color": COLORS["border"]}},
                    "textposition": "outside",
                    "text": [f"{v:,.0f}" for v in grouped.values] + [f"{grouped.values.sum():,.0f}"],
                    "textfont": {"color": COLORS["text"], "size": 9},
                    "increasing": {"marker": {"color": COLORS["success"]}},
                    "decreasing": {"marker": {"color": COLORS["danger"]}},
                    "totals": {"marker": {"color": COLORS["primary"]}},
                    "hovertemplate": "<b>%{x}</b><br>Value: %{y:,.0f}<extra></extra>",
                }],
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": f"{cat} Category"},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": f"Cumulative {num}"},
                },
                role_visibility=[DashboardRole.EXECUTIVE, DashboardRole.ANALYST],
                priority=3,
            ))

        # 6. Bubble Chart
        if len(num_cols) >= 3 and cat_cols:
            num1, num2, num3, cat = num_cols[0], num_cols[1], num_cols[2], cat_cols[0]
            sample = df.dropna(subset=[num1, num2, num3, cat]).sample(min(1000, len(df)))
            # Normalize size
            if sample[num3].max() > 0:
                sizes = (sample[num3] / sample[num3].max() * 40).clip(lower=5).tolist()
            else:
                sizes = [15] * len(sample)
                
            traces = []
            for i, cat_val in enumerate(sample[cat].unique()[:5]):
                mask = sample[cat] == cat_val
                traces.append({
                    "type": "scatter",
                    "mode": "markers",
                    "name": str(cat_val),
                    "x": sample.loc[mask, num1].tolist(),
                    "y": sample.loc[mask, num2].tolist(),
                    "marker": {
                        "size": [s for s, m in zip(sizes, mask) if m], 
                        "opacity": 0.6, 
                        "color": COLORS["palette"][i % len(COLORS["palette"])],
                        "line": {"width": 1, "color": "#FFFFFF"}
                    }
                })

            charts.append(ChartConfig(
                chart_id=f"bubble_{num1}_{num2}_{num3}",
                chart_type="bubble",
                title=f"Multi-Dimensional Analysis: {num1} × {num2} × {num3}",
                description=f"Bubble size represents {num3} — identify high-value segments at the intersection of {num1} and {num2}",
                plotly_data=traces,
                plotly_layout={
                    **PLOTLY_LAYOUT_BASE,
                    "xaxis": {**PLOTLY_LAYOUT_BASE["xaxis"], "title": num1},
                    "yaxis": {**PLOTLY_LAYOUT_BASE["yaxis"], "title": num2},
                },
                role_visibility=[DashboardRole.SCIENTIST, DashboardRole.ANALYST],
                priority=4,
            ))

        return charts
