import { useState, useEffect } from 'react'
import { Activity, ShieldCheck, ShieldAlert, Zap, Wand2, CheckCircle2, AlertTriangle, Info, ArrowRight, Loader2, Sparkles, RefreshCw } from 'lucide-react'
import { getDataHealth, cleanData, engineerFeature, DataHealthReport, DataHealthIssue, CleaningAction } from '../api'

interface DataHealthDashboardProps {
    sessionId: string
    onDataUpdate: () => void
    onCleaningApplied?: () => void
}

export default function DataHealthDashboard({ sessionId, onDataUpdate, onCleaningApplied }: DataHealthDashboardProps) {
    const [report, setReport] = useState<DataHealthReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [fixing, setFixing] = useState<string | null>(null)
    const [engineering, setEngineering] = useState(false)
    const [featureGoal, setFeatureGoal] = useState('')
    const [error, setError] = useState<string | null>(null)

    const fetchHealth = async () => {
        setLoading(true)
        try {
            const data = await getDataHealth(sessionId)
            setReport(data)
            setError(null)
        } catch (err) {
            setError('Failed to load data health report.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchHealth()
    }, [sessionId])

    const handleApplyFix = async (issue: DataHealthIssue) => {
        setFixing(issue.id)
        try {
            let action = ''
            if (issue.issue_type === 'missing') action = 'impute_median'
            else if (issue.issue_type === 'outliers') action = 'clip_outliers'
            else if (issue.issue_type === 'high_cardinality') action = 'drop'

            const cleaningAction: CleaningAction = {
                issue_id: issue.id,
                action: action,
                parameters: { column: issue.column }
            }

            await cleanData(sessionId, [cleaningAction])
            await fetchHealth()
            onDataUpdate()
            if (onCleaningApplied) onCleaningApplied()
        } catch (err) {
            setError('Failed to apply fix.')
        } finally {
            setFixing(null)
        }
    }

    const handleEngineer = async () => {
        if (!featureGoal.trim()) return
        setEngineering(true)
        try {
            await engineerFeature(sessionId, featureGoal)
            setFeatureGoal('')
            await fetchHealth()
            onDataUpdate()
            setError(null)
        } catch (err) {
            setError('Feature engineering failed.')
        } finally {
            setEngineering(false)
        }
    }

    if (loading && !report) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] gap-6 animate-in fade-in duration-1000">
                <div className="relative">
                    <div className="absolute inset-0 blur-xl bg-blue-500/20 rounded-full" />
                    <Loader2 className="relative animate-spin text-blue-400" size={48} />
                </div>
                <span className="text-slate-400 font-medium tracking-wide">Syncing Data Health Diagnostics...</span>
            </div>
        )
    }

    return (
        <div className="relative p-10 bg-slate-900/40 backdrop-blur-3xl rounded-[40px] border border-white/[0.05] shadow-[0_0_80px_-20px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Ambient Background Glow */}
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 blur-[100px] rounded-full pointer-events-none" />
            
            {/* Header section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 relative z-10 gap-6">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 rounded-2xl shadow-xl">
                        <Activity size={32} className="text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 tracking-tight mb-2">Quality & Integrity Insights</h3>
                        <div className="flex items-center gap-3">
                            <span className="text-slate-400 font-medium text-sm">Real-time dataset diagnostics</span>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                            <span className={`text-sm font-semibold ${report?.overall_score && report.overall_score > 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {report?.issues.length === 0 ? "Perfect Matrix" : `${report?.issues.length} Issues Detected`}
                            </span>
                        </div>
                    </div>
                </div>
                
                {report && (
                    <div className="flex flex-col items-end">
                        <div className="text-sm font-medium text-slate-400 mb-1">Health Score</div>
                        <div className={`text-4xl font-black ${report.overall_score > 80 ? 'text-emerald-400' : 'text-amber-400'} drop-shadow-lg`}>
                            {report.overall_score.toFixed(0)}<span className="text-xl opacity-50">%</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="relative z-10 w-full">
                {/* Intelligence Features Bar */}
                <div className="mb-12 relative group/cli">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-[24px] blur opacity-20 group-hover/cli:opacity-40 transition duration-1000 group-hover/cli:duration-200"></div>
                    <div className="relative p-6 bg-slate-950/80 backdrop-blur-xl rounded-[24px] border border-white/10 flex flex-col md:flex-row gap-6 items-center">
                        <div className="flex items-center gap-4 text-blue-400 font-semibold md:min-w-[200px]">
                            <div className="p-2 bg-blue-500/20 rounded-xl">
                                <Sparkles size={20} />
                            </div>
                            Feature Copilot
                        </div>
                        <div className="flex-1 flex gap-4 w-full">
                            <input 
                                type="text" 
                                placeholder="Describe a new column to generate (e.g., 'Calculate profit margin')..."
                                value={featureGoal}
                                onChange={(e) => setFeatureGoal(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleEngineer()}
                                className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-5 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-medium"
                            />
                            <button 
                                onClick={handleEngineer}
                                disabled={engineering || !featureGoal.trim()}
                                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-3 active:scale-95"
                            >
                                {engineering ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                                Execute
                            </button>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-10 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-medium flex items-center gap-4 animate-pulse">
                        <AlertTriangle size={20} className="text-red-500" /> {error}
                    </div>
                )}

                {/* Issues Grid */}
                {report && report.issues.length === 0 ? (
                    <div className="text-center py-24 bg-gradient-to-b from-transparent to-emerald-500/5 rounded-[32px] border border-emerald-500/10">
                        <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                            <ShieldCheck size={48} className="text-emerald-400" />
                        </div>
                        <h4 className="text-2xl font-bold text-white mb-2 tracking-tight">Dataset Verified</h4>
                        <p className="text-slate-400 font-medium">No logical anomalies or quality issues detected.</p>
                    </div>
                ) : report ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                        {report.issues.map(issue => {
                            const isHigh = issue.severity === 'high';
                            return (
                                <div key={issue.id} className="relative group/card bg-slate-900/50 hover:bg-slate-800/50 backdrop-blur-sm rounded-[24px] border border-white/5 hover:border-white/10 transition-all duration-300 overflow-hidden flex flex-col">
                                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${isHigh ? 'from-red-500 to-rose-400' : 'from-blue-500 to-indigo-400'}`} />
                                    
                                    <div className="p-8 flex-1 flex flex-col">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-3 text-xs font-semibold">
                                                    <span className="text-slate-300">{issue.column}</span>
                                                    <span className="text-slate-600">•</span>
                                                    <span className="text-slate-400">{issue.issue_type.replace('_', ' ')}</span>
                                                </div>
                                                <h4 className="text-lg font-bold text-white leading-snug group-hover/card:text-blue-200 transition-colors">
                                                    {issue.description}
                                                </h4>
                                            </div>
                                            <div className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${isHigh ? 'bg-red-500/10 text-red-400' : 'bg-slate-800 text-slate-400'}`}>
                                                {issue.severity}
                                            </div>
                                        </div>

                                        <div className="mt-auto pt-6 border-t border-white/[0.05]">
                                            <div className="flex items-center gap-3 text-slate-400 text-sm font-medium mb-6">
                                                <Info size={16} className="text-blue-400 flex-shrink-0" />
                                                <p className="leading-relaxed">{issue.suggested_fix}</p>
                                            </div>
                                            <button 
                                                onClick={() => handleApplyFix(issue)}
                                                disabled={fixing === issue.id}
                                                className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-3 active:scale-95"
                                            >
                                                {fixing === issue.id ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                                Apply Resolution
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
