"""
NEXORA Root Entrypoint
Allows Render or local servers to run from repository root.
"""
import os
import sys

# Add backend directory to Python path
root_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(root_dir, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import uvicorn

if __name__ == "__main__":
    port_str = os.environ.get("PORT", "10000")
    try:
        port = int(port_str)
    except (ValueError, TypeError):
        port = 10000
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"[NEXORA] Starting FastAPI from root on {host}:{port}...")
    uvicorn.run("app.main:app", host=host, port=port, log_level="info")
