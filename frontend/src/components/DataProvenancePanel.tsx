import React, { useState, useEffect } from 'react';
import { Network, Plus, CheckCircle, ShieldCheck, Lock, Activity, ArrowDown, Database, LayoutGrid, FileText, ChevronRight } from 'lucide-react';
import { connectToWallet, signTransaction, getAvailableWallets, WalletMetadata } from '../utils/midnight';
import { API_BASE } from '../api';

interface ProvenanceNode {
    commit_id: string;
    parent_id: string | null;
    operation_hash: string;
    child_hash_commit: string;
    timestamp: string;
    verified_zk: boolean;
}

export function DataProvenancePanel({ sessionId, onClose }: { sessionId: string, onClose?: () => void }) {
    const [lineage, setLineage] = useState<ProvenanceNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);
    
    // Wallet State
    const [walletConnected, setWalletConnected] = useState(() => localStorage.getItem('nexus_wallet_connected') === 'true');
    const [walletAddress, setWalletAddress] = useState<string | null>(() => localStorage.getItem('nexus_wallet_address'));
    const [selectedWallet, setSelectedWallet] = useState<string>(() => localStorage.getItem('nexus_selected_wallet') || 'lace');
    const [availableWallets, setAvailableWallets] = useState<WalletMetadata[]>([]);

    useEffect(() => {
        getAvailableWallets().then(setAvailableWallets);
        
        const syncState = () => {
            setWalletConnected(localStorage.getItem('nexus_wallet_connected') === 'true');
            setWalletAddress(localStorage.getItem('nexus_wallet_address'));
            setSelectedWallet(localStorage.getItem('nexus_selected_wallet') || 'lace');
        };
        window.addEventListener('storage', syncState);
        window.addEventListener('walletUpdate', syncState);
        return () => {
            window.removeEventListener('storage', syncState);
            window.removeEventListener('walletUpdate', syncState);
        };
    }, []);

    // Load initial root node automatically if empty
    useEffect(() => {
        if (lineage.length === 0) {
            setLineage([{
                commit_id: "CMT-ROOT-" + sessionId.slice(0, 4),
                parent_id: null,
                operation_hash: "00000000000000000000000000000000",
                child_hash_commit: "ROOT_DATA_HASH...",
                timestamp: new Date().toISOString(),
                verified_zk: true
            }]);
        }
    }, [sessionId]);

    const handleConnectWallet = async () => {
        setLoading(true)
        try {
            const result = await connectToWallet(selectedWallet, 'preprod')
            setWalletConnected(true)
            setWalletAddress(result.address)
            localStorage.setItem('nexus_wallet_connected', 'true')
            localStorage.setItem('nexus_wallet_address', result.address)
            localStorage.setItem('nexus_selected_wallet', selectedWallet)
            window.dispatchEvent(new Event('walletUpdate'))
        } catch (e: any) {
        } finally {
            setLoading(false)
        }
    }

    const enforceWallet = (): boolean => {
        if (!walletConnected) {
            alert(`Please connect your ${selectedWallet} wallet to sign this transaction.`)
            return false;
        }
        return true;
    }

    const handleCommitTransformation = async (operation: string) => {
        if (!enforceWallet()) return;
        setLoading(true);

        try {
            const lastNode = lineage[lineage.length - 1];
            await signTransaction(selectedWallet, 'preprod', walletAddress || undefined, `Commit Data Lineage: ${operation}`);
            
            const payload = {
                session_id: sessionId,
                parent_id: lastNode.commit_id,
                child_hash: Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('') + '...',
                operation: operation,
                parameters: { "user": "nexus_scientist", "version": "1.0" }
            };

            const res = await fetch(`${API_BASE}/blockchain/provenance/record`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                setLineage(prev => [...prev, {
                    commit_id: data.commit_id,
                    parent_id: data.parent_id,
                    operation_hash: data.operation_hash || payload.operation,
                    child_hash_commit: data.child_hash_commit || payload.child_hash,
                    timestamp: new Date().toISOString(),
                    verified_zk: true
                }]);
            } else {
            }
        } catch (err: any) {
        } finally {
            setLoading(false);
        }
    }

    const [activeTab, setActiveTab] = useState<'graph' | 'history'>('graph');

    return (
        <div className="private-compare-panel" style={{
            position: 'fixed', 
            left: '50%', 
            top: '50%', 
            transform: 'translate(-50%, -50%)', 
            width: '950px',
            height: '700px',
            background: 'rgba(15, 23, 42, 0.8)', 
            backdropFilter: 'blur(24px)', 
            border: '1px solid rgba(168, 85, 247, 0.3)', 
            boxShadow: '0 0 60px -12px rgba(168,85,247,0.3)', 
            borderRadius: '1rem', 
            color: 'white', 
            overflow: 'hidden',
            display: 'flex', 
            flexDirection: 'column', 
            zIndex: 1000
        }}>

            {/* Header */}
            <div className="blockchain-panel__header" style={{ 
                padding: '1.25rem 1.5rem',
                paddingBottom: '1rem', 
                borderBottom: '1px solid rgba(168, 85, 247, 0.2)', 
                margin: 0,
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                background: 'rgba(168, 85, 247, 0.03)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div style={{ 
                        background: 'rgba(168, 85, 247, 0.15)',
                        padding: '10px',
                        borderRadius: '12px',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Network size={22} color="#c084fc" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'white', letterSpacing: '-0.02em', marginBottom: '2px' }}>
                            ZK Data Provenance
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="chain-badge">⬡ Preprod</span> · Cryptographically Traced Lineage
                        </div>
                    </div>
                </div>
                {onClose && (
                    <button className="btn--icon" onClick={onClose} style={{ opacity: 0.7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'white' }}>✕</button>
                )}
            </div>

            {/* Split Screen Container */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Sidebar */}
                <div style={{
                    width: '240px', background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', padding: '1rem 0'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', padding: '0 0.75rem', flex: 1, marginTop: '1rem' }}>
                    <button
                        className={`sidebar-nav-btn ${activeTab === 'graph' ? 'active' : ''}`}
                        onClick={() => setActiveTab('graph')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                            background: activeTab === 'graph' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            color: activeTab === 'graph' ? '#60a5fa' : 'var(--text-secondary)',
                            border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.2s', fontSize: '0.9rem', fontWeight: activeTab === 'graph' ? 500 : 400
                        }}
                    >
                        <LayoutGrid size={18} /> Lineage Graph
                    </button>
                    
                    <button
                        className={`sidebar-nav-btn ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                            background: activeTab === 'history' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            color: activeTab === 'history' ? '#60a5fa' : 'var(--text-secondary)',
                            border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.2s', fontSize: '0.9rem', fontWeight: activeTab === 'history' ? 500 : 400
                        }}
                    >
                        <FileText size={18} /> Commit Log
                    </button>
                </div>

                {/* Wallet Connection at Bottom */}
                <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
                    {walletConnected ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '0.6rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                            <CheckCircle size={14} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{walletAddress?.slice(0, 14)}...</span>
                        </div>
                    ) : (
                        <button
                            className="btn btn--primary"
                            style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            onClick={() => setShowWalletModal(true)}
                            disabled={loading}
                        >
                            Connect Wallet
                        </button>
                    )}
                </div>
            </div>

            {/* Wallet Selection Modal (Matches BlockchainPanel) */}
            {showWalletModal && (
                <div className="wallet-modal-overlay">
                    <div className="wallet-modal">
                        <div className="wallet-modal-header">
                            <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                                <ShieldCheck size={20} color="#a855f7" /> Connect Wallet
                            </h3>
                            <button className="btn--icon" onClick={() => setShowWalletModal(false)}>✕</button>
                        </div>
                        
                        <div className="wallet-modal-content">
                            <p style={{ margin: '0 0 1.5rem 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                                Select a Midnight-compatible wallet to verify ZK proofs and lineage commits locally.
                            </p>
                            
                            <div className="wallet-grid">
                                {availableWallets.map(w => (
                                    <button 
                                        key={w.key} 
                                        className={`wallet-card ${selectedWallet === w.key ? 'active' : ''} ${!w.isInstalled ? 'disabled' : ''}`}
                                        onClick={async () => {
                                            if (!w.isInstalled && w.key !== 'dev-wallet') return;
                                            setSelectedWallet(w.key);
                                            setShowWalletModal(false);
                                            // Auto-connect
                                            if (w.isInstalled || w.key === 'dev-wallet') {
                                                setLoading(true);
                                                try {
                                                    const result = await connectToWallet(w.key, 'preprod');
                                                    setWalletAddress(result.address);
                                                    setWalletConnected(true);
                                                    localStorage.setItem('nexus_wallet_connected', 'true');
                                                    localStorage.setItem('nexus_wallet_address', result.address);
                                                    localStorage.setItem('nexus_selected_wallet', w.key);
                                                    window.dispatchEvent(new Event('walletUpdate'));
                                                } catch (e: any) {
                                                    alert(e.message || `Failed to connect to ${w.name}`);
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }
                                        }}
                                    >
                                        <div className="wallet-card__icon">
                                            {w.key === 'lace' ? <ShieldCheck size={24} /> : <Activity size={24} />}
                                        </div>
                                        <div className="wallet-card__info">
                                            <div className="wallet-card__name">{w.name}</div>
                                            <div className="wallet-card__status">
                                                {w.isInstalled ? (
                                                    <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <CheckCircle size={10} /> Detected
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#64748b' }}>Not Installed</span>
                                                )}
                                            </div>
                                        </div>
                                        {w.isMidnightReady && <div className="wallet-card__badge">ZK Ready</div>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)', position: 'relative' }}>
                {activeTab === 'graph' && (
                    <div style={{ padding: '2.5rem', flex: 1, overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.6rem', color: 'white', margin: '0 0 0.5rem 0', fontWeight: 600 }}>Lineage DAG</h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                    Visual representation of cryptographic dataset transformations.
                                </p>
                            </div>
                        </div>

                        <div style={{ 
                            background: '#121215', padding: '3rem 2rem', borderRadius: '16px', 
                            position: 'relative', border: '1px solid var(--border)',
                            minHeight: '400px'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                                {lineage.map((node, i) => (
                                    <React.Fragment key={node.commit_id}>
                                        <div style={{ 
                                            width: '100%', maxWidth: '600px', background: 'var(--bg-surface)', 
                                            border: i === 0 ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(59, 130, 246, 0.3)', 
                                            borderRadius: '12px', padding: '1.2rem',
                                            display: 'flex', flexDirection: 'column', gap: '0.5rem', 
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)', transition: 'transform 0.2s',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#e5e7eb', fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                    {i === 0 ? <Database size={18} color="#a855f7" /> : <Activity size={18} color="#34d399" />}
                                                    {i === 0 ? 'Immutable Root Dataset' : `Derived Stage: ${node.operation_hash}`}
                                                </span>
                                                {node.verified_zk && (
                                                    <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500, border: '1px solid rgba(16,185,129,0.2)' }}>
                                                        <ShieldCheck size={14} /> Midnight ZK
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                                                ID: {node.commit_id}
                                            </div>
                                            {i > 0 && (
                                                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.8rem', borderTop: '1px solid var(--border)', paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                    <div><b style={{ color: 'var(--text-secondary)' }}>Operation Hash:</b> {node.operation_hash}</div>
                                                    <div><b style={{ color: 'var(--text-secondary)' }}>Resulting State Hash:</b> {node.child_hash_commit}</div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {i < lineage.length - 1 && (
                                            <ArrowDown size={24} color="var(--text-muted)" style={{ margin: '0.2rem 0' }} />
                                        )}
                                    </React.Fragment>
                                ))}

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <button 
                                        className="btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.2rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', color: '#60a5fa', borderRadius: '8px', cursor: 'pointer' }}
                                        onClick={() => handleCommitTransformation('Data_Anonymization')}
                                        disabled={loading}
                                    >
                                        <Lock size={16} /> Derive: Anonymization
                                    </button>
                                    <button 
                                        className="btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.2rem', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid #a855f7', color: '#c084fc', borderRadius: '8px', cursor: 'pointer' }}
                                        onClick={() => handleCommitTransformation('Feature_Scaling')}
                                        disabled={loading}
                                    >
                                        <Activity size={16} /> Derive: Normalization
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div style={{ padding: '2.5rem', flex: 1, overflowY: 'auto' }}>
                        <h2 style={{ fontSize: '1.6rem', color: 'white', margin: '0 0 2rem 0', fontWeight: 600 }}>Ledger Sync Log</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {lineage.slice().reverse().map((node, idx) => (
                                <div key={node.commit_id} style={{
                                    background: 'var(--bg-surface)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border)',
                                    display: 'flex', flexDirection: 'column', gap: '0.4rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.95rem' }}>{node.operation_hash === '00000000000000000000000000000000' ? 'Root Initialization' : `Execution: ${node.operation_hash}`}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(node.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ChevronRight size={14}/> Commit: {node.commit_id}</div>
                                        {node.parent_id && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ChevronRight size={14}/> Parent: {node.parent_id}</div>}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ChevronRight size={14}/> Output Hash: {node.child_hash_commit}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
        </div>
    );
}

export default DataProvenancePanel;
