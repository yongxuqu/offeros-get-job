#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def main() -> None:
    parser = argparse.ArgumentParser(description="Export only the OfferOS jobs table.")
    parser.add_argument("output", nargs="?", default="exports/jobs.json")
    parser.add_argument("--source", default="", help="Optional source filter, for example tencent.")
    args = parser.parse_args()

    server.init_db()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with server.connect_db() as conn:
        if args.source:
            rows = conn.execute("SELECT * FROM jobs WHERE source = ? ORDER BY id", (args.source,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM jobs ORDER BY id").fetchall()

    jobs = [server.row_to_job(row) for row in rows]
    payload = {
        "name": "OfferOS jobs snapshot",
        "exportedAt": server.utc_string(),
        "count": len(jobs),
        "jobs": jobs,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output_path), "count": len(jobs)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
