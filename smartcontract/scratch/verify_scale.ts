import * as ledger from '@midnight-ntwrk/ledger-v8';
console.log("Unshielded Token Raw:", ledger.unshieldedToken().raw);
// Sample balance comparison
const oneTNight = 1_000_000n; // is this 1? 
console.log("Sample 1M units:", oneTNight.toString());
