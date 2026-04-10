import { 
  generateMnemonicWords, 
  joinMnemonicWords, 
  validateMnemonic,
  HDWallet,
  Roles
} from '@midnight-ntwrk/wallet-sdk-hd';
import { mnemonicToSeedSync } from '@scure/bip39';

/**
 * GEN-SEED UTILITY
 * 
 * This utility generates a standard BIP-39 compliant mnemonic for Midnight wallets.
 * It uses the official Midnight SDK to ensure correct entropy and checksum.
 * 
 * Usage: tsx src/gen-seed.ts
 */

async function main() {
  console.log('Generating secure Midnight wallet credentials...');

  // 1. Generate a valid 24-word mnemonic (256-bit strength)
  const words = generateMnemonicWords(256);
  const mnemonic = joinMnemonicWords(words);

  // 2. Validate the mnemonic using the SDK helper
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Generated mnemonic failed BIP-39 validation');
  }

  console.log('\n✅ SECURE MNEMONIC GENERATED (24 WORDS):');
  console.log('================================================================================');
  console.log(mnemonic);
  console.log('================================================================================');
  console.log('⚠️  IMPORTANT: Store these words in a safe place. Do not share them.');

  // 3. Demonstrate Seed & Key Derivation
  // This matches the pattern used in Midnight local-dev and example projects.
  const seed = Buffer.from(mnemonicToSeedSync(mnemonic));
  const hdWalletResult = HDWallet.fromSeed(seed);

  if (hdWalletResult.type === 'seedOk') {
    const keys = hdWalletResult.hdWallet
      .selectAccount(0)
      .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
      .deriveKeysAt(0);
    
    console.log('\n🛠️  DERIVATION PREVIEW (Account 0, Index 0):');
    console.log('--------------------------------------------------------------------------------');
    console.log(`Seed (Hex):   ${seed.toString('hex').substring(0, 16)}...${seed.toString('hex').slice(-16)}`);
    // Note: We avoid logging full private keys even in generation utilities for better practice.
    // But we show the structure is valid.
    console.log('Status:       HD Wallet Initialized Successfully');
    console.log('Roles:        Zswap, NightExternal, Dust');
    console.log('--------------------------------------------------------------------------------');
  } else {
    console.error('❌ Failed to initialize HD Wallet from generated seed');
  }
}

main().catch(error => {
  console.error('Fatal error during seed generation:', error);
  process.exit(1);
});
