#!/usr/bin/env python3
"""Split the monolithic ender3-hotend feed into per-category hunts.

Steve's request 2026-10-15: one lumped "Ender 3 hotend / parts" hunt can't be
filtered to the category he wants to look at. This regroups items by the
pipeline's mfr_category into separate feeds, and marks glass-bead thermistors
as ruled out (his machine uses cartridge-style thermistors; correction
2026-10-15).

Usage: python3 split_ender3_hunts.py
"""
import json
import re
import os

FEED_DIR = os.path.dirname(os.path.abspath(__file__)) + "/feeds"
SRC = os.path.join(FEED_DIR, "ender3-hotend.json")

GROUPS = [
    ("ender3-hotend", "Ender 3 hotend kits",
     {"stock_hotend_kits", "all_metal_upgrade"}),
    ("ender3-thermistor", "Ender 3 thermistor / heater",
     {"thermistor_heater"}),
    ("ender3-extruder", "Ender 3 extruder upgrades",
     {"extruder_upgrade"}),
    ("ender3-cooling", "Ender 3 part cooling",
     {"part_cooling"}),
    ("ender3-abl", "Ender 3 auto bed leveling",
     {"auto_bed_leveling"}),
]
MISC = ("ender3-parts-misc", "Ender 3 parts (unclassified)")

THERMISTOR_ALERT = (
    "Form-factor correction 2026-10-15: this Ender 3 (later production run) "
    "uses cartridge-style thermistors (metal cylinder in a 3mm bore), NOT "
    "glass-bead. Glass-bead listings are ruled out below (dimmed). Correct "
    "drop-in: cartridge-style NTC 100K 3950 (stock Marlin table, no firmware "
    "change). Full re-scoring of this category is in progress."
)


def category(item):
    return item.get("specs", {}).get("mfr_category") or "UNKNOWN"


def is_glass_bead_thermistor(item):
    """Conservative heuristic: clearly glass-bead, not cartridge/stud."""
    name = item.get("name", "").lower()
    if "cartridge" in name or "stud" in name:
        return False
    # "glass sealed" / "glass bead" phrasing is the bead giveaway
    return bool(re.search(r"glass|bead", name))


def main():
    with open(SRC) as f:
        src = json.load(f)

    total = 0
    for slug, title, cats in GROUPS:
        items = [i for i in src["items"] if category(i) in cats]
        feed = {
            "hunt": slug,
            "title": title,
            "generated": src.get("generated"),
            "items": items,
            "alerts": list(src.get("alerts") or []),
            "coverage": src.get("coverage"),
            "cert_links": src.get("cert_links"),
            "spec_columns": src.get("spec_columns"),
        }
        if slug == "ender3-thermistor":
            ruled = 0
            for it in items:
                if is_glass_bead_thermistor(it):
                    it["ruled_out"] = True
                    ruled += 1
            feed["alerts"].append(THERMISTOR_ALERT)
            print(f"  glass-bead ruled out: {ruled}")
        out = os.path.join(FEED_DIR, slug + ".json")
        with open(out, "w") as f:
            json.dump(feed, f, indent=1)
        print(f"{slug}.json: {len(items)} items")
        total += len(items)

    # Residual: unclassified + unknown stay visible but separate.
    misc_items = [i for i in src["items"]
                  if category(i) in ("unclassified", "UNKNOWN")]
    feed = {
        "hunt": MISC[0],
        "title": MISC[1],
        "generated": src.get("generated"),
        "items": misc_items,
        "alerts": ["Items the pipeline gathered but did not classify into a "
                   "category. Kept for completeness; ignore unless browsing."],
        "coverage": src.get("coverage"),
        "cert_links": src.get("cert_links"),
        "spec_columns": src.get("spec_columns"),
    }
    out = os.path.join(FEED_DIR, MISC[0] + ".json")
    with open(out, "w") as f:
        json.dump(feed, f, indent=1)
    print(f"{MISC[0]}.json: {len(misc_items)} items")
    total += len(misc_items)

    print(f"total: {total} (source had {len(src['items'])})")
    assert total == len(src["items"]), "item count mismatch!"


if __name__ == "__main__":
    main()
