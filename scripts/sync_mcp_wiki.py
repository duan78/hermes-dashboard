#!/usr/bin/env python3
"""
Sync MCP servers from config.yaml to the wiki.

Parses ~/.hermes/config.yaml, extracts all MCP server definitions,
and generates/updates the wiki page at ~/wiki/entities/mcp-servers.md.
Also updates index.md and log.md if changes are detected.

Usage:
    python scripts/sync_mcp_wiki.py [--config PATH] [--wiki PATH] [--dry-run]
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

import yaml


# ── Config parsing ──────────────────────────────────────────────────────────

def load_mcp_config(config_path: Path) -> dict:
    """Load config.yaml and return the mcp_servers section."""
    if not config_path.exists():
        print(f"Error: config not found at {config_path}")
        sys.exit(1)
    with open(config_path) as f:
        cfg = yaml.safe_load(f) or {}
    return cfg.get("mcp_servers", {})


def mask_env_value(key: str, value: str) -> str:
    """Mask sensitive env values for display."""
    sensitive = re.compile(r"(key|token|secret|password|auth)", re.IGNORECASE)
    if sensitive.search(key) and isinstance(value, str) and len(value) > 8:
        return value[:4] + "****" + value[-4:]
    return value


def extract_server_info(name: str, conf: dict) -> dict:
    """Extract structured info from a single MCP server config."""
    is_disabled = conf.get("disabled", False)

    # Determine transport type
    if "url" in conf:
        transport = "http"
        endpoint = conf["url"]
    elif "command" in conf:
        transport = "stdio"
        cmd = conf["command"]
        args = conf.get("args", [])
        endpoint = " ".join([cmd] + args)
    else:
        transport = "unknown"
        endpoint = "N/A"

    # Mask env vars
    env = conf.get("env", {})
    masked_env = {k: mask_env_value(k, v) for k, v in env.items()} if env else {}

    # Headers (mask auth)
    headers = conf.get("headers", {})
    masked_headers = {k: mask_env_value(k, v) for k, v in headers.items()} if headers else {}

    # Tool filtering
    tools_config = conf.get("tools", {})
    tool_filter = ""
    if tools_config:
        parts = []
        if "include" in tools_config:
            parts.append(f"whitelist: {', '.join(tools_config['include'])}")
        if "exclude" in tools_config:
            parts.append(f"excluded: {', '.join(tools_config['exclude'])}")
        tool_filter = "; ".join(parts)

    return {
        "name": name,
        "transport": transport,
        "endpoint": endpoint,
        "disabled": is_disabled,
        "masked_env": masked_env,
        "masked_headers": masked_headers,
        "timeout": conf.get("timeout", "N/A"),
        "connect_timeout": conf.get("connect_timeout", "N/A"),
        "tool_filter": tool_filter,
        "prompts_enabled": not conf.get("prompts", True) is False,
        "resources_enabled": not conf.get("resources", True) is False,
    }


# ── Wiki page generation ────────────────────────────────────────────────────

WIKI_PAGE_TEMPLATE = """\
---
title: MCP Servers — Inventaire Automatique
created: {created}
updated: {updated}
type: entity
tags: [tool, hermes, api, automation, monitoring]
confidence: 0.95
confidence_sources: 1
confidence_last_confirmed: {updated}
contradictions: []
supersedes: []
sources: [config.yaml]
auto_generated: true
generator: scripts/sync_mcp_wiki.py
---

# MCP Servers — Inventaire Automatique

> **Cette page est générée automatiquement** par `scripts/sync_mcp_wiki.py`.
> Dernière synchronisation : {updated}
> Ne pas éditer manuellement — les changements seront écrasés à la prochaine synchro.

## Vue d'ensemble

{total_servers} serveurs MCP configurés dans `~/.hermes/config.yaml`.
{active_count} actifs, {disabled_count} désactivés.

## Serveurs configurés

{servers_detail}

## Synthèse par type

| Transport | Serveurs | Actifs |
|-----------|----------|--------|
{transport_summary}

## Optimisations appliquées

{optimizations_section}

## Historique des synchronisations

| Date | Serveurs | Changements |
|------|----------|-------------|
{sync_history}

## Voir aussi

