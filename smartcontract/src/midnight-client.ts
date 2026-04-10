import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as rx from 'rxjs';
import { WebSocket } from 'ws';

// ── Explicit Environment Injection ──────────────────────────────────────────
// Direction from USER: ensuring full config load via explicit absolute path resolution
const envPath = path.resolve(process.cwd(), '.env');
config({ path: envPath });

// Required for wallet synchronization in Node.js environment
// @ts-expect-error - polyfilling global for SDK
globalThis.WebSocket = WebSocket;

// VERBOSE LOGGING FOR FINAL STABILIZATION
if (process.env.DEBUG_MIDNIGHT === 'true' || process.env.MIDNIGHT_DEBUG === 'true') {
  process.env.DEBUG = 'midnight:*,effect:*';
}

console.log(`[MidnightClient] Environment Handshake (v22.8.0):
  - NETWORK: ${process.env.MIDNIGHT_NETWORK ?? 'MISSING'}
  - SEED: ${process.env.MIDNIGHT_WALLET_SEED ? 'OK (Masked)' : 'MISSING'}
  - PROOF_SERVER: ${process.env.MIDNIGHT_PROOF_SERVER_URL ?? 'MISSING'}`);

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, type DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey, InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';

export interface MidnightConfig {
  networkId: NetworkId;
  nodeUrl: string;
  indexerUrl: string;
  indexerWsUrl: string;
  proofServerUrl: string;
  walletSeed: string;
}

export interface ContractArtifact {
  Contract: any; // Opaque compact-js contract definition
}

export interface MidnightProviders {
  walletProvider: {
    getCoinPublicKey: () => Promise<string>;
    getEncryptionPublicKey: () => Promise<string>;
    balanceTx: (tx: ledger.Transaction<any, any, any>, ttl?: Date) => Promise<ledger.FinalizedTransaction>;
    submitTx: (tx: ledger.FinalizedTransaction) => Promise<string>;
  };
  zkConfigProvider: NodeZkConfigProvider<string>;
  proofProvider: ReturnType<typeof httpClientProofProvider>;
  publicDataProvider: ReturnType<typeof indexerPublicDataProvider>;
  midnightProvider: { networkId: NetworkId };
}

interface IndexerTipResponse {
  data?: {
    block?: {
      height?: number | string;
    };
  };
}

export class MidnightClient {
  public config: MidnightConfig;
  private isConnected: boolean = false;
  private providers: MidnightProviders | null = null;
  private _wallet: WalletFacade | null = null;
  private _identity: Uint8Array | null = null;

  isWalletReady(): boolean {
    return this.isConnected;
  }

