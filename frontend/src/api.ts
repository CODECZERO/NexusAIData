/**
 * Nexus Analytics — API Client
 * All backend endpoint functions.
 */

export const API_BASE = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api';

export interface SimulationRequest {
    target_column: string
    levers: Record<string, number>
    multi_targets?: Record<string, number>
}

export interface TornadoPoint {
    lever: string
    low_impact: number
    high_impact: number
    baseline: number
}

export interface SimulationResult {
    session_id: string
    target_column: string
    baseline_value: number
    model_score: number
    scenarios: any[]
    constrained_results: any[]
    tornado_chart: TornadoPoint[]
    strategic_narrative: string
    insights: string[]
}

export interface DataHealthIssue {
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    column: string
    issue_type: string
    description: string
    suggested_fix: string
    affected_rows_pct: number
}

export interface DataHealthReport {
    session_id: string
    overall_score: number
    issues: DataHealthIssue[]
    timestamp: string
}

export interface CleaningAction {
    issue_id: string
    action: string
    parameters: any
}

export interface SimulationArchitectResponse {
    targets: Record<string, number>
    rationale: string
}

export interface NexusAction {
    action_type: 'simulate' | 'clean' | 'visualize' | 'navigate' | 'forecast' | 'pivot'
    description: string
    payload: any
}

export interface NexusCopilotResponse {
    answer: string
    actions: NexusAction[]
    suggested_questions: string[]
}

export async function getNexusChat(sessionId: string, message: string): Promise<NexusCopilotResponse> {
    const res = await fetch(`${API_BASE}/chat/nexus/${sessionId}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message })
    })
    if (!res.ok) throw new Error('Nexus Chat failed')
    return res.json()
}

export async function runSimulation(sessionId: string, targetColumn: string, request?: SimulationRequest): Promise<SimulationResult> {
    const res = await fetch(`${API_BASE}/simulation/${sessionId}?target=${encodeURIComponent(targetColumn)}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(request || { target_column: targetColumn, levers: {} })
    })
    if (!res.ok) throw new Error('Simulation failed')
    return res.json()
}

export async function getSimulationArchitect(sessionId: string, goal: string): Promise<SimulationArchitectResponse> {
    const res = await fetch(`${API_BASE}/simulation/${sessionId}/architect?goal=${encodeURIComponent(goal)}`, {
        method: 'POST',
        headers: getHeaders()
    })
    if (!res.ok) throw new Error('Failed to get simulation architect')
    return res.json()
}

export async function getDataHealth(sessionId: string): Promise<DataHealthReport> {
    const res = await fetch(`${API_BASE}/data/${sessionId}/health`, {
        headers: getHeaders()
    })
    if (!res.ok) throw new Error('Failed to get data health report')
    return res.json()
}

export async function cleanData(sessionId: string, actions: CleaningAction[]): Promise<any> {
    const res = await fetch(`${API_BASE}/data/${sessionId}/clean`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(actions)
    })
    if (!res.ok) throw new Error('Failed to clean data')
    return res.json()
}

export async function engineerFeature(sessionId: string, goal: string): Promise<any> {
    const res = await fetch(`${API_BASE}/data/${sessionId}/engineer?goal=${encodeURIComponent(goal)}`, {
        method: 'POST',
        headers: getHeaders()
    })
    if (!res.ok) throw new Error('Failed to engineer feature')
    return res.json()
}

export interface ForecastPoint {
    timestamp: string
    actual?: number
    forecast?: number
    lower_bound?: number
    upper_bound?: number
    is_forecast: boolean
}

export interface EnhancedForecastResult {
    session_id: string
    target_column: string
    date_column: string
    horizon: number
    interval: 'days' | 'weeks' | 'months' | 'quarters'
    points: ForecastPoint[]
    mape: number
    model_name: string
    insights: string[]
}

export interface PivotRequest {
    rows: string[]
    columns: string[]
    values: string[]
    agg_func: 'mean' | 'sum' | 'count' | 'min' | 'max'
}

export interface PivotResult {
    session_id: string
    data: Record<string, any>[]
    row_dimensions: string[]
    col_dimensions: string[]
    metrics: string[]
}

