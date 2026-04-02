"""
Lumina AI — LLM Diagnostic Test Script
Tests connectivity, auth, model, streaming, and insight generation.
Run: python test_llm.py
"""

import os
import sys
import time
import json

# Load .env manually
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ[key.strip()] = val.strip()

import requests

API_KEY = os.getenv("NVIDIA_API_KEY", "")
MODEL = os.getenv("NVIDIA_MODEL", "nvidia/llama-3.3-nemotron-super-49b-v1")
URL = "https://integrate.api.nvidia.com/v1/chat/completions"

HEADERS = {
    "accept": "application/json",
    "content-type": "application/json",
    "authorization": f"Bearer {API_KEY}",
}

def sep(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def test_1_env():
    """Check environment variables."""
    sep("TEST 1: Environment Variables")
    print(f"  NVIDIA_API_KEY: {'SET (' + API_KEY[:12] + '...' + API_KEY[-4:] + ')' if API_KEY else 'NOT SET'}")
    print(f"  NVIDIA_MODEL:   {MODEL}")
    print(f"  API URL:        {URL}")
    if not API_KEY:
        print("\n  FATAL: No API key. Set NVIDIA_API_KEY in .env")
        return False
    return True

def test_2_connectivity():
    """Test basic HTTPS connectivity to NVIDIA."""
    sep("TEST 2: Network Connectivity")
    try:
        start = time.time()
        resp = requests.head("https://integrate.api.nvidia.com", timeout=10)
        elapsed = time.time() - start
        print(f"  Status:  {resp.status_code}")
        print(f"  Latency: {elapsed:.2f}s")
        print(f"  Result:  Reachable")
        return True
    except requests.exceptions.ConnectionError as e:
        print(f"  Connection Error: {e}")
        return False
    except requests.exceptions.Timeout:
        print(f"  Timeout after 10s")
        return False

def test_3_auth():
    """Test API key authentication with a minimal request."""
    sep("TEST 3: Authentication & Model Availability")
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Say hello"}],
        "max_tokens": 10,
        "stream": False,
    }
    try:
        start = time.time()
        resp = requests.post(URL, json=payload, headers=HEADERS, timeout=30)
        elapsed = time.time() - start
        print(f"  HTTP Status:  {resp.status_code}")
        print(f"  Latency:      {elapsed:.2f}s")
        
        if resp.status_code == 200:
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            model_used = data.get("model", "unknown")
            usage = data.get("usage", {})
            print(f"  Model Used:   {model_used}")
            print(f"  Tokens In:    {usage.get('prompt_tokens', '?')}")
            print(f"  Tokens Out:   {usage.get('completion_tokens', '?')}")
            print(f"  Response:     {content[:100]}")
            print(f"  Result:       Auth OK, Model Responding")
            return True
        elif resp.status_code == 401:
            print(f"  AUTH FAILED — Invalid API key")
            print(f"  Response: {resp.text[:200]}")
            return False
        elif resp.status_code == 404:
            print(f"  MODEL NOT FOUND — '{MODEL}' doesn't exist")
            print(f"  Response: {resp.text[:200]}")
            print(f"\n  Try changing NVIDIA_MODEL in .env to one of:")
            print(f"     nvidia/llama-3.3-nemotron-super-49b-v1")
            print(f"     meta/llama-3.1-8b-instruct")
            print(f"     meta/llama-3.1-70b-instruct")
            return False
        elif resp.status_code == 429:
            print(f"  RATE LIMITED — Too many requests")
            print(f"  Response: {resp.text[:200]}")
            return False
        else:
            print(f"  Unexpected status: {resp.status_code}")
            print(f"  Response: {resp.text[:300]}")
            return False
    except requests.exceptions.ReadTimeout:
        print(f"  Timeout after 30s on simple request")
        return False
    except Exception as e:
        print(f"  Error: {e}")
        return False

