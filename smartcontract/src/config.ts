/**
 * Midnight Network Configuration
 * ===============================
 * Network endpoints, wallet configuration, and contract addresses.
 * Official endpoints from: https://docs.midnight.network
 */

import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Network Environments ─────────────────────────────────────────────────────

export type NetworkId = 'testnet' | 'mainnet' | 'local' | 'preprod' | 'undeployed';

export interface MidnightNetworkConfig {
  networkId: NetworkId;
  indexerUrl: string;
  indexerWsUrl: string;
  nodeUrl: string;
  proofServerUrl: string;
  walletSeed?: string;
  platformEscrowAddress: string;
}

const NETWORK_CONFIGS: Record<NetworkId, MidnightNetworkConfig> = {
  preprod: {
    networkId: 'preprod',
    indexerUrl: process.env.MIDNIGHT_INDEXER_URL || 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWsUrl: process.env.MIDNIGHT_INDEXER_WS_URL || 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    nodeUrl: process.env.MIDNIGHT_NODE_URL || 'https://rpc.preprod.midnight.network',
    proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL || 'http://localhost:6300',
    walletSeed: process.env.MIDNIGHT_WALLET_SEED,
    platformEscrowAddress: process.env.PLATFORM_ESCROW_ADDRESS || '', 
  },
  testnet: {
    networkId: 'testnet',
    indexerUrl: process.env.MIDNIGHT_INDEXER_URL || 'https://indexer.testnet.midnight.network/api/v1/graphql',
    indexerWsUrl: process.env.MIDNIGHT_INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/ws',
    nodeUrl: process.env.MIDNIGHT_NODE_URL || 'https://rpc.testnet.midnight.network',
    proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL || 'https://proof-server.testnet.midnight.network',
    walletSeed: process.env.MIDNIGHT_WALLET_SEED,
    platformEscrowAddress: process.env.PLATFORM_ESCROW_ADDRESS || 'addr_testnet_1qrxu4v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v',
  },
  mainnet: {
    networkId: 'mainnet',
    indexerUrl: process.env.MIDNIGHT_INDEXER_URL || 'https://indexer.midnight.network/api/v1/graphql',
    indexerWsUrl: process.env.MIDNIGHT_INDEXER_WS_URL || 'wss://indexer.midnight.network/ws',
    nodeUrl: process.env.MIDNIGHT_NODE_URL || 'https://rpc.midnight.network',
    proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL || 'https://proof-server.midnight.network',
    walletSeed: process.env.MIDNIGHT_WALLET_SEED,
    platformEscrowAddress: process.env.PLATFORM_ESCROW_ADDRESS || 'addr_1qrxu4v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v',
  },
  local: {
    networkId: 'local',
    indexerUrl: process.env.MIDNIGHT_INDEXER_URL as string,
    indexerWsUrl: process.env.MIDNIGHT_INDEXER_WS_URL as string,
    nodeUrl: process.env.MIDNIGHT_NODE_URL as string,
    proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL as string,
    walletSeed: process.env.MIDNIGHT_WALLET_SEED || 'test test test test test test test test test test test junk',
    platformEscrowAddress: 'addr_local_1qrxu4v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v',
  },
  undeployed: {
    networkId: 'undeployed',
    indexerUrl: process.env.MIDNIGHT_INDEXER_URL as string,
    indexerWsUrl: process.env.MIDNIGHT_INDEXER_WS_URL as string,
    nodeUrl: process.env.MIDNIGHT_NODE_URL as string,
    proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL as string,
    walletSeed: process.env.MIDNIGHT_WALLET_SEED || 'test test test test test test test test test test test junk',
    platformEscrowAddress: 'addr_local_1qrxu4v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v6v',
  },
};

// ── Contract Addresses (populated after deployment) ──────────────────────────

export interface DeployedContracts {
  dataFingerprint: string | null;
  dataBounty: string | null;
  auditProof: string | null;
  platformEscrow: string | null;
}

export const DEPLOYED_CONTRACTS: DeployedContracts = {
  dataFingerprint: process.env.CONTRACT_DATA_FINGERPRINT_ADDRESS || null,
  dataBounty: process.env.CONTRACT_DATA_BOUNTY_ADDRESS || null,
  auditProof: process.env.CONTRACT_AUDIT_PROOF_ADDRESS || null,
  platformEscrow: process.env.CONTRACT_PLATFORM_ESCROW_ADDRESS || null,
};

// Default secure fallback if missing from environment
export const PRIVATE_STATE_PASSWORD = process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD || "nexus-ai-secure-storage-password-2026";

// ── Exports ──────────────────────────────────────────────────────────────────

export function getNetworkConfig(network?: NetworkId): MidnightNetworkConfig {
  const id = network || (process.env.MIDNIGHT_NETWORK as NetworkId) || 'preprod';
  const config = NETWORK_CONFIGS[id];
  if (!config) {
    throw new Error(`Unknown Midnight network: ${id}`);
  }
  return config;
}

export default NETWORK_CONFIGS;
