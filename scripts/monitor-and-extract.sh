#!/bin/bash
# Continuous monitor for Docker and auto-extract Sunbiz code

echo "🔍 Monitoring Docker Desktop..."
echo "   This script will automatically extract the Sunbiz code when Docker is ready"
echo "   Press Ctrl+C to stop monitoring"
echo ""

max_attempts=120  # 20 minutes (10 seconds per check)
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker info > /dev/null 2>&1; then
        echo ""
        echo "✅ Docker is ready! ($(date '+%H:%M:%S'))"
        echo ""
        ./scripts/extract-sunbiz-now.sh
        exit $?
    fi
    
    attempt=$((attempt + 1))
    if [ $((attempt % 6)) -eq 0 ]; then
        echo "$(date '+%H:%M:%S') - Still waiting for Docker... ($((attempt * 10)) seconds elapsed)"
    fi
    
    sleep 10
done

echo ""
echo "⏱️  Timeout reached. Docker Desktop may need to be started manually."
echo "   Once Docker is running, execute: ./scripts/extract-sunbiz-now.sh"
exit 1

