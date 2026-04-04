import React, { useEffect, useState } from 'react';
import { 
  getExecutiveSummary, 
  ExecutiveSummary as ExecutiveSummaryType, 
  exportExecutiveReport 
} from '../api';
import { 
  Download, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle, 
  Presentation,
  Loader2,
  Target,
  Activity,
  BrainCircuit,
  Sparkles,
  ChevronRight,
  BarChart3
} from 'lucide-react';

const PremiumGauge: React.FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      setOffset(circumference - (value / 100) * circumference);
    }, 300);
    return () => clearTimeout(timeout);
  }, [value, circumference]);

  return (
    <div className="flex flex-col items-center gap-4 group">
      <div className="relative w-28 h-28 flex items-center justify-center">
        {/* Glow effect behind gauge */}
        <div className={`absolute inset-0 opacity-20 blur-xl rounded-full transition-opacity duration-700 group-hover:opacity-40`} style={{ backgroundColor: color }} />
        
        <svg className="w-full h-full transform -rotate-90 relative z-10 drop-shadow-xl">
          <circle
            cx="56" cy="56" r={radius}
            stroke="rgba(255,255,255,0.03)"
            strokeWidth="8"
            fill="transparent"
          />
          <circle
            cx="56" cy="56" r={radius}
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-[2s] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className="text-2xl font-black text-white tracking-tighter" style={{ textShadow: `0 0 10px ${color}80` }}>{value}%</span>
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold text-center max-w-[100px] leading-tight">{label}</span>
    </div>
  );
};

interface Props {
  sessionId: string;
}

