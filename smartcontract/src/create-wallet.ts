import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CREATE-WALLET UTILITY
 * 
 * Native implementation for stability.
 * Automatically updates .env files with the generated seed.
 */

async function main() {
  console.log('--- Midnight Wallet Generation Utility (v2) ---');
  console.log('Initializing BIP-39 engine...');
  
  // 1. Generate mnemonic using pure Node (no WASM)
  const { generateMnemonic } = await import('@scure/bip39');
  const { wordlist } = await import('@scure/bip39/wordlists/english.js');
  
  const mnemonic = generateMnemonic(wordlist, 256);
  console.log('\n[1] SECURE MNEMONIC GENERATED (24 WORDS):');
  console.log('--------------------------------------------------------------------------------');
  console.log(mnemonic);
  console.log('--------------------------------------------------------------------------------');

  // 2. Derive Seed
  const { mnemonicToSeedSync } = await import('@scure/bip39');
  const seed = Buffer.from(mnemonicToSeedSync(mnemonic));

  // 3. Derive HD Keys (Lazy load WASM part)
  console.log('\n[2] DERIVING WALLET ADDRESS...');
  let derivedAddress: string | null = null;

  try {
      const { HDWallet, Roles } = await import('@midnight-ntwrk/wallet-sdk-hd');
      const { UnshieldedAddress, MidnightBech32m } = await import('@midnight-ntwrk/wallet-sdk-address-format');
      
      const hdWalletResult = HDWallet.fromSeed(seed);
      
      if (hdWalletResult.type === 'seedOk') {
        const derivationResult = hdWalletResult.hdWallet
          .selectAccount(0)
          .selectRoles([Roles.NightExternal])
          .deriveKeysAt(0);

        if (derivationResult.type === 'keysDerived' && derivationResult.keys[Roles.NightExternal]) {
            console.log('Status:       Keys Derived Successfully');
            
            // Format the address using the official SDK classes
            const { createKeystore } = await import('@midnight-ntwrk/wallet-sdk-unshielded-wallet');
            const keystore = createKeystore(derivationResult.keys[Roles.NightExternal], 'preprod' as any);
            derivedAddress = String(keystore.getBech32Address());

            console.log(`Address:      ${derivedAddress}`);
            const nightExternalKey = Buffer.from(derivationResult.keys[Roles.NightExternal]);
            console.log('Public Key:   ' + nightExternalKey.toString('hex'));
        }
      }
  } catch (e: any) {
      console.warn('   Note: HD Derivation skipped due to environment constraints or missing dependencies.');
      console.warn('   Error:', e.message);
  }

  // 4. Update .env files automatically
  console.log('\n[3] UPDATING ENVIRONMENT FILES...');
  
  const scEnvPath = path.resolve(__dirname, '../.env');
  const rootEnvPath = path.resolve(__dirname, '../../.env');

  const updateEnvFile = (filePath: string, key: string, value: string) => {
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (content.match(regex)) {
      content = content.replace(regex, `${key}="${value}"`);
    } else {
      content = content.trim() + `\n${key}="${value}"\n`;
    }
    fs.writeFileSync(filePath, content.trim() + '\n');
    console.log(`  ✓ Updated: ${path.basename(filePath)}`);
  };

  try {
      updateEnvFile(scEnvPath, 'MIDNIGHT_WALLET_SEED', mnemonic);
      updateEnvFile(rootEnvPath, 'MIDNIGHT_WALLET_SEED', mnemonic);
      
      if (derivedAddress) {
          const currentEscrow = process.env.PLATFORM_ESCROW_ADDRESS;
          const isJunkEscrow = !currentEscrow || currentEscrow.includes('addr_local') || currentEscrow.length < 10;
          
          if (isJunkEscrow) {
              updateEnvFile(scEnvPath, 'PLATFORM_ESCROW_ADDRESS', derivedAddress);
              updateEnvFile(rootEnvPath, 'PLATFORM_ESCROW_ADDRESS', derivedAddress);
          } else {
              console.log(`  ℹ️ Preserving existing PLATFORM_ESCROW_ADDRESS: ${currentEscrow}`);
          }
      }
      
      console.log('\n✅ All .env files updated successfully!');
      if (derivedAddress) {
          console.log('\n[4] NEXT STEPS:');
          console.log('1. Fund the address above using the Midnight Preprod Faucet:');
          console.log(`   https://faucet.preprod.midnight.network/?address=${encodeURIComponent(derivedAddress)}`);
          console.log('2. Once funded, run "npm run deploy" to target Preprod.');
      }
  } catch (err: any) {
      console.error('❌ Failed to update .env files:', err.message);
  }

  process.exit(0);
}

main().catch(console.error);
