import { useState, useEffect, useCallback } from 'react'
import {
    Shield, Link, Clock, CheckCircle, AlertCircle, Loader2,
    ExternalLink, Copy, ChevronDown, ChevronRight, Zap, Lock, Database, Wallet, LayoutGrid, ShieldCheck, BarChart2, EyeOff
} from 'lucide-react'
import type {
    ZKIdentity, BlockchainRecord, DatasetFingerprint, ProvenanceResult
} from '../api'
import { API_BASE, getHeaders, getProvenance, getPublicLedger, getLedgerStats } from '../api'
import { 
    connectToWallet, getWalletAddress, getAvailableWallets, 
    signTransaction,
    type WalletMetadata, SUPPORTED_WALLETS 
} from '../utils/midnight'
import type { LedgerStats } from '../api'
import {
    getZKIdentity, registerOnChain, generateFingerprint,
    getMyFingerprints, generateAuditProof,
    verifyOwnership, verifyAuditProof
} from '../api'
import type { UploadResponse } from '../api'

interface Props {
    sessionId: string
    session: UploadResponse
    onClose: () => void
}

const EVENT_COLORS: Record<string, string> = {
    REGISTER: '#00e5ff',
    FINGERPRINT: '#a855f7',
    MARKETPLACE_LIST: '#22d3ee',
    COMPARE: '#f59e0b',
    TRANSFORM: '#34d399',
    EXPORT: '#f472b6',
    ZK_AUDIT: '#facc15',
    CREDENTIAL_ISSUED: '#60a5fa',
}

