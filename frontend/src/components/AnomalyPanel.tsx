import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Activity, 
  Search, 
  ShieldAlert, 
  TrendingDown, 
  TrendingUp,
  Brain,
  Layers,
  Info
} from 'lucide-react';
import { getAnomalies, getDataDrift, AnomalyReport, DataDriftReport, AnomalyPoint } from '../api';

interface Props {
  sessionId: string;
}

const AnomalyPanel: React.FC<Props> = ({ sessionId }) => {
  const [report, setReport] = useState<AnomalyReport | null>(null);
  const [drift, setDrift] = useState<DataDriftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyPoint | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [anomData, driftData] = await Promise.all([
          getAnomalies(sessionId),
          getDataDrift(sessionId)
        ]);
        setReport(anomData);
        setDrift(driftData);
        if (anomData.anomalies.length > 0) {
          setSelectedAnomaly(anomData.anomalies[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sessionId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem', gap: '1rem' }}>
        <div className="spin" style={{ width: '3rem', height: '3rem', border: '4px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
        <p style={{ color: '#94a3b8', fontWeight: 500, letterSpacing: '0.025em' }}>Initializing Statistical Shields...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2.5rem', background: 'rgba(127, 29, 29, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.75rem', textAlign: 'center' }}>
        <AlertTriangle style={{ width: '3rem', height: '3rem', color: '#ef4444', margin: '0 auto 1rem auto' }} />
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'white', marginBottom: '0.5rem' }}>Monitoring Error</h3>
        <p style={{ color: '#fca5a5' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 700ms ease-out' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        
        {/* Left: Summary & Health */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', gridColumn: 'span 2' }}>
          <div style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(15, 23, 42, 0.4)' }}>
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
                    <Activity color="#818cf8" /> Statistical Monitoring
                  </h2>
                  <p style={{ color: '#94a3b8', marginTop: '0.25rem' }}>{report?.summary}</p>
                </div>
                <div style={{
                  padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', border: '1px solid',
                  background: report?.risk_level === 'high' ? 'rgba(239, 68, 68, 0.2)' : report?.risk_level === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  borderColor: report?.risk_level === 'high' ? 'rgba(239, 68, 68, 0.5)' : report?.risk_level === 'medium' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(16, 185, 129, 0.5)',
                  color: report?.risk_level === 'high' ? '#f87171' : report?.risk_level === 'medium' ? '#fbbf24' : '#34d399'
                }}>
                  Risk Level: {report?.risk_level}
                </div>
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      <ShieldAlert style={{ width: '1rem', height: '1rem' }} /> Total Anomalies
                   </div>
                   <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>{report?.total_anomalies}</div>
                </div>
                <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      <Layers style={{ width: '1rem', height: '1rem' }} /> Data Stability
                   </div>
                   <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
                      {drift?.is_significant ? 'Structural Shift Detected' : 'Baseline Stable'}
                   </div>
                </div>
             </div>

             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Detected Anomaly Events</h3>
                <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {report?.anomalies.map((anom) => (
                    <button
                      key={`${anom.column}-${anom.index}`}
                      onClick={() => setSelectedAnomaly(anom)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '1rem', borderRadius: '0.75rem', transition: 'all 200ms', border: '1px solid', cursor: 'pointer', fontFamily: 'var(--font-body)',
                        background: selectedAnomaly === anom ? 'rgba(99, 102, 241, 0.1)' : 'rgba(30, 41, 59, 0.3)',
                        borderColor: selectedAnomaly === anom ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.05)',
                        boxShadow: selectedAnomaly === anom ? '0 0 0 1px rgba(99, 102, 241, 0.2)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ color: 'white', fontWeight: 500 }}>{anom.column}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Row Index: {anom.index}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: '#818cf8', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem' }}>
                            {typeof anom.value === 'number' ? anom.value.toLocaleString() : anom.value}
                          </div>
                          <div style={{ fontSize: '0.625rem', color: '#64748b' }}>Exp: {anom.expected_value?.toLocaleString()}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                  {report?.anomalies.length === 0 && (
                     <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#64748b' }}>
                        <Search style={{ width: '2rem', height: '2rem', margin: '0 auto 0.5rem auto', opacity: 0.2 }} />
                        No significant anomalies detected in this dataset.
                     </div>
                  )}
                </div>
             </div>
          </div>
        </div>

        {/* Right: AI Root Cause Analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(15, 23, 42, 0.6)', position: 'sticky', top: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <Brain color="#e879f9" /> AI Root Cause
            </h3>

            {selectedAnomaly ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'zoomIn 300ms ease-out' }}>
                <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Verdict</div>
                  <p style={{ color: 'white', fontSize: '0.875rem', lineHeight: 1.625 }}>{selectedAnomaly.reason}</p>
                </div>

                <div>
                   <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Contributing Factors</div>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {selectedAnomaly.contributing_factors.map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.75rem' }}>
                          <div style={{ width: '4px', borderRadius: '9999px', background: f.direction === 'positive' ? '#10b981' : '#ef4444' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                              <span style={{ fontSize: '0.75rem', color: 'white', fontWeight: 500 }}>{f.column}</span>
                              <span style={{ fontSize: '0.625rem', fontWeight: 700, color: f.direction === 'positive' ? '#34d399' : '#f87171' }}>
                                {f.direction === 'positive' ? <TrendingUp style={{ width: '12px', height: '12px', display: 'inline', marginRight: '4px' }} /> : <TrendingDown style={{ width: '12px', height: '12px', display: 'inline', marginRight: '4px' }} />}
                                {f.contribution_pct.toFixed(0)}%
                              </span>
                            </div>
                            <div style={{ height: '4px', background: 'rgba(30, 41, 59, 1)', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div 
                                style={{ height: '100%', background: f.direction === 'positive' ? '#10b981' : '#ef4444', width: `${f.contribution_pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>

                <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                   <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     <Info style={{ width: '12px', height: '12px' }} /> Strategic Impact
                   </div>
                   <p style={{ fontSize: '0.75rem', color: '#cbd5e1', fontStyle: 'italic' }}>{report?.impact_assessment}</p>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '5rem 0', color: '#64748b', fontStyle: 'italic', fontSize: '0.875rem' }}>
                Select an anomaly event to view deep analysis.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnomalyPanel;
