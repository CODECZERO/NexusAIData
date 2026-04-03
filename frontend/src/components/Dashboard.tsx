import { useEffect, useMemo, useState, useCallback } from 'react'
import type { AnalysisResult, ChartConfig, UploadResponse } from '../api'
import { getExportUrl, getDownloadUrl, getRecommendations, pollLLMInsights } from '../api'
import { ChartPanel } from './ChartPanel'
import { SimulationPanel } from './SimulationPanel'
import { ForecastPanel } from './ForecastPanel'
import { PivotEngine } from './PivotEngine'
import DataHealthDashboard from './DataHealthDashboard'
import { LayoutDashboard, FileSearch, ShieldAlert, BrainCircuit, Lightbulb, ClipboardList, FileText, Table, FileSpreadsheet, Download, BookOpen, FileCode, CheckCircle2, TrendingUp, TrendingDown, Minus, Search, X, Target, Bot, Grid, Presentation, Play, Activity, AlertTriangle } from 'lucide-react'
import { NexusCopilot } from './NexusCopilot'
import ExecutiveSummary from './ExecutiveSummary'
import PresenterMode from './PresenterMode'
import AnomalyPanel from './AnomalyPanel'
import { getAnomalies, type AnomalyReport } from '../api'
type DashboardRole = 'executive' | 'analyst' | 'scientist' | 'engineer'
type TabId = 'overview' | 'executive' | 'profile' | 'quality' | 'ml' | 'insights' | 'recommendations' | 'simulate' | 'forecast' | 'pivot' | 'monitoring'
interface Props {
    analysis: AnalysisResult
    session: UploadResponse
    role: DashboardRole
    globalFilter?: string | null
    onSetGlobalFilter?: (filter: string | null) => void
    analysisComplete?: boolean
}