export interface ExecutiveSummarySection {
    title: string
    content: string
    impact_metrics?: Record<string, string>
}

export interface ExecutiveSummary {
    session_id: string
    key_takeaway: string
    strategic_pillars: ExecutiveSummarySection[]
    risk_assessment: string
    next_steps: string[]
}

export interface ReportExportRequest {
    format: 'pptx' | 'pdf'
    include_sections?: string[]
    theme?: string
}

// --- Phase 15 Types ---

export interface XAIExplanation {
    column: string
    contribution_val: number
    contribution_pct: number
    direction: 'positive' | 'negative'
}

export interface AnomalyPoint {
    index: number
    column: string
    value: any
    expected_value?: number
    severity: number
    reason: string
    contributing_factors: XAIExplanation[]
}

export interface AnomalyReport {
    session_id: string
    total_anomalies: number
    anomalies: AnomalyPoint[]
    summary: string
    risk_level: 'low' | 'medium' | 'high'
    impact_assessment: string
}

export interface DataDriftReport {
    session_id: string
    drift_score: number
    drifted_columns: string[]
    p_values: Record<string, number>
    summary: string
    is_significant: boolean
}

export async function getForecast(
    sessionId: string, 
    targetCol: string, 
    dateCol?: string, 
    stride: string = 'months', 
    horizon: number = 6
): Promise<EnhancedForecastResult> {
    const url = new URL(`${API_BASE}/data/${sessionId}/forecast`, window.location.origin)
    url.searchParams.append('target_col', targetCol)
    if (dateCol) url.searchParams.append('date_col', dateCol)
    url.searchParams.append('stride', stride)
    url.searchParams.append('horizon', horizon.toString())
    
    const res = await fetch(url.toString(), {
        headers: getHeaders()
    })
    if (!res.ok) throw new Error('Forecast failed')
    return res.json()
}

export async function getPivot(sessionId: string, request: PivotRequest): Promise<PivotResult> {
    const res = await fetch(`${API_BASE}/data/${sessionId}/pivot`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(request)
    })
    if (!res.ok) throw new Error('Pivot analysis failed')
    return res.json()
}


export interface UploadResponse {
    session_id: string;
    filename: string;
    row_count: number;
    column_count: number;
    columns: string[];
    dtypes: Record<string, string>;
    memory_usage_mb: number;
    preview: Record<string, unknown>[];
}

export interface ChartConfig {
    chart_id: string;
    chart_type: string;
    title: string;
    description: string;
    plotly_data: Record<string, unknown>[];
    plotly_layout: Record<string, unknown>;
    role_visibility: string[];
    priority: number;
    kpi_value?: string;
    kpi_label?: string;
    kpi_change?: string;
    kpi_trend?: string;
}

export interface AnalysisResult {
    session_id: string;
    filename: string;
    created_at: string;
    profile: Record<string, unknown> | null;
    quality: {
        overall_score: number;
        grade: string;
        total_issues: number;
        critical_issues: Record<string, unknown>[];
        high_issues: Record<string, unknown>[];
        medium_issues: Record<string, unknown>[];
        low_issues: Record<string, unknown>[];
        auto_fixable: Record<string, unknown>[];
        auto_clean_script: string;
    } | null;
    enrichment: Record<string, unknown> | null;
    ml_results: Record<string, unknown> | null;
    prescriptive: {
        executive_summary: string;
        key_metrics: { label: string; value: string; trend?: string; icon?: string }[];
        ranked_insights: { insight_class: string; title: string; description: string; impact: string; roi_estimate: string; action: string }[];
        what_if_scenarios: Record<string, unknown>[];
        analyst_recommendations: Record<string, unknown>[];
        scientist_recommendations: Record<string, unknown>[];
        engineer_recommendations: Record<string, unknown>[];
    } | null;
    charts: ChartConfig[];
}

// Helper to get headers with optional API Key
export function getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extraHeaders };
    const apiKey = import.meta.env.VITE_LUMINA_API_KEY;
    if (apiKey) {
        headers['X-API-Key'] = apiKey;
    }
    return headers;
}

// Upload single file
export async function uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: getHeaders(),
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail || 'Upload failed');
    }

    return res.json();
}

