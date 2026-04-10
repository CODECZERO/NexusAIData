import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import * as path from 'path';

async function scan() {
    const dbPath = path.join(process.cwd(), '.midnight-data', 'nexus-stable-checkpoint');
    console.log('Scanning DB at:', dbPath);
    // Note: level-private-state-provider doesn't expose raw 'keys()'
    // We will attempt to deduce them from the initialization logs by enabling DEBUG
}
scan();
