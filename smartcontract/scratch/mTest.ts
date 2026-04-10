import dotenv from 'dotenv';
dotenv.config();
import * as path from 'path';
import * as fs from 'fs';
import { WebSocket } from 'ws';

// Required for wallet synchronization in Node.js environment
// @ts-expect-error
globalThis.WebSocket = WebSocket;

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles, type AccountKey, type Role } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, type DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
    UnshieldedWallet,
    createKeystore,
    PublicKey,
    InMemoryTransactionHistoryStorage,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { configDotenv } from 'dotenv';


export interface MidnightConfig {
    network: string;
    networkId: NetworkId;
    nodeUrl: string;
    indexerUrl: string;
    indexerWsUrl: string;
    proofServerUrl: string;
    walletSeed: string;
}

export interface MidnightProviders {
    walletProvider: any;
    zkConfigProvider: NodeZkConfigProvider;
    proofProvider: any;
    publicDataProvider: any;
    midnightProvider: { networkId: NetworkId };
}

function deriveRoleKey(accountKey: AccountKey, role: Role, addressIndex: number = 0): Buffer {
    const result = accountKey.selectRole(role).deriveKeyAt(addressIndex);
    if (result.type === 'keyDerived') {
        return Buffer.from(result.key);
    }
    return deriveRoleKey(accountKey, role, addressIndex + 1);
}

function deriveAllKeys(seed: Uint8Array) {
    const hdWallet = HDWallet.fromSeed(seed);
    if (hdWallet.type !== 'seedOk') {
        throw new Error('Failed to derive HD wallet from seed.');
    }

    const account = hdWallet.hdWallet.selectAccount(0);
    const shieldedSeed = deriveRoleKey(account, Roles.Zswap);
    const dustSeed = deriveRoleKey(account, Roles.Dust);
    const unshieldedKey = deriveRoleKey(account, Roles.NightExternal);

    hdWallet.hdWallet.clear();

    return {
        shielded: {
            seed: shieldedSeed,
            keys: ledger.ZswapSecretKeys.fromSeed(shieldedSeed),
        },
        dust: {
            seed: dustSeed,
            key: ledger.DustSecretKey.fromSeed(dustSeed),
        },
        unshielded: unshieldedKey,
    };
}

export class MidnightClient {
    public config: MidnightConfig;
    private isConnected: boolean = false;
    private providers: MidnightProviders | null = null;
    private _wallet: WalletFacade | null = null;
    private _identity: Uint8Array | null = null;
    private _cachedAddress: string | null = null;

    isWalletReady(): boolean {
        return this.isConnected;
    }

    constructor(networkId?: string) {
        const netId = (networkId || process.env.MIDNIGHT_NETWORK_ID || 'preprod') as NetworkId;

        if (process.env.MIDNIGHT_DEBUG === 'true') {
            process.env.DEBUG = 'midnight:*,effect:*';
        }

        this.config = {
            network: process.env.MIDNIGHT_NETWORK || netId,
            networkId: netId,
            nodeUrl: (
                process.env.MIDNIGHT_NODE_URL || 'https://rpc.preprod.midnight.network'
            ).replace(/\/$/, ''),
            indexerUrl: (
                process.env.MIDNIGHT_INDEXER_URL ||
                'https://indexer.preprod.midnight.network/api/v4/graphql'
            ).replace(/\/$/, ''),
            indexerWsUrl:
                process.env.MIDNIGHT_INDEXER_WS_URL ||
                'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
            proofServerUrl: (
                process.env.MIDNIGHT_PROOF_SERVER_URL || 'http://localhost:6300'
            ).replace(/\/$/, ''),
            walletSeed: process.env.MIDNIGHT_WALLET_SEED || '',
        };
    }

