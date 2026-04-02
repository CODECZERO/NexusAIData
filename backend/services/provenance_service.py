import hashlib
import json
import os
from datetime import datetime
from typing import Dict, Any, List

from loguru import logger
from blockchain.ledger import ledger
from blockchain.zk_proofs import ZKProofEngine
from blockchain.identity import hash_session_id

class ProvenanceService:
    """
    Manages Zero-Knowledge Data Provenance.
    Handles the transformation logic and submits lineage commitments to the ledger.
    """

    def generate_operation_hash(self, operation: str, parameters: Dict[str, Any]) -> str:
        """Deterministically hashes an operation and its parameters."""
        payload = json.dumps({"op": operation, "params": parameters}, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()

    async def record_lineage(
        self,
        session_id: str,
        parent_id: str,
        child_hash: str,
        operation: str,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Records a data lineage transformation event securely.
        """
        session_hash = hash_session_id(session_id)
        is_root = (parent_id == "0" * 32 or not parent_id)
        
        op_hash = self.generate_operation_hash(operation, parameters) if not is_root else "0" * 64

        commit_id = f"CMT-{os.urandom(6).hex().upper()}"

        public_metadata = {
            "commit_id": commit_id,
            "parent_id": parent_id if not is_root else None,
            "child_hash_commit": child_hash[:16] + "...",  # Store partial on public ledger
            "operation_hash": op_hash,
            "is_root": is_root,
        }

        # ZK Proof that the transformation was computed correctly
        proof = ZKProofEngine.generate_full_proof(
            private_data={
                "session_id": session_id,
                "child_hash_full": child_hash,
                "operation": operation,
                "parameters": parameters,
            },
            public_inputs=public_metadata,
        )

        # Call actual Midnight Smart Contract Bridge
        bridge_tx = None
        try:
            import httpx
            async with httpx.AsyncClient(timeout=45.0) as client:
                body = {
                    "sessionSalt": session_id,
                    "isRoot": is_root,
                    "parentId": parent_id if not is_root else "0"*32,
                    "childHash": child_hash,
                    "operationHash": op_hash
                }
                bridge_url = os.getenv("MIDNIGHT_BRIDGE_URL")
                res = await client.post(f"{bridge_url}/provenance", json=body)
                res.raise_for_status()
                bridge_tx = res.json().get("transactionId")
        except Exception as e:
            logger.error(f"Bridge /provenance call failed: {e}")
            # Non-blocking for now so UI doesn't break if node is syncing
            pass

        block = ledger.submit(
            session_id_hash=session_hash,
            event_type="PROVENANCE_COMMIT",
            zk_proof={"proof_id": commit_id, "verified": bridge_tx is not None, "tx": bridge_tx, **proof},
            public_metadata=public_metadata,
        )

        return {
            "success": True,
            "commit_id": commit_id,
            "parent_id": parent_id,
            "block_number": block["block_number"],
            "transaction_hash": bridge_tx or block["block_hash"]
        }

    def verify_lineage(self, commit_id: str) -> Dict[str, Any]:
        """
        Traverses the lineage DAG backward from a given commit_id.
        """
        blocks = ledger.get_all()
        
        # 1. Build an index of all provenance commits
        commits = {}
        for b in blocks:
            if b["event_type"] == "PROVENANCE_COMMIT":
                meta = b["public_metadata"]
                cid = meta.get("commit_id")
                if cid:
                    commits[cid] = b
                    
        # 2. Traverse
        if commit_id not in commits:
            return {"success": False, "error": f"Commit {commit_id} not found."}
            
        history = []
        current_id = commit_id
        
        while current_id:
            node = commits.get(current_id)
            if not node:
                break
                
            meta = node["public_metadata"]
            history.append({
                "commit_id": current_id,
                "parent_id": meta.get("parent_id"),
                "operation_hash": meta.get("operation_hash"),
                "child_hash_commit": meta.get("child_hash_commit"),
                "timestamp": node["timestamp"],
                "verified_zk": node["zk_proof"]["verified"]
            })
            
            current_id = meta.get("parent_id")
            
        return {
            "success": True,
            "root_distance": len(history) - 1,
            "history": history
        }

provenance_service = ProvenanceService()
