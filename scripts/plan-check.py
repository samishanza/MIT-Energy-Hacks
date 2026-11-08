"""Score a site record against an engineered plan set, item by item.

The ground truth is read off the plan set by hand into a private JSON file (plan sets carry customer
details, so it lives under the gitignored private/ folder): positions in PDF points on the site plan
sheet, and values from the electrical sheets. Positions are converted to the map with the aligned
overlay from scripts/plan-overlay.py.

Usage:
  python -I scripts/plan-check.py private/plan-truth/<site>.json RECORD.json

RECORD.json is a run response or a record version (GET /api/sites/<id>/versions/latest).

Truth file shape (all keys optional except overlay, viewport, ft_per_pt):
{
  "overlay": "apps/web/public/private/plan-overlay/<site>.json",
  "viewport": [x0, y0, x1, y1],             # the site plan's frame on the sheet, PDF points
  "ft_per_pt": 0.4444,                      # 1/32" = 1'-0"
  "building_pt": [x0, y0, x1, y1],          # the drawn main building's box (drawn axis-aligned)
  "points_pt": {"poi": [x, y], "bess": [x, y]},
  "poles_pt": [[x, y], ...],                # utility poles marked UP on the plan, PDF points
  "poles_ll": [[lon, lat], ...],            # or the same, already as lon/lat
  "values": {"service_voltage": "480Y/277", "main_device_rating": 600, "kaic_rating": 65,
             "building_to_lot_line_ft": 50.7}
}
"""

import json
import math
import sys

M_PER_DEG = 111_320.0
FT = 0.3048


def main():
    truth = json.load(open(sys.argv[1], encoding="utf-8"))
    data = json.load(open(sys.argv[2], encoding="utf-8"))
    record = data.get("record", data)
    overlay = json.load(open(truth["overlay"], encoding="utf-8"))
    vx0, vy0, vx1, vy1 = truth["viewport"]
    ft_per_pt = truth["ft_per_pt"]
    tl, tr, br, bl = overlay["corners"]
    k = math.cos(math.radians(tl[1]))

    def to_ll(p):
        u, v = (p[0] - vx0) / (vx1 - vx0), (p[1] - vy0) / (vy1 - vy0)
        top = [tl[i] + (tr[i] - tl[i]) * u for i in range(2)]
        bot = [bl[i] + (br[i] - bl[i]) * u for i in range(2)]
        return [top[i] + (bot[i] - top[i]) * v for i in range(2)]

    def feet(a, b):
        return math.hypot((a[0] - b[0]) * M_PER_DEG * k, (a[1] - b[1]) * M_PER_DEG) / FT

    def value(field):
        v = next((v for v in record["values"] if v["field"] == field), None)
        return (v or {}).get("current"), (v or {}).get("state", "absent")

    rows = []

    def row(item, ours, theirs, verdict, note=""):
        rows.append((item, str(ours), str(theirs), verdict, note))

    # The building's sides
    if "building_pt" in truth:
        x0, y0, x1, y1 = truth["building_pt"]
        sides = sorted([(x1 - x0) * ft_per_pt, (y1 - y0) * ft_per_pt], reverse=True)
        (w, _), (d, _) = value("building_width_ft"), value("building_depth_ft")
        if w and d:
            ours = sorted([w["value"], d["value"]], reverse=True)
            for name, o, t in (("Building length", ours[0], sides[0]), ("Building width", ours[1], sides[1])):
                off = abs(o - t) / t * 100
                row(name, f"{o:.0f} ft", f"{t:.0f} ft", "match" if off <= 3 else "off", f"{off:.1f}% apart")

    # Poles: each surveyed pole matched to the nearest detected one
    detected = [f["geometry"]["coordinates"] for f in record["features"]
                if (f.get("attributes") or {}).get("equipment_type", {}).get("value") == "utility_pole" and f["geometry"]["type"] == "Point"]
    surveyed = [to_ll(p) for p in truth.get("poles_pt", [])] + truth.get("poles_ll", [])
    if surveyed:
        errors = []
        for ll in surveyed:
            near = min((feet(ll, d) for d in detected), default=None)
            errors.append(near)
        found = [e for e in errors if e is not None and e <= 25]
        row("Utility poles found", f"{len(found)} of {len(errors)}", f"{len(errors)} on the plan", "match" if len(found) == len(errors) else "missed",
            f"position error {min(found):.1f}-{max(found):.1f} ft" if found else "")
        row("Detected poles", len(detected), "", "info", "detections beyond the surveyed area aren't scored")

    # Values from the electrical sheets
    for field, expected in truth.get("values", {}).items():
        current, state = value(field)
        ours = current.get("value") if current else None
        ok = ours is not None and (str(expected).lower() in str(ours).lower() if isinstance(expected, str) else abs(float(ours) - float(expected)) < 0.05 * abs(float(expected)) + 0.05)
        row(field, f"{ours} ({state})", expected, "match" if ok else ("missing" if ours is None else "off"))

    # Locations: the point of interconnection and the engineered BESS spot against the concept layout
    pts = truth.get("points_pt", {})
    pin = next((f for f in record["features"] if f["kind"] == "capture_pin" and f["field"] == "switchboard_location"), None)
    if "poi" in pts:
        poi = to_ll(pts["poi"])
        row("Main switchboard (POI)", "placed" if pin else "not placed", f"{poi[1]:.6f}, {poi[0]:.6f}",
            "match" if pin and feet(pin["geometry"]["coordinates"], poi) < 10 else "missing",
            f"{feet(pin['geometry']['coordinates'], poi):.0f} ft apart" if pin else "place it from the plan set")
    if "bess" in pts:
        row("Engineered BESS spot", "", "{:.6f}, {:.6f}".format(*reversed(to_ll(pts["bess"]))), "info",
            "compare with the concept pad: the zone check prints the distance")

    w = max(len(r[0]) for r in rows)
    for r in rows:
        print(f"{r[0]:<{w}} | {r[1]:<28} | {r[2]:<28} | {r[3]:<7} | {r[4]}")
    scored = [r for r in rows if r[3] in ("match", "off", "missing", "missed")]
    print(f"\n{sum(r[3] == 'match' for r in scored)} of {len(scored)} scored items match the plan set.")


if __name__ == "__main__":
    main()
