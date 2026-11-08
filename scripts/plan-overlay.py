"""Align a drawn site plan from a plan-set PDF onto the map, for one site.

The drawing is placed by its own scale, then turned and moved so its building matches the mapped
building footprint in the site record. The output is a transparent PNG and the four corner
coordinates the map needs. Plan sets carry customer details, so the output goes in a
gitignored folder and is never committed.

Usage (needs PyMuPDF on PYTHONPATH):
  python -I scripts/plan-overlay.py PLAN.pdf PAGE VIEWPORT BUILDING FT_PER_PT RECORD.json OUT_DIR
    VIEWPORT, BUILDING: x0,y0,x1,y1 in PDF points (the drawing's frame, and the drawn building's box)
    FT_PER_PT: the drawing scale; 1/32" = 1'-0" is 32/72 = 0.4444
    RECORD.json: a run response or record with the site's building_outline feature
"""

import json
import math
import sys

import pymupdf

M_PER_FT = 0.3048
M_PER_DEG = 111_320.0


def box(text):
    return [float(v) for v in text.split(",")]


def min_area_rect(points):
    """The smallest rectangle around a ring, as (centre, long-axis bearing in degrees, long m, short m)."""
    best = None
    for i in range(len(points) - 1):
        (x0, y0), (x1, y1) = points[i], points[i + 1]
        a = math.atan2(y1 - y0, x1 - x0)
        c, s = math.cos(a), math.sin(a)
        us = [x * c + y * s for x, y in points]
        vs = [-x * s + y * c for x, y in points]
        area = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or area < best[0]:
            best = (area, a, min(us), max(us), min(vs), max(vs))
    _, a, u0, u1, v0, v1 = best
    c, s = math.cos(a), math.sin(a)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    centre = (uc * c - vc * s, uc * s + vc * c)
    du, dv = u1 - u0, v1 - v0
    # Bearing of the long axis, clockwise from north, in [0, 180).
    angle = a if du >= dv else a + math.pi / 2
    bearing = (90 - math.degrees(angle)) % 180
    return centre, bearing, max(du, dv), min(du, dv)


def main():
    pdf, page_no, viewport, building, ft_per_pt, record_path, out_dir = sys.argv[1:8]
    viewport, building, ft_per_pt = box(viewport), box(building), float(ft_per_pt)
    data = json.load(open(record_path, encoding="utf-8"))
    record = data.get("record", data)
    outlines = [f for f in record["features"] if f["kind"] == "building_outline" and f["geometry"]["type"] == "Polygon"]
    ring = max((f["geometry"]["coordinates"][0] for f in outlines), key=len)
    lng0 = sum(p[0] for p in ring) / len(ring)
    lat0 = sum(p[1] for p in ring) / len(ring)
    k = math.cos(math.radians(lat0))
    local = [((p[0] - lng0) * M_PER_DEG * k, (p[1] - lat0) * M_PER_DEG) for p in ring]
    (cx, cy), bearing, long_m, short_m = min_area_rect(local)

    m_per_pt = ft_per_pt * M_PER_FT
    bx0, by0, bx1, by1 = building
    drawn_long = (bx1 - bx0) * m_per_pt
    drawn_short = (by1 - by0) * m_per_pt
    # The drawing's +x runs along the building's long side. Of the two directions along it, take the
    # one nearer east, so the drawing's top stays on the north side as it was drafted.
    if bearing > 180 - 1e-9:
        bearing -= 180
    x_bearing = bearing if abs(((bearing - 90) + 180) % 360 - 180) <= 90 else bearing + 180
    t = math.radians(x_bearing)
    ex, ey = math.sin(t), math.cos(t)  # drawing +x, in east/north
    dx, dy = ey, -ex  # drawing +y (down the page) is +x turned clockwise 90 degrees
    pcx, pcy = (bx0 + bx1) / 2, (by0 + by1) / 2

    def to_lnglat(px, py):
        u, v = (px - pcx) * m_per_pt, (py - pcy) * m_per_pt
        e = cx + u * ex + v * dx
        n = cy + u * ey + v * dy
        return [lng0 + e / (M_PER_DEG * k), lat0 + n / M_PER_DEG]

    vx0, vy0, vx1, vy1 = viewport
    corners = [to_lnglat(vx0, vy0), to_lnglat(vx1, vy0), to_lnglat(vx1, vy1), to_lnglat(vx0, vy1)]

    doc = pymupdf.open(pdf)
    page = doc[int(page_no) - 1]
    pix = page.get_pixmap(clip=pymupdf.Rect(*viewport), dpi=150, alpha=True)
    # Linework only: anything near white becomes clear, everything else dark blue-black, so the
    # drawing reads over the aerial.
    samples = bytearray(pix.samples)
    for i in range(0, len(samples), 4):
        r, g, b, a = samples[i : i + 4]
        lum = (r + g + b) / 3 if a else 255
        if lum > 200:
            samples[i : i + 4] = b"\x00\x00\x00\x00"
        else:
            samples[i : i + 4] = bytes((10, 20, 60, 255))
    out = pymupdf.Pixmap(pymupdf.csRGB, pix.width, pix.height, bytes(samples), True)
    site_id = record["site"]["id"]
    out.save(f"{out_dir}/{site_id}.png")
    meta = {
        "siteId": site_id,
        "image": f"{site_id}.png",
        "corners": corners,
        "label": "Plan set site plan",
        "fit": {
            "method": "drawn scale, turned and moved so the drawn building matches the mapped footprint",
            "drawn_building_m": [round(drawn_long, 1), round(drawn_short, 1)],
            "mapped_building_m": [round(long_m, 1), round(short_m, 1)],
            "x_axis_bearing_deg": round(x_bearing % 360, 2),
        },
    }
    json.dump(meta, open(f"{out_dir}/{site_id}.json", "w", encoding="utf-8"), indent=2)
    print(json.dumps(meta["fit"]))


if __name__ == "__main__":
    main()
