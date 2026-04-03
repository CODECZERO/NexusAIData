import React, { useState, useEffect } from 'react';
import { BrainCircuit } from 'lucide-react';
import { healthCheck } from '../api';

const FACTS = ["Waking up the Nexus Analytics neural engines...", "Allocating deep learning workers...", "Fetching the latest ML modules...", "Did you know? Data Science was called'the sexiest job of the 21st century'by HBR.", "Loading prescriptive analytic engines...", "Initializing the DataFrame acceleration layer...", "Did you know? 90% of the world's data was generated in just the last 2 years.", "Connecting to the Llama-3.3 70B inference server...", "Booting up the automated quality audit system...", "Did you know? Poor data quality costs the US economy $3.1 trillion per year.", "Warming up the Python backend server...", "Just a moment longer! Cloud resources are spinning up...",
];

export function BackendWakeupLoader({ children }: { children: React.ReactNode }) {
    const [isAwake, setIsAwake] = useState<boolean | null>(null);
    const [factIndex, setFactIndex] = useState(0);

    // Initial aggressive wakeup burst specifically for Render
    useEffect(() => {
        Promise.all([
            healthCheck().catch(() => { }),
            healthCheck().catch(() => { }),
            healthCheck().catch(() => { }),
            healthCheck().catch(() => { })
        ]);
    }, []);

    // Poll the backend until it returns 200 OK
    useEffect(() => {
        let isChecking = false;
        let pollTimer: number;

        const checkHealth = async () => {
            if (isChecking) return;
            isChecking = true;
            try {
                const res = await healthCheck();
                if (res && res.status === "healthy") {
                    setIsAwake(true);
                    return; // Stop polling
                }
            } catch (err) {
                // Backend is still asleep or booting up (causing Network Error or 502)
            }
            isChecking = false;
            // Retry in 4 seconds
            pollTimer = window.setTimeout(checkHealth, 4000);
        };

        checkHealth();

        return () => {
            window.clearTimeout(pollTimer);
        };
    }, []);

    // Rotate the facts every 4 seconds
    useEffect(() => {
        if (isAwake) return;
        const factInterval = window.setInterval(() => {
            setFactIndex((prev) => (prev + 1) % FACTS.length);
        }, 4000);
        return () => window.clearInterval(factInterval);
    }, [isAwake]);

    // If backend is verified active, render the app normally
    if (isAwake === true) {
        return <>{children}</>;
    }

    // Otherwise, trap the user in the loading screen overlay
    return (
        <div className="wakeup-container">
            <div className="wakeup-card">
                <div className="wakeup-brand">
                    <span className="wakeup-logo">
                        <BrainCircuit size={48} color="var(--accent-primary)" strokeWidth={1.5} />
                    </span>
                    <span className="wakeup-title">Nexus Analytics</span>
                </div>

                <h2 className="wakeup-heading">Starting up the Cloud Engine</h2>
                <p className="wakeup-subheading">Because Nexus hosts heavy Python data models on a free cloud tier, it can take 2-3 minutes to spin up on the first visit.</p>

                <div className="wakeup-loader">
                    <div className="wakeup-spinner"></div>
                    <div className="wakeup-pulse"></div>
                </div>

                <div className="wakeup-fact-box">
                    <p className="wakeup-fact-text fade-transition" key={factIndex}>
                        {FACTS[factIndex]}
                    </p>
                </div>
            </div>
        </div>
    );
}
