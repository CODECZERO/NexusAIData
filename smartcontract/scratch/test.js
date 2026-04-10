// ─── Midnight Hello World - Deploy (Single File) ────────────────────────────
// Based on: https://docs.midnight.network/guides/deploy-mn-app
// Run: node test.js
// Requires: npm install (see package.json deps in the docs)
// ─────────────────────────────────────────────────────────────────────────────

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

// Midnight SDK imports
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
    createKeystore,
    InMemoryTransactionHistoryStorage,
    PublicKey,
    UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { CompiledContract } from '@midnight-ntwrk/compact-js';

// ─── WebSocket shim (required for wallet sync in Node.js) ────────────────────
// @ts-expect-error
globalThis.WebSocket = WebSocket;

// ─── Network Config (Preprod) ─────────────────────────────────────────────────
setNetworkId('preprod');

const CONFIG = {
    indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    proofServer: 'http://127.0.0.1:6300',
};

// ─── Contract Path Setup ──────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, 'contracts', 'managed', 'hello-world');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

// Dynamically load the compiled contract
const HelloWorld = await import(pathToFileURL(contractPath).href);

const compiledContract = CompiledContract
    .make('hello-world', HelloWorld.Contract)
    .pipe(
        CompiledContract.withVacantWitnesses,
        CompiledContract.withCompiledFileAssets(zkConfigPath),
    );

// ─── Wallet Utilities ─────────────────────────────────────────────────────────

function deriveKeys(seed) {
    const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
    if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');

    const result = hdWallet.hdWallet
        .selectAccount(0)
        .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
        .deriveKeysAt(0);

    if (result.type !== 'keysDerived') throw new Error('Key derivation failed');

    hdWallet.hdWallet.clear();
    return result.keys;
}

async function createWallet(seed) {
    const keys = deriveKeys(seed);
    const networkId = getNetworkId();

    const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
    const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
    const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

    const walletConfig = {
        networkId,
        indexerClientConnection: {
            indexerHttpUrl: CONFIG.indexer,
            indexerWsUrl: CONFIG.indexerWS,
        },
        provingServerUrl: new URL(CONFIG.proofServer),
        relayURL: new URL(CONFIG.node.replace(/^http/, 'ws')),
    };

    const shieldedWallet = ShieldedWallet(walletConfig)
        .startWithSecretKeys(shieldedSecretKeys);

    const unshieldedWallet = UnshieldedWallet({
        networkId,
        indexerClientConnection: walletConfig.indexerClientConnection,
        txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));

    const dustWallet = DustWallet({
        ...walletConfig,
        costParameters: {
            additionalFeeOverhead: 300_000_000_000_000n,
            feeBlocksMargin: 5,
        },
    }).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
    );

    const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
    await wallet.start(shieldedSecretKeys, dustSecretKey);

    return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

// Signs unshielded transaction intents with the wallet's private keys
function signTransactionIntents(tx, signFn, proofMarker) {
    if (!tx.intents || tx.intents.size === 0) return;

    for (const segment of tx.intents.keys()) {
        const intent = tx.intents.get(segment);
        if (!intent) continue;

        const cloned = ledger.Intent.deserialize(
            'signature', proofMarker, 'pre-binding',
            intent.serialize(),
        );

        const signature = signFn(cloned.signatureData(segment));

        if (cloned.fallibleUnshieldedOffer) {
            const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
                (_, i) => cloned.fallibleUnshieldedOffer.signatures.at(i) ?? signature,
            );
            cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
        }

        if (cloned.guaranteedUnshieldedOffer) {
            const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
                (_, i) => cloned.guaranteedUnshieldedOffer.signatures.at(i) ?? signature,
            );
            cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
        }

        tx.intents.set(segment, cloned);
    }
}

