import requests
import os
import sys

BASE_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

def run_tests():
    print(f"Checking if server is alive at {BASE_URL}/api/health...")
    try:
        health_res = requests.get(f"{BASE_URL}/api/health", timeout=5)
        print(f"Health Response: {health_res.status_code}")
    except Exception as e:
        print(f"Server is down or blocking: {e}")
        sys.exit(1)

    dataset_path = "/home/codeczero/Desktop/FullStack/NexusAIData/lumina_test_dataset.csv"
    if not os.path.exists(dataset_path):
        print("Test dataset not found.")
        sys.exit(1)
        
    print("Uploading dataset...")
    with open(dataset_path, "rb") as f:
        files = {"file": ("lumina_test_dataset.csv", f, "text/csv")}
        response = requests.post(f"{BASE_URL}/api/upload", files=files, timeout=10)
        
    if response.status_code != 200:
        print(f"Upload failed: {response.text}")
        sys.exit(1)
        
    session_id = response.json().get("session_id")
    print(f"Upload successful. Session ID: {session_id}")

    print("Testing Data Health API...")
    res = requests.get(f"{BASE_URL}/api/data/{session_id}/health", timeout=10)
    print(f"Health check status: {res.status_code}, length: {len(res.text)}")

    print("Testing Forecast API...")
    res = requests.get(
        f"{BASE_URL}/api/data/{session_id}/forecast",
        params={
            "target_col": "Row ID",
            "date_col": "Order Date",
            "stride": "months",
            "horizon": 6
        }, timeout=10
    )
    print(f"Forecast API status: {res.status_code}, response preview: {res.text[:100]}")

    print("Testing Pivot API...")
    res = requests.post(
        f"{BASE_URL}/api/data/{session_id}/pivot",
        json={
            "rows": ["Category"],
            "columns": ["Region"],
            "values": ["Sales"],
            "agg_func": "sum"
        }, timeout=10
    )
    print(f"Pivot API status: {res.status_code}, response preview: {res.text[:100]}")

    print("Testing Pivot API (Non-numeric auto-coerce)...")
    res = requests.post(
        f"{BASE_URL}/api/data/{session_id}/pivot",
        json={
            "rows": ["Category"],
            "columns": ["Region"],
            "values": ["Ship Mode"],
            "agg_func": "sum"
        }, timeout=10
    )
    print(f"Pivot non-numeric status: {res.status_code}, response preview: {res.text[:100]}")
    print("All live tests completed.")

if __name__ == "__main__":
    run_tests()
