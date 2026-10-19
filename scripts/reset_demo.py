"""
Reset the deployed demo data, so the next simulator start builds a fresh fleet
whose 30-day history ends now.

The simulator resumes from simulator/.state.json with the simulated clock where
it stopped; days later the dashboard would show stale ETAs. This empties both
DynamoDB tables and removes the saved state. Afterwards:

  python simulator/simulator.py        # ~8 min backfill, then live

Usage:
  python scripts/reset_demo.py                 # dev stage, asks for confirmation
  python scripts/reset_demo.py --stage prod --yes
"""

import argparse
import sys
from pathlib import Path

import boto3

STATE_FILE = Path(__file__).resolve().parent.parent / "simulator" / ".state.json"
TABLES = ["ShipmentsTable-{stage}", "ShipmentEvents-{stage}"]


def empty(table) -> int:
    keys = [k["AttributeName"] for k in table.key_schema]
    deleted, kw = 0, {"ProjectionExpression": ", ".join(f"#k{i}" for i in range(len(keys))),
                      "ExpressionAttributeNames": {f"#k{i}": k for i, k in enumerate(keys)}}
    with table.batch_writer() as batch:
        while True:
            page = table.scan(**kw)
            for item in page["Items"]:
                batch.delete_item(Key=item)
                deleted += 1
            if "LastEvaluatedKey" not in page:
                return deleted
            kw["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stage", default="dev")
    parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation")
    args = parser.parse_args()

    names = [n.format(stage=args.stage) for n in TABLES]
    if not args.yes and input(f"Delete all items in {', '.join(names)}? [y/N] ").strip().lower() != "y":
        sys.exit("Aborted.")
    dynamodb = boto3.resource("dynamodb")
    for name in names:
        print(f"{name}: {empty(dynamodb.Table(name))} items deleted")
    if STATE_FILE.exists():
        STATE_FILE.unlink()
        print(f"Removed {STATE_FILE.name}")


if __name__ == "__main__":
    main()
