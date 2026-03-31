"""
Lumina AI v4.0 — Pydantic Models
All request/response schemas for the analytics engine.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional, Dict, List, Union
import uuid

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────

class DtypeFamily(str, Enum):
    NUMERIC = "numeric"
    DATETIME = "datetime"
    CATEGORICAL = "categorical"
    TEXT = "text"
    BOOLEAN = "boolean"
    ID = "id"
    GEOGRAPHIC = "geographic"
    UNKNOWN = "unknown"


class QualitySeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class QualityGrade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


class MLTaskType(str, Enum):
    REGRESSION = "regression"
    BINARY_CLASSIFICATION = "binary_classification"
    MULTICLASS_CLASSIFICATION = "multiclass_classification"
    UNSUPERVISED_CLUSTERING = "unsupervised_clustering"


class DashboardRole(str, Enum):
    EXECUTIVE = "executive"
    ANALYST = "analyst"
    SCIENTIST = "scientist"
    ENGINEER = "engineer"


class ChatIntent(str, Enum):
    FILTER = "FILTER"
    HIGHLIGHT = "HIGHLIGHT"
    EXPLAIN = "EXPLAIN"
    COMPARE = "COMPARE"
    FORECAST = "FORECAST"
    DRILL = "DRILL"
    ENRICH = "ENRICH"
    EXPORT = "EXPORT"
    MODIFY = "MODIFY"
    CHART_EDIT = "CHART_EDIT"
    SIMULATE = "SIMULATE"
    GENERAL = "GENERAL"


# ── Tier 1: Data Profiling ───────────────────────────────────────────────────

class ColumnProfile(BaseModel):
    name: str
    dtype_raw: str
    dtype_family: DtypeFamily
    null_count: int = 0
    null_pct: float = 0.0
    unique_count: int = 0
    unique_pct: float = 0.0
    sample_values: list[Any] = Field(default_factory=list)

    # Numeric fields
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    variance: Optional[float] = None
    min_val: Optional[float] = Field(None, alias="min")
    max_val: Optional[float] = Field(None, alias="max")
    range_val: Optional[float] = Field(None, alias="range")
    q1: Optional[float] = None
    q3: Optional[float] = None
    iqr: Optional[float] = None
    skewness: Optional[float] = None
    kurtosis: Optional[float] = None
    cv: Optional[float] = None
    outlier_count_zscore: Optional[int] = None
    outlier_count_iqr: Optional[int] = None
    is_normal: Optional[bool] = None
    zero_count: Optional[int] = None
    negative_count: Optional[int] = None
    percentiles: Optional[dict[str, float]] = None

    # Datetime fields
    min_date: Optional[str] = None
    max_date: Optional[str] = None
    date_range_days: Optional[int] = None
    has_gaps: Optional[bool] = None
    day_of_week_dist: Optional[dict[str, int]] = None
    month_dist: Optional[dict[str, int]] = None
    year_dist: Optional[dict[str, int]] = None

    # Categorical fields
    top_10_values: Optional[dict[str, int]] = None
    bottom_10_values: Optional[dict[str, int]] = None
    entropy: Optional[float] = None
    concentration_top3: Optional[float] = None
    is_binary: Optional[bool] = None
    looks_like_id: Optional[bool] = None

    # Text fields
    avg_length: Optional[float] = None
    max_length: Optional[int] = None
    avg_sentiment: Optional[float] = None

    model_config = {"populate_by_name": True}


class CorrelationPair(BaseModel):
    col_a: str
    col_b: str
    pearson_r: float
    strength: str  # "strong" | "moderate"
    direction: str  # "positive" | "negative"


class DatasetProfile(BaseModel):
    row_count: int
    column_count: int
    memory_usage_mb: float
    duplicate_rows: int
    duplicate_pct: float
    column_profiles: list[ColumnProfile]
    correlation_pairs: list[CorrelationPair] = Field(default_factory=list)
    cardinality_map: dict[str, int] = Field(default_factory=dict)
    sparsity_map: dict[str, float] = Field(default_factory=dict)


# ── Tier 1.5: Hypothesis Testing ───────────────────────────────────────────

class HypothesisTestResult(BaseModel):
    test_name: str  # "T-Test", "ANOVA", "Chi-Square", "Mann-Whitney U"
    statistic: float
    p_value: float
    is_significant: bool
    description: str
    column_a: str
    column_b: str
    target_groups: Optional[list[str]] = None
    interpretation: str


# ── Tier 2: Quality Audit ────────────────────────────────────────────────────

class QualityIssue(BaseModel):
    issue_type: str
    title: str
    description: str
    severity: QualitySeverity
    column: Optional[str] = None
    rows_affected: int = 0
    rows_affected_pct: float = 0.0
    can_auto_fix: bool = False
    fix_code: Optional[str] = None
    sample_values: list[Any] = Field(default_factory=list)


class QualityReport(BaseModel):
    overall_score: float
    grade: QualityGrade
    total_issues: int
    critical_issues: list[QualityIssue] = Field(default_factory=list)
    high_issues: list[QualityIssue] = Field(default_factory=list)
    medium_issues: list[QualityIssue] = Field(default_factory=list)
    low_issues: list[QualityIssue] = Field(default_factory=list)
    auto_fixable: list[QualityIssue] = Field(default_factory=list)
    rows_affected_pct: float = 0.0
    auto_clean_script: str = ""


# ── Tier 3: Enrichment ───────────────────────────────────────────────────────

class EnrichmentResult(BaseModel):
    enrichments_applied: list[str] = Field(default_factory=list)
    new_columns_added: list[str] = Field(default_factory=list)
    enrichment_code: str = ""
    row_count_after: int = 0
    column_count_after: int = 0


# ── Tier 4: ML Pipeline ─────────────────────────────────────────────────────

class SegmentResult(BaseModel):
    optimal_k: int = 0
    silhouette_scores: dict[str, float] = Field(default_factory=dict)
    segment_profiles: list[dict[str, Any]] = Field(default_factory=list)
    segment_counts: dict[str, int] = Field(default_factory=dict)
    rfm_summary: Optional[dict[str, Any]] = None
    scatter_data: Optional[list[dict[str, Any]]] = None


class AnomalyResult(BaseModel):
    anomaly_count: int = 0
    anomaly_pct: float = 0.0
    anomaly_rows: list[dict[str, Any]] = Field(default_factory=list)
    financial_risk: float = 0.0
    method_agreement: dict[str, int] = Field(default_factory=dict)


class ForecastResult(BaseModel):
    models: dict[str, Any] = Field(default_factory=dict)
    best_model: str = ""
    best_mape: Optional[float] = None
    forecast_data: list[dict[str, Any]] = Field(default_factory=list)
    date_col: str = ""
    value_col: str = ""


class FeatureImportanceResult(BaseModel):
    feature_names: list[str] = Field(default_factory=list)
    xgb_importance: dict[str, float] = Field(default_factory=dict)
    shap_mean_abs: Optional[dict[str, float]] = None
    top_5_drivers: list[tuple[str, float]] = Field(default_factory=list)
    target_col: str = ""
    model_performance: dict[str, float] = Field(default_factory=dict)


class TrendResult(BaseModel):
    trend_direction: str = "unknown"
    mk_p_value: Optional[float] = None
    mk_tau: Optional[float] = None
    change_points: list[int] = Field(default_factory=list)
    change_point_dates: list[str] = Field(default_factory=list)
    seasonality_strength: Optional[float] = None
    slope_per_period: Optional[float] = None


class MLResults(BaseModel):
    segmentation: Optional[SegmentResult] = None
    anomalies: Optional[AnomalyResult] = None
    forecast: Optional[ForecastResult] = None
    feature_importance: Optional[FeatureImportanceResult] = None
    trend_analysis: Optional[TrendResult] = None


# ── Tier 4.5: Simulation & What-If ──────────────────────────────────────────

class SimulationScenario(BaseModel):
    scenario_id: str
    name: str
    description: str
    target_column: str
    liver_column: str
    change_value: float
    change_pct: float
    impact_value: float
    impact_pct: float
    confidence: float
    # Advanced fields
    uncertainty_range: Optional[tuple[float, float]] = None # [min, max]
    probabilistic_distribution: Optional[list[float]] = None # Samples
    secondary_impacts: list[dict[str, Any]] = Field(default_factory=list) # [{col, impact_pct}]


class SensitivityPoint(BaseModel):
    value: float
    impact_pct: float


class SensitivityScan(BaseModel):
    column_name: str
    points: list[SensitivityPoint]


class OptimizationResult(BaseModel):
    best_lever: str
    max_roi_pct: float # Impact per 1% change
    optimal_point: float # Value at peak ROI
    diminishing_returns_start: Optional[float] = None

class XAIExplanation(BaseModel):
    """Explainability: Feature importance for a specific prediction."""
    column: str
    contribution_val: float
    contribution_pct: float
    direction: str # "positive" or "negative"

class ConstrainedScenarioResult(BaseModel):
    """Result of multi-lever optimization with constraints."""
    scenario_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    target_column: str
    levers: Dict[str, float] # column -> % change
    predicted_outcome: float
    improvement_pct: float
    constraints_satisfied: bool
    explanations: List[XAIExplanation] = []

class ScenarioDelta(BaseModel):
    lever: str
    delta_val: float
    delta_pct: float

class ScenarioComparison(BaseModel):
    baseline_id: str
    challenger_id: str
    target_column: str
    outcome_delta_pct: float
    lever_deltas: List[ScenarioDelta]
    winner_id: str

class PinnedScenario(BaseModel):
    scenario_id: str
    name: str
    results: Union[SimulationScenario, ConstrainedScenarioResult]
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat()) # Mock timestamp

class TornadoPoint(BaseModel):
    """Data for a Tornado Chart: shows sensitivity of target to various levers."""
    lever: str
    low_impact: float # outcome at -10% or similar
    high_impact: float # outcome at +10% or similar
    baseline: float

class SimulationResult(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_column: str
    baseline_value: float
    model_score: float
    scenarios: List[SimulationScenario] = []
    sensitivity_scans: List[SensitivityScan] = []
    optimization: Optional[OptimizationResult] = None
    constrained_results: List[ConstrainedScenarioResult] = []
    pinned_scenarios: List[PinnedScenario] = []
    comparisons: List[ScenarioComparison] = []
    tornado_chart: List[TornadoPoint] = []
    strategic_narrative: str = ""
    insights: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.now)


class GoalSeekResult(BaseModel):
    target_column: str
    target_value: float
    lever_column: str
    required_change_pct: float
    predicted_outcome: float
    confidence: float
    is_feasible: bool
    iterations: int


class OptimizationResult(BaseModel):
    best_lever: str
    max_roi_pct: float # Impact per 1% change
    optimal_point: float # Value at peak ROI
    diminishing_returns_start: Optional[float] = None


# ── Tier 5: Prescriptive ─────────────────────────────────────────────────────

class WhatIfScenario(BaseModel):
    title: str
    lever: str
    calculation: str
    annual_impact: str
    roi_multiple: float
    priority: str
    owner: str
    timeline: str


class Recommendation(BaseModel):
    title: str
    description: str
    impact: str
    effort: str
    priority: str


class RankedInsight(BaseModel):
    insight_class: str
    title: str
    description: str
    impact: str
    roi_estimate: str
    action: str
    estimated_value: Optional[float] = None


class PrescriptiveInsights(BaseModel):
    executive_summary: str = ""
    key_metrics: list[dict[str, Any]] = Field(default_factory=list)
    ranked_insights: list[RankedInsight] = Field(default_factory=list)
    what_if_scenarios: list[WhatIfScenario] = Field(default_factory=list)
    analyst_recommendations: list[Recommendation] = Field(default_factory=list)
    scientist_recommendations: list[Recommendation] = Field(default_factory=list)
    engineer_recommendations: list[Recommendation] = Field(default_factory=list)


# ── Chart Specifications ─────────────────────────────────────────────────────

class ChartConfig(BaseModel):
    chart_id: str
    chart_type: str  # line, bar, pie, scatter, heatmap, histogram, kpi, table
    title: str
    description: str = ""
    plotly_data: list[dict[str, Any]] = Field(default_factory=list)
    plotly_layout: dict[str, Any] = Field(default_factory=dict)
    role_visibility: list[DashboardRole] = Field(
        default_factory=lambda: [DashboardRole.ANALYST, DashboardRole.SCIENTIST, DashboardRole.ENGINEER]
    )
    priority: int = 5  # 1 = highest (show first)
    kpi_value: Optional[str] = None
    kpi_label: Optional[str] = None
    kpi_change: Optional[str] = None
    kpi_trend: Optional[str] = None  # "up" | "down" | "neutral"


# ── Full Analysis Result ─────────────────────────────────────────────────────

class FullAnalysisResult(BaseModel):
    session_id: str
    filename: str
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    profile: Optional[DatasetProfile] = None
    quality: Optional[QualityReport] = None
    hypothesis_tests: list[HypothesisTestResult] = Field(default_factory=list)
    enrichment: Optional[EnrichmentResult] = None
    ml_results: Optional[MLResults] = None
    prescriptive: Optional[PrescriptiveInsights] = None
    simulation: Optional[SimulationResult] = None
    charts: list[ChartConfig] = Field(default_factory=list)
    lineage: list[dict[str, Any]] = Field(default_factory=list)


# ── Chat Models ──────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    intent: Optional[ChatIntent] = None
    chart_update: Optional[dict[str, Any]] = None


class ChatRequest(BaseModel):
    message: str
    role: DashboardRole = DashboardRole.ANALYST
    current_intent: Optional[str] = None


class SimulationRequest(BaseModel):
    target_column: str
    levers: dict[str, float]  # col_name: new_value
    multi_targets: Optional[dict[str, float]] = None # col -> weight (+1: max, -1: min, 0: stable)


# ── Upload Response ──────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    session_id: str
    filename: str
    row_count: int
    column_count: int
    columns: list[str]
    dtypes: dict[str, str]
    memory_usage_mb: float
    preview: list[dict[str, Any]]


# ── Simulation Architect ───────────────────────────────────────────────────

class SimulationArchitectResponse(BaseModel):
    """AI config recommendation for a simulation."""
    targets: dict[str, float] # col -> weight
    rationale: str

# --- Phase 11 Models ---

class DataHealthIssue(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    severity: str  # 'low', 'medium', 'high', 'critical'
    column: str
    issue_type: str  # 'outliers', 'missing', 'high_cardinality', 'skewed'
    description: str
    suggested_fix: str
    affected_rows_pct: float

class CleaningAction(BaseModel):
    issue_id: str
    action: str  # 'impute_mean', 'impute_median', 'clip_outliers', 'drop', 'encode'
    parameters: Dict[str, Any] = {}

class DataHealthReport(BaseModel):
    session_id: str
    overall_score: float  # 0 to 100
    issues: List[DataHealthIssue] = []
    timestamp: datetime = Field(default_factory=datetime.now)

# --- Phase 12 Models ---

class NexusAction(BaseModel):
    action_type: str # 'simulate', 'clean', 'visualize', 'navigate'
    description: str
    payload: Dict[str, Any]

class NexusCopilotResponse(BaseModel):
    answer: str
    actions: List[NexusAction] = []
    suggested_questions: List[str] = []

# --- Phase 13 Models ---

class ForecastHorizon(str, Enum):
    DAYS = "days"
    WEEKS = "weeks"
    MONTHS = "months"
    QUARTERS = "quarters"

class ForecastPoint(BaseModel):
    timestamp: str
    actual: Optional[float] = None
    forecast: Optional[float] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    is_forecast: bool = False

class EnhancedForecastResult(BaseModel):
    session_id: str
    target_column: str
    date_column: str
    horizon: int
    interval: ForecastHorizon
    points: List[ForecastPoint]
    mape: float
    model_name: str
    insights: List[str] = []

class PivotRequest(BaseModel):
    rows: List[str]
    columns: List[str]
    values: List[str]
    agg_func: str = "mean" # mean, sum, count

class PivotResult(BaseModel):
    session_id: str
    data: List[Dict[str, Any]] # Flattened list of records representing the pivot table
    row_dimensions: List[str]
    col_dimensions: List[str]
    metrics: List[str]

# --- Phase 14 Models ---

class ExecutiveSummarySection(BaseModel):
    title: str
    content: str
    impact_metrics: Optional[Dict[str, str]] = None

class ExecutiveSummary(BaseModel):
    session_id: str
    key_takeaway: str
    strategic_pillars: List[ExecutiveSummarySection]
    risk_assessment: str
    next_steps: List[str]

class ReportExportRequest(BaseModel):
    format: str # 'pptx' | 'pdf'
    include_sections: List[str] = ["summary", "quality", "simulation", "forecast"]
    theme: str = "modern_dark"

# --- Phase 15 Models ---

class AnomalyPoint(BaseModel):
    index: int
    column: str
    value: Any
    expected_value: Optional[float] = None
    severity: float # 0 to 1
    reason: str
    contributing_factors: List[XAIExplanation] = Field(default_factory=list)

class AnomalyReport(BaseModel):
    session_id: str
    total_anomalies: int
    anomalies: List[AnomalyPoint]
    summary: str
    risk_level: str # "low", "medium", "high"
    impact_assessment: str

class DataDriftReport(BaseModel):
    session_id: str
    drift_score: float # 0 to 1
    drifted_columns: List[str]
    p_values: Dict[str, float]
    summary: str
    is_significant: bool

# ── Session Info ─────────────────────────────────────────────────────────────

class SessionInfo(BaseModel):
    session_id: str
    filename: str
    row_count: int
    column_count: int
    created_at: str
    analysis_complete: bool = False


# ── Midnight Blockchain Models ────────────────────────────────────────────────

class ZKProof(BaseModel):
    proof_id: str
    commitment: str
    nullifier: str
    proof_data: str
    verified: bool = False
    timestamp: str
    scheme: str = "SNARK-SHA3-256-simulated"
    public_inputs_hash: Optional[str] = None


class BlockchainRecord(BaseModel):
    block_number: int
    block_hash: str
    prev_hash: str
    session_id_hash: str
    event_type: str
    zk_proof: Optional[ZKProof] = None
    public_metadata: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str
    network: str = "midnight-testnet-simulated"


class DatasetFingerprint(BaseModel):
    fingerprint_id: str
    owner_commitment: str
    column_count: int
    row_count_range: str
    column_fingerprints: List[Dict[str, Any]] = Field(default_factory=list)
    data_category_hint: str = "general"
    registered_at: str
    is_public: bool = False
    schema_hash: Optional[str] = None


class ColumnSimilarity(BaseModel):
    col_hash_a: str
    col_hash_b: str
    similarity_score: float
    distribution_match: float
    dtype_compatible: bool
    insight: str


class PrivateCompareRequest(BaseModel):
    fingerprint_id_a: str
    fingerprint_id_b: str
    mode: str = "statistical"


class PrivateCompareResult(BaseModel):
    compare_id: str
    zk_proof: Dict[str, Any] = Field(default_factory=dict)
    overall_similarity: float
    shared_structure_score: float
    column_count_a: int = 0
    column_count_b: int = 0
    category_a: str = "unknown"
    category_b: str = "unknown"
    column_matches: List[ColumnSimilarity] = Field(default_factory=list)
    matched_columns_count: int = 0
    insights: List[str] = Field(default_factory=list)
    privacy_guarantee: str = ""
    source_a_revealed: bool = False
    source_b_revealed: bool = False
    timestamp: str


class DataMarketplaceListing(BaseModel):
    listing_id: str
    data_category: str
    column_count: int
    row_count_range: str
    schema_hash: Optional[str] = None
    registered_at: str
    listed_at: str
    compare_requests_count: int = 0


class ZKIdentity(BaseModel):
    identity_commitment: str
    alias: str
    avatar_color: str
    avatar_hue: int
    created_at: str
    attributes: Dict[str, Any] = Field(default_factory=dict)
    network: str = "midnight-testnet-simulated"