    async connect(): Promise<void> {
        if (this.isConnected) return;

        console.log(`[MidnightClient] Connecting to ${this.config.networkId}...`);

        try {
            setNetworkId(this.config.networkId);
        } catch (e: any) {
            console.warn(`[MidnightClient] Warning: Failed to set network ID: ${e.message}`);
        }

        if (!this.config.walletSeed) {
            throw new Error('[MidnightClient] Wallet seed is missing. Set MIDNIGHT_WALLET_SEED in your .env file.');
        }

        try {
            const seedBytes = Buffer.from(mnemonicToSeedSync(this.config.walletSeed));
            const derivedKeys = deriveAllKeys(seedBytes);
            seedBytes.fill(0);

            const unshieldedKeystore = createKeystore(
                derivedKeys.unshielded,
                this.config.networkId
            );

            this._identity = PublicKey.fromKeyStore(unshieldedKeystore).publicKey;

            const walletConfig: DefaultConfiguration = {
                networkId: this.config.networkId,
                costParameters: {
                    feeBlocksMargin: 5,
                },
                relayURL: new URL(this.config.nodeUrl.replace(/^http/, 'ws')),
                provingServerUrl: new URL(this.config.proofServerUrl),
                indexerClientConnection: {
                    indexerHttpUrl: this.config.indexerUrl,
                    indexerWsUrl: this.config.indexerWsUrl,
                },
                txHistoryStorage: new InMemoryTransactionHistoryStorage(),
            };

            console.log(`[MidnightClient] Initializing WalletFacade...`);

            const facade = await WalletFacade.init({
                configuration: walletConfig,
                shielded: (config) =>
                    ShieldedWallet(config).startWithSecretKeys(derivedKeys.shielded.keys),
                unshielded: (config) =>
                    UnshieldedWallet(config).startWithPublicKey(
                        PublicKey.fromKeyStore(unshieldedKeystore)
                    ),
                dust: (config) =>
                    DustWallet(config).startWithSecretKey(
                        derivedKeys.dust.key,
                        ledger.LedgerParameters.initialParameters().dust
                    ),
            });

            await facade.start(derivedKeys.shielded.keys, derivedKeys.dust.key);

            console.log(`[MidnightClient] Awaiting wallet synchronization (this may take a few minutes)...`);
            const syncedState = await facade.waitForSyncedState();
            console.log(`[MidnightClient] Wallet synchronized.`);
            console.log(`[MidnightClient] Shielded balance:`, syncedState.shielded.balances);
            console.log(`[MidnightClient] Unshielded balance:`, syncedState.unshielded.balances);
            console.log(`[MidnightClient] DUST balance:`, syncedState.dust.totalCoins);

            this._wallet = facade;

            const defaultZkPath = path.join(process.cwd(), 'contracts', 'managed');
            this.providers = {
                walletProvider: this.createWalletProvider(
                    facade,
                    derivedKeys.shielded.keys,
                    derivedKeys.dust.key
                ),
                zkConfigProvider: new NodeZkConfigProvider(defaultZkPath),
                proofProvider: httpClientProofProvider(
                    this.config.proofServerUrl,
                    new NodeZkConfigProvider(defaultZkPath)
                ),
                publicDataProvider: indexerPublicDataProvider(
                    this.config.indexerUrl,
                    this.config.indexerWsUrl
                ),
                midnightProvider: { networkId: this.config.networkId },
            };

            this.isConnected = true;
            console.log(`[MidnightClient] Ready.`);
        } catch (error) {
            console.error(`[MidnightClient] Initialization failed:`, error);
            throw error;
        }
    }

    private createWalletProvider(
        facade: WalletFacade,
        shieldedKeys: ledger.ZswapSecretKeys,
        dustKey: ledger.DustSecretKey
    ) {
        return {
            getCoinPublicKey: async () => {
                const state = await facade.waitForSyncedState();
                if (!state.shielded.address) {
                    throw new Error('Shielded address not materialized.');
                }
                return state.shielded.address.coinPublicKeyString();
            },

            getEncryptionPublicKey: async () => {
                const state = await facade.waitForSyncedState();
                if (!state.shielded.address) {
                    throw new Error('Shielded address not materialized.');
                }
                return state.shielded.address.encryptionPublicKeyString();
            },

            balanceTx: async (tx: ledger.Transaction, ttl?: Date) => {
                const recipe = await facade.balanceUnprovenTransaction(
                    tx,
                    { shieldedSecretKeys: shieldedKeys, dustSecretKey: dustKey },
                    { ttl: ttl ?? new Date(Date.now() + 20 * 60 * 1000) }
                );
                return facade.finalizeRecipe(recipe);
            },

            submitTx: async (tx: ledger.FinalizedTransaction) =>
                facade.submitTransaction(tx),
        };
    }

