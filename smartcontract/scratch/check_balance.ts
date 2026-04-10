import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from both locations to be safe
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { MidnightClient } from '../src/midnight-client.js';
import { getNetworkConfig } from '../src/config.js';

async function check() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║        Midnight Environment & Wallet Sync Test               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const network = process.env.MIDNIGHT_NETWORK || 'preprod';
    const client = new MidnightClient(network as any);
    
    try {
        console.log(`  Target Network: ${network}`);
        console.log(`  Seed Phrase:    ${process.env.MIDNIGHT_WALLET_SEED?.substring(0, 15)}...`);
        console.log('');

        console.log('─── Step 1: Connecting and Syncing ──────────────────────────────');
        await client.connect();

        console.log('\n─── Step 2: Verifying Identity & Balance ────────────────────────');
        const address = await client.getWalletAddress();
        console.log(`  Derived Address: ${address}`);
        
        // Use the internal wallet state to get balances if possible
        const wallet = (client as any)._wallet;
        if (wallet) {
            const state = await new Promise((resolve) => {
               const sub = wallet.state().subscribe((s: any) => {
                   if (s.isSynced) {
                       sub.unsubscribe();
                       resolve(s);
                   }
               });
            }) as any;

            const unshieldedBal = state.unshielded.balances['0000000000000000000000000000000000000000000000000000000000000000'] ?? 0n;
            const dustBal = state.dust.balance(new Date());

            console.log(`  tNight Balance: ${Number(unshieldedBal) / 1e6} tNight`);
            console.log(`  DUST Balance:   ${dustBal.availableBalance} DUST`);
            
            if (unshieldedBal > 0n) {
                console.log('\n  ✅ SUCCESS: Wallet is funded and synced!');
            } else {
                console.log('\n  ⚠️  WARNING: Wallet has 0 balance. Faucet required.');
            }
        }

        console.log('\n─── Test Complete! ──────────────────────────────────────────────\n');
        process.exit(0);
    } catch (err: any) {
        console.error('\n  ❌ FATAL ERROR during sync check:');
        console.error(`  ${err.message}`);
        if (err.stack) console.error(`\n  Stack trace:\n${err.stack}`);
        process.exit(1);
    }
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
