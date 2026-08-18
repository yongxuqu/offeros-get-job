#!/usr/bin/env python3
import argparse
import datetime
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync OfferOS jobs from Tencent Docs.")
    parser.add_argument("--start", default=server.DEFAULT_SYNC_START_DATE)
    parser.add_argument("--end", default=server.DEFAULT_SYNC_END_DATE)
    parser.add_argument("--date", help="Sync one source update date, for example 2026-08-19.")
    parser.add_argument("--yesterday", action="store_true", help="Sync yesterday based on server local date.")
    parser.add_argument("--min-deadline", default=server.DEFAULT_MIN_DEADLINE_DATE)
    parser.add_argument("--import", dest="do_import", action="store_true")
    args = parser.parse_args()

    today = datetime.date.today()
    if args.yesterday:
        target_date = today - datetime.timedelta(days=1)
        start_date = target_date.isoformat()
        end_date = target_date.isoformat()
    elif args.date:
        start_date = args.date
        end_date = args.date
    else:
        start_date = args.start
        end_date = args.end

    if args.min_deadline == "today":
        min_deadline = today.isoformat()
    elif args.min_deadline == "yesterday":
        min_deadline = (today - datetime.timedelta(days=1)).isoformat()
    else:
        min_deadline = args.min_deadline

    server.init_db()
    result = server.collect_tencent_jobs(start_date, end_date, min_deadline)
    imported = 0
    if args.do_import:
        with server.connect_db() as conn:
            conn.execute("DELETE FROM jobs WHERE source_url LIKE 'https://careers.example.com/%'")
            for job in result["jobs"]:
                server.upsert_job(conn, job)
                imported += 1

    print(
        json.dumps(
            {
                "imported": imported,
                "summary": result["summary"],
                "sample": [
                    {
                        "company": job["company"],
                        "batch": job["batch"],
                        "city": job["city"],
                        "deadline": job["deadline"],
                    }
                    for job in result["jobs"][:10]
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
