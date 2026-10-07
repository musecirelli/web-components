#!/usr/bin/env python3
"""
Push changed web-feed files to the musecirelli/web-components GitHub repo.

Usage:
    push-feed.py --feed-dir <dir> [--summary-json '{...}']

Pushes feed.json.gz and any archive files. When --summary-json (the
exporter's summary) is given, only pushes what changed: feed.json.gz when
changed=true, plus the archive_files and archive/index.json when non-empty.
Without it, pushes feed.json.gz and everything under archive/.

Each push goes through `github call-tool create_or_update_file` (base64
content). New files need no sha; updates fetch it via get_file_contents.
Write calls require Steve's approval — run this where that approval can
be granted (cron worker, interactive session).
"""

import argparse
import base64
import json
import subprocess
import sys
from pathlib import Path

OWNER = "musecirelli"
REPO = "web-components"
BRANCH = "main"


def gh(tool, args):
    proc = subprocess.run(
        ["github", "call-tool" if tool != "read" else "call-read-tool",
         "--name", args.pop("_name"), "--arguments-json", json.dumps(args)],
        capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f"github {tool} failed: {proc.stderr[:300]}")
    out = json.loads(proc.stdout)
    if not out.get("ok"):
        raise RuntimeError(f"github tool error: {json.dumps(out)[:300]}")
    return out["result"]


def get_sha(path):
    """Return the blob sha of a repo file, or None if it doesn't exist."""
    try:
        res = gh("read", {"_name": "get_file_contents", "owner": OWNER,
                          "repo": REPO, "path": path, "ref": BRANCH})
    except RuntimeError:
        return None
    # MCP returns content blocks; dig out the sha.
    def find_sha(o):
        if isinstance(o, dict):
            if "sha" in o and isinstance(o["sha"], str) and len(o["sha"]) == 40:
                return o["sha"]
            for v in o.values():
                s = find_sha(v)
                if s:
                    return s
        elif isinstance(o, list):
            for v in o:
                s = find_sha(v)
                if s:
                    return s
        return None
    return find_sha(res)


def push_file(repo_path, local_path):
    content = base64.b64encode(local_path.read_bytes()).decode()
    args = {"_name": "create_or_update_file", "owner": OWNER, "repo": REPO,
            "path": repo_path, "content": content,
            "message": f"Update {repo_path} (feed sync)", "branch": BRANCH}
    sha = get_sha(repo_path)
    if sha:
        args["sha"] = sha
    gh("write", args)
    print(f"pushed {repo_path} ({'update' if sha else 'new'})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--feed-dir", required=True)
    ap.add_argument("--summary-json", default="",
                    help="exporter's JSON summary; limits pushes to changes")
    args = ap.parse_args()

    feed_dir = Path(args.feed_dir)
    # repo_path -> local_path
    targets = {}

    def add(rel):
        local = feed_dir / rel
        if local.exists():
            targets[f"components/ebidlocal-watchlist/{rel}"] = local

    if args.summary_json:
        s = json.loads(args.summary_json)
        if not s.get("changed"):
            print("no feed changes; nothing to push")
            return
        add("feed.json.gz")
        for rel in s.get("archive_files", []):
            add(rel)
        if s.get("archive_files"):
            add("archive/index.json")
    else:
        add("feed.json.gz")
        arch = feed_dir / "archive"
        if arch.exists():
            for p in sorted(arch.glob("*.gz")):
                add(f"archive/{p.name}")
            if (arch / "index.json").exists():
                add("archive/index.json")

    if not targets:
        print("nothing to push")
        return
    for repo_path, local_path in targets.items():
        push_file(repo_path, local_path)


if __name__ == "__main__":
    main()
