"""Vercel entry point; keep backend-local imports working from the repo root."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend"))
from backend.main import app
