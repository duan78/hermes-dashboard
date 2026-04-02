import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

HERMES_HOME = Path(os.getenv("HERMES_HOME", os.path.expanduser("~/.hermes")))
DASHBOARD_TOKEN = os.getenv("HERMES_DASHBOARD_TOKEN", "")
HOST = "127.0.0.1"
PORT = 3100
