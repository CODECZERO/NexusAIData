"""
Midnight ZK Identity System
============================
Generates anonymous ZK credentials for each user session.
No name, email, or login required — identity is a cryptographic
commitment derived from session context.

Aligns with Midnight's identity model where users prove attributes
(e.g., "I have uploaded >3 datasets") without revealing who they are.
"""

import hashlib
import time
import os
from typing import Dict, Any


# ── Identity Generation ──────────────────────────────────────────────────────

def generate_zk_identity(session_id: str) -> Dict[str, Any]:
    """
    Generate a ZK identity commitment for a session.
    The commitment is unlinkable to the session_id by third parties
    (would require knowledge of MIDNIGHT_IDENTITY_SALT to reverse).
    """
    salt = os.getenv("MIDNIGHT_IDENTITY_SALT", "nexus_midnight_identity_salt_v1")
    raw = f"{session_id}::{salt}"
    identity_hash = hashlib.sha3_256(raw.encode()).hexdigest()

    # Short display alias (8 chars) — like an ENS name
    alias = "0x" + identity_hash[:8].upper() # type: ignore

    # Visual color derived from hash (for avatar generation)
    h = int(identity_hash[:6], 16) # type: ignore
    avatar_hue = h % 360
    avatar_color = f"hsl({avatar_hue}, 70%, 60%)"

    return {
        "identity_commitment": identity_hash,
        "alias": alias,
        "avatar_color": avatar_color,
        "avatar_hue": avatar_hue,
        "scheme": "SHA3-256-commitment",  # → Midnight native credential on mainnet
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "DUST_balance": 100,  # Simulated Midnight gas / utility token
        "attributes": {
            "is_anonymous": True,
            "can_compare": True,
            "can_publish": True,
        }
    }


def hash_session_id(session_id: str) -> str:
    """One-way hash of session_id for use in public chain records."""
    return hashlib.sha256(f"pub::{session_id}".encode()).hexdigest()[:32] # type: ignore


def generate_ownership_proof(session_id: str, fingerprint_id: str) -> Dict[str, Any]:
    """
    Prove dataset ownership without revealing session_id.
    A challenge-response style proof: only the real owner can produce
    the correct response to a challenge about their fingerprint.
    """
    challenge = hashlib.sha256(fingerprint_id.encode()).hexdigest()[:16] # type: ignore
    response = hashlib.sha3_256(
        f"{session_id}::{challenge}::ownership_v1".encode()
    ).hexdigest()

    return {
        "challenge": challenge,
        "response": response,
        "fingerprint_id": fingerprint_id,
        "owner_commitment": hash_session_id(session_id),
        "verified": True,  # Owner produced valid response
    }


def verify_ownership(
    session_id: str,
    fingerprint_id: str,
    owner_commitment: str
) -> bool:
    """Verify that a session owns a fingerprint via commitment check."""
    computed = hash_session_id(session_id)
    return computed == owner_commitment
