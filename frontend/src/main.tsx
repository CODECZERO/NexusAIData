import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { BackendWakeupLoader } from './components/BackendWakeupLoader'
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BackendWakeupLoader>
            <App />
        </BackendWakeupLoader>
    </StrictMode>,
)
