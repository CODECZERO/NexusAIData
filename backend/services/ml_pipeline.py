"""
Lumina AI v4.0 — Tier 4: ML Pipeline
Segmentation, anomaly detection, forecasting, feature importance, trend analysis.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
import math
from typing import Any, Optional, TYPE_CHECKING
from loguru import logger

if TYPE_CHECKING:
    import pandas as pd
    import numpy as np

from models import (
    AnomalyResult,
    FeatureImportanceResult,
    ForecastResult,
    MLResults,
    MLTaskType,
    SegmentResult,
    TrendResult,
)

# Optional heavy imports (detected at runtime inside methods)
HAS_XGB = None
HAS_SHAP = None
HAS_STATSMODELS_DECOMPOSE = None
HAS_PMDARIMA = None

def _check_availability():
    """Check availability of heavy ML libraries without global state bloat."""
    global HAS_XGB, HAS_SHAP, HAS_STATSMODELS_DECOMPOSE, HAS_PMDARIMA
    if HAS_XGB is None:
        try: import xgboost; HAS_XGB = True
        except ImportError: HAS_XGB = False
    if HAS_SHAP is None:
        try: import shap; HAS_SHAP = True
        except ImportError: HAS_SHAP = False
    if HAS_STATSMODELS_DECOMPOSE is None:
        try: from statsmodels.tsa.seasonal import seasonal_decompose; HAS_STATSMODELS_DECOMPOSE = True
        except ImportError: HAS_STATSMODELS_DECOMPOSE = False
    if HAS_PMDARIMA is None:
        try: import pmdarima; HAS_PMDARIMA = True
        except ImportError: HAS_PMDARIMA = False


# Global executor removed for deep lazy loading
# executor = ProcessPoolExecutor(max_workers=1)



class MLPipeline:
    """Auto-detects the ML task type and runs the appropriate pipeline."""

    async def run_full_pipeline(self, df: 'pd.DataFrame') -> MLResults:
        """Run all applicable ML analyses."""
        import pandas as pd
        import numpy as np
        logger.info("Starting ML pipeline")
        _check_availability()

        results = MLResults()

        # Segmentation (if enough numeric cols)
        numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
        if len(numeric_cols) >= 2:
            try:
                results.segmentation = await self.run_segmentation(df, numeric_cols)
            except Exception as e:
                logger.warning(f"Segmentation failed: {e}")

        # Anomaly detection
        if len(numeric_cols) >= 2:
            try:
                results.anomalies = await self.run_anomaly_detection(df)
            except Exception as e:
                logger.warning(f"Anomaly detection failed: {e}")

        # Feature importance (use first numeric col as target)
        if HAS_XGB and len(numeric_cols) >= 3:
            try:
                target = numeric_cols[0]
                results.feature_importance = await self.run_feature_importance(df, target)
            except Exception as e:
                logger.warning(f"Feature importance failed: {e}")

        # Trend analysis (if date column found)
        date_cols = [c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])]
        if date_cols and numeric_cols:
            try:
                results.trend_analysis = await self.run_trend_analysis(
                    df, date_cols[0], numeric_cols[0]
                )
            except Exception as e:
                logger.warning(f"Trend analysis failed: {e}")

        # Forecasting
        if date_cols and numeric_cols:
            try:
                results.forecast = await self.run_forecasting(
                    df, date_cols[0], numeric_cols[0]
                )
            except Exception as e:
                logger.warning(f"Forecasting failed: {e}")

        return results

    # ── Segmentation (KMeans + Silhouette) ───────────────────────────────────

    async def run_segmentation(
        self, df: pd.DataFrame, numeric_cols: list[str]
    ) -> SegmentResult:
        """KMeans clustering with optimal k via silhouette score."""
        loop = asyncio.get_event_loop()
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(max_workers=1) as executor:
            return await loop.run_in_executor(
                executor, self._segmentation_sync, df, numeric_cols
            )

    @staticmethod
    def _segmentation_sync(df: 'pd.DataFrame', numeric_cols: list[str]) -> SegmentResult:
        import pandas as pd
        import numpy as np
        from sklearn.preprocessing import RobustScaler
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score
        # Prepare data
        X_raw = df[numeric_cols].fillna(df[numeric_cols].median())
        
        # Categorical Encoding
        cat_cols = [c for c in df.select_dtypes(exclude=np.number).columns if 1 < df[c].nunique() < 20]
        if cat_cols:
            X_cat = pd.get_dummies(df[cat_cols], drop_first=True, dtype=float)
            X_raw = pd.concat([X_raw, X_cat], axis=1)

        scaler = RobustScaler()
        X = scaler.fit_transform(X_raw)

        # Limit columns for clustering if too many
        if X.shape[1] > 10:
            from sklearn.decomposition import PCA
            pca = PCA(n_components=10, random_state=42)
            X = pca.fit_transform(X)

        # Find optimal k (2-8)
        max_k = min(8, len(X) - 1, 8)
        if max_k < 2:
            return SegmentResult()

        scores: dict[str, float] = {}
        for k in range(2, max_k + 1):
            try:
                km = KMeans(n_clusters=k, random_state=42, n_init="auto", max_iter=100)
                labels = km.fit_predict(X)
                score = silhouette_score(X, labels, sample_size=min(5000, len(X)))
                scores[str(k)] = round(float(score), 4)
            except Exception:
                continue

        if not scores:
            return SegmentResult()

        optimal_k = int(max(scores, key=scores.get))

        # Final clustering
        km = KMeans(n_clusters=optimal_k, random_state=42, n_init="auto")
        labels = km.fit_predict(X)

        # Build segment profiles
        df_clustered = X_raw.copy()
        df_clustered["cluster"] = labels

        segment_profiles = []
        segment_counts: dict[str, int] = {}
        segment_names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"]

        for cluster_id in range(optimal_k):
            mask = df_clustered["cluster"] == cluster_id
            cluster_data = df_clustered[mask]
            name = segment_names[cluster_id] if cluster_id < len(segment_names) else f"Cluster_{cluster_id}"

            profile: dict[str, Any] = {
                "cluster_id": cluster_id,
                "segment_name": name,
                "size": int(mask.sum()),
                "size_pct": round(float(mask.mean() * 100), 1),
            }

            for col in numeric_cols[:6]:  # Limit cols in profile
                profile[f"{col}_mean"] = round(float(cluster_data[col].mean()), 2)
                profile[f"{col}_median"] = round(float(cluster_data[col].median()), 2)

            segment_profiles.append(profile)
            segment_counts[name] = int(mask.sum())

        # Scatter data (first 2 components for visualization)
        scatter_data = []
        for i in range(min(2000, len(X))):
            scatter_data.append({
                "x": round(float(X[i, 0]), 4),
                "y": round(float(X[i, 1]), 4) if X.shape[1] > 1 else 0,
                "cluster": int(labels[i]),
                "name": segment_names[labels[i]] if labels[i] < len(segment_names) else f"Cluster_{labels[i]}",
            })

        return SegmentResult(
            optimal_k=optimal_k,
            silhouette_scores=scores,
            segment_profiles=segment_profiles,
            segment_counts=segment_counts,
            scatter_data=scatter_data,
        )

    # ── Anomaly Detection (3-method ensemble) ────────────────────────────────

    async def run_anomaly_detection(self, df: pd.DataFrame) -> AnomalyResult:
        """Three-method ensemble for robust anomaly flagging."""
        loop = asyncio.get_event_loop()
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(max_workers=1) as executor:
            return await loop.run_in_executor(executor, self._anomaly_sync, df)

    @staticmethod
    def _anomaly_sync(df: pd.DataFrame) -> AnomalyResult:
        import pandas as pd
        import numpy as np
        import warnings
        from sklearn.ensemble import IsolationForest
        from sklearn.neighbors import LocalOutlierFactor
        from sklearn.covariance import EllipticEnvelope

        num_df = df.select_dtypes(include=np.number).dropna(axis=1, how="all")
        num_df = num_df.fillna(num_df.median())

        if num_df.shape[0] < 10 or num_df.shape[1] < 1:
            return AnomalyResult()

        sample_size = min(10000, len(num_df))
        if len(num_df) > sample_size:
            num_df = num_df.sample(sample_size, random_state=42)

        contamination = 0.05

        # Method 1: IsolationForest
        try:
            iso = IsolationForest(contamination=contamination, random_state=42, n_jobs=-1)
            iso_scores = iso.fit_predict(num_df)
        except Exception:
            iso_scores = np.ones(len(num_df))

        # Method 2: Local Outlier Factor
        try:
            lof = LocalOutlierFactor(n_neighbors=min(20, len(num_df) - 1), contamination=contamination)
            lof_scores = lof.fit_predict(num_df)
        except Exception:
            lof_scores = np.ones(len(num_df))

        # Method 3: Elliptic Envelope
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=RuntimeWarning, module="sklearn.covariance")
                ee = EllipticEnvelope(contamination=contamination, random_state=42)
                ee_scores = ee.fit_predict(num_df)
        except Exception:
            ee_scores = iso_scores.copy()

        # Ensemble: flag if 2+ methods agree
        anomaly_iso = (iso_scores == -1).astype(int)
        anomaly_lof = (lof_scores == -1).astype(int)
        anomaly_ee = (ee_scores == -1).astype(int)
        votes = anomaly_iso + anomaly_lof + anomaly_ee
        is_anomaly = votes >= 2

        anomaly_count = int(is_anomaly.sum())
        anomaly_pct = round(anomaly_count / len(num_df) * 100, 2) if len(num_df) > 0 else 0

        # Get anomaly rows (limited)
        anomaly_indices = np.where(is_anomaly)[0][:50]
        anomaly_rows = []
        for idx in anomaly_indices:
            row = {col: round(float(num_df.iloc[idx][col]), 4) for col in num_df.columns[:10]}
            row["anomaly_confidence"] = round(float(votes[idx] / 3 * 100), 1)
            anomaly_rows.append(row)

        # Financial risk estimate
        financial_risk = 0.0
        if anomaly_count > 0:
            financial_risk = float(num_df.iloc[anomaly_indices].sum().sum())

        return AnomalyResult(
            anomaly_count=anomaly_count,
            anomaly_pct=anomaly_pct,
            anomaly_rows=anomaly_rows,
            financial_risk=round(financial_risk, 2),
            method_agreement={
                "isolation_forest": int(anomaly_iso.sum()),
                "local_outlier_factor": int(anomaly_lof.sum()),
                "elliptic_envelope": int(anomaly_ee.sum()),
                "ensemble_agreed": anomaly_count,
            },
        )

    # ── Time Series Forecasting ──────────────────────────────────────────────

    async def run_forecasting(
        self, df: pd.DataFrame, date_col: str, value_col: str
    ) -> ForecastResult:
        """Run ARIMA-based forecasting."""
        loop = asyncio.get_event_loop()
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(max_workers=1) as executor:
            return await loop.run_in_executor(
                executor, self._forecast_sync, df, date_col, value_col
            )

    @staticmethod
    def _forecast_sync(df: pd.DataFrame, date_col: str, value_col: str) -> ForecastResult:
        import pandas as pd
        import numpy as np
        from sklearn.linear_model import LinearRegression
        try:
            ts = df.groupby(date_col)[value_col].sum().reset_index().sort_values(date_col)
        except Exception:
            return ForecastResult(date_col=date_col, value_col=value_col)

        if len(ts) < 10:
            return ForecastResult(
                date_col=date_col,
                value_col=value_col,
                models={"error": "Not enough data points for forecasting (need >= 10)"},
            )

        results: dict[str, Any] = {}
        forecast_data: list[dict[str, Any]] = []

        # Method 1: Linear Regression Forecast
        try:
            X_idx = np.arange(len(ts)).reshape(-1, 1)
            y_vals = ts[value_col].values.astype(float)

            lr = LinearRegression()
            lr.fit(X_idx, y_vals)

            # Forecast 30 periods
            future_idx = np.arange(len(ts), len(ts) + 30).reshape(-1, 1)
            lr_forecast = lr.predict(future_idx)

            # In-sample MAPE
            in_sample = lr.predict(X_idx)
            mape_lr = float(np.mean(np.abs((y_vals - in_sample) / (y_vals + 1e-10))) * 100)

            results["linear_regression"] = {
                "slope": round(float(lr.coef_[0]), 4),
                "intercept": round(float(lr.intercept_), 4),
                "mape": round(mape_lr, 2),
            }

            last_date = pd.to_datetime(ts[date_col].iloc[-1], format="mixed", dayfirst=False, errors="coerce")
            for i, val in enumerate(lr_forecast):
                forecast_data.append({
                    "period": i + 1,
                    "date": str(last_date + pd.Timedelta(days=i + 1)),
                    "predicted": round(float(val), 2),
                    "model": "linear_regression",
                })
        except Exception as e:
            results["linear_regression"] = {"error": str(e)}

        # Method 2: Moving Average Forecast
        try:
            y_vals = ts[value_col].values.astype(float)
            window = min(7, len(y_vals) // 2)
            if window < 2:
                window = 2

            ma = pd.Series(y_vals).rolling(window, min_periods=1).mean()
            last_ma = float(ma.iloc[-1])

            # Simple MA forecast (flat projection of last MA value with trend)
            trend = float(np.mean(np.diff(ma.values[-window:])))

            last_date = pd.to_datetime(ts[date_col].iloc[-1], format="mixed", dayfirst=False, errors="coerce")
            for i in range(30):
                forecast_data.append({
                    "period": i + 1,
                    "date": str(last_date + pd.Timedelta(days=i + 1)),
                    "predicted": round(last_ma + trend * (i + 1), 2),
                    "model": "moving_average",
                })

            # MAPE
            in_sample_ma = ma.values
            mape_ma = float(np.mean(np.abs((y_vals - in_sample_ma) / (y_vals + 1e-10))) * 100)
            results["moving_average"] = {
                "window": window,
                "trend_per_period": round(trend, 4),
                "mape": round(mape_ma, 2),
            }
        except Exception as e:
            results["moving_average"] = {"error": str(e)}

        # Method 3: Auto-ARIMA (if available)
        if HAS_PMDARIMA:
            try:
                import pmdarima
                y_vals = ts[value_col].values.astype(float)
                arima = pmdarima.auto_arima(
                    y_vals, seasonal=False, stepwise=True,
                    suppress_warnings=True, error_action="ignore",
                    max_order=5, max_p=3, max_q=3,
                )
                fc_vals, conf_int = arima.predict(n_periods=30, return_conf_int=True)

                in_sample = arima.predict_in_sample()
                mape_arima = float(np.mean(np.abs((y_vals - in_sample) / (y_vals + 1e-10))) * 100)

                results["arima"] = {
                    "order": list(arima.order),
                    "aic": round(float(arima.aic()), 2),
                    "mape": round(mape_arima, 2),
                }

                last_date = pd.to_datetime(ts[date_col].iloc[-1], format="mixed", dayfirst=False, errors="coerce")
                for i, val in enumerate(fc_vals):
                    forecast_data.append({
                        "period": i + 1,
                        "date": str(last_date + pd.Timedelta(days=i + 1)),
                        "predicted": round(float(val), 2),
                        "lower": round(float(conf_int[i][0]), 2),
                        "upper": round(float(conf_int[i][1]), 2),
                        "model": "arima",
                    })
            except Exception as e:
                results["arima"] = {"error": str(e)}

        # Determine best model
        valid_models = {k: v for k, v in results.items() if "mape" in v and isinstance(v.get("mape"), (int, float))}
        best_model = min(valid_models, key=lambda k: valid_models[k]["mape"]) if valid_models else "linear_regression"
        best_mape = valid_models.get(best_model, {}).get("mape")

        return ForecastResult(
            models=results,
            best_model=best_model,
            best_mape=best_mape,
            forecast_data=forecast_data,
            date_col=date_col,
            value_col=value_col,
        )

    # ── Feature Importance (XGBoost + optional SHAP) ─────────────────────────

    async def run_feature_importance(
        self, df: pd.DataFrame, target_col: str
    ) -> FeatureImportanceResult:
        """XGBoost feature importance with optional SHAP."""
        loop = asyncio.get_event_loop()
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(max_workers=1) as executor:
            return await loop.run_in_executor(
                executor, self._feature_importance_sync, df, target_col
            )

    @staticmethod
    def _feature_importance_sync(df: pd.DataFrame, target_col: str) -> FeatureImportanceResult:
        import pandas as pd
        import numpy as np
        # Numeric features
        X_num = df.drop(columns=[target_col]).select_dtypes(include=np.number).fillna(0)
        
        # Categorical features
        cat_cols = [c for c in df.drop(columns=[target_col]).select_dtypes(exclude=np.number).columns if 1 < df[c].nunique() < 50]
        if cat_cols:
            X_cat = pd.get_dummies(df[cat_cols], drop_first=True, dtype=float)
            X = pd.concat([X_num, X_cat], axis=1)
        else:
            X = X_num
            
        y = df[target_col].fillna(df[target_col].median() if pd.api.types.is_numeric_dtype(df[target_col]) else df[target_col].mode()[0])

        if len(X.columns) < 2 or len(X) < 10:
            return FeatureImportanceResult(target_col=target_col)

        # Limit features
        if X.shape[1] > 50:
            X = X.iloc[:, :50]

        # Detect task type
        is_regression = pd.api.types.is_numeric_dtype(y) and y.nunique() > 10
        if not pd.api.types.is_numeric_dtype(y):
            from sklearn.preprocessing import LabelEncoder
            y = LabelEncoder().fit_transform(y.astype(str))

        performance_metrics = {}

        if HAS_XGB:
            import xgboost as xgb
            from sklearn.model_selection import train_test_split
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            
            if is_regression:
                model = xgb.XGBRegressor(
                    n_estimators=100, random_state=42, n_jobs=-1,
                    max_depth=6, learning_rate=0.1, verbosity=0,
                )
                model.fit(X_train, y_train)
                from sklearn.metrics import r2_score, mean_squared_error
                preds = model.predict(X_test)
                performance_metrics["R2"] = round(float(r2_score(y_test, preds)), 4)
                performance_metrics["RMSE"] = round(float(np.sqrt(mean_squared_error(y_test, preds))), 4)
            else:
                model = xgb.XGBClassifier(
                    n_estimators=100, random_state=42, n_jobs=-1,
                    max_depth=6, learning_rate=0.1, verbosity=0,
                    eval_metric="logloss",
                )
                model.fit(X_train, y_train)
                from sklearn.metrics import accuracy_score, f1_score
                preds = model.predict(X_test)
                performance_metrics["Accuracy"] = round(float(accuracy_score(y_test, preds)), 4)
                # handle multiclass or binary
                performance_metrics["F1"] = round(float(f1_score(y_test, preds, average="weighted")), 4)

            importance = dict(zip(X.columns, [round(float(v), 6) for v in model.feature_importances_]))
        else:
            # Fallback: correlation-based importance
            importance = {}
            for col in X.columns:
                try:
                    corr = abs(float(X[col].corr(y)))
                    importance[col] = round(corr, 6)
                except Exception:
                    importance[col] = 0.0

        # SHAP (if available)
        shap_values: Optional[dict[str, float]] = None
        if HAS_SHAP and HAS_XGB:
            try:
                import shap
                explainer = shap.Explainer(model, X.sample(min(500, len(X)), random_state=42))
                sv = explainer(X.sample(min(500, len(X)), random_state=42))
                shap_values = dict(zip(
                    X.columns,
                    [round(float(v), 6) for v in np.abs(sv.values).mean(axis=0)]
                ))
            except Exception as e:
                logger.warning(f"SHAP failed: {e}")

        # Top 5 drivers
        sorted_imp = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:5]

        return FeatureImportanceResult(
            feature_names=X.columns.tolist(),
            xgb_importance=importance,
            shap_mean_abs=shap_values,
            top_5_drivers=sorted_imp,
            target_col=target_col,
            model_performance=performance_metrics,
        )

    # ── Trend Analysis ───────────────────────────────────────────────────────

    async def run_trend_analysis(
        self, df: pd.DataFrame, date_col: str, value_col: str
    ) -> TrendResult:
        """Detect trend direction, change-points, and seasonality."""
        loop = asyncio.get_event_loop()
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(max_workers=1) as executor:
            return await loop.run_in_executor(
                executor, self._trend_sync, df, date_col, value_col
            )

    @staticmethod
    def _trend_sync(df: pd.DataFrame, date_col: str, value_col: str) -> TrendResult:
        import pandas as pd
        import numpy as np
        from sklearn.linear_model import LinearRegression
        try:
            ts = df.groupby(date_col)[value_col].sum().sort_index()
        except Exception:
            return TrendResult()

        if len(ts) < 5:
            return TrendResult()

        values = ts.values.astype(float)

        # Linear regression for trend
        X_idx = np.arange(len(values)).reshape(-1, 1)
        lr = LinearRegression()
        lr.fit(X_idx, values)
        slope = float(lr.coef_[0])

        # Determine direction
        if slope > 0:
            direction = "increasing"
        elif slope < 0:
            direction = "decreasing"
        else:
            direction = "no trend"

        # Optional Mann-Kendall
        mk_p = None
        mk_tau = None
        try:
            import pymannkendall
            mk_result = pymannkendall.original_test(values)
            direction = mk_result.trend
            mk_p = round(float(mk_result.p), 6)
            mk_tau = round(float(mk_result.Tau), 6)
        except ImportError:
            pass
        except Exception:
            pass

        # Seasonality (if statsmodels available)
        seasonality_strength = None
        if HAS_STATSMODELS_DECOMPOSE and len(ts) >= 24:
            try:
                from statsmodels.tsa.seasonal import seasonal_decompose
                period = min(12, len(ts) // 2)
                decomp = seasonal_decompose(ts, model="additive", period=period)
                if decomp.seasonal.std() > 0 and ts.std() > 0:
                    seasonality_strength = round(float(decomp.seasonal.std() / ts.std()), 4)
            except Exception:
                pass

        # Simple change-point detection via cumulative sum
        change_points: list[int] = []
        change_point_dates: list[str] = []
        try:
            residuals = values - lr.predict(X_idx)
            cusum = np.cumsum(residuals)
            # Find points where cusum changes direction significantly
            cusum_diff = np.diff(np.sign(np.diff(cusum)))
            change_indices = np.where(np.abs(cusum_diff) > 0.5)[0] + 1
            # Filter to significant changes only
            if len(change_indices) > 0:
                change_points = [int(cp) for cp in change_indices[:10]]
                dates = ts.index.tolist()
                change_point_dates = [str(dates[cp]) for cp in change_points if cp < len(dates)]
        except Exception:
            pass

        return TrendResult(
            trend_direction=direction,
            slope_per_period=round(slope, 6),
            mk_p_value=mk_p,
            mk_tau=mk_tau,
            seasonality_strength=seasonality_strength,
            change_points=change_points,
            change_point_dates=change_point_dates,
        )

    async def train_simulator_model(self, df: pd.DataFrame, target_col: str = "Profit") -> dict[str, Any]:
        """Train a regression model to powered what-if simulations."""
        import pandas as pd
        import numpy as np
        from sklearn.linear_model import LinearRegression
        logger.info(f"Training simulator model for target: {target_col}")
        
        # 1. Identify controllable features (numeric features that aren't the target or ID)
        numeric_df = df.select_dtypes(include=np.number)
        features = [c for c in numeric_df.columns if c != target_col and not any(kw in c.lower() for kw in ["id", "key", "code", "index"])]
        
        if not features or target_col not in df.columns:
            return {"error": "Insufficient features or missing target for simulation"}

        # 2. Prepare data
        X = numeric_df[features].fillna(0)
        y = numeric_df[target_col].fillna(0)
        
        # 3. Train Model (Simple Linear for high speed, XGB fallback)
        try:
            model = LinearRegression()
            model.fit(X, y)
            
            # Extract coefficients/weights for interpretability
            weights = {feat: float(coef) for feat, coef in zip(features, model.coef_)}
            intercept = float(model.intercept_)
            
            # Baseline performance
            r2 = float(model.score(X, y))
            
            # Store feature ranges to guide UI sliders
            ranges = {feat: {"min": float(X[feat].min()), "max": float(X[feat].max()), "mean": float(X[feat].mean())} for feat in features}
            
            return {
                "target": target_col,
                "features": features,
                "weights": weights,
                "intercept": intercept,
                "r2_score": r2,
                "feature_ranges": ranges,
                "status": "ready"
            }
        except Exception as e:
            logger.error(f"Simulator training failed: {e}")
            return {"error": str(e)}

    async def run_simulation(self, model_data: dict, adjustments: dict[str, float]) -> dict[str, Any]:
        """Apply adjustments to a trained model and predict the new outcome."""
        try:
            weights = model_data.get("weights", {})
            intercept = model_data.get("intercept", 0.0)
            ranges = model_data.get("feature_ranges", {})
            
            # Calculate predicted delta
            predicted_value = intercept
            for feat, weight in weights.items():
                # Use adjusted value if provided, else use the mean baseline
                val = adjustments.get(feat, ranges.get(feat, {}).get("mean", 0.0))
                predicted_value += weight * val
                
            return {
                "predicted_target": round(float(predicted_value), 2),
                "adjustments_made": adjustments,
                "status": "success"
            }
        except Exception as e:
            return {"error": str(e)}
