# OfferOS

OfferOS is an open-source job search workspace for students and early-career candidates.

It brings resume structuring, job matching, application tracking, interview practice, and form-filling assistance into one lightweight system. The project is designed to run on a low-cost VPS with SQLite and external AI APIs.

## Features

- Email verification login
- Structured resume profile
- PDF / DOCX resume upload and parsing
- AI-generated ability profile
- Job matching by skills, city, category, and company type
- Application tracking board
- AI interview practice with report generation
- Admin dashboard for job posting management
- CSV job import with duplicate detection
- Chrome extension prototype for application form filling
- Netlify-friendly static frontend deployment

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Python standard library HTTP server
- Database: SQLite
- Deployment: Nginx + systemd
- AI: OpenAI-compatible chat completion APIs
- Resume extraction: pypdf / pdfplumber fallback
- Speech-to-text: pluggable external STT API

## Project Structure

```text
public/              Static frontend
server.py            Python backend API
extension/           Chrome extension prototype
deploy/              Nginx and systemd templates
scripts/             SQLite backup script
requirements.txt     Optional PDF parsing dependencies
netlify.toml         Static frontend deployment config
```

## Quick Start

```bash
python3.11 -m ensurepip --upgrade
python3.11 -m pip install -r requirements.txt
cp .env.example .env
python3.11 server.py
```

Open:

```text
http://127.0.0.1:8000
```

## Environment Variables

Create a `.env` file from `.env.example`.

```bash
APP_ENV=development
APP_SECRET=change-me
ADMIN_EMAILS=admin@example.com

SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=your-email@example.com
SMTP_PASS=your-smtp-app-password
MAIL_FROM="OfferOS <your-email@example.com>"

AI_API_BASE=https://your-ai-provider.example.com/v1
AI_API_KEY=your-api-key
AI_MODEL=qwen-plus-latest
AI_RESUME_MODEL=qwen-plus-latest
AI_INTERVIEW_MODEL=qwen-plus-latest
AI_FAST_MODEL=qwen-turbo
AI_OCR_MODEL=qwen-vl-ocr

STT_API_URL=
STT_API_KEY=
STT_MODEL=paraformer-v2
```

Never commit `.env` or SQLite database files.

## Deployment

The recommended production setup is:

```text
Netlify / static hosting -> frontend
Nginx on VPS              -> reverse proxy
Python service            -> backend API
SQLite                    -> application data
External AI APIs          -> resume parsing and interview reports
```

For a single-server deployment, see `DEPLOY.md`.

If you deploy the frontend separately, update `netlify.toml` and replace the example backend URL with your own API origin.

## Admin Access

Only emails listed in `ADMIN_EMAILS` can access the admin dashboard.

Admin users can:

- Create and update job postings
- Import jobs by CSV
- Delete job postings
- View aggregate usage statistics
- Check system integration status

Normal users cannot access admin APIs or system configuration details.

## Chrome Extension

The extension prototype can sync structured resume fields from the main site with a connection token.

It is designed to:

- Preview field mappings before filling
- Fill fields only after user confirmation
- Avoid automatic submission
- Require extra confirmation for sensitive fields

## Data and Privacy

OfferOS stores only the data required for the product workflow:

- User account email
- Structured resume profile
- Job postings
- Application records
- Interview reports

Audio and video files are not stored by default.

## Open Source Scope

This repository contains only source code, templates, and documentation.

It does not include:

- Production `.env`
- SMTP credentials
- AI API keys
- SQLite database files
- User data
- Uploaded resumes

## License

MIT