export function Dashboard({ analysis, session, role, globalFilter, onSetGlobalFilter, analysisComplete = true }: Props) {
    const [activeTab, setActiveTab] = useState<TabId>(role === 'executive' ? 'executive' : 'overview')
    const [showPresenter, setShowPresenter] = useState(false)

    // Sidebar Resizer State
    const [sidebarWidth, setSidebarWidth] = useState(250)
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sidebarWidth;
        
        const doDrag = (dragEvent: MouseEvent) => {
            requestAnimationFrame(() => {
                const newWidth = Math.max(160, Math.min(500, startWidth + dragEvent.clientX - startX));
                setSidebarWidth(newWidth);
            });
        };
        
        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
        };
        
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    }, [sidebarWidth]);

    // Formatting utility for KPI cards (handles large numbers #14 and percentages #9)
    const formatValue = (val: string | number | null | undefined, label: string = '') => {
        if (val === null || val === undefined) return '—'// If it's already a string that can't be parsed, or if we just want to render it
        const numStr = String(val).replace(/,/g, '') // remove existing commas if any
        const num = Number(numStr)

        if (isNaN(num)) return String(val) // Return original string if not a number

        // Percentage Formatting (#9) logic: Max <= 1.0 logic, or label contains %/rate
        const isPctContext = label.toLowerCase().includes('%') || label.toLowerCase().includes('rate') || label.toLowerCase().includes('margin')
        if ((Math.abs(num) <= 1.0 && num !== 0.0) || isPctContext) {
            // If it's a small decimal (like 0.15) or an explicit percent context
            let scaledNum = num
            if (scaledNum <= 1.0 && scaledNum >= -1.0) scaledNum = scaledNum * 100 // Scale up to 0-100 manually
            return `${scaledNum.toFixed(1)}%`
        }

        // Large Number Formatting (#14) logic
        if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`
        if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
        if (Math.abs(num) >= 10_000) return `${(num / 1_000).toFixed(1)}K`

        return Number.isInteger(num) ? num.toLocaleString() : num.toFixed(2).toLocaleString()
    }
    const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)
    const [recs, setRecs] = useState<Record<string, unknown> | null>(null)
    const [recsLoading, setRecsLoading] = useState(false)
    const [localFilter, setLocalFilter] = useState<string | null>(null)
    const [chartTypeFilter, setChartTypeFilter] = useState<string>('all')
    const [chartSearch, setChartSearch] = useState('')
    const [expandedChart, setExpandedChart] = useState<string | null>(null)
    const [anomalyReport, setAnomalyReport] = useState<AnomalyReport | null>(null)
    const [anomaliesLoading, setAnomaliesLoading] = useState(false)


    // Use props if provided, otherwise fallback to local state (for standalone usage)
    const activeFilter = globalFilter !== undefined ? globalFilter : localFilter
    const handleSetFilter = onSetGlobalFilter || setLocalFilter

    // Fetch recommendations when tab is opened
    useEffect(() => {
        if (activeTab === 'recommendations' && !recs && !recsLoading) {
            setRecsLoading(true)
            getRecommendations(session.session_id)
                .then(data => { setRecs(data); setRecsLoading(false) })
                .catch(() => setRecsLoading(false))
        }
    }, [activeTab, recs, recsLoading, session.session_id])

    // Poll for LLM-enriched insights in background
    useEffect(() => {
        if (!analysis?.prescriptive) return
        let cancelled = false
        let attempts = 0
        const maxAttempts = 20 // 20 × 3s = 60s max polling

        const poll = async () => {
            while (!cancelled && attempts < maxAttempts) {
                try {
                    const result = await pollLLMInsights(session.session_id)
                    if (result.status === 'ready' && result.insights) {
                        // Update analysis with LLM insights
                        if (analysis.prescriptive) {
                            analysis.prescriptive.ranked_insights = result.insights as typeof analysis.prescriptive.ranked_insights
                        }
                        break
                    } else if (result.status === 'failed') {
                        break
                    }
                } catch { /* ignore polling errors */ }
                attempts++
                await new Promise(r => setTimeout(r, 3000))
            }
        }
        poll()
        return () => { cancelled = true }
    }, [session.session_id, analysis?.prescriptive])

    // Fetch anomalies for proactive alerts
    useEffect(() => {
        if (!anomalyReport && !anomaliesLoading) {
            setAnomaliesLoading(true)
            getAnomalies(session.session_id)
                .then(data => { setAnomalyReport(data); setAnomaliesLoading(false) })
                .catch(() => setAnomaliesLoading(false))
        }
    }, [session.session_id, anomalyReport, anomaliesLoading])

    const charts = useMemo(() => {
        return (analysis.charts || []).filter((c: ChartConfig) => c.role_visibility.includes(role)
        )
    }, [analysis.charts, role])

    const kpiCharts = charts.filter((c: ChartConfig) => c.chart_type === 'kpi')
    const otherCharts = charts.filter((c: ChartConfig) => c.chart_type !== 'kpi')

    // Derived KPIs
    const derivedKpis = useMemo(() => {
        const kpis: { label: string; value: string; sub?: string; trend?: string }[] = []
        kpis.push({ label: 'Total Rows', value: session.row_count.toLocaleString(), sub: `${session.column_count} columns` })
        kpis.push({ label: 'Memory', value: `${session.memory_usage_mb} MB`, sub: session.filename })
        if (analysis.quality) {
            kpis.push({ label: 'Data Quality', value: `${analysis.quality.overall_score}%`, sub: `Grade ${analysis.quality.grade}`, trend: analysis.quality.overall_score >= 80 ? 'up' : analysis.quality.overall_score >= 50 ? 'neutral' : 'down' })
            kpis.push({ label: 'Issues Found', value: `${analysis.quality.total_issues}`, sub: `${(analysis.quality.critical_issues || []).length} critical`, trend: analysis.quality.total_issues === 0 ? 'up' : 'down' })
        }
        if (analysis.ml_results) {
            const ml = analysis.ml_results as Record<string, unknown>
            const anomalies = ml.anomalies as Record<string, unknown> | undefined
            if (anomalies?.anomaly_count !== undefined) {
                kpis.push({ label: 'Anomalies', value: `${anomalies.anomaly_count}`, sub: `${Number(anomalies.anomaly_pct || 0).toFixed(1)}% of data`, trend: 'neutral' })
            }
            const seg = ml.segmentation as Record<string, unknown> | undefined
            if (seg?.optimal_k !== undefined) {
                kpis.push({ label: 'Segments', value: `${seg.optimal_k}`, sub: 'Optimal clusters' })
            }
        }
        if (analysis.enrichment) {
            const enrich = analysis.enrichment as Record<string, unknown>
            const newCols = (enrich.new_columns_added as string[]) || []
            if (newCols.length > 0) {
                kpis.push({ label: 'Enriched Cols', value: `+${newCols.length}`, sub: 'New features', trend: 'up' })
            }
        }
        return kpis
    }, [analysis, session])

    // Numeric column stats
    const numericStats = useMemo(() => {
        if (!analysis.profile) return []
        const cols = ((analysis.profile as Record<string, unknown>).column_profiles || []) as Record<string, unknown>[]
        return cols.filter(c => c.dtype_family === 'numeric').slice(0, 6).map(c => ({
            name: String(c.name),
            mean: c.mean !== null && c.mean !== undefined ? Number(c.mean) : null,
            std: c.std !== null && c.std !== undefined ? Number(c.std) : null,
            min: c.min !== null && c.min !== undefined ? Number(c.min) : null,
            max: c.max !== null && c.max !== undefined ? Number(c.max) : null,
            median: c.median !== null && c.median !== undefined ? Number(c.median) : null,
            nullPct: Number(c.null_pct || 0),
        }))
    }, [analysis.profile])

    const tabs: { id: TabId; label: React.ReactNode; roles: string[] }[] = [
        { id: 'overview', label: <div className="tab-label"><LayoutDashboard size={14} /> Overview</div>, roles: ['executive', 'analyst', 'scientist', 'engineer'] },
        { id: 'executive', label: <div className="tab-label"><Presentation size={14} /> Executive</div>, roles: ['executive', 'analyst'] },
        { id: 'profile', label: <div className="tab-label"><FileSearch size={14} /> Data Profile</div>, roles: ['analyst', 'scientist', 'engineer'] },
        { id: 'quality', label: <div className="tab-label"><ShieldAlert size={14} /> Quality</div>, roles: ['analyst', 'engineer'] },
        { id: 'ml', label: <div className="tab-label"><BrainCircuit size={14} /> ML Results</div>, roles: ['scientist', 'analyst'] },
        { id: 'insights', label: <div className="tab-label"><Lightbulb size={14} /> Insights</div>, roles: ['executive', 'analyst', 'scientist', 'engineer'] },
        { id: 'recommendations', label: <div className="tab-label"><ClipboardList size={14} /> Recommendations</div>, roles: ['executive', 'analyst', 'scientist', 'engineer'] },
        { id: 'simulate', label: <div className="tab-label"><Target size={14} /> Simulate</div>, roles: ['executive', 'analyst', 'scientist'] },
        { id: 'forecast', label: <div className="tab-label"><TrendingUp size={14} /> Forecast</div>, roles: ['analyst', 'scientist', 'executive'] },
        { id: 'pivot', label: <div className="tab-label"><Grid size={14} /> Pivot Analysis</div>, roles: ['analyst', 'engineer', 'scientist'] },
        { id: 'monitoring', label: <div className="tab-label"><Activity size={14} /> Monitoring</div>, roles: ['analyst', 'engineer', 'executive'] },
    ]

    const copyPrompt = (prompt: string, label: string) => {
        navigator.clipboard.writeText(prompt)
        setCopiedPrompt(label)
        setTimeout(() => setCopiedPrompt(null), 2000)
    }

    // Pipeline stages for progress banner
    const pipelineStages = [
        { label: 'Profiling', done: !!analysis.profile },
        { label: 'Quality Audit', done: !!analysis.quality },
        { label: 'ML Pipeline', done: !!analysis.ml_results },
        { label: 'Insights', done: !!analysis.prescriptive },
        { label: 'Charts', done: (analysis.charts?.length || 0) > 0 },
    ]
    const completedStages = pipelineStages.filter(s => s.done).length
    const progressPct = Math.round((completedStages / pipelineStages.length) * 100)

    return (
        <div>
            {/* Pipeline Progress Banner — visible while background analysis is running */}
            {!analysisComplete && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.08))',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    marginBottom: '1rem',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {/* Animated glow bar at top */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, height: '3px',
                        width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)',
                        borderRadius: '3px',
                        transition: 'width 0.8s ease',
                        boxShadow: '0 0 12px rgba(99, 102, 241, 0.6)',
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#a5b4fc' }}>
                            Deep analysis running in background — results will appear automatically
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.75rem' }}>
                        {pipelineStages.map((stage, i) => (
                            <span key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <span style={{
                                    color: stage.done ? '#34d399' : 'var(--text-muted)',
                                    fontWeight: stage.done ? 600 : 400,
                                }}>
                                    {stage.done ? '✓' : '○'} {stage.label}
                                </span>
                                {i < pipelineStages.length - 1 && (
                                    <span style={{ color: 'var(--text-muted)', margin: '0 0.15rem' }}>→</span>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Proactive Anomaly Alert */}
            {anomalyReport && anomalyReport.risk_level === 'high' && activeTab !== 'monitoring' && (
                <div 
                    onClick={() => setActiveTab('monitoring')}
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '12px',
                        padding: '0.75rem 1rem',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                    }}
                    className="animate-pulse"
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <AlertTriangle className="text-red-500" size={18} />
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fca5a5' }}>High Risk Anomaly Detected</div>
                            <div style={{ fontSize: '0.75rem', color: '#f87171' }}>{anomalyReport.summary}</div>
                        </div>
                    </div>
                    <button className="btn btn--secondary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>Investigate</button>
                </div>
            )}
            {/* Session Header */}
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.1rem' }}> {session.filename}</h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                        {session.row_count.toLocaleString()} rows × {session.column_count} cols
                    </span>
                    <button 
                        onClick={() => setShowPresenter(true)}
                        className="btn btn--accent"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.75rem', fontSize: '0.75rem', borderRadius: '20px' }}
                    >
                        <Play size={12} fill="currentColor" /> Presenter Mode
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', position: 'relative', alignItems: 'flex-start' }}>
                {/* Resizable Sidebar with Tabs */}
                <div style={{ width: sidebarWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(12px)', borderRadius: '1rem', border: '1px solid rgba(30, 41, 59, 1)', padding: '1rem', position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', padding: '0 0.5rem' }}>Analysis Modules</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {tabs.filter(t => t.roles.includes(role)).map(tab => (
                            <button 
                                key={tab.id} 
                                onClick={() => setActiveTab(tab.id)} 
                                style={{
                                    width: '100%', textAlign: 'left', padding: '0.75rem 1rem', minHeight: '44px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 200ms', fontWeight: 600, fontSize: '0.875rem', border: '1px solid transparent', cursor: 'pointer', fontFamily: 'var(--font-body)',
                                    background: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent',
                                    color: activeTab === tab.id ? 'var(--bg-primary)' : 'var(--text-muted)'
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Resizer */}
                <div 
                    onMouseDown={startResizing}
                    style={{ width: '6px', cursor: 'col-resize', background: 'transparent', zIndex: 20, flexShrink: 0, alignSelf: 'stretch' }}
                />

                {/* Main Content Area */}
                <div style={{ flex: 1, minWidth: 0, width: '100%' }}>

            {/* KPI Strip */}
            <div className="kpi-strip">
                {kpiCharts.length > 0 ? kpiCharts.map((kpi: ChartConfig) => (
                    <div key={kpi.chart_id} className="kpi-card">
                        <div className="kpi-card__label">{kpi.title}</div>
                        <div className="kpi-card__value">{formatValue(kpi.kpi_value, kpi.title)}</div>
                        {kpi.kpi_label && <div className="kpi-card__sub">{kpi.kpi_label}</div>}
                        {kpi.kpi_trend && <div className={`kpi-card__trend kpi-card__trend--${kpi.kpi_trend}`}>
                            {kpi.kpi_trend === 'up' ? '↑' : kpi.kpi_trend === 'down' ? '↓' : '→'} {kpi.kpi_change || kpi.kpi_trend}
                        </div>}
                    </div>
                )) : derivedKpis.map((kpi, i) => (
                    <div key={i} className="kpi-card">
                        <div className="kpi-card__label">{kpi.label}</div>
                        <div className="kpi-card__value">{formatValue(kpi.value, kpi.label)}</div>
                        {kpi.sub && <div className="kpi-card__sub">{kpi.sub}</div>}
                        {kpi.trend && <div className={`kpi-card__trend kpi-card__trend--${kpi.trend}`}>
                            {kpi.trend === 'up' ? '↑ Good' : kpi.trend === 'down' ? '↓ Needs Attention' : '→ Stable'}
                        </div>}
                    </div>
                ))}
            </div>

            {/* ═══ OVERVIEW TAB ═══ */}
            {activeTab === 'overview' && (
                <>
                    {/* Executive Summary */}
                    {analysis.prescriptive?.executive_summary && (
                        <div className="card" style={{ marginBottom: '1.5rem' }}>
                            <div className="card__header">
                                <span className="card__title">Executive Summary</span>
                                {analysis.quality && <span className={`quality-badge quality-badge--${analysis.quality.grade}`}>{analysis.quality.grade}</span>}
                            </div>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{analysis.prescriptive.executive_summary}</p>
                        </div>
                    )}

                    {/* Export & Download Panel */}
                    <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(0, 255, 135, 0.2)' }}>
                        <div className="card__header"><span className="card__title">Export & Download</span></div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Download your data and analysis in multiple formats
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {[
                                { icon: <FileText size={16} />, label: 'CSV Data', format: 'csv', desc: 'Cleaned dataset', isDownload: true, roles: ['executive', 'manager', 'analyst', 'scientist', 'engineer'] },
                                { icon: <Table size={16} />, label: 'Excel Workbook', format: 'excel', desc: 'Multi-sheet analysis', isDownload: false, roles: ['executive', 'manager', 'analyst', 'scientist', 'engineer'] },
                                { icon: <FileSpreadsheet size={16} />, label: 'Adv Excel Dash', format: 'excel', desc: 'Interactive KPI sheet', isDownload: false, params: { advanced: 'true' }, roles: ['manager', 'analyst', 'scientist', 'engineer'] },
                                { icon: <Table size={16} />, label: 'PowerBI Dash', format: 'powerbi', desc: 'PBIX data blueprint', isDownload: false, roles: ['manager', 'analyst', 'scientist', 'engineer'] },
                                { icon: <LayoutDashboard size={16} />, label: 'HTML Dashboard', format: 'html', desc: 'Standalone web page', isDownload: false, roles: ['executive', 'manager', 'analyst', 'scientist', 'engineer'] },
                                { icon: <FileCode size={16} />, label: 'Jupyter Notebook', format: 'notebook', desc: 'Reproducible code', isDownload: false, roles: ['scientist', 'engineer'] },
                                { icon: <BookOpen size={16} />, label: 'PDF Report', format: 'pdf', desc: 'Print-ready report', isDownload: false, roles: ['executive', 'manager', 'analyst'] },
                            ]
                                .filter(item => item.roles.includes(role))
                                .map((item, idx) => (
                                    <button
                                        key={`${item.format}-${idx}`}
                                        onClick={() => {
                                            const url = item.isDownload
                                                ? getDownloadUrl(session.session_id)
                                                : getExportUrl(session.session_id, item.format, item.params)
                                            window.open(url, '_blank')
                                        }}
                                        style={{
                                            padding: '0.6rem 1rem', fontSize: '0.78rem', fontWeight: 500,
                                            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-body)',
                                            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                                            transition: 'all 150ms ease', minWidth: '140px',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.color = 'var(--accent-primary)' }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                                            {item.icon} {item.label}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{item.desc}</div>
                                    </button>
                                ))}
                        </div>
                    </div>

                    {/* Interactive Chart Controls */}
                    {otherCharts.filter((chart: ChartConfig) => !chart.role_visibility || chart.role_visibility.includes(role)).length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            {/* Chart Filter Toolbar */}
                            <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Charts</span>
                                        {['all', 'bar', 'pie', 'scatter', 'line', 'heatmap', 'histogram', 'box', 'treemap', 'waterfall', 'bubble', 'gauge'].map(type => {
                                            const count = type === 'all' ? otherCharts.filter((c: ChartConfig) => !c.role_visibility || c.role_visibility.includes(role)).length
                                                : otherCharts.filter((c: ChartConfig) => (!c.role_visibility || c.role_visibility.includes(role)) && (c.chart_type === type || (type === 'pie' && c.chart_type === 'doughnut'))).length
                                            if (count === 0 && type !== 'all') return null
                                            return (
                                                <button key={type} onClick={() => setChartTypeFilter(type)} style={{
                                                    padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
                                                    border: chartTypeFilter === type ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
                                                    borderRadius: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)',
                                                    background: chartTypeFilter === type ? 'rgba(0, 229, 255, 0.15)' : 'var(--bg-elevated)',
                                                    color: chartTypeFilter === type ? 'var(--accent-primary)' : 'var(--text-muted)',
                                                    transition: 'all 200ms ease',
                                                }}>
                                                    {type === 'all' ? 'All' : type === 'bar' ? 'Bar' : type === 'pie' ? 'Pie' : type === 'scatter' ? 'Scatter' : type === 'line' ? 'Line' : type === 'heatmap' ? '️ Heatmap' : type === 'histogram' ? 'Histogram' : type === 'box' ? 'Box' : type === 'treemap' ? '️ Treemap' : type === 'waterfall' ? 'Waterfall' : type === 'bubble' ? 'Bubble' : type === 'gauge' ? 'Gauge' : type.charAt(0).toUpperCase() + type.slice(1)} ({count})
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div style={{ position: 'relative', minWidth: '200px' }}>
                                        <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.75rem' }}></span>
                                        <input
                                            type="text" placeholder="Search charts..." value={chartSearch}
                                            onChange={(e) => setChartSearch(e.target.value)}
                                            style={{
                                                width: '100%', padding: '0.4rem 0.6rem 0.4rem 1.8rem', fontSize: '0.75rem',
                                                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                                                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                                                fontFamily: 'var(--font-body)',
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Filtered Chart Grid */}
                            <div className="chart-grid">
                                {otherCharts
                                    .filter((chart: ChartConfig) => !chart.role_visibility || chart.role_visibility.includes(role))
                                    .filter((chart: ChartConfig) => chartTypeFilter === 'all' || chart.chart_type === chartTypeFilter || (chartTypeFilter === 'pie' && chart.chart_type === 'doughnut'))
                                    .filter((chart: ChartConfig) => {
                                        if (!chartSearch) return true
                                        const term = chartSearch.toLowerCase()
                                        return chart.title.toLowerCase().includes(term) || (chart.description || '').toLowerCase().includes(term) || chart.chart_type.toLowerCase().includes(term)
                                    })
                                    .map((chart: ChartConfig) => (
                                        <ChartPanel
                                            key={chart.chart_id}
                                            chart={chart}
                                            onChartClick={(point) => handleSetFilter(String(point.x || point.label || point.customdata || ''))}
                                        />
                                    ))}
                            </div>
                            {otherCharts
                                .filter((chart: ChartConfig) => !chart.role_visibility || chart.role_visibility.includes(role))
                                .filter((chart: ChartConfig) => chartTypeFilter === 'all' || chart.chart_type === chartTypeFilter)
                                .filter((chart: ChartConfig) => !chartSearch || chart.title.toLowerCase().includes(chartSearch.toLowerCase()) || (chart.description || '').toLowerCase().includes(chartSearch.toLowerCase()))
                                .length === 0 && (
                                    <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No charts match your filter. Try changing the chart type or search term.
                                    </div>
                                )}
                        </div>
                    )}
                    {/* Smart Data Extraction */}
                    <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(0, 229, 255, 0.2)' }}>
                        <div className="card__header"><span className="card__title">Smart Data Extraction (AI Prompts)</span></div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Click to copy a prompt → Paste into AI Chat for deep analysis
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                            {[
                                { label: 'Extract Anomalies', prompt: `Analyze the ${session.filename} dataset and identify all anomalies. Show me which rows are anomalous, why they're unusual, and their potential impact. Include statistical thresholds used.` },
                                { label: 'Generate Cleanup Script', prompt: `Generate a complete Python pandas script to clean the ${session.filename} dataset. Handle nulls, duplicates, outliers, type conversions, and standardize formats. Include before/after statistics.` },
                                { label: 'Correlation Deep Dive', prompt: `Perform a deep correlation analysis on ${session.filename}. Identify the strongest positive and negative correlations, explain their business meaning, and flag any suspicious multicollinearity.` },
                                { label: 'Forecast Next Period', prompt: `Based on the trends in ${session.filename}, generate a forecast for the next period. Explain the methodology, confidence intervals, and key assumptions. Highlight risks to the forecast.` },
                                { label: 'Top 5 Actionable Insights', prompt: `Give me the top 5 most actionable business insights from ${session.filename}. For each, specify: the finding, evidence from the data, recommended action, expected impact, and implementation priority.` },
                                { label: 'Feature Engineering', prompt: `Suggest the best feature engineering transformations for ${session.filename}. Include polynomial features, interactions, binning strategies, and encoding recommendations. Show Python code for each.` },
                            ].map(item => (
                                <button key={item.label} onClick={() => copyPrompt(item.prompt, item.label)} style={{
                                    padding: '0.6rem 0.8rem', fontSize: '0.78rem', fontWeight: 500, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)',
                                    background: copiedPrompt === item.label ? 'rgba(0, 255, 135, 0.1)' : 'var(--bg-elevated)',
                                    color: copiedPrompt === item.label ? 'var(--accent-success)' : 'var(--text-secondary)',
                                    transition: 'all 150ms ease',
                                }}>
                                    {copiedPrompt === item.label ? 'Copied!' : item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Charts */}
                    {/* Data Preview */}
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="card__title">Data Preview (First 5 Rows)</span>
                            {activeFilter && (
                                <button
                                    onClick={() => handleSetFilter(null)}
                                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: 'var(--accent-warning)', border: 'none', borderRadius: '4px', color: '#000', cursor: 'pointer' }}
                                >Clear Filter: {activeFilter}
                                </button>
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="profile-table">
                                <thead><tr>
                                    {session.columns.slice(0, 12).map(col => <th key={col}>{col}</th>)}
                                    {session.columns.length > 12 && <th>...</th>}
                                </tr></thead>
                                <tbody>
                                    {session.preview
                                        .filter(row => !activeFilter || Object.values(row).some(v => String(v).includes(activeFilter)))
                                        .map((row, i) => (
                                            <tr key={i}>
                                                {session.columns.slice(0, 12).map(col => (
                                                    <td key={col}>{row[col] !== null && row[col] !== undefined ? String(row[col]).substring(0, 40) : '—'}</td>
                                                ))}
                                                {session.columns.length > 12 && <td style={{ color: 'var(--text-muted)' }}>+{session.columns.length - 12} cols</td>}
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Column Types */}
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="card__header"><span className="card__title">️ Column Types</span></div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {session.columns.map(col => (
                                <div key={col} style={{
                                    padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
                                    background: session.dtypes[col]?.includes('int') || session.dtypes[col]?.includes('float') ? 'rgba(0, 229, 255, 0.1)' : session.dtypes[col]?.includes('datetime') ? 'rgba(123, 47, 255, 0.1)' : session.dtypes[col]?.includes('bool') ? 'rgba(0, 255, 135, 0.1)' : 'rgba(255, 184, 0, 0.1)',
                                    color: session.dtypes[col]?.includes('int') || session.dtypes[col]?.includes('float') ? 'var(--accent-primary)' : session.dtypes[col]?.includes('datetime') ? 'var(--accent-secondary)' : session.dtypes[col]?.includes('bool') ? 'var(--accent-success)' : 'var(--accent-warning)',
                                }}>
                                    {col} <span style={{ opacity: 0.5 }}>({session.dtypes[col]})</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Inline Numeric Stats */}
                    {numericStats.length > 0 && (
                        <div className="card" style={{ marginBottom: '1.5rem' }}>
                            <div className="card__header"><span className="card__title">Numeric Column Statistics</span></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                {numericStats.map(col => (
                                    <div key={col.name} className="stat-card">
                                        <div className="stat-card__name">{col.name}</div>
                                        <div className="stat-card__grid">
                                            <div><span className="stat-card__label">Mean</span><span className="stat-card__val">{col.mean !== null ? col.mean.toFixed(2) : '—'}</span></div>
                                            <div><span className="stat-card__label">Median</span><span className="stat-card__val">{col.median !== null ? col.median.toFixed(2) : '—'}</span></div>
                                            <div><span className="stat-card__label">Std</span><span className="stat-card__val">{col.std !== null ? col.std.toFixed(2) : '—'}</span></div>
                                            <div><span className="stat-card__label">Range</span><span className="stat-card__val">{col.min !== null && col.max !== null ? `${col.min.toFixed(1)}–${col.max.toFixed(1)}` : '—'}</span></div>
                                        </div>
                                        <div style={{ marginTop: '0.4rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                                                <span>Null %</span><span>{col.nullPct.toFixed(1)}%</span>
                                            </div>
                                            <div style={{ height: '3px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${Math.min(col.nullPct, 100)}%`, background: col.nullPct > 30 ? 'var(--accent-danger)' : col.nullPct > 10 ? 'var(--accent-warning)' : 'var(--accent-success)', borderRadius: '2px' }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </>
            )}


            {/* ═══ PROFILE TAB ═══ */}
            {activeTab === 'profile' && (
                analysis.profile ? <ProfileSection profile={analysis.profile} /> :
                    <div className="card"><p style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>Profile data not available</p></div>
            )}

            {/* ═══ QUALITY TAB ═══ */}
            {activeTab === 'quality' && (
                <DataHealthDashboard sessionId={session.session_id} onDataUpdate={() => window.location.reload()} />
            )}

            {/* ═══ ML RESULTS TAB ═══ */}
            {activeTab === 'ml' && (
                analysis.ml_results ? <MLSection ml={analysis.ml_results as Record<string, unknown>} charts={otherCharts} /> :
                    <div className="card"><p style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>ML results not available</p></div>
            )}

            {/* ═══ INSIGHTS TAB ═══ */}
            {activeTab === 'insights' && (
                <>
                    {analysis.prescriptive?.ranked_insights && analysis.prescriptive.ranked_insights.length > 0 && (
                        <div className="insights-section" style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Ranked Business Insights</h3>
                            {analysis.prescriptive.ranked_insights.map((insight: Record<string, unknown>, i: number) => (
                                <div key={i} className="insight-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '4px', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{String(insight.insight_class || '')}</span>
                                            <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{String(insight.title || '')}</strong>
                                        </div>
                                        <span className={`insight-card__badge`} style={{ background: insight.impact === 'High' ? 'rgba(255,61,87,0.15)' : insight.impact === 'Medium' ? 'rgba(255,184,0,0.15)' : 'rgba(0,255,135,0.15)', color: insight.impact === 'High' ? 'var(--accent-danger)' : insight.impact === 'Medium' ? 'var(--accent-warning)' : 'var(--accent-success)' }}>{String(insight.impact || 'Low')} Impact</span>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{String(insight.description || '')}</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-primary)' }}>
                                        <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem' }}><strong style={{ color: 'var(--accent-primary)' }}>ROI:</strong> <span style={{ color: 'var(--text-primary)' }}>{String(insight.roi_estimate || '')}</span></div>
                                        <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Action:</strong> <span style={{ color: 'var(--text-secondary)' }}>{String(insight.action || '')}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {analysis.prescriptive?.what_if_scenarios && analysis.prescriptive.what_if_scenarios.length > 0 && (
                        <div className="insights-section" style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>What-If ROI Scenarios</h3>
                            {analysis.prescriptive.what_if_scenarios.map((scenario: Record<string, unknown>, i: number) => (
                                <div key={i} className="insight-card">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                        <span className={`insight-card__badge insight-card__badge--${String(scenario.priority || 'p3').toLowerCase()}`}>{String(scenario.priority || 'P3')}</span>
                                        <strong style={{ fontSize: '0.9rem' }}>{String(scenario.title || 'Scenario')}</strong>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{String(scenario.lever || scenario.description || '')}</p>
                                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {Boolean(scenario.annual_impact) && <span> {String(scenario.annual_impact)}</span>}
                                        {Boolean(scenario.timeline) && <span> {String(scenario.timeline)}</span>}
                                        {Boolean(scenario.owner) && <span> {String(scenario.owner)}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <RoleRecommendations analysis={analysis} role={role} />
                    {role === 'engineer' && analysis.quality?.auto_clean_script && (
                        <div className="card" style={{ marginTop: '1.5rem' }}>
                            <div className="card__header">
                                <span className="card__title">Auto-Cleaning Script</span>
                                <button className="btn btn--secondary" onClick={() => navigator.clipboard.writeText(analysis.quality!.auto_clean_script)} style={{ fontSize: '0.75rem' }}>Copy</button>
                            </div>
                            <pre style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', overflow: 'auto', maxHeight: '300px' }}>
                                {analysis.quality.auto_clean_script}
                            </pre>
                        </div>
                    )}
                </>
            )}

            {/* ═══ RECOMMENDATIONS TAB ═══ */}
            {activeTab === 'recommendations' && (
                recsLoading ? (
                    <div className="loading-overlay" style={{ minHeight: '300px' }}>
                        <div className="spinner" />
                        <div style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Generating role-specific recommendations...</div>
                    </div>
                ) : recs ? (
                    <RecommendationsTab recs={recs} role={role} />
                ) : (
                    <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                        <p style={{ color: 'var(--text-muted)' }}>Click to load recommendations</p>
                    </div>
                )
            )}

            {/* ═══ EXECUTIVE TAB ═══ */}
            {activeTab === 'executive' && (
                <ExecutiveSummary sessionId={session.session_id} />
            )}

            {/* ═══ SIMULATE TAB ═══ */}
            {activeTab === 'simulate' && (
                <SimulationPanel sessionId={session.session_id} columns={session.columns} analysis={analysis} />
            )}

            {/* ═══ FORECAST TAB ═══ */}
            {activeTab === 'forecast' && (
                <ForecastPanel session={session} />
            )}

            {/* ═══ PIVOT TAB ═══ */}
            {activeTab === 'pivot' && (
                <PivotEngine session={session} />
            )}

            {/* ═══ MONITORING TAB ═══ */}
            {activeTab === 'monitoring' && (
                <AnomalyPanel sessionId={session.session_id} />
            )}

            {/* Download & Export Bar */}
            <div style={{ marginTop: '2rem', paddingBottom: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                    <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Download Data</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <a href={getDownloadUrl(session.session_id, true)} className="btn btn--primary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>⬇ CSV (Enriched)</a>
                            <a href={getDownloadUrl(session.session_id, false)} className="btn btn--secondary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>⬇ CSV (Original)</a>
                        </div>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Export Reports</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {[
                                { format: 'excel', label: 'Excel', roles: ['executive', 'manager', 'analyst', 'scientist', 'engineer'] },
                                { format: 'html', label: 'HTML', roles: ['executive', 'manager', 'analyst', 'scientist', 'engineer'] },
                                { format: 'notebook', label: 'Notebook', roles: ['scientist', 'engineer'] },
                                { format: 'pdf', label: 'PDF', roles: ['executive', 'manager', 'analyst'] },
                            ]
                                .filter(item => item.roles.includes(role))
                                .map(({ format, label }) => (
                                    <a key={format} href={getExportUrl(session.session_id, format)} target="_blank" rel="noopener noreferrer" className="btn btn--secondary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>{label}</a>
                                ))}
                        </div>
                    </div>
                </div>
            </div>
            
            {showPresenter && (
                <PresenterMode 
                    sessionId={session.session_id} 
                    session={session}
                    analysis={analysis} 
                    onClose={() => setShowPresenter(false)} 
                />
            )}

            <NexusCopilot 
                sessionId={session.session_id} 
                activeTab={activeTab}
                setActiveTab={(tab) => setActiveTab(tab as TabId)}
                onActionTriggered={(type, payload) => {
                    if (type === 'simulate') {
                        setActiveTab('simulate');
                    } else if (type === 'clean') {
                        setActiveTab('quality');
                    } else if (type === 'visualize') {
                        setActiveTab('overview');
                    } else if (type === 'forecast') {
                        setActiveTab('forecast');
                    } else if (type === 'pivot') {
                        setActiveTab('pivot');
                    } else if (type === 'navigate') {
                        if (payload.target_tab) setActiveTab(payload.target_tab as TabId);
                    }
                }}
            />

                </div>
            </div>
        </div>
    )
}

/* ═══ PROFILE SECTION ═══ */
function ProfileSection({ profile }: { profile: Record<string, unknown> }) {
    const [searchTerm, setSearchTerm] = useState('')
    const columns = (profile.column_profiles || []) as Record<string, unknown>[]
    const correlations = (profile.correlation_pairs || profile.correlations || []) as Record<string, unknown>[]

    const filteredColumns = columns.filter((col: any) => String(col.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(col.dtype_family).toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div>
            {/* Search Input */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}></span>
                    <input
                        type="text" placeholder="Search columns or data types..." value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                    />
                </div>
            </div>
            <div className="kpi-strip" style={{ marginBottom: '1.5rem' }}>
                <div className="kpi-card"><div className="kpi-card__label">Rows</div><div className="kpi-card__value">{Number(profile.row_count || 0).toLocaleString()}</div></div>
                <div className="kpi-card" key={`filtered-${filteredColumns.length}`}><div className="kpi-card__label">Columns (Filtered)</div><div className="kpi-card__value">{Number(filteredColumns.length).toLocaleString()}</div></div>
                <div className="kpi-card"><div className="kpi-card__label">Duplicates</div><div className="kpi-card__value">{Number(profile.duplicate_rows || 0).toLocaleString()}</div><div className="kpi-card__sub">{Number(profile.duplicate_pct || 0).toFixed(1)}%</div></div>
                <div className="kpi-card"><div className="kpi-card__label">Memory</div><div className="kpi-card__value">{Number(profile.memory_usage_mb || 0).toFixed(1)} MB</div></div>
            </div>

            {columns.length > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card__header"><span className="card__title">Column Statistics ({columns.length})</span></div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="profile-table">
                            <thead><tr><th>Column</th><th>Type</th><th>Null %</th><th>Unique</th><th>Mean</th><th>Std</th><th>Min</th><th>Max</th><th>Skew</th></tr></thead>
                            <tbody>
                                {filteredColumns.map((col, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{String(col.name || '')}</td>
                                        <td><span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', background: col.dtype_family === 'numeric' ? 'rgba(0,229,255,0.1)' : col.dtype_family === 'datetime' ? 'rgba(123,47,255,0.1)' : 'rgba(255,184,0,0.1)', color: col.dtype_family === 'numeric' ? 'var(--accent-primary)' : col.dtype_family === 'datetime' ? 'var(--accent-secondary)' : 'var(--accent-warning)' }}>{String(col.dtype_family || col.dtype_raw || '?')}</span></td>
                                        <td style={{ color: Number(col.null_pct || 0) > 30 ? 'var(--accent-danger)' : 'var(--text-secondary)' }}>{Number(col.null_pct || 0).toFixed(1)}%</td>
                                        <td>{Number(col.unique_count || 0).toLocaleString()}</td>
                                        <td>{col.mean != null ? Number(col.mean).toFixed(2) : '—'}</td>
                                        <td>{col.std != null ? Number(col.std).toFixed(2) : '—'}</td>
                                        <td>{col.min != null ? String(col.min).substring(0, 12) : '—'}</td>
                                        <td>{col.max != null ? String(col.max).substring(0, 12) : '—'}</td>
                                        <td style={{ color: Math.abs(Number(col.skewness || 0)) > 2 ? 'var(--accent-warning)' : 'var(--text-secondary)' }}>{col.skewness != null ? Number(col.skewness).toFixed(2) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {correlations.length > 0 && (
                <div className="card">
                    <div className="card__header"><span className="card__title">Significant Correlations</span></div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="profile-table">
                            <thead><tr><th>Column A</th><th>Column B</th><th>Pearson r</th><th>Strength</th><th>Direction</th></tr></thead>
                            <tbody>
                                {(correlations as Record<string, unknown>[]).slice(0, 20).map((pair, i) => (
                                    <tr key={i}>
                                        <td>{String(pair.col_a || '')}</td>
                                        <td>{String(pair.col_b || '')}</td>
                                        <td style={{ fontWeight: 600 }}>{Number(pair.pearson_r || 0).toFixed(4)}</td>
                                        <td><span style={{ padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', background: pair.strength === 'strong' ? 'rgba(0,255,135,0.15)' : 'rgba(255,184,0,0.15)', color: pair.strength === 'strong' ? 'var(--accent-success)' : 'var(--accent-warning)' }}>{String(pair.strength || '')}</span></td>
                                        <td style={{ color: pair.direction === 'positive' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{pair.direction === 'positive' ? '↗ Positive' : '↘ Negative'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}


/* ═══ ML SECTION ═══ */
function MLSection({ ml, charts }: { ml: Record<string, unknown>; charts: ChartConfig[] }) {
    const anomalies = ml.anomalies as Record<string, unknown> | undefined
    const segmentation = ml.segmentation as Record<string, unknown> | undefined
    const forecast = ml.forecast as Record<string, unknown> | undefined
    const features = ml.feature_importance as Record<string, unknown> | undefined
    const trends = ml.trends as Record<string, unknown> | undefined

    return (
        <div>
            <div className="kpi-strip" style={{ marginBottom: '1.5rem' }}>
                {anomalies && <div className="kpi-card"><div className="kpi-card__label">Anomalies</div><div className="kpi-card__value" style={{ color: 'var(--accent-danger)' }}>{Number(anomalies.anomaly_count || 0)}</div><div className="kpi-card__sub">{Number(anomalies.anomaly_pct || 0).toFixed(1)}% of data</div></div>}
                {segmentation && <div className="kpi-card"><div className="kpi-card__label">Clusters</div><div className="kpi-card__value" style={{ color: 'var(--accent-secondary)' }}>{Number(segmentation.optimal_k || 0)}</div><div className="kpi-card__sub">Silhouette: {Number(segmentation.silhouette_score || 0).toFixed(3)}</div></div>}
                {forecast && <div className="kpi-card"><div className="kpi-card__label">Forecast</div><div className="kpi-card__value" style={{ color: 'var(--accent-primary)' }}>{String(forecast.best_model || 'N/A')}</div><div className="kpi-card__sub">MAE: {Number(forecast.mae || 0).toFixed(2)}</div></div>}
                {features && <div className="kpi-card"><div className="kpi-card__label">Top Feature</div><div className="kpi-card__value" style={{ fontSize: '1rem', color: 'var(--accent-success)' }}>{String(((features.top_features || features.top_5_drivers || []) as string[])[0] || 'N/A')}</div><div className="kpi-card__sub">Most important</div></div>}
                {trends && <div className="kpi-card"><div className="kpi-card__label">Trend</div><div className="kpi-card__value" style={{ color: trends.direction === 'increasing' ? 'var(--accent-success)' : trends.direction === 'decreasing' ? 'var(--accent-danger)' : 'var(--text-muted)' }}>{trends.direction === 'increasing' ? 'Up' : trends.direction === 'decreasing' ? 'Down' : '️ Flat'}</div></div>}
            </div>

            {features && (features.importances as Record<string, number> | undefined) && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card__header"><span className="card__title">Feature Importance</span></div>
                    {Object.entries(features.importances as Record<string, number>).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, score], i) => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: '20px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                            <span style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{name}</span>
                            <div style={{ width: '150px', height: '6px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${score * 100}%`, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))', borderRadius: '3px' }} />
                            </div>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', width: '50px', textAlign: 'right' }}>{(score * 100).toFixed(1)}%</span>
                        </div>
                    ))}
                </div>
            )}

            {charts.length > 0 && (
                <div className="chart-grid">
                    {charts.map((chart: ChartConfig) => <ChartPanel key={chart.chart_id} chart={chart} />)}
                </div>
            )}
        </div>
    )
}

/* ═══ ROLE RECOMMENDATIONS ═══ */
function RoleRecommendations({ analysis, role }: { analysis: AnalysisResult; role: DashboardRole }) {
    const recs = useMemo(() => {
        if (!analysis.prescriptive) return []
        switch (role) {
            case 'executive': return []
            case 'analyst': return analysis.prescriptive.analyst_recommendations || []
            case 'scientist': return analysis.prescriptive.scientist_recommendations || []
            case 'engineer': return analysis.prescriptive.engineer_recommendations || []
        }
    }, [analysis, role])

    if (!recs || recs.length === 0) return null
    const roleLabel: Record<DashboardRole, string> = { executive: 'Executive', analyst: 'Analyst', scientist: 'Scientist', engineer: '️ Engineer' }

    return (
        <div className="insights-section" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>{roleLabel[role]} Recommendations</h3>
            {recs.map((rec: Record<string, unknown>, i: number) => (
                <div key={i} className="insight-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <span className={`insight-card__badge insight-card__badge--${String(rec.priority || 'p3').toLowerCase()}`}>{String(rec.priority || 'P3')}</span>
                        <strong style={{ fontSize: '0.9rem' }}>{String(rec.title || '')}</strong>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{String(rec.description || '')}</p>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        {Boolean(rec.impact) && <span>Impact: {String(rec.impact)}</span>}
                        {Boolean(rec.effort) && <span>Effort: {String(rec.effort)}</span>}
                    </div>
                </div>
            ))}
        </div>
    )
}

/* ═══ RECOMMENDATIONS TAB ═══ */
function RecommendationsTab({ recs, role }: { recs: Record<string, unknown>; role: DashboardRole }) {
    const roleMap: Record<string, { key: string; icon: string; label: string }> = {
        executive: { key: 'executive', icon: '', label: 'Executive' },
        analyst: { key: 'analyst', icon: '', label: 'Data Analyst' },
        scientist: { key: 'scientist', icon: '', label: 'Data Scientist' },
        engineer: { key: 'engineer', icon: '️', label: 'Data Engineer' },
    }

    const executive: Record<string, unknown> | null = (recs.executive as Record<string, unknown>) ?? null
    const roleKey = roleMap[role]?.key || 'analyst'
    const currentRoleData: any = recs[roleKey]
    const blueprints: Record<string, unknown> | null = (recs.dashboard_blueprints as Record<string, unknown>) ?? null
    const advancedCharts: Record<string, unknown>[] = (recs.advanced_charts as Record<string, unknown>[]) ?? []
    const premium: any = recs.premium_capabilities ?? null

    return (
        <div>
            {/* Executive Features */}
            {executive && (
                <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(255, 184, 0, 0.2)' }}>
                    <div className="card__header"><span className="card__title">Executive / Business Manager Features</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {((executive.features || []) as string[]).map((f, i) => (
                            <div key={i} style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)', background: i % 2 === 0 ? 'var(--bg-elevated)' : 'transparent', borderRadius: '4px' }}>{f}</div>
                        ))}
                    </div>
                    {((executive.charts || []) as Record<string, unknown>[]).length > 0 && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Recommended Charts for Executives</div>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {((executive.charts || []) as Record<string, unknown>[]).map((ch, j) => (
                                    <div key={j} style={{ padding: '0.5rem', background: 'var(--bg-elevated)', borderRadius: '4px', fontSize: '0.78rem' }}>
                                        <strong style={{ color: 'var(--accent-primary)' }}>{String(ch.type)}</strong> — {String(ch.columns)} <span style={{ color: 'var(--text-muted)' }}>({String(ch.reason)})</span> <span style={{ fontSize: '0.65rem', background: 'rgba(0,229,255,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: 'var(--accent-primary)' }}>{String(ch.dashboard)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Current Role Features */}
            <>{currentRoleData ? (
                <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(0, 229, 255, 0.2)' }}>
                    <div className="card__header"><span className="card__title">{String(roleMap[role]?.icon || '')} {String(roleMap[role]?.label || '')} Features</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {((currentRoleData.features || []) as string[]).map((f: string, i: number) => (
                            <div key={i} style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)', background: i % 2 === 0 ? 'var(--bg-elevated)' : 'transparent', borderRadius: '4px' }}>{f}</div>
                        ))}
                    </div>
                    {((currentRoleData.charts || []) as Record<string, unknown>[]).length > 0 && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Recommended Charts for {String(roleMap[role]?.label || '')}</div>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {((currentRoleData.charts || []) as Record<string, unknown>[]).map((ch: Record<string, unknown>, j: number) => (
                                    <div key={j} style={{ padding: '0.5rem', background: 'var(--bg-elevated)', borderRadius: '4px', fontSize: '0.78rem' }}>
                                        <strong style={{ color: 'var(--accent-primary)' }}>{String(ch.type)}</strong> — {String(ch.columns)} <span style={{ color: 'var(--text-muted)' }}>({String(ch.reason)})</span> <span style={{ fontSize: '0.65rem', background: 'rgba(0,229,255,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: 'var(--accent-primary)' }}>{String(ch.dashboard)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}</>

            {/* Power BI Blueprint */}
            {blueprints?.powerbi && (
                <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(123, 47, 255, 0.2)' }}>
                    <div className="card__header"><span className="card__title">Power BI Dashboard Blueprint</span></div>
                    {(() => {
                        const pbi = blueprints.powerbi as Record<string, unknown>; return (<>
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recommended Pages</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                    {((pbi.pages || []) as Record<string, unknown>[]).map((page, i) => (
                                        <div key={i} style={{ padding: '0.6rem', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-secondary)', marginBottom: '0.3rem' }}>{String(page.name)}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{((page.visuals || []) as string[]).join('•')}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>Slicers & Filters</div>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    {((pbi.slicers || []) as string[]).map((s, i) => (
                                        <span key={i} style={{ padding: '0.25rem 0.6rem', background: 'rgba(123,47,255,0.1)', borderRadius: '4px', fontSize: '0.72rem', color: 'var(--accent-secondary)' }}>{s}</span>
                                    ))}
                                </div>
                            </div>
                            {((pbi.kpi_cards || []) as Record<string, unknown>[]).length > 0 && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>KPI DAX Measures</div>
                                    {((pbi.kpi_cards || []) as Record<string, unknown>[]).slice(0, 4).map((kpi, i) => (
                                        <div key={i} style={{ padding: '0.4rem 0.6rem', background: 'var(--bg-primary)', borderRadius: '4px', marginBottom: '0.3rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                                            {String(kpi.dax_sum || kpi.dax_avg || '')}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Bookmarks</div>
                                    {((pbi.bookmarks || []) as string[]).map((b, i) => (
                                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.15rem 0' }}>▸ {b}</div>
                                    ))}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Mobile Tips</div>
                                    {((pbi.mobile_tips || []) as string[]).map((t, i) => (
                                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.15rem 0' }}>▸ {t}</div>
                                    ))}
                                </div>
                            </div>
                        </>)
                    })()}
                </div>
            )}

            {/* Excel Blueprint */}
            {blueprints?.excel && (
                <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(0, 255, 135, 0.2)' }}>
                    <div className="card__header"><span className="card__title">Excel Dashboard Blueprint</span></div>
                    {(() => {
                        const xl = blueprints.excel as Record<string, unknown>; return (<>
                            <div style={{ marginBottom: '0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                <strong>Layout:</strong> {String(xl.layout || '')}
                            </div>
                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Slicers</div>
                                    {((xl.slicers || []) as string[]).map((s, i) => (
                                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.15rem 0' }}>▸ {s}</div>
                                    ))}
                                </div>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Conditional Formatting</div>
                                    {((xl.conditional_formatting || []) as string[]).map((c, i) => (
                                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.15rem 0' }}>▸ {c}</div>
                                    ))}
                                </div>
                            </div>
                            {((xl.kpi_cards || []) as string[]).length > 0 && (
                                <div style={{ marginTop: '0.75rem' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>KPI Formulas</div>
                                    {((xl.kpi_cards || []) as string[]).slice(0, 3).map((f, i) => (
                                        <div key={i} style={{ padding: '0.3rem 0.6rem', background: 'var(--bg-primary)', borderRadius: '4px', marginBottom: '0.2rem', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-success)' }}>{f}</div>
                                    ))}
                                </div>
                            )}
                        </>)
                    })()}
                </div>
            )}

            {/* Advanced Chart Recommendations */}
            {advancedCharts.length > 0 && (
                <div className="card" style={{ borderColor: 'rgba(0, 229, 255, 0.2)' }}>
                    <div className="card__header"><span className="card__title">Advanced Chart Recommendations ({advancedCharts.length})</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                        {advancedCharts.map((ch, i) => (
                            <div key={i} style={{ padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-primary)' }}>{String(ch.type)}</span>
                                    <span style={{ fontSize: '0.6rem', background: 'rgba(123,47,255,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px', color: 'var(--accent-secondary)' }}>{String(ch.dashboard || 'Both')}</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                                    <strong>Columns:</strong> {typeof ch.columns === 'object' ? Object.entries(ch.columns as Record<string, unknown>).map(([k, v]) => `${k}: ${Array.isArray(v) ? (v as string[]).join(',') : String(v)}`).join('|') : String(ch.columns)}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{String(ch.reason)}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Best for: <span style={{ color: 'var(--accent-warning)' }}>{String(ch.best_role)}</span> — {String(ch.role_reason)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ v6.0 PREMIUM CAPABILITIES ═══ */}
            {premium && (
                <div style={{ marginTop: '1.5rem' }}>
                    {/* Conversational Analytics */}
                    {premium.conversational_analytics?.length > 0 && (
                        <div className="card" style={{ marginBottom: '1rem', borderColor: 'rgba(0, 229, 255, 0.2)' }}>
                            <div className="card__header"><span className="card__title">Smart Follow-Up Questions (AI Chat Sidebar)</span></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {(premium.conversational_analytics as string[])?.map((q: string, i: number) => (
                                    <div key={i} style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: 'var(--accent-primary)', background: 'var(--bg-elevated)', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border)' }}> {q}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Insight ROI Ranking */}
                    {premium.insight_ranking?.length > 0 && (
                        <div className="card" style={{ marginBottom: '1rem', borderColor: 'rgba(255, 215, 0, 0.2)' }}>
                            <div className="card__header"><span className="card__title">Insight Ranking & ROI Estimates</span></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {(premium.insight_ranking as any[])?.map((ins: any, i: number) => (
                                    <div key={i} style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                            <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{ins.insight}</strong>
                                            <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, background: ins.impact === 'High' ? 'rgba(255,87,87,0.15)' : ins.impact === 'Medium' ? 'rgba(255,184,0,0.15)' : 'rgba(0,229,255,0.1)', color: ins.impact === 'High' ? '#ff5757' : ins.impact === 'Medium' ? '#ffb800' : 'var(--accent-primary)' }}>{ins.impact}</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ins.estimated_value}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--accent-success)', marginTop: '0.2rem' }}>→ {ins.action}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Industry Benchmarking */}
                    {premium.industry_benchmarking && (
                        <div className="card" style={{ marginBottom: '1rem', borderColor: 'rgba(123, 47, 255, 0.2)' }}>
                            <div className="card__header"><span className="card__title">Industry Benchmarking</span></div>
                            <div style={{ padding: '0.5rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                <div style={{ marginBottom: '0.5rem' }}><strong>Detected Industry:</strong> <span style={{ color: 'var(--accent-primary)' }}>{premium.industry_benchmarking.detected_industry}</span></div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{premium.industry_benchmarking.note}</div>
                                {(premium.industry_benchmarking.comparisons as string[])?.map((c: string, i: number) => (
                                    <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.2rem 0' }}>▸ {c}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Automated Report Structure */}
                    {premium.automated_report?.slides?.length > 0 && (
                        <div className="card" style={{ marginBottom: '1rem', borderColor: 'rgba(0, 255, 135, 0.2)' }}>
                            <div className="card__header"><span className="card__title">Automated Report Structure ({premium.automated_report.format})</span></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
                                {(premium.automated_report.slides as any[])?.map((slide: any, i: number) => (
                                    <div key={i} style={{ padding: '0.6rem', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-primary)', marginBottom: '0.3rem' }}>Slide {i + 1}: {slide.name}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{slide.content}</div>
                                        {(slide.includes as string[])?.slice(0, 3)?.map((inc: string, j: number) => (
                                            <div key={j} style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>▸ {inc}</div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI Chat Sidebar Specs */}
                    {premium.chat_sidebar && (
                        <div className="card" style={{ marginBottom: '1rem', borderColor: 'rgba(0, 229, 255, 0.3)' }}>
                            <div className="card__header"><span className="card__title">Real-Time AI Chat Sidebar</span></div>
                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Capabilities</div>
                                    {(premium.chat_sidebar.capabilities as string[])?.slice(0, 6)?.map((c: string, i: number) => (
                                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.15rem 0' }}>▸ {c}</div>
                                    ))}
                                </div>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>️ Example Queries</div>
                                    {(premium.chat_sidebar.example_queries as string[])?.map((q: string, i: number) => (
                                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', padding: '0.15rem 0', fontStyle: 'italic' }}>"{q}"</div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Position: {premium.chat_sidebar.position} • Width: {premium.chat_sidebar.width}</div>
                        </div>
                    )}

                    {/* Customization & Collaboration */}
                    {premium.customization && (
                        <div className="card" style={{ borderColor: 'rgba(123, 47, 255, 0.2)' }}>
                            <div className="card__header"><span className="card__title">Customization & Collaboration</span></div>
                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: '180px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Branding</div>
                                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.3rem' }}>
                                        {(premium.customization.branding?.suggested_palette as string[])?.slice(0, 5)?.map((c: string, i: number) => (
                                            <div key={i} title={c} style={{ width: '20px', height: '20px', borderRadius: '4px', background: c.split('')[0], border: '1px solid var(--border)' }} />
                                        ))}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{(premium.customization.branding?.fonts as string[])?.join('+')}</div>
                                </div>
                                <div style={{ flex: 1, minWidth: '180px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Sharing</div>
                                    {(premium.customization.sharing as string[])?.slice(0, 3)?.map((s: string, i: number) => (
                                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.1rem 0' }}>▸ {s}</div>
                                    ))}
                                </div>
                                <div style={{ flex: 1, minWidth: '180px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Scheduled Refresh</div>
                                    {(premium.customization.scheduled_refresh as string[])?.slice(0, 3)?.map((r: string, i: number) => (
                                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.1rem 0' }}>▸ {r}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}


// Just a test
export default Dashboard;
