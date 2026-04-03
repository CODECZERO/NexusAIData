import { useState, useEffect, useCallback } from 'react'
import {
    Shield, Lock, Unlock, RefreshCw, Loader2, Zap, Database,
    ShieldCheck, Wallet, ArrowRight, CheckCircle, XCircle, DollarSign,
    Eye, Copy, ExternalLink
} from 'lucide-react'
import {
    getMarketplace, getSubscriptions, createSubscription,
    claimSubscription, refundSubscription,
    type DataSubscription, type MarketplaceListing
} from '../api'
import {
    connectToWallet, getWalletAddress, getAvailableWallets, signTransaction, checkAndVerifyBalance, executeTokenTransfer,
    type WalletMetadata, SUPPORTED_WALLETS
} from '../utils/midnight'

interface Props {
    sessionId: string
    onClose: () => void
}

export default function DataSubscriptionPanel({ sessionId, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<'browse' | 'my-subs' | 'claims'>('browse')
    const [listings, setListings] = useState<MarketplaceListing[]>([])
    const [mySubs, setMySubs] = useState<DataSubscription[]>([])
    const [incomingClaims, setIncomingClaims] = useState<DataSubscription[]>([])
    const [loading, setLoading] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [walletConnected, setWalletConnected] = useState(false)
    const [walletAddr, setWalletAddr] = useState('')
    const [dustAmount, setDustAmount] = useState(100)
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [mkt, subs] = await Promise.all([
                getMarketplace().catch(() => ({ listings: [] })),
                getSubscriptions(sessionId).catch(() => ({ subscriptions: [], my_subs: [], incoming_claims: [] })),
            ])
            setListings(mkt.listings || [])
            setMySubs(subs.my_subs || [])
            setIncomingClaims(subs.incoming_claims || [])
        } catch (e) {
        }
        setLoading(false)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const handleConnect = async () => {
        try {
            setActionLoading('wallet')
            const wallets = await getAvailableWallets()
            const target = wallets[0] || SUPPORTED_WALLETS['lace']
            const conn = await connectToWallet(target.key)
            const addr = conn.address || await getWalletAddress(conn.api)
            setWalletAddr(addr)
            setWalletConnected(true)
            setStatus({ type: 'success', msg: 'Wallet connected' })
        } catch (e: any) {
            setStatus({ type: 'error', msg: e.message })
        }
        setActionLoading(null)
    }

    const signWithLace = async (actionMsg: string) => {
        try {
            // Using 'lace' explicitly for now since user log specifies lace. In production, could pull from selectedWallet state
            await signTransaction('lace', 'preprod', walletAddr || undefined, actionMsg);
        } catch (e: any) {
            throw new Error(`Signing Failed: ${e.message || 'User rejected or timeout'}`);
        }
    }

    const handleSubscribe = async (fpId: string) => {
        if (!walletConnected) { setStatus({ type: 'error', msg: 'Connect wallet first' }); return }
        setActionLoading(fpId)
        try {
            await checkAndVerifyBalance('lace', 'preprod', dustAmount);
            await signWithLace(`Create Subscription for ${fpId} with ${dustAmount} DUST`)
            await executeTokenTransfer('lace', 'preprod', dustAmount);
            const result = await createSubscription(sessionId, fpId, dustAmount)
            setStatus({ type: 'success', msg: result.message || `Subscription created! ${dustAmount} DUST locked.` })
            loadData()
        } catch (e: any) {
            setStatus({ type: 'error', msg: e.message })
        }
        setActionLoading(null)
    }

    const handleClaim = async (subId: string) => {
        if (!walletConnected) { setStatus({ type: 'error', msg: 'Connect wallet first' }); return }
        setActionLoading(subId)
        try {
            await signWithLace(`Prove ZK Ownership & Claim Subscription ${subId}`)
            const result = await claimSubscription(sessionId, subId)
            setStatus({ type: 'success', msg: result.message || 'Subscription claimed! DUST released.' })
            loadData()
        } catch (e: any) {
            setStatus({ type: 'error', msg: e.message })
        }
        setActionLoading(null)
    }

    const handleRefund = async (subId: string) => {
        if (!walletConnected) { setStatus({ type: 'error', msg: 'Connect wallet first' }); return }
        setActionLoading(`refund-${subId}`)
        try {
            await signWithLace(`Refund Subscription ${subId}`)
            const result = await refundSubscription(sessionId, subId)
            setStatus({ type: 'success', msg: result.message || 'DUST refunded.' })
            loadData()
        } catch (e: any) {
            setStatus({ type: 'error', msg: e.message })
        }
        setActionLoading(null)
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setStatus({ type: 'info', msg: 'Copied to clipboard' })
    }

    return (
        <div className="fp-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
                width: '90vw', maxWidth: 920, maxHeight: '88vh', overflow: 'auto',
                background: 'linear-gradient(135deg, rgba(15,15,35,0.98), rgba(20,10,40,0.98))',
                border: '1px solid rgba(0,229,255,0.15)', borderRadius: 16,
                backdropFilter: 'blur(24px)', padding: '2rem',
                boxShadow: '0 0 80px rgba(0,229,255,0.08)'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: 'linear-gradient(135deg, #00e5ff, #7c4dff)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <DollarSign size={20} color="#fff" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#fff', fontWeight: 700 }}>
                                Data Subscriptions
                            </h2>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                ⬡ Preprod · Confidential DUST Monetization
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#94a3b8', borderRadius: 8, padding: '0.4rem 0.8rem', cursor: 'pointer',
                        fontSize: '0.8rem', transition: 'all 0.2s'
                    }}>✕</button>
                </div>

                {/* Wallet Bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem',
                    padding: '0.75rem 1rem', borderRadius: 10,
                    background: walletConnected ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${walletConnected ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                    <Wallet size={16} color={walletConnected ? '#34d399' : '#64748b'} />
                    {walletConnected ? (
                        <span style={{ fontSize: '0.8rem', color: '#34d399', fontFamily: 'monospace' }}>
                            {walletAddr.substring(0, 12)}...{walletAddr.substring(walletAddr.length - 8)}
                        </span>
                    ) : (
                        <button onClick={handleConnect} disabled={actionLoading === 'wallet'} style={{
                            background: 'linear-gradient(135deg, #00e5ff, #7c4dff)', border: 'none',
                            color: '#fff', borderRadius: 6, padding: '0.4rem 1rem', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: 600
                        }}>
                            {actionLoading === 'wallet' ? <Loader2 size={14} className="spin" /> : 'Connect Wallet'}
                        </button>
                    )}
                </div>

                {/* Status */}
                {status && (
                    <div style={{
                        padding: '0.6rem 1rem', borderRadius: 8, marginBottom: '1rem',
                        fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8,
                        background: status.type === 'success' ? 'rgba(52,211,153,0.1)' :
                            status.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(0,229,255,0.1)',
                        border: `1px solid ${status.type === 'success' ? 'rgba(52,211,153,0.3)' :
                            status.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(0,229,255,0.3)'}`,
                        color: status.type === 'success' ? '#34d399' :
                            status.type === 'error' ? '#ef4444' : '#00e5ff',
                    }}>
                        {status.type === 'success' ? <CheckCircle size={14} /> : status.type === 'error' ? <XCircle size={14} /> : <Zap size={14} />}
                        {status.msg}
                        <button onClick={() => setStatus(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem' }}>
                    {([
                        { id: 'browse' as const, label: 'Browse Datasets', icon: Database },
                        { id: 'my-subs' as const, label: 'My Subscriptions', icon: Lock },
                        { id: 'claims' as const, label: 'Incoming Claims', icon: Unlock },
                    ]).map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            flex: 1, padding: '0.6rem', borderRadius: 8, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s',
                            background: activeTab === tab.id ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${activeTab === tab.id ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                            color: activeTab === tab.id ? '#00e5ff' : '#64748b'
                        }}>
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        <Loader2 size={28} className="spin" style={{ margin: '0 auto 1rem' }} />
                        Loading...
                    </div>
                ) : (
                    <>
                        {/* Browse Tab */}
                        {activeTab === 'browse' && (
                            <div>
                                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>DUST to Lock:</label>
                                    <input type="number" value={dustAmount} onChange={e => setDustAmount(parseInt(e.target.value) || 0)}
                                        style={{
                                            width: 100, padding: '0.3rem 0.6rem', borderRadius: 6,
                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#fff', fontSize: '0.85rem'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>tokens</span>
                                </div>

                                {listings.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: '0.85rem' }}>
                                        No datasets listed in marketplace yet. List a fingerprint first.
                                    </div>
                                ) : (
                                    listings.map(listing => (
                                        <div key={listing.listing_id} style={{
                                            padding: '1rem', borderRadius: 10, marginBottom: '0.75rem',
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid rgba(0,229,255,0.08)',
                                            transition: 'all 0.2s'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}>
                                                        <Database size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                                        {listing.data_category || 'Dataset'}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>
                                                        FP: {listing.fingerprint_id?.substring(0, 16)}...
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 2 }}>
                                                        Rows: {listing.row_count_range}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleSubscribe(listing.fingerprint_id)}
                                                    disabled={actionLoading === listing.fingerprint_id}
                                                    style={{
                                                        background: 'linear-gradient(135deg, #00e5ff, #7c4dff)',
                                                        border: 'none', color: '#fff', borderRadius: 8,
                                                        padding: '0.5rem 1.2rem', cursor: 'pointer',
                                                        fontSize: '0.8rem', fontWeight: 600,
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        opacity: actionLoading === listing.fingerprint_id ? 0.6 : 1
                                                    }}
                                                >
                                                    {actionLoading === listing.fingerprint_id ? (
                                                        <Loader2 size={14} className="spin" />
                                                    ) : (
                                                        <>
                                                            <Lock size={14} />
                                                            Lock {dustAmount} DUST
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* My Subscriptions Tab */}
                        {activeTab === 'my-subs' && (
                            <div>
                                {mySubs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: '0.85rem' }}>
                                        No subscriptions yet. Browse datasets to create one.
                                    </div>
                                ) : (
                                    mySubs.map(sub => (
                                        <div key={sub.subscriptionId} style={{
                                            padding: '1rem', borderRadius: 10, marginBottom: '0.75rem',
                                            background: 'rgba(255,255,255,0.02)',
                                            borderLeft: `3px solid ${sub.status === 'LOCKED' ? '#00e5ff' : sub.status === 'CLAIMED' ? '#34d399' : '#ef4444'}`,
                                            border: '1px solid rgba(255,255,255,0.06)',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                        <span style={{
                                                            fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                                            background: sub.status === 'LOCKED' ? 'rgba(0,229,255,0.15)' :
                                                                sub.status === 'CLAIMED' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
                                                            color: sub.status === 'LOCKED' ? '#00e5ff' :
                                                                sub.status === 'CLAIMED' ? '#34d399' : '#ef4444',
                                                        }}>{sub.status}</span>
                                                        <span style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: 600 }}>
                                                            {sub.paymentDust} DUST
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                                                        TX: {sub.transactionId?.substring(0, 20)}...
                                                    </div>
                                                    {sub.decryptionKey && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: '0.7rem', color: '#34d399' }}>
                                                            <Eye size={12} />
                                                            Key: {sub.decryptionKey.substring(0, 16)}...
                                                            <button onClick={() => copyToClipboard(sub.decryptionKey!)} style={{
                                                                background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', padding: 0
                                                            }}><Copy size={12} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                                {sub.status === 'LOCKED' && (
                                                    <button onClick={() => handleRefund(sub.subscriptionId)}
                                                        disabled={actionLoading === `refund-${sub.subscriptionId}`}
                                                        style={{
                                                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                                            color: '#ef4444', borderRadius: 6, padding: '0.35rem 0.8rem',
                                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                                        }}>
                                                        {actionLoading === `refund-${sub.subscriptionId}` ? <Loader2 size={12} className="spin" /> : 'Refund'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Claims Tab */}
                        {activeTab === 'claims' && (
                            <div>
                                {incomingClaims.filter(s => s.status === 'LOCKED').length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: '0.85rem' }}>
                                        No pending claims. Subscriptions targeting your datasets will appear here.
                                    </div>
                                ) : (
                                    incomingClaims.filter(s => s.status === 'LOCKED').map(sub => (
                                        <div key={sub.subscriptionId} style={{
                                            padding: '1rem', borderRadius: 10, marginBottom: '0.75rem',
                                            background: 'rgba(124,77,255,0.04)',
                                            border: '1px solid rgba(124,77,255,0.15)',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                                                        💰 {sub.paymentDust} DUST locked for your data
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                                                        Prove ownership to claim
                                                    </div>
                                                </div>
                                                <button onClick={() => handleClaim(sub.subscriptionId)}
                                                    disabled={actionLoading === sub.subscriptionId}
                                                    style={{
                                                        background: 'linear-gradient(135deg, #34d399, #059669)',
                                                        border: 'none', color: '#fff', borderRadius: 8,
                                                        padding: '0.5rem 1.2rem', cursor: 'pointer',
                                                        fontSize: '0.8rem', fontWeight: 600,
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                    }}>
                                                    {actionLoading === sub.subscriptionId ? (
                                                        <Loader2 size={14} className="spin" />
                                                    ) : (
                                                        <>
                                                            <ShieldCheck size={14} />
                                                            Prove & Claim
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Footer */}
                <div style={{
                    marginTop: '1.5rem', paddingTop: '1rem',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span style={{ fontSize: '0.7rem', color: '#475569' }}>
                        <Shield size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        Powered by data_subscription.compact · Midnight ZK
                    </span>
                    <button onClick={loadData} style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#64748b', borderRadius: 6, padding: '0.3rem 0.6rem',
                        cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4
                    }}>
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>
            </div>
        </div>
    )
}
