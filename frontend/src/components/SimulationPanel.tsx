import { useState, useEffect } from 'react'
import { Target, Zap, AlertCircle, ChevronRight, TrendingUp, TrendingDown, Minus, Play, Save, Sparkles, HelpCircle, Loader2, Info, ShieldAlert } from 'lucide-react'
import { runSimulation, getSimulationArchitect, getDataHealth, SimulationResult, TornadoPoint } from '../api'

interface TargetConfig {
    column: string
    direction: 1 | -1 | 0 // 1: Max, -1: Min, 0: Stable
}

interface Props {
    sessionId: string
    columns: string[]
    analysis?: any
    onScenarioSaved?: () => void
}

export function SimulationPanel({ sessionId, columns, analysis, onScenarioSaved }: Props) {
    const [selectedTargets, setSelectedTargets] = useState<TargetConfig[]>([])
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<SimulationResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [aiInput, setAiInput] = useState('')
    const [aiRationale, setAiRationale] = useState('')
    const [architectLoading, setArchitectLoading] = useState(false)
    const [healthScore, setHealthScore] = useState<number | null>(null)

    useEffect(() => {
        const checkHealth = async () => {
             try {
                 const res = await getDataHealth(sessionId)
                 setHealthScore(res.overall_score)
             } catch (e) {
             }
        }
        checkHealth()
    }, [sessionId])

    const numericColumns = columns.filter(c => c.toLowerCase().includes('profit') || c.toLowerCase().includes('revenue') || c.toLowerCase().includes('margin') || c.toLowerCase().includes('cost') || c.toLowerCase().includes('churn') || c.toLowerCase().includes('score'))

    const addTarget = (col: string) => {
        if (selectedTargets.find(t => t.column === col)) return
        setSelectedTargets([...selectedTargets, { column: col, direction: 1 }])
    }

    const removeTarget = (col: string) => {
        setSelectedTargets(selectedTargets.filter(t => t.column !== col))
    }

    const updateDirection = (col: string, dir: 1 | -1 | 0) => {
        setSelectedTargets(selectedTargets.map(t => t.column === col ? { ...t, direction: dir } : t))
    }

    const handleRun = async () => {
        if (selectedTargets.length === 0) return
        setLoading(true)
        setError(null)
        try {
            const multiTargets: Record<string, number> = {}
            selectedTargets.forEach(t => {
                multiTargets[t.column] = t.direction
            })

            const res = await runSimulation(sessionId, selectedTargets[0].column, {
                target_column: selectedTargets[0].column,
                levers: {},
                multi_targets: multiTargets
            })
            setResult(res)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Optimization failed')
        } finally {
            setLoading(false)
        }
    }

    const handleAiSetup = async () => {
        if (!aiInput.trim()) return
        setArchitectLoading(true)
        setError(null)
        setAiRationale('')
        try {
            const res = await getSimulationArchitect(sessionId, aiInput)
            const newTargets = Object.entries(res.targets).map(([col, dir]) => ({
                column: col,
                direction: dir as 1 | -1 | 0
            }))
            setSelectedTargets(newTargets)
            setAiRationale(res.rationale)
        } catch (err) {
            setError('AI Architect failed to setup simulation.')
        } finally {
            setArchitectLoading(false)
        }
    }

    const TornadoChart = ({ data }: { data: TornadoPoint[] }) => {
        if (!data || data.length === 0) return null
        
        // Find max absolute value for scaling
        const impacts = data.flatMap(p => [Math.abs(p.low_impact), Math.abs(p.high_impact)])
        const maxVal = Math.max(...impacts, 1)

        return (
            <div style={{ marginTop: '2rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingUp size={14} /> LEVER SENSITIVITY (TORNADO ANALYSIS)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {data.map(point => (
                        <div key={point.lever} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={point.lever}>
                                {point.lever}
                            </span>
                            <div style={{ position: 'relative', height: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px' }}>
                                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.15)', zIndex: 1 }} />
                                
                                {point.low_impact < point.high_impact ? (
                                    <div style={{ 
                                        position: 'absolute', 
                                        left: `${50 + (Math.min(point.low_impact, point.high_impact) / maxVal) * 50}%`,
                                        width: `${(Math.abs(point.high_impact - point.low_impact) / maxVal) * 50}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                        borderRadius: '2px',
                                        opacity: 0.8
                                    }} />
                                ) : (
                                     <div style={{ 
                                        position: 'absolute', 
                                        left: `${50 + (Math.min(point.low_impact, point.high_impact) / maxVal) * 50}%`,
                                        width: `${(Math.abs(point.high_impact - point.low_impact) / maxVal) * 50}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #ef4444, #f59e0b)',
                                        borderRadius: '2px',
                                        opacity: 0.8
                                    }} />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <span>-{maxVal.toFixed(0)}%</span>
                    <span>BASELINE</span>
                    <span>+{maxVal.toFixed(0)}%</span>
                </div>
            </div>
        )
    }

    return (
        <div className="card" style={{ position: 'relative', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            {/* Loading Overlay */}
            {loading && (
                <div style={{ 
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(4px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 'var(--radius-lg)', gap: '1.5rem'
                }}>
                    <Loader2 size={40} className="spinner" color="var(--accent-primary)" />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: 'white', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Running Strategic Simulation</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>NexusAI is balancing conflicting objectives and calculating tradeoffs...</div>
                    </div>
                </div>
            )}
            
            <div className="card__header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Target size={20} color="var(--accent-primary)" />
                <span className="card__title">Strategic Multi-Objective Optimizer</span>
            </div>
            
            <div style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    Select multiple conflicting targets to find the optimal balance of levers.
                </p>

                {/* Data Health Warning */}
                {healthScore !== null && healthScore < 70 && (
                    <div style={{ 
                        marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.05)', 
                        borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)',
                        display: 'flex', gap: '1rem'
                    }}>
                        <ShieldAlert size={24} color="var(--accent-danger)" style={{ flexShrink: 0 }} />
                        <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-danger)', marginBottom: '0.2rem' }}>
                                SUBOPTIMAL DATA HEALTH ({healthScore.toFixed(0)}%)
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Low-fidelity data detected. Simulations may be less accurate. Consider fixing missing values or outliers in the <strong>Quality</strong> tab before proceeding.
                            </div>
                        </div>
                    </div>
                )}

                {/* AI Architect Selection */}
                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                        <Sparkles size={16} /> AI Scenario Architect
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input 
                            type="text" 
                            placeholder="Describe your goal (e.g. Maximize profit but keep costs stable)..."
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAiSetup()}
                            style={{ 
                                flex: 1, padding: '0.6rem 0.8rem', borderRadius: '6px', 
                                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)',
                                color: 'white', fontSize: '0.85rem'
                            }}
                        />
                        <button 
                            onClick={handleAiSetup}
                            disabled={architectLoading || !aiInput.trim()}
                            style={{ 
                                padding: '0.6rem 1rem', borderRadius: '6px', border: 'none',
                                background: 'var(--accent-primary)', color: 'var(--bg-primary)',
                                fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem'
                            }}
                        >
                            {architectLoading ? 'Thinking...' : 'Setup'}
                        </button>
                    </div>
                    {aiRationale && (
                        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', gap: '0.4rem' }}>
                            <HelpCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} /> {aiRationale}
                        </div>
                    )}
                </div>

                {/* Target Selection */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                        {numericColumns.map(col => (
                            <button 
                                key={col} 
                                onClick={() => addTarget(col)}
                                disabled={selectedTargets.some(t => t.column === col)}
                                style={{
                                    padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '20px',
                                    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                    color: selectedTargets.some(t => t.column === col) ? 'var(--text-muted)' : 'var(--text-secondary)',
                                    cursor: 'pointer', opacity: selectedTargets.some(t => t.column === col) ? 0.5 : 1
                                }}
                            >
                                + {col}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {selectedTargets.map(t => (
                            <div key={t.column} style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                                padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t.column}</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[
                                        { val: 1, icon: <TrendingUp size={14} />, label: 'Maximize' },
                                        { val: -1, icon: <TrendingDown size={14} />, label: 'Minimize' },
                                        { val: 0, icon: <Minus size={14} />, label: 'Keep Stable' }
                                    ].map(opt => (
                                        <button
                                            key={opt.val}
                                            onClick={() => updateDirection(t.column, opt.val as any)}
                                            title={opt.label}
                                            style={{
                                                padding: '4px 8px', borderRadius: '4px', border: 'none',
                                                background: t.direction === opt.val ? 'var(--accent-primary)' : 'transparent',
                                                color: t.direction === opt.val ? 'var(--bg-primary)' : 'var(--text-muted)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {opt.icon}
                                        </button>
                                    ))}
                                    <button 
                                        onClick={() => removeTarget(t.column)}
                                        style={{ marginLeft: '8px', color: 'var(--accent-danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={handleRun}
                    disabled={loading || selectedTargets.length === 0}
                    style={{
                        width: '100%', padding: '0.75rem', borderRadius: '8px', 
                        background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                        color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    {loading ? <div className="spinner" style={{ width: '16px', height: '16px' }} /> : <Play size={16} />}
                    Run Strategic Optimization
                </button>

                {error && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {/* Results Section */}
                {result && result.constrained_results && result.constrained_results.length > 0 && (
                    <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                        <h4 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--accent-success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Zap size={18} /> Optimization Found
                        </h4>

                        {/* Strategic Narrative */}
                        {result.strategic_narrative && (
                            <div style={{ 
                                marginBottom: '2rem', padding: '1.25rem', background: 'rgba(255, 255, 255, 0.03)', 
                                borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                                    <Sparkles size={16} /> Strategic Narrative
                                </div>
                                <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                    {result.strategic_narrative}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div className="stat-card">
                                <div className="stat-card__name">Overall Improvement</div>
                                <div className="stat-card__val" style={{ color: 'var(--accent-primary)', fontSize: '1.5rem' }}>
                                    +{result.constrained_results[0].improvement_pct.toFixed(1)}%
                                </div>
                            </div>
                        </div>

                        {/* Trade-offs */}
                        {result.insights && result.insights.length > 0 && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>STRATEGIC TRADE-OFFS</div>
                                {result.insights.map((insight: string, i: number) => (
                                    <div key={i} style={{ 
                                        padding: '0.75rem', background: 'rgba(251, 191, 36, 0.05)', 
                                        borderLeft: '3px solid #fbbf24', borderRadius: '4px', marginBottom: '0.5rem',
                                        fontSize: '0.85rem', color: '#fbbf24'
                                    }}>
                                        {insight}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Levers */}
                        <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>RECOMMENDED LEVERS</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {Object.entries(result.constrained_results[0].levers).map(([col, val]: [string, any]) => (
                                    <div key={col} style={{ 
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.6rem 0.8rem', background: 'var(--bg-elevated)', borderRadius: '6px'
                                    }}>
                                        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{col}</span>
                                        <span style={{ 
                                            fontSize: '0.8rem', fontWeight: 700, 
                                            color: (val as number) > 0 ? 'var(--accent-success)' : (val as number) < 0 ? 'var(--accent-danger)' : 'var(--text-muted)'
                                        }}>
                                            {(val as number) > 0 ? '+' : ''}{(val as number).toFixed(1)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Tornado Chart */}
                        <TornadoChart data={result.tornado_chart} />
                    </div>
                )}
            </div>
        </div>
    )
}

export default SimulationPanel;
