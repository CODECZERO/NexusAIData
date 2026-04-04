import { useState, useRef, useEffect } from 'react'
import { Bot, Send, X, Terminal, BarChart3, ShieldCheck, ChevronRight, MessageSquareDashed, TrendingUp, Grid } from 'lucide-react'
import { getNexusChat, NexusAction } from '../api'

interface Props {
    sessionId: string
    activeTab: string
    setActiveTab: (tab: string) => void
    onActionTriggered: (type: string, payload: any) => void
}

export function NexusCopilot({ sessionId, activeTab, setActiveTab, onActionTriggered }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string, actions?: NexusAction[] }[]>([
        {
            role: 'assistant',
            content: "Hello! I'm Nexus, your Agentic Copilot. I can help you clean data, run simulations, or navigate the platform. What's on your mind?"
        }
    ])
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([
        "How can I improve profit?",
        "Clean my data for outliers",
        "Visualize the correlation between cost and revenue"
    ])

    const messagesEnd = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = async (message: string) => {
        if (!message.trim() || loading) return

        const userMsg = { role: 'user' as const, content: message }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            const res = await getNexusChat(sessionId, message)
            
            const assistantMsg = {
                role: 'assistant' as const,
                content: res.answer,
                actions: res.actions
            }
            
            setMessages(prev => [...prev, assistantMsg])
            setSuggestedQuestions(res.suggested_questions || [])

            // Auto-navigation if a navigate action is present
            res.actions.forEach(action => {
                if (action.action_type === 'navigate' && action.payload?.target_tab) {
                    setActiveTab(action.payload.target_tab)
                }
            })

        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I'm having trouble connecting to the Nexus core." }])
        } finally {
            setLoading(false)
        }
    }

    const renderActionIcon = (type: string) => {
        switch (type) {
            case 'simulate': return <Terminal size={14} className="text-blue-500" />
            case 'clean': return <ShieldCheck size={14} className="text-green-500" />
            case 'visualize': return <BarChart3 size={14} className="text-purple-500" />
            case 'navigate': return <ChevronRight size={14} className="text-gray-500" />
            case 'forecast': return <TrendingUp size={14} className="text-indigo-500" />
            case 'pivot': return <Grid size={14} className="text-cyan-500" />
            default: return <Bot size={14} />
        }
    }

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed', bottom: '2rem', right: '2rem',
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: 'var(--accent-primary)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.4)',
                    border: 'none', cursor: 'pointer', zIndex: 1000,
                    transition: 'transform 0.2s',
                    transform: 'scale(1)',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                <Bot size={32} />
                <div style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: '#10b981', border: '2px solid white'
                }} />
            </button>
        )
    }

    return (
        <div style={{
            position: 'fixed', bottom: '2rem', right: '2rem',
            width: '400px', height: '600px', borderRadius: '24px',
            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            zIndex: 1000, animation: 'slideUp 0.3s ease-out'
        }}>
            {/* Header */}
            <div style={{
                padding: '1.5rem', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Bot size={24} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Nexus AI</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Agentic Copilot v1.0</div>
                    </div>
                </div>
                <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.7 }}>
                    <X size={24} />
                </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {messages.map((msg, i) => (
                    <div key={i} style={{ 
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%'
                    }}>
                        <div style={{
                            padding: '1rem', borderRadius: '16px',
                            background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                            color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                            fontSize: '0.9rem', lineHeight: '1.5',
                            boxShadow: msg.role === 'user' ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none',
                            border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)'
                        }}>
                            {msg.content}
                        </div>

                        {/* Actions */}
                        {msg.actions && msg.actions.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                                {msg.actions.map((action, ai) => (
                                    <button 
                                        key={ai}
                                        onClick={() => onActionTriggered(action.action_type, action.payload)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.75rem 1rem', background: 'var(--bg-primary)',
                                            border: '1px solid var(--border-subtle)', borderRadius: '12px',
                                            cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s'
                                        }}
                                        className="action-card-hover"
                                    >
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {renderActionIcon(action.action_type)}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{action.description}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Action • {action.action_type}</div>
                                        </div>
                                        <ChevronRight size={14} color="var(--text-muted)" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div style={{ alignSelf: 'flex-start', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '16px', display: 'flex', gap: '4px' }}>
                        <div className="dot-pulse"></div>
                        <div className="dot-pulse" style={{ animationDelay: '0.2s' }}></div>
                        <div className="dot-pulse" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                )}
                <div ref={messagesEnd} />
            </div>

            {/* Suggestions */}
            {!loading && suggestedQuestions.length > 0 && (
                <div style={{ padding: '0 1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    {suggestedQuestions.map((q, i) => (
                        <button 
                            key={i} 
                            onClick={() => handleSend(q)}
                            style={{
                                padding: '0.4rem 0.8rem', borderRadius: '20px', 
                                background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)',
                                color: 'var(--accent-primary)', fontSize: '0.75rem', cursor: 'pointer'
                            }}
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend(input)}
                        placeholder="Type a command or ask a question..."
                        style={{
                            width: '100%', padding: '1rem 3.5rem 1rem 1.25rem',
                            borderRadius: '16px', background: 'var(--bg-primary)',
                            border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
                            fontSize: '0.9rem', outline: 'none'
                        }}
                    />
                    <button 
                        onClick={() => handleSend(input)}
                        disabled={!input.trim() || loading}
                        style={{
                            position: 'absolute', right: '0.5rem',
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: input.trim() ? 'var(--accent-primary)' : 'transparent',
                            color: input.trim() ? 'white' : 'var(--text-muted)',
                            border: 'none', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .dot-pulse {
                    width: 6px; height: 6px; border-radius: 50%;
                    background: var(--text-muted);
                    animation: pulse 1s infinite ease-in-out;
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(0.8); opacity: 0.5; }
                    50% { transform: scale(1.2); opacity: 1; }
                }
                .action-card-hover:hover {
                    background: var(--bg-secondary) !important;
                    border-color: var(--accent-primary) !important;
                    transform: translateX(4px);
                }
            `}</style>
        </div>
    )
}