async function createProviders(walletCtx) {
    const state = await Rx.firstValueFrom(
        walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
    );

    const walletProvider = {
        getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
        getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),

        async balanceTx(tx, ttl) {
            const recipe = await walletCtx.wallet.balanceUnboundTransaction(
                tx,
                { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
                { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
            );

            const signFn = (payload) => walletCtx.unshieldedKeystore.signData(payload);

            signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
            if (recipe.balancingTransaction) {
                signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
            }

            return walletCtx.wallet.finalizeRecipe(recipe);
        },

        submitTx: (tx) => walletCtx.wallet.submitTransaction(tx),
    };

    const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

    return {
        privateStateProvider: levelPrivateStateProvider({
            privateStateStoreName: 'hello-world-state',
            walletProvider,
        }),
        publicDataProvider: indexerPublicDataProvider(CONFIG.indexer, CONFIG.indexerWS),
        zkConfigProvider,
        proofProvider: httpClientProofProvider(CONFIG.proofServer, zkConfigProvider),
        walletProvider,
        midnightProvider: walletProvider,
    };
}

// ─── Main Deploy Script ───────────────────────────────────────────────────────

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║        Deploy Hello World to Midnight Preprod                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Guard: contract must be compiled first
    if (!fs.existsSync(contractPath)) {
        console.error('Contract not compiled! Run: compact compile contracts/hello-world.compact contracts/managed/hello-world');
        process.exit(1);
    }

    const rl = createInterface({ input: stdin, output: stdout });

    try {
        // ── Step 1: Wallet Setup ──────────────────────────────────────────────────
        console.log('─── Step 1: Wallet Setup ────────────────────────────────────────\n');
        const choice = await rl.question(
            '  [1] Create new wallet\n  [2] Restore from seed\n  > ',
        );

        const seed = choice.trim() === '2'
            ? await rl.question('\n  Enter your 64-character hex seed: ')
            : toHex(Buffer.from(generateRandomSeed()));

        if (choice.trim() !== '2') {
            console.log(`\n  ⚠️  SAVE THIS SEED (you'll need it later):\n  ${seed}\n`);
        }

        console.log('  Creating wallet...');
        const walletCtx = await createWallet(seed);

        console.log('  Syncing with network...');
        const state = await Rx.firstValueFrom(
            walletCtx.wallet.state().pipe(
                Rx.throttleTime(5000),
                Rx.filter((s) => s.isSynced),
            ),
        );

        const address = walletCtx.unshieldedKeystore.getBech32Address();
        const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;

        console.log(`\n  Wallet Address : ${address}`);
        console.log(`  Balance        : ${balance.toLocaleString()} tNight\n`);

        // ── Step 2: Fund wallet if empty ─────────────────────────────────────────
        if (balance === 0n) {
            console.log('─── Step 2: Fund Your Wallet ────────────────────────────────────\n');
            console.log('  Visit : https://faucet.preprod.midnight.network/');
            console.log(`  Address: ${address}\n`);
            console.log('  Waiting for funds...');

            await Rx.firstValueFrom(
                walletCtx.wallet.state().pipe(
                    Rx.throttleTime(10000),
                    Rx.filter((s) => s.isSynced),
                    Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
                    Rx.filter((b) => b > 0n),
                ),
            );
            console.log('  Funds received!\n');
        }

        // ── Step 3: DUST Token Setup ──────────────────────────────────────────────
        console.log('─── Step 3: DUST Token Setup ────────────────────────────────────\n');
        const dustState = await Rx.firstValueFrom(
            walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
        );

        if (dustState.dust.walletBalance(new Date()) === 0n) {
            const nightUtxos = dustState.unshielded.availableCoins.filter(
                (c) => !c.meta?.registeredForDustGeneration,
            );

            if (nightUtxos.length > 0) {
                console.log('  Registering for DUST generation...');
                const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
                    nightUtxos,
                    walletCtx.unshieldedKeystore.getPublicKey(),
                    (payload) => walletCtx.unshieldedKeystore.signData(payload),
                );
                await walletCtx.wallet.submitTransaction(
                    await walletCtx.wallet.finalizeRecipe(recipe),
                );
            }

            console.log('  Waiting for DUST tokens...');
            await Rx.firstValueFrom(
                walletCtx.wallet.state().pipe(
                    Rx.throttleTime(5000),
                    Rx.filter((s) => s.isSynced),
                    Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
                ),
            );
        }
        console.log('  DUST tokens ready!\n');

        // ── Step 4: Deploy Contract ───────────────────────────────────────────────
        console.log('─── Step 4: Deploy Contract ─────────────────────────────────────\n');
        console.log('  Setting up providers...');
        const providers = await createProviders(walletCtx);

        console.log('  Deploying contract (this may take 30–60 seconds)...\n');
        const deployed = await deployContract(providers, {
            compiledContract,
            privateStateId: 'helloWorldState',
            initialPrivateState: {},
        });

        const contractAddress = deployed.deployTxData.public.contractAddress;
        console.log('  ✅ Contract deployed successfully!\n');
        console.log(`  Contract Address: ${contractAddress}\n`);

        // ── Save deployment info ──────────────────────────────────────────────────
        const deploymentInfo = {
            contractAddress,
            seed,
            network: 'preprod',
            deployedAt: new Date().toISOString(),
        };

        fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
        console.log('  Saved to deployment.json\n');
        console.log('  ⚠️  Add deployment.json to .gitignore — it contains your seed!\n');

        await walletCtx.wallet.stop();
        console.log('─── Deployment Complete! ────────────────────────────────────────\n');
        console.log('  Next: node interact.js  (to call storeMessage circuit)');

    } finally {
        rl.close();
    }
}

main().catch(console.error);