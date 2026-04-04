import React, { useState, useEffect } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Minimize2,
  Settings,
  Presentation,
  BarChart3,
  Dna,
  ShieldCheck,
  Zap
} from 'lucide-react';
import ExecutiveSummary from './ExecutiveSummary';
import { ChartPanel } from './ChartPanel';
import { SimulationPanel } from './SimulationPanel';
import DataHealthDashboard from './DataHealthDashboard';
import { ForecastPanel } from './ForecastPanel';
import type { UploadResponse } from '../api';
import '../presentation.css';

interface Props {
  sessionId: string;
  onClose: () => void;
  analysis: any;
  session: UploadResponse;
}

const PresenterMode: React.FC<Props> = ({ sessionId, onClose, analysis, session }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const slides = [
    { 
      title: "Strategic Overview", 
      icon: <Presentation className="w-5 h-5" />, 
      content: <ExecutiveSummary sessionId={sessionId} /> 
    },
    { 
      title: "Operational Health", 
      icon: <ShieldCheck className="w-5 h-5" />, 
      content: <DataHealthDashboard sessionId={sessionId} onDataUpdate={() => {}} /> 
    },
    { 
      title: "Key Market Metrics", 
      icon: <BarChart3 className="w-5 h-5" />, 
      content: analysis.charts && analysis.charts.length > 0 ? (
        <ChartPanel chart={analysis.charts[0]} />
      ) : (
        <div className="p-8 text-center text-gray-500">No comparative metrics available for this dataset.</div>
      )
    },
    { 
      title: "Predictive Intelligence", 
      icon: <Zap className="w-5 h-5" />, 
      content: <ForecastPanel session={session} /> 
    },
    { 
      title: "Strategic Simulation", 
      icon: <Dna className="w-5 h-5" />, 
      content: <SimulationPanel sessionId={sessionId} columns={Object.keys(analysis.profile?.cardinality_map || {})} analysis={analysis} /> 
    },
  ];

  const handleNext = () => setCurrentSlide((prev: number) => (prev + 1) % slides.length);
  const handlePrev = () => setCurrentSlide((prev: number) => (prev - 1 + slides.length) % slides.length);

  // Sync fullscreen state with browser
  useEffect(() => {
    const onFullscreenChange = () => {
        setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Space' || e.key === ' ') {
            e.preventDefault();
            handleNext();
        } else if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'ArrowRight') {
            handleNext();
        } else if (e.key === 'ArrowLeft') {
            handlePrev();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, onClose]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  };

  return (
    <div className="obsidian-deck fixed inset-0 z-[100] flex flex-col font-sans animate-in fade-in duration-1000 overflow-hidden select-none">
      {/* Cinematic Nebula Layer */}
      <div className="nexus-nebula pointer-events-none" />

      {/* Top HUD Section */}
      <div className="h-20 z-20 flex items-center justify-between px-10 glass-hud border-t-0 border-x-0 border-b-white/5 mx-5 mt-5 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-[0.25em] text-blue-500 uppercase flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-blue-500 pulse-emerald shadow-[0_0_10px_#3b82f6]" />
               Nexus Intelligence System // v2.0
            </span>
            <h1 className="nexus-title-v2 text-4xl mt-1 tracking-tighter">
              NEXUS <span className="text-white/20">/</span> STRATEGY
            </h1>
          </div>

          <div className="w-px h-10 bg-white/5" />

          <div className="flex flex-col">
             <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Active Analysis Session</span>
             <span className="text-xs font-black text-white/70 tracking-tight">{analysis.filename.replace('.csv', '')}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.15em]">System Status</span>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-bold text-emerald-400/80 uppercase">Fully Operational</span>
                    <div className="flex gap-0.5">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="w-1 h-3 rounded-full bg-emerald-500/30" />
                        ))}
                    </div>
                </div>
            </div>

            <div className="w-px h-8 bg-white/5" />

            <div className="flex items-center gap-3">
                <button 
                    onClick={toggleFullScreen}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/40 hover:text-white border border-white/5 active:scale-95"
                >
                    {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button 
                    onClick={onClose}
                    className="p-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all border border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)] active:scale-90"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
      </div>

      <div className="flex flex-1 z-10 overflow-hidden relative">
        {/* Left Command Sidebar */}
        <div className="sidebar-command glass-hud flex flex-col gap-8 shadow-2xl relative border-white/5">
            <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] pl-2 mb-2">Strategy Map</span>
                {slides.map((slide, idx) => (
                    <button 
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        className={`nav-item-v2 flex items-center gap-4 px-5 py-4 rounded-xl text-left ${idx === currentSlide ? 'active' : 'text-white/40 hover:bg-white/5'}`}
                    >
                        <div className={`transition-transform duration-500 ${idx === currentSlide ? 'scale-110' : 'opacity-40'}`}>
                            {slide.icon}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black tracking-widest uppercase opacity-40">Phase 0{idx+1}</span>
                            <span className="text-[11px] font-bold uppercase tracking-tight">{slide.title}</span>
                        </div>
                    </button>
                ))}
            </div>

            <div className="mt-auto p-5 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck size={16} className="text-emerald-500" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/60">ZK Proof Verified</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-full animate-pulse transition-all duration-1000 shadow-[0_0_10px_#10b981]" />
                </div>
            </div>
        </div>

        {/* Content Region */}
        <div className="content-stage-v2 glass-hud flex flex-col relative group border-white/5">
             <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:scale-105 transition-transform duration-[3s]">
                {slides[currentSlide].icon && React.cloneElement(slides[currentSlide].icon as React.ReactElement, { size: 400 })}
             </div>

             <div className="relative z-10 flex flex-col h-full overflow-y-auto pr-4 scrollbar-hide">
                  <div className="flex items-center gap-3 mb-8">
                      <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[9px] font-black text-blue-400 uppercase tracking-widest">
                          Operational View v1.0
                      </div>
                      <span className="text-white/10">/</span>
                      <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest italic">{slides[currentSlide].title} Deployment Phase</span>
                  </div>

                  <div className="mb-10">
                    <h2 className="text-6xl font-black text-white italic tracking-tighter uppercase">
                        {slides[currentSlide].title}
                    </h2>
                    <div className="w-24 h-1.5 bg-blue-600 rounded-full mt-4 shadow-[0_0_20px_#2563eb]" />
                  </div>

                  <div className="flex-1 min-h-0 animate-in slide-in-from-right-10 fade-in duration-700">
                      {slides[currentSlide].content}
                  </div>
             </div>

             {/* Navigation HUD Arrows */}
             <div className="absolute bottom-8 right-8 flex gap-3">
                 <button 
                    onClick={handlePrev}
                    className="p-5 glass-hud rounded-2xl text-white/30 hover:text-white hover:bg-blue-600 transition-all active:scale-90 border-white/5 group/nav"
                 >
                    <ChevronLeft size={24} className="group-hover/nav:-translate-x-1 transition-transform" />
                 </button>
                 <button 
                    onClick={handleNext}
                    className="p-5 glass-hud rounded-2xl text-white/30 hover:text-white hover:bg-blue-600 transition-all active:scale-90 border-white/5 group/nav"
                 >
                    <ChevronRight size={24} className="group-hover/nav:translate-x-1 transition-transform" />
                 </button>
             </div>
        </div>
      </div>

      {/* Global Metadata Tier */}
      <div className="h-12 z-20 flex items-center justify-between px-12 glass-hud mx-5 mb-5 rounded-2xl border-b-0 border-x-0 border-t-white/5 opacity-80 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-10">
            <div className="flex items-center gap-3">
                <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Strategy Penetration</span>
                <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6] transition-all duration-700"
                        style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                    />
                </div>
                <span className="nexus-mono text-[9px] font-bold text-blue-400">
                    {Math.round(((currentSlide + 1) / slides.length) * 100)}%
                </span>
            </div>

            <div className="flex items-center gap-3">
                <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Compute Stability</span>
                <div className="flex gap-0.5">
                    {[1,2,3,4,5,6,7,8].map(i => (
                        <div key={i} className={`w-0.5 h-2 rounded-full ${i <= 6 ? 'bg-blue-500/80 shadow-[0_0_5px_#3b82f6]' : 'bg-white/5'}`} />
                    ))}
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4 text-[9px] font-bold text-white/20 uppercase tracking-[0.3em]">
            <span className="text-white/60">[SPACE]</span> TO ADVANCE <span className="mx-2 opacity-10">//</span> <span className="text-white/60">[ESC]</span> RELEASE MODE
        </div>
      </div>
    </div>
  );
;
};

export default PresenterMode;
