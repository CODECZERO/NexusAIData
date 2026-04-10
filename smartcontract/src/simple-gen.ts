console.log('--- GENERATING MNEMONIC ---');
import { generateMnemonicWords, joinMnemonicWords } from '@midnight-ntwrk/wallet-sdk-hd';
const words = generateMnemonicWords(256);
console.log('MNEMONIC: ' + joinMnemonicWords(words));
