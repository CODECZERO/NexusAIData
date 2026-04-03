import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Send, X } from 'lucide-react'
import { API_BASE } from '../api'
type DashboardRole = 'executive' | 'analyst' | 'scientist' | 'engineer'
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface Props {
    sessionId: string
    role: DashboardRole
    onClose: () => void
    onDataModified?: () => void
    onDashboardMutate?: (action: string, value: any) => void
}

export function ChatPanel({ sessionId, role, onClose, onDataModified, onDashboardMutate }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: `Welcome! I'm Nexus Analytics, your data intelligence assistant. I'm viewing this dataset as a **${role}**.\n\nAsk me anything about your data — I can explain patterns, run forecasts, compare segments, and more.`,
        },
    ])
    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
    const [currentIntent, setCurrentIntent] = useState<string | null>(null)
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
    const messagesEnd = useRef<HTMLDivElement>(null)

    // Auto-scroll
    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // HTTP Connection Setup
    const connectHTTP = useCallback(() => {
        setConnectionStatus('connected')
    }, [])

    useEffect(() => {
        connectHTTP()
        return () => {
        }
    }, [connectHTTP])

    const sendMessage = async () => {
        if (!input.trim() || streaming) return

        const userMsg: ChatMessage = { role: 'user', content: input.trim() }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setStreaming(true)

        try {
            const apiUrl = `${API_BASE}/chat/${sessionId}`

            const payload = {
                message: input.trim(),
                role: role,
                current_intent: currentIntent
            };

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': localStorage.getItem('LUMINA_API_KEY') || '' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                throw new Error(`HTTP Error ${res.status}`);
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder("utf-8");

            if (!reader) throw new Error("No reader from response");

            let done = false;
            let buffer = '';
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Last line might be partial

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        try {
                            const data = JSON.parse(trimmed);
                            if (data.type === 'intent') {
                                setCurrentIntent(data.intent)
                            } else if (data.type === 'token') {
                                setMessages(prev => {
                                    const updated = [...prev]
                                    const last = updated[updated.length - 1]
                                    if (last && last.role === 'assistant') {
                                        updated[updated.length - 1] = {
                                            ...last,
                                            content: last.content + data.content,
                                        }
                                    } else {
                                        updated.push({ role: 'assistant', content: data.content })
                                    }
                                    return updated
                                })
                            } else if (data.type === 'done') {
                                setStreaming(false)
                                setCurrentIntent(null)
                            } else if (data.type === 'error') {
                                setMessages(prev => [...prev, {
                                    role: 'assistant',
                                    content: `Error: ${data.content}`,
                                }])
                                setStreaming(false)
                            } else if (data.type === 'data_updated') {
                                if (onDataModified) onDataModified()
                            } else if (data.type === 'dashboard_mutate') {
                                if (onDashboardMutate) {
                                    onDashboardMutate(data.action, data.value)
                                }
                                if (data.message) {
                                    setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
                                }
                            }
                        } catch (e) {
                        }
                    }
                }
            }

        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Chat connection not available. Please ensure the backend is running and try refreshing the page.',
            }])
            setStreaming(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    return (
        <div className="chat-panel">
            {/* Header */}
            <div className="chat-panel__header">
                <div className="chat-panel__title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Bot size={18} color="var(--accent-primary)" />
                    <span>Nexus Analytics Chat</span>
                    <span style={{
                        width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', marginLeft: '0.5rem',
                        background: connectionStatus === 'connected' ? 'var(--accent-success)' : connectionStatus === 'connecting' ? 'var(--accent-warning)' : 'var(--accent-danger)',
                        boxShadow: connectionStatus === 'connected' ? '0 0 6px var(--accent-success)' : 'none'
                    }} title={connectionStatus} />
                    {currentIntent && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: 'var(--accent-secondary)',
                            fontFamily: 'var(--font-mono)',
                            marginLeft: '0.5rem',
                            padding: '0.15rem 0.4rem',
                            background: 'rgba(123, 47, 255, 0.15)',
                            borderRadius: '4px',
                        }}>
                            {currentIntent}
                        </span>
                    )}
                </div>
                <button className="btn--icon" onClick={onClose} title="Close chat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} />
                </button>
            </div>

            {/* Messages */}
            <div className="chat-panel__messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-message chat-message--${msg.role}`}>
                        {msg.role === 'assistant' ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        ) : (
                            msg.content
                        )}
                    </div>
                ))}
                {streaming && (
                    <div style={{ display: 'flex', gap: '4px', padding: '0.5rem' }}>
                        <span style={{ animation: 'loadingPulse 1s ease-in-out infinite' }}>●</span>
                        <span style={{ animation: 'loadingPulse 1s ease-in-out 0.2s infinite' }}>●</span>
                        <span style={{ animation: 'loadingPulse 1s ease-in-out 0.4s infinite' }}>●</span>
                    </div>
                )}
                <div ref={messagesEnd} />
            </div>

            {/* Input */}
            <div className="chat-panel__input-area">
                <input
                    className="chat-panel__input" value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={streaming ? 'Thinking...' : `Ask about your data as ${role}...`}
                    disabled={streaming}
                />
                <button
                    className="chat-panel__send" onClick={sendMessage}
                    disabled={streaming || !input.trim()}
                    title="Send message"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={16} />
                </button>
            </div>
        </div>
    )
}

export default ChatPanel;
