#!/usr/bin/env python3
import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def snapshot_job_key(job: dict) -> tuple:
    return (
        str(job.get("company") or "").strip(),
        server.job_source_update_date(job.get("description") or "", None) or str(job.get("sourceDate") or "").strip(),
        server.normalize_job_batch(job.get("batch") or ""),
        str(job.get("title") or "").strip(),
    )


def existing_job_key(row) -> tuple:
    return (
        row["company"],
        server.job_source_update_date(row["description"], row["updated_at"]),
        row["batch"],
        row["title"],
    )


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
    deleted = 0
    preserved = 0
    with server.connect_db() as conn:
        existing_by_url = {}
        existing_by_key = collections.defaultdict(list)
        if args.replace_source:
            existing_rows = conn.execute("SELECT * FROM jobs WHERE source = ? ORDER BY id", (args.replace_source,)).fetchall()
            for row in existing_rows:
                existing_by_url[(row["company"], server.clean_url(row["source_url"]))] = row["id"]
                existing_by_key[existing_job_key(row)].append(row["id"])

        used_ids = set()
        for job in jobs:
            job = dict(job)
            job.pop("id", None)
            if args.replace_source:
                company = str(job.get("company") or "").strip()
                source_url = server.clean_url(job.get("sourceUrl") or job.get("source_url") or "")
                matched_id = existing_by_url.get((company, source_url))
                if not matched_id or matched_id in used_ids:
                    for candidate_id in existing_by_key.get(snapshot_job_key(job), []):
                        if candidate_id not in used_ids:
                            matched_id = candidate_id
                            break
                if matched_id and matched_id not in used_ids:
                    job["id"] = matched_id
            job_id = server.upsert_job(conn, job)
            used_ids.add(job_id)
            imported += 1
        if args.replace_source:
            conn.execute("CREATE TEMP TABLE IF NOT EXISTS import_keep_job_ids (id INTEGER PRIMARY KEY)")
            conn.execute("DELETE FROM import_keep_job_ids")
            conn.executemany("INSERT OR IGNORE INTO import_keep_job_ids (id) VALUES (?)", [(job_id,) for job_id in used_ids])
            cursor = conn.execute(
                """
                DELETE FROM jobs
                WHERE source = ?
                  AND id NOT IN (SELECT id FROM import_keep_job_ids)
                  AND id NOT IN (SELECT DISTINCT job_id FROM applications)
                  AND id NOT IN (SELECT DISTINCT job_id FROM interviews WHERE job_id IS NOT NULL)
                """,
                (args.replace_source,),
            )
            deleted = max(0, cursor.rowcount or 0)
            preserved = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM jobs
                WHERE source = ?
                  AND id NOT IN (SELECT id FROM import_keep_job_ids)
                """,
                (args.replace_source,),
            ).fetchone()["count"]

    print(
        json.dumps(
            {
                "input": str(input_path),
                "snapshotCount": len(jobs),
                "imported": imported,
                "replaceSource": args.replace_source,
                "deletedStale": deleted,
                "preservedReferencedStale": preserved,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
