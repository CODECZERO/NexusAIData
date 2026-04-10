/**
 * NexusAIData — Midnight Contract Deployment Script
 * ===================================================
 * Deploys all three Compact contracts to the Midnight testnet.
 * 
 * Usage:
 *   npx ts-node src/deploy.ts                  # Deploy to testnet (default)
 *   MIDNIGHT_NETWORK=local npx ts-node src/deploy.ts  # Deploy locally
 * 
 * Prerequisites:
 *   1. Midnight Proof Server running on localhost:6300
 *   2. Wallet seed configured in .env (MIDNIGHT_WALLET_SEED)
 *   3. Contracts compiled via `npm run compile:contracts`
 *   4. Sufficient tDUST balance for testnet deployment
 */

import { MidnightClient } from './midnight-client.js';
import { getNetworkConfig, DEPLOYED_CONTRACTS } from './config.js';
import type { NetworkId } from './config.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOG_FILE = '/tmp/deploy_trace.log';
fs.writeFileSync(LOG_FILE, 'Deploy script started\n');
function tlog(msg: string) {
    fs.appendFileSync(LOG_FILE, msg + '\n');
    console.log(msg);
}

tlog('Loaded path/fs modules');

// ── Contract Metadata ────────────────────────────────────────────────────────

interface ContractDeployment {
  name: string;
  compactFile: string;
  description: string;
  address?: string;
  transactionId?: string;
  deployedAt?: string;
}

const CONTRACTS: ContractDeployment[] = [
  {
    name: 'DataFingerprint',
    compactFile: '../contracts/data_fingerprint.compact',
    description: 'Privacy-preserving dataset fingerprint registry with ZK ownership proofs',
  },
  {
    name: 'DataBounty',
    compactFile: '../contracts/data_bounty.compact',
    description: 'Trustless ZK data bounties with clean room verification',
  },
  {
    name: 'AuditProof',
    compactFile: '../contracts/audit_proof.compact',
    description: 'Verifiable audit proofs with integrity attestations',
  },
  {
    name: 'PlatformEscrow',
    compactFile: '../contracts/platform_escrow.compact',
    description: 'Trustless escrow for bounty rewards and marketplace payments',
  },
];

// ── Deployment ───────────────────────────────────────────────────────────────

