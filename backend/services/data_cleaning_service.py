import pandas as pd
import numpy as np
from typing import List, Dict, Any
from models import DataHealthIssue, DataHealthReport, CleaningAction
from services.ai_service import AIService
from loguru import logger

class DataCleaningService:
    def __init__(self):
        self.ai_service = AIService()

    async def analyze_health(self, df: pd.DataFrame, session_id: str) -> DataHealthReport:
        """Analyze the health of the dataframe and return a report."""
        issues = []
        total_rows = len(df)
        
        # 1. Check for missing values
        missing_counts = df.isnull().sum()
        for col, count in missing_counts.items():
            if count > 0:
                pct = (count / total_rows) * 100
                severity = 'high' if pct > 20 else 'medium' if pct > 5 else 'low'
                issues.append(DataHealthIssue(
                    column=str(col),
                    severity=severity,
                    issue_type='missing',
                    description=f"Column `{col}` has {count} missing values ({pct:.1f}%).",
                    suggested_fix=f"Impute missing values in `{col}` using median or mean.",
                    affected_rows_pct=pct
                ))

        # 2. Check for outliers (Numerical only)
        num_cols = df.select_dtypes(include=[np.number]).columns
        for col in num_cols:
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr
            
            outliers = df[(df[col] < lower_bound) | (df[col] > upper_bound)]
            count = len(outliers)
            if count > 0:
                pct = (count / total_rows) * 100
                severity = 'medium' if pct > 10 else 'low'
                issues.append(DataHealthIssue(
                    column=str(col),
                    severity=severity,
                    issue_type='outliers',
                    description=f"Column `{col}` has {count} statistical outliers ({pct:.1f}%).",
                    suggested_fix=f"Clip outliers in `{col}` to 1.5x IQR bounds.",
                    affected_rows_pct=pct
                ))

        # 3. Check for high cardinality (Categorical)
        cat_cols = df.select_dtypes(include=['object', 'category']).columns
        for col in cat_cols:
            unique_count = df[col].nunique()
            if unique_count > (total_rows * 0.5) and total_rows > 50:
                issues.append(DataHealthIssue(
                    column=str(col),
                    severity='medium',
                    issue_type='high_cardinality',
                    description=f"Column `{col}` has very high cardinality ({unique_count} unique values).",
                    suggested_fix=f"Group rare categories in `{col}` or drop if it's an ID.",
                    affected_rows_pct=100.0
                ))

        # Calculate overall score
        score = 100.0
        if issues:
            deductions = {
                'critical': 25,
                'high': 15,
                'medium': 5,
                'low': 2
            }
            total_deduction = sum(deductions.get(i.severity, 0) for i in issues)
            score = max(0, 100 - total_deduction)

        return DataHealthReport(
            session_id=session_id,
            overall_score=score,
            issues=issues
        )

    async def apply_actions(self, df: pd.DataFrame, actions: List[CleaningAction]) -> pd.DataFrame:
        """Apply cleaning actions to the dataframe."""
        df_clean = df.copy()
        
        for action_obj in actions:
            col = action_obj.parameters.get('column')
            if not col or col not in df_clean.columns:
                continue
                
            action = action_obj.action
            if action == 'impute_median':
                df_clean[col] = df_clean[col].fillna(df_clean[col].median())
            elif action == 'impute_mean':
                df_clean[col] = df_clean[col].fillna(df_clean[col].mean())
            elif action == 'clip_outliers':
                q1 = df_clean[col].quantile(0.25)
                q3 = df_clean[col].quantile(0.75)
                iqr = q3 - q1
                lower = q1 - 1.5 * iqr
                upper = q3 + 1.5 * iqr
                df_clean[col] = df_clean[col].clip(lower, upper)
            elif action == 'drop':
                df_clean = df_clean.drop(columns=[col])
                
        return df_clean

    async def agentic_feature_engineering(self, df: pd.DataFrame, goal: str) -> pd.DataFrame:
        """Use AI to generate code for a new feature and apply it."""
        columns = list(df.columns)
        prompt = f"""You are a Data Engineering Assistant.
Given a pandas DataFrame with columns: {columns}
The user wants to create a new feature: "{goal}"

Generate a valid Python pandas expression that can be used with `df.eval()`.
The expression should follow the format: `new_column_name = some_calculation_using_existing_columns`

Return ONLY the expression. No explanation, no backticks.
Example: Total_Revenue = Price * Quantity
"""
        expression = await self.ai_service.get_completion(prompt)
        # Clean the expression: remove backticks, markdown code blocks, and extra whitespace
        expression = expression.strip().replace('`', '')
        if '```' in expression:
             # Try to extract content between triple backticks if they exist
             lines = expression.split('\n')
             content_lines = [line for line in lines if not line.strip().startswith('```')]
             expression = ' '.join(content_lines).strip()

        try:
            # We use eval for simplicity in this phase
            df_new = df.copy()
            df_new.eval(expression, inplace=True)
            logger.info(f"Successfully created new feature: {expression}")
            return df_new
        except Exception as e:
            logger.error(f"Failed to engineer feature with AI expression '{expression}': {e}")
            return df
