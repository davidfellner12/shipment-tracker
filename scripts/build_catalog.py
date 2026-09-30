"""
Build shared/catalog.json — the fictional demo tenant (carrier, shippers, fleet, drivers,
consignees). Deterministic (fixed seed), so re-running gives the same catalog.

Everything here is invented: company names, people, sites and plates. Cargo types use
real HS tariff chapters and ADR classes so shipment paperwork looks like the real thing.

  python scripts/build_catalog.py
"""

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "shared" / "catalog.json"
rng = random.Random(2026)

HUBS = json.loads((ROOT / "shared" / "network.json").read_text(encoding="utf-8"))["hubs"]


def cargo(type_, hs, tonnes, value, pallets, temp=None, adr=None, packaging="EUR pallets"):
    c = {"type": type_, "hsCode": hs, "tonnes": tonnes, "valueEur": value, "pallets": pallets, "packaging": packaging}
    if temp:
        c["tempC"] = temp
    if adr:
        c["adr"] = adr
    return c


# (id, name, short, industry, contact, hubs, site type, slack range, [cargo…])
CUSTOMERS = [
    ("CUST-ALP", "Alpenwerk Industrietechnik", "Alpenwerk", "Industrial machinery", "Katrin Moser", ["LNZ", "VIE", "GRZ", "MUC", "STR", "SZG"], "Plant", [60, 180],
     [cargo("Machine components", "8483", [12, 22], [80000, 260000], [12, 26]),
      cargo("Hydraulic units", "8412", [8, 16], [120000, 340000], [8, 18])]),
    ("CUST-VIT", "Vitalis Pharma", "Vitalis", "Pharmaceuticals", "Dr. Lena Graf", ["ZRH", "BSL", "VIE", "MIL", "LYS"], "DC", [60, 120],
     [cargo("Vaccines & biologics", "3002", [3, 9], [250000, 900000], [6, 18], temp=[2, 8]),
      cargo("Oncology medicines", "3004", [2, 6], [400000, 1200000], [4, 12], temp=[15, 25])]),
    ("CUST-NOR", "Nordhafen Handelshaus", "Nordhafen", "Retail / FMCG", "Jonas Petersen", ["HAM", "RTM", "AMS", "BER", "WAW", "FRA"], "DC", [120, 300],
     [cargo("Household goods", "3924", [10, 20], [30000, 95000], [26, 33]),
      cargo("Home textiles", "6302", [8, 14], [45000, 120000], [24, 33])]),
    ("CUST-DAN", "Danubia Foods", "Danubia", "Food & beverage", "Réka Kovács", ["BUD", "VIE", "PRG", "WAW", "BTS"], "DC", [45, 120],
     [cargo("Chilled dairy", "0406", [10, 21], [25000, 70000], [20, 33], temp=[0, 4]),
      cargo("Frozen bakery", "1905", [9, 18], [20000, 55000], [22, 33], temp=[-22, -16])]),
    ("CUST-MOR", "Moravia Auto Components", "Moravia", "Automotive (JIT)", "Tomáš Dvořák", ["PRG", "BRQ", "MUC", "BUD", "BTS", "KTW"], "Plant", [20, 45],
     [cargo("Seat modules (JIT)", "9401", [15, 24], [60000, 180000], [24, 33], packaging="returnable racks"),
      cargo("Wire harnesses", "8544", [6, 12], [90000, 240000], [14, 26], packaging="returnable racks")]),
    ("CUST-LUM", "Lumen Electronics", "Lumen", "Electronics", "Sophie Arnaud", ["MUC", "FRA", "PAR", "RTM", "AMS"], "Hub", [90, 180],
     [cargo("Server hardware", "8471", [6, 14], [150000, 650000], [10, 22]),
      cargo("Networking equipment", "8517", [4, 10], [200000, 800000], [8, 18])]),
    ("CUST-RHO", "Rhône Vins & Spiritueux", "Rhône Vins", "Beverages", "Julien Mercier", ["LYS", "PAR", "MIL", "ZRH", "TRN"], "Cellar", [120, 240],
     [cargo("Wine", "2204", [18, 24], [70000, 220000], [22, 30], temp=[10, 18]),
      cargo("Spirits", "2208", [12, 20], [120000, 380000], [18, 26])]),
    ("CUST-VIS", "Vistula Medical Supplies", "Vistula Medical", "Medical devices", "Anna Zielińska", ["WAW", "POZ", "WRO", "PRG", "VIE"], "DC", [60, 150],
     [cargo("Medical consumables", "9018", [5, 12], [90000, 300000], [10, 24], temp=[15, 25]),
      cargo("Diagnostic kits", "3822", [2, 6], [150000, 450000], [4, 12], temp=[2, 8])]),
    ("CUST-RHC", "Rheinchem Specialty Chemicals", "Rheinchem", "Chemicals", "Dr. Markus Vogel", ["CGN", "ANR", "RTM", "FRA", "BSL"], "Site", [90, 240],
     [cargo("Industrial coatings", "3208", [14, 22], [40000, 110000], [18, 26], adr={"class": "3", "un": "UN1263", "name": "Paint, flammable"}, packaging="IBC & drums"),
      cargo("Cleaning agents (corrosive)", "3402", [12, 20], [25000, 70000], [16, 26], adr={"class": "8", "un": "UN1760", "name": "Corrosive liquid, n.o.s."}, packaging="IBC & drums")]),
    ("CUST-BAL", "Baltica Paper & Packaging", "Baltica", "Paper & packaging", "Piotr Lewandowski", ["POZ", "WRO", "BER", "LEJ", "HAM"], "Mill", [120, 300],
     [cargo("Corrugated board", "4808", [16, 23], [18000, 42000], [30, 33]),
      cargo("Paper reels", "4810", [22, 24], [25000, 60000], [16, 22], packaging="reels")]),
    ("CUST-ADR", "Adria Home Furniture", "Adria Home", "Furniture", "Maja Kovač", ["LJU", "ZAG", "GRZ", "VIE", "VRN"], "Warehouse", [120, 300],
     [cargo("Flat-pack furniture", "9403", [6, 12], [35000, 90000], [30, 33])]),
    ("CUST-MOD", "Modaviva Fashion Group", "Modaviva", "Fashion & e-commerce", "Chiara Conti", ["MIL", "BLQ", "VRN", "MUC", "PAR"], "Fulfilment centre", [90, 240],
     [cargo("Apparel (hanging garments)", "6204", [4, 9], [180000, 520000], [0, 0], packaging="hanging rails"),
      cargo("Footwear", "6403", [6, 12], [120000, 380000], [18, 30])]),
    ("CUST-TER", "Terra Agri Machinery", "Terra Agri", "Agricultural machinery", "Lukas Brandstätter", ["BLQ", "VRN", "INN", "LNZ", "BUD"], "Parts centre", [120, 240],
     [cargo("Tractor spare parts", "8708", [6, 14], [70000, 210000], [12, 26]),
      cargo("Irrigation pumps", "8413", [10, 18], [60000, 150000], [14, 24])]),
    ("CUST-KST", "Kaiserstein Building Materials", "Kaiserstein", "Building materials", "Florian Huber", ["LNZ", "SZG", "MUC", "NUE", "BRQ"], "Works", [180, 360],
     [cargo("Insulation panels", "6806", [5, 9], [15000, 32000], [30, 33]),
      cargo("Ceramic tiles", "6907", [22, 24], [20000, 45000], [18, 24])]),
    ("CUST-POL", "Polaris Tyre Distribution", "Polaris", "Tyres & wheels", "Karolina Nowak", ["KTW", "WRO", "BTS", "VIE", "NUE"], "Warehouse", [120, 240],
     [cargo("Truck tyres", "4011", [10, 16], [55000, 140000], [0, 0], packaging="loose, stacked")]),
    ("CUST-SIL", "Silesia Steel Service", "Silesia Steel", "Steel", "Jan Kowalczyk", ["KTW", "BRQ", "BTS", "LEJ"], "Service centre", [180, 360],
     [cargo("Hot-rolled steel coils", "7208", [22, 24], [16000, 26000], [0, 0], packaging="coils, chained")]),
    ("CUST-GEN", "Genova Coffee Roasters", "Genova Coffee", "Food & beverage", "Paolo Ferraro", ["GOA", "TRN", "MIL", "ZRH", "MUC"], "Roastery", [120, 300],
     [cargo("Green coffee beans", "0901", [18, 24], [70000, 150000], [20, 26], packaging="jute bags on pallets"),
      cargo("Roasted coffee", "0901", [8, 14], [90000, 210000], [16, 26])]),
    ("CUST-BRB", "Brabant Bio Foods", "Brabant Bio", "Fresh produce", "Eva Janssens", ["ANR", "BRU", "CGN", "AMS", "PAR"], "Packhouse", [45, 120],
     [cargo("Organic fresh produce", "0709", [10, 20], [20000, 60000], [22, 33], temp=[2, 6])]),
]

