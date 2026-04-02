import pytest
from fastapi.testclient import TestClient
from main import app  # Assuming main.py exports `app` FastApi instance

client = TestClient(app)

def test_blockchain_health():
    response = client.get("/api/blockchain/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["online", "active"]
    assert "network" in data

def test_zk_identity_flow():
    session_id = "test-session-123"
    response = client.get(f"/api/blockchain/identity/{session_id}")
    assert response.status_code == 200
    data = response.json()
    assert "identity_commitment" in data
    assert "alias" in data

def test_register_and_fingerprint():
    session_id = "test-session-456"
    # 1. Register Mock Data
    reg_res = client.post(f"/api/blockchain/register/{session_id}", json={
        "filename": "clinical_trials.csv",
        "row_count": 1000,
        "column_count": 10
    })
    assert reg_res.status_code == 200

    # 2. Generate Fingerprint
    fp_res = client.post(f"/api/blockchain/fingerprint/{session_id}?make_public=false")
    assert fp_res.status_code == 200
    fp_data = fp_res.json()
    assert "fingerprint_id" in fp_data

    fp_id = fp_data["fingerprint_id"]

    # 3. Create Bounty
    bounty_res = client.post(f"/api/blockchain/bounties?session_id={session_id}", json={
        "fingerprint_id": fp_id,
        "reward_dust": 20,
        "required_similarity_score": 0.9,
        "description": "Looking for medical data"
    })
    assert bounty_res.status_code == 200

    # 4. Request Attestation Credential
    attest_res = client.post(f"/api/blockchain/attest?session_id={session_id}", json={
        "fingerprint_id": fp_id,
        "claim_type": "HIPAA_COMPLIANT"
    })
    assert attest_res.status_code == 200
    assert attest_res.json()["success"] == True

def test_zk_audit():
    session_id = "audit-session-789"
    # Generate Audit Proof
    response = client.post("/api/blockchain/audit", json={
        "session_id": session_id
    })
    assert response.status_code == 200
    data = response.json()
    assert "audit_id" in data
    assert "zk_proof" in data
    assert data["session_id"] == session_id
    assert data["status"] == "VERIFIED"
