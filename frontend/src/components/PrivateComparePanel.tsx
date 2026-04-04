import { useState, useEffect, useCallback } from 'react'
import {
    Shield, Link, Lock, CheckCircle, AlertCircle, Loader2, Zap, Database,
    GitCompare, ShieldCheck, ClipboardCheck, LayoutGrid, BarChart2, MessageSquare,
    ExternalLink, ChevronRight, Copy, Eye, EyeOff, BarChart3, Wallet
} from 'lucide-react'
import type { DatasetFingerprint, PrivateCompareResult, MarketplaceListing, DataBounty, VerifiableCredential, AuditProof } from '../api'
import {
    getMyFingerprints, privateCompare, getMarketplace,
    listInMarketplace, runAnonymousBenchmark, getBounties, claimBounty, createBounty, getAttestations, requestAttestation,
    generateAuditProof, getBountyClaimedData, API_BASE
} from '../api'
import { 
    connectToWallet, getWalletAddress, getAvailableWallets, 
    signTransaction, checkAndVerifyBalance, executeTokenTransfer,
    type WalletMetadata, SUPPORTED_WALLETS 
} from '../utils/midnight'

interface Props {
    sessionId: string
    sessionIds: string[]
    onClose: () => void
}

export default function PrivateComparePanel({ sessionId, sessionIds, onClose }: Props) {
    const [myFingerprints, setMyFingerprints] = useState<DatasetFingerprint[]>([])
    const [marketplace, setMarketplace] = useState<MarketplaceListing[]>([])
    const [selectedFpA, setSelectedFpA] = useState<string>('')
    const [selectedFpB, setSelectedFpB] = useState<string>('')
    const [result, setResult] = useState<PrivateCompareResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [listingLoading, setListingLoading] = useState<string | null>(null)
    const [benchmarkResult, setBenchmarkResult] = useState<any[] | null>(null)
    const [benchmarkLoading, setBenchmarkLoading] = useState(false)
    const [showProofDetails, setShowProofDetails] = useState(false)
    const [activeMode, setActiveMode] = useState<'compare' | 'marketplace' | 'benchmark' | 'bounties' | 'attestations'>('compare')
    
    // Panel Resizing State
    const [panelWidth, setPanelWidth] = useState(950)
    const [panelHeight, setPanelHeight] = useState(700)
    const [isResizingPanel, setIsResizingPanel] = useState<'left' | 'right' | 'top' | 'bottom' | null>(null)
    const [panelStartX, setPanelStartX] = useState(0)
    const [panelStartY, setPanelStartY] = useState(0)
    const [panelStartWidth, setPanelStartWidth] = useState(950)
    const [panelStartHeight, setPanelStartHeight] = useState(700)

    // Sidebar Resizer State
    const [sidebarWidth, setSidebarWidth] = useState(240)
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sidebarWidth;
        
        const doDrag = (dragEvent: MouseEvent) => {
            requestAnimationFrame(() => {
                const newWidth = Math.max(160, Math.min(500, startWidth + dragEvent.clientX - startX));
                setSidebarWidth(newWidth);
            });
        };
        
        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
        };
        
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    }, [sidebarWidth]);

    // Panel Resize Effect
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingPanel) return
            
            if (isResizingPanel === 'left' || isResizingPanel === 'right') {
                // Symmetric horizontal expansion
                const dx = e.clientX - panelStartX
                const newWidth = isResizingPanel === 'right' 
                    ? panelStartWidth + dx * 2
                    : panelStartWidth - dx * 2
                setPanelWidth(Math.max(700, Math.min(window.innerWidth - 40, newWidth)))
            } else if (isResizingPanel === 'top' || isResizingPanel === 'bottom') {
                // Symmetric vertical expansion
                const dy = e.clientY - panelStartY
                const newHeight = isResizingPanel === 'bottom'
                    ? panelStartHeight + dy * 2
                    : panelStartHeight - dy * 2
                setPanelHeight(Math.max(400, Math.min(window.innerHeight - 40, newHeight)))
            }
        }
        
        const handleMouseUp = () => setIsResizingPanel(null)
        
        if (isResizingPanel) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isResizingPanel, panelStartX, panelStartY, panelStartWidth, panelStartHeight])

    const startPanelResize = (e: React.MouseEvent, direction: 'left' | 'right' | 'top' | 'bottom') => {
        e.preventDefault()
        setIsResizingPanel(direction)
        setPanelStartX(e.clientX)
        setPanelStartY(e.clientY)
        setPanelStartWidth(panelWidth)
        setPanelStartHeight(panelHeight)
    }
    
    // Bounties State
    const [bounties, setBounties] = useState<DataBounty[]>([])
    const [claimingBountyId, setClaimingBountyId] = useState<string | null>(null)
    const [bountyResult, setBountyResult] = useState<any>(null)
    const [bountyFormOpen, setBountyFormOpen] = useState(false)
    const [bountyDesc, setBountyDesc] = useState('')
    const [bountySimReq, setBountySimReq] = useState(0.8)
    const [bountyReward, setBountyReward] = useState(100)
    const [escrowAddress, setEscrowAddress] = useState<string | null>(null)

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const bridgeUrl = (import.meta as any).env?.VITE_MIDNIGHT_BRIDGE_URL || 'http://localhost:3001';
                const resp = await fetch(`${bridgeUrl}/config`);
                if (resp.ok) {
                    const data = await resp.json();
                    setEscrowAddress(data.platformEscrowAddress);
                }
            } catch (e) {
            }
        };
        fetchConfig();
    }, []);

    const [creatingBounty, setCreatingBounty] = useState(false)
    const [claimedTokens, setClaimedTokens] = useState<Record<string, string>>({}) // bountyId -> accessToken

    // Attestations State
    const [attestationsMap, setAttestationsMap] = useState<Record<string, VerifiableCredential[]>>({})
    const [auditLoadingFp, setAuditLoadingFp] = useState<string | null>(null)

    // Wallet State
    const [walletConnected, setWalletConnected] = useState(() => localStorage.getItem('nexus_wallet_connected') === 'true')
    const [walletAddress, setWalletAddress] = useState<string | null>(() => localStorage.getItem('nexus_wallet_address'))
    const [signingTx, setSigningTx] = useState(false)
    const [availableWallets, setAvailableWallets] = useState<WalletMetadata[]>([])
    const [selectedWallet, setSelectedWallet] = useState<string>(() => localStorage.getItem('nexus_selected_wallet') || 'lace')

    useEffect(() => {
        getAvailableWallets().then(setAvailableWallets);
    }, []);

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

    const signWithLace = async (actionMsg: string) => {
        try {
            await signTransaction(selectedWallet, 'preprod', walletAddress || undefined, actionMsg);
        } catch (e: any) {
            alert(`Signing Failed: ${e.message || 'User rejected or timeout'}`);
            throw e;
        }
    }

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
            alert(e.message || `Failed to connect to ${selectedWallet}.`)
        } finally {
            setLoading(false)
        }
    }

    const enforceWallet = (): boolean => {
        if (!walletConnected) {
            alert(`Please connect your ${selectedWallet} wallet to sign this transaction.`)
            return false
        }
        return true
    }

    const loadData = useCallback(async () => {
        try {
            const [fp, mkt, bnt] = await Promise.all([
                getMyFingerprints(sessionId),
                getMarketplace(),
                getBounties()
            ])
            setMyFingerprints(fp.fingerprints)
            setMarketplace(mkt.listings)
            setBounties(bnt.bounties)
            if (fp.fingerprints.length > 0) {
                // Initialize selected components
                setSelectedFpA(fp.fingerprints[0].fingerprint_id)
            }

            // Load attestations for the user's fingerprints and marketplace listings
            const attests: Record<string, VerifiableCredential[]> = {}
            const allFpsToFetch = new Set([
                ...fp.fingerprints.map(f => f.fingerprint_id),
                ...mkt.listings.map(l => l.fingerprint_id)
            ])
            
            await Promise.all(
                Array.from(allFpsToFetch).map(async (fId) => {
                    try {
                        const res = await getAttestations(fId)
                        attests[fId] = res.credentials
                    } catch { /* ignore */ }
                })
            )
            setAttestationsMap(attests)

        } catch { /* silent */ }
    }, [sessionId])

    useEffect(() => { loadData() }, [loadData])

    const handleCompare = async () => {
        if (!selectedFpA || !selectedFpB) return
        if (!enforceWallet()) return
        
        setLoading(true)
        setResult(null)
        setSigningTx(true)
        try {
            await signWithLace(`Compute ZK Private Intersection between ${selectedFpA} and ${selectedFpB}`)
            setSigningTx(false)
            
            const res = await privateCompare(selectedFpA, selectedFpB)
            setResult(res)
        } catch { /* silent */ } finally {
            setLoading(false)
        }
    }

    const handleListInMarketplace = async (fpId: string) => {
        if (!enforceWallet()) return
        
        setListingLoading(fpId)
        setSigningTx(true)
        try {
            await signWithLace(`List FP on Midnight Marketplace: ${fpId}`)
            setSigningTx(false)
            await listInMarketplace(sessionId, fpId)
            await loadData()
        } catch { /* silent */ } finally {
            setListingLoading(null)
            setSigningTx(false)
        }
    }

    const handleBenchmark = async () => {
        if (!selectedFpA) return
        if (!enforceWallet()) return
        
        setBenchmarkLoading(true)
        setBenchmarkResult(null)
        setSigningTx(true)
        try {
            await signWithLace(`Execute Anonymous Market Benchmark for Fingerprint ${selectedFpA}`)
            setSigningTx(false)
            
            const res = await runAnonymousBenchmark(sessionId, selectedFpA)
            setBenchmarkResult(res.benchmarks)
        } catch { /* silent */ } finally {
            setBenchmarkLoading(false)
        }
    }

    const simScore = (score: number) => {
        if (score > 0.8) return { label: 'Very Similar', color: '#34d399' }
        if (score > 0.5) return { label: 'Moderate', color: '#f59e0b' }
        return { label: 'Distinct', color: '#f87171' }
    }

    const handleClaimBounty = async (bountyId: string) => {
        if (!selectedFpA) return
        if (!enforceWallet()) return
        
        setClaimingBountyId(bountyId)
        setBountyResult(null)
        setSigningTx(true)
        
        try {
            await signWithLace(`Claim Bounty: ${bountyId} with Fingerprint ${selectedFpA}`)
            setSigningTx(false)
            
            const res = await claimBounty(sessionId, bountyId, selectedFpA)
            setBountyResult(res)
            if (res.success && res.access_token) {
                // Store the access token so bounty creator can view data
                setClaimedTokens(prev => ({ ...prev, [bountyId]: res.access_token! }))
                await loadData() // Refresh bounties list
            }
        } catch (err: any) {
            setBountyResult({ success: false, message: err.message || 'Verification failed.' })
        } finally {
            setClaimingBountyId(null)
            setSigningTx(false)
        }
    }

    const handleCreateBounty = async () => {
        if (!selectedFpA || !bountyDesc) return
        if (!enforceWallet()) return
        
        setCreatingBounty(true)
        setSigningTx(true)
        
        try {
            await checkAndVerifyBalance(selectedWallet, 'preprod', bountyReward);
            await signWithLace(`Create Data Bounty for ${bountyReward} DUST. Target: ${selectedFpA}`)
            
            // Physical token transfer to Platform Escrow
            const targetEscrow = escrowAddress || 'addr_preprod_1qrxu4v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v';
            const transferResult = await executeTokenTransfer(selectedWallet, 'preprod', bountyReward, targetEscrow);
            
            setSigningTx(false)
            
            await createBounty(sessionId, {
                fingerprint_id: selectedFpA,
                required_similarity_score: bountySimReq,
                reward_dust: bountyReward,
                description: bountyDesc,
                escrow_tx_id: transferResult.transactionId
            })
            setBountyFormOpen(false)
            setBountyDesc('')
            await loadData()
        } catch (err: any) {
            setBountyResult({ success: false, message: err.message || 'Failed to create bounty.' })
        } finally {
            setCreatingBounty(false)
            setSigningTx(false)
        }
    }

    const handleRequestAudit = async (fingerprintId: string) => {
        if (!enforceWallet()) return
        
        setAuditLoadingFp(fingerprintId)
        setSigningTx(true)
        
        try {
            await signWithLace(`Request ZK-Attestation for Fingerprint: ${fingerprintId}`)
            setSigningTx(false)
            
            await requestAttestation(sessionId, fingerprintId, "NO_PII")
            await loadData() // Refresh credentials
        } catch (err: any) {
        } finally {
            setAuditLoadingFp(null)
            setSigningTx(false)
        }
    }

    return (
        <div className="private-compare-panel" style={{ 
            position: 'fixed', 
            left: '50%', 
            top: '50%', 
            transform: 'translate(-50%, -50%)', 
            width: `${panelWidth}px`,
            height: `${panelHeight}px`,
            background: 'rgba(15, 23, 42, 0.8)', 
            backdropFilter: 'blur(24px)', 
            border: '1px solid rgba(168, 85, 247, 0.3)', 
            boxShadow: '0 0 60px -12px rgba(168,85,247,0.3)', 
            borderRadius: '1rem', 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column', 
            padding: 0, 
            zIndex: 1000,
            transition: isResizingPanel ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
            {/* Symmetric Resize Handles */}
            <div 
                onMouseDown={(e) => startPanelResize(e, 'left')}
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize', zIndex: 100, background: isResizingPanel === 'left' ? 'rgba(168, 85, 247, 0.1)' : 'transparent' }}
            />
            <div 
                onMouseDown={(e) => startPanelResize(e, 'right')}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize', zIndex: 100, background: isResizingPanel === 'right' ? 'rgba(168, 85, 247, 0.1)' : 'transparent' }}
            />
            <div 
                onMouseDown={(e) => startPanelResize(e, 'top')}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '8px', cursor: 'ns-resize', zIndex: 100, background: isResizingPanel === 'top' ? 'rgba(168, 85, 247, 0.1)' : 'transparent' }}
            />
            <div 
                onMouseDown={(e) => startPanelResize(e, 'bottom')}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '8px', cursor: 'ns-resize', zIndex: 100, background: isResizingPanel === 'bottom' ? 'rgba(168, 85, 247, 0.1)' : 'transparent' }}
            />

            <div className="private-compare-panel__header" style={{ 
                padding: '1.25rem 1.5rem',
                paddingBottom: '1rem', 
                borderBottom: '1px solid rgba(168, 85, 247, 0.2)', 
                margin: 0,
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center' 
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
                        <Lock size={22} color="#c084fc" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'white', letterSpacing: '-0.02em', marginBottom: '2px' }}>
                            Privacy-Preserving Compare
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={12} /> ZK-Proven · No raw data leaked · Source anonymous
                            </div>
                            <div className="status-dot status-dot--active pulse" style={{ width: '6px', height: '6px' }} />
                        </div>
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', marginRight: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {walletConnected ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '4px' }}>
                            <CheckCircle size={14} /> {walletAddress?.slice(0, 12)}...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <select 
                                className="compare-select" 
                                style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                                value={selectedWallet}
                                onChange={(e) => {
                                    setSelectedWallet(e.target.value);
                                    setWalletConnected(false);
                                }}
                                disabled={loading}
                            >
                                {availableWallets.map(w => (
                                    <option key={w.key} value={w.key}>
                                        {w.name}
                                    </option>
                                ))}
                            </select>
                            <button className="btn btn--primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={handleConnectWallet} disabled={loading}>
                                {loading ? <><Loader2 size={14} className="spin" /> Connecting...</> : <><Link size={14} /> Connect</>}
                            </button>
                        </div>
                    )}
                    <div style={{ 
                        background: 'rgba(168, 85, 247, 0.1)', 
                        padding: '4px 10px', 
                        borderRadius: '12px', 
                        fontSize: '0.7rem', 
                        color: '#a855f7',
                        border: '1px solid rgba(168, 85, 247, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <ShieldCheck size={12} /> Midnight {walletConnected ? 'Preprod' : 'Simulation'}
                    </div>
                </div>
                <button className="btn--icon" onClick={onClose}>✕</button>
            </div>
            
            {signingTx && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', zIndex: 999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', backdropFilter: 'blur(4px)' }}>
                    <Loader2 size={48} color="#a855f7" className="spin" style={{ marginBottom: '1rem' }} />
                    <div style={{ color: 'white', fontSize: '1.2rem', fontWeight: 600 }}>Please Sign Transaction</div>
                    <div style={{ color: '#a855f7', fontSize: '0.9rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Wallet size={16} /> Lace Wallet Approval Required
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, marginTop: '1rem' }}>
                {/* Mode tabs Sidebar */}
                <div style={{ width: sidebarWidth, flexShrink: 0, background: 'rgba(15, 23, 42, 0.4)', padding: '1rem', borderRight: '1px solid rgba(168, 85, 247, 0.1)', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(['compare', 'marketplace', 'benchmark', 'bounties', 'attestations'] as const).map(m => (
                            <button
                                key={m}
                                style={{
                                    width: '100%', textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '0.75rem', transition: 'all 200ms', fontWeight: 600, fontSize: '0.875rem', border: activeMode === m ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', letterSpacing: '0.025em',
                                    background: activeMode === m ? 'rgba(147, 51, 234, 0.2)' : 'transparent',
                                    color: activeMode === m ? '#c084fc' : 'var(--text-muted)',
                                    boxShadow: activeMode === m ? '0 0 15px -3px rgba(168,85,247,0.3)' : 'none'
                                }}
                                onClick={() => setActiveMode(m)}
                            >
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Resizer */}
                <div 
                    onMouseDown={startResizing}
                    style={{ width: '6px', cursor: 'col-resize', background: 'transparent', zIndex: 20, flexShrink: 0 }}
                />

                {/* Main Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', paddingTop: 0 }}>
                {/* Compare Mode */}
                {activeMode === 'compare' && (
                    <div className="blockchain-section">
                        <div className="privacy-guarantee-banner">
                            <Shield size={14} color="#a855f7" />
                            Neither raw data, owner identity, nor filenames are used in this comparison. All operations performed on statistical fingerprints only.
                        </div>

                        {myFingerprints.length === 0 ? (
                            <div className="fp-empty">
                                No fingerprints yet. Go to the Midnight panel and generate a ZK Fingerprint first.
                            </div>
                        ) : (
                            <>
                                {/* Selector A */}
                                <div className="compare-selector">
                                    <div className="compare-selector__label">
                                        <Lock size={13} color="#a855f7" />Dataset A (Your Fingerprint)
                                    </div>
                                    <select
                                        className="compare-select"
                                        value={selectedFpA}
                                        onChange={e => setSelectedFpA(e.target.value)}
                                    >
                                        {myFingerprints.map(fp => (
                                            <option key={fp.fingerprint_id} value={fp.fingerprint_id}>
                                                {fp.fingerprint_id} · {fp.data_category_hint} · {fp.column_count} cols
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* VS Divider */}
                                <div className="compare-vs">
                                    <div className="compare-vs__line" />
                                    <span className="compare-vs__label">VS</span>
                                    <div className="compare-vs__line" />
                                </div>

                                {/* Selector B */}
                                <div className="compare-selector">
                                    <div className="compare-selector__label">
                                        <Lock size={13} color="#64748b" />Dataset B (Compare Target)
                                    </div>
                                    {marketplace.length > 0 ? (
                                        <select
                                            className="compare-select"
                                            value={selectedFpB}
                                            onChange={e => setSelectedFpB(e.target.value)}
                                        >
                                            <option value="">— Select from marketplace —</option>
                                            {marketplace.map(item => (
                                                <option key={item.listing_id} value={item.fingerprint_id}>
                                                    🔒 {item.data_category} · {item.column_count} cols · {item.row_count_range} rows
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="compare-no-market">
                                            No marketplace datasets available yet. List your fingerprint in the Marketplace tab so others can compare.
                                        </div>
                                    )}
                                </div>

                                <button
                                    className="btn btn--primary btn--blockchain"
                                    onClick={handleCompare}
                                    disabled={loading || !selectedFpA || !selectedFpB}
                                >
                                    {loading
                                        ? <><Loader2 size={14} className="spin" />Running ZK Comparison…</>
                                        : <><GitCompare size={14} />Run Private Compare</>
                                    }
                                </button>
                            </>
                        )}

                        {/* Results */}
                        {result && (
                            <div className="compare-result">
                                {/* Similarity Score */}
                                <div className="sim-score-card">
                                    <div className="sim-score-card__label">Overall Similarity</div>
                                    <div
                                        className="sim-score-card__value"
                                        style={{ color: simScore(result.overall_similarity).color }}
                                    >
                                        {(result.overall_similarity * 100).toFixed(1)}%
                                                               <div className="sim-score-card__tag"
                                        style={{ color: simScore(result.overall_similarity).color }}
                                    >
                                        {simScore(result.overall_similarity).label}
                                    </div>
                                    <div className="sim-score-bars">
                                        <div className="sim-bar-row">
                                            <span>Structural</span>
                                            <div className="sim-bar">
                                                <div
                                                    className="sim-bar__fill"
                                                    style={{ width: `${result.shared_structure_score * 100}%`, background: '#a855f7' }}
                                                />
                                            </div>
                                            <span>{(result.shared_structure_score * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="sim-bar-row">
                                            <span>Statistical</span>
                                            <div className="sim-bar">
                                                <div
                                                    className="sim-bar__fill"
                                                    style={{ width: `${result.overall_similarity * 100}%`, background: '#00e5ff' }}
                                                />
                                            </div>
                                            <span>{(result.overall_similarity * 100).toFixed(0)}%</span>
                                        </div>
                                    </div>
                                </div>

                                {/* ZK Proof Visibility Section */}
                                <div style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(168, 85, 247, 0.08)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.2)', boxShadow: '0 4px 20px -5px rgba(168,85,247,0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7', fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                                        <ShieldCheck size={16} /> Verifiable ZK Proof Produced
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                                        This comparison is cryptographically certified. The proof below proves that the similarity calculations are correct against the original data fingerprints without revealing any raw values.
                                    </div>
                                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                                        <div style={{ color: '#94a3b8', marginBottom: '0.25rem', fontSize: '0.6rem' }}>COMPARISON_ID: {String(result.compare_id)}</div>
                                        <div style={{ wordBreak: 'break-all', color: '#c084fc', opacity: 0.9, maxHeight: '80px', overflowY: 'auto' }}>
                                            {String(result.zk_proof) || 'Nexus_ZK_Comparison_Proof_v4_Pending...'}
                                        </div>
                                    </div>
                                    <button 
                                        className="btn btn--secondary btn--sm" 
                                        style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.7rem' }}
                                        onClick={() => {
                                            if (result.zk_proof) {
                                                navigator.clipboard.writeText(String(result.zk_proof));
                                                alert("ZK Proof copied to clipboard.");
                                            }
                                        }}
                                    >
                                        <Copy size={12} /> Copy Full Verification Hash
                                    </button>
                                </div>
          </div>

                                {/* Source Anonymity */}
                                <div className="anonymity-row">
                                    <div className={`anon-badge ${!result.source_a_revealed ? 'private' : 'public'}`}>
                                        <Lock size={12} /> Dataset A: {result.source_a_revealed ? 'Disclosed' : '🔒 Anonymous'}
                                    </div>
                                    <div className={`anon-badge ${!result.source_b_revealed ? 'private' : 'public'}`}>
                                        <Lock size={12} /> Dataset B: {result.source_b_revealed ? 'Disclosed' : '🔒 Anonymous'}
                                    </div>
                                </div>

                                {/* Categories */}
                                <div className="category-row">
                                    <span>Category A: <strong>{result.category_a}</strong></span>
                                    <span>·</span>
                                    <span>Category B: <strong>{result.category_b}</strong></span>
                                </div>

                                {/* ZK Proof */}
                                <div
                                    className="zk-proof-section"
                                    onClick={() => setShowProofDetails(!showProofDetails)}
                                >
                                    <div className="zk-proof-section__title">
                                        <CheckCircle size={14} color="#34d399" />
                                        ZK Proof Verified
                                        {showProofDetails ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </div>
                                    {showProofDetails && (
                                        <div className="zk-proof-detail">
                                            <div>Proof ID: <span className="hash-val">{String(result.zk_proof.proof_id || '')}</span></div>
                                            <div>Scheme: {String(result.zk_proof.scheme || '')}</div>
                                            <div>Verified: {result.zk_proof.verified ? '✅ Yes' : '⚠️ No'}</div>
                                            <div>Commitment: <span className="hash-val">{String(result.zk_proof.commitment || '').slice(0, 24)}…</span></div>
                                        </div>
                                    )}
                                </div>

                                {/* Column Matches */}
                                {result.column_matches.length > 0 && (
                                    <div className="col-matches">
                                        <div className="col-matches__title">
                                            Column Match Heatmap ({result.matched_columns_count} matched)
                                        </div>
                                        {result.column_matches.slice(0, 8).map((m, i) => (
                                            <div key={i} className="col-match-row">
                                                <span className="col-hash-chip" title="Column A hash">{m.col_hash_a}</span>
                                                <div className="col-match-bar">
                                                    <div
                                                        className="col-match-bar__fill"
                                                        style={{
                                                            width: `${m.similarity_score * 100}%`,
                                                            background: m.similarity_score > 0.8 ? '#34d399' : m.similarity_score > 0.5 ? '#f59e0b' : '#f87171'
                                                        }}
                                                    />
                                                </div>
                                                <span className="col-hash-chip" title="Column B hash">{m.col_hash_b}</span>
                                                <span className="col-sim-val">{(m.similarity_score * 100).toFixed(0)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Insights */}
                                {result.insights.map((ins, i) => (
                                    <div key={i} className="compare-insight">{ins}</div>
                                ))}

                                {/* Privacy Guarantee */}
                                <div className="privacy-guarantee-box">
                                    <Shield size={13} color="#a855f7" />
                                    {result.privacy_guarantee}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Marketplace Mode */}
                {activeMode === 'marketplace' && (
                    <div className="blockchain-section">
                        <div className="privacy-guarantee-banner">
                            <Lock size={14} color="#a855f7" />
                            All listings are fully anonymous. Owner identity, filename, and raw data are never stored.
                        </div>

                        <div className="marketplace-section-title">Your Fingerprints</div>
                        {myFingerprints.length === 0 ? (
                            <div className="fp-empty">Generate a ZK fingerprint first from the Midnight panel.</div>
                        ) : (
                            <div className="fp-grid">
                                {myFingerprints.map(fp => {
                                    const creds = attestationsMap[fp.fingerprint_id] || []
                                    return (
                                        <div key={fp.fingerprint_id} className="fp-card">
                                            <div className="fp-card__top">
                                                <div className="fp-card__id" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Lock size={12} color="#8b5cf6" />
                                                    {fp.fingerprint_id.substring(0, 12)}...
                                                </div>
                                                {creds.length > 0 && (
                                                    <div className="dust-badge" style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                                                        <CheckCircle size={10} /> Verified
                                                    </div>
                                                )}
                                            </div>
                                            <div className="fp-card__meta">
                                                Rows: {fp.row_count_range} • Cols: {fp.column_count} • {fp.data_category_hint}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                {fp.is_public ? (
                                                    <div className="fp-card__status" style={{ flex: 1, textAlign: 'center' }}>In Marketplace</div>
                                                ) : (
                                                    <button 
                                                        className="btn btn--secondary btn--sm" style={{ flex: 1 }}
                                                        onClick={() => handleListInMarketplace(fp.fingerprint_id)}
                                                    >
                                                        List on Market
                                                    </button>
                                                )}
                                                {creds.length === 0 && (
                                                    <button 
                                                        className="btn btn--secondary btn--sm" 
                                                        style={{ flex: 1 }}
                                                        onClick={() => handleRequestAudit(fp.fingerprint_id)}
                                                        disabled={auditLoadingFp === fp.fingerprint_id}
                                                    >
                                                        {auditLoadingFp === fp.fingerprint_id ? <Loader2 size={12} className="spin" /> : 'Request Audit'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <div className="marketplace-section-title" style={{ marginTop: '1.5rem' }}>Available Datasets (Anonymized) ({marketplace.length})</div>
                        {marketplace.length === 0 ? (
                            <div className="fp-empty">No datasets listed yet.</div>
                        ) : (
                            <div className="marketplace-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '0.75rem' }}>
                                {marketplace.map(item => {
                                    const mktCreds = attestationsMap[item.fingerprint_id] || []
                                    return (
                                        <div key={item.listing_id} className="mkt-card" style={{ background: 'var(--bg-hover)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem' }}>
                                            <div className="mkt-card__head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <span className="fp-cat-badge">{item.data_category}</span>
                                                    {mktCreds.length > 0 && (
                                                        <span style={{ color: '#34d399', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(52, 211, 153, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                                            <CheckCircle size={10} /> Attested
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                    {item.compare_requests_count} comparisons
                                                </span>
                                            </div>
                                            <div className="mkt-card__meta" style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>
                                                <span>📊 {item.column_count} cols</span><br/>
                                                <span>· {item.row_count_range} rows</span><br/>
                                                <span>· Listed {new Date(item.listed_at).toLocaleDateString()}</span>
                                            </div>
                                            <div className="mkt-card__anon" style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Lock size={11} /> Owner identity fully hidden
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Benchmark Mode */}
                {activeMode === 'benchmark' && (
                    <div className="blockchain-section">
                        <div className="privacy-guarantee-banner">
                            <BarChart3 size={14} color="#a855f7" />
                            Compare anonymously against all marketplace datasets to see where your data stands.
                        </div>

                        <div className="compare-selector">
                            <div className="compare-selector__label">
                                Select Your Fingerprint
                            </div>
                            {myFingerprints.length === 0 ? (
                                <div className="fp-empty">Generate a fingerprint first.</div>
                            ) : (
                                <select
                                    className="compare-select"
                                    value={selectedFpA}
                                    onChange={e => setSelectedFpA(e.target.value)}
                                >
                                    {myFingerprints.map(fp => (
                                        <option key={fp.fingerprint_id} value={fp.fingerprint_id}>
                                            {fp.fingerprint_id} · {fp.data_category_hint}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <button
                            className="btn btn--primary btn--blockchain"
                            onClick={handleBenchmark}
                            disabled={benchmarkLoading || !selectedFpA}
                        >
                            {benchmarkLoading
                                ? <><Loader2 size={14} className="spin" />Running Benchmark…</>
                                : <><Zap size={14} />Run Anonymous Benchmark</>
                            }
                        </button>

                        {benchmarkResult && (
                            <div className="benchmark-results">
                                {benchmarkResult.length === 0 ? (
                                    <div className="fp-empty">No marketplace datasets to benchmark against yet.</div>
                                ) : (
                                    benchmarkResult.map((b, i) => (
                                        <div key={i} className="benchmark-row">
                                            <div className="benchmark-row__cat">
                                                <span className="fp-cat-badge">{b.data_category}</span>
                                                <span className="benchmark-row__sim" style={{
                                                    color: simScore(b.overall_similarity).color
                                                }}>
                                                    {(b.overall_similarity * 100).toFixed(1)}% similar
                                                </span>
                                            </div>
                                            {b.top_insight && (
                                                <div className="benchmark-row__insight">{b.top_insight}</div>
                                            )}
                                            <div className="sim-bar">
                                                <div
                                                    className="sim-bar__fill"
                                                    style={{
                                                        width: `${b.overall_similarity * 100}%`,
                                                        background: simScore(b.overall_similarity).color
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Bounties Mode */}
                {activeMode === 'bounties' && (
                    <div className="blockchain-section">
                        <div className="privacy-guarantee-banner" style={{ background: '#3b0764' }}>
                            <Zap size={14} color="#fcd34d" />
                            Submit a mathematical proof that your dataset matches the requested schema to earn DUST automatically via Smart Contracts.
                        </div>

                        <div className="compare-selector" style={{ marginBottom: '1.5rem' }}>
                            <div className="compare-selector__label">
                                <Lock size={13} color="#a855f7" />Select Your Fingerprint (To Claim)
                            </div>
                            <select
                                className="compare-select"
                                value={selectedFpA}
                                onChange={e => setSelectedFpA(e.target.value)}
                            >
                                <option value="">— Select your fingerprint —</option>
                                {myFingerprints.map(fp => (
                                    <option key={fp.fingerprint_id} value={fp.fingerprint_id}>
                                        {fp.fingerprint_id} · {fp.data_category_hint}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {bountyResult && (
                            <div className={`toast-notification ${bountyResult.success ? 'success' : 'error'}`} style={{ marginBottom: '1rem', position: 'static' }}>
                                {bountyResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                {bountyResult.message}
                            </div>
                        )}

                        <div className="marketplace-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Open Bounties</span>
                            <button className="btn btn--primary btn--sm" onClick={() => setBountyFormOpen(!bountyFormOpen)}>
                                {bountyFormOpen ? 'Cancel' : '+ Create Bounty'}
                            </button>
                        </div>

                        {bountyFormOpen && (
                            <div className="bounty-create-form active" style={{ display: 'block', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '1rem' }}>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Target Fingerprint (Schema to Match)</label>
                                    <select className="compare-select" value={selectedFpA} onChange={e => setSelectedFpA(e.target.value)}>
                                        <option value="">— Select source fingerprint —</option>
                                        {myFingerprints.map(fp => (
                                            <option key={fp.fingerprint_id} value={fp.fingerprint_id}>{fp.fingerprint_id}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Description (What are you looking for?)</label>
                                    <input type="text" value={bountyDesc} onChange={e => setBountyDesc(e.target.value)} placeholder="e.g. Healthcare Patient Demographic Data" className="compare-select" style={{ width: '100%' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Reward (DUST)</label>
                                        <input type="number" value={bountyReward} onChange={e => setBountyReward(Number(e.target.value))} className="compare-select" style={{ width: '100%' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Min Similarity</label>
                                        <select className="compare-select" value={bountySimReq} onChange={e => setBountySimReq(Number(e.target.value))}>
                                            <option value={0.7}>70%</option>
                                            <option value={0.8}>80%</option>
                                            <option value={0.9}>90% (Strict)</option>
                                            <option value={0.99}>99% (Identical)</option>
                                        </select>
                                    </div>
                                </div>
                                <button className="btn btn--blockchain" style={{ width: '100%' }} onClick={handleCreateBounty} disabled={creatingBounty || !selectedFpA || !bountyDesc}>
                                    {creatingBounty ? 'Creating...' : `Lock ${bountyReward} DUST & Create`}
                                </button>
                            </div>
                        )}

                        {bounties.length === 0 ? (
                            <div className="fp-empty">No bounties open at this time.</div>
                        ) : (
                            bounties.map(bounty => {
                                const isClaimed = bounty.status === 'claimed'
                                const hasToken = !!claimedTokens[bounty.bounty_id]
                                
                                return (
                                <div key={bounty.bounty_id} className="bounty-card" style={{ opacity: isClaimed ? 0.85 : 1, borderLeft: isClaimed ? '3px solid #34d399' : '3px solid #00e5ff' }}>
                                    <div className="bounty-card__head">
                                        <div style={{ fontWeight: 600 }}>
                                            {bounty.description}
                                            {isClaimed && <span style={{ marginLeft: 8, color: '#34d399', fontSize: '0.75rem', fontWeight: 700 }}>✓ CLAIMED</span>}
                                        </div>
                                        <div className="dust-badge">{isClaimed ? '✅' : '💰'} {bounty.reward_dust} DUST</div>
                                    </div>
                                    
                                    <div className="bounty-card__reqs" style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.5rem 0' }}>
                                        Required Similarity: <strong style={{ color: '#00e5ff' }}>{(bounty.required_similarity_score * 100).toFixed(0)}%</strong><br />
                                        Target Category: {bounty.target_category}<br />
                                        Target Context: {bounty.target_column_count} cols
                                        {isClaimed && bounty.similarity_achieved && (
                                            <><br />Achieved Similarity: <strong style={{ color: '#34d399' }}>{(bounty.similarity_achieved * 100).toFixed(0)}%</strong></>
                                        )}
                                        {isClaimed && bounty.claimed_at && (
                                            <><br />Claimed: {new Date(bounty.claimed_at).toLocaleString()}</>
                                        )}
                                    </div>
                                    
                                    {isClaimed ? (
                                        (hasToken || bounty.creator_session_id === sessionId) ? (
                                            <button 
                                                className="btn btn--primary btn--sm"
                                                onClick={() => {
                                                    const url = new URL(`${API_BASE}/blockchain/bounties/${bounty.bounty_id}/data`);
                                                    if (hasToken) url.searchParams.append("token", claimedTokens[bounty.bounty_id]);
                                                    if (bounty.creator_session_id === sessionId) url.searchParams.append("session_id", sessionId);
                                                    
                                                    window.open(url.toString(), '_blank')
                                                }}
                                                style={{ width: '100%' }}
                                            >
                                                <ExternalLink size={12} /> View Claimed Data →
                                            </button>
                                        ) : (
                                            <div style={{ fontSize: '0.75rem', color: '#34d399', textAlign: 'center', padding: '0.5rem' }}>
                                                ✓ Bounty has been claimed and verified on-chain
                                            </div>
                                        )
                                    ) : (
                                        <button 
                                            className="btn btn--secondary btn--sm"
                                            onClick={() => handleClaimBounty(bounty.bounty_id)}
                                            disabled={claimingBountyId === bounty.bounty_id || !selectedFpA}
                                            style={{ width: '100%' }}
                                        >
                                            {claimingBountyId === bounty.bounty_id 
                                                ? <Loader2 size={12} className="spin" /> 
                                                : 'Submit ZK Proof to Claim'
                                            }
                                        </button>
                                    )}
                                </div>
                                )
                            })
                        )}
                    </div>
                )}
                {activeMode === 'attestations' && (
                    <div className="blockchain-section">
                        <div className="privacy-guarantee-banner" style={{ background: 'rgba(168, 85, 247, 0.1)', borderColor: '#a855f7' }}>
                            <ClipboardCheck size={14} color="#a855f7" />
                            Generate a cryptographically signed Verifiable Credential. AI proves your dataset is PII-free internally and issues a zero-knowledge certificate on Midnight without leaking raw data.
                        </div>

                        <div className="compare-selector" style={{ marginBottom: '1.5rem' }}>
                            <div className="compare-selector__label">
                                <Lock size={13} color="#a855f7" />Select Fingerprint to Audit
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <select
                                    className="compare-select"
                                    style={{ flex: 1 }}
                                    value={selectedFpA}
                                    onChange={e => setSelectedFpA(e.target.value)}
                                >
                                    <option value="">— Select dataset —</option>
                                    {myFingerprints.map(fp => (
                                        <option key={fp.fingerprint_id} value={fp.fingerprint_id}>
                                            {fp.fingerprint_id} · {fp.data_category_hint}
                                        </option>
                                    ))}
                                </select>
                                <button 
                                    className="btn btn--primary" 
                                    onClick={() => handleRequestAudit(selectedFpA)}
                                    disabled={!selectedFpA || auditLoadingFp === selectedFpA}
                                >
                                    {auditLoadingFp === selectedFpA ? 'Auditing...' : 'Request ZK-PII Audit'}
                                </button>
                            </div>
                        </div>

                        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '1.5rem 0 1rem', color: 'white' }}>Verifiable Credentials</h3>
                        {Object.values(attestationsMap).flat().length === 0 ? (
                            <div className="fp-empty">No credentials generated yet. Request an audit to issue a zero-knowledge signature.</div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                {Object.values(attestationsMap).flat().map((vc) => (
                                    <div key={vc.credential_id} style={{
                                        background: 'rgba(20, 30, 50, 0.6)', 
                                        borderRadius: '12px', padding: '1rem', 
                                        border: '1px solid rgba(52, 211, 153, 0.3)',
                                        position: 'relative', overflow: 'hidden'
                                    }}>
                                        <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.1 }}>
                                            <ShieldCheck size={80} color="#34d399" />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                                            <ShieldCheck size={16} color="#34d399" />
                                            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{vc.claim_type} Certified</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'grid', gap: '4px' }}>
                                            <div><strong>Oracle:</strong> {vc.issuer_id}</div>
                                            <div><strong>Issued:</strong> {new Date(vc.issued_at).toLocaleDateString()}</div>
                                            <div><strong>Fingerprint:</strong> {vc.fingerprint_id.slice(0,10)}...</div>
                                        </div>
                                        <div style={{ 
                                            marginTop: '0.75rem', padding: '0.4rem', 
                                            background: 'rgba(52, 211, 153, 0.1)', 
                                            color: '#34d399', fontSize: '0.7rem', 
                                            textAlign: 'center', borderRadius: '4px',
                                            fontWeight: 600, letterSpacing: '0.05em'
                                        }}>
                                            VALID ON LACE
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
    )
}
