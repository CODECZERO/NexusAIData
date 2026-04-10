import { getNetworkConfig } from '../src/config.js';
const config = getNetworkConfig('preprod');

async function run() {
  const address = 'mn_addr_preprod1zqh2l3amclj6td546zmsmxqwd6685svayucq3n7cs73539zgtrps3tctqc';
  const query = `
    subscription {
      unshieldedTransactions(address: "${address}", transactionId: 0) {
        transactions {
          transactionId
          inputs { address }
          outputs { address }
        }
      }
    }
  `;
  console.log("Querying indexer manually to inspect transactions...");
  
  // We can just do a POST to the graphql endpoint for a query, wait it's a subscription!
  // I will just use fetch as a query instead.
  
  const q2 = `
    query {
      txData(txId: "0") {
        status
      }
    }
  `;
  const res = await fetch(config.indexerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q2 }),
  });
  console.log(await res.json());
}
run();
