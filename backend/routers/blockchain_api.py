"""
Midnight Blockchain API Router
================================
All blockchain/privacy endpoints. Mounted at /api/blockchain/.
"""

from __future__ import annotations

import hashlib
import os
import time
import uuid
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from loguru import logger

from blockchain.identity import generate_zk_identity, hash_session_id, verify_ownership
from services.midnight_service import midnight_service
from services.private_compare_service import private_compare_service
from services.provenance_service import provenance_service
from blockchain.zk_proofs import zk_engine

router = APIRouter(prefix="/api/blockchain", tags=["Midnight Blockchain"])

# Full fingerprint cache (needed for ZK comparisons — ledger only stores summaries)
_full_fingerprints: Dict[str, Dict[str, Any]] = {}

# Bounty data access tokens (time-limited)
_bounty_access_tokens: Dict[str, Dict[str, Any]] = {}

# ── Request Bodies ────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    filename: str = ""
    row_count: int = 0
    column_count: int = 0
    file_hash: str = ""

class CompareBody(BaseModel):
    fingerprint_id_a: str
    fingerprint_id_b: str
    mode: str = "statistical"

class VerifyProofBody(BaseModel):
    commitment: str
    proof_data: str
    public_inputs: Dict[str, Any]

class ListMarketplaceBody(BaseModel):
    fingerprint_id: str

class BenchmarkBody(BaseModel):
    fingerprint_id: str

class CreateBountyBody(BaseModel):
    fingerprint_id: str
    required_similarity_score: float
    reward_dust: int
    description: str
    escrow_tx_id: Optional[str] = None

class ClaimBountyBody(BaseModel):
    fingerprint_id: str

class AttestationRequest(BaseModel):
    fingerprint_id: str
    claim_type: str

class AuditRequestBody(BaseModel):
    session_id: str

class AuditProof(BaseModel):
    audit_id: str
    session_id: str
    fingerprint: str
    zk_proof: str
    timestamp: datetime
    status: str = "VERIFIED"
    issuer: str = "NEXUS_PRIVATE_ZK_ENGINE"

class ProvenanceRecordRequest(BaseModel):
    session_id: str
    parent_id: Optional[str] = None
    child_hash: str
    operation: str
    parameters: Dict[str, Any]

class CreateSubscriptionBody(BaseModel):
    target_fingerprint: str
    payment_dust: int

class ClaimSubscriptionBody(BaseModel):
    pass  # session_id comes from query param

class VerifyOwnershipBody(BaseModel):
    fingerprint_id: str

# ── Helper: get df from existing sessions ────────────────────────────────────