// Upload multiple files
export async function uploadFiles(files: File[]): Promise<UploadResponse[]> {
    const results: UploadResponse[] = [];
    for (const file of files) {
        const result = await uploadFile(file);
        results.push(result);
    }
    return results;
}

// Full analysis
export async function getFullAnalysis(sid: string): Promise<AnalysisResult> {
    const res = await fetch(`${API_BASE}/analysis/${sid}`, {
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Analysis failed');
    return res.json();
}

// Poll analysis status (progressive loading)
export async function getAnalysisStatus(sid: string): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/analysis_status/${sid}`, {
        headers: getHeaders()
    });
    if (!res.ok) return { status: 'unknown' };
    return res.json();
}

// Charts by role
export async function getCharts(sid: string, role: string): Promise<{ charts: ChartConfig[] }> {
    const res = await fetch(`${API_BASE}/charts/${sid}?role=${role}`, {
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch charts');
    return res.json();
}

// Export endpoints
export function getExportUrl(sid: string, format: string, params?: Record<string, string>): string {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    // Note: Browser-direct downloads (links) can't easily set headers.
    // However, the backend is configured to bypass auth for GET /api/export if needed, 
    // or the user should handle this in a separate way. 
    // Usually, we'd add the key as a query param if strictly required for downloads.
    const apiKey = import.meta.env.VITE_LUMINA_API_KEY;
    const authParam = apiKey ? `&api_key=${apiKey}` : '';
    return `${API_BASE}/export/${sid}/${format}${query}${authParam}`;
}

// Download cleaned CSV
export function getDownloadUrl(sid: string, enriched = true): string {
    const apiKey = import.meta.env.VITE_LUMINA_API_KEY;
    const authParam = apiKey ? `&api_key=${apiKey}` : '';
    return `${API_BASE}/download/${sid}/csv?enriched=${enriched}${authParam}`;
}

// Recommendations
export async function getRecommendations(sid: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${API_BASE}/recommendations/${sid}`, {
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch recommendations');
    return res.json();
}

// Poll for LLM-enriched insights (non-blocking)
export async function pollLLMInsights(sid: string): Promise<{ status: string; insights?: Record<string, unknown>[] }> {
    const res = await fetch(`${API_BASE}/insights/${sid}`, {
        headers: getHeaders()
    });
    if (!res.ok) return { status: 'pending' };
    return res.json();
}

// List sessions
export async function listSessions(): Promise<{ sessions: Record<string, unknown>[] }> {
    const res = await fetch(`${API_BASE}/sessions`, {
        headers: getHeaders()
    });
    return res.json();
}

// Delete session
export async function deleteSession(sid: string): Promise<void> {
    await fetch(`${API_BASE}/session/${sid}`, { 
        method: 'DELETE',
        headers: getHeaders()
    });
}

// Health check
export async function healthCheck() {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
}

// Multi-dataset comparison
export interface ComparisonResult {
    dataset_count: number;
    datasets: { name: string; row_count: number; columns: string[] }[];
    statistical_comparison: {
        shared_columns: string[];
        shared_column_count: number;
        unique_columns_per_dataset: { dataset: string; unique_columns: string[] }[];
        shared_column_stats: Record<string, Record<string, Record<string, number | null>>>;
    };
    llm_reasoning: {
        shared_columns?: string[];
        suggested_join_keys?: string[];
        merge_strategy?: string;
        correlations?: string[];
        differences?: string[];
        data_quality_comparison?: string;
        actionable_insights?: string[];
        recommended_charts?: { title: string; type: string; x_col: string; y_col: string; description: string }[];
    } | null;
}

export async function compareDatasets(sessionIds: string[]): Promise<ComparisonResult> {
    const res = await fetch(`${API_BASE}/compare`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session_ids: sessionIds }),
    });
    if (!res.ok) throw new Error('Comparison failed');
    return res.json();
}

export async function getExecutiveSummary(sid: string): Promise<ExecutiveSummary> {
    const res = await fetch(`${API_BASE}/analysis/${sid}/summary`, {
        headers: getHeaders()
    })
    if (!res.ok) throw new Error('Failed to fetch summary')
    return res.json()
}