LEGAL_FORM = {"AT": "GmbH", "DE": "GmbH", "CH": "AG", "NL": "B.V.", "BE": "NV", "FR": "SAS", "IT": "S.p.A.",
              "CZ": "s.r.o.", "SK": "s.r.o.", "PL": "Sp. z o.o.", "HU": "Kft.", "SI": "d.o.o.", "HR": "d.o.o."}
CONSIGNEE_WORDS = ["Nova", "Mercur", "Orion", "Atlas", "Vega", "Helix", "Arcus", "Boreal", "Castell", "Linden",
                   "Meridian", "Sirius", "Aurora", "Vektor", "Pannon", "Danubio", "Solaris", "Kronos", "Ventura", "Albis"]
CONSIGNEE_KINDS = ["Distribution", "Handel", "Logistics", "Retail", "Trading", "Supply", "Wholesale", "Industrie"]

FIRST = ["Thomas", "Marek", "Piotr", "Stefan", "Sabine", "Jan", "Luca", "Nina", "Zoltán", "Elena", "Kamil", "Dávid",
         "Marco", "Hannah", "Andreas", "Martina", "Tomasz", "Lukas", "Petra", "Milan", "Ivana", "Bernd", "Gábor", "Sofia",
         "Radek", "Julia", "Matteo", "Klaus", "Agnieszka", "Florin", "Jürgen", "Katarina", "Pavel", "Monika", "Dragan",
         "Ewa", "Harald", "Lucie", "Nikola", "Wojciech"]
