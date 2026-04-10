import { getNetworkConfig } from '../src/config.js';

async function run() {
  const config = getNetworkConfig('preprod');
  const query = `query { block { height } }`;
  try {
    const res = await fetch(config.indexerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    console.log("Current Indexer Block Height:", data.data.block.height);
  } catch (e: any) {
    console.error("Indexer Query Failed:", e.message);
  }
}
run();
