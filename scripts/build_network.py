"""
Build shared/network.json — the road network the simulator and dashboard share.

For every lane (hub → hub) this fetches the real truck-drivable road geometry from
the public OSRM demo server, simplifies it, and tags each stretch with the country
it runs through (Natural Earth boundaries). Country segments drive speed limits,
tolls and border crossings in the simulation.

Run once; the output is committed. Re-run only when hubs/lanes change:
  python scripts/build_network.py
"""

import json
import math
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT  = ROOT / "shared" / "network.json"

OSRM = "https://router.project-osrm.org/route/v1/driving/{a};{b}?overview=full&geometries=geojson"
BOUNDARIES = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
              "geojson/ne_50m_admin_0_countries.geojson")

HUBS = {
    "VIE": ("Vienna",    "AT", 48.2082, 16.3738),
    "LNZ": ("Linz",      "AT", 48.3069, 14.2858),
    "GRZ": ("Graz",      "AT", 47.0707, 15.4395),
    "MUC": ("Munich",    "DE", 48.1351, 11.5820),
    "FRA": ("Frankfurt", "DE", 50.1109,  8.6821),
    "HAM": ("Hamburg",   "DE", 53.5503,  9.9937),
    "RTM": ("Rotterdam", "NL", 51.9244,  4.4777),
    "PAR": ("Paris",     "FR", 48.8566,  2.3522),
    "LYS": ("Lyon",      "FR", 45.7640,  4.8357),
    "ZRH": ("Zürich",    "CH", 47.3769,  8.5417),
    "MIL": ("Milan",     "IT", 45.4642,  9.1900),
    "PRG": ("Prague",    "CZ", 50.0755, 14.4378),
    "WAW": ("Warsaw",    "PL", 52.2297, 21.0122),
    "BUD": ("Budapest",  "HU", 47.4979, 19.0402),
    "BER": ("Berlin",     "DE", 52.5200, 13.4050),
    "CGN": ("Cologne",    "DE", 50.9375,  6.9603),
    "STR": ("Stuttgart",  "DE", 48.7758,  9.1829),
    "LEJ": ("Leipzig",    "DE", 51.3397, 12.3731),
    "NUE": ("Nuremberg",  "DE", 49.4521, 11.0767),
    "AMS": ("Amsterdam",  "NL", 52.3676,  4.9041),
    "ANR": ("Antwerp",    "BE", 51.2194,  4.4025),
    "BRU": ("Brussels",   "BE", 50.8503,  4.3517),
    "SXB": ("Strasbourg", "FR", 48.5734,  7.7521),
    "TRN": ("Turin",      "IT", 45.0703,  7.6869),
    "VRN": ("Verona",     "IT", 45.4384, 10.9916),
    "BLQ": ("Bologna",    "IT", 44.4949, 11.3426),
    "GOA": ("Genoa",      "IT", 44.4056,  8.9463),
    "LJU": ("Ljubljana",  "SI", 46.0569, 14.5058),
    "ZAG": ("Zagreb",     "HR", 45.8150, 15.9819),
    "BTS": ("Bratislava", "SK", 48.1486, 17.1077),
    "BRQ": ("Brno",       "CZ", 49.1951, 16.6068),
    "WRO": ("Wrocław",    "PL", 51.1079, 17.0385),
    "KTW": ("Katowice",   "PL", 50.2649, 19.0238),
    "POZ": ("Poznań",     "PL", 52.4064, 16.9252),
    "SZG": ("Salzburg",   "AT", 47.8095, 13.0550),
    "INN": ("Innsbruck",  "AT", 47.2692, 11.4041),
    "BSL": ("Basel",      "CH", 47.5596,  7.5886),
}

