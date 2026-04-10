import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(__dirname, '../contracts/managed/data_fingerprint/contract/index.js');

console.log('__dirname:', __dirname);
console.log('Searching for:', artifactPath);
console.log('Exists:', fs.existsSync(artifactPath));

const dirPath = path.resolve(__dirname, '../contracts/managed');
if (fs.existsSync(dirPath)) {
    console.log('Managed Dir Contents:', fs.readdirSync(dirPath));
} else {
    console.log('Managed Dir NOT FOUND at:', dirPath);
}
