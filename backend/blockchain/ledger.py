"""
Midnight-Compatible Blockchain Ledger
======================================
An append-only, hash-linked chain of BlockchainRecord events.
Persists to ./blockchain_ledger.json between restarts.

Mirrors Midnight's dual-state model:
  - Public state  → stored in ledger, visible to all (no private data)
  - Shielded state → represented by ZK proofs (private inputs never stored)

When Midnight mainnet is live:
  - This ledger is replaced by real on-chain transactions
  - The `submit()` method calls Midnight.js `submitTransaction()`
  - BlockchainRecord maps to a Midnight transaction receipt
"""

import hashlib
import json
import os
import time
from typing import Any, Dict, List, Optional

from pathlib import Path
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
LEDGER_PATH = os.getenv("BLOCKCHAIN_LEDGER_PATH", str(UPLOAD_DIR / "blockchain_ledger.json"))
GENESIS_HASH = "0" * 64  # Genesis block prev_hash sentinel


# ── Chain Record ─────────────────────────────────────────────────────────────

def _compute_block_hash(record: Dict[str, Any]) -> str:
    """Compute deterministic hash of a block (excluding 'block_hash' field)."""
    data = {k: v for k, v in record.items() if k != "block_hash"}
    canonical = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


# ── Ledger ───────────────────────────────────────────────────────────────────

class BlockchainLedger:
    """
    Append-only ledger storing public chain events.
    Thread-safe for single-process use (FastAPI single worker or gunicorn).
    """

    def __init__(self):
        self._chain: List[Dict[str, Any]] = []
        self._loaded = False

    def _load(self):
        if self._loaded:
            return
        try:
            if os.path.exists(LEDGER_PATH):
                with open(LEDGER_PATH, "r") as f:
                    self._chain = json.load(f)
        except Exception:
            self._chain = []
        self._loaded = True

    def _save(self):
        try:
            with open(LEDGER_PATH, "w") as f:
                json.dump(self._chain, f, indent=2, default=str)
        except Exception:
            pass  # Non-fatal: in-memory chain still works

    def _prev_hash(self) -> str:
        return self._chain[-1]["block_hash"] if self._chain else GENESIS_HASH

    # ── Public API ───────────────────────────────────────────────────────────

    def submit(
        self,
        session_id_hash: str,
        event_type: str,
        zk_proof: Dict[str, Any],
        public_metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Append a new block to the chain.
        Only the hashed session_id is stored — never the raw session_id.
        """
        self._load()

        block = {
            "block_number": len(self._chain),
            "prev_hash": self._prev_hash(),
            "session_id_hash": session_id_hash,
            "event_type": event_type,
            "zk_proof": zk_proof,
            "public_metadata": public_metadata,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "block_hash": "",  # Filled below
            "network": "midnight-testnet-simulated",
        }
        block["block_hash"] = _compute_block_hash(block)

        self._chain.append(block)
        self._save()
        return block

    def get_all(self) -> List[Dict[str, Any]]:
        """Return full public ledger (strip any internal fields if needed)."""
        self._load()
        return list(self._chain)

    def get_by_session_hash(self, session_id_hash: str) -> List[Dict[str, Any]]:
        """Return all blocks for a given (hashed) session identity."""
        self._load()
        return [b for b in self._chain if b["session_id_hash"] == session_id_hash]

    def get_latest(self, n: int = 20) -> List[Dict[str, Any]]:
        """Return latest n blocks."""
        self._load()
        return list(reversed(self._chain[-n:]))

    def verify_chain_integrity(self) -> bool:
        """Verify that the hash chain is unbroken (simple tamper detection)."""
        self._load()
        for i, block in enumerate(self._chain):
            expected_hash = _compute_block_hash(block)
            if block["block_hash"] != expected_hash:
                return False
            if i > 0:
                if block["prev_hash"] != self._chain[i - 1]["block_hash"]:
                    return False
        return True

    def get_stats(self) -> Dict[str, Any]:
        """Return public ledger statistics."""
        self._load()
        event_types = {}
        for b in self._chain:
            et = b.get("event_type", "UNKNOWN")
            event_types[et] = event_types.get(et, 0) + 1
        return {
            "total_blocks": len(self._chain),
            "event_breakdown": event_types,
            "chain_valid": self.verify_chain_integrity(),
            "genesis_hash": GENESIS_HASH[:16] + "...",
            "latest_hash": self._chain[-1]["block_hash"][:16] + "..." if self._chain else None,
        }


# Singleton instance
ledger = BlockchainLedger()