# Undirected corridors; each becomes two lanes (A→B, B→A).
CORRIDORS = [
    ("VIE", "HAM"), ("VIE", "MUC"), ("VIE", "PRG"), ("VIE", "BUD"), ("VIE", "WAW"),
    ("VIE", "MIL"), ("LNZ", "FRA"), ("GRZ", "MIL"), ("GRZ", "MUC"), ("MUC", "ZRH"),
    ("MUC", "FRA"), ("MUC", "PAR"), ("FRA", "RTM"), ("FRA", "PAR"), ("HAM", "RTM"),
    ("HAM", "PRG"), ("PRG", "WAW"), ("BUD", "WAW"), ("ZRH", "LYS"), ("ZRH", "MIL"),
    ("LYS", "PAR"), ("LYS", "MIL"), ("PAR", "RTM"), ("PRG", "MUC"),
    ("BER", "HAM"), ("BER", "LEJ"), ("BER", "POZ"), ("BER", "PRG"), ("LEJ", "NUE"), ("NUE", "MUC"),
    ("NUE", "FRA"), ("CGN", "FRA"), ("CGN", "RTM"), ("CGN", "BRU"), ("CGN", "HAM"), ("AMS", "RTM"),
    ("AMS", "HAM"), ("ANR", "RTM"), ("ANR", "BRU"), ("ANR", "CGN"), ("BRU", "PAR"), ("STR", "MUC"),
    ("STR", "FRA"), ("STR", "ZRH"), ("STR", "SXB"), ("SXB", "PAR"), ("SXB", "BSL"), ("BSL", "ZRH"),
    ("BSL", "MIL"), ("TRN", "MIL"), ("TRN", "LYS"), ("GOA", "MIL"), ("GOA", "TRN"), ("VRN", "MUC"),
    ("VRN", "BLQ"), ("BLQ", "MIL"), ("LJU", "GRZ"), ("LJU", "ZAG"), ("LJU", "VRN"), ("ZAG", "BUD"),
    ("BTS", "VIE"), ("BTS", "BUD"), ("BRQ", "VIE"), ("BRQ", "PRG"), ("BRQ", "KTW"), ("KTW", "WRO"),
    ("WRO", "POZ"), ("POZ", "WAW"), ("KTW", "WAW"), ("WRO", "PRG"), ("SZG", "MUC"), ("SZG", "LNZ"),
    ("INN", "MUC"), ("INN", "VRN"), ("INN", "ZRH"), ("LNZ", "VIE"), ("VIE", "GRZ"), ("NUE", "PRG"),
]

A3_TO_A2 = {"AUT": "AT", "DEU": "DE", "NLD": "NL", "FRA": "FR", "CHE": "CH", "ITA": "IT",
            "CZE": "CZ", "POL": "PL", "HUN": "HU", "SVK": "SK", "SVN": "SI", "BEL": "BE",
            "LUX": "LU", "LIE": "LI", "HRV": "HR"}


def fetch_json(url: str, attempts: int = 5) -> dict:
    """GET with retry/backoff — the public OSRM demo server is occasionally flaky."""
    for i in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except OSError as exc:
            if i == attempts - 1:
                raise
            wait = 2 ** i * 3
            print(f"    retry in {wait}s ({exc})")
            time.sleep(wait)


