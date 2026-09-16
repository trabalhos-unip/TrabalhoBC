"""Entrada WSGI usada pela Vercel."""

from pathlib import Path
import sys

RAIZ_PROJETO = Path(__file__).resolve().parents[1]
if str(RAIZ_PROJETO) not in sys.path:
    sys.path.insert(0, str(RAIZ_PROJETO))

from app.main import app, application, handler  # noqa: E402,F401
