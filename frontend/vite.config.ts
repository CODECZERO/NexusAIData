import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Load env file based on `mode` in the current working directory.
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
    const envDir = path.resolve(__dirname, '..')
    const env = loadEnv(mode, envDir, '')
    const targetUrl = env.VITE_API_URL || 'http://localhost:8000'

    return {
        envDir,
        plugins: [react()],
        resolve: {
            alias: {
                // Redirect plotly.js imports to the pre-bundled dist version
                'plotly.js/dist/plotly': path.resolve(__dirname, 'node_modules/plotly.js-dist-min/plotly.min.js'),
                'plotly.js': 'plotly.js-dist-min',
            },
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks: {
                        plotly: ['plotly.js-dist-min'],
                        markdown: ['react-markdown', 'remark-gfm'],
                        vendor: ['react', 'react-dom', 'lucide-react'],
                    },
                },
            },
        },
        server: {
            port: 5173,
            proxy: {
                '/api': {
                    target: targetUrl,
                    changeOrigin: true,
                },
                '/ws': {
                    target: targetUrl.replace(/^http/, 'ws'),
                    ws: true,
                },
            },
        },
    }
})
