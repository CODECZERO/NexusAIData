import { useState, useRef, useCallback } from 'react'
import { uploadFile, type UploadResponse } from '../api'
import { UploadCloud, BarChart3, BrainCircuit, Lightbulb, AlertTriangle, Loader2 } from 'lucide-react'

interface Props {
    onUpload: (result: UploadResponse) => void
}

export function UploadZone({ onUpload }: Props) {
    const [dragOver, setDragOver] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [currentFile, setCurrentFile] = useState('')
    const [error, setError] = useState<string | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)

    const handleFiles = useCallback(async (files: FileList | File[]) => {
        const fileArray = Array.from(files)
        if (fileArray.length === 0) return

        setUploading(true)
        setError(null)

        for (let i = 0; i < fileArray.length; i++) {
            const file = fileArray[i]
            setCurrentFile(file.name)
            setProgress(Math.round(((i) / fileArray.length) * 100))

            try {
                const result = await uploadFile(file)
                setProgress(Math.round(((i + 1) / fileArray.length) * 100))

                // Call onUpload for each successful file
                // Last file triggers navigation to dashboard
                onUpload(result)
            } catch (err) {
                setError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
        }

        setUploading(false)
        setProgress(0)
        setCurrentFile('')
    }, [onUpload])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
    }, [handleFiles])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleFiles(e.target.files)
    }

    return (
        <div className="upload-zone">
            <div className="upload-zone__card">
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ marginBottom: '0.5rem' }}>
                        <span style={{ background: 'linear-gradient(135deg, #00E5FF, #7B2FFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Nexus Analytics
                        </span>
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Full-Stack Data Intelligence Platform
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Upload your data → Get 5-tier analytics in seconds
                    </p>
                </div>

                <div
                    className={`upload-zone__dropzone ${dragOver ? 'drag-over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInput.current?.click()}
                >
                    <div className="upload-zone__icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                        {uploading ? <Loader2 size={48} color="var(--accent-primary)" className="animate-spin" /> : <UploadCloud size={48} color="var(--accent-primary)" />}
                    </div>

                    {uploading ? (
                        <>
                            <div className="upload-zone__title">Analyzing: {currentFile}</div>
                            <div className="upload-zone__subtitle">Running 5-tier intelligence pipeline</div>
                            <div className="upload-zone__progress">
                                <div className="upload-zone__progress-bar">
                                    <div
                                        className="upload-zone__progress-fill" style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
                                    {progress}% complete
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="upload-zone__title">Drop your data files here</div>
                            <div className="upload-zone__subtitle">or click to browse • Supports <strong>multiple files</strong> • Max 500MB each
                            </div>
                            <div className="upload-zone__formats">
                                {['.csv', '.xlsx', '.xls', '.parquet', '.json'].map(fmt => (
                                    <span key={fmt} className="upload-zone__format-badge">{fmt}</span>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {error && (
                    <div style={{
                        color: 'var(--accent-danger)',
                        marginTop: '1rem',
                        fontSize: '0.875rem',
                        padding: '0.75rem',
                        background: 'rgba(255, 61, 87, 0.1)',
                        borderRadius: '8px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                            <AlertTriangle size={16} /> {error}
                        </div>
                    </div>
                )}

                <input
                    ref={fileInput}
                    type="file" accept=".csv,.xlsx,.xls,.parquet,.json,.tsv" onChange={handleInputChange}
                    multiple
                    style={{ display: 'none' }}
                />

                {/* Feature highlights */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '1rem',
                    marginTop: '2rem',
                }}>
                    {[
                        { icon: <BarChart3 size={28} color="var(--accent-primary)" />, title: 'Deep Profiling', desc: 'Every column analyzed' },
                        { icon: <BrainCircuit size={28} color="var(--accent-primary)" />, title: 'ML Pipeline', desc: 'Clustering, anomalies, forecasting' },
                        { icon: <Lightbulb size={28} color="var(--accent-warning)" />, title: 'Smart Insights', desc: 'ROI-ranked actions' },
                    ].map((f) => (
                        <div key={f.title} style={{
                            textAlign: 'center',
                            padding: '1rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                        }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{f.icon}</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>{f.title}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{f.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
