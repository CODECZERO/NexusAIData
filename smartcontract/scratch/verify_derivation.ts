import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { mnemonicToSeedSync } from '@scure/bip39';
import { Buffer } from 'buffer';

const mnemonic = "foster grass double tired spin witness goose license topple dutch garlic ride social receive shift hollow when beach twelve hurdle remember wall lamp absent";
const seedBytes = Buffer.from(mnemonicToSeedSync(mnemonic));
const hdWallet = HDWallet.fromSeed(seedBytes);

if (hdWallet.type === 'seedOk') {
    const result = hdWallet.hdWallet
        .selectAccount(0)
        .selectRoles([Roles.NightExternal])
        .deriveKeysAt(0);
        
    if (result.type === 'keysDerived') {
        const keystore = createKeystore(result.keys[Roles.NightExternal], 'preprod' as any);
        console.log("Derived Address (Preprod):", keystore.getBech32Address());
    } else {
        console.log("Keys not derived:", result.type);
    }
} else {
    console.log("Seed not ok:", hdWallet.type);
}
