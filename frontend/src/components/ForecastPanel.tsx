import { useState, useEffect } from 'react'
import Plot from 'react-plotly.js'
import { Calendar, TrendingUp, AlertCircle, Loader2, Sparkles, ChevronRight } from 'lucide-react'
import { getForecast, EnhancedForecastResult, UploadResponse } from '../api'

interface Props {
    session: UploadResponse
}

export function ForecastPanel({ session }: Props) {
    const [targetCol, setTargetCol] = useState('')
    const [dateCol, setDateCol] = useState('')
    const [horizon, setHorizon] = useState(6)
    const [stride, setStride] = useState<'days' | 'weeks' | 'months' | 'quarters'>('months')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<EnhancedForecastResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Auto-select defaults
    useEffect(() => {
        if (!targetCol && session.columns.length > 0) {
            const numericCols = Object.entries(session.dtypes)
                .filter(([_, t]) => t.includes('int') || t.includes('float'))
                .map(([name]) => name)
            if (numericCols.length > 0) setTargetCol(numericCols[0])
            
            const dateCols = Object.entries(session.dtypes)
                .filter(([name, t]) => name.toLowerCase().includes('date') || name.toLowerCase().includes('time') || t.includes('datetime'))
                .map(([name]) => name)
            if (dateCols.length > 0) setDateCol(dateCols[0])
        }
    }, [session])

    const handleForecast = async () => {
        if (!targetCol || !dateCol) return
        setLoading(true)
        setError(null)
        try {
            const data = await getForecast(session.session_id, targetCol, dateCol, stride, horizon)
            setResult(data)
        } catch (err: any) {
            setError(err.message || 'Forecast failed')
        } finally {
            setLoading(false)
        }
    }

    const plotData = result ? [
        // Historical
        {
            x: result.points.filter(p => !p.is_forecast).map(p => p.timestamp),
            y: result.points.filter(p => !p.is_forecast).map(p => p.actual),
            name: 'Historical',
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#6366f1', width: 3 },
            marker: { size: 6, color: '#6366f1' }
        },
        // Forecast
        {
            x: result.points.filter(p => p.is_forecast).map(p => p.timestamp),
            y: result.points.filter(p => p.is_forecast).map(p => p.forecast),
            name: 'Forecast',
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#8b5cf6', width: 3, dash: 'dash' },
            marker: { size: 6, color: '#8b5cf6' }
        },
        // Upper bound
        {
            x: result.points.filter(p => p.is_forecast).map(p => p.timestamp),
            y: result.points.filter(p => p.is_forecast).map(p => p.upper_bound),
            type: 'scatter',
            mode: 'lines',
            line: { width: 0 },
            showlegend: false,
            fillcolor: 'rgba(139, 92, 246, 0.1)',
            fill: 'tonexty'
        },
        // Lower bound
        {
            x: result.points.filter(p => p.is_forecast).map(p => p.timestamp),
            y: result.points.filter(p => p.is_forecast).map(p => p.lower_bound),
            type: 'scatter',
            mode: 'lines',
            line: { width: 0 },
            showlegend: false,
            fillcolor: 'rgba(139, 92, 246, 0.1)',
            fill: 'tonexty'
        }
    ] as any : []

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <TrendingUp size={24} color="#818cf8" />
                        Predictive Forecasting
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>Project temporal trends using Lumina Time-Series Engine.</p>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button 
                        className="btn btn--secondary"
                        onClick={() => {
                            if (!result) return;
                            const csvContent = "data:text/csv;charset=utf-8," 
                                + "timestamp,actual,forecast,lower_bound,upper_bound\n"
                                + result.points.map(p => `${p.timestamp},${p.actual||''},${p.forecast||''},${p.lower_bound||''},${p.upper_bound||''}`).join("\n");
                            const encodedUri = encodeURI(csvContent);
                            const link = document.createElement("a");
                            link.setAttribute("href", encodedUri);
                            link.setAttribute("download", `forecast_${targetCol}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }}
                        disabled={!result}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                        Download Data
                    </button>
                    <button 
                        className="btn btn--accent"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                        onClick={handleForecast}
                        disabled={loading || !targetCol || !dateCol}
                    >
                        {loading ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                        Generate Forecast
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(12px)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative', zIndex: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', position: 'relative', zIndex: 30 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Target Metric</label>
                    <select value={targetCol} onChange={e => setTargetCol(e.target.value)} style={{ width: '100%', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '0.75rem', padding: '0.75rem', color: 'white', outline: 'none', cursor: 'pointer', boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)' }}>
                        {session.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', position: 'relative', zIndex: 30 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Date Dimension</label>
                    <select value={dateCol} onChange={e => setDateCol(e.target.value)} style={{ width: '100%', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '0.75rem', padding: '0.75rem', color: 'white', outline: 'none', cursor: 'pointer', boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)' }}>
                        {session.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', position: 'relative', zIndex: 30 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Interval</label>
                    <select value={stride} onChange={(e: any) => setStride(e.target.value)} style={{ width: '100%', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '0.75rem', padding: '0.75rem', color: 'white', outline: 'none', cursor: 'pointer', boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)' }}>
                        <option value="days">Daily</option>
                        <option value="weeks">Weekly</option>
                        <option value="months">Monthly</option>
                        <option value="quarters">Quarterly</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', position: 'relative', zIndex: 30 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Horizon ({horizon})</label>
                    <input type="range" min="1" max="24" value={horizon} onChange={e => setHorizon(parseInt(e.target.value))} style={{ width: '100%', marginTop: '0.75rem', cursor: 'pointer' }} />
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3 font-medium">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {result && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                    <div className="card" style={{ padding: '0.5rem' }}>
                        <Plot
                            data={plotData}
                            layout={{
                                autosize: true,
                                margin: { t: 30, b: 40, l: 50, r: 30 },
                                paper_bgcolor: 'transparent',
                                plot_bgcolor: 'transparent',
                                font: { color: '#94a3b8' },
                                legend: { orientation: 'h', y: -0.2 },
                                xaxis: { showgrid: false },
                                yaxis: { showgrid: true, gridcolor: 'rgba(255,255,255,0.05)' }
                            }}
                            style={{ width: '100%', height: '400px' }}
                            useResizeHandler
                        />
                    </div>
                    
                    <div className="insights-column" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))' }}>
                            <div className="card__header"><span className="card__title">Analyst Insights</span></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {result.insights.map((insight, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
                                        <ChevronRight size={14} color="var(--accent-primary)" style={{ marginTop: '0.2rem' }} />
                                        <span>{insight}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card" style={{ flex: 1 }}>
                            <div className="card__header"><span className="card__title">Model Performance</span></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>MAPE (Error)</span>
                                    <span style={{ fontWeight: 600, color: result.mape < 10 ? '#22c55e' : result.mape < 25 ? '#eab308' : '#ef4444' }}>{result.mape}%</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Resolution</span>
                                    <span style={{ fontWeight: 600 }}>{result.interval.toUpperCase()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Algorithm</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{result.model_name}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ForecastPanel;