export default function BlockchainPanel({ sessionId, session, onClose }: Props) {
    const [identity, setIdentity] = useState<ZKIdentity | null>(null)
    const [registration, setRegistration] = useState<{ block_hash: string; block_number: number; timestamp: string; verified: boolean } | null>(null)
    const [fingerprints, setFingerprints] = useState<DatasetFingerprint[]>([])
    const [provenance, setProvenance] = useState<ProvenanceResult | null>(null)
    const [ledger, setLedger] = useState<BlockchainRecord[]>([])
    const [activeTab, setActiveTab] = useState<'identity' | 'provenance' | 'ledger' | 'fingerprints' | 'certificates'>('identity')
    const [auditProof, setAuditProof] = useState<{ audit_id: string; status: string; zk_proof: string; fingerprint: string } | null>(() => {
        const saved = localStorage.getItem(`nexus_audit_${sessionId}`);
        return saved ? JSON.parse(saved) : null;
    })
    const [auditLoading, setAuditLoading] = useState(false)
    const [registering, setRegistering] = useState(false)
    const [fingerprintLoading, setFingerprintLoading] = useState(false)
    const [copiedHash, setCopiedHash] = useState<string | null>(null)
    const [expandedBlock, setExpandedBlock] = useState<number | null>(null)
    const [registered, setRegistered] = useState(false)
    const [privacyLevel, setPrivacyLevel] = useState(0)
    
    // Resizing state
    const [panelWidth, setPanelWidth] = useState(850)
    const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null)
    const [startX, setStartX] = useState(0)
    const [startWidth, setStartWidth] = useState(850)

    const [verifyLoading, setVerifyLoading] = useState<string | null>(null)
    const [verifyResult, setVerifyResult] = useState<Record<string, { success: boolean; msg: string; tx?: string }>>({})

    const handleVerifyOwnership = async (fpId: string) => {
        setVerifyLoading(fpId)
        try {
            const res = await verifyOwnership(sessionId, fpId)
            setVerifyResult(prev => ({ ...prev, [fpId]: { success: res.verified, msg: res.verified ? 'Verified on-chain' : 'Verification failed', tx: res.proof } }))
        } catch (e: any) {
            setVerifyResult(prev => ({ ...prev, [fpId]: { success: false, msg: e.message } }))
        }
        setVerifyLoading(null)
    }

    const handleVerifyAudit = async (auditId: string) => {
        setVerifyLoading(auditId)
        try {
            const res = await verifyAuditProof(auditId)
            setVerifyResult(prev => ({ ...prev, [auditId]: { success: res.verified, msg: res.verified ? 'Valid Zero-Knowledge Proof' : 'Forged or invalid proof', tx: res.proof } }))
        } catch (e: any) {
            setVerifyResult(prev => ({ ...prev, [auditId]: { success: false, msg: e.message } }))
        }
        setVerifyLoading(null)
    }

    // Resize handlers
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return
            
            // Symmetric expansion: if dragging left or right, calculate distance from center
            // but for simplicity and better control, we use the change in mouse position
            // and double it to apply to both sides equally.
            const dx = e.clientX - startX
            const newWidth = isResizing === 'right' 
                ? startWidth + dx * 2
                : startWidth - dx * 2
                
            setPanelWidth(Math.max(600, Math.min(window.innerWidth - 40, newWidth)))
        }
        
        const handleMouseUp = () => setIsResizing(null)
        
        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isResizing, startX, startWidth])

    const startResize = (e: React.MouseEvent, direction: 'left' | 'right') => {
        e.preventDefault()
        setIsResizing(direction)
        setStartX(e.clientX)
        setStartWidth(panelWidth)
    }

    const [signingTx, setSigningTx] = useState(false)
    const [availableWallets, setAvailableWallets] = useState<WalletMetadata[]>([])
    const [selectedWallet, setSelectedWallet] = useState<string>(() => localStorage.getItem('nexus_selected_wallet') || 'lace')
    const [walletConnected, setWalletConnected] = useState(() => localStorage.getItem('nexus_wallet_connected') === 'true')
    const [walletAddress, setWalletAddress] = useState<string | null>(() => localStorage.getItem('nexus_wallet_address'))

    useEffect(() => {
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
    const [showWalletModal, setShowWalletModal] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)

    useEffect(() => {
        getAvailableWallets().then(setAvailableWallets);
    }, []);

    const load = useCallback(async () => {
        try {
            const id = await getZKIdentity(sessionId)
            setIdentity(id)
        } catch (e) {
        }
        try {
            const fp = await getMyFingerprints(sessionId)
            setFingerprints(fp.fingerprints)
        } catch (e) {
        }
        try {
            const prov = await getProvenance(sessionId)
            setProvenance(prov)
        } catch (e) {
        }
    }, [sessionId])

    useEffect(() => { load() }, [load])

    const signWithLace = async (actionMsg: string) => {
        try {
            await signTransaction(selectedWallet, 'preprod', walletAddress || undefined, actionMsg);
        } catch (e: any) {
            if (e.message?.includes('REFRESH YOUR BROWSER')) {
                alert(`🚨 LACE EXTENSION DESYNC 🚨\n\nYour Lace wallet has lost connection to this browser tab.\n\nPlease refresh the webpage to continue.`);
            } else {
                alert(`Signing Failed: ${e.message || 'User rejected or timeout'}`);
            }
            throw e;
        }
    }

    const handleRegister = async () => {
        if (!walletConnected) {
            alert(`Please connect your ${selectedWallet} wallet first to sign the transaction.`)
            return
        }
        
        setRegistering(true)
        setSigningTx(true)
        
        try {
            await signWithLace(`Register Dataset on Midnight ZK Ledger: ${session.filename}`)
            setSigningTx(false)
            
            const rec = await registerOnChain(sessionId, {
                filename: session.filename,
                row_count: session.row_count,
                column_count: session.column_count,
            })
            setRegistration(rec)
            setRegistered(true)
            
            // Refresh provenance IMMEDIATELY
            const prov = await getProvenance(sessionId)
            setProvenance(prov)
            alert("✓ Registration Successful! Your provenance trial is live.")
        } catch (err: any) {
            // Don't alert here if signWithLace already did
        } finally {
            setRegistering(false)
            setSigningTx(false)
        }
    }

    const handleFingerprint = async () => {
        if (!walletConnected) {
            alert('Please connect your Lace wallet first to sign the transaction.')
            return
        }
        setFingerprintLoading(true)
        setSigningTx(true)
        try {
            await signWithLace(`Generate ZK Fingerprint with Privacy Level ${Math.round(privacyLevel * 100)}% for session: ${sessionId}`)
            setSigningTx(false)
            await generateFingerprint(sessionId, false, privacyLevel)
            const fp = await getMyFingerprints(sessionId)
            setFingerprints(fp.fingerprints)
        } catch (e: any) {
            if (!e.message?.includes('User rejected')) {
                alert(`Operation failed: ${e.message || 'Unknown backend error'}`);
            }
        } finally {
            setFingerprintLoading(false)
            setSigningTx(false)
        }
    }

    const handleLoadProvenance = async () => {
        try {
            const prov = await getProvenance(sessionId)
            setProvenance(prov)
        } catch { /* silent */ }
    }

    const handleLoadLedger = async () => {
        try {
            const data = await getPublicLedger(20)
            setLedger(data.blocks)
        } catch { /* silent */ }
    }

    const handleTabChange = (tab: typeof activeTab) => {
        setActiveTab(tab)
        if (tab === 'provenance') handleLoadProvenance()
        if (tab === 'ledger') handleLoadLedger()
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopiedHash(text)
        setTimeout(() => setCopiedHash(null), 1500)
    }

    const handleConnectWallet = async () => {
        setSigningTx(true) // Reuse signing state for loading
        try {
            const result = await connectToWallet(selectedWallet, 'preprod')
            
            setWalletAddress(result.address)
            setWalletConnected(true)
            localStorage.setItem('nexus_wallet_connected', 'true')
            localStorage.setItem('nexus_wallet_address', result.address)
            localStorage.setItem('nexus_selected_wallet', selectedWallet)
            window.dispatchEvent(new Event('walletUpdate'))
        } catch (e: any) {
            alert(e.message || `Failed to connect to ${selectedWallet}.`)
        } finally {
            setSigningTx(false)
        }
    }

    return (
        <div 
            className={`blockchain-panel anim-slide-up ${isResizing ? 'resizing' : ''}`}
            style={{ 
                width: `${panelWidth}px`, 
                left: '50%', 
                transform: 'translateX(-50%)',
                position: 'fixed',
                top: '10vh',
                maxHeight: '80vh',
                background: 'rgba(15, 23, 42, 0.8)', 
                backdropFilter: 'blur(24px)', 
                border: '1px solid rgba(168, 85, 247, 0.3)', 
                boxShadow: '0 0 50px -12px rgba(168,85,247,0.25)', 
                borderRadius: '1rem', 
                overflow: 'hidden', 
                display: 'flex', 
                flexDirection: 'column',
                zIndex: 1000
            }}
        >
            {/* Wallet Selection Modal */}
            {showWalletModal && (
                <div className="wallet-modal-overlay" onClick={() => setShowWalletModal(false)}>
                    <div className="wallet-modal-content anim-slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="wallet-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Wallet size={24} color="#a855f7" />
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Connect Midnight Wallet</h2>
                            </div>
                            <button className="btn--icon" onClick={() => setShowWalletModal(false)}>✕</button>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
                            Choose a Cardano-compatible wallet to interact with the Midnight network. 
                            <strong> Lace</strong> is recommended for full ZK functionality.
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
                                        // Auto-connect after selection if installed
                                        if (w.isInstalled || w.key === 'dev-wallet') {
                                            setSigningTx(true);
                                            try {
                                                const result = await connectToWallet(w.key, 'preprod');
                                                setWalletAddress(result.address);
                                                setWalletConnected(true);
                                                localStorage.setItem('nexus_wallet_connected', 'true');
                                                localStorage.setItem('nexus_wallet_address', result.address);
                                                localStorage.setItem('nexus_selected_wallet', w.key);
                                            } catch (e: any) {
                                                alert(e.message || `Failed to connect to ${w.name}`);
                                            } finally {
                                                setSigningTx(false);
                                            }
                                        }
                                    }}
                                >
                                    <div className="wallet-card__icon">
                                        {w.key === 'lace' ? <Shield size={24} /> : 
                                         w.key === 'dev-wallet' ? <Zap size={24} /> : <Wallet size={24} />}
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
                        
                        <div className="wallet-modal-footer">
                            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertCircle size={12} /> Can't see your wallet? Refresh the page.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Resize Handles */}
            <div 
                className="resize-handle left"
                onMouseDown={(e) => startResize(e, 'left')}
            />
            <div 
                className="resize-handle right"
                onMouseDown={(e) => startResize(e, 'right')}
            />
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
                        <Link size={22} color="#c084fc" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'white', letterSpacing: '-0.02em', marginBottom: '2px' }}>
                            Midnight Blockchain Ledger
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="chain-badge">⬡ Preprod</span> · Privacy-First Layer 1 · Verifiable
                        </div>
                    </div>
                </div>
                <button className="btn--icon" onClick={onClose} style={{ opacity: 0.7, hover: { opacity: 1 } } as any}>✕</button>
            </div>

            {/* Tabs */}
            <div className="blockchain-tabs">
                {(['identity', 'provenance', 'fingerprints', 'certificates', 'ledger'] as const).map(tab => (
                    <button
                        key={tab}
                        className={`blockchain-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => handleTabChange(tab)}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            <div className="blockchain-panel__body">
                {/* Identity Tab */}
                {activeTab === 'identity' && (
                    <div className="blockchain-section">
                        {identity ? (
                            <>
                                {/* ZK Identity Card */}
                                <div className="zk-identity-card" style={{ '--avatar-color': identity.avatar_color } as React.CSSProperties}>
                                    <div className="zk-identity-card__avatar" style={{ background: `radial-gradient(circle at 40% 40%, ${identity.avatar_color}, hsl(${identity.avatar_hue + 60}, 60%, 30%))` }}>
                                        <Lock size={28} color="white" />
                                    </div>
                                    <div className="zk-identity-card__info">
                                        <div className="zk-identity-card__alias">{identity.alias}</div>
                                        <div className="zk-identity-card__label">Anonymous ZK Identity</div>
                                        <div className="zk-identity-card__hash" title={identity.identity_commitment}>
                                            {identity.identity_commitment.slice(0, 24)}…
                                            <button className="copy-btn" onClick={() => copyToClipboard(identity.identity_commitment)}>
                                                {copiedHash === identity.identity_commitment ? <CheckCircle size={12} color="#34d399" /> : <Copy size={12} />}
                                            </button>
                                        </div>
                                        <div className="zk-identity-card__badge">
                                            <Shield size={12} />No login required · Cryptographic commitment
                                        </div>
                                    </div>
                                </div>

                                {/* Attributes */}
                                <div className="identity-attrs">
                                    {Object.entries(identity.attributes).map(([k, v]) => (
                                        <div key={k} className={`identity-attr ${v ? 'active' : ''}`}>
                                            {v ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                                            {k.replace(/_/g, ' ')}
                                        </div>
                                    ))}
                                </div>

                                {/* Wallet Selection & Link */}
                                <div className="register-section" style={{ marginTop: '1rem' }}>
                                    <div className="compare-selector" style={{ marginBottom: '1rem' }}>
                                        <div className="compare-selector__label">
                                            <Wallet size={13} color="#a855f7" /> Identity Provider
                                        </div>
                                        <div className="input-group">
                                            <label className="input-group__label">Select Midnight Wallet</label>
                                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                <select 
                                                    className="compare-select" 
                                                    style={{ flex: 1 }}
                                                    value={selectedWallet} 
                                                    onChange={(e) => setSelectedWallet(e.target.value)}
                                                >
                                                    {availableWallets.map(w => (
                                                        <option key={w.key} value={w.key}>
                                                            {w.name} {!w.isInstalled ? '(Not Found)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button 
                                                    className="btn btn--primary" 
                                                    onClick={() => setShowWalletModal(true)}
                                                    style={{ padding: '0.4rem 1rem' }}
                                                >
                                                    <LayoutGrid size={16} /> Choose
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div className="register-section__title">
                                                <Database size={16} color={walletConnected ? "#34d399" : "#a855f7"} />
                                                {selectedWallet.charAt(0).toUpperCase() + selectedWallet.slice(1)} Identity
                                            </div>
                                            <div className="register-section__meta">
                                                {walletConnected ? 'Connected for signing transactions' : 'Link identity to sign ZK proofs'}
                                            </div>
                                        </div>
                                        {walletConnected ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '4px' }}>
                                                <CheckCircle size={14} /> {walletAddress?.slice(0, 12)}...
                                            </div>
                                        ) : (
                                            <button className="btn btn--primary btn--blockchain" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={handleConnectWallet} disabled={signingTx}>
                                                {signingTx ? (
                                                    <><Loader2 size={14} className="spin" /> Connecting...</>
                                                ) : (
                                                    <><Link size={14} /> Connect</>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    {signingTx && !walletConnected && (
                                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(168,85,247,0.05)', borderRadius: '8px', border: '1px solid rgba(168,85,247,0.1)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Loader2 size={12} className="spin" color="#a855f7" />
                                            <span>Waiting for {selectedWallet} approval. Please check for a popup...</span>
                                        </div>
                                    )}
                                </div>

                                {/* Register Button */}
                                <div className="register-section">
                                    <div className="register-section__title">
                                        <Database size={16} color="#a855f7" />
                                        Register Dataset on Chain
                                    </div>
                                    <div className="register-section__meta">
                                        {session.filename} · {session.row_count.toLocaleString()} rows · {session.column_count} cols
                                    </div>

                                    {registration ? (
                                        <div className="chain-receipt">
                                            <div className="chain-receipt__verified">
                                                <CheckCircle size={16} color="#34d399" />
                                                Registered on Midnight Chain
                                            </div>
                                            <div className="chain-receipt__row">
                                                <span>Block</span>
                                                <span>#{registration.block_number}</span>
                                            </div>
                                            <div className="chain-receipt__row">
                                                <span>Hash</span>
                                                <span className="hash-val">
                                                    {registration.block_hash.slice(0, 20)}…
                                                    <button className="copy-btn" onClick={() => copyToClipboard(registration.block_hash)}>
                                                        <Copy size={10} />
                                                    </button>
                                                </span>
                                            </div>
                                            <div className="chain-receipt__row">
                                                <span>Time</span>
                                                <span>{new Date(registration.timestamp).toLocaleString()}</span>
                                            </div>
                                            {(registration as any).is_real ? (
                                                <div style={{ marginTop: '0.8rem', padding: '0.5rem', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '6px', border: '1px solid rgba(52, 211, 153, 0.3)', fontSize: '0.7rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <CheckCircle size={12} /> Real Transaction On Midnight Preprod
                                                </div>
                                            ) : (
                                                <div style={{ marginTop: '0.8rem', padding: '0.5rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <AlertCircle size={12} /> Simulation Mode (MeshSDK providers offline)
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <button className="btn btn--primary btn--blockchain" onClick={handleRegister} disabled={registering}>
                                            {registering ? (
                                                <><Loader2 size={14} className="spin" /> {signingTx ? 'Signing in wallet...' : 'Registering...'}</>
                                            ) : (
                                                <><Link size={14} /> Register on Midnight</>
                                            )}
                                        </button>
                                    )}
                                </div>

                                {/* Fingerprint */}
                                <div className="fingerprint-section">
                                    <div className="register-section__title">
                                        <Zap size={16} color="#a855f7" />
                                        Generate ZK Fingerprint
                                    </div>
                                    <div className="register-section__meta">
                                        Extracts statistical summary only — zero raw data stored
                                    </div>

                                    {/* Selective Disclosure Section */}
                                    <div style={{ margin: '1.25rem 0', padding: '1.25rem', background: 'rgba(168, 85, 247, 0.05)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.2)', boxShadow: '0 4px 15px -3px rgba(168, 85, 247, 0.1)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                                            <ShieldCheck size={16} color="#a855f7" />
                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>Zero-Knowledge Selective Disclosure</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                                            Midnight's ZK cryptography allows you to selectively disclose public ledger assertions while mathematically guaranteeing the underlying raw dataset remains entirely hidden on your device.
                                        </div>
                                        
                                        {/* Toggle Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                            {[
                                                { label: 'Data Fingerprint (Commitment)', val: true, req: true, icon: Lock },
                                                { label: 'Column Hashing (Schema)', val: privacyLevel < 0.6, req: false, icon: Database },
                                                { label: 'Owner ZK Identity', val: privacyLevel < 0.8, req: false, icon: Shield },
                                                { label: 'Row Count Bucket', val: privacyLevel < 0.9, req: false, icon: BarChart2 }
                                            ].map((t, i) => (
                                                <div key={i} style={{ 
                                                    padding: '0.75rem', 
                                                    borderRadius: '8px', 
                                                    background: t.val ? 'rgba(52, 211, 153, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                                                    border: `1px solid ${t.val ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255,255,255,0.05)'}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <t.icon size={13} color={t.val ? "#34d399" : "#64748b"} />
                                                        <span style={{ fontSize: '0.75rem', color: t.val ? '#fff' : '#64748b', fontWeight: t.val ? 500 : 400 }}>{t.label}</span>
                                                    </div>
                                                    <div>
                                                        {t.val ? <CheckCircle size={14} color="#34d399" /> : <EyeOff size={14} color="#64748b" />}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Adjust Disclosure Level:</span>
                                            <span style={{ fontSize: '0.85rem', color: '#a855f7', fontWeight: 700 }}>{Math.round(privacyLevel * 100)}% Private</span>
                                        </div>
                                        
                                        <div style={{ position: 'relative', height: '40px', display: 'flex', alignItems: 'center' }}>
                                            <div style={{ 
                                                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                                                height: '6px', 
                                                width: `${20 + privacyLevel * 80}%`, 
                                                background: 'linear-gradient(to right, transparent, #a855f7, transparent)',
                                                borderRadius: '3px',
                                                transition: 'width 0.3s ease-out',
                                                opacity: 0.3 + privacyLevel * 0.7,
                                                boxShadow: `0 0 ${10 + privacyLevel * 20}px ${privacyLevel * 5}px rgba(168, 85, 247, 0.4)`
                                            }} />
                                            
                                            <input 
                                                type="range" 
                                                min="0" 
                                                max="1" 
                                                step="0.01" 
                                                value={privacyLevel}
                                                onChange={(e) => setPrivacyLevel(parseFloat(e.target.value))}
                                                style={{
                                                    width: '100%', cursor: 'pointer', zIndex: 2,
                                                    WebkitAppearance: 'none', background: 'transparent'
                                                }}
                                                className="privacy-slider"
                                            />
                                        </div>
                                        
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                            <span>Accuracy (Scratch)</span>
                                            <span>Maximum Privacy</span>
                                        </div>
                                    </div>

                                    <button
                                        className="btn btn--secondary btn--blockchain"
                                        onClick={handleFingerprint}
                                        disabled={fingerprintLoading}
                                    >
                                        {fingerprintLoading ? <><Loader2 size={14} className="spin" /> Generating…</> : <><Shield size={14} /> Generate Privacy-Protected FP</>}
                                    </button>
                                    {fingerprints.length > 0 && (
                                        <div className="fp-list">
                                            {fingerprints.slice(0, 3).map(fp => (
                                                <div key={fp.fingerprint_id} className="fp-chip">
                                                    <Shield size={11} />
                                                    {fp.fingerprint_id} · {fp.data_category_hint} · {fp.column_count} cols
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="blockchain-loading"><Loader2 size={24} className="spin" />Loading ZK Identity…</div>
                        )}
                    </div>
                )}

                {/* Provenance Tab */}
                {activeTab === 'provenance' && (
                    <div className="blockchain-section">
                        {provenance ? (
                            <>
                                <div className="provenance-header">
                                    <div>
                                        <div className="provenance-count">{provenance.record_count} Events</div>
                                        <div className="provenance-hash">Session hash: {provenance.session_hash}</div>
                                    </div>
                                    <div className={`chain-valid-badge ${provenance.chain_valid ? 'valid' : 'invalid'}`}>
                                        {provenance.chain_valid ? <><CheckCircle size={12} />Chain Valid</> : <><AlertCircle size={12} />Chain Error</>}
                                    </div>
                                </div>
                                {provenance.record_count === 0 ? (
                                    <div className="fp-empty" style={{ margin: '1.5rem 0', textAlign: 'center' }}>
                                        No blockchain events yet.<br/>
                                        <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Click "Register on Midnight" to append provenance.</span>
                                    </div>
                                ) : (
                                    <div className="provenance-timeline">
                                        {provenance.provenance.map((rec, i) => (
                                            <div key={i} className="provenance-event">
                                                <div
                                                    className="provenance-event__dot"
                                                    style={{ background: EVENT_COLORS[rec.event_type] || '#64748b' }}
                                                />
                                                <div className="provenance-event__body">
                                                    <div className="provenance-event__type">
                                                        <span style={{ color: EVENT_COLORS[rec.event_type] || '#94a3b8' }}>{rec.event_type}</span>
                                                        <span className="provenance-event__block">Block #{rec.block_number}</span>
                                                    </div>
                                                    <div className="provenance-event__time">{new Date(rec.timestamp).toLocaleString()}</div>
                                                    <div className="provenance-event__proof">
                                                        Proof: {rec.proof_id ? rec.proof_id.slice(0, 12) : 'local-sim'}… {rec.proof_verified ? '✅' : '⚠️'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="provenance-note">
                                    <Lock size={12} />{provenance.privacy_note}
                                </div>
                            </>
                        ) : (
                            <div className="blockchain-loading"><Loader2 size={24} className="spin" />Loading provenance…</div>
                        )}
                    </div>
                )}

                {/* Fingerprints Tab */}
                {activeTab === 'fingerprints' && (
                    <div className="blockchain-section">
                        <div className="fp-tab-header">
                            <Shield size={16} color="#a855f7" />
                            <span>Your ZK Fingerprints</span>
                            <span className="fp-count">{fingerprints.length}</span>
                        </div>
                        <div className="fp-privacy-note">
                            Column names are hashed · No raw data stored · Owner identity hidden
                        </div>
                        {fingerprints.length === 0 ? (
                            <div className="fp-empty">
                                No fingerprints yet. Generate one from the Identity tab.
                            </div>
                        ) : (
                            fingerprints.map((fp) => (
                                <div key={fp.fingerprint_id} className="fp-card">
                                    <div className="fp-card__head">
                                        <Shield size={14} color="#a855f7" />
                                        <span className="fp-card__id">{fp.fingerprint_id}</span>
                                        {fp.is_public && <span className="fp-public-badge">Public</span>}
                                        <button onClick={() => handleVerifyOwnership(fp.fingerprint_id)}
                                            style={{ marginLeft: 'auto', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', borderRadius: 4, padding: '2px 8px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                            disabled={verifyLoading === fp.fingerprint_id}
                                        >
                                            {verifyLoading === fp.fingerprint_id ? <Loader2 size={10} className="spin" /> : <ShieldCheck size={10} />}
                                            Verify
                                        </button>
                                    </div>
                                    {verifyResult[fp.fingerprint_id] && (
                                        <div style={{ padding: '4px 8px', fontSize: '10px', background: verifyResult[fp.fingerprint_id].success ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)', color: verifyResult[fp.fingerprint_id].success ? '#34d399' : '#ef4444', borderRadius: 4, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {verifyResult[fp.fingerprint_id].success ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                                            {verifyResult[fp.fingerprint_id].msg}
                                        </div>
                                    )}
                                    <div className="fp-card__meta">
                                        <span>📂 {fp.data_category_hint}</span>
                                        <span>· {fp.column_count} cols</span>
                                        <span>· {fp.row_count_range} rows</span>
                                    </div>
                                    <div className="fp-card__hashes">
                                        {(fp.column_hashes || []).slice(0, 6).map((h, i) => (
                                            <span key={i} className="col-hash-chip">{h}</span>
                                        ))}
                                        {(fp.column_hashes || []).length > 6 && (
                                            <span className="col-hash-chip col-hash-chip--more">
                                                +{(fp.column_hashes || []).length - 6} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Certificates Tab */}
                {activeTab === 'certificates' && (
                    <div className="blockchain-section">
                        <div className="fp-tab-header">
                            <ShieldCheck size={16} color="#facc15" />
                            <span>Verifiable ZK Certificates</span>
                        </div>
                        <div className="fp-privacy-note">
                            Cryptographically bound to your identity · Publicly verifiable · Non-transferable
                        </div>
                        
                        {!provenance || provenance.provenance.filter(r => r.event_type === 'ZK_AUDIT' || r.event_type === 'CREDENTIAL_ISSUED').length === 0 ? (
                            <div className="fp-empty">
                                No certificates yet. Generate an audit proof from the Identity tab.
                            </div>
                        ) : (
                            <div className="certificates-grid">
                                {provenance.provenance.filter(r => r.event_type === 'ZK_AUDIT' || r.event_type === 'CREDENTIAL_ISSUED').map((cert, i) => (
                                    <div key={i} className="cert-card">
                                        <div className="cert-card__ribbon" style={{ background: EVENT_COLORS[cert.event_type] }} />
                                        <div className="cert-card__icon" style={{ color: EVENT_COLORS[cert.event_type] }}>
                                            {cert.event_type === 'ZK_AUDIT' ? <Lock size={20} /> : <ShieldCheck size={20} />}
                                        </div>
                                        <div className="cert-card__body">
                                            <div className="cert-card__title">
                                                {cert.event_type === 'ZK_AUDIT' ? 'Analysis Integrity Certificate' : 'Data Compliance VC'}
                                            </div>
                                            <div className="cert-card__meta">
                                                <span>Issued: {new Date(cert.timestamp).toLocaleDateString()}</span>
                                                <span>· Block #{cert.block_number}</span>
                                            </div>
                                            <div className="cert-card__proof">
                                                <div className="cert-card__proof-id">Proof ID: {cert.proof_id.slice(0, 16)}…</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div className="cert-card__badge">
                                                        <CheckCircle size={10} /> {cert.proof_verified ? 'VERIFIED' : 'PENDING'}
                                                    </div>
                                                    {cert.event_type === 'ZK_AUDIT' && (
                                                        <button onClick={() => handleVerifyAudit(cert.proof_id)}
                                                            style={{ background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.3)', color: '#facc15', borderRadius: 4, padding: '2px 8px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                                            disabled={verifyLoading === cert.proof_id}
                                                        >
                                                            {verifyLoading === cert.proof_id ? <Loader2 size={10} className="spin" /> : <ShieldCheck size={10} />}
                                                            Verify On-Chain
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {verifyResult[cert.proof_id] && (
                                                <div style={{ padding: '6px 8px', fontSize: '10px', background: verifyResult[cert.proof_id].success ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)', color: verifyResult[cert.proof_id].success ? '#34d399' : '#ef4444', borderRadius: 4, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {verifyResult[cert.proof_id].success ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                                                    {verifyResult[cert.proof_id].msg}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Ledger Tab */}
                {activeTab === 'ledger' && (
                    <div className="blockchain-section">
                        <div className="ledger-header">
                            <Link size={16} color="#a855f7" />
                            Public Chain Ledger
                            <span className="ledger-count">{ledger.length} blocks</span>
                        </div>
                        {ledger.length === 0 ? (
                            <div className="fp-empty" style={{ margin: '2rem 0', textAlign: 'center' }}>
                                The Midnight Ledger is currently empty.<br/>
                                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Submit a transaction to see it appear on-chain.</span>
                            </div>
                        ) : (
                            ledger.map((block, i) => (
                                <div key={i} className="ledger-block" onClick={() => setExpandedBlock(expandedBlock === i ? null : i)}>
                                    <div className="ledger-block__head">
                                        <span
                                            className="ledger-block__event"
                                            style={{ color: EVENT_COLORS[block.event_type] || '#94a3b8' }}
                                        >
                                            ⬡ {block.event_type}
                                        </span>
                                        <span className="ledger-block__num">#{block.block_number}</span>
                                        <span className="ledger-block__time">{new Date(block.timestamp).toLocaleString()}</span>
                                        {expandedBlock === i ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </div>
                                    {expandedBlock === i && (
                                        <div className="ledger-block__detail">
                                            <div>Hash: <span className="hash-val">{block.block_hash.slice(0, 24)}…</span></div>
                                            <div>Prev: <span className="hash-val">{block.prev_hash.slice(0, 16)}…</span></div>
                                            <div>Proof: <span className="hash-val">{block.proof_id}</span> {block.proof_verified ? '✅' : '⚠️'}</div>
                                            <div>Network: {block.network}</div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Certificates Tab */}
                {activeTab === 'certificates' && (
                    <div className="blockchain-section">
                        <div className="ledger-header" style={{ marginBottom: '1.5rem' }}>
                            <CheckCircle size={16} color="#34d399" />
                            ZK Audit Certificates
                        </div>
                        
                        {!auditProof ? (
                            <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border)', textAlign: 'center' }}>
                                <Shield size={48} color="#a855f7" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Generate ZK-Audit Proof</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
                                    Create a cryptographically verifiable proof that your analysis was performed correctly on the original data fingerprint, without revealing the data itself.
                                </p>
                                <button 
                                    className="btn btn--blockchain" 
                                    style={{ padding: '0.75rem 2rem' }}
                                    onClick={async () => {
                                        setAuditLoading(true);
                                        try {
                                            const proof = await generateAuditProof(sessionId);
                                            setAuditProof(proof);
                                            localStorage.setItem(`nexus_audit_${sessionId}`, JSON.stringify(proof));
                                            load(); // Refresh provenance
                                        } catch (e) {
                                            alert("Failed to generate audit proof: " + e);
                                        } finally {
                                            setAuditLoading(false);
                                        }
                                    }}
                                    disabled={auditLoading}
                                >
                                    {auditLoading ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
                                    {auditLoading ? 'Computing ZK Proof...' : 'Generate New Certificate'}
                                </button>
                            </div>
                        ) : (
                            <div className="audit-result active animate-in fade-in" style={{ padding: '1.5rem', background: 'rgba(34, 197, 94, 0.05)', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#22c55e', fontWeight: 700, marginBottom: '1rem' }}>
                                    <CheckCircle size={18} /> ZK-Audit Proof Verified
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <div style={{ color: '#94a3b8', marginBottom: '0.3rem' }}>Audit Reference ID</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{auditProof.audit_id}</div>
                                    </div>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <div style={{ color: '#94a3b8', marginBottom: '0.3rem' }}>Blockchain Status</div>
                                        <div style={{ color: '#22c55e', fontWeight: 700 }}>{auditProof.status} (IMMUTABLE)</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.8rem', marginBottom: '1.5rem' }}>
                                    <div style={{ color: '#94a3b8', marginBottom: '0.3rem' }}>Integrity Proof (SHA-256 bound ZKP)</div>
                                    <div style={{ 
                                        padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', 
                                        fontFamily: 'var(--font-mono)', fontSize: '0.7rem', wordBreak: 'break-all', maxHeight: '100px', overflowY: 'auto' 
                                    }}>
                                        {auditProof.zk_proof}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button className="btn btn--secondary btn--sm" style={{ flex: 1 }} onClick={() => setAuditProof(null)}>
                                        Generate New
                                    </button>
                                    <button className="btn btn--primary btn--sm" style={{ flex: 1 }} onClick={() => copyToClipboard(auditProof.zk_proof)}>
                                        <Copy size={12} /> Copy Proof
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <style>{`
                .privacy-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: white;
                    border: 3px solid #a855f7;
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
                    transition: transform 0.1s;
                }
                .privacy-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.2);
                }
                .privacy-slider::-moz-range-thumb {
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: white;
                    border: 3px solid #a855f7;
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
                }
                .resize-handle {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 12px;
                    cursor: ew-resize;
                    z-index: 1000;
                    transition: background 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .resize-handle:hover, .resizing .resize-handle {
                    background: rgba(168, 85, 247, 0.1);
                }
                .resize-handle.left { left: 0; border-left: 2px solid rgba(168, 85, 247, 0.2); }
                .resize-handle.right { right: 0; border-right: 2px solid rgba(168, 85, 247, 0.2); }
                
                .resize-handle::after {
                    content: '||';
                    color: rgba(168, 85, 247, 0.4);
                    font-size: 10px;
                    font-weight: bold;
                    letter-spacing: -1px;
                }
                .certificates-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1rem;
                    margin-top: 1rem;
                }
                .cert-card {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 1rem;
                    display: flex;
                    position: relative;
                    overflow: hidden;
                    transition: transform 0.2s;
                }
                .cert-card:hover {
                    transform: translateX(4px);
                    background: rgba(255, 255, 255, 0.05);
                }
                .cert-card__ribbon {
                    width: 4px;
                    height: 100%;
                }
                .cert-card__icon {
                    padding: 1.25rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.2);
                }
                .cert-card__body {
                    padding: 1rem 1.25rem;
                    flex: 1;
                }
                .cert-card__title {
                    font-weight: 800;
                    font-size: 0.95rem;
                    color: white;
                    letter-spacing: 0.01em;
                }
                .cert-card__meta {
                    font-size: 0.7rem;
                    color: #94a3b8;
                    margin-top: 4px;
                    display: flex;
                    gap: 8px;
                }
                .cert-card__proof {
                    margin-top: 0.75rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .cert-card__proof-id {
                    font-family: var(--font-mono);
                    font-size: 0.65rem;
                    color: #64748b;
                }
                .cert-card__badge {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    padding: 2px 8px;
                    border-radius: 100px;
                    font-size: 0.65rem;
                    font-weight: 800;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
            `}</style>
        </div>
    )
}