export async function exportExecutiveReport(sessionId: string, request: ReportExportRequest): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/${sessionId}/report`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(request)
    })
    if (!res.ok) throw new Error('Export failed')
    return res.blob()
}

export async function getAnomalies(sessionId: string): Promise<AnomalyReport> {
    const res = await fetch(`${API_BASE}/analysis/${sessionId}/anomalies`, {
        headers: getHeaders()
    })
    if (!res.ok) throw new Error('Failed to fetch anomalies')
    return res.json()
}

export async function getDataDrift(sessionId: string, baselineSid?: string): Promise<DataDriftReport> {
    const url = new URL(`${API_BASE}/analysis/${sessionId}/drift`, window.location.origin)
    if (baselineSid) url.searchParams.append('baseline_sid', baselineSid)
    const res = await fetch(url.toString(), {
        headers: getHeaders()
    })
    if (!res.ok) throw new Error('Failed to fetch data drift')
    return res.json()
}

// ── Midnight Blockchain Types ─────────────────────────────────────────────────

export interface ZKProof {
    proof_id: string
    commitment: string
    nullifier: string
    proof_data: string
    verified: boolean
    timestamp: string
    scheme: string
    public_inputs_hash?: string
}

export interface BlockchainRecord {
    block_number: number
    block_hash: string
    prev_hash: string
    event_type: string
    timestamp: string
    public_metadata: Record<string, unknown>
    proof_id: string
    proof_verified: boolean
    network: string
    metadata_summary?: Record<string, unknown>
}

export interface DatasetFingerprint {
    fingerprint_id: string
    column_count: number
    row_count_range: string
    data_category_hint: string
    registered_at: string
    is_public: boolean
    column_hashes: string[]
    schema_hash?: string
    message?: string
}

export interface ColumnSimilarity {
    col_hash_a: string
    col_hash_b: string
    similarity_score: number
    distribution_match: number
    dtype_compatible: boolean
    insight: string
}

export interface PrivateCompareResult {
    compare_id: string
    zk_proof: Record<string, unknown>
    overall_similarity: number
    shared_structure_score: number
    column_count_a: number
    column_count_b: number
    category_a: string
    category_b: string
    column_matches: ColumnSimilarity[]
    matched_columns_count: number
    insights: string[]
    privacy_guarantee: string
    source_a_revealed: boolean
    source_b_revealed: boolean
    timestamp: string
}

export interface MarketplaceListing {
    listing_id: string
    fingerprint_id: string
    data_category: string
    column_count: number
    row_count_range: string
    schema_hash?: string
    registered_at: string
    listed_at: string
    compare_requests_count: number
    owner_alias?: string
}

export interface ZKIdentity {
    identity_commitment: string
    alias: string
    avatar_color: string
    avatar_hue: number
    created_at: string
    attributes: Record<string, boolean>
    network: string
}

export interface BlockchainHealth {
    status: string
    network: string
    chain_valid: boolean
    total_blocks: number
    registered_fingerprints: number
    marketplace_listings: number
    sdk_version: string
}

export interface ProvenanceResult {
    session_hash: string
    record_count: number
    provenance: BlockchainRecord[]
    chain_valid: boolean
    privacy_note: string
}

// ── Midnight Blockchain API Functions ─────────────────────────────────────────

const BLOCKCHAIN_BASE = `${API_BASE}/blockchain`

export async function getBlockchainHealth(): Promise<BlockchainHealth> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/health`, { headers: getHeaders() })
    if (!res.ok) throw new Error('Blockchain health check failed')
    return res.json()
}

export async function getZKIdentity(sessionId: string): Promise<ZKIdentity> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/identity/${sessionId}`, { headers: getHeaders() })
    if (!res.ok) throw new Error('Failed to get ZK identity')
    return res.json()
}

export async function registerOnChain(
    sessionId: string,
    meta: { filename?: string; row_count?: number; column_count?: number }
): Promise<{ block_hash: string; block_number: number; proof_id: string; timestamp: string; verified: boolean }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/register/${sessionId}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(meta),
    })
    if (!res.ok) throw new Error('Blockchain registration failed')
    return res.json()
}

export async function generateFingerprint(sessionId: string, makePublic = false, privacyLevel = 0.0): Promise<DatasetFingerprint> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/fingerprint/${sessionId}?make_public=${makePublic}&privacy_level=${privacyLevel}`, {
        method: 'POST',
        headers: getHeaders()
    })
    if (!res.ok) {
        let errMsg = 'Fingerprint generation failed';
        try { const errData = await res.json(); errMsg = errData.detail || errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
    }
    return res.json()
}

