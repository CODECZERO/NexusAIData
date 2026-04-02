"""
Lumina AI v4.0 — Simulation Engine
Calculates "What-If" scenarios using relational modeling (XGBoost).
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import numpy as np
import pandas as pd
from typing import Any, Dict, List, Optional, Tuple, Union, TYPE_CHECKING, AsyncGenerator
import uuid
from loguru import logger

if TYPE_CHECKING:
    from models import (
        SimulationResult, SimulationScenario, ConstrainedScenarioResult, 
        ScenarioComparison, GoalSeekResult, OptimizationResult, 
        SensitivityScan, XAIExplanation, ScenarioDelta, SensitivityPoint, TornadoPoint
    )
from models import (
    SimulationResult, SimulationScenario, ConstrainedScenarioResult, 
    ScenarioComparison, GoalSeekResult, OptimizationResult, 
    SensitivityScan, XAIExplanation, ScenarioDelta, SensitivityPoint, TornadoPoint
)
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split

class SimulationEngine:
    """
    Engine for simulating business levers and predicting outcomes.
    Unlike forecasting (which is temporal), simulation is relational.
    """

    def __init__(self):
        self._models: Dict[str, Any] = {} # target_col -> model cache

    async def run_simulation(
        self, df: pd.DataFrame, target_col: str, custom_levers: Optional[Dict[str, float]] = None
    ) -> 'SimulationResult':
        """
        Run an advanced simulation with Monte Carlo probabilistic outcomes 
        and sensitivity analysis.
        """
        logger.info(f"Running advanced simulation on target: {target_col}")
        
        # 1. Prepare Data
        numeric_df = df.select_dtypes(include=[np.number]).fillna(0)
        if target_col not in numeric_df.columns:
            raise ValueError(f"Target column {target_col} must be numeric.")
            
        y = numeric_df[target_col]
        X = numeric_df.drop(columns=[target_col])
        
        if X.empty:
            raise ValueError("Not enough features to run a simulation.")

        # 2. Train / Get Model
        model, score = await self._train_simulator(X, y)
        baseline_avg = float(y.mean())
        
        results = SimulationResult(
            target_column=target_col,
            baseline_value=baseline_avg,
            model_score=score
        )

        # 3. Process Levers & Scenarios
        levers_to_process = custom_levers if custom_levers else {}
        
        if not custom_levers:
            feature_importances = pd.Series(model.feature_importances_, index=X.columns).sort_values(ascending=False)
            top_levers = feature_importances.head(2).index.tolist()
            for lever in top_levers:
                levers_to_process[lever] = 0.1 # Default +10% for auto-scenarios

        for lever, val in levers_to_process.items():
            # Scenario A: Probabilistic Predict (+10% or custom)
            scenario = await self._monte_carlo_simulate(
                model, X, target_col, {lever: val}, baseline_avg, is_relative=True
            )
            results.scenarios.append(scenario)
            
            # Sensitivity Scan for this lever
            scan = await self._run_sensitivity_scan(model, X, target_col, lever, baseline_avg)
            results.sensitivity_scans.append(scan)

        # 4. Correlation Analysis for "Secondary Impacts"
        corrs = numeric_df.corr()[target_col].abs().sort_values(ascending=False)
        top_correlated = corrs.drop(labels=[target_col]).head(3).index.tolist()
        
        for scenario in results.scenarios:
            for col in top_correlated:
                # Heuristic: if target changes X%, correlated col changes X% * correlation_strength
                c_val = float(numeric_df.corr().loc[scenario.lever_column, col])
                scenario.secondary_impacts.append({
                    "column": col,
                    "correlation": float(np.round(c_val, 2)),
                    "estimated_impact_pct": float(np.round(scenario.impact_pct * c_val, 1))
                })

        # 3. Prescriptive Strategy (New in Phase 6)
        optimization = await self.run_optimization(df, target_col)
        results.optimization = optimization
        
        # Add a prescriptive insight
        results.insights.append(
            f"STRATEGY: `{optimization.best_lever}` has the highest growth density. "
            f"A 1% increase yields a {optimization.max_roi_pct:.2f}% boost in `{target_col}`."
        )
        
        if optimization.diminishing_returns_start:
            results.insights.append(
                f"SATURATION: Watch for diminishing returns in `{optimization.best_lever}` "
                f"after a {optimization.diminishing_returns_start:.0f}% increase."
            )

        # 5. Tornado Data (Phase 10)
        results.tornado_chart = await self.calculate_tornado_data(df, target_col)
        
        # 6. Strategic Narrative (Phase 10)
        results.strategic_narrative = await self.generate_simulation_report(results)

        return results

    async def _train_simulator(self, X: pd.DataFrame, y: pd.Series) -> Tuple[Any, float]:
        """Train a fast regression model for simulation."""
        # Limit data for speed
        if len(X) > 10000:
            X_sample = X.sample(10000, random_state=42)
            y_sample = y.loc[X_sample.index]
        else:
            X_sample, y_sample = X, y

        X_train, X_test, y_train, y_test = train_test_split(X_sample, y_sample, test_size=0.2, random_state=42)
        
        model = XGBRegressor(
            n_estimators=50, # Fewer for speed
            max_depth=4,
            learning_rate=0.1,
            random_state=42,
            n_jobs=-1
        )
        
        await asyncio.to_thread(model.fit, X_train, y_train)
        score = float(model.score(X_test, y_test))
        
        return model, score

    async def _monte_carlo_simulate(
        self, 
        model: Any, 
        base_X: pd.DataFrame, 
        target: str, 
        levers: Dict[str, float], 
        baseline_avg: float,
        is_relative: bool = False,
        iterations: int = 50
    ) -> SimulationScenario:
        """Runs a Monte Carlo simulation to get distribution of outcomes."""
        
        # Seed for reproducibility
        np.random.seed(42)
        
        samples = []
        for _ in range(iterations):
            # Create simulation data with slight jitter (real world noise)
            sim_X = base_X.copy()
            for col, val in levers.items():
                if col in sim_X.columns:
                    # Add noise to the lever itself
                    noise = np.random.normal(0, 0.02) # 2% jitter
                    applied_val = val + noise if is_relative else val * (1 + noise)
                    
                    if is_relative:
                        sim_X[col] = sim_X[col] * (1 + applied_val)
                    else:
                        sim_X[col] = applied_val
            
            # Predict
            preds = model.predict(sim_X)
            # Add prediction noise (model uncertainty)
            pred_noise = np.random.normal(0, preds.std() * 0.05, size=preds.shape)
            samples.append(float((preds + pred_noise).mean()))
            
        sim_avg = float(np.mean(samples))
        low_bound = float(np.percentile(samples, 10))
        high_bound = float(np.percentile(samples, 90))
        
        impact_val = sim_avg - baseline_avg
        impact_pct = (impact_val / baseline_avg * 100) if baseline_avg != 0 else 0
        
        lever_str = ", ".join([f"{k} ({'+' if v>0 else ''}{v*100:.1f}%)" if is_relative else f"{k}={v}" for k, v in levers.items()])
        
        return SimulationScenario(
            scenario_id=str(uuid.uuid4())[:8],
            name=f"Scenario: {lever_str}",
            description=f"Probabilistic impact on {target} when adjusting {lever_str} (Monte Carlo, 50 iterations).",
            target_column=target,
            lever_column=list(levers.keys())[0] if levers else "none",
            change_value=float(np.mean(list(levers.values()))) if levers else 0.0,
            change_pct=float(np.mean(list(levers.values()))) * 100 if levers and is_relative else 0.0,
            impact_value=impact_val,
            impact_pct=impact_pct,
            confidence=0.8,
            uncertainty_range=(low_bound - baseline_avg, high_bound - baseline_avg),
            probabilistic_distribution=[float(x) for x in samples[:20]] # Return subset
        )

    async def run_goal_seek(
        self, df: pd.DataFrame, target_col: str, target_value: float, lever_col: str
    ) -> 'GoalSeekResult':
        """
        Inversion: Find the value for 'lever_col' that results in 'target_value'.
        Uses an iterative binary search on the predictive model.
        """
        
        numeric_df = df.select_dtypes(include=[np.number]).fillna(0)
        y = numeric_df[target_col]
        X = numeric_df.drop(columns=[target_col])
        
        model, _ = await self._train_simulator(X, y)
        baseline_avg = float(y.mean())
        
        # Initial bounds for search (lever min/max with 2x buffer)
        lever_min = float(X[lever_col].min()) * 0.5
        lever_max = float(X[lever_col].max()) * 2.0
        
        best_val = lever_min
        iterations = 0
        max_iters = 15
        
        # Binary search for monotonic relationship (heuristic)
        low, high = lever_min, lever_max
        for i in range(max_iters):
            iterations += 1
            mid = (low + high) / 2
            
            # Predict
            sim_X = X.copy()
            sim_X[lever_col] = mid
            pred = float(model.predict(sim_X).mean())
            
            if abs(pred - target_value) < abs(target_value) * 0.01: # 1% error tolerance
                best_val = mid
                break
            
            # Adjust bounds based on direction (assume monotonic)
            # Test a small step to see direction
            test_X = X.copy()
            test_X[lever_col] = mid + (mid * 0.01)
            test_pred = float(model.predict(test_X).mean())
            
            increasing = test_pred > pred
            if (pred < target_value and increasing) or (pred > target_value and not increasing):
                low = mid
            else:
                high = mid
            best_val = mid

        final_pred = float(pred)
        req_change = ((best_val - X[lever_col].mean()) / X[lever_col].mean() * 100) if X[lever_col].mean() != 0 else 0

        return GoalSeekResult(
            target_column=target_col,
            target_value=target_value,
            lever_column=lever_col,
            required_change_pct=req_change,
            predicted_outcome=final_pred,
            confidence=0.9,
            is_feasible=abs(final_pred - target_value) < abs(target_value) * 0.05,
            iterations=iterations
        )

    async def run_optimization(self, df: pd.DataFrame, target_col: str) -> 'OptimizationResult':
        """
        Identify the lever with the highest ROI (Impact per 1% change).
        """
        
        numeric_df = df.select_dtypes(include=[np.number]).fillna(0)
        y = numeric_df[target_col]
        X = numeric_df.drop(columns=[target_col])
        
        model, _ = await self._train_simulator(X, y)
        baseline_avg = float(y.mean())
        
        # Calculate ROI for all numeric columns
        roi_map = {}
        for col in X.columns:
            # Shift by 1%
            sim_X = X.copy()
            sim_X[col] = sim_X[col] * 1.01
            pred = float(model.predict(sim_X).mean())
            roi = (pred - baseline_avg) / baseline_avg if baseline_avg != 0 else 0
            roi_map[col] = abs(roi)
            
        best_lever = max(roi_map, key=roi_map.get)
        
        # Find "Diminishing Returns" point for best lever
        # (Where second derivative becomes negative)
        curve = []
        for change in np.linspace(0, 1.0, 11): # 0% to 100% increase
            test_X = X.copy()
            test_X[best_lever] = test_X[best_lever] * (1 + change)
            curve.append(float(model.predict(test_X).mean()))
            
        # Detect saturation
        dim_start = None
        for i in range(2, len(curve)):
            slope1 = curve[i-1] - curve[i-2]
            slope2 = curve[i] - curve[i-1]
            if slope2 < slope1 * 0.5: # 50% drop in marginal gain
                dim_start = (i/10) * 100 # Change %
                break

        return OptimizationResult(
            best_lever=best_lever,
            max_roi_pct=roi_map[best_lever] * 100,
            optimal_point=dim_start if dim_start else 50.0,
            diminishing_returns_start=dim_start
        )

    async def _run_sensitivity_scan(self, model, X, target, lever, baseline_avg):
        """Scan a range of values for a lever to see the trajectory of impact."""
        
        points = []
        # Scan from -50% to +50% in 10 steps
        for change in np.linspace(-0.5, 0.5, 11):
            sim_X = X.copy()
            sim_X[lever] = sim_X[lever].astype(float) * (1.0 + float(change))
            preds = model.predict(sim_X)
            sim_avg = float(preds.mean())
            impact_pct = ((sim_avg - baseline_avg) / baseline_avg * 100) if baseline_avg != 0 else 0
            points.append(SensitivityPoint(value=float(change) * 100, impact_pct=impact_pct))
                
        return SensitivityScan(column_name=lever, points=points)

    async def find_optimal_mix(
        self, 
        df: pd.DataFrame, 
        target_col: str, 
        constraints: Optional[Dict[str, Tuple[float, float]]] = None
    ) -> 'ConstrainedScenarioResult':
        """
        Multivariate Optimization: Find the best mix of multiple levers.
        Constraints: {col_name: (min_change_pct, max_change_pct)}
        """
        
        numeric_df = df.select_dtypes(include=[np.number]).fillna(0).astype(float)
        y = numeric_df[target_col]
        X = numeric_df.drop(columns=[target_col])
        
        model, _ = await self._train_simulator(X, y)
        baseline_avg = float(y.mean())
        
        # Levers to optimize (Top 3 by correlation/importance)
        corrs = X.corrwith(y).abs().sort_values(ascending=False)
        top_levers = corrs.index[:3].tolist()
        
        current_levers: Dict[str, float] = {l: 0.0 for l in top_levers}
        
        # Simple Hill Climbing / Coordinate Descent
        for _ in range(3): # 3 passes
            for lever in top_levers:
                best_impact = -float('inf')
                best_pct = current_levers[lever]
                
                # Try changes from -20% to +20% (or within constraints)
                l_min, l_max = -0.2, 0.2
                if constraints and lever in constraints:
                    l_min, l_max = constraints[lever][0]/100.0, constraints[lever][1]/100.0
                
                for step in np.linspace(l_min, l_max, 9):
                    temp_levers = current_levers.copy()
                    temp_levers[lever] = float(step)
                    
                    sim_X = X.copy()
                    for l, p in temp_levers.items():
                        sim_X[l] = sim_X[l] * (1.0 + float(p))
                    
                    pred = float(model.predict(sim_X).mean())
                    if pred > best_impact:
                        best_impact = pred
                        best_pct = float(step)
                
                current_levers[lever] = best_pct

        final_pred = best_impact
        improvement = (final_pred - baseline_avg) / baseline_avg * 100 if baseline_avg != 0 else 0
        
        # Generate XAI Explanations (simplified SHAP)
        explanations = []
        for l, p in current_levers.items():
            if abs(p) < 0.01: continue
            # Marginal contribution
            test_X = X.copy()
            for l2, p2 in current_levers.items():
                if l2 == l: continue
                test_X[l2] = test_X[l2] * (1.0 + float(p2))
            
            baseline_for_l = float(model.predict(test_X).mean())
            contrib = final_pred - baseline_for_l
            contrib_pct = (contrib / final_pred * 100) if final_pred != 0 else 0
            
            explanations.append(XAIExplanation(
                column=str(l),
                contribution_val=float(contrib),
                contribution_pct=float(contrib_pct),
                direction="positive" if contrib > 0 else "negative"
            ))

        return ConstrainedScenarioResult(
            target_column=target_col,
            levers={str(l): float(p) * 100 for l, p in current_levers.items()},
            predicted_outcome=float(final_pred),
            improvement_pct=float(improvement),
            constraints_satisfied=True,
            explanations=explanations
        )

    async def compare_scenarios(
        self, 
        s1: Union['SimulationScenario', 'ConstrainedScenarioResult'], 
        s2: Union['SimulationScenario', 'ConstrainedScenarioResult']
    ) -> 'ScenarioComparison':
        """Quantitative Delta: Compare two strategies head-to-head."""
        
        target = s1.target_column
        outcome_delta = ((s2.predicted_outcome - s1.predicted_outcome) / s1.predicted_outcome * 100) if s1.predicted_outcome != 0 else 0
        
        # Calculate lever deltas
        levers1 = s1.levers if hasattr(s1, 'levers') else {s1.lever_column: s1.change_pct}
        levers2 = s2.levers if hasattr(s2, 'levers') else {s2.lever_column: s2.change_pct}
        
        all_levers = set(levers1.keys()) | set(levers2.keys())
        lever_deltas = []
        for l in all_levers:
            v1 = levers1.get(l, 0.0)
            v2 = levers2.get(l, 0.0)
            lever_deltas.append(ScenarioDelta(
                lever=l,
                delta_val=v2 - v1,
                delta_pct=v2 - v1 # In this context val and pct are similar for % changes
            ))
            
        return ScenarioComparison(
            baseline_id=getattr(s1, 'scenario_id', 'baseline'),
            challenger_id=getattr(s2, 'scenario_id', 'challenger'),
            target_column=target,
            outcome_delta_pct=outcome_delta,
            lever_deltas=lever_deltas,
            winner_id=getattr(s2, 'scenario_id', 'challenger') if outcome_delta > 0 else getattr(s1, 'scenario_id', 'baseline')
        )
    async def find_multi_objective_mix(
        self, 
        df: pd.DataFrame, 
        targets: Dict[str, float],
        constraints: Optional[Dict[str, Tuple[float, float]]] = None
    ) -> 'ConstrainedScenarioResult':
        """
        Phase 9: Multi-Objective Optimization.
        Finds a mix that balances multiple weighted targets.
        'targets' is {column_name: weight} (-1.0 to 1.0).
        """
        numeric_df = df.select_dtypes(include=[np.number]).fillna(0).astype(float)
        corr_matrix = numeric_df.corr()
        
        # Identify levers (columns not in targets and highly correlated to at least one target)
        levers = [c for c in numeric_df.columns if c not in targets.keys()]
        
        # Filter levers by importance (avg absolute correlation across targets)
        lever_scores = {}
        for l in levers:
            avg_corr = np.mean([abs(float(corr_matrix.loc[l, t])) for t in targets.keys()])
            lever_scores[l] = avg_corr
        
        # Top 5 most influential levers
        top_levers = sorted(lever_scores, key=lever_scores.get, reverse=True)[:5]
        
        current_mix = {l: 0.0 for l in top_levers}
        
        # Iterative Coordinate Descent for Composite Score
        for _ in range(5):
            for lever in top_levers:
                best_step = 0.0
                best_score_gain = -1.0
                
                # Check -10%, 0, +10%
                for step in [-0.1, 0.1]:
                    score_gain = 0.0
                    for t, weight in targets.items():
                        corr = float(corr_matrix.loc[lever, t])
                        # Normalize: improvement is positive if (step * corr * weight) > 0
                        score_gain += (step * corr * weight)
                    
                    # Apply constraints if any
                    if constraints and lever in constraints:
                        low, high = constraints[lever]
                        new_val = current_mix[lever] + step
                        if new_val < low or new_val > high:
                            continue

                    if score_gain > best_score_gain:
                        best_score_gain = score_gain
                        best_step = step
                
                current_mix[lever] = float(np.clip(float(current_mix[lever]) + best_step, -0.5, 0.5))

        # Calculate Results & Trade-offs
        explanations = []
        overall_improvement = 0.0
        
        for t, weight in targets.items():
            t_impact = sum([current_mix[l] * float(corr_matrix.loc[l, t]) for l in top_levers])
            overall_improvement += (t_impact * weight)
            explanations.append(XAIExplanation(
                column=t,
                contribution_pct=float(t_impact * 100),
                direction="improvement" if (t_impact * weight) > 0 else "degradation"
            ))

        return ConstrainedScenarioResult(
            scenario_id=f"MultiObj_{uuid.uuid4().hex[:4]}",
            improvement_pct=float(overall_improvement * 100),
            levers={k: v*100 for k, v in current_mix.items() if v != 0},
            explanations=explanations,
            constraints_applied=list(constraints.keys()) if (constraints and hasattr(constraints, 'keys')) else []
        )

    async def calculate_tornado_data(self, df: pd.DataFrame, target_col: str) -> List[TornadoPoint]:
        """Phase 10: Tornado Chart Data: variation of target metric by lever."""
        
        numeric_df = df.select_dtypes(include=[np.number]).fillna(0)
        if target_col not in numeric_df.columns:
            return []
            
        y = numeric_df[target_col]
        X = numeric_df.drop(columns=[target_col])
        
        if X.empty:
            return []

        model, _ = await self._train_simulator(X, y)
        baseline_avg = float(y.mean())
        if baseline_avg == 0:
            return []

        feature_importances = pd.Series(model.feature_importances_, index=X.columns).sort_values(ascending=False)
        top_levers = feature_importances.head(8).index.tolist()
        
        points = []
        for lever in top_levers:
            low_sim = await self._monte_carlo_simulate(model, X, target_col, {lever: -0.1}, baseline_avg, is_relative=True)
            high_sim = await self._monte_carlo_simulate(model, X, target_col, {lever: 0.1}, baseline_avg, is_relative=True)
            
            points.append(TornadoPoint(
                lever=lever,
                low_impact=float(low_sim.impact_pct),
                high_impact=float(high_sim.impact_pct),
                baseline=0.0
            ))
            
        return sorted(points, key=lambda p: abs(p.high_impact - p.low_impact), reverse=True)

    async def calculate_tradeoffs(self, mix: 'ConstrainedScenarioResult') -> List[str]:
        """Quantify and narrate conflicting goals in a multi-objective scenario."""
        tradeoffs = []
        improvements = [e for e in mix.explanations if e.direction == "improvement"]
        degradations = [e for e in mix.explanations if e.direction == "degradation"]
        
        if improvements and degradations:
            top_gain = max(improvements, key=lambda x: abs(x.contribution_pct))
            top_loss = max(degradations, key=lambda x: abs(x.contribution_pct))
            tradeoffs.append(f"⚖️ **Trade-off Alert**: To achieve a **{top_gain.contribution_pct:+.1f}%** gain in `{top_gain.column}`, the strategy accepts a **{top_loss.contribution_pct:+.1f}%** drop in `{top_loss.column}`.")
        elif degradations:
            tradeoffs.append("⚠️ **Conflict Note**: This strategy prioritized constraints over optimization, leading to sub-optimal outcomes for some targets.")
            
        return tradeoffs

    async def generate_simulation_report(self, results: 'SimulationResult') -> str:
        """Create a professional Analyst Report for stakeholders."""
        report = []
        report.append(f"# 📊 Strategic Analyst Report: {results.target_column}")
        report.append(f"*Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n")
        
        report.append("## 🎯 Executive Summary")
        baseline = results.baseline_value
        report.append(f"Current `{results.target_column}` Baseline: **{baseline:,.2f}**")
        
        if results.constrained_results:
            best = max(results.constrained_results, key=lambda x: x.improvement_pct)
            report.append(f"\n🚀 **Primary Recommendation**: Implement Strategy `{best.scenario_id}`. ")
            report.append(f"Projected Improvement: **{best.improvement_pct:+.1f}%**\n")
            
            report.append("### 🧠 Causal Attribution (SHAP Analysis)")
            for xai in best.explanations:
                report.append(f"- **{xai.column}**: {xai.direction.capitalize()} pressure ({xai.contribution_pct:+.1f}% impact)")

        if results.insights:
            report.append("\n## 🛡️ Analyst Guardrails & Data Health")
            for insight in results.insights:
                report.append(f"- {insight}")

        report.append("\n## 📈 Scenario Analysis Table")
        report.append("| Scenario | Change % | Predicted Outcome | Status |")
        report.append("| :--- | :--- | :--- | :--- |")
        for s in results.scenarios:
            report.append(f"| {s.name} | {s.impact_pct:+.1f}% | {s.predicted_outcome:,.0f} | Balanced |")
            
        report.append("\n\n---\n*Disclaimer: These simulations use Gradient Boosted decision trees and Monte Carlo sampling. Statistical confidence is ~80%.*")
        return "\n".join(report)

    def find_best_column_match(self, user_term: str, columns: List[str]) -> Optional[str]:
        """Fuzzy match user terms to data columns for 'Natural Language Levers'."""
        user_term = user_term.lower().strip()
        if user_term in [c.lower() for c in columns]:
            return columns[[c.lower() for c in columns].index(user_term)]
        for col in columns:
            if user_term in col.lower() or col.lower() in user_term:
                return col
        aliases = {
            "price": ["unit_price", "mrp", "cost", "pricing"],
            "marketing": ["ad_spend", "marketing_spend", "promotions"],
            "sales": ["revenue", "turnover", "gross_sales"],
            "volume": ["quantity", "units", "count"]
        }
        for canonical, variants in aliases.items():
            if user_term == canonical:
                for v in variants:
                    match = self.find_best_column_match(v, columns)
                    if match: return match
        return None