- [[hermes-agent]] — Framework agent, configuration MCP
- [[hermes-architecture]] — Architecture interne, MCP tool
- [[hermes-dev-guide]] — Guide développement, ajout d'outils
- [[mcp-optimizations]] — Optimisations détaillées des configurations MCP
"""


def generate_server_detail(info: dict) -> str:
    """Generate the detail section for one server."""
    status = "Désactivé" if info["disabled"] else "Actif"
    lines = [
        f"### {info['name']}",
        "",
        f"- **Statut** : {status}",
        f"- **Transport** : {info['transport']}",
        f"- **Endpoint** : `{info['endpoint']}`",
        f"- **Timeout** : {info['timeout']}s (connect: {info['connect_timeout']}s)",
    ]

    if info["masked_env"]:
        lines.append("- **Variables d'environnement** :")
        for k, v in info["masked_env"].items():
            lines.append(f"  - `{k}`: `{v}`")

    if info["masked_headers"]:
        lines.append("- **Headers** :")
        for k, v in info["masked_headers"].items():
            lines.append(f"  - `{k}`: `{v}`")

    if info["tool_filter"]:
        lines.append(f"- **Filtrage outils** : {info['tool_filter']}")

    if not info["prompts_enabled"]:
        lines.append("- **Prompts** : désactivés")
    if not info["resources_enabled"]:
        lines.append("- **Resources** : désactivées")

    lines.append("")
    return "\n".join(lines)


def generate_transport_summary(servers: list[dict]) -> str:
    """Generate transport type summary table."""
    by_type: dict[str, list] = {}
    for s in servers:
        t = s["transport"]
        by_type.setdefault(t, []).append(s)

    rows = []
    for transport, srvs in sorted(by_type.items()):
        total = len(srvs)
        active = sum(1 for s in srvs if not s["disabled"])
        rows.append(f"| {transport} | {total} | {active} |")
    return "\n".join(rows)


def generate_optimizations_section(servers: list[dict]) -> str:
    """Generate optimizations analysis."""
    lines = []
    filtered = [s for s in servers if s["tool_filter"]]
    no_prompts = [s for s in servers if not s["prompts_enabled"]]
    no_resources = [s for s in servers if not s["resources_enabled"]]

    if filtered:
        lines.append(f"**Filtrage d'outils** ({len(filtered)} serveurs) :")
        for s in filtered:
            lines.append(f"- `{s['name']}` : {s['tool_filter']}")
        lines.append("")

    if no_prompts:
        lines.append(f"**Prompts désactivés** ({len(no_prompts)}) : {', '.join(f'`{s[\"name\"]}`' for s in no_prompts)}")
        lines.append("")

    if no_resources:
        lines.append(f"**Resources désactivées** ({len(no_resources)}) : {', '.join(f'`{s[\"name\"]}`' for s in no_resources)}")
        lines.append("")

    # Servers without any filtering
    unfiltered = [s for s in servers if not s["tool_filter"] and s["prompts_enabled"] and s["resources_enabled"]]
    if unfiltered:
        lines.append(f"**Non filtrés** ({len(unfiltered)} serveurs) : {', '.join(f'`{s[\"name\"]}`' for s in unfiltered)}")
        lines.append("")
        lines.append("> Ces serveurs exposent tous leurs outils/prompts/resources — optimisation possible pour réduire le context window.")

    return "\n".join(lines) if lines else "Aucune optimisation appliquée."


# ── Index and log management ────────────────────────────────────────────────

def update_index(index_path: Path, page_name: str, description: str) -> bool:
    """Add the MCP page to wiki index if missing. Returns True if updated."""
    if not index_path.exists():
        return False

    content = index_path.read_text()
    page_link = f"[[{page_name}]]"

    # Check if already present
    if page_link in content:
        return False

    # Find the Entities section and add the entry
    lines = content.split("\n")
    new_lines = []
    in_entities = False
    inserted = False

    for line in lines:
        new_lines.append(line)

        if line.strip().startswith("## Entities"):
            in_entities = True
            continue

        if in_entities and line.strip().startswith("## "):
            # We've reached the next section — insert before it
            if not inserted:
                new_lines.insert(len(new_lines) - 1, f"| {page_link} | {description} |")
                inserted = True
            in_entities = False
            continue

    # If we're still in entities section at end of file
    if in_entities and not inserted:
        new_lines.append(f"| {page_link} | {description} |")
        inserted = True

    if inserted:
        # Update total pages count
        content = "\n".join(new_lines)
        content = re.sub(
            r"total_pages: \d+",
            lambda m: f"total_pages: {int(m.group().split(':')[1].strip()) + 1}",
            content,
        )
        content = re.sub(
            r"(\d+) pages",
            lambda m: f"{int(m.group(1)) + 1} pages",
            content,
        )
        # Update Entities count
        content = re.sub(
            r"Entities \(\d+\)",
            lambda m: f"Entities ({int(re.search(r'\d+', m.group()).group()) + 1})",
            content,
        )
        index_path.write_text(content)
        return True

    return False


def append_log(log_path: Path, message: str):
    """Append an entry to the wiki log."""
    if not log_path.exists():
        return

    today = date.today().isoformat()
    entry = f"\n## [{today}] update | mcp-servers — {message}\n"
    log_path.write_text(log_path.read_text().rstrip() + "\n" + entry + "\n")


# ── Diff detection ──────────────────────────────────────────────────────────

def detect_changes(page_path: Path, new_content: str) -> dict:
    """Compare existing page with new content, return change summary."""
    if not page_path.exists():
        return {"is_new": True, "servers_added": [], "servers_removed": [], "servers_changed": []}

    old_content = page_path.read_text()

    # Extract server names from both
    old_servers = set(re.findall(r"### (\S+)", old_content))
    new_servers = set(re.findall(r"### (\S+)", new_content))

    added = new_servers - old_servers
    removed = old_servers - new_servers

    return {
        "is_new": False,
        "servers_added": sorted(added),
        "servers_removed": sorted(removed),
        "servers_changed": [],  # Detailed diff would require more complex parsing
    }


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync MCP servers to wiki")
    parser.add_argument("--config", default="~/.hermes/config.yaml", help="Path to config.yaml")
    parser.add_argument("--wiki", default="~/wiki", help="Path to wiki directory")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    args = parser.parse_args()

    config_path = Path(args.config).expanduser()
    wiki_path = Path(args.wiki).expanduser()
    page_path = wiki_path / "entities" / "mcp-servers.md"
    index_path = wiki_path / "index.md"
    log_path = wiki_path / "log.md"

    # Load config
    mcp_servers = load_mcp_config(config_path)
    if not mcp_servers:
        print("No MCP servers found in config.")
        sys.exit(0)

    # Extract server info
    servers = []
    for name, conf in mcp_servers.items():
        servers.append(extract_server_info(name, conf))

    today = date.today().isoformat()

    # Determine created date (preserve if page exists)
    created = today
    if page_path.exists():
        existing = page_path.read_text()
        m = re.search(r"created: (\d{4}-\d{2}-\d{2})", existing)
        if m:
            created = m.group(1)

    # Generate server details
    servers_detail = "\n".join(generate_server_detail(s) for s in servers)
    transport_summary = generate_transport_summary(servers)
    optimizations_section = generate_optimizations_section(servers)

    # Build sync history (preserve existing + add new entry)
    sync_history = ""
    if page_path.exists():
        existing = page_path.read_text()
        m = re.search(r"\| Date .*?\n\|-+\|.*?\n((?:\|.*\n)*)", existing)
        if m:
            sync_history = m.group(1).rstrip() + "\n"

    active = sum(1 for s in servers if not s["disabled"])
    disabled = sum(1 for s in servers if s["disabled"])
    change_summary = detect_changes(page_path, "")  # Quick check
    change_desc = "mise à jour automatique"
    if change_summary["is_new"]:
        change_desc = f"création initiale ({len(servers)} serveurs)"
    else:
        mcp_names = sorted(s["name"] for s in servers)
        change_desc = f"{len(servers)} serveurs : {', '.join(mcp_names)}"

    sync_history += f"| {today} | {len(servers)} | {change_desc} |\n"

    # Render page
    page_content = WIKI_PAGE_TEMPLATE.format(
        created=created,
        updated=today,
        total_servers=len(servers),
        active_count=active,
        disabled_count=disabled,
        servers_detail=servers_detail,
        transport_summary=transport_summary,
        optimizations_section=optimizations_section,
        sync_history=sync_history,
    )

    # Check if content actually changed
    if page_path.exists():
        old_content = page_path.read_text()
        # Normalize for comparison (strip sync history since that always changes)
        old_body = re.sub(r"updated: \d{4}-\d{2}-\d{2}", "", old_content)
        new_body = re.sub(r"updated: \d{4}-\d{2}-\d{2}", "", page_content)
        if old_body == new_body:
            print("No changes detected — wiki is up to date.")
            return

    # Dry run mode
    if args.dry_run:
        print("=== DRY RUN ===")
        print(f"Would update: {page_path}")
        changes = detect_changes(page_path, page_content)
        if changes["is_new"]:
            print(f"  New page with {len(servers)} servers")
        else:
            if changes["servers_added"]:
                print(f"  Added: {', '.join(changes['servers_added'])}")
            if changes["servers_removed"]:
                print(f"  Removed: {', '.join(changes['servers_removed'])}")
        print(f"\nServers: {', '.join(s['name'] for s in servers)}")
        return

    # Write wiki page
    page_path.parent.mkdir(parents=True, exist_ok=True)
    page_path.write_text(page_content)
    print(f"Updated: {page_path}")

    # Update index
    description = "Inventaire automatique des serveurs MCP (config.yaml → wiki)"
    if update_index(index_path, "mcp-servers", description):
        print(f"Updated: {index_path}")

    # Update log
    append_log(log_path, change_desc)
    print(f"Updated: {log_path}")

    # Summary
    changes = detect_changes(page_path, page_content)
    if changes["is_new"]:
        print(f"\nCreated new MCP servers page with {len(servers)} servers.")
    else:
        print(f"\nSynced {len(servers)} MCP servers to wiki.")
        if changes["servers_added"]:
            print(f"  Added: {', '.join(changes['servers_added'])}")
        if changes["servers_removed"]:
            print(f"  Removed: {', '.join(changes['servers_removed'])}")


if __name__ == "__main__":
    main()