export async function getMyFingerprints(sessionId: string): Promise<{ fingerprints: DatasetFingerprint[]; count: number }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/my-fingerprints/${sessionId}`, { headers: getHeaders() })
    if (!res.ok) throw new Error('Failed to fetch fingerprints')
    return res.json()
}

export async function listInMarketplace(sessionId: string, fingerprintId: string): Promise<{ listing_id: string; message: string }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/marketplace/list?session_id=${sessionId}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fingerprint_id: fingerprintId }),
    })
    if (!res.ok) throw new Error('Failed to list in marketplace')
    return res.json()
}

export async function getMarketplace(): Promise<{ listings: MarketplaceListing[]; count: number; privacy_note: string }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/marketplace`, { headers: getHeaders() })
    if (!res.ok) throw new Error('Failed to fetch marketplace')
    return res.json()
}

export async function privateCompare(fingerprintIdA: string, fingerprintIdB: string): Promise<PrivateCompareResult> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/compare`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fingerprint_id_a: fingerprintIdA, fingerprint_id_b: fingerprintIdB }),
    })
    if (!res.ok) throw new Error('Private comparison failed')
    return res.json()
}

export async function getProvenance(sessionId: string): Promise<ProvenanceResult> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/provenance/${sessionId}`, { headers: getHeaders() })
    if (!res.ok) throw new Error('Failed to fetch provenance')
    return res.json()
}

export async function getPublicLedger(limit = 30): Promise<{ blocks: BlockchainRecord[]; stats: Record<string, unknown> }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/ledger?limit=${limit}`, { headers: getHeaders() })
    if (!res.ok) throw new Error('Failed to fetch ledger')
    return res.json()
}

export async function runAnonymousBenchmark(
    sessionId: string,
    fingerprintId: string
): Promise<{ benchmarks: Array<{ listing_id: string; data_category: string; overall_similarity: number; top_insight: string }> }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/benchmark/${sessionId}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fingerprint_id: fingerprintId }),
    })
    if (!res.ok) throw new Error('Benchmark failed')
    return res.json()
}

// ── Midnight Data Bounties ──────────

export interface DataBounty {
    bounty_id: string;
    creator_commitment: string;
    target_category: string;
    target_schema_hash: string;
    target_column_count: number;
    required_similarity_score: number;
    reward_dust: number;
    description: string;
    status: 'open' | 'claimed';
    created_at: string;
    claimed_by_commitment?: string;
    claimed_by?: string;
    claimed_at?: string;
    claimer_fingerprint_id?: string;
    similarity_achieved?: number;
    creator_session_id?: string;
}

export async function createBounty(sessionId: string, data: {
    fingerprint_id: string,
    required_similarity_score: number,
    reward_dust: number,
    description: string,
    escrow_tx_id?: string
}) {
    const res = await fetch(`${API_BASE}/blockchain/bounties/${sessionId}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data)
    })
    if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Bounty creation failed')
    }
    return res.json()
}

