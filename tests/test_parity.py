"""The demo's mock backend (dashboard/src/sim/views.js) must answer like the deployed API (lambda/api/views.py).

Both modules compute the same views and KPIs from the same stored items; the JS port runs in
Node.js on items written by the real process_event Lambda, and the outputs are compared.
"""

import json
import shutil
import subprocess

import pytest

import views
from conftest import ROOT, load_handler
from test_lambdas import api_event, history, ingest  # noqa: F401 (history is a fixture)

NODE = shutil.which("node")
VIEWS_JS = (ROOT / "dashboard" / "src" / "sim" / "views.js").as_uri()
REAL_NOW = 1_780_400_000          # fixed "wall clock" so SIGNAL_LOST is deterministic

RUN_JS = f"""
import {{ shipmentView, computeMetrics }} from '{VIEWS_JS}';
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {{
  const {{ items, realNow, customerId }} = JSON.parse(input);
  process.stdout.write(JSON.stringify({{
    views: items.map((i) => shipmentView(i, realNow)),
    metrics: computeMetrics(items, 30, null),
    customer: computeMetrics(items, 7, customerId),
  }}));
}});
"""


def close(a, b, path="$"):
    """Deep equality; numbers may differ by rounding (Python rounds half to even, JS half up)."""
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        assert abs(a - b) <= max(1, abs(a) * 1e-3), f"{path}: {a} != {b}"
    elif isinstance(a, dict) and isinstance(b, dict):
        assert a.keys() == b.keys(), f"{path}: keys {sorted(a.keys() ^ b.keys())}"
        for k in a:
            close(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list) and isinstance(b, list):
        assert len(a) == len(b), f"{path}: length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            close(x, y, f"{path}[{i}]")
    else:
        assert a == b, f"{path}: {a!r} != {b!r}"


@pytest.mark.skipif(not NODE, reason="Node.js not installed")
def test_mock_views_match_api(aws, history):
    process, api = load_handler("process_event"), load_handler("api")
    ingest(history, process)
    # Items exactly as stored, with the operator flag on one of them
    update = load_handler("update_shipment")
    active = next(m["shipmentId"] for m in reversed(history) if m["status"] != "DELIVERED")
    update.handler(api_event("PUT", active, {"isDelayed": True, "delayReason": "Customer requested hold"}), None)
    items = json.loads(json.dumps(api.scan_all(), cls=api.DecimalEncoder))
    customer_id = items[0]["customerId"]

    py = {
        "views": [views.shipment_view(i, REAL_NOW) for i in items],
        "metrics": views.compute_metrics(items, 30, None),
        "customer": views.compute_metrics(items, 7, customer_id),
    }
    run = subprocess.run([NODE, "--input-type=module", "-e", RUN_JS], capture_output=True, text=True,
                         encoding="utf-8", timeout=60,
                         input=json.dumps({"items": items, "realNow": REAL_NOW, "customerId": customer_id}))
    assert run.returncode == 0, run.stderr
    js = json.loads(run.stdout)

    assert py["metrics"]["kpis"]["delivered"] > 0
    assert any(v["flag"] for v in py["views"])
    close(py, js)
