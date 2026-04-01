"""
Lumina AI v4.0 — Tier 1.5: Hypothesis Tester
Automated statistical significance testing for Data Analysts.
"""

from __future__ import annotations

import asyncio
from typing import Any, TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    import numpy as np
    import pandas as pd

from models import HypothesisTestResult

class HypothesisTester:
    """Automated statistical significance testing."""

    async def run_all_tests(self, df: pd.DataFrame) -> list[HypothesisTestResult]:
        """Automatically find and run relevant tests between categorical and numeric columns."""
        import pandas as pd
        import numpy as np
        from concurrent.futures import ProcessPoolExecutor
        
        # Initialize executor lazily at the function level
        executor = ProcessPoolExecutor(max_workers=4)
        try:
            loop = asyncio.get_event_loop()
            
            # Limit processing for speed
            if len(df) > 50000:
                df_sampled = df.sample(50000, random_state=42)
            else:
                df_sampled = df
    
            num_cols = df_sampled.select_dtypes(include=[np.number]).columns.tolist()
            cat_cols = df_sampled.select_dtypes(include=["object", "category", "bool"]).columns.tolist()
    
            # Only check categories with 2-10 unique values (to find interesting segments)
            good_cats = [c for c in cat_cols if 2 <= df_sampled[c].nunique() <= 10]
            
            results = []
            
            # 1. Categorical (Group) vs Numeric (Value) -> T-Test or ANOVA
            for cat in good_cats:
                for num in num_cols:
                    try:
                        res = await loop.run_in_executor(executor, self._test_cat_vs_num, df_sampled, cat, num)
                        if res:
                            results.append(res)
                    except Exception as e:
                        logger.debug(f"Hypothesis test failed for {cat} vs {num}: {e}")
    
            # 2. Categorical vs Categorical -> Chi-Square
            if len(good_cats) >= 2:
                for i in range(len(good_cats)):
                    for j in range(i + 1, len(good_cats)):
                        try:
                            res = await loop.run_in_executor(executor, self._test_cat_vs_cat, df_sampled, good_cats[i], good_cats[j])
                            if res:
                                results.append(res)
                        except Exception as e:
                            logger.debug(f"Chi-square failed for {good_cats[i]} vs {good_cats[j]}: {e}")
    
            # Return top results sorted by significance (p-value)
            return sorted(results, key=lambda x: x.p_value)[:15]
        finally:
            executor.shutdown(wait=False)
        

    @staticmethod
    def _test_cat_vs_num(df: pd.DataFrame, cat_col: str, num_col: str) -> HypothesisTestResult | None:
        """Perform Group comparison tests (T-Test or ANOVA)."""
        import pandas as pd
        import numpy as np
        from scipy import stats
        groups = df.groupby(cat_col)[num_col].apply(list).to_dict()
        
        # Filter out groups with < 5 samples
        groups = {k: v for k, v in groups.items() if len(v) >= 5}
        if len(groups) < 2:
            return None

        # Determine test type
        if len(groups) == 2:
            # Independent T-Test
            g_names = list(groups.keys())
            t_stat, p_val = stats.ttest_ind(groups[g_names[0]], groups[g_names[1]], equal_var=False)
            test_name = "Welch's T-Test"
            interpretation = (
                f"There is a {'significant' if p_val < 0.05 else 'non-significant'} difference in "
                f"'{num_col}' between '{g_names[0]}' and '{g_names[1]}'."
            )
        else:
            # One-way ANOVA
            f_stat, p_val = stats.f_oneway(*groups.values())
            test_name = "One-way ANOVA"
            interpretation = (
                f"Statistical evidence suggests that average '{num_col}' values "
                f"{'differ significantly' if p_val < 0.05 else 'do not differ significantly'} across groups in '{cat_col}'."
            )

        if np.isnan(p_val):
            return None

        return HypothesisTestResult(
            test_name=test_name,
            statistic=float(t_stat if len(groups) == 2 else f_stat),
            p_value=float(p_val),
            is_significant=bool(p_val < 0.05),
            description=f"Comparison of '{num_col}' across '{cat_col}' groups",
            column_a=cat_col,
            column_b=num_col,
            target_groups=[str(k) for k in groups.keys()],
            interpretation=interpretation
        )

    @staticmethod
    def _test_cat_vs_cat(df: pd.DataFrame, col_a: str, col_b: str) -> HypothesisTestResult | None:
        """Perform Categorical independence test (Chi-Square)."""
        import pandas as pd
        import numpy as np
        from scipy import stats
        contingency_table = pd.crosstab(df[col_a], df[col_b])
        
        # Chi-square requirements
        if contingency_table.size < 4:
            return None
            
        chi2, p, dof, expected = stats.chi2_contingency(contingency_table)
        
        if np.isnan(p):
            return None

        return HypothesisTestResult(
            test_name="Chi-Square Independence",
            statistic=float(chi2),
            p_value=float(p),
            is_significant=bool(p < 0.05),
            description=f"Independence test between '{col_a}' and '{col_b}'",
            column_a=col_a,
            column_b=col_b,
            interpretation=(
                f"'{col_a}' and '{col_b}' are {'likely dependent' if p < 0.05 else 'likely independent'} "
                f"(p = {p:.4f})."
            )
        )
