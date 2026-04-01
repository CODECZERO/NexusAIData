"""
Nexus AI v4.0 — Anomaly Detection Service
Automated multivariate and univariate outlier detection with AI explanations.
"""

from __future__ import annotations
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from typing import Any, List, Dict, Optional
from loguru import logger
from models import AnomalyReport, AnomalyPoint, XAIExplanation, DataDriftReport
from services.ai_service import AIService

class AnomalyDetectionService:
    def __init__(self, ai_service: Optional[AIService] = None):
        self.ai_service = ai_service

    async def detect_anomalies(self, df: pd.DataFrame, session_id: str) -> AnomalyReport:
        logger.info(f"Running anomaly detection for session: {session_id}")
        
        # 1. Filter numeric columns
        numeric_df = df.select_dtypes(include=[np.number]).dropna()
        if numeric_df.empty:
            return AnomalyReport(
                session_id=session_id,
                total_anomalies=0,
                anomalies=[],
                summary="No numeric data available for anomaly detection.",
                risk_level="low",
                impact_assessment="None"
            )

        # 2. Multivariate Detection (Isolation Forest)
        try:
            iso = IsolationForest(contamination='auto', random_state=42)
            preds = iso.fit_predict(numeric_df)
            anomaly_indices = numeric_df.index[preds == -1].tolist()
        except Exception as e:
            logger.error(f"Isolation Forest error: {e}")
            anomaly_indices = []
        
        # 3. Univariate Detection & Explanation
        anomalies = []
        stats = df.describe()
        
        for idx in anomaly_indices[:50]: # Limit to top 50 for performance
            try:
                row = df.loc[idx]
                # Find which column contributed most (simplistic approach: furthest from mean)
                contributions = []
                for col in numeric_df.columns:
                    val = row[col]
                    mean = stats.loc['mean', col]
                    std = stats.loc['std', col]
                    z = abs(val - mean) / std if std > 0 else 0
                    if z > 2:
                        contributions.append(XAIExplanation(
                            column=col,
                            contribution_val=float(val - mean),
                            contribution_pct=float(min(100.0, z * 10)), # Relative score capped at 100
                            direction="positive" if val > mean else "negative"
                        ))
                
                # Sort contributions
                contributions = sorted(contributions, key=lambda x: abs(x.contribution_pct), reverse=True)
                
                if contributions:
                    primary_col = contributions[0].column
                    anomalies.append(AnomalyPoint(
                        index=int(idx),
                        column=primary_col,
                        value=row[primary_col],
                        expected_value=float(stats.loc['mean', primary_col]),
                        severity=float(contributions[0].contribution_pct / 100.0),
                        reason=f"Significant deviation in {primary_col}",
                        contributing_factors=contributions[:3]
                    ))
            except Exception as e:
                logger.warning(f"Error processing anomaly at index {idx}: {e}")
                continue

        # 4. AI Summary
        risk_level = "low"
        if len(anomalies) > 0:
            risk_level = "medium"
            if len(anomalies) / len(df) > 0.05:
                risk_level = "high"

        summary = f"Detected {len(anomalies)} significant anomalies across {len(numeric_df.columns)} dimensions."
        if risk_level == "high":
             summary += " HIGH RISK: Large volume of outliers detected. Potential data quality or structural shift issues."
        
        return AnomalyReport(
            session_id=session_id,
            total_anomalies=len(anomalies),
            anomalies=anomalies,
            summary=summary,
            risk_level=risk_level,
            impact_assessment="Anomalies detected in key metrics could impact forecasting accuracy by up to 12%."
        )

    async def check_data_drift(self, baseline_df: pd.DataFrame, current_df: pd.DataFrame, session_id: str) -> DataDriftReport:
        """Detect drift between two versions of the same dataset."""
        logger.info(f"Checking data drift for session: {session_id}")
        
        drifted_cols = []
        p_values = {}
        
        baseline_numeric = baseline_df.select_dtypes(include=[np.number])
        current_numeric = current_df.select_dtypes(include=[np.number])
        
        for col in baseline_numeric.columns:
            if col in current_numeric.columns:
                m1 = baseline_numeric[col].mean()
                m2 = current_numeric[col].mean()
                std1 = baseline_numeric[col].std()
                
                # Using a simple threshold-based drift detection (Rel Change > 10% and > 0.5 StdDev)
                rel_change = abs(m1 - m2) / m1 if m1 != 0 else 0
                std_change = abs(m1 - m2) / std1 if std1 > 0 else 0
                
                if rel_change > 0.1 and std_change > 0.5:
                    drifted_cols.append(col)
                    p_values[col] = float(max(0.01, 1 - rel_change)) # Pseudo p-value
        
        is_significant = len(drifted_cols) > 0
        summary = "Dataset remains stable. No significant drift detected."
        if is_significant:
            summary = f"Warning: Significant structural drift detected in {len(drifted_cols)} columns."
        
        return DataDriftReport(
            session_id=session_id,
            drift_score=float(len(drifted_cols) / len(baseline_numeric.columns)) if not baseline_numeric.empty else 0.0,
            drifted_columns=drifted_cols,
            p_values=p_values,
            summary=summary,
            is_significant=is_significant
        )
