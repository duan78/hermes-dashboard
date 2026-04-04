import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

HERMES_HOME = Path(os.getenv("HERMES_HOME", os.path.expanduser("~/.hermes")))
DASHBOARD_TOKEN = os.getenv("HERMES_DASHBOARD_TOKEN", "")

# Path configuration with local defaults (replacing hardcoded /root/ paths)
HERMES_BIN = os.getenv("HERMES_BIN", os.path.expanduser("~/.local/bin/hermes"))
HERMES_PYTHON = os.getenv("HERMES_PYTHON", str(HERMES_HOME / "hermes-agent" / "venv" / "bin" / "python"))
HERMES_AGENT_DIR = Path(os.getenv("HERMES_AGENT_DIR", str(HERMES_HOME / "hermes-agent")))

HOST = "127.0.0.1"
PORT = 3100
