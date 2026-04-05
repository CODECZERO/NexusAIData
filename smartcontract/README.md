# NexusAIData — Midnight Smart Contracts

Privacy-preserving smart contracts for the NexusAIData decentralized data marketplace, built on the **Midnight Network** using the **Compact** contract language.

## 📁 Structure

```
smartcontract/
├── contracts/                    # Compact smart contracts (.compact)
│   ├── data_fingerprint.compact  # ZK dataset fingerprint registry
│   ├── data_bounty.compact       # Trustless data bounty clean rooms
│   └── audit_proof.compact       # Verifiable audit proofs
├── src/                          # TypeScript SDK client
│   ├── config.ts                 # Network configuration
│   ├── midnight-client.ts        # SDK client (deploy, call, verify)
│   ├── witnesses.ts              # Off-chain witness implementations
│   └── deploy.ts                 # Deployment script
├── package.json
├── tsconfig.json
└── .env.example
```

## 🏗️ Architecture

### Compact Contracts → Midnight Testnet

Each `.compact` file follows Midnight's privacy model:

| Component | Visibility | Purpose |
|---|---|---|
| **Ledger** | Public (on-chain) | Commitments, hashes, status flags |
| **Circuit** | ZK-compiled | Entry points that generate ZK proofs |
| **Witness** | Private (off-chain) | Local computation on sensitive data |

### Data Flow

```
User's Local Machine                    Midnight Network
┌──────────────────────┐                ┌──────────────────────┐
│  Raw Dataset (CSV)   │                │  Public Ledger       │
│  ↓                   │                │  • fingerprint hash  │
│  Witness Functions   │  ZK Proof →    │  • owner commitment  │
│  (private compute)   │ ────────────→  │  • schema hash       │
│  ↓                   │                │  • row bucket        │
│  Proof Server        │                │  • bounty status     │
│  (ZK circuit exec)   │  ← Verify      │  • audit proofs      │
└──────────────────────┘                └──────────────────────┘
```

## 🚀 Setup

### Prerequisites
- Node.js ≥ 18
- Midnight Proof Server ([install guide](https://docs.midnight.network))
- Lace Wallet with tDUST tokens

### Installation
```bash
cd smartcontract
npm install
cp .env.example .env
# Edit .env with your wallet seed and network config
```

### Compile & Deploy
```bash
# Compile Compact contracts (requires compactc CLI)
npm run compile:contracts

# Deploy to testnet
npm run deploy:testnet
```

## 📋 Contracts

### 1. DataFingerprint (`data_fingerprint.compact`)
Register and verify dataset ownership using ZK proofs.

**Circuits:**
- `register_fingerprint` — Commit dataset structure to chain (ZK proof)
- `verify_ownership` — Prove you own a fingerprint without revealing identity
- `get_fingerprint_info` — Read public metadata (no proof needed)

### 2. DataBounty (`data_bounty.compact`)
Create and claim trustless data bounties via clean room verification.

**Circuits:**
- `create_bounty` — Post a bounty with requirements and DUST reward
- `claim_bounty` — Prove dataset similarity via ZK (data never leaves device)
- `get_bounty_info` — Read bounty details

### 3. AuditProof (`audit_proof.compact`)
Generate on-chain verifiable audit proofs for data processing pipelines.

**Circuits:**
- `submit_audit` — Prove a pipeline was executed correctly (ZK integrity proof)
- `verify_audit` — Verify an existing audit proof
- `get_audit_stats` — Read global audit counters

## 🔐 Privacy Guarantees

| What's Private | What's Public |
|---|---|
| Raw dataset content | Fingerprint commitment (hash) |
| Column names & values | Schema hash (structural signature) |
| Exact row count | Row count bucket (e.g., "1K-10K") |
| User's real identity | Anonymous ZK identity |
| Analysis results | Audit verification status |
| Similarity computation | Bounty claim success/failure |
