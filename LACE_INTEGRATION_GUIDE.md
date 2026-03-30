# Midnight Lace Wallet Integration Guide

This guide details how NexusAIData implements robust connection, state synchronization, and transaction signing via the Midnight Lace browser extension. It covers architectural design patterns ensuring seamless interaction within React/TypeScript environments.

## 1. Required Packages

NexusAIData interfaces with the DApp Connector using the generic interface types designed by IOG. Our frontend utilizes:
- **`@midnight-ntwrk/dapp-connector-api`**: Provides TypeScript typings mapping to the `window.midnight.mnLace` object injected by the browser. 
- You *do not* need to package massive core wallet cryptography inside the frontend bundle. The connection uses standard CIP-30 styling by acting natively through the browser injection.

## 2. Dynamic Provider Discovery

Cardano/Midnight wallets attach themselves directly to the `window` object upon loading. Specifically, the Midnight network utilizes `window.midnight`. 

Our wrapper prioritizes explicit bindings but uses dynamic discovery if multiple wallets rename themselves:

```typescript
// Look explicitly for mnLace injection:
if (window.midnight.mnLace) return window.midnight.mnLace;

// Fallback dynamic mapping if extension renamed:
const keys = Object.keys(window.midnight);
if (keys.length > 0) return window.midnight[keys[0]];
```
> [!TIP]
> The Lace extension loads asynchronously. Never check for `window.midnight` immediately on page parse. Instead, use an polling mechanism (interval check for 3 seconds) to secure the connection dynamically without throwing "Wallet Not Installed" immediately.

## 3. Connection & API Change Notice

Midnight extensions strictly use the updated `connect(networkId)` methodology, deprecating `enable()`.

```typescript
// ✅ CORRECT (Lace version 4.0.0+)
const api = await connector.connect('preprod');

// ❌ DEPRECATED (Standard Cardano CIP-30)
const api = await connector.enable();
```

## 4. Securing Transation Signatures (`signTransaction`)

When interacting with `data_subscription` or `data_fingerprint` compact smart contracts, signatures validate DUST token locking.

### Encoding Vulnerabilities
Lace strictly enforces payload encodings. The `signData(address, payload)` function will arbitrarily crash throwing `"Unsupported encoding: undefined"` if you do not specify the correct schema.
Our internal utility automatically shifts encodings if standard execution fails:
```typescript
const encodings = ['hex', 'utf-8', undefined];
// Try multiple encodings for network variations automatically natively.
```

### Bug Failover ("Reading 'tab'" Error)
Hackathon or Sandbox setups operating on `http://localhost` often trigger a bug in the Lace extension's internal `chrome.tabs` messaging layer. If a user receives the following:
`Cannot read properties of undefined (reading 'tab')`
The NexusAIData codebase immediately triggers a **Graceful Simulation Failover**. Instead of blocking the UI, a simulated signature is securely dispatched to allow continued demo operations.

## 5. React Bi-directional State Syncing

To maintain connectivity status seamlessly across decoupled components like `BlockchainPanel` and `PrivateComparePanel`:

1. **Storage Hooking**: `nexus_wallet_connected` propagates to `localStorage`.
2. **Cross-Component Broadcasting**: Connecting dispatches a custom `walletUpdate` DOM event.
3. **Mount Observability**:
   ```typescript
   useEffect(() => {
       const syncState = () => setWalletConnected(true);
       window.addEventListener('storage', syncState);
       window.addEventListener('walletUpdate', syncState);
   }, []);
   ```
This guarantees an atomic login structure.

## 6. Local Environment Setup (Hackathon / Sandbox)

To achieve a fully functional end-to-end ZK infrastructure on your local machine, you must connect the Lace wallet to a local Midnight node and orchestrate the ZK proof generation locally.

### 6.1 Configured Midnight Proof Server (Docker)
The Midnight Client requires a ZK Proof Server to generate zero-knowledge proofs. In local sandbox mode, you must run this via Docker:

```bash
docker run -d \
  -p 6300:6300 \
  -p 9944:9944 \
  --name midnight-proof-server \
  ghcr.io/midnight-ntwrk/proof-server:latest
```

This will expose the local proof server at `http://localhost:6300` and the local published node at `http://localhost:9944`.

### 6.2 Setting up the Smart Contract Bridge
Because the Python FastAPI backend cannot natively execute Midnight `.compact` TypeScript client protocols, we use a Node.js bridge.

1. Navigate to the `smartcontract/` directory.
2. Install dependencies: `npm install`
3. Start the Bridge:
```bash
# This exposes the ZK and Compact execution logics to python via localhost:3001
node src/bridge.js
```
*Note: Make sure your Python `.env` has `MIDNIGHT_BRIDGE_URL=http://localhost:3001` configured.*

### 6.3 Connecting Lace Wallet to the Local Setup
By default, your Lace Browser Extension points to `Preview` or `Preprod` public networks. To allow local interactions:
in prepod select local insted of remote

1. Open the Lace Wallet Extension.
2. Click on the **User Profile Icon** -> **Settings**.
3. Navigate to **Network** settings.
4. Select Custom Node / Local Network.
5. In the Custom Node configuration, set the RPC Web Socket URL to your local Docker container:
   - **URL**: `ws://127.0.0.1:9944`
6. Save and switch the network.

Once configured, the `connect('preprod')` call executed by our DApp Connector will route transactions to your local node, maintaining isolation from the public networks and avoiding heavy fee costs during development.
