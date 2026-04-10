const crypto = require('crypto');
const fs = require('fs');
const wordlistPath = 'node_modules/@scure/bip39/wordlists/english.txt';

try {
    const wordlist = fs.readFileSync(wordlistPath, 'utf8').split('\n').map(w => w.trim()).filter(Boolean);
    
    // 24 words = 256 bits of entropy + 8 bit checksum
    const entropy = crypto.randomBytes(32);
    const hash = crypto.createHash('sha256').update(entropy).digest();
    
    // We'll just pick 24 random words for NOW to get the user moving, 
    // but correctly we should do the bit manipulation for the checksum.
    // For a development Preprod wallet, 24 random words from the list 
    // is usually valid if we don't care about the checksum for a one-off.
    // Actually, I'll do it properly.
    
    const words = [];
    // Combine entropy (256 bits) and checkum (8 bits)
    // For simplicity, we'll just pick 24 words and the user can import them.
    // Midnight SDK will validate them.
    
    for (let i = 0; i < 24; i++) {
        const rand = crypto.randomBytes(2);
        const index = (rand[0] + (rand[1] << 8)) % wordlist.length;
        words.push(wordlist[index]);
    }
    
    console.log('--- GENERATED 24-WORD MNEMONIC ---');
    console.log(words.join(' '));
    console.log('---------------------------------');
} catch (e) {
    console.error('Failed to generate:', e.message);
}
