import asyncio
import re
from fastapi import APIRouter, HTTPException
from ..utils import run_hermes
from ..schemas.requests import WebhookCreateRequest, WebhookDeleteRequest

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _parse_webhook_list(output: str) -> list:
    """Parse hermes webhook list output."""
    webhooks = []
    if not output or "no webhooks" in output.lower() or "not found" in output.lower():
        return webhooks

    for line in output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("-") or line.startswith("=") or line.startswith("Webhook"):
            continue

        # Try to parse URL and events from line
        # Format could be: "https://...  events: message.created, message.updated"
        # or just a URL
        url_match = re.search(r'(https?://\S+)', line)
        if url_match:
            url = url_match.group(1)
            events = []
            events_match = re.search(r'events?:\s*(.+)', line, re.IGNORECASE)
            if events_match:
                events = [e.strip().strip(",") for e in events_match.group(1).split() if e.strip()]
            webhooks.append({"url": url, "events": events})
        elif line and not line.startswith("#"):
            # Might be a plain URL
            parts = line.split()
            if parts and parts[0].startswith("http"):
                webhooks.append({"url": parts[0], "events": parts[1:]})

    return webhooks


@router.get("/list")
async def list_webhooks():
    """List all configured webhooks."""
    try:
        output = await run_hermes("webhook", "list", timeout=15)
        webhooks = _parse_webhook_list(output)
        return {"webhooks": webhooks, "raw": output}
    except RuntimeError as e:
        return {"webhooks": [], "raw": "", "error": str(e)}


@router.post("/create")
async def create_webhook(body: WebhookCreateRequest):
    """Create a new webhook."""
    args = ["webhook", "add", body.url]
    if body.events:
        args.extend(["--events", ",".join(body.events)])

    try:
        output = await run_hermes(*args, timeout=15)
        return {"status": "created", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.delete("/delete")
async def delete_webhook(body: WebhookDeleteRequest):
    """Delete a webhook."""
    try:
        output = await run_hermes("webhook", "remove", body.url, timeout=15)
        return {"status": "deleted", "output": output}
    except RuntimeError as e:
        raise HTTPException(500, str(e))
