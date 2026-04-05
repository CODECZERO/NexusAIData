#!/bin/bash
# NexusAIData — Midnight Contract Compilation Utility
# This script compiles all ZK circuits into the 'managed' artifacts directory.

# Exit on error
set -e

echo "🛠️ [1/5] Preparing compilation environment..."
mkdir -p contracts/managed/fingerprint
mkdir -p contracts/managed/bounty
mkdir -p contracts/managed/audit
mkdir -p contracts/managed/subscription

echo "📑 [2/5] Compiling data_fingerprint.compact..."
compact compile contracts/data_fingerprint.compact contracts/managed/fingerprint

echo "💰 [3/5] Compiling data_bounty.compact..."
compact compile contracts/data_bounty.compact contracts/managed/bounty

echo "📜 [4/5] Compiling audit_proof.compact..."
compact compile contracts/audit_proof.compact contracts/managed/audit

echo "💸 [5/5] Compiling data_subscription.compact..."
compact compile contracts/data_subscription.compact contracts/managed/subscription

echo ""
echo "✅ Compilation complete. Managed artifacts ready in contracts/managed/"
echo "🔗 Run 'npm run bridge' to start the synchronization service."
