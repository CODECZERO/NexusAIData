"""
Midnight-compatible ZK Proof Engine (Simulated)
================================================
Simulates ZK-SNARK proof generation/verification using SHA-256 commitments,
HMAC nullifiers, and Pedersen-commitment-style structures.

Architecture mirrors real Midnight.js / Compact contract proof flow:
  commit() → prove() → verify()

When Midnight mainnet launches, replace these classes with
real Midnight.js SDK calls — the interface is identical.
"""

import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict, Optional

import httpx
from loguru import logger


# ── Commitment Scheme ────────────────────────────────────────────────────────

def _pedersen_commit(secret: str, randomness: str) -> str:
    """
    Simulated Pedersen commitment: C = H(secret || randomness)
    In real Midnight: C = g^x * h^r on an elliptic curve.
    """
    raw = f"{secret}::{randomness}".encode()
    return hashlib.sha3_256(raw).hexdigest()


def _generate_nullifier(commitment: str, salt: str) -> str:
    """
    Nullifier prevents double-spending / double-registration.
    In real Midnight: derived from the spending key and note commitment.
    """
    key = hashlib.sha256(salt.encode()).digest()
    return hmac.new(key, commitment.encode(), hashlib.sha256).hexdigest()


# ── ZK Proof Structure ───────────────────────────────────────────────────────

class ZKProofEngine:
    """
    Simulated ZK-SNARK engine compatible with Midnight's Compact contract interface.

    Proof lifecycle:
      1. commit(data)       → commitment (public, hides data)
      2. prove(commitment)  → proof_data (verifiable, reveals nothing)
      3. verify(proof)      → bool
    """

    PROVING_KEY = os.getenv("ZK_PROVING_KEY", "nexus_midnight_proving_key_v1")
    VERIFYING_KEY = os.getenv("ZK_VERIFYING_KEY", "nexus_midnight_verifying_key_v1")
    PROOF_SERVER_URL = os.getenv("MIDNIGHT_PROOF_SERVER_URL", "http://localhost:6300")

    @classmethod
    def set_proof_server_url(cls, url: str):
        """Update the proof server URL dynamically (e.g., from bridge config)."""
        cls.PROOF_SERVER_URL = url
        logger.info(f"[ZKProofEngine] Proof Server URL updated to: {url}")

    @classmethod
    async def check_proof_server(cls) -> Dict[str, Any]:
        """
        Health check for the local Midnight Proof Server (Docker).
        Returns connectivity status and server info.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{cls.PROOF_SERVER_URL}")
                return {
                    "url": cls.PROOF_SERVER_URL,
                    "status": "connected",
                    "http_status": resp.status_code,
                    "healthy": resp.status_code < 500,
                }
        except httpx.ConnectError:
            return {
                "url": cls.PROOF_SERVER_URL,
                "status": "unreachable",
                "http_status": None,
                "healthy": False,
                "error": "Connection refused — is the proof server Docker container running?",
            }
        except Exception as e:
            return {
                "url": cls.PROOF_SERVER_URL,
                "status": "error",
                "http_status": None,
                "healthy": False,
                "error": str(e),
            }

    @classmethod
    def commit(cls, private_data: Dict[str, Any]) -> Dict[str, str]:
        """
        Generate a commitment to private data (like a fingerprint hash).
        Returns: {commitment, randomness} — randomness must be kept secret.
        """
        # Canonical JSON serialization for determinism
        canonical = json.dumps(private_data, sort_keys=True, default=str)
        randomness = hashlib.sha256(
            (canonical + str(time.time_ns())).encode()
        ).hexdigest()[:32] # type: ignore
        commitment = _pedersen_commit(canonical, randomness)
        return {"commitment": commitment, "randomness": randomness}

    @classmethod
    def prove(cls, commitment: str, public_inputs: Dict[str, Any]) -> Dict[str, str]:
        """
        Generate a ZK proof for a commitment given public inputs.
        In real Midnight: runs the Groth16/PLONK proving algorithm.
        Returns: {proof_id, proof_data, nullifier}
        """
        proof_id = hashlib.sha256(
            f"{commitment}{time.time_ns()}".encode()
        ).hexdigest()[:16] # type: ignore

        # Simulated proof: HMAC of commitment + public inputs under proving key
        pub_str = json.dumps(public_inputs, sort_keys=True, default=str)
        proof_raw = hmac.new(
            cls.PROVING_KEY.encode(),
            f"{commitment}::{pub_str}".encode(),
            hashlib.sha3_256
        ).hexdigest()

        nullifier = _generate_nullifier(commitment, cls.PROVING_KEY)

        return {
            "proof_id": proof_id,
            "proof_data": proof_raw,
            "nullifier": nullifier,
        }

    @classmethod
    def generate_proof(cls, private_data: Dict[str, Any], circuit_id: str) -> str:
        """
        Simplified wrapper for generate_full_proof that returns only the proof data.
        Compatible with the /audit endpoint.
        """
        full_result = cls.generate_full_proof(private_data, {"circuit": circuit_id})
        return full_result["proof_data"]

    @classmethod
    def verify(
        cls,
        commitment: str,
        proof_data: str,
        public_inputs: Dict[str, Any]
    ) -> bool:
        """
        Verify a ZK proof without revealing private data.
        In real Midnight: runs the SNARK verifier against the verifying key.
        """
        pub_str = json.dumps(public_inputs, sort_keys=True, default=str)
        expected = hmac.new(
            cls.PROVING_KEY.encode(),
            f"{commitment}::{pub_str}".encode(),
            hashlib.sha3_256
        ).hexdigest()
        return hmac.compare_digest(expected, proof_data)

    @classmethod
    def generate_full_proof(
        cls,
        private_data: Dict[str, Any],
        public_inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Full proof pipeline: commit → prove → verify.
        Returns a complete proof bundle ready to attach to a BlockchainRecord.
        """
        commit_result = cls.commit(private_data)
        commitment = commit_result["commitment"]
        prove_result = cls.prove(commitment, public_inputs)

        verified = cls.verify(commitment, prove_result["proof_data"], public_inputs)

        return {
            "proof_id": prove_result["proof_id"],
            "commitment": commitment,
            "nullifier": prove_result["nullifier"],
            "proof_data": prove_result["proof_data"],
            "verified": verified,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "scheme": "SNARK-SHA3-256-simulated",   # → "Groth16" on real Midnight
            "public_inputs_hash": hashlib.sha256(
                json.dumps(public_inputs, sort_keys=True, default=str).encode()
            ).hexdigest()[:16], # type: ignore
        }

# Singleton instance for API usage
zk_engine = ZKProofEngine()