LAST = ["Aigner", "Holub", "Nowicki", "Leitner", "Reiter", "Kučera", "Bianchi", "Hofer", "Varga", "Marin", "Wróbel",
        "Szőke", "Galli", "Brandt", "Pichler", "Novotná", "Zając", "Gruber", "Horváth", "Svoboda", "Kovačić", "Schmid",
        "Tóth", "Ricci", "Dvořák", "Wagner", "Russo", "Bauer", "Kamińska", "Popescu", "Fuchs", "Horvat", "Procházka",
        "Weber", "Jovanović", "Mazur", "Eder", "Veselá", "Petrović", "Król"]

MODELS = {
    "DIESEL":   ["Mercedes-Benz Actros 1851", "Mercedes-Benz Actros L 1863", "MAN TGX 18.470", "MAN TGX 18.510",
                 "Scania R 450", "Scania S 500", "Volvo FH 460", "Volvo FH 500", "DAF XF 480", "DAF XG 530",
                 "Iveco S-Way 490", "Renault Trucks T 480"],
    "LNG":      ["Iveco S-Way NP 460", "Volvo FH 460 LNG", "Scania G 410 LNG"],
    "HVO":      ["Scania R 450", "Volvo FH 500", "MAN TGX 18.510", "DAF XG+ 530"],
    "ELECTRIC": ["Mercedes-Benz eActros 600", "Volvo FH Electric", "MAN eTGX", "Renault Trucks E-Tech T", "Scania 40 R BEV"],
}
# Home depots of the fleet (weighted towards the Austrian HQ)
HOMES = ["VIE"] * 7 + ["LNZ", "LNZ", "GRZ", "GRZ", "SZG", "INN", "MUC", "MUC", "MUC", "NUE", "STR", "FRA", "FRA", "CGN",
         "HAM", "HAM", "BER", "LEJ", "RTM", "ANR", "PAR", "LYS", "ZRH", "MIL", "MIL", "VRN", "PRG", "PRG", "BRQ", "BTS",
         "BUD", "WAW", "KTW"]
