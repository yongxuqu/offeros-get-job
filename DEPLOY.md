# Deployment

This guide describes a small single-server deployment for OfferOS. A 2 vCPU / 2 GB RAM Linux server is enough for the current SQLite-based MVP because AI, OCR, and speech-to-text workloads are delegated to external APIs.

## 1. Install Runtime Dependencies

Example for Alibaba Cloud Linux / CentOS-like systems:

```bash
sudo dnf makecache
sudo dnf install -y python3.11 nginx sqlite
sudo mkdir -p /opt/offeros
sudo chown -R "$USER":"$USER" /opt/offeros
```

Upload the project to `/opt/offeros`, then install Python dependencies:

```bash
cd /opt/offeros
python3.11 -m ensurepip --upgrade
python3.11 -m pip install -r requirements.txt
cp .env.example .env
nano .env
```

Set at least:

```text
APP_ENV=production
APP_SECRET=replace-with-a-long-random-secret
ADMIN_EMAILS=admin@example.com
SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM
AI_API_BASE/AI_API_KEY
```

Optional integrations:

```text
RESUME_PARSE_API_URL/RESUME_PARSE_API_KEY
STT_API_URL/STT_API_KEY/STT_MODEL
TENCENT_DOC_ID/TENCENT_JOB_SOURCES
AI_OCR_MODEL/OCR_TEXT_THRESHOLD/OCR_MAX_PAGES
```

Lock down environment-file permissions:

```bash
sudo chmod 600 /opt/offeros/.env
sudo chown -R nginx:nginx /opt/offeros
```

## 2. systemd Service

```bash
sudo cp deploy/offeros.service /etc/systemd/system/offeros.service
sudo systemctl daemon-reload
sudo systemctl enable --now offeros
sudo systemctl status offeros
```

The app listens on `127.0.0.1:8000` by default.

## 3. Nginx Reverse Proxy

Edit `deploy/nginx.conf` and set your server name or domain, then install it:

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/offeros.conf
sudo nginx -t
sudo systemctl reload nginx
```

Use HTTPS in production. Configure your DNS and certificate provider according to your hosting environment.

## 4. SQLite Backups

```bash
sudo chmod +x /opt/offeros/scripts/backup-sqlite.sh
sudo mkdir -p /opt/offeros/backups
sudo mkdir -p /opt/offeros/logs
```

Add a daily backup cron:

```text
20 3 * * * /usr/sbin/runuser -u nginx -- /bin/bash -lc "cd /opt/offeros && APP_DIR=/opt/offeros BACKUP_DIR=/opt/offeros/backups RETENTION_DAYS=14 ./scripts/backup-sqlite.sh >> logs/sqlite-backup.log 2>&1"
```

The backup script runs SQLite online backup, verifies `PRAGMA integrity_check`, and keeps 14 days by default. Restore steps are documented in [OPERATIONS.md](OPERATIONS.md).

## 5. Job Data Import

The open-source repository does not include production job data.

To import your own job snapshot:

```bash
cd /opt/offeros
python3.11 scripts/import-jobs.py path/to/jobs.json
```

Use `--replace-source SOURCE` only when you are sure deleting existing jobs from that source will not break user application records.

## 6. Optional Daily Tencent Docs Sync

Configure `.env` first:

```bash
TENCENT_DOC_ID=your-doc-id
TENCENT_JOB_SOURCES=[{"name":"Campus jobs","tab":"sheet_tab_id","kind":"sheet"}]
```

Then add a daily cron. This example syncs yesterday's rows every day at midnight server time:

```text
0 0 * * * cd /opt/offeros && mkdir -p logs && python3.11 scripts/sync-tencent-jobs.py --yesterday --min-deadline today --import >> logs/tencent-jobs-sync.log 2>&1
```

Set the server timezone explicitly if the schedule must follow a local timezone:

```bash
sudo timedatectl set-timezone Asia/Shanghai
```

The sync upserts matched jobs and does not clear old job records.

## 7. Smoke Tests

```bash
python3.11 -m py_compile server.py
curl -sS http://127.0.0.1:8000/api/system/status
sudo journalctl -u offeros -n 100 --no-pager
```

Never commit real `.env` files, SQLite databases, uploaded resumes, SMTP credentials, or API keys.

For regular operations, see [OPERATIONS.md](OPERATIONS.md).
