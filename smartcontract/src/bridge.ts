console.log('[Bridge] Starting process at:', new Date().toISOString());
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { midnightClient } from './midnight-client.js';
import { spawn, execSync } from 'child_process';
import fs from 'fs';

console.log('[Bridge] Imports completed successfully.');

// ── Environment Configuration ──────────────────────────────────────────────────
import * as dotenv from 'dotenv';
dotenv.config();

const NETWORK_ID = process.env.MIDNIGHT_NETWORK || 'preprod';
const NODE_PORT = process.env.MIDNIGHT_NODE_PORT || '9944';
const INDEXER_PORT = process.env.MIDNIGHT_INDEXER_PORT || '8088';
const PROOF_SERVER_PORT = process.env.MIDNIGHT_PROOF_PORT || '6300';
const isLocalNetwork = NETWORK_ID === 'local' || NETWORK_ID === 'undeployed';

// ── Midnight Local Network Auto-Manager ─────────────────────────────────────

function startLocalNetwork() {
  if (!isLocalNetwork) {
    console.log(`[Bridge] Remote network configured (${NETWORK_ID}). Bypassing local docker start.`);
    return Promise.resolve();
  }

  console.log(`[Bridge] Bootstrapping full Midnight Local Network via Native Docker...`);
  
  try {
    // 1. Prepare Docker Network & Clean old containers
    execSync('docker network create midnight-net 2>/dev/null || true');
    execSync('docker rm -f midnight-node midnight-indexer midnight-proof-server 2>/dev/null || true');

    console.log(`[Bridge] Starting local Node... (If this is your first time, Docker is pulling a ~2GB image. DO NOT CANCEL!)`);
    execSync(`docker run -d --rm --name midnight-node --network midnight-net -p ${NODE_PORT}:9944 -e CFG_PRESET=dev -e SIDECHAIN_BLOCK_BENEFICIARY=04bcf7ad3be7a5c790460be82a713af570f22e0f801f6659ab8e84a52be6969e midnightntwrk/midnight-node:0.22.3`, { stdio: 'inherit' });
    spawn('docker', ['logs', '-f', 'midnight-node'], { stdio: 'inherit' });
    
    console.log(`[Bridge] Starting local Indexer...`);
    execSync(`docker run -d --rm --name midnight-indexer --network midnight-net -p ${INDEXER_PORT}:8088 -e APP__INFRA__NODE__URL=ws://midnight-node:9944 -e APP__INFRA__STORAGE__PASSWORD=indexer -e APP__INFRA__PUB_SUB__PASSWORD=indexer -e APP__INFRA__LEDGER_STATE_STORAGE__PASSWORD=indexer -e APP__INFRA__SECRET=303132333435363738393031323334353637383930313233343536373839303132 -e RUST_LOG=info -e APP__APPLICATION__NETWORK_ID=preprod midnightntwrk/indexer-standalone:4.0.1`, { stdio: 'inherit' });
    spawn('docker', ['logs', '-f', 'midnight-indexer'], { stdio: 'inherit' });

    console.log(`[Bridge] Starting local Proof Server...`);
    execSync(`docker run -d --rm --name midnight-proof-server -p ${PROOF_SERVER_PORT}:6300 midnightntwrk/proof-server:8.0.3 -- midnight-proof-server -v`, { stdio: 'inherit' });

    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║             🚀 MIDNIGHT SERVICES RUNNING 🚀                    ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝`);
    console.log(`  [Node]         http://localhost:${NODE_PORT}`);
    console.log(`  [Indexer]      http://localhost:${INDEXER_PORT}/api/v4/graphql`);
    console.log(`  [Proof Server] http://localhost:${PROOF_SERVER_PORT}\n`);
  } catch (err) {
    console.error(`[Bridge] Warning: Failed to execute docker container. Is Docker running?`);
  }

  console.log(`[Bridge] Waiting 5s for network initialization...`);
  return new Promise((resolve) => setTimeout(resolve, 5000));
}