  constructor(networkId?: string) {
    const netId = (networkId || process.env.MIDNIGHT_NETWORK || 'preprod') as NetworkId;
    this.config = {
      networkId: netId,
      nodeUrl: (process.env.MIDNIGHT_NODE_URL || 'https://rpc.preprod.midnight.network').replace(/\/$/, ''),
      indexerUrl: (process.env.MIDNIGHT_INDEXER_URL || 'https://indexer.preprod.midnight.network/api/v4/graphql').replace(/\/$/, ''),
      indexerWsUrl: (process.env.MIDNIGHT_INDEXER_WS_URL || 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws'),
      proofServerUrl: (process.env.MIDNIGHT_PROOF_SERVER_URL || 'http://localhost:6300').replace(/\/$/, ''),
      walletSeed: process.env.MIDNIGHT_WALLET_SEED || '',
    };
  }

  async connect(): Promise<void> {
    if (this.providers) return;
    console.log(`[MidnightClient] Connecting to ${this.config.networkId} (Full-Stack Fast-Forward Bridge)...`);

    try {
      setNetworkId(this.config.networkId);
    } catch (e: unknown) {
      console.warn(`[MidnightClient] Warning: Failed to set network ID.`);
    }

    if (!this.config.walletSeed) throw new Error('[MidnightClient] Seed missing from .env');

    try {
      const seedBytes = Buffer.from(mnemonicToSeedSync(this.config.walletSeed));
      const hdDerivation = HDWallet.fromSeed(seedBytes);
      if (hdDerivation.type !== 'seedOk') throw new Error(`HD failed`);
      
      const kd = hdDerivation.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
      if (kd.type !== 'keysDerived') throw new Error(`Keys not derived`);
      
      const keys = kd.keys;
      const sSKs = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
      const dSK = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
      const uKS = createKeystore(keys[Roles.NightExternal], this.config.networkId);
      const uPK = PublicKey.fromKeyStore(uKS);
      
      this._identity = uPK.publicKey;

      // 1. TIP DISCOVERY
      console.log(`[MidnightClient] Fetching network tip...`);
      let networkTip = 282800n;
      try {
        const tipResponse = await fetch(this.config.indexerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ block { height } }' })
        });
        const tipData = (await tipResponse.json()) as IndexerTipResponse;
        networkTip = BigInt(tipData.data?.block?.height ?? 282800);
        console.log(`[MidnightClient] Handshake Height: ${networkTip}`);
      } catch (e) { console.warn(`[MidnightClient] Tip discovery bypassed.`); }

      // 2. PERSISTENCE
      const walletAddress = uKS.getBech32Address().toString();
      const dbPath = path.join(process.cwd(), '.midnight-data', `nexus-stable-v22-bridge`);
      if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

      const pStateProvider = levelPrivateStateProvider({
          midnightDbName: dbPath,
          privateStoragePasswordProvider: () => Promise.resolve(process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD || 'nexus-ai-secure-storage-password-2026'),
          accountId: walletAddress
      });

      // 3. FULL-STACK RESTORATION (SCHEMA VALIDATED)
      const unshieldedRestore = JSON.stringify({
        publicKey: {
          publicKey: Buffer.from(uPK.publicKey).toString('hex'),
          addressHex: uPK.addressHex,
          address: uPK.address,
        },
        state: { availableUtxos: [], pendingUtxos: [] },
        protocolVersion: "1",
        networkId: this.config.networkId,
        appliedId: networkTip.toString(),
      });

      const shieldedRestore = JSON.stringify({
        publicKeys: {
          coinPublicKey: sSKs.coinPublicKey,
          encryptionPublicKey: sSKs.encryptionPublicKey,
        },
        state: Buffer.from(new ledger.ZswapLocalState().serialize()).toString('hex'),
        protocolVersion: "1",
        offset: networkTip.toString(),
        networkId: this.config.networkId,
        coinHashes: {},
      });

      const walletConfig: DefaultConfiguration = {
        networkId: this.config.networkId,
        costParameters: { feeBlocksMargin: 10 },
        indexerClientConnection: { 
          indexerHttpUrl: this.config.indexerUrl, 
          indexerWsUrl: this.config.indexerWsUrl,
          keepAlive: 60000 
        },
        provingServerUrl: new URL(this.config.proofServerUrl),
        relayURL: new URL(this.config.nodeUrl.replace(/^http/, 'ws')),
        txHistoryStorage: new InMemoryTransactionHistoryStorage()
      } as unknown as DefaultConfiguration;

      console.log(`[MidnightClient] Initializing Full-Stack Restoration Bridge...`);
      const facade = await WalletFacade.init({
        configuration: walletConfig,
        shielded: (config) => ShieldedWallet(config, pStateProvider).restore(shieldedRestore),
        unshielded: (config) => UnshieldedWallet(config, pStateProvider).restore(unshieldedRestore),
        dust: (config) => DustWallet(config, pStateProvider).startWithSecretKey(dSK, ledger.LedgerParameters.initialParameters().dust),
      });

      await new Promise(r => setTimeout(r, 1000));
      await facade.start(sSKs, dSK);

      console.log(`[MidnightClient] Awaiting Ready Breakthrough...`);
      let isSyncedAtTip = false;
      let syncAttempts = 0;
      while (!isSyncedAtTip && syncAttempts < 250) {
        const state = await rx.firstValueFrom(facade.state());
        const uH = state.unshielded.progress.appliedId;
        const sH = state.shielded.progress.appliedIndex;
        const sAddr = state.shielded.address;
        const netTip = networkTip;
        
        process.stdout.write(`\r[MidnightClient] Breakthrough — U:${uH}/${netTip} S:${sH}/${netTip} [Addr=${sAddr ? 'OK' : 'WAIT'}] [Synced=${state.isSynced}]        `);
        
        // BREAKTHROUGH CONDITION: Require heights at tip AND materialized shielded address
        if ((state.isSynced || (uH >= netTip - 2n && sH >= netTip - 2n)) && sAddr) {
          isSyncedAtTip = true; 
          console.log('\n[MidnightClient] [OK] Sync Bridge Breakthrough achieved.');
        } else { 
          syncAttempts++; 
          await new Promise(r => setTimeout(r, 2000)); 
        }
      }

      this._wallet = facade;
      const defaultZkPath = path.join(process.cwd(), 'contracts', 'managed');
      this.providers = {
        walletProvider: this.createWalletProvider(facade, sSKs, dSK),
        zkConfigProvider: new NodeZkConfigProvider<string>(defaultZkPath),
        proofProvider: httpClientProofProvider(this.config.proofServerUrl, new NodeZkConfigProvider<string>(defaultZkPath)),
        publicDataProvider: indexerPublicDataProvider(this.config.indexerUrl, this.config.indexerWsUrl),
        midnightProvider: { networkId: this.config.networkId },
      };
      this.isConnected = true;
    } catch (error) { 
        console.error(`[MidnightClient] Initialization Fatal:`, error instanceof Error ? error.message : String(error)); 
        throw error; 
    }
  }

  private createWalletProvider(facade: WalletFacade, sSKs: ledger.ZswapSecretKeys, dSK: ledger.DustSecretKey) {
    return {
      getCoinPublicKey: async () => {
        const state = await rx.firstValueFrom(facade.state());
        if (!state.shielded.address) throw new Error("Shielded address not materialized");
        return state.shielded.address.coinPublicKeyString();
      },
      getEncryptionPublicKey: async () => {
        const state = await rx.firstValueFrom(facade.state());
        if (!state.shielded.address) throw new Error("Shielded address not materialized");
        return state.shielded.address.encryptionPublicKeyString();
      },
      balanceTx: async (tx: ledger.Transaction<any, any, any>, ttl?: Date) => {
        const recipe = await facade.balanceUnboundTransaction(tx, { shieldedSecretKeys: sSKs, dustSecretKey: dSK }, { ttl: ttl ?? new Date(Date.now() + 20 * 60 * 1000) });
        return facade.finalizeRecipe(recipe);
      },
      submitTx: async (tx: ledger.FinalizedTransaction) => facade.submitTransaction(tx)
    };
  }

  async deployContract(contractName: string, artifact: ContractArtifact): Promise<{ address: string; transactionId: string }> {
    if (!this.isConnected || !this.providers || !this._wallet) throw new Error(`Providers not initialized.`);
    const snakeCaseName = contractName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    const zkConfigPath = path.resolve(process.cwd(), `contracts/managed/${snakeCaseName}`);
    const contractProviders = { 
      ...this.providers, 
      zkConfigProvider: new NodeZkConfigProvider<string>(zkConfigPath), 
      proofProvider: httpClientProofProvider(this.config.proofServerUrl, new NodeZkConfigProvider<string>(zkConfigPath)) 
    };
    const { CompiledContract } = await import('@midnight-ntwrk/compact-js');
    let cc = CompiledContract.make(snakeCaseName, artifact.Contract);
    
    type CompactCompatible = {
      withWitnesses: (w: Record<string, Function>) => (c: any) => any;
      withCompiledFileAssets: (p: string) => (c: any) => any;
    };
    
    const CC_API = CompiledContract as unknown as CompactCompatible;
    cc = CC_API.withWitnesses(this.buildWitnesses(contractName))(cc);
    cc = CC_API.withCompiledFileAssets(zkConfigPath)(cc);
    
    // @ts-ignore - variance in generic transactions
    const deployed = await deployContract(contractProviders, { 
      compiledContract: cc, 
      privateStateId: `${snakeCaseName}_state`, 
      initialPrivateState: {} 
    } as any);
    
    return { 
      address: deployed.deployTxData.public.contractAddress, 
      transactionId: deployed.deployTxData.public.txId 
    };
  }

  private buildWitnesses(contractName: string): Record<string, (...args: unknown[]) => unknown> {
    const WITNESS_MAP: Record<string, string[]> = { 
        DataFingerprint: ['get_dataset_commitment', 'get_owner_identity', 'compute_schema_hash', 'compute_fingerprint_id', 'get_row_bucket'], 
        DataBounty: ['generate_bounty_id', 'compute_similarity_score', 'get_claimer_identity', 'get_creator_identity'], 
        AuditProof: ['compute_audit_id', 'compute_pipeline_hash', 'verify_data_integrity', 'get_session_commitment'], 
        PlatformEscrow: ['get_owner_identity', 'generate_deposit_id', 'get_depositor_identity'] 
    };
    const witnessNames = WITNESS_MAP[contractName] || [];
    const witnesses: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of witnessNames) {
      witnesses[name] = () => {
          if (name === 'get_owner_identity' || name === 'get_depositor_identity' || name === 'get_claimer_identity') {
              if (this._identity) return this._identity;
          }
          throw new Error(`Stub witness '${name}' called.`);
      };
    }
    return witnesses;
  }

  async setupProviders(): Promise<void> { await this.connect(); }
  
  async getWalletAddress(): Promise<string | null> {
    if (!this.config.walletSeed) return null;
    const seedBytes = Buffer.from(mnemonicToSeedSync(this.config.walletSeed));
    const hd = HDWallet.fromSeed(seedBytes);
    if (hd.type === 'seedOk') {
      const kd = hd.hdWallet.selectAccount(0).selectRoles([Roles.NightExternal]).deriveKeysAt(0);
      if (kd.type === 'keysDerived') return createKeystore(kd.keys[Roles.NightExternal], this.config.networkId).getBech32Address().toString();
    }
    return null;
  }
}

export const midnightClient = new MidnightClient();
export default MidnightClient;
