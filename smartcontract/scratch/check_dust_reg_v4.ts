import { getNetworkConfig } from '../src/config.js';

async function run() {
  const config = getNetworkConfig('preprod');
  const address = "mn_addr_preprod1zqh2l3amclj6td546zmsmxqwd6685svayucq3n7cs73539zgtrps3tctqc";
  
  // Try querying current status from indexer using v4 schema hint
  const query = `
    query {
      dustGenerationStatus(unshieldedAddress: "${address}") {
        registered
      }
    }
  `;

  try {
    const res = await fetch(config.indexerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    console.log("Dust Status:", JSON.stringify(data, null, 2));
  } catch (e: any) {
    console.error("Failed to query indexer:", e.message);
  }
}
run();