async function deployContracts() {
  tlog('Inside deployContracts()');
  const networkId = (process.env.MIDNIGHT_NETWORK as NetworkId) || 'preprod';
  const config = getNetworkConfig(networkId);

  tlog('╔══════════════════════════════════════════════════════════════╗');
  tlog('║          NexusAIData — Midnight Contract Deployment         ║');
  tlog('╚══════════════════════════════════════════════════════════════╝');
  tlog(`  Network:      ${config.networkId}`);
  tlog(`  Node URL:     ${config.nodeUrl}`);
  tlog(`  Indexer:      ${config.indexerUrl}`);
  tlog(`  Proof Server: ${config.proofServerUrl}`);
  tlog('');

  // 1. Initialize Midnight client
  tlog('Instantiating MidnightClient...');
  const client = new MidnightClient();

  try {
    tlog('Calling client.connect()...');
    await client.connect();
    tlog('Calling client.getWalletAddress()...');
    const walletAddress = await client.getWalletAddress();
  
    
    tlog('Connected to Midnight network');
    if (walletAddress) {
        tlog(`   Wallet Address: ${walletAddress}`);
        tlog(`   Platform Escrow Configured: ${config.platformEscrowAddress || 'NOT SET'}`);
    }
    tlog('');
  } catch (error) {
    tlog('Failed to connect to Midnight network');
    tlog('   Ensure the local proof server is running (http://localhost:6300)');
    tlog('   and your MIDNIGHT_WALLET_SEED is correctly set.');
    tlog(`   Error: ${error}`);
    process.exit(1);
  }

  // 2. Deploy each contract
  tlog('Starting deployment loop...');
  const deploymentResults: ContractDeployment[] = [];

  for (const contract of CONTRACTS) {
    tlog(`\n── Deploying ${contract.name} ──────────────────────────────`);
    console.log(`  File: ${contract.compactFile}`);
    console.log(`  Desc: ${contract.description}`);

    try {
      // 1. Attempt to load real artifact
      const artifactSubPath = `contracts/managed/${contract.name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}/contract/index.js`;
      const artifactPath = path.resolve(process.cwd(), artifactSubPath);
      let artifact: any = null;
      
      console.log(`  Checking for artifact: ${artifactPath}`);
      
      if (fs.existsSync(artifactPath)) {
          try {
              // Dynamic import of the compiled compact contract
              const module = await import(`file://${artifactPath}`);
              artifact = module; // MidnightJS expects the entire module namespace, not just the Contract class
              tlog(`  [OK] Artifact loaded successfully.`);
          } catch (e: any) {
              tlog(`  Found artifact but failed to load: ${e.message}`);
          }
      }

      // 2. Decide if simulation or real
      // A seed is considered "real" if it doesn't contain 'junk' and has 24 words
      const mnemonic = config.walletSeed || '';
      const isRealSeed = mnemonic.split(' ').length === 24 && !mnemonic.includes('junk');
      
      // We check for wallet address only after connect() has been called
      const walletAddress = await client.getWalletAddress();
      
      // Critical: also check that the wallet PROVIDER is initialized (requires proof server)
      const walletReady = client.isWalletReady();

      if (artifact && isRealSeed && walletAddress && walletReady) {
          console.log(`  Attempting REAL on-chain deployment from ${walletAddress}...`);
          try {
              const result = await client.deployContract(contract.name, artifact);
              contract.address = result.address;
              contract.transactionId = result.transactionId;
              console.log(`  Successfully deployed to ${contract.address}`);
          } catch (e: any) {
              console.error(`  Deployment failed: ${e.message}`);
              throw e;
          }
      } else {
          let reason = !artifact ? 'Missing compiled artifacts (run npm run compile:all)' 
            : !config.walletSeed ? 'Missing wallet seed (run npm run create-wallet)' 
            : !walletAddress ? 'Wallet address could not be derived'
            : !walletReady ? 'Wallet provider not synced (is the proof server running? → npm run start-proof-server)'
            : 'Invalid/Junk seed phrase';
          console.log(`  Using [Simulation Mode]: ${reason}`);
          
          contract.address = `0x${Buffer.from(`addr::${contract.name}`).toString('hex').substring(0, 40)}`;
          contract.transactionId = `0x${Buffer.from(`deploy::${contract.name}::${Date.now()}`).toString('hex').substring(0, 64)}`;
      }

      contract.deployedAt = new Date().toISOString();
      deploymentResults.push(contract);

      // [NEW] Post-deployment initialization for Escrow
      if (contract.name === 'PlatformEscrow' && contract.address && !contract.address.startsWith('0x6164')) {
          const adminAddr = config.platformEscrowAddress;
          if (adminAddr) {
              console.log(`  Initializing Escrow with admin: ${adminAddr}...`);
              await client.initializeEscrow(contract.address, adminAddr).catch((e: any) => {
                  console.warn(`  Escrow initialization failed (non-fatal): ${e.message}`);
              });
          } else {
              console.warn(`  Skipping Escrow initialization: PLATFORM_ESCROW_ADDRESS not configured.`);
          }
      }

      console.log(`  ${contract.address?.startsWith('0x6164') ? 'Simulated' : 'Real'} Success!`);
      console.log(`     Address:     ${contract.address}`);
      console.log(`     Transaction: ${contract.transactionId?.substring(0, 20)}...`);
    } catch (error: any) {
      console.error(`  Failed to deploy ${contract.name}: ${error.message}`);
    }
  }

  // 3. Summary
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Deployment Summary                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  for (const dep of deploymentResults) {
    console.log(`\n  ${dep.name}:`);
    console.log(`    Address:     ${dep.address}`);
    console.log(`    Transaction: ${dep.transactionId?.substring(0, 30)}...`);
    console.log(`    Deployed:    ${dep.deployedAt}`);
  }

  // 4. Update .env files automatically
  // Primary: smartcontract/.env (what config.ts loads)
  const scEnvPath = path.resolve(__dirname, '../.env');
  // Secondary: root .env (what Vite frontend loads)
  const rootEnvPath = path.resolve(__dirname, '../../.env');

  console.log(`\n\n── Updating .env files ──────────────────────────────────`);
  console.log(`  Smartcontract: ${scEnvPath}`);
  console.log(`  Root:          ${rootEnvPath}`);

  // Helper to read+update an env file
  const updateEnvFile = (filePath: string, updates: Record<string, string>) => {
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*`, 'm');
      if (content.match(regex)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content += `\n${key}=${value}`;
      }
    }
    fs.writeFileSync(filePath, content.trim() + '\n');
  };

  // Build the updates
  const scUpdates: Record<string, string> = {};
  const rootUpdates: Record<string, string> = {};

  // Administrative identity (The owner of the escrow)
  if (config.platformEscrowAddress) {
    // Preserve existing admin address
    scUpdates['PLATFORM_ESCROW_ADDRESS'] = config.platformEscrowAddress;
    rootUpdates['PLATFORM_ESCROW_ADDRESS'] = config.platformEscrowAddress;
  } else if (config.walletSeed && !config.walletSeed.includes('junk')) {
    // Fallback: Use current wallet if none configured
    const addr = await client.getWalletAddress();
    if (addr) {
      scUpdates['PLATFORM_ESCROW_ADDRESS'] = addr;
      rootUpdates['PLATFORM_ESCROW_ADDRESS'] = addr;
      console.log(`  Set PLATFORM_ESCROW_ADDRESS: ${addr}`);
    }
  }

  // Contract addresses (infrastructure)
  for (const dep of deploymentResults) {
    const envKey = `CONTRACT_${dep.name.replace(/([A-Z])/g, '_$1').toUpperCase()}_ADDRESS`;
    scUpdates[envKey] = dep.address || '';
    rootUpdates[envKey] = dep.address || '';
    rootUpdates[`VITE_${envKey}`] = dep.address || '';
    console.log(`  ${envKey} = ${dep.address}`);
  }

  updateEnvFile(scEnvPath, scUpdates);
  updateEnvFile(rootEnvPath, rootUpdates);
  console.log('\n  All .env files updated successfully!');
  console.log('  Restart frontend/backend to reflect changes.\n');
  return deploymentResults;
}

// ── Run ──────────────────────────────────────────────────────────────────────

deployContracts().catch(console.error);

export { deployContracts };
