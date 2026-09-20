"""
NEXORA Backend Entrypoint
Handles dynamic Render PORT binding and startup.
"""
import os
import sys

# Ensure backend directory is in Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn

if __name__ == "__main__":
    port_str = os.environ.get("PORT", "10000")
    try:
        port = int(port_str)
    except (ValueError, TypeError):
        port = 10000
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"[NEXORA] Starting FastAPI on {host}:{port}...")
    uvicorn.run("app.main:app", host=host, port=port, log_level="info")
