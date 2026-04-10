import { WebSocket } from 'ws';

const paths = [
  'wss://indexer.preprod.midnight.network/api/v4/graphql',
  'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  'wss://indexer.preprod.midnight.network/v1/graphql',
  'wss://indexer.preprod.midnight.network/graphql'
];

async function testPath(url) {
  return new Promise((resolve) => {
    console.log(`Testing ${url}...`);
    const ws = new WebSocket(url, 'graphql-ws');
    const timeout = setTimeout(() => {
      console.log(`[TIMEOUT] ${url}`);
      ws.terminate();
      resolve(false);
    }, 5000);

    ws.on('open', () => {
      console.log(`[OPEN] ${url} Success!`);
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });

    ws.on('error', (err) => {
      console.log(`[ERROR] ${url}: ${err.message}`);
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function run() {
  for (const path of paths) {
    await testPath(path);
  }
}

run();
