"""
Lumina AI v4.0 — Tier 5: Insight Narrator
Generates executive summaries, role-specific recommendations, and what-if ROI scenarios.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    import numpy as np
    import pandas as pd

from models import (
    FullAnalysisResult,
    PrescriptiveInsights,
    RankedInsight,
    Recommendation,
    WhatIfScenario,
)


class InsightNarrator:
    """
    Consumes all tier 1–4 outputs and generates:
    1. Executive narrative
    2. Analyst recommendations
    3. Scientist recommendations
    4. Engineer recommendations
    5. What-if ROI scenarios
    """

    async def generate_insights(
        self, analysis: FullAnalysisResult, df: pd.DataFrame
    ) -> PrescriptiveInsights:
        """Generate all prescriptive insights from analysis results."""
        import pandas as pd
        logger.info("Generating prescriptive insights")

        executive_summary = self._executive_summary(analysis, df)
        key_metrics = self._extract_key_metrics(analysis, df)
        ranked_insights = self._generate_ranked_insights(analysis, df)
        what_ifs = self._generate_what_if_scenarios(analysis, df)
        analyst_recs = self._analyst_recommendations(analysis)
        scientist_recs = self._scientist_recommendations(analysis)
        engineer_recs = self._engineer_recommendations(analysis)

        # Enhance with LLM if possible
        try:
            from services.ai_service import ai_service
            
            # extract basic stats dictionary for prompting
            if analysis.profile:
                stats_dict = analysis.model_dump()
                df_head = df.head(3).to_string()
                
                llm_insights = await ai_service.generate_dataset_insights(
                    stats_dict, 
                    df_head, 
                    len(df), 
                    len(df.columns)
                )
                
                if llm_insights and len(llm_insights) > 0:
                    ranked_insights = []
                    for i in llm_insights[:10]:
                        ranked_insights.append(RankedInsight(
                            insight_class=i.get("insight_class", "Observation"),
                            title=i.get("title", "Insight"),
                            description=i.get("description", ""),
                            impact=i.get("impact", "Medium"),
                            roi_estimate=i.get("roi_estimate", "N/A"),
                            action=i.get("action", "")
                        ))
                    logger.info(f"Successfully generated {len(ranked_insights)} LLM-driven insights.")
        except Exception as e:
            logger.error(f"Failed to enrich insights with LLM: {str(e)}")

        return PrescriptiveInsights(
            executive_summary=executive_summary,
            key_metrics=key_metrics,
            ranked_insights=ranked_insights,
            what_if_scenarios=what_ifs,
            analyst_recommendations=analyst_recs,
            scientist_recommendations=scientist_recs,
            engineer_recommendations=engineer_recs,
        )

    def _executive_summary(self, analysis: FullAnalysisResult, df: pd.DataFrame) -> str:
        """Generate CEO-level executive summary."""
        import pandas as pd
        parts = []

        parts.append(
            f"Dataset contains {len(df):,} records across {len(df.columns)} attributes. "
        )

        # Quality
        if analysis.quality:
            q = analysis.quality
            parts.append(
                f"Data quality scored {q.overall_score}/100 (Grade {q.grade.value}) "
                f"with {q.total_issues} issues detected. "
            )
            if q.critical_issues:
                parts.append(
                    f"⚠️ {len(q.critical_issues)} critical issues require immediate attention. "
                )

        # ML insights
        if analysis.ml_results:
            ml = analysis.ml_results
            if ml.segmentation and ml.segmentation.optimal_k > 0:
                parts.append(
                    f"Customer segmentation identified {ml.segmentation.optimal_k} "
                    f"distinct clusters. "
                )

            if ml.anomalies and ml.anomalies.anomaly_count > 0:
                parts.append(
                    f"Anomaly detection flagged {ml.anomalies.anomaly_count} records "
                    f"({ml.anomalies.anomaly_pct:.1f}%) as potential outliers using "
                    f"3-method ensemble validation. "
                )

            if ml.trend_analysis and ml.trend_analysis.trend_direction != "unknown":
                parts.append(
                    f"Overall trend is {ml.trend_analysis.trend_direction} "
                    f"(slope: {ml.trend_analysis.slope_per_period:.4f} per period). "
                )

            if ml.forecast and ml.forecast.best_model:
                parts.append(
                    f"Best forecasting model: {ml.forecast.best_model} "
                    f"(MAPE: {ml.forecast.best_mape:.1f}%). "
                )

        # Enrichment
        if analysis.enrichment and analysis.enrichment.new_columns_added:
            parts.append(
                f"Data enrichment added {len(analysis.enrichment.new_columns_added)} "
                f"new features for deeper analysis. "
            )

        return "".join(parts)

    def _extract_key_metrics(
        self, analysis: FullAnalysisResult, df: pd.DataFrame
    ) -> list[dict[str, Any]]:
        """Extract the most important KPI-worthy metrics."""
        import pandas as pd
        import numpy as np
        metrics = []

        # Row count
        metrics.append({
            "label": "Total Records",
            "value": f"{len(df):,}",
            "icon": "database",
        })

        # Quality score
        if analysis.quality:
            metrics.append({
                "label": "Data Quality",
                "value": f"{analysis.quality.overall_score}/100",
                "trend": "up" if analysis.quality.overall_score >= 75 else "down",
                "icon": "shield-check",
            })

        # Numeric summary
        numeric_cols = df.select_dtypes(include=np.number).columns
        if len(numeric_cols) > 0:
            primary = numeric_cols[0]
            total = df[primary].sum()
            avg = df[primary].mean()
            metrics.append({
                "label": f"Total {primary}",
                "value": f"{total:,.2f}",
                "icon": "trending-up",
            })
            metrics.append({
                "label": f"Avg {primary}",
                "value": f"{avg:,.2f}",
                "icon": "bar-chart",
            })

        # Anomalies
        if analysis.ml_results and analysis.ml_results.anomalies:
            a = analysis.ml_results.anomalies
            metrics.append({
                "label": "Anomalies Detected",
                "value": str(a.anomaly_count),
                "trend": "down" if a.anomaly_count > 0 else "neutral",
                "icon": "alert-triangle",
            })

        # Segments
        if analysis.ml_results and analysis.ml_results.segmentation:
            s = analysis.ml_results.segmentation
            metrics.append({
                "label": "Segments Found",
                "value": str(s.optimal_k),
                "icon": "users",
            })

        return metrics

    def _generate_ranked_insights(
        self, analysis: FullAnalysisResult, df: pd.DataFrame
    ) -> list[RankedInsight]:
        """Generate the 7 core business insights based on the analysis."""
        import pandas as pd
        import numpy as np
        insights = []
        
        num_cols = df.select_dtypes(include=np.number).columns.tolist()
        cat_cols = [c for c in df.select_dtypes(include=["object"]).columns if 1 < df[c].nunique() <= 50]
        
        if not num_cols:
            return []
            
        primary = num_cols[0]
        primary_sum = df[primary].sum()

        # 1. Top Performer Insight & 2. Underperformer Insight
        if cat_cols:
            best_cat = None
            best_val = -float('inf')
            worst_cat = None
            worst_val = float('inf')
            
            for cat in cat_cols:
                grouped = df.groupby(cat)[primary].sum()
                if grouped.empty: continue
                top_idx = grouped.idxmax()
                bot_idx = grouped.idxmin()
                
                if grouped.max() > best_val:
                    best_val = grouped.max()
                    best_cat = (cat, top_idx)
                    
                if grouped.min() < worst_val:
                    worst_val = grouped.min()
                    worst_cat = (cat, bot_idx)
            
            if best_cat:
                insights.append(RankedInsight(
                    insight_class="Top Performer",
                    title=f"Top Driver: {best_cat[1]} in {best_cat[0]}",
                    description=f"'{best_cat[1]}' drives the highest {primary} ({best_val:,.2f}), outperforming all other categories in {best_cat[0]}.",
                    impact="High",
                    roi_estimate=f"Scale {best_cat[1]} strategy by 10% → Est. +{(best_val * 0.1):,.0f} {primary}",
                    action=f"Analyze what makes '{best_cat[1]}' successful and replicate it across other segments.",
                    estimated_value=float(best_val * 0.1)
                ))
            
            if worst_cat:
                avg_cat = df.groupby(worst_cat[0])[primary].sum().mean()
                gap = avg_cat - worst_val
                insights.append(RankedInsight(
                    insight_class="Underperformer",
                    title=f"Underperforming Segment: {worst_cat[1]}",
                    description=f"'{worst_cat[1]}' significantly lags behind the average {primary} by {gap:,.2f}.",
                    impact="Medium",
                    roi_estimate=f"Close gap to average → Est. +{(gap):,.0f} {primary}",
                    action=f"Investigate operational bottlenecks or eliminate '{worst_cat[1]}' if structurally unprofitable.",
                    estimated_value=float(gap)
                ))

        # 3. Trend Insight
        if analysis.ml_results and analysis.ml_results.trend_analysis:
            t = analysis.ml_results.trend_analysis
            if t.trend_direction != "unknown":
                impact = "High" if abs(t.slope_per_period or 0) > df[primary].std() * 0.1 else "Medium"
                insights.append(RankedInsight(
                    insight_class="Trend",
                    title=f"{t.trend_direction.title()} Trajectory for {primary}",
                    description=f"{primary} is actively {t.trend_direction} with an average slope of {t.slope_per_period:.4f} per period.",
                    impact=impact,
                    roi_estimate=f"Projecting next 12 periods → Est. Δ{abs((t.slope_per_period or 0) * 12):,.0f}",
                    action=f"Adapt capacity and budgeting to match the {t.trend_direction} momentum.",
                    estimated_value=float(abs((t.slope_per_period or 0) * 12))
                ))

        # 4. Anomaly Insight
        if analysis.ml_results and analysis.ml_results.anomalies:
            a = analysis.ml_results.anomalies
            if a.anomaly_count > 0:
                insights.append(RankedInsight(
                    insight_class="Anomaly",
                    title=f"Detected {a.anomaly_count} Outliers",
                    description=f"Found a concentrated cluster of outlier records ({a.anomaly_pct:.1f}%) exhibiting highly unusual patterns.",
                    impact="High" if a.anomaly_pct > 2 else "Low",
                    roi_estimate=f"Risk exposure mitigation → Est. {a.financial_risk:,.0f}",
                    action="Audit the flagged anomalies immediately for fraud, data entry errors, or extreme outcomes.",
                    estimated_value=float(a.financial_risk)
                ))

        # 5. Correlation Insight
        if analysis.profile and analysis.profile.correlation_pairs:
            pair = analysis.profile.correlation_pairs[0]
            if abs(pair.pearson_r) > 0.5:
                direction = "Positive" if pair.pearson_r > 0 else "Negative"
                insights.append(RankedInsight(
                    insight_class="Correlation",
                    title=f"{direction} relationship: {pair.col_a} & {pair.col_b}",
                    description=f"Changes in '{pair.col_a}' are strongly ({pair.pearson_r:.2f}) associated with changes in '{pair.col_b}'.",
                    impact="Medium",
                    roi_estimate=f"Optimize '{pair.col_a}' to steer '{pair.col_b}'",
                    action=f"Leverage '{pair.col_a}' as a leading indicator to proactively manage '{pair.col_b}' outcomes.",
                    estimated_value=float(abs(pair.pearson_r) * 1000) # Proxy value
                ))

        # 6. Concentration Insight (80/20 Rule)
        if cat_cols:
            cat = cat_cols[0]
            grouped = df.groupby(cat)[primary].sum().sort_values(ascending=False)
            grouped_cumsum = grouped.cumsum() / grouped.sum()
            # How many categories make up 80%?
            eighty_pct_idx = (grouped_cumsum >= 0.8).argmax() + 1
            total_cats = len(grouped)
            if eighty_pct_idx <= max(1, total_cats * 0.3): # Highly concentrated
                insights.append(RankedInsight(
                    insight_class="Concentration",
                    title=f"High Concentration Risk in {cat}",
                    description=f"Just {eighty_pct_idx} out of {total_cats} categories in '{cat}' drive 80% of total {primary}.",
                    impact="High",
                    roi_estimate=f"Diversify portfolio to reduce '{cat}' dependency risk",
                    action=f"Focus retention on top {eighty_pct_idx} categories, but invest in diversifying to reduce systemic risk.",
                    estimated_value=float(primary_sum * 0.8 * 0.05) # Assume 5% risk exposure on the 80% concentrated volume
                ))

        # 7. Efficiency Insight (e.g. Margin / Value per Unit)
        # Find two different numeric columns: one representing volume/scale (highest variance), one representing value/efficiency
        valid_nums = [c for c in num_cols if not any(k in c.lower() for k in ["id", "key", "code"])]
        
        rev_col = None
        prof_col = None
        if len(valid_nums) >= 2:
            # Sort by coefficient of variation (std/mean) to find volume and efficiency proxies
            sorted_by_cv = sorted(valid_nums, key=lambda c: df[c].std() / max(df[c].mean(), 1e-5), reverse=True)
            rev_col = sorted_by_cv[0] # Highest relative variance (volume proxy)
            prof_col = sorted_by_cv[1] # Second highest (efficiency proxy)
        if rev_col and prof_col and cat_cols:
            cat = cat_cols[0]
            grouped = df.groupby(cat)[[rev_col, prof_col]].sum()
            grouped["ratio"] = grouped[prof_col] / grouped[rev_col].replace(0, np.nan)
            worst_margin = grouped["ratio"].idxmin()
            worst_ratio = grouped.loc[worst_margin, "ratio"]
            
            insights.append(RankedInsight(
                insight_class="Efficiency Ratio",
                title=f"Efficiency Variance: {worst_margin} in {cat}",
                description=f"'{worst_margin}' has the lowest {prof_col} to {rev_col} ratio ({worst_ratio:.3f}) relative to its volume.",
                impact="High",
                roi_estimate=f"Elevate efficiency to baseline → Est. +{(grouped[prof_col].mean()):,.0f} overall {prof_col}",
                action=f"Investigate driving factors for low efficiency in '{worst_margin}' and apply best practices from top performers.",
                estimated_value=float(grouped[prof_col].mean())
            ))

        # Dynamic ROI Ranking: 
        # Rank primarily by the raw financial size of the estimated value (descending), 
        # falling back to the standard High/Med/Low impact logic for ties/non-monetary insights.
        impact_order = {"High": 0, "Medium": 1, "Low": 2}
        insights.sort(
            key=lambda x: (
                0 if x.estimated_value and x.estimated_value > 0 else 1,
                -(x.estimated_value or 0),
                impact_order.get(x.impact, 3)
            )
        )
        
        return insights[:10]

    def _generate_what_if_scenarios(
        self, analysis: FullAnalysisResult, df: pd.DataFrame
    ) -> list[WhatIfScenario]:
        """Generate ROI-linked what-if scenarios."""
        import pandas as pd
        import numpy as np
        scenarios = []

        # Scenario 1: Fix data quality
        if analysis.quality and analysis.quality.auto_fixable:
            fix_count = len(analysis.quality.auto_fixable)
            affected = sum(i.rows_affected for i in analysis.quality.auto_fixable)
            scenarios.append(
                WhatIfScenario(
                    title=f"Auto-Fix {fix_count} Data Quality Issues",
                    lever=f"Run auto-cleaning script to fix {fix_count} issues affecting {affected:,} rows",
                    calculation=f"{fix_count} issues × avg impact per issue",
                    annual_impact=f"Improved accuracy across {affected:,} records",
                    roi_multiple=round(affected / max(len(df), 1) * 10, 1),
                    priority="P1",
                    owner="Data Engineering",
                    timeline="Immediate — script ready",
                )
            )

        # Scenario 2: Anomaly investigation
        if analysis.ml_results and analysis.ml_results.anomalies:
            a = analysis.ml_results.anomalies
            if a.anomaly_count > 0:
                scenarios.append(
                    WhatIfScenario(
                        title=f"Investigate {a.anomaly_count} Anomalous Records",
                        lever="Review flagged anomalies for fraud, errors, or edge cases",
                        calculation=f"{a.anomaly_count} anomalies × estimated risk per record",
                        annual_impact=f"Potential risk mitigation of {a.financial_risk:,.0f}",
                        roi_multiple=round(a.financial_risk / max(a.anomaly_count * 100, 1), 1),
                        priority="P1" if a.anomaly_pct > 5 else "P2",
                        owner="Analytics + Operations",
                        timeline="1–2 weeks for full review",
                    )
                )

        # Scenario 3: Feature engineering value
        if analysis.ml_results and analysis.ml_results.feature_importance:
            fi = analysis.ml_results.feature_importance
            if fi.top_5_drivers:
                top_driver = fi.top_5_drivers[0][0]
                scenarios.append(
                    WhatIfScenario(
                        title=f"Optimize Top Driver: '{top_driver}'",
                        lever=f"Focus resources on improving '{top_driver}' — the strongest predictor",
                        calculation="10% improvement in top driver → estimated 3-5% uplift in target",
                        annual_impact="3-5% improvement in key metric",
                        roi_multiple=3.0,
                        priority="P2",
                        owner="Strategy + Analytics",
                        timeline="4–6 weeks to implement and measure",
                    )
                )

        # Scenario 4: Segment-specific strategy
        if analysis.ml_results and analysis.ml_results.segmentation:
            seg = analysis.ml_results.segmentation
            if seg.segment_counts:
                smallest = min(seg.segment_counts.items(), key=lambda x: x[1])
                largest = max(seg.segment_counts.items(), key=lambda x: x[1])
                scenarios.append(
                    WhatIfScenario(
                        title=f"Targeted Strategy for '{smallest[0]}' Segment",
                        lever=f"Create tailored approach for underserved '{smallest[0]}' segment ({smallest[1]:,} records)",
                        calculation=f"Growing '{smallest[0]}' to match '{largest[0]}' segment performance",
                        annual_impact="Potential 15-25% growth in underserved segment",
                        roi_multiple=5.0,
                        priority="P2",
                        owner="Growth + Marketing",
                        timeline="6–8 weeks",
                    )
                )

        return scenarios

    def _analyst_recommendations(self, analysis: FullAnalysisResult) -> list[Recommendation]:
        """Generate data analyst-specific recommendations."""
        recs = []

        if analysis.quality and analysis.quality.overall_score < 80:
            recs.append(Recommendation(
                title="Improve Data Quality Before Analysis",
                description="Data quality score is below 80. Run the auto-cleaning script and address critical issues before drawing conclusions.",
                impact="High — analysis accuracy directly correlates with data quality",
                effort="Low — auto-cleaning script is ready to run",
                priority="P1",
            ))

        if analysis.profile:
            high_null_cols = [
                cp.name for cp in analysis.profile.column_profiles
                if cp.null_pct > 20
            ]
            if high_null_cols:
                recs.append(Recommendation(
                    title=f"Address High Null Rates in {len(high_null_cols)} Columns",
                    description=f"Columns with >20% nulls: {', '.join(high_null_cols[:5])}. Consider imputation strategy or root-cause investigation.",
                    impact="Medium — null values reduce analysis reliability",
                    effort="Medium",
                    priority="P2",
                ))

        if analysis.ml_results and analysis.ml_results.trend_analysis:
            t = analysis.ml_results.trend_analysis
            if t.trend_direction == "decreasing":
                recs.append(Recommendation(
                    title="Investigate Declining Trend",
                    description=f"Data shows a {t.trend_direction} trend. Drill into contributing factors and identify root causes.",
                    impact="High — declining metrics need immediate investigation",
                    effort="Medium",
                    priority="P1",
                ))

        return recs

    def _scientist_recommendations(self, analysis: FullAnalysisResult) -> list[Recommendation]:
        """Generate data scientist-specific recommendations."""
        recs = []

        if analysis.ml_results:
            ml = analysis.ml_results

            if ml.segmentation and ml.segmentation.optimal_k > 0:
                recs.append(Recommendation(
                    title="Validate Cluster Stability",
                    description="Run bootstrap validation on clusters to ensure they're stable across subsamples. Consider testing DBSCAN for non-spherical cluster shapes.",
                    impact="Medium — ensures segmentation is reliable for action",
                    effort="Low",
                    priority="P2",
                ))

            if ml.feature_importance and ml.feature_importance.shap_mean_abs is None:
                recs.append(Recommendation(
                    title="Install SHAP for Feature Explainability",
                    description="SHAP values provide richer feature importance than tree-based importance alone. Install with: pip install shap",
                    impact="Medium — better model interpretation",
                    effort="Low",
                    priority="P3",
                ))

            if ml.forecast and ml.forecast.best_mape and ml.forecast.best_mape > 20:
                recs.append(Recommendation(
                    title="Improve Forecast Accuracy",
                    description=f"Current best MAPE is {ml.forecast.best_mape:.1f}%. Consider adding external regressors, holiday effects, or trying Prophet/NeuralProphet for better accuracy.",
                    impact="High — forecast accuracy drives planning decisions",
                    effort="Medium",
                    priority="P2",
                ))

        return recs

    def _engineer_recommendations(self, analysis: FullAnalysisResult) -> list[Recommendation]:
        """Generate data engineer-specific recommendations."""
        recs = []

        if analysis.profile:
            # Check for high cardinality columns that might indicate ID fields
            for cp in analysis.profile.column_profiles:
                if cp.looks_like_id:
                    recs.append(Recommendation(
                        title=f"Exclude ID Column '{cp.name}' from Analysis",
                        description=f"Column '{cp.name}' has >95% unique values — likely an identifier, not a feature.",
                        impact="Low — prevents noise in ML models",
                        effort="Low",
                        priority="P3",
                    ))
                    break  # Only one recommendation for IDs

            # Memory optimization
            memory_mb = analysis.profile.memory_usage_mb
            if memory_mb > 100:
                recs.append(Recommendation(
                    title="Optimize Memory Usage",
                    description=f"Dataset uses {memory_mb:.1f} MB. Consider downcasting numeric types or using Polars for large file processing.",
                    impact="Medium — faster processing, lower resource usage",
                    effort="Low",
                    priority="P2",
                ))

        if analysis.quality:
            if analysis.quality.auto_fixable:
                recs.append(Recommendation(
                    title="Integrate Auto-Cleaning in Pipeline",
                    description="Add the auto-generated cleaning script as a preprocessing step in your data pipeline.",
                    impact="High — prevents quality issues from reaching downstream consumers",
                    effort="Low — script is already generated",
                    priority="P1",
                ))

        return recs
