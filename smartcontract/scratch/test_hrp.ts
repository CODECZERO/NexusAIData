import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

// Mock some keys (32 bytes)
const mockKeys = new Uint8Array(32).fill(0x01);

console.log("Testing HRP for 'preprod':");
try {
    const ksPreprod = createKeystore(mockKeys, 'preprod' as any);
    console.log("Preprod Address:", ksPreprod.getBech32Address().toString());
} catch (e: any) {
    console.log("Preprod Error:", e.message);
}

console.log("\nTesting HRP for 'testnet':");
try {
    const ksTestnet = createKeystore(mockKeys, 'testnet' as any);
    console.log("Testnet Address:", ksTestnet.getBech32Address().toString());
} catch (e: any) {
    console.log("Testnet Error:", e.message);
}
