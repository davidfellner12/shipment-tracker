"""
Render the project report from the experiment results.

  python evaluation/run_experiments.py   # produces evaluation/results/results.json + figures
  python report/build.py                 # → report/report.html and report/report.pdf

Every number in the report is read from results.json, so the PDF always matches the code.
PDF printing uses a local Edge/Chrome via playwright-core (cd report && npm install once).
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path
from string import Template

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
R = json.loads((ROOT / "evaluation" / "results" / "results.json").read_text(encoding="utf-8"))
NET = json.loads((ROOT / "shared" / "network.json").read_text(encoding="utf-8"))
CAT = json.loads((ROOT / "shared" / "catalog.json").read_text(encoding="utf-8"))


def f(x, d=0):
    return f"{x:,.{d}f}"


def p(x, d=1):
    return f"{x * 100:.{d}f} %"


def ms(key, d=1, scale=1.0, unit=""):
    m = R["E1"]["summary"][key]
    return f"{m['mean'] * scale:.{d}f}{unit} ± {m['sd'] * scale:.{d}f}{unit}"


E1, E2, E3, E4, E5 = R["E1"], R["E2"]["errors"], R["E3"], R["E4"], R["E5"]
cfg = R["config"]
cps = ["0.1", "0.25", "0.5", "0.75", "0.9"]
names = {"naive": "Distance ÷ 80 km/h (baseline)", "speed_profile": "+ country speed profile",
         "speed_customs": "+ customs clearance", "full": "+ driving-time rules (deployed)"}
countries = sorted({s["country"] for l in NET["lanes"] for s in l["segments"]})
total_deliveries = sum(r["shipments"] for r in E1["perSeed"])

# ── tables ──
eta_rows = "".join(
    f"<tr><td>{label}</td>" + "".join(
        f"<td class='num{' best' if name == 'full' else ''}'>{f(E2[cp][name]['mae'])}</td>" for cp in cps) +
    f"<td class='num'>{p(E2['0.5'][name]['within30'], 0)}</td><td class='num'>{f(E2['0.5'][name]['p90'])}</td></tr>"
    for name, label in names.items())

outcome_rows = "".join(f"<tr><td>{label}</td><td class='num'>{val}</td></tr>" for label, val in [
    ("Deliveries per 30-day run", ms("shipments", 0)),
    ("On-time delivery rate", ms("onTimeRate", 1, 100, " %")),
    ("Mean lateness of late deliveries", ms("avgLateMin", 0, 1, " min")),
    ("Median transit time", ms("medianTransitH", 1, 1, " h")),
    ("Emission intensity, g CO₂e/tkm (well-to-wheel)", ms("gCo2ePerTkm", 1)),
    ("Shipments with customs hold", ms("customsHoldShare", 1, 100, " %")),
    ("Reefer loads with temperature excursion", ms("tempExcursionRate", 1, 100, " %")),
])

thr_rows = "".join(
    f"<tr><td class='num'>{r['intervalS']} s</td><td class='num'>{f(r['trucksPerShard'])}</td>"
    f"<td class='num'>{f(r['msgPerDayPer1000Trucks'] / 1e6, 2)} M</td></tr>" for r in E5["rows"])

sens = {(g["slack"], g["factor"]): g for g in E3}
base = sens[(0.5, 1.0)]

eta_full, eta_naive = E2["0.1"]["full"], E2["0.1"]["naive"]
near_full, near_prof = E2["0.9"]["full"], E2["0.9"]["speed_profile"]

if near_full["mae"] <= near_prof["mae"]:
    near_dest_sentence = (f"Close to the destination the gap narrows (90&nbsp;% progress: {f(near_full['mae'])} vs. "
                          f"{f(E2['0.9']['naive']['mae'])}&nbsp;min for the baseline), as little can happen on the last stretch.")
else:
    near_dest_sentence = (f"Close to the destination the advantage disappears: at 90&nbsp;% progress the speed-profile variant has a "
                          f"slightly lower mean error ({f(near_prof['mae'])} vs. {f(near_full['mae'])}&nbsp;min), while the full model "
                          f"has the lower P90 error ({f(near_full['p90'])} vs. {f(near_prof['p90'])}&nbsp;min).")

html = Template((HERE / "template.html").read_text(encoding="utf-8")).substitute(
    trucks=cfg["trucks"], seeds=len(cfg["seeds"]), days=cfg["days"],
    hubs=len(NET["hubs"]), lanes=len(NET["lanes"]), countries=len(countries), country_list=", ".join(countries),
    customers=len(CAT["customers"]), total_deliveries=f(total_deliveries),
    lane_km_min=f(min(l["distanceKm"] for l in NET["lanes"])), lane_km_max=f(max(l["distanceKm"] for l in NET["lanes"])),
    on_time=ms("onTimeRate", 1, 100, " %"), gco2=ms("gCo2ePerTkm", 1, 1, ""),
    eta_rows=eta_rows, outcome_rows=outcome_rows, thr_rows=thr_rows,
    mae_full_10=f(eta_full["mae"]), mae_naive_10=f(eta_naive["mae"]),
    w30_full_10=p(eta_full["within30"], 0), w30_naive_10=p(eta_naive["within30"], 0),
    mae_full_50=f(E2["0.5"]["full"]["mae"]), mae_naive_50=f(E2["0.5"]["naive"]["mae"]),
    ratio_10=f(eta_naive["mae"] / eta_full["mae"], 1),
    mae_full_90=f(near_full["mae"]), mae_prof_90=f(near_prof["mae"]),
    p90_full_90=f(near_full["p90"]), p90_prof_90=f(near_prof["p90"]),
    med_full_90=f(near_full["medianAE"]), med_prof_90=f(near_prof["medianAE"]),
    over2h_full_90=p(near_full["over2h"], 1), near_dest_sentence=near_dest_sentence,
    n_eta=f(E2["0.5"]["full"]["n"]),
    sens_base=p(base["onTimeRate"]), sens_base_early=f(base["medianEarlyMin"]),
    sens_lo=p(sens[(0.25, 0.9)]["onTimeRate"], 0), sens_hi=p(sens[(1.0, 1.1)]["onTimeRate"], 0),
    sens_hi_early=f(sens[(1.0, 1.1)]["medianEarlyMin"]),
    e4_msgs=f(E4["messages"]), e4_dups=f(E4["duplicates"]), e4_bad=f(E4["malformed"]),
    e4_ship=f(E4["shipments"]), e4_same=f(E4["identicalFinalState"]), e4_dlq=f(E4["dlqMessages"]),
    e4_ev_clean=f(E4["eventsClean"]), e4_ev_pert=f(E4["eventsPerturbed"]),
    msg_bytes=f(E5["avgMessageBytes"]), msg_p95=f(E5["p95MessageBytes"]),
)
(HERE / "report.html").write_text(html, encoding="utf-8")
print(f"Wrote {HERE / 'report.html'}")

node = shutil.which("node")
if node and (HERE / "node_modules" / "playwright-core").exists():
    subprocess.run([node, str(HERE / "pdf.mjs")], check=True, cwd=HERE)
    public = ROOT / "dashboard" / "public"
    public.mkdir(exist_ok=True)
    shutil.copy(HERE / "report.pdf", public / "report.pdf")      # served by the web app at /report.pdf
    print(f"Copied report.pdf to {public}")
else:
    print("Skipping PDF: run `cd report && npm install` (needs Node.js and a local Edge or Chrome).", file=sys.stderr)