def test_4_streaming():
    """Test streaming response."""
    sep("TEST 4: Streaming Response")
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Count from 1 to 5"}],
        "max_tokens": 50,
        "stream": True,
    }
    try:
        start = time.time()
        resp = requests.post(URL, json=payload, headers=HEADERS, stream=True, timeout=60)
        first_token_time = None
        token_count = 0
        full_text = ""

        print(f"  HTTP Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"  Non-200: {resp.text[:200]}")
            return False

        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            data_str = line[len("data: "):]
            if data_str.strip() == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                
                # Show what keys the delta has
                if delta and token_count == 0:
                    print(f"  Delta Keys:  {list(delta.keys())}")
                
                # Check for reasoning_content (chain-of-thought)
                if "reasoning_content" in delta:
                    if token_count == 0:
                        print(f"  Model sends reasoning_content (chain-of-thought) — these are filtered in production")
                    continue
                    
                content = delta.get("content", "")
                if content:
                    if first_token_time is None:
                        first_token_time = time.time()
                    token_count += 1
                    full_text += content
            except Exception:
                pass

        elapsed = time.time() - start
        ttft = first_token_time - start if first_token_time else None

        print(f"  Total Time:    {elapsed:.2f}s")
        print(f"  First Token:   {ttft:.2f}s" if ttft else "  First Token:   No tokens received")
        print(f"  Token Count:   {token_count}")
        print(f"  Full Text:     {full_text[:200]}")
        
        if token_count > 0:
            print(f"  Result:        Streaming works")
            return True
        else:
            print(f"  Result:        No content tokens received (model may be outputting only reasoning_content)")
            return False
    except requests.exceptions.ReadTimeout:
        print(f"  Streaming timeout after 60s")
        return False
    except Exception as e:
        print(f"  Error: {e}")
        return False

def test_5_insight_generation():
    """Test insight-style JSON generation (non-streaming, longer)."""
    sep("TEST 5: Insight Generation (Non-Streaming)")
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are a data analysis expert. Return only valid JSON. No markdown fences."},
            {"role": "user", "content": """I have a retail dataset with columns: Sales, Profit, Quantity, Discount, Region, Category.
Give me 2 insights as a JSON array with keys: insight_class, title, description, impact, action.
Return ONLY valid JSON."""},
        ],
        "temperature": 0.4,
        "max_tokens": 500,
        "stream": False,
    }
    try:
        start = time.time()
        resp = requests.post(URL, json=payload, headers=HEADERS, timeout=120)
        elapsed = time.time() - start

        print(f"  HTTP Status: {resp.status_code}")
        print(f"  Latency:     {elapsed:.2f}s")

        if resp.status_code != 200:
            print(f"  Failed: {resp.text[:300]}")
            return False

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = data.get("usage", {})
        
        print(f"  Tokens In:   {usage.get('prompt_tokens', '?')}")
        print(f"  Tokens Out:  {usage.get('completion_tokens', '?')}")
        print(f"  Raw Output:  {content[:300]}")

        # Try parsing
        cleaned = content.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:].strip()
        if cleaned.startswith("```"):
            cleaned = cleaned[3:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                print(f"  Parsed:      Valid JSON array with {len(parsed)} insights")
                for i, insight in enumerate(parsed):
                    print(f"    [{i+1}] {insight.get('title', 'No title')}")
            elif isinstance(parsed, dict):
                print(f"  Parsed:      Valid JSON object with keys: {list(parsed.keys())}")
            return True
        except json.JSONDecodeError as e:
            print(f"  Parsed:      Invalid JSON — {e}")
            print(f"  Hint:        Model may be wrapping JSON in markdown or explanation text")
            return False

    except requests.exceptions.ReadTimeout:
        print(f"  TIMEOUT after 120s — THIS IS THE PRODUCTION BUG")
        print(f"  This means the model takes >120s to generate insights")
        print(f"  Solutions:")
        print(f"    1. Use a faster model (e.g., meta/llama-3.1-8b-instruct)")
        print(f"    2. Reduce prompt size (fewer columns/data)")
        print(f"    3. Current code already retries 3x with 180-300s timeout")
        return False
    except Exception as e:
        print(f"  Error: {e}")
        return False

def test_6_list_models():
    """Try to list available models."""
    sep("TEST 6: Available Models Check")
    try:
        resp = requests.get(
            "https://integrate.api.nvidia.com/v1/models",
            headers={"authorization": f"Bearer {API_KEY}"},
            timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            models = data.get("data", [])
            print(f"  Available models: {len(models)}")
            # Find our model
            our_model = [m for m in models if m.get("id") == MODEL]
            if our_model:
                print(f"  Model '{MODEL}' is available")
                m = our_model[0]
                print(f"     Owned by: {m.get('owned_by', '?')}")
            else:
                print(f"  Model '{MODEL}' NOT in available list")
                # Show similar models
                similar = [m["id"] for m in models if "llama" in m.get("id", "").lower() or "meta" in m.get("id", "").lower()]
                if similar:
                    print(f"  Similar available models:")
                    for s in similar[:10]:
                        print(f"     - {s}")
        else:
            print(f"  Status: {resp.status_code}")
            print(f"  Note: Model listing may not be available for all API keys")
    except Exception as e:
        print(f"  Could not list models: {e}")


if __name__ == "__main__":
    print("\nLUMINA AI — LLM DIAGNOSTIC TEST")
    print(f"   Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = {}
    
    results["env"] = test_1_env()
    if not results["env"]:
        print("\n💀 Cannot continue without API key. Exiting.")
        sys.exit(1)

    results["network"] = test_2_connectivity()
    if not results["network"]:
        print("\n💀 Cannot reach NVIDIA API. Check your internet connection.")
        sys.exit(1)

    results["auth"] = test_3_auth()
    results["streaming"] = test_4_streaming()
    results["insights"] = test_5_insight_generation()
    test_6_list_models()

    # Summary
    sep("SUMMARY")
    for name, passed in results.items():
        print(f"  {name:15s} {'PASS' if passed else 'FAIL'}")
    
    print()
    if all(results.values()):
        print("  🎉 All tests passed! LLM is working correctly.")
        print("  If insights still timeout in production, it's likely due to:")
        print("    - Larger prompts (full analysis JSON is much bigger than test)")
        print("    - Server load at peak times")
    else:
        failed = [k for k, v in results.items() if not v]
        print(f"  Failed tests: {', '.join(failed)}")
        if "auth" in failed:
            print("  → Check NVIDIA_API_KEY in .env")
            print("  → Check if model name is correct")
        if "insights" in failed:
            print("  → The model is too slow for non-streaming insight generation")
            print("  → Consider switching to a faster model")
    print()