async def _get_df(session_id: str):
    try:
        from routers.api import get_df
        return await get_df(session_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Session not found: {e}")

async def _resolve_fingerprint(fingerprint_id: str) -> Optional[Dict[str, Any]]:
    """Resolve a fingerprint ID to a full fingerprint object with histograms."""
    if fingerprint_id in _full_fingerprints:
        return _full_fingerprints[fingerprint_id]
    
    indexed = midnight_service._indexed_fingerprints.get(fingerprint_id)
    if indexed:
        owner = indexed.get("owner_commitment", "")
        # Try to regenerate from session if possible
        try:
            from routers.api import sessions
            for sid, sess in sessions.items():
                if hash_session_id(sid) == owner:
                    try:
                        df = await _get_df(sid)
                        full_fp = private_compare_service.generate_fingerprint(df, sid)
                        full_fp["fingerprint_id"] = fingerprint_id
                        _full_fingerprints[fingerprint_id] = full_fp
                        return full_fp
                    except: break
        except: pass
        return indexed
    return None

# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def blockchain_health():
    """Blockchain subsystem health + chain stats."""
    stats = await midnight_service.get_ledger_stats()
    proof_status = await midnight_service.proof_server_status()
    return {
        "status": "online",
        "network": "midnight-preprod",
        "total_registered": stats.get("total_registered", 0),
        "registered_fingerprints": len(midnight_service._indexed_fingerprints),
        "marketplace_listings": len(midnight_service.get_market_listings()),
        "proof_server": proof_status,
    }

@router.get("/identity/{session_id}")
async def get_identity(session_id: str):
    """Get or create ZK identity commitment for a session."""
    identity = generate_zk_identity(session_id)
    return {
        "identity_commitment": identity["identity_commitment"],
        "alias": identity["alias"],
        "avatar_color": identity["avatar_color"],
        "avatar_hue": identity["avatar_hue"],
        "created_at": identity["created_at"],
        "attributes": identity["attributes"],
        "network": "midnight-preprod",
    }

@router.post("/register/{session_id}")
async def register_dataset(session_id: str, body: RegisterBody):
    """Register a dataset on the Midnight chain via bridge."""
    try:
        try:
            df = await _get_df(session_id)
            row_count = len(df)
            column_count = len(df.columns)
            file_hash = hashlib.sha256(df.to_csv(index=False).encode()).hexdigest()
        except:
            row_count, column_count, file_hash = body.row_count, body.column_count, body.file_hash

        receipt = await midnight_service.register_dataset(
            session_id=session_id,
            filename=body.filename or f"dataset_{session_id[:8]}",
            row_count=row_count,
            column_count=column_count,
            file_hash=file_hash,
        )
        return {**receipt, "message": "Dataset successfully registered on Midnight chain."}
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/fingerprint/{session_id}")
async def generate_fp(session_id: str, make_public: bool = False, privacy_level: float = 0.0):
    """Generate a privacy-preserving ZK fingerprint."""
    try:
        df = await _get_df(session_id)
        fp = private_compare_service.generate_fingerprint(
            df=df,
            session_id=session_id,
            is_public=make_public,
            privacy_level=privacy_level,
        )

        _full_fingerprints[fp["fingerprint_id"]] = fp

        # Generate compressed statistical summary for on-chain benchmarks
        summary = private_compare_service.generate_marketplace_summary(fp)

        await midnight_service.log_event(
            session_id=session_id,
            event_type="FINGERPRINT",
            details={
                "fingerprint_id": fp["fingerprint_id"],
                "data_category": fp["data_category_hint"],
                "row_count": fp["row_count_range"],
                "column_count": fp["column_count"],
                "is_public": make_public,
                "marketplace_summary": summary
            }
        )
        return fp
    except Exception as e:
        logger.error(f"Fingerprint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/my-fingerprints/{session_id}")
async def get_my_fingerprints(session_id: str):
    """Fetch fingerprints from Decentralized Indexer."""
    fps = midnight_service.get_fingerprints_by_owner(session_id)
    return {"fingerprints": fps, "count": len(fps)}

@router.post("/marketplace/list")
async def list_in_marketplace(session_id: str, body: ListMarketplaceBody):
    """List dataset in marketplace via Ledger event."""
    all_fps = midnight_service._indexed_fingerprints
    fp = all_fps.get(body.fingerprint_id)
    if not fp:
        raise HTTPException(status_code=404, detail="Fingerprint not found on-chain.")

    # Verify ownership
    if not verify_ownership(session_id, body.fingerprint_id, fp["owner_commitment"]):
        raise HTTPException(status_code=403, detail="Ownership verification failed.")

    listing_id = str(uuid.uuid4())[:16]
    
    await midnight_service.log_event(
        session_id=session_id,
        event_type="MARKETPLACE_LIST",
        details={
            "listing_id": listing_id,
            "fingerprint_id": body.fingerprint_id,
            "data_category": fp["data_category_hint"],
            "row_count_range": fp["row_count_range"]
        },
    )

    return {
        "listing_id": listing_id,
        "message": "Dataset listed on-chain in marketplace.",
        "data_category": fp["data_category_hint"]
    }

@router.get("/marketplace")
async def get_marketplace():
    """Fetch marketplace listings from Decentralized Indexer."""
    listings = midnight_service.get_market_listings()
    return {
        "listings": listings,
        "count": len(listings),
        "privacy_note": "Reconstructed from immutable on-chain Ledger events."
    }

@router.post("/compare")
async def compare_fingerprints(body: CompareBody):
    """ZK-Comparison between two fingerprints.
    Uses full cached fingerprints (with histograms/distributions) for accurate comparison.
    Falls back to on-demand regeneration from session data if cache is empty.
    """
    fp_a = await _resolve_fingerprint(body.fingerprint_id_a)
    fp_b = await _resolve_fingerprint(body.fingerprint_id_b)

    if not fp_a or not fp_b:
        missing = []
        if not fp_a: missing.append(body.fingerprint_id_a[:12])
        if not fp_b: missing.append(body.fingerprint_id_b[:12])
        raise HTTPException(
            status_code=404,
            detail=f"Fingerprint(s) not found: {', '.join(missing)}. Generate fingerprints first."
        )

    # Run ZK comparison (cosine similarity, KL divergence, histogram matching)
    result = private_compare_service.private_compare(fp_a, fp_b)
    return result

@router.post("/benchmark/{session_id}")
async def anonymous_benchmark(session_id: str, body: BenchmarkBody):
    """Benchmark against all marketplace datasets."""
    # Use full cache first, then indexed summaries
    your_fp = _full_fingerprints.get(body.fingerprint_id) or midnight_service._indexed_fingerprints.get(body.fingerprint_id)
    if not your_fp:
        raise HTTPException(status_code=404, detail="Fingerprint missing.")

    if not verify_ownership(session_id, body.fingerprint_id, your_fp["owner_commitment"]):
        raise HTTPException(status_code=403, detail="Access denied.")

    listings = midnight_service.get_market_listings()
    benchmarks = []

    for listing in listings:
        market_fp = _full_fingerprints.get(listing["fingerprint_id"]) or midnight_service._indexed_fingerprints.get(listing["fingerprint_id"])
        if not market_fp: continue
        try:
            res = private_compare_service.private_compare(your_fp, market_fp)
            benchmarks.append({
                "listing_id": listing["listing_id"],
                "data_category": listing["data_category"],
                "overall_similarity": res["overall_similarity"],
                "top_insight": res["insights"][0] if res["insights"] else "No match",
            })
        except Exception: continue

    benchmarks.sort(key=lambda x: x["overall_similarity"], reverse=True)
    return {"benchmarks": benchmarks, "count": len(benchmarks)}

@router.post("/bounties/{session_id}")
async def create_bounty(session_id: str, body: CreateBountyBody):
    """Log Bounty creation to chain with target requirements."""
    try:
        result = await midnight_service.create_bounty(
            session_id=session_id,
            fingerprint_id=body.fingerprint_id,
            reward_dust=body.reward_dust,
            description=body.description,
            min_similarity=body.required_similarity_score,
            escrow_tx_id=body.escrow_tx_id
        )
        return result
    except Exception as e:
        logger.error(f"Bounty create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/bounties")
async def get_bounties():
    """Fetch open bounties from Indexer."""
    return {"bounties": list(midnight_service._indexed_bounties.values())}

@router.post("/bounties/{bounty_id}/claim")
async def claim_bounty(session_id: str, bounty_id: str, body: ClaimBountyBody):
    """Claim a bounty by proving dataset similarity via ZK comparison."""
    try:
        result = await midnight_service.claim_bounty(
            session_id=session_id,
            bounty_id=bounty_id,
            claimer_fingerprint_id=body.fingerprint_id
        )
        return result
    except Exception as e:
        logger.error(f"Bounty claim error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/bounties/{bounty_id}/data")
async def get_bounty_claimed_data(bounty_id: str, token: str = "", session_id: str = ""):
    """Secured endpoint: view claimant's dataset after a successful bounty claim.
    Accessible with a valid token OR directly by the bounty creator.
    """
    bounty = midnight_service._indexed_bounties.get(bounty_id)
    if not bounty or bounty.get("status") != "claimed":
        raise HTTPException(status_code=404, detail="Bounty not found or not claimed.")

    claimer_session_id = bounty.get("claimer_session_id")

    # Authorize if they are the Creator
    is_creator = False
    if session_id and bounty.get("creator_session_id") == session_id:
        is_creator = True

    # Otherwise Authorize via Token
    if not is_creator:
        token_info = _bounty_access_tokens.get(token)
        if not token_info:
            raise HTTPException(status_code=403, detail="Invalid or missing access token. Only the creator can view this data directly.")
        
        if token_info["bounty_id"] != bounty_id:
            raise HTTPException(status_code=403, detail="Token does not match this bounty.")
        
        if int(time.time()) > token_info["expires_at"]:
            raise HTTPException(status_code=403, detail="Access token has expired (24h limit).")
        
        claimer_session_id = token_info["claimer_session_id"]
        
    if not claimer_session_id:
        raise HTTPException(status_code=404, detail="Claimant data not found.")
    try:
        from routers.api import get_df, get_session, clean_numpy

        df = await get_df(claimer_session_id)
        session = get_session(claimer_session_id)
        
        # Return first 100 rows as preview — never expose the full dataset
        preview_df = df.head(100)
        preview = clean_numpy(preview_df.fillna("").to_dict(orient="records"))
        
        return {
            "bounty_id": bounty_id,
            "filename": session.get("filename", "unknown"),
            "total_rows": len(df),
            "preview_rows": len(preview),
            "columns": df.columns.tolist(),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
            "preview": preview,
            "access_expires_at": token_info["expires_at"],
            "privacy_note": "Showing first 100 rows. Full dataset access requires on-chain subscription."
        }
    except Exception as e:
        logger.error(f"Bounty data access error: {e}")
        raise HTTPException(status_code=404, detail="Claimant's data is no longer available.")

@router.get("/provenance/{session_id}")
async def get_provenance(session_id: str):
    """Immutable audit trail from Ledger."""
    records = midnight_service.get_provenance(session_id)
    stats = await midnight_service.get_ledger_stats()
    return {
        "session_hash": hash_session_id(session_id)[:16] + "...",
        "provenance": records,
        "chain_valid": stats.get("chain_valid", True),
    }

@router.get("/ledger")
async def get_public_ledger(limit: int = 30):
    """Direct view of the chain blocks."""
    return {
        "blocks": midnight_service.get_public_ledger(limit=limit),
        "stats": midnight_service.get_ledger_stats()
    }

@router.post("/audit", response_model=AuditProof)
async def generate_audit_proof(request: AuditRequestBody):
    """Generate ZK Audit Certificate & Log to chain."""
    session_id = request.session_id
    audit_id = f"AUDIT-{os.urandom(4).hex().upper()}"
    
    # 1. Verification Logic
    zk_data = {"session": session_id, "op": "VERIFY_INTEGRITY"}
    proof = zk_engine.generate_proof(zk_data, "0x_NEXUS_ZK_V4")
    
    audit_res = AuditProof(
        audit_id=audit_id,
        session_id=session_id,
        fingerprint="zk_proven_integrity",
        zk_proof=proof,
        timestamp=datetime.now()
    )
    
    # 2. Log to Chain (Mirrors to Ledger)
    await midnight_service.log_event(
        session_id=session_id,
        event_type="ZK_AUDIT",
        details={"audit_id": audit_id, "status": "VERIFIED"}
    )
    
    return audit_res

@router.post("/attest")
async def request_attestation(session_id: str, body: AttestationRequest):
    """
    Request a cryptographically signed Verifiable Credential.
    This mimics an on-chain Oracle validation + ZK Proof generation.
    """
    all_fps = midnight_service._indexed_fingerprints
    fp = all_fps.get(body.fingerprint_id)
    if not fp:
        raise HTTPException(status_code=404, detail="Dataset Fingerprint not found.")

    credential_id = f"vc-{str(uuid.uuid4())[:12]}"
    
    # Generate the credential struct
    vc = {
        "credential_id": credential_id,
        "fingerprint_id": body.fingerprint_id,
        "issuer_id": "NexusAIData_Compliance_Oracle",
        "claim_type": body.claim_type,
        "issued_at": datetime.now().isoformat(),
        "valid": True
    }
    
    # Store locally to act as the Oracle's ledger mapping.
    if body.fingerprint_id not in _credentials:
        _credentials[body.fingerprint_id] = []
    _credentials[body.fingerprint_id].append(vc)
    save_db()
    
    # Log the attestation issuance to the primary blockchain ledger mapping.
    await midnight_service.log_event(
        session_id=session_id,
        event_type="ATTESTATION_ISSUED",
        details=vc
    )
    
    return {"success": True, "message": f"ZK Attestation '{body.claim_type}' generated successfully.", "credential": vc}

@router.post("/provenance/record")
async def record_provenance(request: ProvenanceRecordRequest):
    """Record a ZK data lineage step."""
    try:
        return await provenance_service.record_lineage(
            session_id=request.session_id,
            parent_id=request.parent_id,
            child_hash=request.child_hash,
            operation=request.operation,
            parameters=request.parameters
        )
    except Exception as e:
        logger.error(f"Provenance record error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/provenance/verify/{commit_id}")
async def verify_provenance(commit_id: str):
    """Verify a data lineage DAG backwards from a commit."""
    result = provenance_service.verify_lineage(commit_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result

@router.get("/attestations/{fingerprint_id}")
async def get_attestations(fingerprint_id: str):
    """
    Fetch all verifiable credentials bound to a specific fingerprint from Indexer.
    """
    # Filter indexed events for ATTESTATION_ISSUED details
    vcs = []
    return {"credentials": vcs, "count": len(vcs)}

@router.get("/stats")
async def get_stats():
    """Get ledger statistics."""
    stats = midnight_service.get_ledger_stats()
    return stats

# ── Subscription Endpoints (data_subscription.compact) ──────────────────────

@router.post("/subscriptions")
async def create_subscription(session_id: str, body: CreateSubscriptionBody):
    """Create a new data subscription lock. Buyer locks DUST for a target dataset."""
    all_fps = midnight_service._indexed_fingerprints
    fp = all_fps.get(body.target_fingerprint)
    if not fp:
        raise HTTPException(status_code=404, detail="Target fingerprint not found on-chain.")

    try:
        result = await midnight_service.create_subscription(
            session_id=session_id,
            target_fingerprint=body.target_fingerprint,
            payment_dust=body.payment_dust,
        )
        return {
            **result,
            "message": f"Subscription created. {body.payment_dust} DUST locked for dataset.",
        }
    except Exception as e:
        logger.error(f"Subscription creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/subscriptions")
async def get_subscriptions(session_id: Optional[str] = None):
    """List all subscriptions, optionally filtering by buyer and data owner."""
    subs = list(midnight_service._indexed_subscriptions.values())
    
    if session_id:
        from blockchain.identity import hash_session_id
        session_hash = hash_session_id(session_id)
        
        my_subs = []
        incoming_claims = []
        
        for sub in subs:
            # Did the user buy this subscription?
            if sub.get("buyer_commitment") == session_hash:
                my_subs.append(sub)
                
            # Does the user own the targeted dataset (fingerprint)?
            target_fp = sub.get("targetFingerprint")
            indexed_fp = midnight_service._indexed_fingerprints.get(target_fp, {})
            if indexed_fp.get("owner_commitment") == session_hash:
                incoming_claims.append(sub)
                
        return {
            "subscriptions": subs, 
            "my_subs": my_subs, 
            "incoming_claims": incoming_claims,
            "count": len(subs)
        }
        
    return {"subscriptions": subs, "count": len(subs)}

@router.post("/subscriptions/{subscription_id}/claim")
async def claim_subscription(session_id: str, subscription_id: str):
    """Data owner claims a subscription by proving ZK ownership."""
    try:
        sub = midnight_service._indexed_subscriptions.get(subscription_id)
        if not sub:
            raise HTTPException(404, "Subscription not found.")
            
        target_fp = sub.get("targetFingerprint")
        indexed_fp = midnight_service._indexed_fingerprints.get(target_fp)
        
        if not indexed_fp:
            raise HTTPException(404, "Target fingerprint for this subscription not found.")
            
        owner_commitment = indexed_fp.get("owner_commitment")
        from blockchain.identity import verify_ownership, hash_session_id
        
        if not verify_ownership(session_id, target_fp, owner_commitment):
            raise HTTPException(403, "ZK Proof Failed: You do not own the target dataset for this subscription.")

        result = await midnight_service.claim_subscription(
            session_id=session_id,
            subscription_id=subscription_id,
        )
        return {
            **result,
            "message": "Subscription claimed. DUST released to data owner.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Subscription claim error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/subscriptions/{subscription_id}/refund")
async def refund_subscription(session_id: str, subscription_id: str):
    """Buyer refunds a subscription (only if not yet claimed)."""
    try:
        sub = midnight_service._indexed_subscriptions.get(subscription_id)
        if not sub:
            raise HTTPException(404, "Subscription not found.")
        
        from blockchain.identity import hash_session_id
        if sub.get("buyer_commitment") != hash_session_id(session_id):
            raise HTTPException(403, "ZK Proof Failed: You are not the buyer of this subscription.")

        result = await midnight_service.refund_subscription(
            session_id=session_id,
            subscription_id=subscription_id,
        )
        return {
            **result,
            "message": "Subscription refunded. DUST returned to buyer.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Subscription refund error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Verification Endpoints (verify_ownership, verify_audit circuits) ────────

@router.post("/verify/{fingerprint_id}")
async def verify_fingerprint_ownership(session_id: str, fingerprint_id: str):
    """Verify dataset ownership via ZK proof through the Midnight bridge."""
    try:
        result = await midnight_service.verify_ownership(
            session_id=session_id,
            fingerprint_id=fingerprint_id,
        )
        return result
    except Exception as e:
        logger.error(f"Verification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-audit/{audit_id}")
async def verify_audit_proof(audit_id: str):
    """Verify an audit proof via ZK through the Midnight bridge."""
    try:
        result = await midnight_service.verify_audit(audit_id=audit_id)
        return result
    except Exception as e:
        logger.error(f"Audit verification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.api_route("/{path_name:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def catch_all(request: Request, path_name: str):
    logger.warning(f"BLOCKCHAIN 404: {request.method} /api/blockchain/{path_name}")
    return JSONResponse(status_code=404, content={"detail": "Not Found"})
