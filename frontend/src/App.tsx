import { useState, useCallback, lazy, Suspense, useRef, useEffect } from 'react'
import { UploadZone } from './components/UploadZone'
import type { UploadResponse, AnalysisResult, ComparisonResult } from './api'
import { getFullAnalysis, getAnalysisStatus, deleteSession, compareDatasets, registerOnChain } from './api'
import { BrainCircuit, MessageSquare, FileText, GitCompare, X, Briefcase, BarChart2, Microscope, Cog, AlertTriangle, Link, Shield } from 'lucide-react'
import BlockchainPanel from './components/BlockchainPanel'
import PrivateComparePanel from './components/PrivateComparePanel'
import DataProvenancePanel from './components/DataProvenancePanel'
import DataSubscriptionPanel from './components/DataSubscriptionPanel'
import { Network, DollarSign } from 'lucide-react'

// Lazy-load heavy components — they won't be fetched until needed
const Dashboard = lazy(() => import('./components/Dashboard'))
const ChatPanel = lazy(() => import('./components/ChatPanel'))

// Loading fallback for Suspense boundaries
function LazyFallback() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem' }}>
            <div className="spinner" />
            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading component…</span>
        </div>
    )
}

type DashboardRole = 'executive' | 'analyst' | 'scientist' | 'engineer'
interface SessionData {
    upload: UploadResponse
    analysis: AnalysisResult | null
    loading: boolean
    error: string | null
    analysisComplete: boolean  // tracks whether background heavy analysis is done
}

