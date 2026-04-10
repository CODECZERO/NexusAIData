import { MidnightClient } from '../src/midnight-client.js';
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });

async function run() {
  const networkId = 'preprod';
  const config = {
      indexerUrl: process.env.MIDNIGHT_INDEXER_URL || 'https://indexer.preprod.midnight.network/api/v4/graphql',
      rpcUrl: process.env.MIDNIGHT_RPC_URL || 'https://rpc.preprod.midnight.network',
      proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL || 'http://localhost:6300',
      walletSeed: process.env.MIDNIGHT_WALLET_SEED
  };
  
  // Custom config object for the test
  const client = new MidnightClient(networkId as any);
  
  console.log("--- STARTING FINAL STABILIZATION TEST ---");
  try {
    await client.connect();
    console.log("--- CONNECT SUCCESS ---");
  } catch (e: any) {
    console.error("FAILED TEST:", e);
  }
}
run();
