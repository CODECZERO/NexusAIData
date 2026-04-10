import { getNetworkConfig } from '../src/config.js';

async function run() {
  const config = getNetworkConfig('preprod');
  const query = `
    query {
      __schema {
        queryType {
          fields {
            name
          }
        }
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
    console.log("Indexer Query Fields:", data.data.__schema.queryType.fields.map((f: any) => f.name));
  } catch (e: any) {
    console.error("Failed to query indexer schema:", e.message);
  }
}
run();
