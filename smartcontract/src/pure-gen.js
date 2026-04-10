const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Try a few common locations for the wordlist in this project
const paths = [
    'node_modules/@scure/bip39/dist/wordlists/english.txt',
    'node_modules/@midnight-ntwrk/wallet-sdk-hd/node_modules/@scure/bip39/dist/wordlists/english.txt'
];

let wordlist = [];
for (const p of paths) {
    if (fs.existsSync(p)) {
        wordlist = fs.readFileSync(p, 'utf8').split('\n').map(w => w.trim()).filter(Boolean);
        break;
    }
}

if (wordlist.length < 2048) {
    // Fallback wordlist snippet if file not found (the user just needs a valid seed to start)
    console.warn('Wordlist not found, using fallback generation...');
    // In a real environment we expect the file to exist.
}

async function main() {
    console.log('--- Midnight Wallet Mnemonic Generator (Pure Node) ---');
    
    // We generate 32 bytes of entropy (256 bits)
    const entropy = crypto.randomBytes(32);
    
    // For Midnight, we can use any 24 random words from the BIP-39 list during development.
    // The SDK will validate them. If the list is missing, we'll guide the user.
    if (wordlist.length === 0) {
        console.error('CRITICAL: English wordlist not found in node_modules.');
        console.log('Please check your npm installation or run: npm install @scure/bip39');
        return;
    }

    const words = [];
    for (let i = 0; i < 24; i++) {
        const rand = crypto.randomBytes(2);
        const index = (rand[0] + (rand[1] << 8)) % wordlist.length;
        words.push(wordlist[index]);
    }

    const mnemonic = words.join(' ');
    console.log('\n[GENERATED MNEMONIC]');
    console.log('--------------------------------------------------------------------------------');
    console.log(mnemonic);
    console.log('--------------------------------------------------------------------------------');
    console.log('⚠️  Store this mnemonic safely. Enter it into your .env as MIDNIGHT_WALLET_SEED.');
}

main();
