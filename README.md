# NexusAIData — Midnight Privacy-First Data Ecosystem

A premium analytics platform transformed into a decentralized, privacy-preserving data exchange built on the Midnight Blockchain. Sensitive AI training data is handled with Zero-Knowledge (ZK) confidentiality — no raw data ever leaves the user's device.

---

## Architecture

```
NexusAIData/
├── smartcontract/                     # Midnight Compact Smart Contracts
│   ├── contracts/
│   │   ├── data_fingerprint.compact   # ZK dataset fingerprint registry
│   │   ├── data_bounty.compact        # Trustless data bounty clean rooms
│   │   ├── audit_proof.compact        # Verifiable audit proofs
│   │   ├── data_provenance.compact    # Data lineage tracking
│   │   └── data_subscription.compact  # DUST-based data monetization
│   └── src/
│       ├── bridge.ts                  # Express bridge to Midnight SDK
│       ├── midnight-client.ts         # SDK client (deploy, call, verify)
│       └── deploy.ts                  # Testnet deployment script
├── backend/                           # FastAPI Backend
│   ├── blockchain/                    # ZK engine, identity, ledger
│   ├── services/                      # Business logic + Midnight bridge
│   └── routers/                       # API endpoints
└── frontend/                          # React/TypeScript UI
    └── src/components/                # Privacy panel, blockchain UI
```

---

## Midnight Hackathon Criteria Alignment

### 1. Innovation & Originality
- **ZK Data Bounties (Clean Rooms)**: Post bounties for data matching a fingerprint. Claims are verified MATHEMATICALLY via ZK proofs — the seeker only pays for relevant data without seeing it.
- **ZK Data Subscriptions (Monetization)**: Buyers trustlessly lock DUST tokens to unlock data decryption keys with the strict guarantee that the seller holds the real underlying dataset via ZK proofs.
- **Trustless Benchmarking**: Benchmark proprietary data against global standards anonymously.

### 2. Real Use of Midnight Network
- **5 Compact Smart Contracts** deployed to Midnight:
  - `data_fingerprint.compact` — Privacy-preserving dataset registry
  - `data_bounty.compact` — Confidential bounty clean rooms with ZK similarity verification
  - `audit_proof.compact` — On-chain verifiable PII/Compliance attestations
  - `data_provenance.compact` — Multi-parent data lineage tracking
  - `data_subscription.compact` — Trustless dataset monetization ecosystem
- **SDK Integration**: TypeScript client utilizing the new generic `window.midnight` injection provider API.
- **Browser Wallet Connect**: Direct integration with the Lace Wallet DApp Connector allowing users to sign on-chain transactions directly from the UI.
- **Midnight Proof Server**: Local ZK proof generation for circuit execution

### 3. Integration of Privacy Features
- **Zero-Knowledge Proofs**: Authenticate dataset ownership and verify bounty claims without revealing raw data. Compact circuits compile to ZK circuits automatically.
- **Selective Disclosure**: Verifiable Credentials (VCs) allow attestation badges (e.g., "HIPAA_COMPLIANT") without exposing underlying schema.
- **Anonymous Identity**: Session-bound cryptographic commitments — no PII is ever stored.
- **Private Witnesses**: Off-chain computation ensures raw data never touches the network.

### 5. Real-world Applicability
- Solves the **Data Silo Problem** in AI/ML: enterprises collaborate on sensitive datasets (Medical, Financial) by exchanging **ZK Fingerprints** instead of raw CSVs.
- **Regulatory Compliance**: Audit proofs provide HIPAA/GDPR-compliant verification trails.

### 6. UI/UX Experience
- **Glassmorphic Privacy Panel**: Dedicated blockchain operations dashboard
- **Real-time ZK Status**: Proof generation indicators, commitment hashes, HSL-derived anonymous avatars
- **ZK-Audit Verification**: Visual proof verification with on-chain transaction references

---

## Privacy Model

| What's Private (Never Leaves Device) | What's Public (On-Chain) |
|---|---|
| Raw dataset content (CSV/SQL) | Fingerprint commitment (hash) |
| Column names & values | Schema hash (structural signature) |
| Exact row count | Row count bucket (e.g., "1K-10K") |
| User's real identity | Anonymous ZK identity commitment |
| Analysis results & outputs | Audit verification status |
| Similarity comparison data | Bounty claim success/failure |

---

## Setup & Installation

### Core Infrastructure (Midnight Network)
The bridge server automatically starts the necessary Midnight Docker containers (Node, Indexer, Proof Server) and runs the Express API for the backend.
```bash
cd smartcontract
npm install
cp .env.example .env
npm run bridge
```

### Smart Contracts (Midnight Testnet)
```bash
# Optional: Deploy manually if not testing locally
cd smartcontract
npm run deploy:testnet
```

### Backend (FastAPI)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Frontend (React/Vite)
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables
Copy `.env.example` to `.env` in the root:
```env
BLOCKCHAIN_LEDGER_PATH=./blockchain_ledger.json
MIDNIGHT_IDENTITY_SALT=nexus_midnight_identity_v1_secure
MIDNIGHT_NETWORK=testnet
MIDNIGHT_PROOF_SERVER_URL=http://localhost:6300
MIDNIGHT_BRIDGE_URL=http://localhost:3001
MIDNIGHT_WALLET_SEED=<your-lace-wallet-seed>
```

---

## Smart Contract Circuits

| Contract | Circuit | Privacy | Purpose |
|---|---|---|---|
| `data_fingerprint` | `register_fingerprint` | ZK Proof | Register dataset without exposing content |
| `data_fingerprint` | `verify_ownership` | ZK Proof | Prove ownership without revealing identity |
| `data_bounty` | `create_bounty` | ZK Proof | Post data request with DUST reward |
| `data_bounty` | `claim_bounty` | ZK Proof | Prove dataset matches requirements |
| `audit_proof` | `submit_audit` | ZK Proof | Verify pipeline integrity on-chain |
| `audit_proof` | `verify_audit` | Public | Anyone can verify an audit proof |
| `data_provenance` | `record_lineage` | ZK Proof | Prove derivation relations between datasets |
| `data_subscription` | `create_subscription` | Public | Escrow DUST for access |
| `data_subscription` | `claim_subscription` | ZK Proof | Provider claims DUST by validating fingerprint |

---

## Roadmap

1. **Testnet → Mainnet**: Migrate contracts when Midnight mainnet launches
2. **Multi-Party Computation**: Federated learning via ZK-verified model aggregation
3. **DAG-Based Provenance**: Git-like versioned data lineage on Midnight chain