DISTRICT = {"VIE": "W", "LNZ": "L", "GRZ": "G", "SZG": "S", "INN": "I"}


def plate(home: str) -> str:
    # The carrier registers its trucks in Austria (HQ), district code by home depot, Vienna otherwise
    d = DISTRICT.get(home, "W")
    letters = "".join(rng.choice("ABCDEFGHKLMNPRSTUVWXYZ") for _ in range(2))
    return f"{d}-{rng.randint(1000, 99999)} {letters}"


def main():
    customers = {}
    for cid, name, short, industry, contact, hubs, site_type, slack, cargos in CUSTOMERS:
        slug = short.lower().replace(" ", "-").replace("ô", "o")
        first, last = contact.replace("Dr. ", "").split(" ", 1)
        customers[cid] = {
            "name": name, "short": short, "industry": industry, "contact": contact,
            "email": f"{first[0].lower()}.{last.lower().replace(' ', '')}@{slug}.example",
            "hubs": hubs,
            "sites": {h: f"{short} {site_type} {HUBS[h]['name']}" for h in hubs},
            "cargo": cargos, "slackMin": slack,
        }

    consignees = {}
    for hub, h in HUBS.items():
        words = rng.sample(CONSIGNEE_WORDS, 3)
        consignees[hub] = [f"{w} {rng.choice(CONSIGNEE_KINDS)} {LEGAL_FORM.get(h['country'], 'GmbH')}" for w in words]

    names = [f"{f} {l}" for f, l in zip(FIRST, rng.sample(LAST, len(LAST)))]
    drivers = {f"DRV-{i + 1:02d}": {"name": n} for i, n in enumerate(names)}

    fuels = ["DIESEL"] * 26 + ["LNG"] * 4 + ["HVO"] * 5 + ["ELECTRIC"] * 5
    rng.shuffle(fuels)
    vehicles = []
    for i, fuel in enumerate(fuels):
        home = HOMES[i % len(HOMES)]
        vehicles.append({
            "id": f"TRK-{i + 1:02d}", "plate": plate(home), "model": rng.choice(MODELS[fuel]), "fuel": fuel,
            "reefer": rng.random() < (0.2 if fuel == "ELECTRIC" else 0.45), "home": home, "driver": f"DRV-{i + 1:02d}",
            "year": rng.randint(2019, 2025) if fuel != "ELECTRIC" else rng.randint(2023, 2025),
        })

    catalog = {
        "_doc": "Fictional demo tenant generated by scripts/build_catalog.py. All companies, people, sites and plates are invented.",
        "carrier": {"name": "Alpina Freight Lines", "hq": "Vienna, AT", "code": "AFL"},
        "customers": customers,
        "consignees": consignees,
        "signatories": [f"{f} {l[0]}." for f, l in zip(rng.sample(FIRST, 20), rng.sample(LAST, 20))],
        "vehicles": vehicles,
        "drivers": drivers,
    }
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {OUT}: {len(customers)} customers, {len(vehicles)} trucks, {len(consignees)} hubs with consignees")


if __name__ == "__main__":
    main()
