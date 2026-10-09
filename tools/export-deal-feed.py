#!/usr/bin/env python3
"""
Change-aware feed exporter for the <deal-watch-table> web component.

Merges a hunt's static baseline (name, url, brand, retailer, image, specs)
with the latest price-check output (price, was_price, badges, in_stock,
confidence) into the feed JSON described in
components/deal-watch-table/feed-schema.md.

Change rule: the feed file is rewritten only when the merged content
differs from what's on disk, so mtimes stay stable for caching and the
caller can decide whether a push is needed.

Usage:
    export-deal-feed.py --hunt kids-scooter \
        --baseline ~/workspace/kids-scooter-hunt/kids-scooter-baseline.json \
        --last-check ~/workspace/kids-scooter-hunt/last-check.json \
        --out components/deal-watch-table/feeds/kids-scooter.json

Prints a JSON summary to stdout:
    {"changed": bool, "items": n, "feed": path, "generated": iso}
"""

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

HUNTS = {
    "kids-scooter": {
        "title": "Kids Electric Scooter Hunt",
        "spec_columns": [
            {"key": "motor", "label": "Motor"},
            {"key": "speed", "label": "Top speed"},
            {"key": "range", "label": "Range"},
            {"key": "load", "label": "Max load"},
            {"key": "tires", "label": "Tires"},
            {"key": "brakes", "label": "Brakes"},
            {"key": "cert", "label": "Certification"},
        ],
    },
    "scooter": {
        "title": "Electric Scooter Hunt",
        "rate": True,  # compute automatic quality/spec fit rating per item
        "spec_columns": [
            {"key": "motor", "label": "Motor"},
            {"key": "speed", "label": "Top speed"},
            {"key": "range", "label": "Range"},
            {"key": "load", "label": "Max load"},
            {"key": "tires", "label": "Tires"},
            {"key": "brakes", "label": "Brakes"},
            {"key": "cert", "label": "Certification"},
        ],
    },
    "ride-on": {
        "title": "24V Ride-On Car Hunt",
        "spec_columns": [
            {"key": "motors", "label": "Motors"},
            {"key": "battery", "label": "Battery"},
            {"key": "seats", "label": "Seats"},
            {"key": "load", "label": "Max load"},
            {"key": "speed", "label": "Top speed"},
        ],
    },
}

# Certification values link to the standard's documentation where possible.
# (The UL 2272 spec text itself is paywalled; the UL Standards Academy case
# study is the closest official public explainer.)
CERT_LINKS = {
    "UL 2272": "https://standardsacademy.org/wp-content/uploads/2025/02/UL-2272-Case-Study_v5.pdf",
}

# --- automatic quality/spec rating (adult-scooter hunt) ---------------------
# Steve's rule (2026-10-09): PRICE IS EXCLUDED from the rating — he sorts on
# price himself. The score (0-100) reflects spec quality vs his needs:
# 212-220 lb rider, slightly hilly pavement. Complexity: O(n*m) time and O(n)
# extra space for n items and m spec fields; m is a small constant, so
# effectively O(n) time / O(n) space.
RIDER_LB = 220.0

_BRAND_TRUST = {
    # established brands with real support channels
    "gotrax": 10, "hiboy": 10, "segway": 10, "phantomgogo": 10,
    "phantom": 10, "iscooter": 10,
    # web-presence white-label (own site, stated warranty)
    "volpam": 6,
    # marketplace-only default: 4
}


def _first_num(s):
    m = re.search(r"(\d+(?:\.\d+)?)", str(s or ""))
    return float(m.group(1)) if m else None


def _dual_brakes(s):
    s = str(s or "").lower()
    if "dual" in s:
        return True
    kinds = ["drum", "disc", "electronic", "eabs", "e-abs", "e-brake", "electric"]
    return sum(1 for k in kinds if k in s) >= 2


