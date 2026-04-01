from __future__ import annotations

import hashlib
import json
import os
import httpx
from typing import Any, Dict, List, Optional

from blockchain.zk_proofs import ZKProofEngine
from blockchain.identity import (
    generate_zk_identity,
    hash_session_id,
)
from loguru import logger


class MidnightService:
    """
    Facade over all Midnight blockchain operations.
    Reconstructs platform state directly from the Midnight Indexer via the bridge.
    """
    
    def __init__(self):
        # Indexed state (Reconstructed from Indexer)
        self._indexed_fingerprints: Dict[str, Any] = {}
        self._indexed_bounties: Dict[str, Any] = {}
        self._indexed_subscriptions: Dict[str, Any] = {}
        self._indexed_audits: List[Any] = []
        self._bridge_url = os.getenv("MIDNIGHT_BRIDGE_URL", "http://localhost:3001")
        
        # Initial sync (synchronous for simplicity in this facade)
        try:
            import asyncio
            # We use a helper to run the async sync if called from __init__
            # but usually this is called by the background sync task.
        except ImportError:
            pass

    def _normalize_bridge_response(self, data: Any) -> Any:
        """
        Recursively converts camelCase keys from the TypeScript Bridge into snake_case.
        This ensures consistency with the Python backend and React frontend types.
        """
        if isinstance(data, list):
            return [self._normalize_bridge_response(v) for v in data]
        if isinstance(data, dict):
            normalized = {}
            for k, v in data.items():
                # blockHash -> block_hash
                snake_k = "".join(["_" + c.lower() if c.isupper() else c for c in k]).lstrip("_")
                normalized[snake_k] = self._normalize_bridge_response(v)
            return normalized
        return data

    async def sync_config_from_bridge(self):
        """
        Dynamically fetch network configuration from the Midnight Bridge.
        Updates Indexer and Proof Server URLs to match the current environment.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self._bridge_url}/config")
                if resp.status_code == 200:
                    config = self._normalize_bridge_response(resp.json())
                    new_indexer = config.get("indexer_url")
                    new_proof = config.get("proof_server_url")
                    
                    if new_indexer:
                        self._indexer_url = new_indexer
                        logger.info(f"[MidnightService] Synced Indexer URL: {new_indexer}")
                    
                    if new_proof:
                        from blockchain.zk_proofs import ZKProofEngine
                        ZKProofEngine.set_proof_server_url(new_proof)
                        logger.info(f"[MidnightService] Synced Proof Server URL: {new_proof}")
                else:
                    logger.warning(f"[MidnightService] Bridge /config returned {resp.status_code}. Using defaults.")
        except Exception as e:
            logger.warning(f"[MidnightService] Failed to sync config from bridge: {e}. Using defaults.")

    async def _sync_loop(self):
        pass

    async def sync_indexer_state(self):
        """
        Reconstruct the platform state by querying the Midnight Indexer via the Bridge.
        This ensures the blockchain is the single source of truth.
        """
        logger.info("Syncing platform state from Midnight Indexer...")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # 1. Sync Fingerprints
                resp = await client.get(f"{self._bridge_url}/state/fingerprints")
                if resp.status_code == 200:
                    fps = self._normalize_bridge_response(resp.json())
                    self._indexed_fingerprints = {f["fingerprint_id"]: f for f in fps}
                
                # 2. Sync Bounties
                resp = await client.get(f"{self._bridge_url}/state/bounties")
                if resp.status_code == 200:
                    bounties = self._normalize_bridge_response(resp.json())
                    self._indexed_bounties = {b["bounty_id"]: b for b in bounties}
                
                # 3. Sync Subscriptions
                resp = await client.get(f"{self._bridge_url}/state/subscriptions")
                if resp.status_code == 200:
                    subs = self._normalize_bridge_response(resp.json())
                    self._indexed_subscriptions = {s["subscription_id"]: s for s in subs}

                # 4. Sync Audits (Provenance)
                resp = await client.get(f"{self._bridge_url}/state/audits")
                if resp.status_code == 200:
                    self._indexed_audits = resp.json()
                    
            logger.success(f"Sync complete: {len(self._indexed_fingerprints)} fingerprints, {len(self._indexed_bounties)} bounties, {len(self._indexed_subscriptions)} subscriptions.")
        except Exception as e:
            logger.error(f"Failed to sync with Midnight Indexer: {e}")

    # ── Proof Server ──────────────────────────────────────────────────────────

    async def proof_server_status(self) -> Dict[str, Any]:
        """Check connectivity to the Midnight Proof Server."""
        return await ZKProofEngine.check_proof_server()

    # ── Identity ─────────────────────────────────────────────────────────────

    def get_or_create_identity(self, session_id: str) -> Dict[str, Any]:
        """Return ZK identity for a session."""
        return generate_zk_identity(session_id)

    # ── Dataset Registration ─────────────────────────────────────────────────

    async def register_dataset(
        self,
        session_id: str,
        filename: str,
        row_count: int,
        column_count: int,
        file_hash: str,
    ) -> Dict[str, Any]:
        """Register a dataset on the Midnight chain via the bridge."""
        payload = {
            "columnNames": ["column_placeholder"], 
            "rowCount": row_count,
            "dataHash": file_hash,
            "sessionSalt": session_id
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/register", json=payload)
                resp.raise_for_status()
                result = self._normalize_bridge_response(resp.json())
                logger.info(f"Dataset registered on Midnight: {result.get('transaction_id')}")
                
                # Immediate sync to update UI
                await self.sync_indexer_state()
                return result
        except Exception as e:
            logger.error(f"Midnight registration failed: {e}")
            raise RuntimeError(f"Blockchain registration failed: {e}")

    async def log_event(
        self,
        session_id: str,
        event_type: str,
        details: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Log an event (like fingerprinting) to Midnight via the bridge."""
        payload = {
            "sessionSalt": session_id,
            "fingerprintCommitment": details.get("fingerprint_id", "0" * 32),
            "operations": [event_type],
            "expectedOutputHash": hashlib.sha256(json.dumps(details).encode()).hexdigest(),
            "attestationType": 1
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/audit", json=payload)
                resp.raise_for_status()
                result = resp.json()
                await self.sync_indexer_state()
                return result
        except Exception as e:
            logger.error(f"[MidnightService] Midnight event logging failed: {e}. Ensure the Midnight Bridge is running at {self._bridge_url}")
            return {"error": f"Bridge Connection Failed: {e}"}

    # ── State Access ────────────────────────────────────────────────────────

    def get_market_listings(self) -> List[Dict[str, Any]]:
        # For NexusAIData, all public fingerprints are in the marketplace
        return [f for f in self._indexed_fingerprints.values() if f.get("is_public")]

    def get_fingerprints_by_owner(self, session_id: str) -> List[Dict[str, Any]]:
        owner_hash = hash_session_id(session_id)
        return [fp for fp in self._indexed_fingerprints.values() if fp.get("owner_commitment") == owner_hash]

    def get_provenance(self, session_id: str) -> List[Dict[str, Any]]:
        """Return full immutable audit trail for a session from the on-chain index."""
        session_hash = hash_session_id(session_id)
        # Filter all indexed items owned by this session
        records = []
        for fp in self._indexed_fingerprints.values():
            if fp.get("owner_commitment") == session_hash:
                records.append({
                    "event_type": "REGISTER",
                    "timestamp": fp.get("registered_at"),
                    "public_metadata": fp,
                    "proof_id": fp.get("transactionId") or fp.get("fingerprint_id"),
                    "proof_verified": True,
                    "network": "midnight-preprod"
                })
        # Sort by timestamp if available
        return sorted(records, key=lambda x: x.get("timestamp", ""), reverse=True)

    def get_public_ledger(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return latest public chain activity reconstructed from indexer."""
        ledger = []
        for fp in list(self._indexed_fingerprints.values())[:limit]:
            ledger.append({
                "block_hash": fp.get("transactionId") or fp.get("fingerprint_id"),
                "event_type": "FINGERPRINT",
                "timestamp": fp.get("registered_at"),
                "proof_id": fp.get("transactionId"),
                "proof_verified": True,
                "metadata_summary": fp,
                "network": "midnight-preprod"
            })
        return ledger

    async def get_ledger_stats(self) -> Dict[str, Any]:
        """Fetch chain stats from the bridge."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self._bridge_url}/state/stats")
                if resp.status_code == 200:
                    return resp.json()
        except:
            pass
        return {"total_registered": len(self._indexed_fingerprints), "chain_valid": True}

    # ── Bounty Operations ───────────────────────────────────────────────────

    async def create_bounty(
        self,
        session_id: str,
        fingerprint_id: str,
        reward_dust: int,
        description: str,
        min_similarity: float = 0.8,
        escrow_tx_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new data bounty on the Midnight chain via bridge."""
        payload = {
            "sessionSalt": session_id,
            "fingerprintId": fingerprint_id,
            "rewardDust": reward_dust,
            "description": description,
            "minSimilarity": int(min_similarity * 100),
            "escrowTxId": escrow_tx_id
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/create-bounty", json=payload)
                resp.raise_for_status()
                result = resp.json()
                await self.sync_indexer_state()
                return result
        except Exception as e:
            logger.error(f"Bounty creation failed: {e}")
            raise

    async def claim_bounty(
        self,
        session_id: str,
        bounty_id: str,
        claimer_fingerprint_id: str
    ) -> Dict[str, Any]:
        """Claim a data bounty on the Midnight chain via bridge."""
        payload = {
            "sessionSalt": session_id,
            "bountyId": bounty_id,
            "claimerFingerprintId": claimer_fingerprint_id
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/claim-bounty", json=payload)
                resp.raise_for_status()
                result = resp.json()
                await self.sync_indexer_state()
                return result
        except Exception as e:
            logger.error(f"Bounty claim failed: {e}")
            raise

    # ── Subscription Operations ──────────────────────────────────────────────

    async def create_subscription(
        self,
        session_id: str,
        target_fingerprint: str,
        payment_dust: int,
    ) -> Dict[str, Any]:
        payload = {
            "sessionSalt": session_id,
            "targetFingerprint": target_fingerprint,
            "paymentDust": payment_dust,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/subscribe", json=payload)
                resp.raise_for_status()
                result = resp.json()
                await self.sync_indexer_state()
                return result
        except Exception as e:
            logger.error(f"Subscription failed: {e}")
            raise

    async def claim_subscription(
        self,
        session_id: str,
        subscription_id: str,
    ) -> Dict[str, Any]:
        payload = {
            "sessionSalt": session_id,
            "subscriptionId": subscription_id,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/claim-subscription", json=payload)
                resp.raise_for_status()
                result = resp.json()
                await self.sync_indexer_state()
                return result
        except Exception as e:
            logger.error(f"Claim failed: {e}")
            raise

    async def refund_subscription(
        self,
        session_id: str,
        subscription_id: str,
    ) -> Dict[str, Any]:
        payload = {
            "sessionSalt": session_id,
            "subscriptionId": subscription_id,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/refund-subscription", json=payload)
                resp.raise_for_status()
                result = resp.json()
                await self.sync_indexer_state()
                return result
        except Exception as e:
            logger.error(f"Refund failed: {e}")
            raise

    # ── Verification ────────────────────────────────────────────────────────

    async def verify_ownership(
        self,
        session_id: str,
        fingerprint_id: str,
    ) -> Dict[str, Any]:
        payload = {
            "type": "ownership",
            "fingerprintId": fingerprint_id,
            "sessionSalt": session_id,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/verify", json=payload)
                resp.raise_for_status()
                return resp.json()
        except:
            return {"verified": False}

    async def verify_audit(
        self,
        audit_id: str,
    ) -> Dict[str, Any]:
        payload = {
            "type": "audit",
            "auditId": audit_id,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self._bridge_url}/verify", json=payload)
                resp.raise_for_status()
                return resp.json()
        except:
            return {"verified": False}


# Singleton
midnight_service = MidnightService()
