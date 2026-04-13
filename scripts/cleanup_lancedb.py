#!/usr/bin/env python3
"""
Cleanup script for empty/fragmented LanceDB directories.

Valid LanceDB store:  /root/.hermes/memory-claw/memories_claw.lance  (27 rows)
Empty directories to remove:
  - /root/.hermes/memory.lance
  - /root/memory-claw-mcp/memory.lance
  - /root/memory.lance
  - /root/hermes-memory/.lancedb

Usage:
  python scripts/cleanup_lancedb.py              # dry-run (show what would be removed)
  python scripts/cleanup_lancedb.py --force       # actually remove empty dirs
"""

import shutil
import sys
from pathlib import Path

# Directories to evaluate for cleanup
EMPTY_LANCE_DIRS = [
    "/root/.hermes/memory.lance",
    "/root/memory-claw-mcp/memory.lance",
    "/root/memory.lance",
    "/root/hermes-memory/.lancedb",
]

# The one valid LanceDB store — must NOT be touched
VALID_LANCEDB = "/root/.hermes/memory-claw/memories_claw.lance"


def is_lancedb_valid(path: str) -> bool:
    """Check if a .lance directory has actual data (data/ subdir with .lance files)."""
    p = Path(path)
    data_dir = p / "data"
    if not data_dir.is_dir():
        return False
    lance_files = list(data_dir.glob("*.lance"))
    return len(lance_files) > 0


def get_dir_size(path: str) -> str:
    """Get human-readable directory size."""
    total = 0
    for f in Path(path).rglob("*"):
        if f.is_file():
            total += f.stat().st_size
    if total < 1024:
        return f"{total}B"
    elif total < 1024 * 1024:
        return f"{total / 1024:.1f}K"
    else:
        return f"{total / (1024 * 1024):.1f}M"


def main():
    force = "--force" in sys.argv
    dry_run = not force

    print("=" * 60)
    print("LanceDB Cleanup Script")
    print("=" * 60)
    print()

    # 1. Verify the valid store is intact
    print(f"[CHECK] Valid store: {VALID_LANCEDB}")
    if not Path(VALID_LANCEDB).is_dir():
        print("  ERROR: Valid store does not exist! Aborting.")
        sys.exit(1)
    if not is_lancedb_valid(VALID_LANCEDB):
        print("  ERROR: Valid store has no data! Aborting.")
        sys.exit(1)
    data_files = list((Path(VALID_LANCEDB) / "data").glob("*.lance"))
    print(f"  OK: {len(data_files)} data files, size {get_dir_size(VALID_LANCEDB)}")
    print()

    # 2. Evaluate each empty dir
    to_remove = []
    print("[SCAN] Scanning empty/fragmented LanceDB directories...")
    for d in EMPTY_LANCE_DIRS:
        p = Path(d)
        if not p.exists():
            print(f"  SKIP (not found): {d}")
            continue
        if not p.is_dir():
            print(f"  SKIP (not a dir): {d}")
            continue
        if is_lancedb_valid(d):
            print(f"  WARNING: has data, skipping: {d}")
            continue
        size = get_dir_size(d)
        to_remove.append(d)
        print(f"  EMPTY ({size}): {d}")
    print()

    if not to_remove:
        print("[RESULT] No empty directories found. Nothing to do.")
        return

    # 3. Report
    print(f"[PLAN] {'Would remove' if dry_run else 'Removing'} {len(to_remove)} empty directories:")
    for d in to_remove:
        print(f"  - {d}")
    print()

    if dry_run:
        print("[DRY-RUN] No changes made. Use --force to actually remove.")
        print()
        # Still print verification of valid store
        print("[VERIFY] Valid store intact:", VALID_LANCEDB)
        print(f"  Data files: {len(data_files)}, Size: {get_dir_size(VALID_LANCEDB)}")
        return

    # 4. Remove
    removed = 0
    for d in to_remove:
        try:
            shutil.rmtree(d)
            print(f"  REMOVED: {d}")
            removed += 1
        except Exception as e:
            print(f"  ERROR removing {d}: {e}")

    print()
    print(f"[DONE] Removed {removed}/{len(to_remove)} directories.")

    # 5. Verify valid store still intact
    print()
    print("[VERIFY] Valid store intact:", VALID_LANCEDB)
    post_data_files = list((Path(VALID_LANCEDB) / "data").glob("*.lance"))
    print(f"  Data files: {len(post_data_files)}, Size: {get_dir_size(VALID_LANCEDB)}")
    if len(post_data_files) == len(data_files):
        print("  OK: No data loss detected.")
    else:
        print(f"  WARNING: Data file count changed ({len(data_files)} -> {len(post_data_files)})!")


if __name__ == "__main__":
    main()
