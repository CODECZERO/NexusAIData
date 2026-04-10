import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
    const seedStr = process.env.MIDNIGHT_WALLET_SEED;
    if (!seedStr) {
        console.error('No MIDNIGHT_WALLET_SEED found in .env');
        return;
    }

    const seed = Buffer.from(mnemonicToSeedSync(seedStr));
    const hd = HDWallet.fromSeed(seed);
    const res = hd.hdWallet.selectAccount(0).selectRoles([Roles.NightExternal]).deriveKeysAt(0);
    const ks = createKeystore(res.keys[Roles.NightExternal], 'preprod');
    console.log('--- YOUR MIDNIGHT ADDRESS ---');
    console.log(ks.getBech32Address().toString());
    console.log('-----------------------------');
}

main().catch(console.error);
