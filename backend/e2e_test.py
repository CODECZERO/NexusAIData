import requests
import time
import json
import os
import pandas as pd
import io

BASE_URL = os.getenv("BACKEND_URL", "http://localhost:8000") + "/api"
TEST_DATA_DIR = "../testData"

def upload_file(filepath):
    print(f"Uploading {os.path.basename(filepath)}...")
    url = f"{BASE_URL}/upload"
    with open(filepath, 'rb') as f:
        files = {'file': f}
        res = requests.post(url, files=files)
    assert res.status_code == 200, f"Upload failed: {res.text}"
    sid = res.json()['session_id']
    print(f"Upload success: sid={sid}")
    return sid

def generate_fid(sid, privacy=0.1, make_public=True):
    print(f"Generating Fingerprint (privacy={privacy})...")
    url = f"{BASE_URL}/blockchain/fingerprint/{sid}?make_public={str(make_public).lower()}&privacy_level={privacy}"
    res = requests.post(url)
    assert res.status_code == 200, f"Fingerprint failed: {res.text}"
    fid = res.json()['fingerprint_id']
    print(f"FID: {fid}")
    return fid

def compare_fids(fid_a, fid_b):
    print(f"Comparing {fid_a[:8]}... vs {fid_b[:8]}...")
    url = f"{BASE_URL}/blockchain/compare"
    payload = {"fingerprint_id_a": fid_a, "fingerprint_id_b": fid_b}
    res = requests.post(url, json=payload)
    assert res.status_code == 200, f"Comparison failed: {res.text}"
    data = res.json()
    print(f"Result: Similarity={data['overall_similarity']:.4f}")
    return data

def scenario_multi_domain():
    print("\n--- SCENARIO A: Multi-Domain Comparison ---")
    sid_retail = upload_file(os.path.join(TEST_DATA_DIR, "train.csv"))
    sid_medical = upload_file(os.path.join(TEST_DATA_DIR, "lumina_test_dataset.csv"))
    
    fid_retail = generate_fid(sid_retail, privacy=0.1)
    fid_medical = generate_fid(sid_medical, privacy=0.1)
    
    result = compare_fids(fid_retail, fid_medical)
    # Expecting low similarity as they are different domains
    print(f"Observation: Cross-domain similarity is {result['overall_similarity']:.4f}")

def scenario_privacy_scaling():
    print("\n--- SCENARIO B: Privacy Scaling Impact ---")
    sid = upload_file(os.path.join(TEST_DATA_DIR, "train.csv"))
    
    print("Generating three levels of privacy...")
    fid_low = generate_fid(sid, privacy=0.1)   # Low noise
    fid_med = generate_fid(sid, privacy=0.5)   # Med noise
    fid_high = generate_fid(sid, privacy=0.9)  # High noise
    
    print("\nComparing Low-Privacy (0.1) vs Med-Privacy (0.5) of SAME data:")
    res_1 = compare_fids(fid_low, fid_med)
    
    print("\nComparing Low-Privacy (0.1) vs High-Privacy (0.9) of SAME data:")
    res_2 = compare_fids(fid_low, fid_high)
    
    print(f"Divergence: {res_1['overall_similarity']:.4f} (Med) vs {res_2['overall_similarity']:.4f} (High)")
    assert res_1['overall_similarity'] >= res_2['overall_similarity'], "Higher privacy should generally result in lower similarity match to baseline"

def scenario_schema_drift():
    print("\n--- SCENARIO C: Schema Robustness (Drift) ---")
    # Load train.csv, rename columns, save to temp
    df = pd.read_csv(os.path.join(TEST_DATA_DIR, "train.csv"))
    original_cols = df.columns.tolist()
    
    # Drift: Rename some key columns
    mapping = {
        "Sales": "Revenue",
        "Quantity": "UnitsSold",
        "Profit": "NetIncome",
        "Category": "Department"
    }
    df_drifted = df.rename(columns=mapping)
    drift_path = os.path.join(TEST_DATA_DIR, "train_drifted.csv")
    df_drifted.to_csv(drift_path, index=False)
    
    print(f"Created drifted dataset with mapped columns: {list(mapping.values())}")
    
    sid_orig = upload_file(os.path.join(TEST_DATA_DIR, "train.csv"))
    sid_drift = upload_file(drift_path)
    
    fid_orig = generate_fid(sid_orig, privacy=0.1)
    fid_drift = generate_fid(sid_drift, privacy=0.1)
    
    print("\nComparing Original vs Drifted (Renamed Columns):")
    result = compare_fids(fid_orig, fid_drift)
    
    print(f"Robustness: Similarity is {result['overall_similarity']:.4f} despite renaming {len(mapping)} columns.")
    
    # Cleanup
    if os.path.exists(drift_path):
        os.remove(drift_path)

if __name__ == "__main__":
    try:
        print("STARTING NEXUSAIDATA REAL-WORLD E2E TEST SUITE")
        
        scenario_multi_domain()
        scenario_privacy_scaling()
        scenario_schema_drift()
        
        print("\nALL REAL-WORLD SCENARIOS PASSED SUCCESSFULLY")
    except Exception as e:
        print(f"\nTEST SUITE FAILED: {e}")
        import traceback
        traceback.print_exc()