const ExecutiveSummary: React.FC<Props> = ({ sessionId }) => {
  const [summary, setSummary] = useState<ExecutiveSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const data = await getExecutiveSummary(sessionId);
        setSummary(data);
      } catch (err) {
        setError('Failed to load executive summary.');
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [sessionId]);

  const handleExport = async (format: 'pptx' | 'pdf') => {
    try {
      setExporting(format);
      const blob = await exportExecutiveReport(sessionId, { format });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NexusAI_Executive_Report_${sessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] gap-8 animate-in fade-in duration-1000">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full animate-pulse" />
          <Loader2 className="relative animate-spin text-blue-400" size={56} />
        </div>
        <div className="flex flex-col items-center gap-2">
            <h3 className="text-xl font-bold tracking-tight text-white">Synthesizing Intelligence</h3>
            <p className="text-slate-400 text-sm font-medium tracking-wide">Compiling strategic models and predictive insights...</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex items-center justify-center h-[400px]">
          <div className="p-10 text-center bg-slate-900/40 border border-slate-700/50 rounded-[32px] backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <ShieldAlert className="w-16 h-16 text-slate-500 group-hover:text-red-400 transition-colors mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Intelligence Pending</h3>
            <p className="text-slate-400 max-w-sm mx-auto">Run a full copilot analysis to generate the executive report.</p>
          </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-12 duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] pb-12 w-full max-w-6xl mx-auto">
      
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 relative">
        <div className="z-10 relative">
          <div className="inline-flex items-center gap-3 mb-4 backdrop-blur-md bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-full">
            <BrainCircuit size={16} className="text-blue-400 animate-pulse" />
            <span className="text-blue-300 font-bold text-[11px] tracking-[0.2em] uppercase">Executive Intel v2.0</span>
          </div>
          <h2 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500 tracking-tighter pb-1">
            Strategic Synthesis
          </h2>
        </div>
        
        <div className="flex bg-slate-900/60 p-1.5 rounded-[24px] border border-white/10 backdrop-blur-2xl shadow-2xl z-10">
          <button
            onClick={() => handleExport('pptx')}
            disabled={!!exporting}
            className="px-6 py-3 hover:bg-white/5 rounded-[20px] font-bold text-sm text-slate-300 hover:text-white transition-all flex items-center gap-2 group"
          >
            {exporting === 'pptx' ? <Loader2 size={16} className="animate-spin text-blue-400" /> : <Presentation size={16} className="group-hover:text-blue-400 transition-colors" />}
            Overview Deck
          </button>
          <div className="w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent mx-1" />
          <button
            onClick={() => handleExport('pdf')}
            disabled={!!exporting}
            className="px-6 py-3 hover:bg-white/5 rounded-[20px] font-bold text-sm text-slate-300 hover:text-white transition-all flex items-center gap-2 group"
          >
            {exporting === 'pdf' ? <Loader2 size={16} className="animate-spin text-purple-400" /> : <Download size={16} className="group-hover:text-purple-400 transition-colors" />}
            PDF Report
          </button>
        </div>
      </div>

      {/* Hero Insight Glass Box */}
      <div className="relative overflow-hidden bg-slate-900/40 backdrop-blur-3xl rounded-[40px] border border-white/[0.08] p-10 md:p-14 shadow-2xl group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-transparent transition-opacity duration-700 opacity-50 group-hover:opacity-100" />
        {/* Animated Orbs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/20 blur-[120px] rounded-full mix-blend-screen animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/20 blur-[120px] rounded-full mix-blend-screen" style={{ animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite reverse' }} />
        
        <div className="relative z-10 flex flex-col items-start gap-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <Sparkles size={14} className="text-indigo-300" /> 
            <span className="text-indigo-200 text-[11px] font-black uppercase tracking-[0.2em]">Key Takeaway</span>
          </div>
          <h3 className="text-3xl md:text-5xl font-medium leading-[1.2] text-white tracking-tight max-w-[90%] font-serif">
            "{summary.key_takeaway}"
          </h3>
        </div>
      </div>

      {/* Strategic Pillars Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
        {summary.strategic_pillars.map((pillar, idx) => {
            const isData = pillar.title.includes('Data') || pillar.title.includes('Integrity');
            const isGrowth = pillar.title.includes('Growth') || pillar.title.includes('Predict');
            const colorClass = isData ? 'blue' : isGrowth ? 'purple' : 'emerald';
            const colorHex = isData ? '#60a5fa' : isGrowth ? '#c084fc' : '#34d399';
            const Icon = isData ? Activity : isGrowth ? TrendingUp : Target;

            return (
                <div key={idx} className="bg-slate-900/60 backdrop-blur-2xl rounded-[32px] border border-white/[0.05] p-8 hover:bg-white/[0.02] transition-all duration-500 flex flex-col group relative overflow-hidden shadow-xl">
                    <div className={`absolute top-0 right-0 w-64 h-64 bg-${colorClass}-500/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
                    
                    <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center gap-4 mb-6">
                            <div className={`p-4 bg-${colorClass}-500/10 rounded-[20px] border border-${colorClass}-500/20 group-hover:scale-110 shadow-lg shadow-${colorClass}-500/10 transition-transform duration-500`}>
                                <Icon size={24} className={`text-${colorClass}-400`} />
                            </div>
                            <div>
                                <span className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] block mb-1">Pillar 0{idx+1}</span>
                                <h4 className="text-xl font-bold text-white tracking-tight leading-tight">{pillar.title}</h4>
                            </div>
                        </div>
                        
                        <p className="text-slate-400 text-sm leading-relaxed font-medium mb-10 flex-1">
                            {pillar.content}
                        </p>
                        
                        {pillar.impact_metrics && (
                            <div className="grid grid-cols-2 gap-3 pt-6 border-t border-white/[0.05] mt-auto">
                                {Object.entries(pillar.impact_metrics).map(([label, value]) => {
                                    const valStr = String(value);
                                    const isZero = valStr === "0" || valStr === "0.00" || valStr === "0.0" || valStr === "TBD";
                                    const isPercent = valStr.includes('%');
                                    const numericValue = parseFloat(valStr.replace('%', ''));
                                    
                                    if (isPercent && !isZero && !isNaN(numericValue)) {
                                        return (
                                            <div key={label} className="col-span-2 flex justify-center py-4 bg-black/20 rounded-2xl border border-white/[0.03] group-hover:border-white/[0.08] transition-colors">
                                                <PremiumGauge value={numericValue} label={label} color={colorHex} />
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={label} className="bg-black/20 p-5 rounded-2xl border border-white/[0.03] group-hover:border-white/[0.08] transition-colors flex flex-col gap-2 justify-center">
                                            <div className="flex items-baseline gap-1">
                                                <span className={`text-2xl font-black tracking-tighter ${isZero ? 'text-slate-600' : 'text-white'}`}>
                                                    {isZero ? "TBD" : valStr.replace(/[^0-9.-]/g, '')}
                                                </span>
                                                {!isZero && valStr.replace(/[0-9.-]/g, '') && (
                                                    <span className={`text-sm font-bold ${`text-${colorClass}-400`}`}>
                                                        {valStr.replace(/[0-9.-]/g, '')}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[9px] font-black uppercase text-slate-500 tracking-[0.1em]">{label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            );
        })}
      </div>

      {/* Action Footer Split */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 w-full">
        {/* Risk Assessment Box */}
        <div className="md:col-span-2 p-8 bg-slate-900/60 backdrop-blur-2xl rounded-[32px] border border-white/[0.05] hover:border-red-500/20 transition-colors group overflow-hidden relative">
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-red-500/10 blur-[60px] rounded-full group-hover:bg-red-500/20 transition-colors" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
                        <ShieldAlert size={20} className="text-red-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white tracking-tight">Risk Context</h3>
                </div>
                <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 shrink-0">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Environment</span>
                </div>
            </div>
            
            <div className="bg-black/20 p-5 rounded-2xl border border-white/[0.03] flex-1">
                <p className="text-slate-300 text-sm leading-relaxed font-medium">
                    {summary.risk_assessment}
                </p>
            </div>
          </div>
        </div>

        {/* Strategic Directives List */}
        <div className="md:col-span-3 p-8 bg-slate-900/60 backdrop-blur-2xl rounded-[32px] border border-white/[0.05] hover:border-blue-500/20 transition-colors relative overflow-hidden group">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full group-hover:bg-blue-500/10 transition-colors" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <CheckCircle size={20} className="text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">Strategic Directives</h3>
            </div>
            <div className="flex flex-col gap-3">
                {summary.next_steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-default">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
                        <span className="text-[11px] font-black text-slate-400">{idx+1}</span>
                    </div>
                    <span className="text-slate-200 text-sm font-medium leading-normal flex-1">{step}</span>
                    <ChevronRight size={14} className="text-slate-600" />
                </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveSummary;
