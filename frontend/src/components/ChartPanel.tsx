import { memo } from 'react'
import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
import { BarChart } from 'lucide-react'
const Plot = createPlotlyComponent(Plotly)
import type { ChartConfig } from '../api'

interface Props {
    chart: ChartConfig
    onChartClick?: (data: any) => void
}

export const ChartPanel = memo(function ChartPanel({ chart, onChartClick }: Props) {
    if (chart.chart_type === 'kpi') return null

    // Check if all traces are essentially empty
    const allEmpty = chart.plotly_data?.every((trace: any) => {
        if (trace.type === 'pie') return !trace.labels || trace.labels.length === 0;
        if (trace.type === 'indicator') return false; // KPI cards
        return (!trace.x || trace.x.length === 0) && (!trace.y || trace.y.length === 0);
    }) || false;

    if (!chart.plotly_data || chart.plotly_data.length === 0 || allEmpty) {
        return (
            <div className="chart-panel">
                <div className="chart-panel__title">{chart.title}</div>
                {chart.description && (
                    <div className="chart-panel__description">{chart.description}</div>
                )}
                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--border)', marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', opacity: 0.5 }}>
                        <BarChart size={32} />
                    </div>
                    Insufficient data or variance to render this chart
                </div>
            </div>
        )
    }

    const defaultLayout: any = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#A0AEC0', family: 'DM Sans, sans-serif', size: 11 },
        margin: { l: 50, r: 20, t: 30, b: 40 },
        xaxis: { gridcolor: '#1E2333', zerolinecolor: '#1E2333' },
        yaxis: { gridcolor: '#1E2333', zerolinecolor: '#1E2333' },
        colorway: ['#00E5FF', '#7B2FFF', '#00FF87', '#FF3D57', '#FFB800', '#FF6FD8', '#3D5AFE'],
        showlegend: true,
        legend: { font: { size: 10 }, bgcolor: 'rgba(0,0,0,0)' },
        autosize: true,
        height: (chart.plotly_layout?.height as number) || 350,
    }

    const mergedLayout = { ...defaultLayout, ...(chart.plotly_layout || {}) }

    return (
        <div className="chart-panel">
            <div className="chart-panel__title">{chart.title}</div>
            {chart.description && (
                <div className="chart-panel__description">{chart.description}</div>
            )}
            <div style={{ width: '100%', minHeight: '300px', marginTop: '0.5rem' }}>
                <Plot
                    data={chart.plotly_data}
                    layout={mergedLayout}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                    onClick={(data: any) => {
                        if (onChartClick && data && data.points && data.points.length > 0) {
                            onChartClick(data.points[0])
                        }
                    }}
                    config={{
                        responsive: true,
                        displayModeBar: true,
                        modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d'],
                        displaylogo: false,
                    }}
                />
            </div>
        </div>
    )
})

export default ChartPanel;