def rate_item(item):
    """Return {'rating': 0-100, 'ruled_out': bool} for an adult-scooter item."""
    specs = item.get("specs") or {}
    ver = item.get("spec_verification") or {}
    brand = str(item.get("brand") or "").lower()
    score = 0.0

    load = _first_num(specs.get("load"))
    if load is None:
        score += 8
    elif load >= 264:
        score += 25
    elif load >= RIDER_LB:
        score += 15
    ruled_out = load is not None and load < RIDER_LB

    motor = _first_num(specs.get("motor"))  # nominal (first) wattage figure
    if motor is None:
        score += 6
    elif motor >= 500:
        score += 20
    elif motor >= 400:
        score += 12
    elif motor >= 350:
        score += 8
    else:
        score += 4

    rng = item.get("realistic_range_mi")
    if rng is None:
        rng = _first_num(specs.get("range"))
    if rng is None:
        score += 5
    elif rng >= 25:
        score += 15
    elif rng >= 20:
        score += 10
    elif rng >= 15:
        score += 6
    else:
        score += 3

    brakes = specs.get("brakes")
    if not brakes:
        score += 2
    elif _dual_brakes(brakes):
        score += 10
    else:
        score += 5

    tires = _first_num(specs.get("tires"))
    if tires is None:
        score += 3
    elif tires >= 10:
        score += 10
    elif tires >= 8.5:
        score += 6
    else:
        score += 3

    score += _BRAND_TRUST.get(brand, 4)

    if str(specs.get("cert") or "").upper().replace(" ", "") == "UL2272":
        score += 5

    verified = sum(1 for v in ver.values()
                   if isinstance(v, dict) and v.get("status") == "verified")
    conflicts = sum(1 for v in ver.values()
                    if isinstance(v, dict) and v.get("status") == "conflict")
    score += min(verified * 0.5, 5)
    score -= conflicts * 3

    return {"rating": round(max(0.0, min(100.0, score)), 1),
            "ruled_out": bool(ruled_out)}

RETAILER_BY_HOST = {
    "amazon.com": "Amazon",
    "walmart.com": "Walmart",
    "costco.com": "Costco",
    "bestbuy.com": "Best Buy",
    "target.com": "Target",
    "samsclub.com": "Sam's Club",
    "temu.com": "Temu",
}


def retailer_for(item):
    if item.get("retailer"):
        return item["retailer"]
    host = urlparse(item.get("url", "")).netloc.lower()
    for suffix, name in RETAILER_BY_HOST.items():
        if host.endswith(suffix):
            return name
    brand = item.get("brand", "")
    return f"{brand} direct" if brand else host or "Unknown"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hunt", required=True, choices=list(HUNTS))
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--last-check", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    hunt = HUNTS[args.hunt]
    baseline = json.loads(Path(args.baseline).read_text())
    check = json.loads(Path(args.last_check).read_text())

    by_id = {r["id"]: r for r in check.get("results", [])}
    checked_at = check.get("checked_at")

    items = []
    baseline_touched = False
    for b in baseline.get("items", []):
        r = by_id.get(b["id"], {})
        price = r.get("price")
        base_price = b.get("baseline_price")
        change = None
        if isinstance(price, (int, float)) and isinstance(base_price, (int, float)):
            change = round(price - base_price, 2)
        # Image URLs are hotlinked, never downloaded. Prefer the baseline's
        # stored URL; adopt a newly seen one from the check and persist it
        # back to the baseline so it survives failed future checks.
        image = b.get("image") or r.get("image") or None
        if image and not b.get("image"):
            b["image"] = image
            baseline_touched = True
        specs = b.get("specs") or {}
        rating = rate_item(b) if hunt.get("rate") else {}
        items.append({
            "id": b["id"],
            "name": b.get("name", b["id"]),
            "url": b.get("url", ""),
            "image": b.get("image") or None,
            "retailer": retailer_for(b),
            "brand": b.get("brand", ""),
            "brand_url": b.get("brand_url") or None,
            "rating": rating.get("rating"),
            "ruled_out": rating.get("ruled_out", False),
            "price": price,
            "baseline": base_price,
            "was": r.get("was_price"),
            "change": change,
            "in_stock": r.get("in_stock"),
            "badges": r.get("badges") or [],
            "confidence": r.get("confidence"),
            "category": b.get("category"),
            "spec_verification": b.get("spec_verification") or {},
            "specs": {c["key"]: specs.get(c["key"]) for c in hunt["spec_columns"]},
        })

    if baseline_touched:
        Path(args.baseline).write_text(
            json.dumps(baseline, indent=2, ensure_ascii=False) + "\n")

    feed = {
        "hunt": args.hunt,
        "title": hunt["title"],
        "generated": checked_at or datetime.now(timezone.utc).isoformat(),
        "spec_columns": hunt["spec_columns"],
        "cert_links": CERT_LINKS,
        "items": items,
    }

    out = Path(args.out)
    new_text = json.dumps(feed, indent=1, ensure_ascii=False) + "\n"
    new_hash = hashlib.sha256(new_text.encode()).hexdigest()[:16]
    changed = True
    if out.exists():
        old_hash = hashlib.sha256(out.read_bytes()).hexdigest()[:16]
        changed = old_hash != new_hash
    if changed:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(new_text)

    print(json.dumps({
        "changed": changed,
        "items": len(items),
        "feed": str(out),
        "generated": feed["generated"],
    }))


if __name__ == "__main__":
    sys.exit(main())