export async function getBounties(): Promise<{ bounties: DataBounty[] }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/bounties`, { headers: getHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
}

export async function claimBounty(
    sessionId: string,
    bountyId: string,
    fingerprintId: string
): Promise<{ success: boolean; message: string; similarity?: number; reward_dust?: number; access_token?: string; bounty_id?: string }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/bounties/${bountyId}/claim?session_id=${sessionId}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fingerprint_id: fingerprintId }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
}

export async function getBountyClaimedData(
    bountyId: string,
    accessToken?: string,
    sessionId?: string
): Promise<{ bounty_id: string; filename: string; total_rows: number; preview_rows: number; columns: string[]; preview: any[]; privacy_note: string }> {
    const url = new URL(`${BLOCKCHAIN_BASE}/bounties/${bountyId}/data`);
    if (accessToken) url.searchParams.append("token", accessToken);
    if (sessionId) url.searchParams.append("session_id", sessionId);

    const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
        let errMsg = 'Access denied';
        try { const d = await res.json(); errMsg = d.detail || errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
    }
    return res.json()
}

// ── Midnight Verifiable Credentials (Attestations) ──────────

export interface VerifiableCredential {
    credential_id: string;
    fingerprint_id: string;
    issuer_id: string;
    claim_type: string;
    issued_at: string;
    valid: boolean;
}

export async function requestAttestation(
    sessionId: string,
    fingerprintId: string,
    claimType: string
): Promise<{ success: boolean; message?: string; credential?: VerifiableCredential }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/attest?session_id=${sessionId}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fingerprint_id: fingerprintId, claim_type: claimType })
    })
    return res.json()
}

export async function getAttestations(fingerprintId: string): Promise<{ credentials: VerifiableCredential[], count: number }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/attestations/${fingerprintId}`, { headers: getHeaders() })
    return res.json()
}

// ── Midnight ZK Audit ───────────────────────────────────────

export interface AuditProof {
    audit_id: string;
    session_id: string;
    fingerprint: string;
    zk_proof: string;
    timestamp: string;
    status: string;
    issuer: string;
}

export async function generateAuditProof(sessionId: string): Promise<AuditProof> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/audit`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session_id: sessionId })
    });
    if (!res.ok) throw new Error('Failed to generate audit proof');
    return res.json();
}
export interface LedgerStats {
    total_blocks: number;
    event_breakdown: Record<string, number>;
    chain_valid: boolean;
    latest_hash?: string;
}

export async function getLedgerStats(): Promise<LedgerStats> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/stats`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to get ledger stats');
    return res.json();
}

// ── Midnight Data Subscriptions (data_subscription.compact) ──────────────

export interface DataSubscription {
    subscriptionId: string;
    targetFingerprint: string;
    paymentDust: number;
    status: 'LOCKED' | 'CLAIMED' | 'REFUNDED';
    transactionId: string;
    decryptionKey?: string;
    network: string;
    timestamp: string;
}

export async function createSubscription(
    sessionId: string,
    targetFingerprint: string,
    paymentDust: number
): Promise<DataSubscription & { message: string }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/subscriptions?session_id=${sessionId}`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ target_fingerprint: targetFingerprint, payment_dust: paymentDust }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
}

export async function getSubscriptions(sessionId?: string): Promise<{ 
    subscriptions: DataSubscription[]; 
    my_subs?: DataSubscription[];
    incoming_claims?: DataSubscription[];
    count: number 
}> {
    const url = sessionId ? `${BLOCKCHAIN_BASE}/subscriptions?session_id=${sessionId}` : `${BLOCKCHAIN_BASE}/subscriptions`
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) throw new Error('Failed to fetch subscriptions')
    return res.json()
}

export async function claimSubscription(
    sessionId: string,
    subscriptionId: string
): Promise<DataSubscription & { message: string }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/subscriptions/${subscriptionId}/claim?session_id=${sessionId}`, {
        method: 'POST',
        headers: getHeaders(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
}

export async function refundSubscription(
    sessionId: string,
    subscriptionId: string
): Promise<DataSubscription & { message: string }> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/subscriptions/${subscriptionId}/refund?session_id=${sessionId}`, {
        method: 'POST',
        headers: getHeaders(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
}

// ── Midnight On-Chain Verification ───────────────────────────────────────

export interface VerificationResult {
    verified: boolean;
    fingerprintId?: string;
    auditId?: string;
    proof: string;
    network: string;
    timestamp: string;
}

export async function verifyOwnership(
    sessionId: string,
    fingerprintId: string
): Promise<VerificationResult> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/verify/${fingerprintId}?session_id=${sessionId}`, {
        method: 'POST',
        headers: getHeaders(),
    })
    if (!res.ok) throw new Error('Ownership verification failed')
    return res.json()
}

export async function verifyAuditProof(auditId: string): Promise<VerificationResult> {
    const res = await fetch(`${BLOCKCHAIN_BASE}/verify-audit/${auditId}`, {
        method: 'POST',
        headers: getHeaders(),
    })
    if (!res.ok) throw new Error('Audit verification failed')
    return res.json()
}