function cleanupDocker() {
  console.log(`\n[Bridge] Received exit signal. Shutting down Midnight Native Docker Network...`);
  try {
    execSync(`docker rm -f midnight-node midnight-indexer midnight-proof-server 2>/dev/null || true`);
    console.log(`[Bridge] ✅ Local Network cleanly shut down.`);
  } catch (err) {
    console.error(`[Bridge] Failed to stop Docker containers gracefully.`);
  }
  process.exit();
}

// Hook onto standard termination signals
process.on('SIGINT', cleanupDocker);
process.on('SIGTERM', cleanupDocker);
// ────────────────────────────────────────────────────────────────────────────

const app = express();
const port = process.env.MIDNIGHT_BRIDGE_PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// ── Static Asset Serving (For ZK Artifacts) ──────────────────────────────────
// This allows the Lace extension to download proving/verifying keys.
app.use('/managed', express.static('contracts/managed'));

app.get('/', (req: Request, res: Response) => res.json({ service: 'NexusAIData Midnight Bridge', status: 'OK' }));

// ── Health & Status ─────────────────────────────────────────────────────────

app.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await midnightClient.getNetworkStatus();
    res.json({
        ...status,
        ready: status.connected && status.proofServerHealthy
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/config', (req: Request, res: Response) => {
    try {
        const network = (process.env.MIDNIGHT_NETWORK as any) || 'preprod';
        const config = midnightClient.getNetworkConfig(network);
        res.json({
            networkId: config.networkId,
            indexerUrl: config.indexerUrl,
            nodeUrl: config.nodeUrl,
            proofServerUrl: config.proofServerUrl,
            platformEscrowAddress: config.platformEscrowAddress
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── On-Chain State Retrieval (Indexer Queries) ──────────────────────────────

app.get('/state/fingerprints', async (req: Request, res: Response) => {
  try {
    const fps = await midnightClient.getOnChainFingerprints();
    res.json(fps);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/state/bounties', async (req: Request, res: Response) => {
  try {
    const bounties = await midnightClient.getOnChainBounties();
    res.json(bounties);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/state/subscriptions', async (req: Request, res: Response) => {
  try {
    const subs = await midnightClient.getOnChainSubscriptions();
    res.json(subs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/state/stats', async (req: Request, res: Response) => {
  try {
    const stats = await midnightClient.getNetworkStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/state/audits', async (req: Request, res: Response) => {
  try {
    const audits = await midnightClient.getOnChainAudits();
    res.json(audits);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Initialize the Midnight SDK with service URIs from the user's wallet.
 */
app.post('/init', async (req: Request, res: Response) => {
    try {
        // Utilize the .env parameters or fallback to the requested networks
        const targetNetworkId = req.body.networkId || NETWORK_ID;
        // Check if proof server is reachable
        const proofAlive = await midnightClient.getNetworkStatus().then(s => s.proofServerHealthy).catch(() => false);
        
        await midnightClient.setupProviders({
            networkId: targetNetworkId,
            indexerUri: req.body.indexerUri || process.env.MIDNIGHT_INDEXER_URL,
            indexerWsUri: req.body.indexerWsUri || process.env.MIDNIGHT_INDEXER_WS_URL,
            proverServerUri: req.body.proverServerUri || process.env.MIDNIGHT_PROOF_SERVER_URL
        });

        res.json({ 
            success: true, 
            network: targetNetworkId, 
            proofServerHealthy: proofAlive,
            message: proofAlive ? 'Providers initialized successfully' : 'Providers initialized (Proof Server offline — simulation mode active)' 
        });
    } catch (error: any) {
        console.error('[Bridge] Initialization failed:', error);
        // Fallback: Return 200 with error details to allow the frontend to continue in simulation mode
        res.json({ 
            success: false, 
            error: error.message,
            simulation: true,
            message: 'Bridge initialization failed, falling back to simulation mode.' 
        });
    }
});

// ── Fingerprint Operations ──────────────────────────────────────────────────

app.post('/register', async (req: Request, res: Response) => {
  const { columnNames, rowCount, dataHash, sessionSalt } = req.body;
  
  if (!columnNames || !rowCount || !dataHash || !sessionSalt) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await midnightClient.registerFingerprint(
      columnNames,
      rowCount,
      dataHash,
      sessionSalt
    );
    res.json(result);
  } catch (error: any) {
    console.error('[Bridge] Error in /register:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Bounty Operations ───────────────────────────────────────────────────────

app.post('/bounty', async (req: Request, res: Response) => {
  const { 
    sessionSalt, 
    requiredSchemaHash, 
    minSimilarity, 
    minRowBucket, 
    rewardDust, 
    description 
  } = req.body;

  try {
    const result = await midnightClient.createBounty(
      sessionSalt,
      requiredSchemaHash,
      minSimilarity,
      minRowBucket,
      rewardDust,
      description
    );
    res.json(result);
  } catch (error: any) {
    console.error('[Bridge] Error in /bounty:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Audit Operations ────────────────────────────────────────────────────────

app.post('/audit', async (req: Request, res: Response) => {
  const { 
    sessionSalt, 
    fingerprintCommitment, 
    operations, 
    expectedOutputHash, 
    attestationType 
  } = req.body;

  try {
    const result = await midnightClient.submitAudit(
      sessionSalt,
      fingerprintCommitment,
      operations,
      expectedOutputHash,
      attestationType
    );
    res.json(result);
  } catch (error: any) {
    console.error('[Bridge] Error in /audit:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Provenance Operations (record_lineage circuit) ──────────────────────────

app.post('/provenance', async (req: Request, res: Response) => {
  const { sessionSalt, isRoot, parentId, childHash, operationHash } = req.body;

  if (!sessionSalt || !childHash || !operationHash) {
    return res.status(400).json({ error: 'Missing required parameters: sessionSalt, childHash, operationHash' });
  }

  try {
    const result = await midnightClient.recordProvenance(
      sessionSalt,
      isRoot ?? false,
      parentId || '0'.repeat(32),
      childHash,
      operationHash
    );
    res.json(result);
  } catch (error: any) {
    console.error('[Bridge] Error in /provenance:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Subscription Operations (create/claim/refund circuits) ──────────────────

app.post('/subscribe', async (req: Request, res: Response) => {
  const { sessionSalt, targetFingerprint, paymentDust } = req.body;

  if (!sessionSalt || !targetFingerprint || !paymentDust) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await midnightClient.createSubscription(sessionSalt, targetFingerprint, paymentDust);
    res.json(result);
  } catch (error: any) {
    console.error('[Bridge] Error in /subscribe:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/claim-subscription', async (req: Request, res: Response) => {
  const { sessionSalt, subscriptionId } = req.body;

  if (!sessionSalt || !subscriptionId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await midnightClient.claimSubscription(sessionSalt, subscriptionId);
    res.json(result);
  } catch (error: any) {
    console.error('[Bridge] Error in /claim-subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/refund-subscription', async (req: Request, res: Response) => {
  const { sessionSalt, subscriptionId } = req.body;

  if (!sessionSalt || !subscriptionId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await midnightClient.refundSubscription(sessionSalt, subscriptionId);
    res.json(result);
  } catch (error: any) {
    console.error('[Bridge] Error in /refund-subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Verification Operations (verify_ownership, verify_audit circuits) ───────

app.post('/verify', async (req: Request, res: Response) => {
  const { type, fingerprintId, auditId, sessionSalt } = req.body;

  try {
    if (type === 'ownership' && fingerprintId && sessionSalt) {
      const result = await midnightClient.verifyOwnership(fingerprintId, sessionSalt);
      return res.json(result);
    }
    if (type === 'audit' && auditId) {
      const result = await midnightClient.verifyAudit(auditId);
      return res.json(result);
    }
    return res.status(400).json({ error: 'Invalid verification request. Provide type=ownership|audit with required params.' });
  } catch (error: any) {
    console.error('[Bridge] Error in /verify:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

startLocalNetwork().then(() => {
  app.listen(port, () => {
    console.log(`╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║             NexusAIData — Midnight SDK Bridge              ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝`);
    console.log(`  Bridge listening at http://localhost:${port}`);
    console.log(`  Connected to Midnight via TS SDK`);
  });
});
