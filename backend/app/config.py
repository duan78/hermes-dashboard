import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

HERMES_HOME = Path(os.getenv("HERMES_HOME", os.path.expanduser("~/.hermes")))
DASHBOARD_TOKEN = os.getenv("DASHBOARD_TOKEN", "")

HERMES_BIN = os.getenv("HERMES_BIN", "/root/.local/bin/hermes")
HERMES_PYTHON = os.getenv("HERMES_PYTHON", "/root/.hermes/hermes-agent/venv/bin/python")
HERMES_AGENT_DIR = Path(os.getenv("HERMES_AGENT_DIR", "/root/.hermes/hermes-agent"))
HERMES_MEMORY_PATH = os.getenv("HERMES_MEMORY_PATH", "/root/hermes-memory")

HOST = "127.0.0.1"
PORT = 3100