    async deployContract(
        contractName: string,
        artifact: any
    ): Promise<{ address: string; transactionId: string }> {
        if (!this.isConnected || !this.providers) {
            throw new Error('Client not connected. Call connect() first.');
        }

        const snakeCaseName = contractName
            .replace(/([a-z])([A-Z])/g, '$1_$2')
            .toLowerCase();

        const zkConfigPath = path.resolve(
            process.cwd(),
            `contracts/managed/${snakeCaseName}`
        );

        const contractProviders = {
            ...this.providers,
            zkConfigProvider: new NodeZkConfigProvider(zkConfigPath),
            proofProvider: httpClientProofProvider(
                this.config.proofServerUrl,
                new NodeZkConfigProvider(zkConfigPath)
            ),
        };

        const { CompiledContract } = await import('@midnight-ntwrk/compact-js');

        let cc = CompiledContract.make(snakeCaseName, artifact.Contract);
        cc = (CompiledContract.withWitnesses as any)(this.buildWitnesses(contractName))(cc);
        cc = (CompiledContract.withCompiledFileAssets as any)(zkConfigPath)(cc);

        const deployed = await deployContract(contractProviders as any, {
            compiledContract: cc,
            privateStateId: `${snakeCaseName}_state`,
            initialPrivateState: {},
        } as any);

        return {
            address: deployed.deployTxData.public.contractAddress,
            transactionId: deployed.deployTxData.public.txId,
        };
    }

    private buildWitnesses(
        contractName: string
    ): Record<string, (...args: any[]) => any> {
        const WITNESS_MAP: Record<string, string[]> = {
            DataFingerprint: [
                'get_dataset_commitment',
                'get_owner_identity',
                'compute_schema_hash',
                'compute_fingerprint_id',
                'get_row_bucket',
            ],
            DataBounty: [
                'generate_bounty_id',
                'compute_similarity_score',
                'get_claimer_identity',
                'get_creator_identity',
            ],
            AuditProof: [
                'compute_audit_id',
                'compute_pipeline_hash',
                'verify_data_integrity',
                'get_session_commitment',
            ],
            PlatformEscrow: [
                'get_owner_identity',
                'generate_deposit_id',
                'get_depositor_identity',
            ],
        };

        const witnessNames = WITNESS_MAP[contractName] || [];
        const stubs: Record<string, any> = {};

        for (const name of witnessNames) {
            stubs[name] = (..._args: any[]) => {
                const identityWitnesses = [
                    'get_owner_identity',
                    'get_depositor_identity',
                    'get_claimer_identity',
                    'get_creator_identity',
                ];
                if (identityWitnesses.includes(name)) {
                    if (this._identity) return this._identity;
                    throw new Error(
                        `Identity not initialized when witness '${name}' was called.`
                    );
                }
                throw new Error(
                    `Stub witness '${name}' was called but has no implementation.`
                );
            };
        }

        return stubs;
    }

    async setupProviders(): Promise<void> {
        await this.connect();
    }

    async getWalletAddress(): Promise<string | null> {
        if (!this.config.walletSeed) return null;
        if (this._cachedAddress) return this._cachedAddress;

        const seedBytes = Buffer.from(mnemonicToSeedSync(this.config.walletSeed));
        const hdWallet = HDWallet.fromSeed(seedBytes);

        if (hdWallet.type !== 'seedOk') return null;

        const account = hdWallet.hdWallet.selectAccount(0);
        const unshieldedKey = deriveRoleKey(account, Roles.NightExternal);
        hdWallet.hdWallet.clear();
        seedBytes.fill(0);

        this._cachedAddress = createKeystore(unshieldedKey, this.config.networkId)
            .getBech32Address()
            .toString();

        return this._cachedAddress;
    }

    async stop(): Promise<void> {
        if (this._wallet) {
            await this._wallet.stop();
            this._wallet = null;
            this.providers = null;
            this.isConnected = false;
            console.log('[MidnightClient] Stopped.');
        }
    }
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log('=== Midnight Client Test ===\n');

    const client = new MidnightClient('preprod');

    // Step 1: derive and print the wallet address (no network needed)
    const address = await client.getWalletAddress();
    console.log('Wallet address:', address ?? 'ERROR: seed missing');

    // Step 2: connect and sync to the network
    await client.connect();

    // Step 3: cleanly shut down
    await client.stop();

    console.log('\n=== Done ===');
}

main().catch((err) => {
    console.error('\n[FATAL]', err.message ?? err);
    process.exit(1);
});