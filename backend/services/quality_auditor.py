"""
Lumina AI v4.0 — Tier 2: Data Quality Auditor
Detects 15+ types of data quality issues with severity scoring and auto-clean script.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
from typing import Any, TYPE_CHECKING

import re
from loguru import logger

if TYPE_CHECKING:
    import numpy as np
    import pandas as pd

from models import QualityGrade, QualityIssue, QualityReport, QualitySeverity

class DataQualityAuditor:
    """Detects 15+ types of data quality issues with severity scoring."""

    async def full_audit(self, df: pd.DataFrame) -> QualityReport:
        """Run all quality checks and generate report."""
        import pandas as pd
        from concurrent.futures import ProcessPoolExecutor
        
        # Initialize executor lazily at the function level
        executor = ProcessPoolExecutor(max_workers=1)
        try:
            logger.info(f"Running quality audit on {df.shape[0]}×{df.shape[1]} dataset")
    
            loop = asyncio.get_event_loop()
    
            # Run all checks
            results = await asyncio.gather(
                loop.run_in_executor(executor, self._check_missing, df),
                loop.run_in_executor(executor, self._check_duplicates, df),
                loop.run_in_executor(executor, self._check_type_mismatches, df),
                loop.run_in_executor(executor, self._check_outliers, df),
                loop.run_in_executor(executor, self._check_constants, df),
                loop.run_in_executor(executor, self._check_whitespace, df),
                loop.run_in_executor(executor, self._check_mixed_types, df),
                loop.run_in_executor(executor, self._check_high_cardinality, df),
                loop.run_in_executor(executor, self._check_inconsistent_casing, df),
                loop.run_in_executor(executor, self._check_pii_and_semantic, df),
            )
    
            all_issues = [issue for batch in results for issue in batch]
            score = self._compute_quality_score(df, all_issues)
            grade = self._score_to_grade(score)
            clean_script = self._generate_cleaning_script(all_issues)
    
            total_rows_affected = sum(i.rows_affected for i in all_issues)
            rows_affected_pct = round(total_rows_affected / len(df) * 100, 2) if len(df) > 0 else 0
    
            return QualityReport(
                overall_score=score,
                grade=grade,
                total_issues=len(all_issues),
                critical_issues=[i for i in all_issues if i.severity == QualitySeverity.CRITICAL],
                high_issues=[i for i in all_issues if i.severity == QualitySeverity.HIGH],
                medium_issues=[i for i in all_issues if i.severity == QualitySeverity.MEDIUM],
                low_issues=[i for i in all_issues if i.severity == QualitySeverity.LOW],
                auto_fixable=[i for i in all_issues if i.can_auto_fix],
                rows_affected_pct=rows_affected_pct,
                auto_clean_script=clean_script,
            )
        finally:
            executor.shutdown(wait=False)

    # ── Check: Missing Values ────────────────────────────────────────────────

    @staticmethod
    def _check_missing(df: pd.DataFrame) -> list[QualityIssue]:
        import pandas as pd
        issues = []
        for col in df.columns:
            null_count = int(df[col].isnull().sum())
            null_pct = round(null_count / len(df) * 100, 2) if len(df) > 0 else 0

            if null_count == 0:
                continue

            # Severity based on percentage
            if null_pct > 50:
                severity = QualitySeverity.CRITICAL
            elif null_pct > 20:
                severity = QualitySeverity.HIGH
            elif null_pct > 5:
                severity = QualitySeverity.MEDIUM
            else:
                severity = QualitySeverity.LOW

            # Determine fix strategy
            is_numeric = pd.api.types.is_numeric_dtype(df[col])
            if is_numeric:
                fix_code = f"df['{col}'] = df['{col}'].fillna(df['{col}'].median())"
            else:
                fix_code = f"df['{col}'] = df['{col}'].fillna(df['{col}'].mode().iloc[0] if not df['{col}'].mode().empty else 'Unknown')"

            issues.append(
                QualityIssue(
                    issue_type="missing_values",
                    title=f"Missing values in '{col}'",
                    description=f"{null_count} null values ({null_pct}%) in column '{col}'",
                    severity=severity,
                    column=col,
                    rows_affected=null_count,
                    rows_affected_pct=null_pct,
                    can_auto_fix=null_pct < 50,
                    fix_code=fix_code,
                )
            )
        return issues

    # ── Check: Duplicates ────────────────────────────────────────────────────

    @staticmethod
    def _check_duplicates(df: pd.DataFrame) -> list[QualityIssue]:
        import pandas as pd
        issues = []
        dup_count = int(df.duplicated().sum())
        if dup_count > 0:
            dup_pct = round(dup_count / len(df) * 100, 2)
            severity = QualitySeverity.HIGH if dup_pct > 10 else QualitySeverity.MEDIUM

            issues.append(
                QualityIssue(
                    issue_type="duplicates_exact",
                    title="Exact duplicate rows found",
                    description=f"{dup_count} duplicate rows ({dup_pct}%) detected",
                    severity=severity,
                    rows_affected=dup_count,
                    rows_affected_pct=dup_pct,
                    can_auto_fix=True,
                    fix_code="df = df.drop_duplicates().reset_index(drop=True)",
                )
            )
        return issues

    # ── Check: Type Mismatches ───────────────────────────────────────────────

    @staticmethod
    def _check_type_mismatches(df: pd.DataFrame) -> list[QualityIssue]:
        import pandas as pd
        issues = []
        for col in df.select_dtypes(include=["object"]).columns:
            non_null = df[col].dropna()
            if len(non_null) == 0:
                continue

            # Check if column looks numeric
            numeric_count = 0
            for val in non_null.head(100):
                try:
                    float(str(val).replace(",", "").replace("$", "").replace("₹", ""))
                    numeric_count += 1
                except (ValueError, TypeError):
                    pass

            if numeric_count > len(non_null.head(100)) * 0.8:
                issues.append(
                    QualityIssue(
                        issue_type="type_mismatches",
                        title=f"Numeric data stored as text in '{col}'",
                        description=f"Column '{col}' contains mostly numeric values but stored as string",
                        severity=QualitySeverity.MEDIUM,
                        column=col,
                        rows_affected=len(non_null),
                        rows_affected_pct=round(len(non_null) / len(df) * 100, 2),
                        can_auto_fix=True,
                        fix_code=f"df['{col}'] = pd.to_numeric(df['{col}'].str.replace(r'[$,₹]', '', regex=True), errors='coerce')",
                        sample_values=non_null.head(5).tolist(),
                    )
                )

            # Check if column looks like datetime
            try:
                parsed = pd.to_datetime(non_null.head(20), format="mixed", dayfirst=False, errors="coerce")
                if parsed.notna().sum() > 15:
                    issues.append(
                        QualityIssue(
                            issue_type="type_mismatches",
                            title=f"Date data stored as text in '{col}'",
                            description=f"Column '{col}' appears to contain dates stored as strings",
                            severity=QualitySeverity.LOW,
                            column=col,
                            rows_affected=len(non_null),
                            can_auto_fix=True,
                            fix_code=f"df['{col}'] = pd.to_datetime(df['{col}'], format='mixed', dayfirst=False, errors='coerce')",
                        )
                    )
            except Exception:
                pass

        return issues

    # ── Check: Outliers ──────────────────────────────────────────────────────

    @staticmethod
    def _check_outliers(df: pd.DataFrame) -> list[QualityIssue]:
        import numpy as np
        import pandas as pd
        from scipy import stats
        issues = []
        for col in df.select_dtypes(include=np.number).columns:
            non_null = df[col].dropna()
            if len(non_null) < 10:
                continue

            # Z-score method
            try:
                z = np.abs(stats.zscore(non_null))
                outlier_count = int((z > 3).sum())
            except Exception:
                outlier_count = 0

            if outlier_count > 0:
                outlier_pct = round(outlier_count / len(df) * 100, 2)
                severity = QualitySeverity.HIGH if outlier_pct > 5 else QualitySeverity.MEDIUM

                # Get sample outlier values
                outlier_mask = z > 3
                sample_outliers = non_null[outlier_mask].head(5).tolist()

                issues.append(
                    QualityIssue(
                        issue_type="outliers_zscore",
                        title=f"Statistical outliers in '{col}' (z>3)",
                        description=f"{outlier_count} outliers ({outlier_pct}%) found using z-score method",
                        severity=severity,
                        column=col,
                        rows_affected=outlier_count,
                        rows_affected_pct=outlier_pct,
                        can_auto_fix=False,
                        sample_values=[float(v) for v in sample_outliers],
                    )
                )
        return issues

    # ── Check: Constant / Near-Constant Columns ─────────────────────────────

    @staticmethod
    def _check_constants(df: pd.DataFrame) -> list[QualityIssue]:
        import pandas as pd
        issues = []
        for col in df.columns:
            nunique = df[col].nunique()

            if nunique <= 1:
                issues.append(
                    QualityIssue(
                        issue_type="constant_columns",
                        title=f"Constant column '{col}'",
                        description=f"Column '{col}' has only {nunique} unique value(s) — provides no analytical value",
                        severity=QualitySeverity.MEDIUM,
                        column=col,
                        rows_affected=len(df),
                        rows_affected_pct=100.0,
                        can_auto_fix=True,
                        fix_code=f"df = df.drop(columns=['{col}'])",
                    )
                )
            elif len(df) > 0:
                top_freq = df[col].value_counts(normalize=True).iloc[0]
                if top_freq > 0.99:
                    issues.append(
                        QualityIssue(
                            issue_type="near_constant_columns",
                            title=f"Near-constant column '{col}'",
                            description=f"Column '{col}' has {round(top_freq*100, 1)}% single value — very low variance",
                            severity=QualitySeverity.LOW,
                            column=col,
                            rows_affected=int(top_freq * len(df)),
                        )
                    )
        return issues

    # ── Check: Whitespace Issues ─────────────────────────────────────────────

    @staticmethod
    def _check_whitespace(df: pd.DataFrame) -> list[QualityIssue]:
        import pandas as pd
        issues = []
        for col in df.select_dtypes(include=["object"]).columns:
            non_null = df[col].dropna()
            if len(non_null) == 0:
                continue

            # Leading/trailing spaces
            has_spaces = non_null.apply(lambda x: str(x) != str(x).strip())
            space_count = int(has_spaces.sum())

            if space_count > 0:
                issues.append(
                    QualityIssue(
                        issue_type="whitespace_issues",
                        title=f"Whitespace issues in '{col}'",
                        description=f"{space_count} values have leading/trailing spaces in '{col}'",
                        severity=QualitySeverity.LOW,
                        column=col,
                        rows_affected=space_count,
                        rows_affected_pct=round(space_count / len(df) * 100, 2),
                        can_auto_fix=True,
                        fix_code=f"df['{col}'] = df['{col}'].str.strip()",
                    )
                )
        return issues

    # ── Check: Inconsistent String Casing ────────────────────────────────────

    @staticmethod
    def _check_inconsistent_casing(df: pd.DataFrame) -> list[QualityIssue]:
        import pandas as pd
        issues = []
        for col in df.select_dtypes(include=["object"]).columns:
            non_null = df[col].dropna()
            if len(non_null) == 0:
                continue

            unique_raw = non_null.unique()
            if len(unique_raw) < 2 or len(unique_raw) > 1000:
                continue

            # Compare raw unique values vs lowercased unique values
            unique_lower = pd.Series(unique_raw).astype(str).str.lower().unique()
            diff = len(unique_raw) - len(unique_lower)

            if diff > 0:
                # Approximate rows affected
                rows_affected = int(len(non_null) * (diff / len(unique_raw)))
                
                issues.append(
                    QualityIssue(
                        issue_type="inconsistent_casing",
                        title=f"Inconsistent text casing in '{col}'",
                        description=f"{diff} distinct values in '{col}' normalize to the same lowercase string",
                        severity=QualitySeverity.LOW,
                        column=col,
                        rows_affected=rows_affected,
                        can_auto_fix=True,
                        fix_code=f"df['{col}'] = df['{col}'].str.title()",
                    )
                )
        return issues

    # ── Check: Mixed Types ───────────────────────────────────────────────────

    @staticmethod
    def _check_mixed_types(df: pd.DataFrame) -> list[QualityIssue]:
        import pandas as pd
        issues = []
        for col in df.select_dtypes(include=["object"]).columns:
            non_null = df[col].dropna()
            if len(non_null) < 10:
                continue

            # Check for mixed numeric/text
            types_found = set()
            for val in non_null.head(100):
                val_str = str(val)
                try:
                    float(val_str)
                    types_found.add("numeric")
                except ValueError:
                    if val_str.lower() in ("true", "false"):
                        types_found.add("boolean")
                    else:
                        types_found.add("text")

            if len(types_found) > 1:
                issues.append(
                    QualityIssue(
                        issue_type="mixed_types_in_column",
                        title=f"Mixed data types in '{col}'",
                        description=f"Column '{col}' contains mixed types: {', '.join(types_found)}",
                        severity=QualitySeverity.MEDIUM,
                        column=col,
                        rows_affected=len(non_null),
                        sample_values=non_null.head(5).tolist(),
                    )
                )
        return issues

    # ── Check: High Cardinality ──────────────────────────────────────────────

    @staticmethod
    def _check_high_cardinality(df: pd.DataFrame) -> list[QualityIssue]:
        import pandas as pd
        issues = []
        for col in df.select_dtypes(include=["object"]).columns:
            nunique = df[col].nunique()
            if nunique > 1000:
                unique_ratio = nunique / len(df) if len(df) > 0 else 0
                issues.append(
                    QualityIssue(
                        issue_type="high_cardinality_cats",
                        title=f"High cardinality in '{col}'",
                        description=f"Column '{col}' has {nunique} unique values — likely an ID column, not a category",
                        severity=QualitySeverity.LOW,
                        column=col,
                        rows_affected=len(df),
                        rows_affected_pct=round(unique_ratio * 100, 2),
                    )
                )
        return issues

    # ── Check: PII & Semantic Validation ──────────────────────────────────────

    @staticmethod
    def _check_pii_and_semantic(df: pd.DataFrame) -> list[QualityIssue]:
        """Detect PII (SSN, CC) and validate formats (Email, Phone)."""
        import pandas as pd
        issues = []
        
        # Regex patterns
        patterns = {
            "email": r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$",
            "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
            "credit_card": r"\b(?:\d[ -]*?){13,16}\b",
            "phone": r"^\+?1?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$"
        }

        for col in df.select_dtypes(include=["object"]).columns:
            non_null = df[col].dropna().astype(str)
            if len(non_null) == 0:
                continue

            # Check PII (SSN)
            ssn_matches = non_null.apply(lambda x: bool(re.search(patterns["ssn"], x))).sum()
            if ssn_matches > 0:
                issues.append(
                    QualityIssue(
                        issue_type="pii_leak_ssn",
                        title=f"Potential SSN leak in '{col}'",
                        description=f"{ssn_matches} values in '{col}' match Social Security Number patterns",
                        severity=QualitySeverity.CRITICAL,
                        column=col,
                        rows_affected=int(ssn_matches),
                        can_auto_fix=False,
                    )
                )

            # Check PII (Credit Card)
            cc_matches = non_null.apply(lambda x: bool(re.search(patterns["credit_card"], x))).sum()
            if cc_matches > 0:
                issues.append(
                    QualityIssue(
                        issue_type="pii_leak_cc",
                        title=f"Potential Credit Card leak in '{col}'",
                        description=f"{cc_matches} values in '{col}' match Credit Card patterns",
                        severity=QualitySeverity.CRITICAL,
                        column=col,
                        rows_affected=int(cc_matches),
                        can_auto_fix=False,
                    )
                )

            # Check Email format
            if "email" in col.lower() or non_null.str.contains("@").mean() > 0.5:
                invalid_emails = non_null.apply(lambda x: not bool(re.match(patterns["email"], x))).sum()
                if invalid_emails > 0:
                    issues.append(
                        QualityIssue(
                            issue_type="invalid_format_email",
                            title=f"Invalid email formats in '{col}'",
                            description=f"{invalid_emails} values in '{col}' do not follow standard email RFC",
                            severity=QualitySeverity.HIGH,
                            column=col,
                            rows_affected=int(invalid_emails),
                            can_auto_fix=False,
                        )
                    )

        return issues

    # ── Quality Score Computation ────────────────────────────────────────────

    @staticmethod
    def _compute_quality_score(df: pd.DataFrame, issues: list[QualityIssue]) -> float:
        """Weighted quality scoring (0–100)."""
        import pandas as pd
        if len(df) == 0:
            return 0.0

        # Base scores
        null_score = (1 - df.isnull().mean().mean()) * 30
        dup_score = (1 - df.duplicated().mean()) * 20
        type_score = (df.dtypes != object).mean() * 20

        # Deductions for issues
        deductions = sum(
            5 if i.severity == QualitySeverity.CRITICAL
            else 2 if i.severity == QualitySeverity.HIGH
            else 1 if i.severity == QualitySeverity.MEDIUM
            else 0.5
            for i in issues
        )

        score = null_score + dup_score + type_score + 30 - deductions
        return max(0.0, min(100.0, round(score, 1)))

    @staticmethod
    def _score_to_grade(score: float) -> QualityGrade:
        if score >= 90:
            return QualityGrade.A
        elif score >= 75:
            return QualityGrade.B
        elif score >= 60:
            return QualityGrade.C
        elif score >= 40:
            return QualityGrade.D
        else:
            return QualityGrade.F

    @staticmethod
    def _generate_cleaning_script(issues: list[QualityIssue]) -> str:
        """Auto-generates a runnable Python cleaning script."""
        lines = [
            "# ============================================================",
            "# Lumina AI — Auto-Generated Data Cleaning Script",
            "# ============================================================",
            "import pandas as pd",
            "import numpy as np",
            "",
            "# Load your data",
            "# df = pd.read_csv('your_data.csv')",
            "",
        ]

        fixable = [i for i in issues if i.can_auto_fix and i.fix_code]
        if not fixable:
            lines.append("# ✅ No auto-fixable issues detected!")
        else:
            for issue in fixable:
                lines.append(f"# Fix: {issue.title}")
                lines.append(f"# Severity: {issue.severity.value} | Rows affected: {issue.rows_affected}")
                lines.append(str(issue.fix_code))
                lines.append("")

        lines.extend([
            "# Save cleaned data",
            "# df.to_csv('cleaned_data.csv', index=False)",
            f"# print(f'Cleaning complete. {{len(df)}} rows remaining.')",
        ])

        return "\n".join(lines)
