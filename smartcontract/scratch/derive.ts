import { mnemonicToSeedSync } from '@scure/bip39';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

const seed = Buffer.from(mnemonicToSeedSync('foster grass double tired spin witness goose license topple dutch garlic ride social receive shift hollow when beach twelve hurdle remember wall lamp absent'));
const hdWalletResult = HDWallet.fromSeed(seed);
if (hdWalletResult.type === 'seedOk') {
    const res = hdWalletResult.hdWallet.selectAccount(0).selectRoles([Roles.NightExternal]).deriveKeysAt(0);
    if (res.type === 'keysDerived') {
        const keystore = createKeystore(res.keys[Roles.NightExternal], 'preprod' as any);
        console.log("Derived Address: " + keystore.getBech32Address().toString());
    }
}
