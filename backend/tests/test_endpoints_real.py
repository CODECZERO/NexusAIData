import pytest
from fastapi.testclient import TestClient
from main import app
import os

client = TestClient(app)

@pytest.fixture(scope="module")
def real_session():
    # 1. Upload the real test dataset
    dataset_path = "/home/codeczero/Desktop/FullStack/NexusAIData/lumina_test_dataset.csv"
    if not os.path.exists(dataset_path):
        pytest.skip("Test dataset not found.")
        
    with open(dataset_path, "rb") as f:
        # Use filename 'lumina_test_dataset.csv'
        files = {"file": ("lumina_test_dataset.csv", f, "text/csv")}
        response = client.post("/api/upload", files=files)
        
    assert response.status_code == 200, f"Upload failed: {response.text}"
    session_id = response.json()["session_id"]
    return session_id

def test_data_health(real_session):
    response = client.get(f"/api/data/{real_session}/health")
    assert response.status_code == 200, f"Health API failed: {response.text}"
    data = response.json()
    assert "quality_score" in data
    print("Health check passed. Score:", data["quality_score"])

def test_forecast(real_session):
    response = client.get(
        f"/api/data/{real_session}/forecast",
        params={
            "target_col": "Row ID", # using a real column from dataset
            "date_col": "Order Date",
            "stride": "months",
            "horizon": 6
        }
    )
    assert response.status_code == 200, f"Forecast API failed: {response.text}"
    data = response.json()
    assert "forecast" in data

def test_pivot(real_session):
    response = client.post(
        f"/api/data/{real_session}/pivot",
        json={
            "rows": ["Category"],
            "columns": ["Region"],
            "values": ["Sales"],
            "agg_func": "sum"
        }
    )
    assert response.status_code == 200, f"Pivot API failed: {response.text}"
    data = response.json()
    assert "data" in data

def test_pivot_non_numeric(real_session):
    response = client.post(
        f"/api/data/{real_session}/pivot",
        json={
            "rows": ["Category"],
            "columns": ["Region"],
            "values": ["Ship Mode"], # Non-numeric initially
            "agg_func": "sum"
        }
    )
    # the service attempts auto-coercion, if it fails, it skips. 
    # If no metrics are valid, it raises ValueError -> 400.
    assert response.status_code in [200, 400], f"Pivot API non-numeric failed: {response.text}"
