# simulator/config.py
# Values come from environment variables or simulator/.env, which
# scripts/provision_device.py writes for you after `cdk deploy`.

import os
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv(_HERE / ".env")

IOT_ENDPOINT = os.environ.get("IOT_ENDPOINT", "")
IOT_PORT     = int(os.environ.get("IOT_PORT", "8883"))

CERT_PATH = os.environ.get("IOT_CERT_PATH", str(_HERE / "certs" / "device-certificate.pem.crt"))
KEY_PATH  = os.environ.get("IOT_KEY_PATH",  str(_HERE / "certs" / "private.pem.key"))
CA_PATH   = os.environ.get("IOT_CA_PATH",   str(_HERE / "certs" / "AmazonRootCA1.pem"))

# Must match the IoT policy: client ids are restricted to "shipment-simulator-*"
CLIENT_ID_PREFIX = "shipment-simulator"
