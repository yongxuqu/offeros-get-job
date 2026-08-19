# OfferOS Operations Guide

This document covers the common P0 production operations. The default server directory is `/opt/offeros`, and the systemd service is `offeros`.

## 1. Health Checks

```bash
systemctl status offeros --no-pager -l
journalctl -u offeros -n 100 --no-pager
curl -sS http://127.0.0.1/api/system/status
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/.env
```

Expected results:

- `offeros` is `active`
- `/.env` returns `404`
- `/api/system/status` returns JSON

## 2. Restart

```bash
systemctl restart offeros
systemctl is-active offeros
```

If Nginx changed:

```bash
nginx -t
systemctl reload nginx
```

## 3. SQLite Backup

Manual backup:

```bash
cd /opt/offeros
APP_DIR=/opt/offeros BACKUP_DIR=/opt/offeros/backups RETENTION_DAYS=14 ./scripts/backup-sqlite.sh
```

Daily 03:20 backup cron:

```cron
20 3 * * * /usr/sbin/runuser -u nginx -- /bin/bash -lc "cd /opt/offeros && APP_DIR=/opt/offeros BACKUP_DIR=/opt/offeros/backups RETENTION_DAYS=14 ./scripts/backup-sqlite.sh >> logs/sqlite-backup.log 2>&1"
```

Inspect backups:

```bash
ls -lh /opt/offeros/backups/offeros-*.db
sqlite3 /opt/offeros/backups/offeros-YYYYmmdd-HHMMSS.db "PRAGMA integrity_check;"
```

## 4. SQLite Restore

Stop the service and keep the current database first:

```bash
systemctl stop offeros
cp -p /opt/offeros/data/zhixu.db /opt/offeros/backups/before-restore-$(date +%Y%m%d-%H%M%S).db
cp -p /opt/offeros/backups/offeros-YYYYmmdd-HHMMSS.db /opt/offeros/data/zhixu.db
chown nginx:nginx /opt/offeros/data/zhixu.db
systemctl start offeros
systemctl is-active offeros
```

After restore:

```bash
sqlite3 /opt/offeros/data/zhixu.db "PRAGMA integrity_check;"
curl -sS http://127.0.0.1/api/system/status
```

## 5. Job Sync

The production cron is designed to sync the previous day's rows at 00:00.

```cron
0 0 * * * /usr/sbin/runuser -u nginx -- /bin/bash -lc "cd /opt/offeros && mkdir -p logs && /usr/bin/python3.11 scripts/sync-tencent-jobs.py --yesterday --min-deadline today --import >> logs/tencent-jobs-sync.log 2>&1"
```

Preview a sync without writing:

```bash
cd /opt/offeros
/usr/sbin/runuser -u nginx -- /usr/bin/python3.11 scripts/sync-tencent-jobs.py --yesterday --min-deadline today
tail -100 logs/tencent-jobs-sync.log
```

Only `--import` writes to the database.

## 6. Email Login Troubleshooting

Email verification depends on SMTP:

```bash
grep -E "SMTP_|MAIL_FROM" /opt/offeros/.env
journalctl -u offeros -n 100 --no-pager
```

Rate limits:

- 3 verification codes per email per minute
- 10 verification codes per email per hour
- Codes expire after 10 minutes
- 5 wrong attempts locks the code for 10 minutes

## 7. Deployment Notes

- Do not commit or publish `.env`
- Do not publish `/opt/offeros/data/zhixu.db`
- Do not publish `/opt/offeros/backups`
- Remove temporary SSH public keys from `~/.ssh/authorized_keys` after deployment
- Long-running API work behind Netlify should use background jobs and polling
