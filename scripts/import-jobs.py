#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def main() -> None:
    parser = argparse.ArgumentParser(description="Import an OfferOS jobs snapshot.")
    parser.add_argument("input", help="Path to jobs snapshot JSON.")
    parser.add_argument(
        "--replace-source",
        default="",
        help="Delete existing jobs with this source before import. Use carefully on production.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    jobs = payload.get("jobs") or []
    if not isinstance(jobs, list):
        raise SystemExit("invalid jobs snapshot")

    server.init_db()
    imported = 0
    with server.connect_db() as conn:
        if args.replace_source:
            conn.execute("DELETE FROM jobs WHERE source = ?", (args.replace_source,))
        for job in jobs:
            job = dict(job)
            job.pop("id", None)
            server.upsert_job(conn, job)
            imported += 1

    print(
        json.dumps(
            {
                "input": str(input_path),
                "snapshotCount": len(jobs),
                "imported": imported,
                "replaceSource": args.replace_source,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
