/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LUMINA_API_KEY: string;
  readonly VITE_API_URL: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'plotly.js-dist-min' {
    import Plotly from 'plotly.js';
    export default Plotly;
    export * from 'plotly.js';
}

interface Window {
    midnight?: {
        mnLace: {
            connect: (networkId: string) => Promise<any>;
            serviceUriConfig: () => Promise<any>;
            getConnectionStatus?: () => Promise<string>;
        };
    };
    cardano?: Record<string, any>;
}