export default function App() {
    const [sessions, setSessions] = useState<Map<string, SessionData>>(() => {
        const saved = localStorage.getItem('nexus_sessions');
        if (saved) {
            try {
                // Map cannot be directly JSON.stringified, specialized parsing
                const arr = JSON.parse(saved);
                return new Map(arr);
            } catch { return new Map(); }
        }
        return new Map();
    })
    const [activeSessionId, setActiveSessionId] = useState<string | null>(() => localStorage.getItem('nexus_active_session'));
    const [role, setRole] = useState<DashboardRole>(() => (localStorage.getItem('nexus_user_role') as DashboardRole) || 'analyst')
    const [chatOpen, setChatOpen] = useState(false)
    const [comparison, setComparison] = useState<ComparisonResult | null>(null)
    const [comparing, setComparing] = useState(false)
    const [dashboardFilter, setDashboardFilter] = useState<string | null>(null)
    const pollingTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
    // Midnight Blockchain state
    const [blockchainOpen, setBlockchainOpen] = useState(false)
    const [privateCompareOpen, setPrivateCompareOpen] = useState(false)
    const [provenanceOpen, setProvenanceOpen] = useState(false)
    const [subscriptionOpen, setSubscriptionOpen] = useState(false)
    const [chainToast, setChainToast] = useState<string | null>(null)

    // Persist sessions
    useEffect(() => {
        const arr = Array.from(sessions.entries());
        localStorage.setItem('nexus_sessions', JSON.stringify(arr));
    }, [sessions])

    // Persist active session & role
    useEffect(() => {
        if (activeSessionId) localStorage.setItem('nexus_active_session', activeSessionId);
        localStorage.setItem('nexus_user_role', role);
    }, [activeSessionId, role])

    // Cleanup polling timers on unmount
    useEffect(() => {
        return () => {
            pollingTimers.current.forEach(timer => clearInterval(timer))
        }
    }, [])

    const activeSession = activeSessionId ? sessions.get(activeSessionId) : null

    // Start polling for analysis completion
    const startPolling = useCallback((sid: string) => {
        // Don't double-poll
        if (pollingTimers.current.has(sid)) return

        const timer = setInterval(async () => {
            try {
                const { status } = await getAnalysisStatus(sid)
                if (status === 'complete' || status === 'error') {
                    // Stop polling
                    clearInterval(timer)
                    pollingTimers.current.delete(sid)

                    if (status === 'complete') {
                        // Re-fetch the fully enriched analysis
                        const fullResult = await getFullAnalysis(sid)
                        setSessions(prev => {
                            const next = new Map(prev)
                            const session = next.get(sid)
                            if (session) {
                                next.set(sid, { ...session, analysis: fullResult, analysisComplete: true })
                            }
                            return next
                        })
                    } else {
                        setSessions(prev => {
                            const next = new Map(prev)
                            const session = next.get(sid)
                            if (session) {
                                next.set(sid, { ...session, analysisComplete: true }) // mark done even on error
                            }
                            return next
                        })
                    }
                }
            } catch {
                // Silently retry on network errors
            }
        }, 3000) // Poll every 3 seconds

        pollingTimers.current.set(sid, timer)
    }, [])

    const handleUpload = useCallback(async (uploadResult: UploadResponse) => {
        const sid = uploadResult.session_id

        // Add session
        setSessions(prev => {
            const next = new Map(prev)
            next.set(sid, { upload: uploadResult, analysis: null, loading: true, error: null, analysisComplete: false })
            return next
        })
        setActiveSessionId(sid)

        // Auto-register on Midnight blockchain (background, non-blocking)
        registerOnChain(sid, {
            filename: uploadResult.filename,
            row_count: uploadResult.row_count,
            column_count: uploadResult.column_count,
        }).then(rec => {
            setChainToast(`⛓️ Registered on Midnight — Block #${rec.block_number}`)
            setTimeout(() => setChainToast(null), 4000)
        }).catch(() => { /* silent */ })

        // Run analysis — backend returns FAST with profile-only data
        try {
            const result = await getFullAnalysis(sid)
            setSessions(prev => {
                const next = new Map(prev)
                const session = next.get(sid)
                if (session) {
                    next.set(sid, { ...session, analysis: result, loading: false, analysisComplete: false })
                }
                return next
            })
            startPolling(sid)
        } catch (err) {
            setSessions(prev => {
                const next = new Map(prev)
                const session = next.get(sid)
                if (session) {
                    next.set(sid, { ...session, error: err instanceof Error ? err.message : 'Analysis failed', loading: false, analysisComplete: true })
                }
                return next
            })
        }
    }, [startPolling])

    const handleDeleteSession = useCallback(async (sid: string) => {
        try { await deleteSession(sid) } catch { /* ignore */ }
        setSessions(prev => {
            const next = new Map(prev)
            next.delete(sid)
            return next
        })
        if (activeSessionId === sid) {
            const remaining = Array.from(sessions.keys()).filter(k => k !== sid)
            setActiveSessionId(remaining.length > 0 ? remaining[0] : null)
        }
    }, [activeSessionId, sessions])

    const handleNewSession = useCallback(() => {
        setActiveSessionId(null)
        setChatOpen(false)
    }, [])

    const handleCompare = useCallback(async () => {
        const sids = Array.from(sessions.keys())
        if (sids.length < 2) return
        setComparing(true)
        try {
            const result = await compareDatasets(sids)
            setComparison(result)
        } catch (e) {
        } finally {
            setComparing(false)
        }
    }, [sessions])

    const showUpload = sessions.size === 0 || activeSessionId === null

    return (
        <div className="app">
            {/* Navbar */}
            <nav className="navbar">
                <div className="navbar__brand">
                    <span className="navbar__logo"><BrainCircuit size={28} color="var(--accent-primary)" strokeWidth={1.5} /></span>
                    <span className="navbar__title">Nexus Analytics</span>
                    <span className="navbar__version">v4.0</span>
                </div>
                <div className="navbar__actions">
                    {activeSession && (
                        <>
                            <RoleSwitcher role={role} onRoleChange={setRole} />
                            <button
                                className="btn--icon" onClick={() => setChatOpen(!chatOpen)}
                                title="Toggle AI Chat">
                                <MessageSquare size={20} />
                            </button>
                            {/* Midnight Blockchain Button */}
                            <button
                                className={`btn btn--blockchain-nav ${blockchainOpen ? 'active' : ''}`}
                                onClick={() => { setBlockchainOpen(!blockchainOpen); setPrivateCompareOpen(false); setProvenanceOpen(false) }}
                                title="Midnight Blockchain"
                            >
                                <Link size={15} /> Midnight
                            </button>
                            <button
                                className={`btn btn--blockchain-nav ${provenanceOpen ? 'active' : ''}`}
                                onClick={() => { setProvenanceOpen(!provenanceOpen); setBlockchainOpen(false); setPrivateCompareOpen(false) }}
                                title="Data Provenance"
                            >
                                <Network size={15} /> Lineage
                            </button>
                            <button
                                className="btn btn--private-compare"
                                onClick={() => { setPrivateCompareOpen(!privateCompareOpen); setBlockchainOpen(false); setProvenanceOpen(false); setSubscriptionOpen(false) }}
                                title="Privacy-Preserving Compare"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <Shield size={15} /> Private Compare
                            </button>
                            <button
                                className={`btn btn--blockchain-nav ${subscriptionOpen ? 'active' : ''}`}
                                onClick={() => { setSubscriptionOpen(!subscriptionOpen); setBlockchainOpen(false); setProvenanceOpen(false); setPrivateCompareOpen(false) }}
                                title="Data Subscriptions"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <DollarSign size={15} /> Subscriptions
                            </button>
                            <button
                                className="btn btn--secondary" onClick={handleNewSession}
                            >
                                + Add Data
                            </button>
                            {sessions.size >= 2 && (
                                <>
                                    <button
                                        className="btn btn--primary" onClick={handleCompare}
                                        disabled={comparing}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                    >
                                        <GitCompare size={16} />
                                        {comparing ? 'Comparing...' : 'Compare'}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </nav>

            {/* Session Tabs */}
            {sessions.size > 0 && (
                <div className="session-tabs">
                    {Array.from(sessions.entries()).map(([sid, data]) => (
                        <div
                            key={sid}
                            className={`session-tab ${sid === activeSessionId ? 'session-tab--active' : ''}`}
                            onClick={() => setActiveSessionId(sid)}
                        >
                            <span className="session-tab__icon"><FileText size={16} /></span>
                            <span className="session-tab__name">{data.upload.filename}</span>
                            <span className="session-tab__meta">
                                {data.upload.row_count.toLocaleString()} rows
                            </span>
                            {data.loading && <span className="spinner" style={{ width: '12px', height: '12px' }} />}
                            <button
                                className="session-tab__close" onClick={(e) => { e.stopPropagation(); handleDeleteSession(sid) }}
                                title="Close dataset">
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    <button
                        className="session-tab session-tab--add" onClick={handleNewSession}
                    >
                        + Add File
                    </button>
                </div>
            )}

            {/* Main Content */}
            {showUpload ? (
                <UploadZone onUpload={handleUpload} />
            ) : activeSession ? (
                <div className={`dashboard ${chatOpen ? 'chat-open' : ''}`}>
                    <div className="dashboard__main">
                        {activeSession.loading ? (
                            <div className="loading-overlay">
                                <div className="spinner" />
                                <div className="loading-overlay__text">Running 5-tier analytics pipeline...
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Profiling → Quality Audit → Enrichment → ML → Insights
                                </div>
                            </div>
                        ) : activeSession.error ? (
                            <div className="loading-overlay">
                                <div style={{ color: 'var(--accent-danger)', fontSize: '1.2rem' }}><AlertTriangle size={20} /></div>
                                <div style={{ color: 'var(--accent-danger)' }}>{activeSession.error}</div>
                                <button className="btn btn--primary" onClick={() => handleUpload(activeSession.upload)}>Retry Analysis
                                </button>
                            </div>
                        ) : activeSession.analysis ? (
                            <Suspense fallback={<LazyFallback />}>
                                <Dashboard
                                    analysis={activeSession.analysis}
                                    session={activeSession.upload}
                                    role={role}
                                    globalFilter={dashboardFilter}
                                    onSetGlobalFilter={setDashboardFilter}
                                    analysisComplete={activeSession.analysisComplete}
                                />
                            </Suspense>
                        ) : null}
                    </div>

                    {chatOpen && activeSessionId && (
                        <Suspense fallback={<LazyFallback />}>
                            <ChatPanel
                                sessionId={activeSessionId}
                                role={role}
                                onClose={() => setChatOpen(false)}
                                onDataModified={() => {
                                    if (activeSession?.upload) {
                                        handleUpload(activeSession.upload)
                                    }
                                }}
                                onDashboardMutate={(action, value) => {
                                    if (action === 'filter') {
                                        setDashboardFilter(value)
                                    }
                                }}
                            />
                        </Suspense>
                    )}
                </div>
            ) : null}

            {/* Midnight Blockchain Side Panel */}
            {blockchainOpen && activeSession && activeSessionId && (
                <div className="blockchain-overlay">
                    <BlockchainPanel
                        sessionId={activeSessionId}
                        session={activeSession.upload}
                        onClose={() => setBlockchainOpen(false)}
                    />
                </div>
            )}

            {/* Private Compare Side Panel */}
            {privateCompareOpen && activeSessionId && (
                <div className="blockchain-overlay">
                    <PrivateComparePanel
                        sessionId={activeSessionId}
                        sessionIds={Array.from(sessions.keys())}
                        onClose={() => setPrivateCompareOpen(false)}
                    />
                </div>
            )}

            {/* Data Provenance Panel */}
            {provenanceOpen && activeSessionId && (
                <div className="blockchain-overlay">
                    <DataProvenancePanel sessionId={activeSessionId} onClose={() => setProvenanceOpen(false)} />
                </div>
            )}

            {/* Data Subscription Panel */}
            {subscriptionOpen && activeSessionId && (
                <DataSubscriptionPanel sessionId={activeSessionId} onClose={() => setSubscriptionOpen(false)} />
            )}

            {/* Chain Registration Toast */}
            {chainToast && (
                <div className="chain-toast">
                    <Link size={14} color="#a855f7" />
                    {chainToast}
                </div>
            )}

            {/* Comparison Results Panel */}
            {comparison && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.7)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                }}>
                    <div style={{
                        background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)', maxWidth: '900px', width: '90vw',
                        maxHeight: '80vh', overflow: 'auto', padding: '2rem',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-display)', margin: 0 }}>
                                <GitCompare size={20} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                                Multi-Dataset Comparison ({comparison.dataset_count} datasets)
                            </h2>
                            <button className="btn--icon" onClick={() => setComparison(null)}></button>
                        </div>

                        {/* Datasets overview */}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                            {comparison.datasets.map((ds, i) => (
                                <div key={i} style={{
                                    padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                    flex: '1 1 200px',
                                }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={16} /> {ds.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ds.row_count.toLocaleString()} rows · {ds.columns.length} cols</div>
                                </div>
                            ))}
                        </div>

                        {/* Statistical comparison */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--accent-secondary)' }}>Statistical Comparison</h3>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <strong>Shared Columns ({comparison.statistical_comparison.shared_column_count}):</strong>{''}
                                {comparison.statistical_comparison.shared_columns.length > 0
                                    ? comparison.statistical_comparison.shared_columns.join(',')
                                    : 'No shared columns found.'}
                            </div>
                            {comparison.statistical_comparison.unique_columns_per_dataset.map((u, i) => (
                                <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                    <strong>{u.dataset}</strong>unique: {u.unique_columns.slice(0, 8).join(',')}{u.unique_columns.length > 8 ? ` (+${u.unique_columns.length - 8} more)` : ''}
                                </div>
                            ))}
                        </div>

                        {/* LLM Reasoning */}
                        {comparison.llm_reasoning ? (
                            <div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--accent-primary)' }}>AI Reasoning</h3>

                                {comparison.llm_reasoning.suggested_join_keys && comparison.llm_reasoning.suggested_join_keys.length > 0 && (
                                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(0,229,255,0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,229,255,0.15)' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Suggested Join Keys</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{comparison.llm_reasoning.suggested_join_keys.join(',')}</div>
                                    </div>
                                )}

                                {comparison.llm_reasoning.merge_strategy && (
                                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(0,255,135,0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,255,135,0.15)' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Merge Strategy</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{comparison.llm_reasoning.merge_strategy}</div>
                                    </div>
                                )}

                                {comparison.llm_reasoning.correlations && comparison.llm_reasoning.correlations.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Correlations & Patterns</div>
                                        {comparison.llm_reasoning.correlations.map((c, i) => (
                                            <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>• {c}</div>
                                        ))}
                                    </div>
                                )}

                                {comparison.llm_reasoning.differences && comparison.llm_reasoning.differences.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Key Differences</div>
                                        {comparison.llm_reasoning.differences.map((d, i) => (
                                            <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>• {d}</div>
                                        ))}
                                    </div>
                                )}

                                {comparison.llm_reasoning.actionable_insights && comparison.llm_reasoning.actionable_insights.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--accent-warning)' }}>Actionable Insights</div>
                                        {comparison.llm_reasoning.actionable_insights.map((ins, i) => (
                                            <div key={i} style={{
                                                fontSize: '0.8rem', color: 'var(--text-primary)',
                                                padding: '0.6rem', marginBottom: '0.4rem',
                                                background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border)',
                                            }}>{i + 1}. {ins}</div>
                                        ))}
                                    </div>
                                )}

                                {comparison.llm_reasoning.data_quality_comparison && (
                                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,165,0,0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,165,0,0.15)' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>️ Data Quality</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{comparison.llm_reasoning.data_quality_comparison}</div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                ℹ️ LLM reasoning not available (no NVIDIA_API_KEY configured). Showing statistical comparison only.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// Role Switcher Component
function RoleSwitcher({
    role,
    onRoleChange,
}: {
    role: DashboardRole
    onRoleChange: (r: DashboardRole) => void
}) {
    const roles: { key: DashboardRole; label: string; icon: React.ReactNode }[] = [
        { key: 'executive', label: 'Executive', icon: <Briefcase size={16} /> },
        { key: 'analyst', label: 'Analyst', icon: <BarChart2 size={16} /> },
        { key: 'scientist', label: 'Scientist', icon: <Microscope size={16} /> },
        { key: 'engineer', label: 'Engineer', icon: <Cog size={16} /> },
    ]

    return (
        <div className="role-switcher">
            {roles.map((r) => (
                <button
                    key={r.key}
                    className={`role-switcher__btn ${role === r.key ? 'active' : ''}`}
                    onClick={() => onRoleChange(r.key)}
                >
                    <span>{r.icon}</span>
                    {r.label}
                </button>
            ))}
        </div>
    )
}