def haversine_km(a, b):
    (lon1, lat1), (lon2, lat2) = a, b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def simplify(points, tol):
    """Ramer–Douglas–Peucker on lon/lat (degrees) — iterative to avoid recursion limits."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        (x1, y1), (x2, y2) = points[s], points[e]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, None
        for i in range(s + 1, e):
            x0, y0 = points[i]
            d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    return [p for p, k in zip(points, keep) if k]


def load_countries():
    data = fetch_json(BOUNDARIES)
    shapes = []
    for f in data["features"]:
        code = A3_TO_A2.get(f["properties"]["ADM0_A3"])
        if not code:
            continue
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            ring = poly[0]
            xs, ys = [p[0] for p in ring], [p[1] for p in ring]
            shapes.append((code, (min(xs), min(ys), max(xs), max(ys)), ring))
    return shapes


def in_ring(pt, ring):
    x, y = pt
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi:
            inside = not inside
        j = i
    return inside


def country_of(pt, shapes, fallback):
    for code, (x0, y0, x1, y1), ring in shapes:
        if x0 <= pt[0] <= x1 and y0 <= pt[1] <= y1 and in_ring(pt, ring):
            return code
    return fallback


def anchor_endpoints(segments, src_country, dst_country):
    """A lane must start/end in its hubs' countries — border hubs (e.g. Basel) can lose
    their short final stretch to the sliver filter, which would hide a customs crossing."""
    if segments[0]["country"] != src_country:
        first = segments[0]
        cut = min(1.0, (first["endKm"] - first["startKm"]) / 2)
        segments.insert(0, {"country": src_country, "startKm": first["startKm"], "endKm": first["startKm"] + cut})
        first["startKm"] += cut
    if segments[-1]["country"] != dst_country:
        last = segments[-1]
        cut = min(1.0, (last["endKm"] - last["startKm"]) / 2)
        segments.append({"country": dst_country, "startKm": last["endKm"] - cut, "endKm": last["endKm"]})
        last["endKm"] -= cut
    return segments


def build_lane(a, b, shapes):
    ha, hb = HUBS[a], HUBS[b]
    url = OSRM.format(a=f"{ha[3]},{ha[2]}", b=f"{hb[3]},{hb[2]}")
    route = fetch_json(url)["routes"][0]
    full = route["geometry"]["coordinates"]
    pts  = simplify(full, 0.005)                       # ~400–500 m tolerance
    pts  = [[round(x, 5), round(y, 5)] for x, y in pts]

    # Country per point, smoothed into segments along cumulative km
    cum, total = [0.0], 0.0
    for p, q in zip(pts, pts[1:]):
        total += haversine_km(p, q)
        cum.append(total)
    scale = (route["distance"] / 1000) / total        # match OSRM's road distance exactly
    cum = [round(c * scale, 2) for c in cum]

    segments, prev = [], ha[1]
    for i, p in enumerate(pts):
        c = country_of(p, shapes, prev)
        if not segments or segments[-1]["country"] != c:
            if segments:
                segments[-1]["endKm"] = cum[i]
            segments.append({"country": c, "startKm": cum[i]})
        prev = c
    segments[-1]["endKm"] = cum[-1]
    # Drop slivers (< 3 km) caused by roads hugging a border
    merged = []
    for s in segments:
        if merged and (s["endKm"] - s["startKm"] < 3 or s["country"] == merged[-1]["country"]):
            merged[-1]["endKm"] = s["endKm"]
        else:
            merged.append(s)

    merged = anchor_endpoints(merged, ha[1], hb[1])
    return {
        "id": f"{a}-{b}", "from": a, "to": b,
        "label": f"{ha[0]} → {hb[0]}",
        "distanceKm": round(route["distance"] / 1000, 1),
        "coords": pts, "cumKm": cum, "segments": merged,
    }


def main():
    print("Loading country boundaries…")
    shapes = load_countries()
    lanes = []
    for a, b in CORRIDORS:
        for x, y in ((a, b), (b, a)):
            lane = build_lane(x, y, shapes)
            lanes.append(lane)
            path = " → ".join(s["country"] for s in lane["segments"])
            print(f"  {lane['id']:8} {lane['distanceKm']:7.1f} km  {len(lane['coords']):4} pts  {path}")
            time.sleep(1.1)   # be polite to the public OSRM server

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "OSRM (router.project-osrm.org) road geometry © OpenStreetMap contributors; "
                  "country boundaries © Natural Earth",
        "hubs": {k: {"name": v[0], "country": v[1], "lat": v[2], "lon": v[3]} for k, v in HUBS.items()},
        "lanes": lanes,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB, {len(lanes)} lanes)")


if __name__ == "__main__":
    main()
