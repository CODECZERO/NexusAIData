import WebSocket from 'ws';

const wsUrl = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
console.log(`Connecting to ${wsUrl}...`);

const ws = new WebSocket(wsUrl, 'graphql-transport-ws');

ws.on('open', () => {
    console.log('✅ WebSocket Connected!');
    ws.close();
});

ws.on('error', (err) => {
    console.error('❌ WebSocket Error:', err);
});

ws.on('close', (code, reason) => {
    console.log(`WebSocket Closed: ${code} ${reason}`);
});

setTimeout(() => {
    console.log('Timeout - failed to connect in 10s');
    process.exit(1);
}, 10000);
