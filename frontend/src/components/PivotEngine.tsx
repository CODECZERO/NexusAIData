import React, { useState } from 'react'
import { Grid, Layers, Table, Download, Plus, X, ArrowRight, BarChart3, Loader2, Presentation, Search } from 'lucide-react'
import { getPivot, PivotRequest, PivotResult, UploadResponse } from '../api'

interface Props {
    session: UploadResponse
}

export function PivotEngine({ session }: Props) {
    const [rows, setRows] = useState<string[]>([])
    const [cols, setCols] = useState<string[]>([])
    const [values, setValues] = useState<string[]>([])
    const [aggFunc, setAggFunc] = useState<'mean' | 'sum' | 'count' | 'min' | 'max'>('mean')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<PivotResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleGeneratePivot = async () => {
        if (rows.length === 0 || values.length === 0) {
            setError('Please select at least one Row dimension and one Metric.')
            return
        }
        setLoading(true)
        setError(null)
        try {
            const req: PivotRequest = { rows, columns: cols, values, agg_func: aggFunc }
            const data = await getPivot(session.session_id, req)
            setResult(data)
        } catch (err: any) {
            setError(err.message || 'Failed to generate pivot table')
        } finally {
            setLoading(false)
        }
    }

    const addDimension = (dim: string, set: React.Dispatch<React.SetStateAction<string[]>>) => {
        set(prev => prev.includes(dim) ? prev : [...prev, dim])
    }

    const removeDimension = (dim: string, set: React.Dispatch<React.SetStateAction<string[]>>) => {
        set(prev => prev.filter(d => d !== dim))
    }

    // Dynamic color scaling for heatmap effect
    const getCellColor = (val: number, metric: string) => {
        if (!result || typeof val !== 'number') return 'transparent'
        const metricValues = result.data.map(r => {
            const key = Object.keys(r).find(k => k.startsWith(metric))
            return key ? r[key] : null
        }).filter(v => v !== null) as number[]
        
        const min = Math.min(...metricValues)
        const max = Math.max(...metricValues)
        const range = max - min
        if (range === 0) return 'rgba(99, 102, 241, 0.1)'
        
        const opacity = 0.05 + 0.4 * ((val - min) / range)
        return `rgba(99, 102, 241, ${opacity})`
    }

    return (
        <div className="pivot-engine" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Premium Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1.5rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <div style={{ padding: '8px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '10px', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                            <Grid size={22} color="#a855f7" />
                        </div>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.025em', background: 'linear-gradient(135deg, #a855f7 0%, #60a5fa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Multi-Dimensional Pivot Engine
                        </h2>
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>Analyze relationships between categories and metrics with Excel-style cross-tabs.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button 
                        onClick={() => { setRows([]); setCols([]); setValues([]); setResult(null); }}
                        style={{ 
                            padding: '10px 20px', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', 
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                            fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        Reset Workspace
                    </button>
                    <button 
                        onClick={handleGeneratePivot}
                        disabled={loading || rows.length === 0 || values.length === 0}
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '10px 24px', 
                            background: loading ? 'rgba(168, 85, 247, 0.5)' : 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', 
                            color: 'white', border: 'none', borderRadius: '12px',
                            fontWeight: 700, fontSize: '0.875rem', cursor: loading ? 'not-allowed' : 'pointer', 
                            boxShadow: '0 10px 15px -3px rgba(168, 85, 247, 0.25)', transition: 'transform 0.2s'
                        }}
                    >
                        {loading ? 'Synthesizing...' : 'Generate Analysis'}
                        <ArrowRight size={18} />
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {/* Configuration Zones */}
                <DropZone title="Rows" icon={<Layers size={16} color="#60a5fa" />} items={rows} onRemove={d => removeDimension(d, setRows)} onAdd={d => addDimension(d, setRows)} options={session.columns} activeColor="#60a5fa" />
                <DropZone title="Columns" icon={<Table size={16} color="#a855f7" />} items={cols} onRemove={d => removeDimension(d, setCols)} onAdd={d => addDimension(d, setCols)} options={session.columns} activeColor="#a855f7" />
                <DropZone title="Metrics" icon={<BarChart3 size={16} color="#10b981" />} items={values} onRemove={d => removeDimension(d, setValues)} onAdd={d => addDimension(d, setValues)} options={session.columns} activeColor="#10b981" />
                
                <div style={{ 
                    padding: '1.25rem', background: 'rgba(255,255,255,0.02)', 
                    border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center'
                }}>
                    <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Aggregation Logic</label>
                    <select 
                        value={aggFunc} 
                        onChange={(e: any) => setAggFunc(e.target.value)}
                        style={{ width: '100%', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'white', fontWeight: 600, fontSize: '0.85rem' }}
                    >
                        <option value="mean">Average (Mean)</option>
                        <option value="sum">Sum (Total)</option>
                        <option value="count">Count (Frequency)</option>
                        <option value="min">Minimum Value</option>
                        <option value="max">Maximum Value</option>
                    </select>
                </div>
            </div>

            {error && <div style={{ color: '#ef4444', fontSize: '0.875rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>{error}</div>}

            {result && (
                <div style={{ 
                    background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(20px)', 
                    border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', 
                    overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                }}>
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Analyzed Cross-Tab Matrix</span>
                        </div>
                        <button style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '6px 12px', 
                            background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', 
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                        }}>
                            <Download size={14} />
                            Download CSV
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: '600px', cursor: 'default' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8125rem' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
                                <tr style={{ background: '#0f172a' }}>
                                    {result.row_dimensions.map((dim, idx) => (
                                        <th key={dim} style={{ 
                                            padding: '1rem', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', 
                                            fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
                                            position: 'sticky', left: idx * 100, background: '#0f172a', zIndex: 101, borderRight: '1px solid rgba(255,255,255,0.05)'
                                        }}>{dim}</th>
                                    ))}
                                    {Object.keys(result.data[0] || {}).filter(k => !result.row_dimensions.includes(k)).map(key => (
                                        <th key={key} style={{ 
                                            padding: '1rem', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)', 
                                            fontWeight: 700, color: 'white', whiteSpace: 'nowrap'
                                        }}>
                                            {key.replace(/\|/g, ' › ')}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {result.data.map((record, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        {result.row_dimensions.map((dim, idx) => (
                                            <td key={dim} style={{ 
                                                padding: '1rem', fontWeight: 700, color: '#94a3b8',
                                                position: 'sticky', left: idx * 100, background: 'rgba(15, 23, 42, 0.95)', 
                                                zIndex: 90, borderRight: '1px solid rgba(255,255,255,0.05)'
                                            }}>{record[dim]}</td>
                                        ))}
                                        {Object.keys(record).filter(k => !result.row_dimensions.includes(k)).map(key => (
                                            <td key={key} style={{ 
                                                padding: '1rem', 
                                                textAlign: 'right', 
                                                fontFamily: 'var(--font-mono)',
                                                fontWeight: 600,
                                                color: 'white',
                                                background: getCellColor(record[key], result.metrics[0]),
                                                borderBottom: '1px solid rgba(255,255,255,0.03)'
                                            }}>
                                                {typeof record[key] === 'number' ? record[key].toLocaleString(undefined, { maximumFractionDigits: 2 }) : record[key]}
                                            </td>
                                        ))}
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

function DropZone({ title, icon, items, onRemove, onAdd, options, activeColor }: { title: string, icon: any, items: string[], onRemove: (d: string) => void, onAdd: (d: string) => void, options: string[], activeColor: string }) {
    return (
        <div style={{ 
            background: 'rgba(255,255,255,0.02)', borderRadius: '16px', 
            border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem',
            boxShadow: `inset 0 0 20px 0 rgba(0,0,0,0.2)`
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', color: '#64748b', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <div style={{ padding: '4px', background: `${activeColor}15`, borderRadius: '6px', display: 'flex' }}>
                    {icon}
                </div>
                {title}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {items.map(item => (
                    <span key={item} style={{ 
                        padding: '6px 12px', background: `${activeColor}20`, color: activeColor, 
                        border: `1px solid ${activeColor}30`, borderRadius: '8px', 
                        fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' 
                    }}>
                        {item}
                        <X size={14} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => onRemove(item)} />
                    </span>
                ))}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Plus size={14} style={{ position: 'absolute', left: '10px', color: '#64748b', pointerEvents: 'none' }} />
                    <select 
                        value="" 
                        onChange={e => e.target.value && onAdd(e.target.value)}
                        style={{ 
                            padding: '8px 12px 8px 30px', background: 'rgba(255,255,255,0.03)', 
                            border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '10px', 
                            fontSize: '0.75rem', color: '#64748b', cursor: 'pointer', outline: 'none',
                            appearance: 'none', minWidth: '120px'
                        }}
                    >
                        <option value="">Add {title.slice(0, -1)}</option>
                        {options.filter(o => !items.includes(o)).map(o => (
                            <option key={o} value={o}>{o}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    )
}
