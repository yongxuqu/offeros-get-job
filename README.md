# OfferOS

OfferOS is an open-source job-search operating system for early-career candidates. It combines resume data, job discovery, application tracking, AI-assisted resume parsing, voice interview reports, an admin job console, and a browser extension for form filling.

This repository contains the open-source application code only. Production secrets, user data, uploaded resumes, SQLite databases, and real job-data snapshots are intentionally not included.

## Features

- Email-code authentication with SMTP.
- Structured resume profile, resume parsing workflow, and capability tags.
- Company-level job matching with city, company type, batch, and sorting filters.
- Application board for tracking job status.
- AI voice interview report workflow.
- Admin-only job management with manual job creation and CSV import.
- Optional Tencent Docs job sync adapter.
- Browser extension that can fetch structured resume fields from the main app and fill supported forms after user confirmation.

## Tech Stack

- Backend: Python standard library HTTP server + SQLite.
- Frontend: static HTML/CSS/JavaScript.
- Storage: local SQLite by default.
- Integrations: SMTP, OpenAI-compatible LLM APIs, optional resume parser/OCR API, optional speech-to-text API.

## Local Development

```bash
python3 -m pip install -r requirements.txt
cp .env.example .env
python3 server.py
```

Open:

```text
http://127.0.0.1:8000
```

The app reads `.env` from the project root. Verification codes are sent through the configured SMTP account and are not returned to the frontend.

## Environment

Key variables:

```bash
APP_ENV=development
PORT=8000
APP_SECRET=replace-with-a-long-random-secret
ADMIN_EMAILS=admin@example.com

SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_USER=your-name@163.com
SMTP_PASS=replace-with-authorization-code
MAIL_FROM="OfferOS <your-name@163.com>"

AI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=replace-with-llm-api-key
AI_MODEL=qwen-plus-latest
AI_RESUME_MODEL=qwen-plus-latest
AI_INTERVIEW_MODEL=qwen-plus-latest
AI_FAST_MODEL=qwen-turbo
AI_OCR_MODEL=qwen-vl-ocr
OCR_TEXT_THRESHOLD=120
OCR_MAX_PAGES=2

RESUME_PARSE_API_URL=
RESUME_PARSE_API_KEY=
STT_API_URL=
STT_API_KEY=
STT_MODEL=paraformer-v2
```

For job syncing from Tencent Docs, configure your own document and sheet tabs:

```bash
TENCENT_DOC_ID=
TENCENT_JOB_SOURCES=[]
```

Example:

```bash
TENCENT_JOB_SOURCES=[{"name":"Campus jobs","tab":"sheet_tab_id","kind":"sheet"},{"name":"Smart table","tab":"sheet_tab_id","view_id":"view_id","kind":"smart"}]
```

Only process data sources you own or have permission to use.

## Job Data

This repository does not include production job snapshots.

To import your own JSON snapshot:

```bash
python3 scripts/import-jobs.py path/to/jobs.json
```

To export the current jobs table:

```bash
python3 scripts/export-jobs.py exports/jobs.json --source tencent
```

To run a one-day Tencent Docs sync without writing to the database:

```bash
python3 scripts/sync-tencent-jobs.py --date 2026-08-19 --min-deadline today
```

To write synced jobs into SQLite:

```bash
python3 scripts/sync-tencent-jobs.py --date 2026-08-19 --min-deadline today --import
```

The sync path uses `company + sourceUrl` as the upsert key. Existing matching records are updated; unrelated older jobs are not deleted.

## Scanned Resume OCR

Text-based PDF/DOCX files are parsed locally first. If a PDF or image contains too little extractable text, OfferOS can render the first pages and call a Qwen OCR model through the same OpenAI-compatible endpoint:

```bash
AI_OCR_MODEL=qwen-vl-ocr
OCR_TEXT_THRESHOLD=120
OCR_MAX_PAGES=2
```

Install `PyMuPDF` from `requirements.txt` on the server so scanned PDFs can be rendered into images before OCR.

## Browser Extension

The extension lives in `extension/`.

1. Open the app and generate a plugin token from the plugin page.
2. Load `extension/` as an unpacked Chrome extension.
3. Enter the app URL and token in the extension popup.
4. Preview field mappings before filling supported forms.

The extension fills fields on the current page only. It does not submit forms automatically.

## Deployment

See [DEPLOY.md](DEPLOY.md) for an example single-server deployment with Nginx, systemd, SQLite backups, and a daily job-sync cron.

Before deploying, make sure real secrets are stored only in server environment variables or `.env`, and never committed.

## License

See [LICENSE](LICENSE).
