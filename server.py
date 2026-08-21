#!/usr/bin/env python3
import datetime
import email.message
import base64
import csv
import hashlib
import hmac
import html
import io
import ipaddress
import json
import mimetypes
import os
import re
import secrets
import shutil
import smtplib
import sqlite3
import struct
import subprocess
import threading
import time
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib
import xml.etree.ElementTree as ET
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(BASE_DIR / ".env")

DB_PATH = Path(os.getenv("DB_PATH", str(DATA_DIR / "zhixu.db")))
if not DB_PATH.is_absolute():
    DB_PATH = BASE_DIR / DB_PATH

APP_ENV = os.getenv("APP_ENV", "development")
APP_SECRET = os.getenv("APP_SECRET", "dev-secret-change-before-production")
SESSION_TTL = 60 * 60 * 24 * 30
CODE_TTL = 60 * 10
CODE_SEND_WINDOW = 60
CODE_SEND_WINDOW_MAX = 3
CODE_SEND_HOUR_MAX = 10
CODE_MAX_ATTEMPTS = 5
CODE_LOCK_TTL = 60 * 10

AI_API_BASE = os.getenv("AI_API_BASE", "").rstrip("/")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_DEFAULT_MODEL = os.getenv("AI_MODEL", "qwen-plus-latest")
AI_RESUME_MODEL = os.getenv("AI_RESUME_MODEL", AI_DEFAULT_MODEL)
AI_INTERVIEW_MODEL = os.getenv("AI_INTERVIEW_MODEL", AI_DEFAULT_MODEL)
AI_FAST_MODEL = os.getenv("AI_FAST_MODEL", "qwen-turbo")
AI_OCR_MODEL = os.getenv("AI_OCR_MODEL", "qwen-vl-ocr")
RESUME_PARSE_API_URL = os.getenv("RESUME_PARSE_API_URL", "")
RESUME_PARSE_API_KEY = os.getenv("RESUME_PARSE_API_KEY", "")
RESUME_PARSE_SEND_FILE = os.getenv("RESUME_PARSE_SEND_FILE", "false").strip().lower() in {"1", "true", "yes", "on"}
STT_API_URL = os.getenv("STT_API_URL", "")
STT_API_KEY = os.getenv("STT_API_KEY", "")
STT_MODEL = os.getenv("STT_MODEL", "paraformer-v2")
ADMIN_EMAILS = {item.strip().lower() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()}
MAX_RESUME_FILE_SIZE = 8 * 1024 * 1024
MAX_JSON_BODY_SIZE = 16 * 1024 * 1024
OCR_TEXT_THRESHOLD = max(20, int(os.getenv("OCR_TEXT_THRESHOLD", "120") or 120))
OCR_MAX_PAGES = max(1, min(4, int(os.getenv("OCR_MAX_PAGES", "3") or 3)))
AI_OCR_TIMEOUT = max(10, min(120, int(os.getenv("AI_OCR_TIMEOUT", "45") or 45)))
AI_RESUME_PARSE_TIMEOUT = max(10, min(120, int(os.getenv("AI_RESUME_PARSE_TIMEOUT", "35") or 35)))
RESUME_PARSE_SOFT_TIMEOUT = max(20, min(180, int(os.getenv("RESUME_PARSE_SOFT_TIMEOUT", "70") or 70)))
RESUME_PARSE_JOB_TTL = max(300, min(7200, int(os.getenv("RESUME_PARSE_JOB_TTL", "1800") or 1800)))
TENCENT_DOC_ID = os.getenv("TENCENT_DOC_ID", "")
TENCENT_LINK_OVERRIDES_PATH = os.getenv("TENCENT_LINK_OVERRIDES_PATH", "seed/tencent_job_link_overrides.json")
TENCENT_JOB_SOURCES = [source for source in [
    {
        "name": os.getenv("TENCENT_SOURCE_1_NAME", "Tencent sheet source 1"),
        "tab": os.getenv("TENCENT_SOURCE_1_TAB", ""),
        "view_id": os.getenv("TENCENT_SOURCE_1_VIEW_ID", ""),
        "kind": "smart",
    },
    {
        "name": os.getenv("TENCENT_SOURCE_2_NAME", "Tencent sheet source 2"),
        "tab": os.getenv("TENCENT_SOURCE_2_TAB", ""),
        "kind": "sheet",
    },
] if source.get("tab")]
JOB_BATCHES = ("27届秋招", "实习", "26届春招")
DEFAULT_SYNC_START_DATE = "2026-07-01"
DEFAULT_SYNC_END_DATE = "2026-08-18"
DEFAULT_MIN_DEADLINE_DATE = "2026-08-18"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

RESUME_PARSE_JOBS: dict[str, dict] = {}
RESUME_PARSE_JOBS_LOCK = threading.Lock()

KEYWORD_MAP = {
    "Python": ["python", "爬虫", "flask", "fastapi", "django"],
    "Java": ["java", "spring", "springboot", "mybatis"],
    "SQL": ["sql", "mysql", "postgresql", "数据库", "hive"],
    "数据分析": ["数据分析", "数据", "指标", "ab test", "a/b", "tableau", "powerbi"],
    "产品设计": ["产品", "原型", "prd", "需求", "axure", "figma"],
    "用户研究": ["用户研究", "访谈", "问卷", "可用性", "用户画像"],
    "后端开发": ["后端", "api", "接口", "服务端", "分布式"],
    "前端开发": ["前端", "react", "vue", "typescript", "javascript"],
    "机器学习": ["机器学习", "深度学习", "模型", "pytorch", "tensorflow"],
    "运营增长": ["运营", "增长", "社群", "活动", "留存", "转化"],
    "市场调研": ["市场", "调研", "品牌", "营销", "渠道"],
    "行业研究": ["行业研究", "竞品", "咨询", "商业分析", "访谈"],
    "财务分析": ["财务", "估值", "建模", "报表", "金融"],
    "供应链": ["供应链", "库存", "物流", "采购", "需求预测"],
    "表达汇报": ["汇报", "演讲", "展示", "路演", "答辩"],
    "沟通协作": ["协作", "沟通", "推进", "跨部门", "组织"],
    "Linux": ["linux", "shell", "服务器", "运维"],
    "网络安全": ["安全", "漏洞", "渗透", "ctf", "应急响应"],
}

STATUS_LABELS = {
    "preparing": "准备投递",
    "applied": "已投递",
    "test": "测评/笔试",
    "interview": "面试",
    "offer": "Offer",
    "rejected": "未通过",
    "abandoned": "已弃投",
}


def now() -> int:
    return int(time.time())


def coerce_timestamp(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        text = str(value).split(".")[0]
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                return int(time.mktime(time.strptime(text, fmt)))
            except ValueError:
                continue
    return None


def parse_local_datetime(value) -> int | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        timestamp = int(value)
        return timestamp if timestamp > 0 else None
    text = str(value).strip()
    if not text:
        return None
    if re.fullmatch(r"\d{10,13}", text):
        timestamp = int(text)
        if timestamp > 10_000_000_000:
            timestamp //= 1000
        return timestamp
    normalized = text.replace("T", " ").replace("/", "-")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return int(time.mktime(time.strptime(normalized[: len(time.strftime(fmt, time.localtime(0)))], fmt)))
        except ValueError:
            continue
    return coerce_timestamp(text)


def utc_string(ts=None) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(coerce_timestamp(ts) or now()))


def display_job_title(title: str) -> str:
    text = clean_text(title)
    return "" if text == "招聘岗位合集" else text


def is_recent_timestamp(value, cutoff: int) -> bool:
    parsed = coerce_timestamp(value)
    return bool(parsed and parsed >= cutoff)


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def migrate_jobs_unique_constraint(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jobs'").fetchone()
    table_sql = row["sql"] if row else ""
    if "source_url TEXT NOT NULL UNIQUE" not in table_sql:
        return

    conn.commit()
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.executescript(
        """
        CREATE TABLE jobs_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company TEXT NOT NULL,
            title TEXT NOT NULL,
            city TEXT NOT NULL,
            category TEXT NOT NULL,
            company_type TEXT NOT NULL DEFAULT '未分类',
            batch TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'manual',
            deadline TEXT NOT NULL,
            source_url TEXT NOT NULL,
            description TEXT NOT NULL,
            requirements TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            owner_user_id INTEGER,
            review_status TEXT NOT NULL DEFAULT 'approved',
            review_note TEXT,
            UNIQUE(company, source_url)
        );

        INSERT OR IGNORE INTO jobs_new
        (id, company, title, city, category, company_type, batch, source, deadline, source_url, description, requirements, updated_at, owner_user_id, review_status, review_note)
        SELECT id, company, title, city, category, company_type, batch, source, deadline, source_url, description, requirements, updated_at,
               owner_user_id, COALESCE(NULLIF(review_status, ''), 'approved'), review_note
        FROM jobs
        ORDER BY id;

        DROP TABLE jobs;
        ALTER TABLE jobs_new RENAME TO jobs;
        """
    )
    conn.execute("PRAGMA foreign_keys=ON")


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                last_login_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS email_verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                consumed_at INTEGER,
                created_at INTEGER NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                locked_until INTEGER
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS plugin_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                name TEXT,
                created_at INTEGER NOT NULL,
                revoked_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS profiles (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS resumes (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                raw_text TEXT,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company TEXT NOT NULL,
                title TEXT NOT NULL,
                city TEXT NOT NULL,
                category TEXT NOT NULL,
                company_type TEXT NOT NULL DEFAULT '未分类',
                batch TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'manual',
                deadline TEXT NOT NULL,
                source_url TEXT NOT NULL,
                description TEXT NOT NULL,
                requirements TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                review_status TEXT NOT NULL DEFAULT 'approved',
                review_note TEXT,
                UNIQUE(company, source_url)
            );

            CREATE TABLE IF NOT EXISTS job_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'pending',
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                reviewed_at INTEGER,
                reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                review_note TEXT
            );

            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                notes TEXT,
                custom_title TEXT NOT NULL DEFAULT '',
                assessment_deadline_at INTEGER,
                assessment_reminder_sent_at INTEGER,
                interview_deadline_at INTEGER,
                interview_reminder_sent_at INTEGER,
                assessment_completed_at INTEGER,
                interview_completed_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, job_id)
            );

            CREATE TABLE IF NOT EXISTS interviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
                report TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            """
        )
        verification_columns = {row["name"] for row in conn.execute("PRAGMA table_info(email_verifications)").fetchall()}
        if "attempts" not in verification_columns:
            conn.execute("ALTER TABLE email_verifications ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0")
        if "locked_until" not in verification_columns:
            conn.execute("ALTER TABLE email_verifications ADD COLUMN locked_until INTEGER")
        job_columns = {row["name"] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
        if "company_type" not in job_columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN company_type TEXT NOT NULL DEFAULT '未分类'")
        if "batch" not in job_columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN batch TEXT NOT NULL DEFAULT ''")
        if "source" not in job_columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'")
        if "owner_user_id" not in job_columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN owner_user_id INTEGER")
        if "review_status" not in job_columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved'")
        if "review_note" not in job_columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN review_note TEXT")
        application_columns = {row["name"] for row in conn.execute("PRAGMA table_info(applications)").fetchall()}
        if "custom_title" not in application_columns:
            conn.execute("ALTER TABLE applications ADD COLUMN custom_title TEXT NOT NULL DEFAULT ''")
        if "assessment_deadline_at" not in application_columns:
            conn.execute("ALTER TABLE applications ADD COLUMN assessment_deadline_at INTEGER")
        if "assessment_reminder_sent_at" not in application_columns:
            conn.execute("ALTER TABLE applications ADD COLUMN assessment_reminder_sent_at INTEGER")
        if "interview_deadline_at" not in application_columns:
            conn.execute("ALTER TABLE applications ADD COLUMN interview_deadline_at INTEGER")
        if "interview_reminder_sent_at" not in application_columns:
            conn.execute("ALTER TABLE applications ADD COLUMN interview_reminder_sent_at INTEGER")
        if "assessment_completed_at" not in application_columns:
            conn.execute("ALTER TABLE applications ADD COLUMN assessment_completed_at INTEGER")
        if "interview_completed_at" not in application_columns:
            conn.execute("ALTER TABLE applications ADD COLUMN interview_completed_at INTEGER")
        conn.execute("UPDATE applications SET status = 'preparing' WHERE status = 'saved'")
        migrate_jobs_unique_constraint(conn)
        conn.execute("DELETE FROM jobs WHERE source_url LIKE 'https://careers.example.com/%'")


def hash_code(email: str, code: str) -> str:
    payload = f"{email.lower()}:{code}".encode("utf-8")
    return hmac.new(APP_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def hash_token(token: str) -> str:
    return hmac.new(APP_SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def send_email_message(email_addr: str, subject: str, body: str) -> bool:
    host = os.getenv("SMTP_HOST", "")
    if not host:
        return False

    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    sender = os.getenv("MAIL_FROM", user or f"no-reply@{host}")

    msg = email.message.EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = email_addr
    msg.set_content(body)

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=10) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    return True


def send_email_code(email_addr: str, code: str) -> bool:
    return send_email_message(
        email_addr,
        "OfferOS 登录验证码",
        f"你的登录验证码是：{code}\n\n验证码 10 分钟内有效。",
    )


def send_application_stage_reminder(email_addr: str, label: str, stage: str, deadline_at: int) -> bool:
    deadline_text = utc_string(deadline_at)
    action = "面试" if stage == "面试" else "测评"
    return send_email_message(
        email_addr,
        f"OfferOS {stage}提醒",
        f"距离{label}{stage}的时间不足3小时，记得去{action}。\n\n时间：{deadline_text}\n\nOfferOS",
    )


def application_reminder_label(row: sqlite3.Row) -> str:
    custom_title = clean_text(row["custom_title"] if "custom_title" in row.keys() else "")
    public_title = display_job_title(row["title"])
    title = custom_title or public_title
    return f"{row['company']} · {title}" if title else row["company"]


def check_application_reminders() -> None:
    timestamp = now()
    configs = [
        ("test", "assessment_deadline_at", "assessment_reminder_sent_at", "测评/笔试"),
        ("interview", "interview_deadline_at", "interview_reminder_sent_at", "面试"),
    ]
    with connect_db() as conn:
        for status, deadline_column, reminder_column, stage in configs:
            rows = conn.execute(
                f"""
                SELECT applications.id, applications.custom_title, applications.{deadline_column} AS deadline_at,
                       users.email, jobs.company, jobs.title
                FROM applications
                JOIN users ON users.id = applications.user_id
                JOIN jobs ON jobs.id = applications.job_id
                WHERE applications.status = ?
                  AND applications.{deadline_column} IS NOT NULL
                  AND applications.{deadline_column} > ?
                  AND applications.{deadline_column} <= ?
                  AND (applications.{reminder_column} IS NULL OR applications.{reminder_column} = 0)
                LIMIT 50
                """,
                (status, timestamp, timestamp + 3 * 60 * 60),
            ).fetchall()
            for row in rows:
                try:
                    sent = send_application_stage_reminder(
                        row["email"],
                        application_reminder_label(row),
                        stage,
                        int(row["deadline_at"]),
                    )
                except Exception as exc:
                    print(f"[{utc_string()}] application_reminder_failed application={row['id']} stage={stage} error={type(exc).__name__}")
                    sent = False
                if sent:
                    conn.execute(
                        f"UPDATE applications SET {reminder_column} = ?, updated_at = ? WHERE id = ?",
                        (timestamp, timestamp, row["id"]),
                    )


def run_application_reminder_loop() -> None:
    while True:
        try:
            check_application_reminders()
        except Exception as exc:
            print(f"[{utc_string()}] application_reminder_loop_error error={type(exc).__name__}")
        time.sleep(60)


def start_background_tasks() -> None:
    threading.Thread(target=run_application_reminder_loop, name="application-reminders", daemon=True).start()


def job_source_update_date(description: str, fallback_ts=None) -> str:
    match = re.search(r"(?:^|\n)更新[：:]\s*(\d{4}-\d{2}-\d{2})", str(description or ""))
    if match:
        return match.group(1)
    return ""


def row_to_job(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "company": row["company"],
        "title": row["title"],
        "city": row["city"],
        "category": row["category"],
        "companyType": row["company_type"],
        "batch": row["batch"],
        "source": row["source"],
        "deadline": row["deadline"],
        "sourceUrl": row["source_url"],
        "description": row["description"],
        "requirements": json.loads(row["requirements"]),
        "sourceDate": job_source_update_date(row["description"], row["updated_at"]),
        "updatedAt": utc_string(row["updated_at"]),
        "reviewStatus": row["review_status"] if "review_status" in row.keys() else "approved",
        "reviewNote": row["review_note"] if "review_note" in row.keys() else "",
    }


def first_match(pattern: str, text: str, default: str = "") -> str:
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else default


def empty_resume() -> dict:
    return {
        "profile": {
            "photoName": "",
            "photoData": "",
            "name": "",
            "gender": "",
            "countryRegion": "中国",
            "idType": "",
            "idNumber": "",
            "phoneType": "中国大陆",
            "phone": "",
            "email": "",
            "currentLocation": "",
            "wechat": "",
            "qq": "",
            "emergencyContact": "",
            "emergencyPhone": "",
        },
        "education": [
            {
                "degree": "",
                "schoolName": "",
                "studyLocation": "",
                "startDate": "",
                "endDate": "",
                "college": "",
                "major": "",
                "rank": "",
                "gpa": "",
                "gpaBase": "",
            }
        ],
        "internships": [],
        "projects": [],
        "awards": [],
        "portfolios": [],
        "selfDescription": "",
        "verifier": {"name": "", "identity": "", "phone": ""},
        "abilityTags": [],
        "summary": "",
        "gaps": [],
        "sourceFile": "",
    }


def infer_profile(raw_text: str, existing=None) -> dict:
    existing = existing or {}
    email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", raw_text)
    phone_match = re.search(r"(?:\+?86[-\s]?)?1[3-9]\d{9}", raw_text)
    qq_match = re.search(r"(?:QQ|qq|Qq)[：:\s]*([1-9]\d{4,11})", raw_text)
    wechat = first_match(r"(?:微信|wechat|WeChat)[：:\s]*([A-Za-z0-9_-]{5,30})", raw_text)
    current_location = first_match(r"(?:所在地|当前所处地|现居|城市)[：:\s]*([\u4e00-\u9fa5A-Za-z]{2,20})", raw_text)
    name = first_match(r"(?:姓名)[：:\s]*([\u4e00-\u9fa5A-Za-z·]{2,30})", raw_text)
    degree = "博士" if "博士" in raw_text else "硕士" if "硕士" in raw_text or "研究生" in raw_text else "本科" if "本科" in raw_text else ""
    return {
        "photoName": existing.get("photoName", ""),
        "photoData": existing.get("photoData", ""),
        "name": existing.get("name", name),
        "gender": existing.get("gender", "男" if "男" in raw_text else "女" if "女" in raw_text else ""),
        "countryRegion": existing.get("countryRegion", "中国"),
        "idType": existing.get("idType", ""),
        "idNumber": existing.get("idNumber", ""),
        "phoneType": existing.get("phoneType", "中国大陆"),
        "email": existing.get("email", email_match.group(0) if email_match else ""),
        "phone": existing.get("phone", phone_match.group(0) if phone_match else ""),
        "currentLocation": existing.get("currentLocation", current_location),
        "wechat": existing.get("wechat", wechat),
        "qq": existing.get("qq", qq_match.group(1) if qq_match else ""),
        "emergencyContact": existing.get("emergencyContact", ""),
        "emergencyPhone": existing.get("emergencyPhone", ""),
    }


def infer_education(raw_text: str) -> list:
    degree = "博士" if "博士" in raw_text else "硕士" if "硕士" in raw_text or "研究生" in raw_text else "本科" if "本科" in raw_text else ""
    school = first_match(r"([\u4e00-\u9fa5A-Za-z·]{2,30}(?:大学|学院|学校))", raw_text)
    major = first_match(r"(?:专业)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9（）()]{2,30})", raw_text)
    gpa = first_match(r"(?:GPA|gpa)[：:\s]*([0-9.]+)", raw_text)
    dates = re.findall(r"(20\d{2}[-./年]\d{1,2}(?:[-./月]\d{1,2}日?)?)", raw_text)
    return [
        {
            "degree": degree,
            "schoolName": school,
            "studyLocation": "",
            "startDate": dates[0] if len(dates) >= 1 else "",
            "endDate": dates[1] if len(dates) >= 2 else "",
            "college": first_match(r"(?:院系|学院)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9（）()]{2,30})", raw_text),
            "major": major,
            "rank": first_match(r"(?:排名)[：:\s]*(前?\s*\d+%|[0-9/]+)", raw_text),
            "gpa": gpa,
            "gpaBase": first_match(r"(?:GPA[- ]?Base|满绩|满分)[：:\s]*([0-9.]+)", raw_text),
        }
    ]


def section_excerpt(raw_text: str, names: list, limit: int = 260) -> str:
    for name in names:
        idx = raw_text.find(name)
        if idx >= 0:
            return raw_text[idx : idx + limit].strip()
    return ""


def infer_projects(raw_text: str) -> list:
    excerpt = section_excerpt(raw_text, ["项目经历", "项目经验", "项目"])
    if not excerpt:
        return []
    title = first_match(r"(?:项目经历|项目经验|项目)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9《》（）()_-]{2,40})", excerpt)
    return [
        {
            "name": title or "项目经历",
            "role": first_match(r"(?:角色|担任)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9（）()]{2,30})", excerpt),
            "startDate": "",
            "endDate": "",
            "description": excerpt,
            "link": first_match(r"(https?://[^\s]+)", excerpt),
        }
    ]


def infer_internships(raw_text: str) -> list:
    excerpt = section_excerpt(raw_text, ["实习经历", "工作经历", "实习"])
    if not excerpt:
        return []
    company = first_match(r"(?:实习经历|工作经历|实习)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9（）()_-]{2,40})", excerpt)
    return [
        {
            "company": company,
            "position": first_match(r"(?:职位|岗位)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9（）()]{2,30})", excerpt),
            "startDate": "",
            "endDate": "",
            "description": excerpt,
        }
    ]


def analyze_resume_text(raw_text: str) -> dict:
    text = raw_text.lower()
    tags = []
    for name, keywords in KEYWORD_MAP.items():
        hits = [kw for kw in keywords if kw.lower() in text]
        if hits:
            confidence = min(0.96, 0.62 + 0.08 * len(hits))
            tags.append({"name": name, "confidence": confidence, "evidence": "、".join(hits[:3])})

    if not tags:
        tags = [
            {"name": "沟通协作", "confidence": 0.58, "evidence": "默认能力，需要用户确认"},
            {"name": "表达汇报", "confidence": 0.52, "evidence": "默认能力，需要用户确认"},
        ]

    tags.sort(key=lambda item: item["confidence"], reverse=True)
    top_names = [item["name"] for item in tags[:5]]
    resume = empty_resume()
    resume["profile"] = infer_profile(raw_text)
    resume["education"] = infer_education(raw_text)
    resume["projects"] = infer_projects(raw_text)
    resume["internships"] = infer_internships(raw_text)
    resume["selfDescription"] = section_excerpt(raw_text, ["自我描述", "自我评价", "个人总结"], 300)
    resume["abilityTags"] = tags[:12]
    resume["summary"] = "当前简历最明显的能力集中在：" + "、".join(top_names) + "。"
    resume["gaps"] = ["补充量化结果", "明确个人角色", "把项目动作和岗位关键词对齐"]
    return normalize_resume_ai_output(resume)


def parse_json_object(text: str) -> dict:
    clean = (text or "").strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```(?:json)?\s*", "", clean)
        clean = re.sub(r"\s*```$", "", clean)
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        start = clean.find("{")
        end = clean.rfind("}")
        if start >= 0 and end > start:
            return json.loads(clean[start : end + 1])
        raise


def extract_docx_text(file_bytes: bytes) -> str:
    parts = []
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        names = [
            name
            for name in archive.namelist()
            if name.startswith("word/") and name.endswith(".xml") and ("document" in name or "header" in name or "footer" in name)
        ]
        for name in names:
            root = ET.fromstring(archive.read(name))
            for node in root.iter():
                if node.tag.endswith("}t") and node.text:
                    parts.append(node.text)
                elif node.tag.endswith("}p"):
                    parts.append("\n")
    return " ".join(parts).replace(" \n ", "\n").strip()


def extract_pdf_text_basic(file_bytes: bytes) -> str:
    raw = file_bytes.decode("latin-1", errors="ignore")
    chunks = []
    for match in re.finditer(r"\((.*?)\)\s*Tj", raw, re.S):
        text = match.group(1)
        text = text.replace(r"\(", "(").replace(r"\)", ")").replace(r"\n", "\n")
        chunks.append(text)
    for match in re.finditer(r"<([0-9A-Fa-f]{4,})>\s*Tj", raw):
        try:
            chunks.append(bytes.fromhex(match.group(1)).decode("utf-16-be", errors="ignore"))
        except ValueError:
            continue
    return "\n".join(chunks).strip()


def clean_extracted_text(text: str) -> str:
    text = (text or "").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def resume_text_has_signal(text: str) -> bool:
    clean = clean_extracted_text(text)
    if len(clean) < 20:
        return False
    if re.search(r"1[3-9]\d{9}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", clean):
        return True
    tokens = re.findall(r"[\u4e00-\u9fffA-Za-z0-9]{2,}", clean)
    keyword_hits = sum(1 for word in ("教育", "学校", "大学", "专业", "项目", "实习", "经历", "技能", "获奖", "证书") if word in clean)
    return len(tokens) >= 18 and keyword_hits >= 2


def resume_file_log_id(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()[:12] or ".file"
    digest = hashlib.sha256(file_name.encode("utf-8", errors="ignore")).hexdigest()[:10]
    return f"{digest}{suffix}"


def extract_pdf_text_with_libraries(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(file_bytes))
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:20])
        if clean_extracted_text(text):
            return clean_extracted_text(text)
    except Exception:
        pass

    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages[:20])
        return clean_extracted_text(text)
    except Exception:
        return ""


def render_pdf_pages_for_ocr(file_bytes: bytes) -> list[dict]:
    try:
        import fitz
    except Exception:
        return []

    images = []
    try:
        with fitz.open(stream=file_bytes, filetype="pdf") as document:
            page_count = min(len(document), OCR_MAX_PAGES)
            for page_index in range(page_count):
                page = document.load_page(page_index)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                images.append({"mimeType": "image/png", "bytes": pixmap.tobytes("png")})
    except Exception:
        return []
    return images


def resume_images_for_ocr(file_name: str, mime_type: str, file_bytes: bytes) -> list[dict]:
    lower = file_name.lower()
    if lower.endswith(".pdf") or mime_type == "application/pdf":
        return render_pdf_pages_for_ocr(file_bytes)
    if lower.endswith((".png", ".jpg", ".jpeg")) or mime_type in {"image/png", "image/jpeg"}:
        safe_mime = "image/png" if lower.endswith(".png") or mime_type == "image/png" else "image/jpeg"
        return [{"mimeType": safe_mime, "bytes": file_bytes}]
    return []


def extract_resume_text_with_ocr(file_name: str, mime_type: str, file_bytes: bytes) -> str:
    if not AI_API_BASE or not AI_API_KEY or not AI_OCR_MODEL:
        return ""

    images = resume_images_for_ocr(file_name, mime_type, file_bytes)
    if not images:
        return ""

    content = []
    for image in images:
        encoded = base64.b64encode(image["bytes"]).decode("ascii")
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{image['mimeType']};base64,{encoded}"},
                "min_pixels": 3072,
                "max_pixels": 8388608,
            }
        )
    content.append(
        {
            "type": "text",
            "text": "请按页面顺序逐字提取这份中文/英文简历里的全部可见文字。保留姓名、联系方式、教育、实习、项目、获奖、技能和自我描述等信息。只输出纯文本，不要解释，不要 Markdown。",
        }
    )

    body = {
        "model": AI_OCR_MODEL,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.01,
        "max_tokens": 4096,
    }
    try:
        req = urllib.request.Request(
            f"{AI_API_BASE}/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=AI_OCR_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return clean_extracted_text(payload["choices"][0]["message"]["content"])
    except Exception as exc:
        print(f"[{utc_string()}] qwen_ocr_failed file_id={resume_file_log_id(file_name)} error={type(exc).__name__}")
        return ""


def extract_legacy_doc_text(file_name: str, file_bytes: bytes) -> str:
    if not shutil.which("textutil"):
        return ""
    suffix = Path(file_name).suffix or ".doc"
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / f"resume{suffix}"
            output = Path(tmp_dir) / "resume.txt"
            source.write_bytes(file_bytes)
            subprocess.run(
                ["textutil", "-convert", "txt", "-output", str(output), str(source)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
            return clean_extracted_text(output.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return ""


def extract_resume_text(file_name: str, mime_type: str, file_bytes: bytes) -> str:
    lower = file_name.lower()
    try:
        if lower.endswith((".txt", ".md")) or mime_type.startswith("text/"):
            return clean_extracted_text(file_bytes.decode("utf-8", errors="replace"))
        if lower.endswith(".docx"):
            return clean_extracted_text(extract_docx_text(file_bytes))
        if lower.endswith(".doc"):
            return extract_legacy_doc_text(file_name, file_bytes)
        if lower.endswith(".pdf") or mime_type == "application/pdf":
            return extract_pdf_text_with_libraries(file_bytes) or clean_extracted_text(extract_pdf_text_basic(file_bytes))
    except Exception as exc:
        print(f"[{utc_string()}] resume_text_extract_failed file_id={resume_file_log_id(file_name)} error={type(exc).__name__}")
    return ""


def extract_resume_text_for_parsing(file_name: str, mime_type: str, file_bytes: bytes) -> tuple[str, bool]:
    raw_text = extract_resume_text(file_name, mime_type, file_bytes)
    if len(raw_text) >= OCR_TEXT_THRESHOLD and resume_text_has_signal(raw_text):
        return raw_text, False

    ocr_text = extract_resume_text_with_ocr(file_name, mime_type, file_bytes)
    if resume_text_has_signal(ocr_text) and len(ocr_text) > len(raw_text):
        return ocr_text, True
    return raw_text, False


def has_meaningful_value(value) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(has_meaningful_value(item) for item in value)
    if isinstance(value, dict):
        return any(has_meaningful_value(item) for item in value.values())
    return value is not None


def has_filled_items(items: list) -> bool:
    return any(has_meaningful_value(item) for item in items or [])


def resume_has_content(resume: dict) -> bool:
    profile = resume.get("profile") or {}
    profile_keys = [
        "photoName",
        "name",
        "gender",
        "idType",
        "idNumber",
        "phone",
        "email",
        "currentLocation",
        "wechat",
        "qq",
        "emergencyContact",
        "emergencyPhone",
    ]
    if any(has_meaningful_value(profile.get(key)) for key in profile_keys):
        return True
    for key in ("education", "internships", "projects", "awards", "portfolios", "abilityTags", "gaps"):
        if has_filled_items(resume.get(key) or []):
            return True
    return any(has_meaningful_value(resume.get(key)) for key in ("selfDescription", "summary"))


def normalize_confidence(value, index: int) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    if number > 1:
        number = number / 100
    if number <= 0:
        number = max(0.58, 0.82 - index * 0.04)
    return round(max(0.01, min(0.99, number)), 2)


def normalize_ability_tags(tags) -> list[dict]:
    normalized = []
    seen = set()
    for item in tags or []:
        if isinstance(item, str):
            name = item.strip()
            evidence = ""
            confidence = None
        elif isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            evidence = str(item.get("evidence") or "").strip()
            confidence = item.get("confidence")
        else:
            continue
        if not name or name in seen:
            continue
        seen.add(name)
        normalized.append(
            {
                "name": name,
                "confidence": normalize_confidence(confidence, len(normalized)),
                "evidence": evidence,
            }
        )
    return normalized[:12]


def normalize_resume_ai_output(resume: dict) -> dict:
    if not isinstance(resume, dict):
        resume = empty_resume()
    resume["abilityTags"] = normalize_ability_tags(resume.get("abilityTags") or [])
    return resume


def choose_parsed_resume(parsed: dict, fallback: dict) -> dict:
    normalized = normalize_resume_ai_output(parsed)
    if resume_has_content(normalized):
        return normalized
    fallback = normalize_resume_ai_output(fallback)
    if resume_has_content(fallback):
        return fallback
    return normalized


def parse_resume_with_external_api(file_info: dict, raw_text: str, fallback: dict, timeout: int | None = None) -> dict:
    if RESUME_PARSE_API_URL:
        headers = {"Content-Type": "application/json"}
        if RESUME_PARSE_API_KEY:
            headers["Authorization"] = f"Bearer {RESUME_PARSE_API_KEY}"
        body = {
            "fileName": file_info["fileName"],
            "mimeType": file_info["mimeType"],
            "text": raw_text,
            "schema": "zhixu_resume_v1",
        }
        if RESUME_PARSE_SEND_FILE:
            body["base64"] = file_info.get("base64", "")
        try:
            req = urllib.request.Request(
                RESUME_PARSE_API_URL,
                data=json.dumps(body).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout or AI_RESUME_PARSE_TIMEOUT) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return choose_parsed_resume(payload.get("resume") or payload, fallback)
        except Exception as exc:
            print(f"[{utc_string()}] resume_external_parse_failed file_id={resume_file_log_id(file_info.get('fileName', ''))} error={type(exc).__name__}")
            return normalize_resume_ai_output(fallback)

    if AI_API_BASE and AI_API_KEY and len(raw_text) >= 20:
        schema_hint = {
            "profile": {
                "photoName": "",
                "name": "",
                "gender": "",
                "countryRegion": "",
                "idType": "",
                "idNumber": "",
                "phoneType": "",
                "phone": "",
                "email": "",
                "currentLocation": "",
                "wechat": "",
                "qq": "",
                "emergencyContact": "",
                "emergencyPhone": "",
            },
            "education": [{"degree": "", "schoolName": "", "studyLocation": "", "startDate": "", "endDate": "", "college": "", "major": "", "rank": "", "gpa": "", "gpaBase": ""}],
            "internships": [{"company": "", "position": "", "startDate": "", "endDate": "", "description": ""}],
            "projects": [{"name": "", "role": "", "startDate": "", "endDate": "", "description": "", "link": ""}],
            "awards": [{"type": "", "date": "", "description": ""}],
            "portfolios": [{"name": "", "link": "", "password": ""}],
            "selfDescription": "",
            "verifier": {"name": "", "identity": "", "phone": ""},
            "abilityTags": [{"name": "", "confidence": 0.75, "evidence": ""}],
            "summary": "",
            "gaps": [],
        }
        body = {
            "model": AI_RESUME_MODEL,
            "messages": [
                {"role": "system", "content": "你是严谨的中文简历解析器。只返回 JSON，不要 Markdown。字段缺失返回空字符串或空数组。abilityTags 中每个 confidence 必须是 0.55 到 0.98 之间的小数。"},
                {
                    "role": "user",
                    "content": json.dumps({"schema": schema_hint, "resumeText": raw_text[:12000]}, ensure_ascii=False),
                },
            ],
            "temperature": 0.1,
        }
        try:
            req = urllib.request.Request(
                f"{AI_API_BASE}/chat/completions",
                data=json.dumps(body).encode("utf-8"),
                headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout or AI_RESUME_PARSE_TIMEOUT) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            content = payload["choices"][0]["message"]["content"]
            return choose_parsed_resume(parse_json_object(content), fallback)
        except Exception as exc:
            print(f"[{utc_string()}] resume_ai_parse_failed file_id={resume_file_log_id(file_info.get('fileName', ''))} error={type(exc).__name__}")
            return normalize_resume_ai_output(fallback)

    return normalize_resume_ai_output(fallback)


def build_resume_parse_result(file_name: str, mime_type: str, encoded: str, file_bytes: bytes, user_id: int, progress=None) -> dict:
    started_at = time.monotonic()
    file_id = resume_file_log_id(file_name)

    def emit(phase_label: str, message: str) -> None:
        if progress:
            progress(phase_label, message)

    print(f"[{utc_string()}] resume_parse_start user={user_id} file_id={file_id} mime={mime_type} size={len(file_bytes)}")
    emit("提取文本", "正在提取文本；扫描版会自动尝试 OCR")
    raw_text, used_ocr = extract_resume_text_for_parsing(file_name, mime_type, file_bytes)
    elapsed_after_text = time.monotonic() - started_at
    print(
        f"[{utc_string()}] resume_parse_text_done user={user_id} file_id={file_id} "
        f"used_ocr={int(used_ocr)} text_len={len(raw_text)} elapsed={elapsed_after_text:.2f}s"
    )

    fallback = analyze_resume_text(raw_text) if len(raw_text) >= 20 else empty_resume()
    fallback["sourceFile"] = file_name

    remaining_budget = RESUME_PARSE_SOFT_TIMEOUT - elapsed_after_text
    if remaining_budget < 12:
        emit("生成结果", "识别耗时较长，正在返回已提取的信息。")
        print(f"[{utc_string()}] resume_parse_soft_timeout user={user_id} file_id={file_id} elapsed={elapsed_after_text:.2f}s")
        parsed = fallback
    else:
        emit("结构化字段", "正在整理基础信息、教育经历、项目和能力标签。")
        parsed = parse_resume_with_external_api(
            {"fileName": file_name, "mimeType": mime_type, "base64": encoded},
            raw_text,
            fallback,
            timeout=max(10, min(AI_RESUME_PARSE_TIMEOUT, int(remaining_budget))),
        )
    parsed["sourceFile"] = parsed.get("sourceFile") or file_name

    has_content = resume_has_content(parsed)
    print(
        f"[{utc_string()}] resume_parse_done user={user_id} file_id={file_id} "
        f"has_content={int(has_content)} elapsed={time.monotonic() - started_at:.2f}s"
    )

    if not has_content:
        message = "未从这个文件识别出可写入字段。请换可复制文本的 PDF/DOCX，或接入 OCR/专用解析服务后再解析扫描版文件。"
    elif used_ocr:
        message = "已通过 OCR 识别扫描版简历并完成结构化，请检查字段准确性。"
    elif len(raw_text) < 20:
        message = "已得到解析结果，但本地文本提取很少；请重点检查字段准确性。"
    else:
        message = "简历解析完成，请选择覆盖当前字段或只填空字段。"

    return {"resume": parsed, "rawText": raw_text[:20000], "message": message}


def cleanup_resume_parse_jobs() -> None:
    cutoff = now() - RESUME_PARSE_JOB_TTL
    with RESUME_PARSE_JOBS_LOCK:
        expired = [job_id for job_id, job in RESUME_PARSE_JOBS.items() if job.get("updatedAt", 0) < cutoff]
        for job_id in expired:
            RESUME_PARSE_JOBS.pop(job_id, None)


def set_resume_parse_job(job_id: str, **changes) -> None:
    with RESUME_PARSE_JOBS_LOCK:
        job = RESUME_PARSE_JOBS.get(job_id)
        if not job:
            return
        job.update(changes)
        job["updatedAt"] = now()


def serialize_resume_parse_job(job: dict) -> dict:
    payload = {
        "jobId": job["id"],
        "status": job["status"],
        "phaseLabel": job.get("phaseLabel", ""),
        "message": job.get("message", ""),
        "createdAt": utc_string(job.get("createdAt")),
        "updatedAt": utc_string(job.get("updatedAt")),
    }
    if job["status"] == "done":
        payload["result"] = job.get("result") or {}
    if job["status"] == "error":
        payload["error"] = job.get("error") or "server_error"
    return payload


def run_resume_parse_job(job_id: str, user_id: int, file_name: str, mime_type: str, encoded: str, file_bytes: bytes) -> None:
    def progress(phase_label: str, message: str) -> None:
        set_resume_parse_job(job_id, status="running", phaseLabel=phase_label, message=message)

    try:
        result = build_resume_parse_result(file_name, mime_type, encoded, file_bytes, user_id, progress)
        set_resume_parse_job(
            job_id,
            status="done",
            phaseLabel="解析完成",
            message=result.get("message", "解析完成，请选择写入方式。"),
            result=result,
        )
    except Exception as exc:
        print(f"[{utc_string()}] resume_parse_job_failed job_id={job_id} file_id={resume_file_log_id(file_name)} error={type(exc).__name__}")
        set_resume_parse_job(job_id, status="error", phaseLabel="解析失败", message="服务器处理失败，请稍后重试。", error="server_error")


def create_resume_parse_job(user_id: int, file_name: str, mime_type: str, encoded: str, file_bytes: bytes) -> str:
    cleanup_resume_parse_jobs()
    job_id = secrets.token_urlsafe(18)
    created_at = now()
    with RESUME_PARSE_JOBS_LOCK:
        RESUME_PARSE_JOBS[job_id] = {
            "id": job_id,
            "userId": user_id,
            "status": "queued",
            "phaseLabel": "等待解析",
            "message": "文件已上传，等待服务器开始解析。",
            "createdAt": created_at,
            "updatedAt": created_at,
        }
    thread = threading.Thread(
        target=run_resume_parse_job,
        args=(job_id, user_id, file_name, mime_type, encoded if RESUME_PARSE_SEND_FILE else "", file_bytes),
        daemon=True,
    )
    thread.start()
    return job_id


def local_interview_report(job, answers: list[dict]) -> dict:
    answer_text = "\n".join((item.get("answer") or "").strip() for item in answers)
    words = len(answer_text)
    has_metric = bool(re.search(r"\d+|%|提升|降低|增长|节省|转化", answer_text))
    has_structure = any(key in answer_text for key in ["背景", "目标", "行动", "结果", "首先", "其次", "最后"])
    job_title = f"{job['company']} {job['title']}" if job else "目标岗位"

    score = 68
    if words > 180:
        score += 8
    if has_metric:
        score += 10
    if has_structure:
        score += 8
    if len(answers) >= 3:
        score += 6
    score = min(score, 92)

    strengths = []
    risks = []
    actions = []

    if has_structure:
        strengths.append("回答有基本结构，面试官能顺着背景、行动和结果理解。")
    else:
        risks.append("回答结构偏散，建议按背景、任务、行动、结果组织。")
        actions.append("每题先用一句话给结论，再补充 2 到 3 个关键动作。")

    if has_metric:
        strengths.append("回答中出现了量化结果，更容易证明实际贡献。")
    else:
        risks.append("量化证据不足，容易显得像职责描述而不是个人成果。")
        actions.append("给每段经历补充规模、转化、效率、成本或排名等数字。")

    if words < 120:
        risks.append("回答内容偏短，项目深挖时可能支撑不住追问。")
        actions.append("为核心项目准备 3 个可追问细节：难点、取舍、复盘。")
    else:
        strengths.append("回答长度足够支撑初步判断，可以继续练追问。")

    if job:
        requirements = "、".join(job["requirements"][:4])
        actions.append(f"针对 {job_title}，下次回答要主动贴合这些关键词：{requirements}。")

    return {
        "score": score,
        "title": f"{job_title} 模拟面试报告",
        "summary": f"本次回答整体完成度 {score}/100。重点继续提升结构化表达、量化证据和岗位关键词贴合度。",
        "strengths": strengths[:3],
        "risks": risks[:3],
        "actions": actions[:4],
        "createdAt": utc_string(),
    }


def external_ai_report(job, answers: list[dict], fallback: dict) -> dict:
    if not AI_API_BASE or not AI_API_KEY:
        return fallback

    prompt = {
        "job": job,
        "answers": answers,
        "requiredOutput": {
            "score": "0-100",
            "title": "报告标题",
            "summary": "总评",
            "strengths": ["优点"],
            "risks": ["风险"],
            "actions": ["下一步训练建议"],
        },
    }
    body = {
        "model": AI_INTERVIEW_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "你是严谨的校园招聘面试教练。只返回 JSON，不要 Markdown。",
            },
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
        "temperature": 0.4,
    }

    try:
        req = urllib.request.Request(
            f"{AI_API_BASE}/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {AI_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
        return parse_json_object(content)
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError):
        return fallback


def split_requirements(value) -> list:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "")
    parts = re.split(r"[、,，;；|/]\s*", text)
    return [item.strip() for item in parts if item.strip()]


def normalize_csv_row(row: dict) -> dict:
    aliases = {
        "公司": "company",
        "公司名称": "company",
        "企业": "company",
        "企业/招聘单位名称": "company",
        "岗位": "title",
        "岗位名称": "title",
        "职位": "title",
        "招聘岗位": "title",
        "城市": "city",
        "工作城市": "city",
        "工作地点": "city",
        "岗位方向": "category",
        "岗位类别": "category",
        "类别": "category",
        "所属行业": "category",
        "行业分类": "category",
        "企业类型": "companyType",
        "公司类型": "companyType",
        "类型": "companyType",
        "企业性质": "companyType",
        "企业/单位性质": "companyType",
        "招聘类型": "batch",
        "招聘类型/批次": "batch",
        "批次": "batch",
        "截止时间": "deadline",
        "投递截止": "deadline",
        "截止日期": "deadline",
        "网申截止时间": "deadline",
        "官方链接": "sourceUrl",
        "网申链接": "sourceUrl",
        "校招链接": "sourceUrl",
        "链接": "sourceUrl",
        "投递渠道": "sourceUrl",
        "投递方式": "sourceUrl",
        "企业招聘公告": "announcementUrl",
        "官方招聘推文": "announcementUrl",
        "JD": "description",
        "职位描述": "description",
        "岗位描述": "description",
        "备注": "description",
        "岗位要求": "requirements",
        "能力要求": "requirements",
        "招聘对象": "target",
        "日期": "sourceDate",
        "更新/开启时间": "sourceDate",
    }
    normalized = {}
    for key, value in row.items():
        clean_key = (key or "").strip()
        target = aliases.get(clean_key, clean_key)
        if isinstance(value, list):
            normalized[target] = value
        else:
            normalized[target] = str(value or "").strip()
    return normalized


def clean_text(value) -> str:
    text = re.sub(r"[\x00-\x08\x0b-\x1f]+", " ", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_url(value) -> str:
    text = str(value or "")
    match = re.search(r"https?://[^\s\x00\"<>]+", text)
    if not match:
        return ""
    url = match.group(0)
    url = re.split(r"[\x00-\x1f]", url, maxsplit=1)[0]
    url = url.rstrip("&;,，。()（）[]【】")
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    path = strip_tencent_url_tail(parsed.path)
    fragment = strip_tencent_url_tail(parsed.fragment)
    if parsed.query:
        query_items = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        query_items = [
            (key, strip_tencent_query_tail(key, val))
            for key, val in query_items
            if key.lower() not in {"sessionid", "session_id"}
        ]
        url = urllib.parse.urlunsplit(
            parsed._replace(path=path, query=urllib.parse.urlencode(query_items, doseq=True), fragment=fragment)
        )
    else:
        url = urllib.parse.urlunsplit(parsed._replace(path=path, fragment=fragment))
    return url


def is_public_job_url(value: str) -> bool:
    try:
        parsed = urllib.parse.urlsplit(value)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    host = parsed.hostname.strip().lower()
    if host in {"localhost"} or "." not in host:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast)


def job_submission_review_warnings(job: dict, payload: dict) -> list[str]:
    warnings = []
    company = clean_text(job.get("company") or payload.get("company"))
    city = clean_text(job.get("city") or payload.get("city"))
    category = clean_text(job.get("category") or payload.get("category"))
    deadline = clean_text(job.get("deadline") or payload.get("deadline"))
    source_url = clean_url(job.get("sourceUrl") or payload.get("sourceUrl") or "")
    description = clean_text(job.get("description") or payload.get("description"))
    requirements = job.get("requirements") or payload.get("requirements") or []
    if isinstance(requirements, str):
        requirements_text = requirements
    else:
        requirements_text = " ".join(clean_text(item) for item in requirements)

    if len(company) < 2:
        warnings.append("公司名称过短，需要核对。")
    if not is_public_job_url(source_url):
        warnings.append("链接不是有效公网招聘链接，建议驳回。")
    searchable = " ".join([source_url, description, requirements_text, clean_text(job.get("title") or payload.get("title"))]).lower()
    recruit_keywords = (
        "招聘", "校招", "网申", "校园", "实习", "应届", "投递", "career", "careers", "campus",
        "recruit", "recruitment", "job", "jobs", "apply", "join", "hr", "mokahr", "zhaopin",
    )
    if not any(keyword in searchable for keyword in recruit_keywords):
        warnings.append("链接和说明里缺少招聘/校招特征词，请人工打开核对。")
    if city in {"", "未标注"}:
        warnings.append("城市未标注。")
    if category in {"", "未分类"}:
        warnings.append("岗位方向/行业未标注。")
    if deadline in {"", "待确认"}:
        warnings.append("截止时间未确认。")
    if not description and not requirements_text:
        warnings.append("没有填写岗位说明或关键词。")
    return warnings


def strip_tencent_url_tail(value: str) -> str:
    text = value or ""
    lower = text.lower()
    for suffix in (
        "jobslisth",
        "jobsh",
        "campush",
        "positionh",
        "positionsh",
        "posth",
        "recruitmenth",
        "internsh",
        "indexh",
        ".htmlh",
        ".phph",
    ):
        if lower.endswith(suffix):
            return text[:-1]
    return text


def strip_tencent_query_tail(key: str, value: str) -> str:
    text = value or ""
    lower_key = (key or "").lower()
    lower = text.lower()
    if not lower.endswith("h"):
        return text
    if lower_key in {"lang"} and lower in {"zhh", "en-ush", "zh-cnh"}:
        return text[:-1]
    if lower_key in {"page", "type", "silence", "current", "limit"} and re.match(r"^[0-9]+h$", lower):
        return text[:-1]
    return text


def first_url(*values) -> str:
    for value in values:
        url = clean_url(value)
        if url:
            return url
    return ""


def parse_date_value(value):
    if isinstance(value, datetime.date):
        return value
    if isinstance(value, (int, float)) and 20000 <= float(value) <= 60000:
        return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(value)))

    text = clean_text(value)
    if not text or any(marker in text for marker in ("尽快", "招满", "长期", "即止")):
        return None

    patterns = [
        r"(20\d{2})[./-](\d{1,2})[./-](\d{1,2})",
        r"(20\d{2})年(\d{1,2})月(\d{1,2})日?",
        r"\b(2[6-9])[./-](\d{1,2})[./-](\d{1,2})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        year = int(match.group(1))
        if year < 100:
            year += 2000
        month = int(match.group(2))
        day = int(match.group(3))
        try:
            return datetime.date(year, month, day)
        except ValueError:
            return None
    return None


def iso_date(value) -> str:
    parsed = parse_date_value(value)
    return parsed.isoformat() if parsed else clean_text(value)


def normalize_job_batch(value) -> str:
    text = clean_text(value)
    if not text:
        return ""
    if "实习" in text or "暑期" in text:
        return "实习"
    if "春招" in text:
        return "26届春招"
    if "秋招" in text or "校招" in text or "提前批" in text or "2027" in text or "27届" in text:
        return "27届秋招"
    return ""


def normalize_company_type(value) -> str:
    text = clean_text(value) or "未分类"
    if "民营" in text:
        return "民企"
    if "央国企" in text:
        return "央国企"
    if "央企" in text:
        return "央企"
    if "国企" in text:
        return "国企"
    if "外企" in text:
        return "外企"
    return text


def normalize_city(value) -> str:
    text = clean_text(value)
    if not text:
        return "未标注"
    text = text.replace("、", " ").replace("，", " ").replace(",", " ")
    return re.sub(r"\s+", " ", text).strip()


def split_job_tokens(*values) -> list:
    tokens = []
    for value in values:
        text = clean_text(value)
        if not text:
            continue
        for item in re.split(r"[、,，;；/\n\r\t ]+", text):
            item = item.strip("：:；;，,。")
            if 1 < len(item) <= 24 and item not in tokens:
                tokens.append(item)
    return tokens


def sanitize_job_payload(payload: dict) -> dict:
    job = normalize_csv_row(payload)
    company = (job.get("company") or "").strip()
    title = (job.get("title") or "").strip()
    source_url = clean_url(job.get("sourceUrl") or job.get("source_url") or "")
    if not company or not title or not source_url:
        raise ValueError("job requires company, title and sourceUrl")
    return {
        "id": job.get("id"),
        "company": company,
        "title": title,
        "city": (job.get("city") or "未标注").strip(),
        "category": (job.get("category") or "未分类").strip(),
        "company_type": (job.get("companyType") or job.get("company_type") or "未分类").strip(),
        "batch": normalize_job_batch(job.get("batch") or job.get("category") or ""),
        "source": (job.get("source") or "manual").strip(),
        "deadline": (job.get("deadline") or "待确认").strip(),
        "source_url": source_url,
        "description": (job.get("description") or "").strip(),
        "requirements": split_requirements(job.get("requirements")),
    }


def upsert_job(conn: sqlite3.Connection, payload: dict) -> int:
    job = sanitize_job_payload(payload)
    requirements = json.dumps(job["requirements"], ensure_ascii=False)
    job_id = int(job["id"] or 0) if str(job.get("id") or "").isdigit() else 0
    if job_id:
        try:
            conn.execute(
                """
                UPDATE jobs
                SET company = ?, title = ?, city = ?, category = ?, company_type = ?, batch = ?, source = ?,
                    deadline = ?, source_url = ?, description = ?, requirements = ?, updated_at = ?,
                    owner_user_id = NULL, review_status = 'approved', review_note = ''
                WHERE id = ?
                """,
                (
                    job["company"],
                    job["title"],
                    job["city"],
                    job["category"],
                    job["company_type"],
                    job["batch"],
                    job["source"],
                    job["deadline"],
                    job["source_url"],
                    job["description"],
                    requirements,
                    now(),
                    job_id,
                ),
            )
            return job_id
        except sqlite3.IntegrityError:
            # A legacy row can normalize to an already-existing company/link key.
            # Fall back to the canonical company/link upsert and let import cleanup remove stale rows.
            pass

    conn.execute(
        """
        INSERT INTO jobs
        (company, title, city, category, company_type, batch, source, deadline, source_url, description, requirements, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company, source_url) DO UPDATE SET
            company = excluded.company,
            title = excluded.title,
            city = excluded.city,
            category = excluded.category,
            company_type = excluded.company_type,
            batch = excluded.batch,
            source = excluded.source,
            deadline = excluded.deadline,
            description = excluded.description,
            requirements = excluded.requirements,
            updated_at = excluded.updated_at,
            owner_user_id = NULL,
            review_status = 'approved',
            review_note = ''
        """,
        (
            job["company"],
            job["title"],
            job["city"],
            job["category"],
            job["company_type"],
            job["batch"],
            job["source"],
            job["deadline"],
            job["source_url"],
            job["description"],
            requirements,
            now(),
        ),
    )
    return conn.execute(
        "SELECT id FROM jobs WHERE company = ? AND source_url = ?",
        (job["company"], job["source_url"]),
    ).fetchone()["id"]


def parse_jobs_csv(csv_text: str) -> list:
    text = csv_text.lstrip("\ufeff").strip()
    if not text:
        return []
    reader = csv.DictReader(io.StringIO(text))
    return [normalize_csv_row(row) for row in reader]


def tencent_page_url(source: dict) -> str:
    query = {"tab": source["tab"]}
    if source.get("view_id"):
        query["viewId"] = source["view_id"]
    return f"https://docs.qq.com/sheet/{TENCENT_DOC_ID}?{urllib.parse.urlencode(query)}"


def parse_client_vars_callback(text: str) -> dict:
    match = re.match(r"clientVarsCallback\((.*)\)\s*;?\s*$", text, re.S)
    if not match:
        raise ValueError("invalid_tencent_response")
    return json.loads(match.group(1))


def fetch_tencent_payload(source: dict, full: bool = True) -> dict:
    page_url = tencent_page_url(source)
    jar = urllib.request.HTTPCookieProcessor()
    opener = urllib.request.build_opener(jar)
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "*/*"}
    page_req = urllib.request.Request(page_url, headers=headers)
    with opener.open(page_req, timeout=20) as response:
        html_text = response.read(300000).decode("utf-8", "replace")

    candidates = re.findall(r'(?:href|src)="([^"]*dop-api/opendoc[^"]*)"', html_text)
    if not candidates:
        raise ValueError("tencent_opendoc_url_not_found")
    opendoc_url = html.unescape(candidates[0])
    if opendoc_url.startswith("//"):
        opendoc_url = "https:" + opendoc_url
    elif opendoc_url.startswith("/"):
        opendoc_url = urllib.parse.urljoin(page_url, opendoc_url)

    def load(url: str) -> dict:
        req = urllib.request.Request(url, headers={**headers, "Referer": page_url})
        with opener.open(req, timeout=60) as response:
            return parse_client_vars_callback(response.read().decode("utf-8", "replace"))

    payload = load(opendoc_url)
    if not full:
        return payload

    item = tencent_initial_text_item(payload)
    max_row = int(item.get("max_row") or item.get("end_row_index") or 1000)
    parsed = urllib.parse.urlsplit(opendoc_url)
    query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    if source["kind"] == "smart":
        query["startrow"] = ["0"]
        query["endrow"] = [str(max_row)]
    else:
        query["startrow"] = ["0"]
        query["endrow"] = [str(max_row)]
        query["block_start_row"] = ["0"]
        query["block_end_row"] = [str(max_row)]
        query["block_start_col"] = ["0"]
        query["block_end_col"] = [str(int(item.get("max_col") or 31))]
    full_url = urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(query, doseq=True), parsed.fragment)
    )
    return load(full_url)


def tencent_initial_text_item(payload: dict) -> dict:
    try:
        return payload["clientVars"]["collab_client_vars"]["initialAttributedText"]["text"][0]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("invalid_tencent_payload") from exc


def tencent_cell_text(field_id: str, cell: dict, option_names: dict) -> str:
    if not isinstance(cell, dict):
        return ""
    values = []
    for segment in cell.get("1") or []:
        if not isinstance(segment, dict):
            continue
        if segment.get("1") == "url":
            values.append(segment.get("3") or segment.get("2") or "")
        else:
            values.append(segment.get("2") or segment.get("3") or "")
    for key in ("17", "9"):
        selected = cell.get(key)
        if selected is None:
            continue
        if not isinstance(selected, list):
            selected = [selected]
        for option_id in selected:
            values.append(option_names.get(field_id, {}).get(option_id, str(option_id)))
    return clean_text(" / ".join(str(value) for value in values if str(value).strip()))


def parse_tencent_smart_rows(source: dict, payload: dict) -> list:
    item = tencent_initial_text_item(payload)
    messages = json.loads(item.get("smartsheet") or "[]")
    if not messages or len(messages[0]) < 2:
        return []
    field_defs = messages[0][0]["c"]["3"]["3"]
    field_names = {field_id: field.get("30", "") for field_id, field in field_defs.items()}
    option_names = {}
    for field_id, field in field_defs.items():
        options = {}
        for option_key in ("17", "9"):
            option_block = field.get(option_key)
            if isinstance(option_block, dict):
                for option in option_block.get("3") or []:
                    if isinstance(option, dict):
                        options[option.get("1")] = option.get("2")
        option_names[field_id] = options

    rows = []
    row_entries = messages[0][1]["c"]["2"]["1"]
    for row_id, row_entry in row_entries.items():
        cells = row_entry.get("1", row_entry) if isinstance(row_entry, dict) else {}
        row = {"_source": source["name"], "_sourceKind": source["kind"], "_rowId": row_id}
        for field_id, cell in cells.items():
            name = field_names.get(field_id, field_id)
            value = tencent_cell_text(field_id, cell, option_names)
            if value:
                row[name] = value
        rows.append(row)
    return rows


def read_proto_varint(data: bytes, pos: int, end: int):
    shift = 0
    value = 0
    while pos < end:
        byte = data[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        if byte < 128:
            return value, pos
        shift += 7
        if shift > 70:
            raise ValueError("varint_too_long")
    raise ValueError("unexpected_eof")


def parse_proto_fields(data: bytes) -> list:
    fields = []
    pos = 0
    end = len(data)
    while pos < end:
        key, pos = read_proto_varint(data, pos, end)
        field_no = key >> 3
        wire_type = key & 7
        if field_no <= 0:
            raise ValueError("invalid_proto_field")
        if wire_type == 0:
            value, pos = read_proto_varint(data, pos, end)
        elif wire_type == 1:
            value = data[pos : pos + 8]
            pos += 8
        elif wire_type == 2:
            length, pos = read_proto_varint(data, pos, end)
            value = data[pos : pos + length]
            pos += length
        elif wire_type == 5:
            value = data[pos : pos + 4]
            pos += 4
        else:
            raise ValueError("unsupported_proto_wire_type")
        if pos > end:
            raise ValueError("unexpected_eof")
        fields.append((field_no, wire_type, value))
    return fields


def proto_field1_varint(data: bytes):
    try:
        for field_no, wire_type, value in parse_proto_fields(data):
            if field_no == 1 and wire_type == 0:
                return value
    except ValueError:
        return None
    return None


def decode_text_container(data: bytes) -> str:
    try:
        fields = parse_proto_fields(data)
        if len(fields) == 1 and fields[0][0] == 1 and fields[0][1] == 2:
            return fields[0][2].decode("utf-8", "replace")
    except ValueError:
        pass
    return data.decode("utf-8", "replace")


def decode_tencent_pool_entry(data: bytes) -> dict:
    entry = {"text": "", "url": "", "number": None}
    try:
        fields = parse_proto_fields(data)
    except ValueError:
        entry["text"] = clean_text(data.decode("utf-8", "replace"))
        return entry

    if len(fields) == 1 and fields[0][0] == 1 and fields[0][1] == 1:
        entry["number"] = struct.unpack("<d", fields[0][2])[0]
        return entry

    texts = []
    preferred_urls = []
    fallback_urls = []

    def add_url(target: list, value: str) -> None:
        found = clean_url(value)
        if found and found not in preferred_urls and found not in fallback_urls:
            target.append(found)

    for field_no, wire_type, value in fields:
        if wire_type != 2:
            continue
        decoded = value.decode("utf-8", "ignore")

        if field_no in (1, 3):
            text_value = clean_text(decode_text_container(value))
            if text_value and "Helvetica" not in text_value and "FFFF" not in text_value:
                texts.append(text_value)
            add_url(fallback_urls, decoded)

        try:
            preferred_count = len(preferred_urls)
            for sub_no, sub_wire, sub_value in parse_proto_fields(value):
                if sub_wire != 2:
                    continue
                sub_decoded = sub_value.decode("utf-8", "ignore")
                if field_no == 7 and sub_no == 11:
                    add_url(preferred_urls, sub_decoded)
                else:
                    add_url(fallback_urls, sub_decoded)
                if sub_no in (1, 3):
                    text_value = clean_text(decode_text_container(sub_value))
                    if text_value and "Helvetica" not in text_value and "FFFF" not in text_value:
                        texts.append(text_value)
            if field_no == 7 and len(preferred_urls) == preferred_count:
                add_url(fallback_urls, decoded)
        except ValueError:
            if field_no == 7:
                add_url(fallback_urls, decoded)

    urls = preferred_urls + fallback_urls
    entry["url"] = urls[0] if urls else ""
    entry["text"] = texts[-1] if texts else ""
    return entry


TENCENT_LINK_ACTION_MARKERS = ("投递", "报名", "网申", "方式", "渠道", "查看")


def tencent_link_text_is_url(value: str) -> bool:
    return bool(re.match(r"^(?:https?://|www\.)", clean_text(value), re.I))


def tencent_link_text_is_action(value: str) -> bool:
    text = clean_text(value)
    return any(marker in text for marker in TENCENT_LINK_ACTION_MARKERS)


def tencent_company_key(value: str) -> str:
    text = clean_text(value).lower()
    text = re.sub(r"[（(].*?[）)]", "", text)
    text = re.split(r"[-－—–·•｜|]", text, maxsplit=1)[0]
    key = re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", text)
    for token in ("有限责任公司", "股份有限公司", "有限公司", "集团股份", "集团", "控股", "科技", "技术", "公司", "校招计划", "校园招聘", "校招", "招聘"):
        key = key.replace(token, "")
    return key


def tencent_company_matches(company: str, link_text: str) -> bool:
    company_key = tencent_company_key(company)
    link_key = tencent_company_key(link_text)
    if not company_key or not link_key:
        return False
    if company_key == link_key:
        return True
    if min(len(company_key), len(link_key)) <= 2:
        return False
    return company_key in link_key or link_key in company_key


def assign_tencent_sheet_links(rows: list, value_pool: list) -> None:
    links = [
        item
        for item in value_pool
        if item.get("url") and not tencent_link_text_is_url(item.get("text", ""))
    ]
    row_numbers = []
    row_candidates = []
    for row in rows:
        try:
            row_index = int(row.get("_rowId") or 0)
        except (TypeError, ValueError):
            row_index = 0
        row_numbers.append(row_index)
        company = row.get("企业/招聘单位名称", "")
        candidates = []
        for index, link in enumerate(links):
            if tencent_link_text_is_action(link.get("text", "")):
                continue
            if abs(index - row_index * 2) > 900:
                continue
            if tencent_company_matches(company, link.get("text", "")):
                candidates.append(index)
        row_candidates.append(candidates)

    def candidate_support(row_pos: int, anchor_index: int) -> int:
        current_row = row_numbers[row_pos]
        score = 0
        for neighbor_pos in range(max(0, row_pos - 8), min(len(rows), row_pos + 9)):
            if neighbor_pos == row_pos:
                continue
            row_delta = row_numbers[neighbor_pos] - current_row
            if abs(row_delta) > 20:
                continue
            expected = anchor_index + row_delta * 2
            if any(abs(candidate - expected) <= 6 for candidate in row_candidates[neighbor_pos]):
                score += max(1, 8 - abs(row_delta))
        return score

    scored = []
    for row_pos, candidates in enumerate(row_candidates):
        for anchor_index in candidates:
            support = candidate_support(row_pos, anchor_index)
            if support > 0:
                rough_distance = abs(anchor_index - row_numbers[row_pos] * 2)
                scored.append((-support, rough_distance, row_pos, anchor_index))
    scored.sort()

    used_anchors = set()
    assigned_rows = set()
    for _, _, row_pos, anchor_index in scored:
        if row_pos in assigned_rows or anchor_index in used_anchors:
            continue
        row = rows[row_pos]
        if first_url(row.get("投递方式")) or first_url(row.get("官方招聘推文")):
            row["投递方式"] = first_url(row.get("投递方式"))
            row["官方招聘推文"] = first_url(row.get("官方招聘推文"))
            continue

        used_anchors.add(anchor_index)
        announcement = links[anchor_index]
        delivery = None
        for index in range(anchor_index - 1, max(-1, anchor_index - 8), -1):
            if tencent_link_text_is_action(links[index].get("text", "")):
                delivery = links[index]
                break

        row["投递方式"] = (delivery or announcement).get("url", "")
        row["官方招聘推文"] = announcement.get("url", "")
        assigned_rows.add(row_pos)


def parse_tencent_sheet_rows(source: dict, payload: dict) -> list:
    item = tencent_initial_text_item(payload)
    block_datas = item.get("block_datas") or []
    if not block_datas:
        return []
    compressed = base64.b64decode(block_datas[0]["related_sheet"])
    raw = zlib.decompress(compressed)

    root = parse_proto_fields(raw)
    root_payload = next((value for _, wire_type, value in root if wire_type == 2), None)
    if not root_payload:
        return []
    inner = parse_proto_fields(root_payload)
    data_payloads = [value for _, wire_type, value in inner if wire_type == 2]
    if not data_payloads:
        return []
    sheet_block = parse_proto_fields(max(data_payloads, key=len))
    sheet_payload = next((value for field_no, wire_type, value in sheet_block if field_no == 19 and wire_type == 2), None)
    if not sheet_payload:
        sheet_payload = max((value for _, wire_type, value in sheet_block if wire_type == 2), key=len, default=None)
    if not sheet_payload:
        return []
    sheet_fields = parse_proto_fields(sheet_payload)
    value_pool = []
    cell_messages = []
    for field_no, wire_type, value in sheet_fields:
        if field_no == 5 and wire_type == 2:
            for pool_message in parse_proto_fields(value):
                if pool_message[1] == 2:
                    value_pool.append(decode_tencent_pool_entry(pool_message[2]))
        elif field_no == 6 and wire_type == 2:
            cell_messages.append(value)

    numeric_values = [item["number"] for item in value_pool if item.get("number") is not None]
    numeric_index = 0
    table = {}

    for message in cell_messages:
        row = 0
        col = 0
        kind = None
        value_index = None
        for field_no, wire_type, value in parse_proto_fields(message):
            if field_no == 1 and wire_type == 0:
                row = value
            elif field_no == 2 and wire_type == 0:
                col = value
            elif field_no == 3 and wire_type == 2:
                try:
                    content_fields = parse_proto_fields(value)
                except ValueError:
                    continue
                for content_no, content_wire, content_value in content_fields:
                    if content_no == 1 and content_wire == 0:
                        kind = content_value
                    elif content_no == 2 and content_wire == 2:
                        value_index = proto_field1_varint(content_value)
        cell_value = ""
        if kind == 2 and numeric_index < len(numeric_values):
            cell_value = iso_date(numeric_values[numeric_index])
            numeric_index += 1
        elif kind != 6 and value_index is not None and 0 <= value_index < len(value_pool):
            pool_value = value_pool[value_index]
            cell_value = pool_value.get("text") or pool_value.get("url") or ""
        if cell_value:
            table.setdefault(row, {})[col] = clean_text(cell_value)

    header_row_index = None
    headers = {}
    for row_index, cells in table.items():
        if any(value == "企业/招聘单位名称" for value in cells.values()):
            header_row_index = row_index
            headers = {col: value for col, value in cells.items() if value}
            break
    if header_row_index is None:
        return []

    data_rows = []
    for row_index in sorted(row for row in table if row > header_row_index):
        mapped = {"_source": source["name"], "_sourceKind": source["kind"], "_rowId": str(row_index)}
        for col, header in headers.items():
            value = table[row_index].get(col, "")
            if value:
                mapped[header] = value
        if mapped.get("企业/招聘单位名称"):
            data_rows.append(mapped)

    assign_tencent_sheet_links(data_rows, value_pool)
    return data_rows


def parse_tencent_source_rows(source: dict) -> list:
    payload = fetch_tencent_payload(source, full=True)
    if source["kind"] == "smart":
        return parse_tencent_smart_rows(source, payload)
    return parse_tencent_sheet_rows(source, payload)


def source_date_in_window(value, start_date, end_date) -> bool:
    parsed = parse_date_value(value)
    return bool(parsed and start_date <= parsed <= end_date)


def deadline_is_valid(value, min_deadline) -> bool:
    parsed = parse_date_value(value)
    return not parsed or parsed >= min_deadline


EXPIRED_TENCENT_SOURCE_URLS = {
    # ByteDance 2027 AI PM early-bird channel. Public mirrors list the end date as 2026-08-02.
    "https://wj.toutiao.com/q/v2/7657509120173735979/975xOc70/4d7d/#/",
}


def tencent_source_is_expired(*urls) -> bool:
    cleaned_urls = set()
    for url in urls:
        cleaned_url = clean_url(url)
        if cleaned_url:
            cleaned_urls.add(cleaned_url)
    return bool(cleaned_urls & EXPIRED_TENCENT_SOURCE_URLS)


def tencent_campus_url_score(value) -> int:
    url = clean_url(value)
    if not url:
        return 0
    try:
        parsed = urllib.parse.urlsplit(url.lower())
    except ValueError:
        return 0
    netloc = parsed.netloc
    full = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, parsed.fragment))
    if "mp.weixin.qq.com" in netloc:
        return 1
    if "social-recruitment" in full and "campus" not in full:
        return 0
    if any(keyword in full for keyword in ("campus", "xiaoyuan", "graduate", "graduates", "school", "university")):
        return 5
    if "join.qq.com" in netloc:
        return 5
    if any(
        keyword in full
        for keyword in (
            "zhaopin",
            "recruit",
            "recruitment",
            "career",
            "careers",
            "apply",
            "job",
            "jobs",
            "position",
            "positions",
            "zhiye",
            "mokahr",
            "hotjob",
            "feishu",
            "51job",
            "yingjiesheng",
            "iguopin",
        )
    ):
        return 4
    if any(
        host in netloc
        for host in (
            "wjx.cn",
            "jsjform.com",
            "mikecrm.com",
            "jinshuju.net",
            "wenjuan.com",
        )
    ):
        return 3
    return 0


def load_tencent_link_overrides() -> list:
    path = Path(TENCENT_LINK_OVERRIDES_PATH)
    if not path.is_absolute():
        path = BASE_DIR / path
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    items = payload.get("overrides") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return []
    overrides = []
    for item in items:
        if not isinstance(item, dict):
            continue
        company = clean_text(item.get("company"))
        batch = normalize_job_batch(item.get("batch") or "")
        source_url = clean_url(item.get("sourceUrl") or item.get("source_url"))
        if not company or batch not in JOB_BATCHES or not source_url:
            continue
        overrides.append(
            {
                "company": company,
                "batch": batch,
                "sourceUrl": source_url,
                "announcementUrl": clean_url(item.get("announcementUrl") or item.get("announcement_url")),
                "matchedCompany": clean_text(item.get("matchedCompany")) or company,
            }
        )
    return overrides


def build_tencent_link_override_map(overrides: list) -> dict:
    override_map = {}
    for item in overrides:
        key = (tencent_company_key(item.get("company")), normalize_job_batch(item.get("batch") or ""))
        if not key[0] or not key[1]:
            continue
        override_map.setdefault(key, []).append(item)
    for candidates in override_map.values():
        candidates.sort(key=lambda item: (-tencent_campus_url_score(item.get("sourceUrl")), item.get("company", "")))
    return override_map


def find_tencent_link_override(row: dict, override_map: dict):
    candidates = override_map.get(tencent_row_fallback_key(row)) or []
    return candidates[0] if candidates else None


def tencent_row_fallback_key(row: dict) -> tuple:
    normalized = normalize_csv_row(row)
    return (tencent_company_key(normalized.get("company")), normalize_job_batch(normalized.get("batch") or ""))


def tencent_job_fallback_key(job: dict) -> tuple:
    return (tencent_company_key(job.get("company")), normalize_job_batch(job.get("batch") or ""))


def find_tencent_company_link_fallback(row: dict, fallback_jobs: dict):
    candidates = fallback_jobs.get(tencent_row_fallback_key(row)) or []
    if not candidates:
        return None
    return candidates[0]


TENCENT_COMMENTARY_MARKERS = (
    "未检索到相关资料",
    "应届生",
    "薪资",
    "起薪",
    "年薪",
    "月薪",
    "待遇",
    "晋升",
    "成长路径",
    "职业路径",
    "团队氛围",
    "氛围",
    "同事",
    "内耗",
    "稳定性",
    "业务稳",
    "福利",
)


def tencent_text_looks_like_commentary(value) -> bool:
    text = clean_text(value)
    if not text:
        return False
    marker_count = sum(1 for marker in TENCENT_COMMENTARY_MARKERS if marker in text)
    if marker_count >= 2:
        return True
    return bool(re.search(r"(薪资|起薪|年薪|月薪|待遇).{0,30}(晋升|成长|氛围|同事|稳定|福利|内耗)", text))


def tencent_skipped_row_summary(source: dict, row: dict, reason: str) -> dict:
    normalized = normalize_csv_row(row)
    return {
        "reason": reason,
        "source": source["name"],
        "rowId": row.get("_rowId", ""),
        "date": normalized.get("sourceDate") or row.get("日期") or row.get("更新/开启时间") or "",
        "company": clean_text(normalized.get("company")),
        "batchRaw": clean_text(normalized.get("batch")),
        "batch": normalize_job_batch(normalized.get("batch") or ""),
        "city": clean_text(normalized.get("city")),
        "category": clean_text(normalized.get("category")),
        "companyType": clean_text(normalized.get("companyType")),
        "deadline": clean_text(normalized.get("deadline")),
        "title": clean_text(normalized.get("title")),
        "sourceUrl": first_url(normalized.get("sourceUrl")),
        "announcementUrl": first_url(normalized.get("announcementUrl")),
    }


def tencent_row_to_job(row: dict, start_date, end_date, min_deadline):
    normalized = normalize_csv_row(row)
    source_date = normalized.get("sourceDate") or row.get("日期") or row.get("更新/开启时间")
    if not source_date_in_window(source_date, start_date, end_date):
        return None, "更新日期不在窗口内"

    batch = normalize_job_batch(normalized.get("batch") or "")
    if batch not in JOB_BATCHES:
        return None, "批次不在三类里"

    deadline = normalized.get("deadline") or ""
    if not deadline_is_valid(deadline, min_deadline):
        return None, f"明确截止日期已早于 {min_deadline.isoformat()}"

    company = clean_text(normalized.get("company"))
    delivery_url = first_url(normalized.get("sourceUrl"))
    announcement_url = first_url(normalized.get("announcementUrl"))
    source_url = delivery_url or announcement_url
    if row.get("_fallbackCompany"):
        company = clean_text(row.get("_fallbackCompany")) or company
    if not company:
        return None, "缺公司名称"
    if not source_url:
        return None, "缺投递/公告链接"
    if tencent_source_is_expired(delivery_url, announcement_url, source_url):
        return None, "已确认过期链接"

    positions = clean_text(normalized.get("title"))
    if tencent_text_looks_like_commentary(positions):
        positions = ""
    industry = clean_text(normalized.get("category")) or "未分类"
    target = clean_text(normalized.get("target"))
    raw_batch = clean_text(normalized.get("batch"))
    deadline_text = iso_date(deadline) or "尽快投递"

    requirements = split_job_tokens(batch, industry, positions, target)[:10]
    description_parts = [
        f"更新：{iso_date(source_date)}",
        f"批次：{raw_batch or batch}",
    ]
    if target:
        description_parts.append(f"对象：{target}")
    if positions:
        description_parts.append(f"招聘岗位：{positions}")
    if delivery_url and delivery_url != source_url:
        description_parts.append(f"投递：{delivery_url}")
    if announcement_url and announcement_url != source_url:
        description_parts.append(f"公告：{announcement_url}")

    return {
        "company": company,
        "title": "招聘岗位合集",
        "city": normalize_city(normalized.get("city")),
        "category": industry,
        "companyType": normalize_company_type(normalized.get("companyType")),
        "batch": batch,
        "source": "tencent",
        "deadline": deadline_text,
        "sourceUrl": source_url,
        "description": "\n".join(description_parts),
        "requirements": requirements or [batch],
    }, ""


def canonical_sync_key(job: dict) -> str:
    company = re.sub(r"[\s·•|｜\-_（）()]+", "", job["company"]).lower()
    try:
        parsed = urllib.parse.urlsplit(job["sourceUrl"])
    except ValueError:
        return f"{company}|{clean_text(job.get('sourceUrl')).lower()}"
    path = parsed.path.rstrip("/")
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    stable_query = urllib.parse.urlencode(sorted(query))
    url = urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, stable_query, ""))
    return f"{company}|{url}"


def merge_text_values(*values, limit: int = 260) -> str:
    parts = []
    for value in values:
        for item in re.split(r"[ /、，,]+", clean_text(value)):
            if item and item not in parts:
                parts.append(item)
    merged = " ".join(parts)
    return merged[:limit] if len(merged) > limit else merged


def merge_tencent_jobs(jobs: list) -> list:
    merged = {}
    for job in jobs:
        key = canonical_sync_key(job)
        if key not in merged:
            merged[key] = job
            continue
        current = merged[key]
        current["city"] = merge_text_values(current.get("city"), job.get("city")) or "未标注"
        current["category"] = merge_text_values(current.get("category"), job.get("category")) or "未分类"
        current["companyType"] = merge_text_values(current.get("companyType"), job.get("companyType")) or "未分类"
        if not current.get("batch"):
            current["batch"] = job.get("batch", "")
        current["deadline"] = current.get("deadline") if parse_date_value(current.get("deadline")) else job.get("deadline") or current.get("deadline")
        current["description"] = "\n".join(
            part
            for part in [current.get("description", ""), job.get("description", "")]
            if part and part not in current.get("description", "")
        )
        requirements = []
        for item in current.get("requirements", []) + job.get("requirements", []):
            if item and item not in requirements:
                requirements.append(item)
        current["requirements"] = requirements[:12]
    return list(merged.values())


def collect_tencent_jobs(start_date=None, end_date=None, min_deadline=None, include_skipped_rows: bool = False) -> dict:
    start = parse_date_value(start_date or DEFAULT_SYNC_START_DATE)
    end = parse_date_value(end_date or DEFAULT_SYNC_END_DATE)
    deadline_floor = parse_date_value(min_deadline or DEFAULT_MIN_DEADLINE_DATE)
    if not start or not end or not deadline_floor:
        raise ValueError("invalid_sync_date")

    scanned = 0
    jobs = []
    skipped = {}
    skipped_rows = []
    source_stats = []
    skipped_records = []
    override_map = build_tencent_link_override_map(load_tencent_link_overrides())
    for source in TENCENT_JOB_SOURCES:
        rows = parse_tencent_source_rows(source)
        source_stat = {
            "name": source["name"],
            "tab": source["tab"],
            "scanned": len(rows),
            "kept": 0,
            "filledFromOverrideLink": 0,
            "filledFromCompanyLink": 0,
            "skipped": {},
        }
        source_stats.append(source_stat)
        for row in rows:
            scanned += 1
            job, reason = tencent_row_to_job(row, start, end, deadline_floor)
            if job:
                jobs.append(job)
                source_stat["kept"] += 1
            else:
                skipped[reason] = skipped.get(reason, 0) + 1
                source_stat["skipped"][reason] = source_stat["skipped"].get(reason, 0) + 1
                skipped_records.append({"source": source, "sourceStat": source_stat, "row": row, "reason": reason, "recovered": False})

    fallback_jobs = {}
    for job in jobs:
        if tencent_campus_url_score(job.get("sourceUrl")) < 3:
            continue
        fallback_jobs.setdefault(tencent_job_fallback_key(job), []).append(job)
    for candidates in fallback_jobs.values():
        candidates.sort(key=lambda item: (-tencent_campus_url_score(item.get("sourceUrl")), item.get("company", "")))

    filled_from_company_link = 0
    filled_from_override_link = 0
    for record in skipped_records:
        if record["reason"] != "缺投递/公告链接":
            continue
        override = find_tencent_link_override(record["row"], override_map)
        fallback = None if override else find_tencent_company_link_fallback(record["row"], fallback_jobs)
        resolved = override or fallback
        if not resolved:
            continue
        hydrated_row = dict(record["row"])
        hydrated_row["_fallbackCompany"] = resolved.get("company", "")
        hydrated_row["投递方式"] = resolved.get("sourceUrl", "")
        if resolved.get("announcementUrl"):
            hydrated_row["企业招聘公告"] = resolved.get("announcementUrl", "")
        job, reason = tencent_row_to_job(hydrated_row, start, end, deadline_floor)
        if not job:
            continue
        jobs.append(job)
        record["recovered"] = True
        if override:
            filled_from_override_link += 1
            record["sourceStat"]["filledFromOverrideLink"] += 1
        else:
            filled_from_company_link += 1
            record["sourceStat"]["filledFromCompanyLink"] += 1
        record["sourceStat"]["kept"] += 1
        skipped[record["reason"]] = max(0, skipped.get(record["reason"], 0) - 1)
        record["sourceStat"]["skipped"][record["reason"]] = max(0, record["sourceStat"]["skipped"].get(record["reason"], 0) - 1)

    skipped = {reason: count for reason, count in skipped.items() if count}
    for stat in source_stats:
        stat["skipped"] = {reason: count for reason, count in stat["skipped"].items() if count}
    if include_skipped_rows:
        skipped_rows = [
            tencent_skipped_row_summary(record["source"], record["row"], record["reason"])
            for record in skipped_records
            if not record["recovered"]
        ]

    merged_jobs = merge_tencent_jobs(jobs)
    result = {
        "jobs": merged_jobs,
        "summary": {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "minDeadline": deadline_floor.isoformat(),
            "scanned": scanned,
            "matched": len(jobs),
            "deduped": max(0, len(jobs) - len(merged_jobs)),
            "ready": len(merged_jobs),
            "filledFromOverrideLink": filled_from_override_link,
            "filledFromCompanyLink": filled_from_company_link,
            "skipped": skipped,
            "sources": source_stats,
        },
    }
    if include_skipped_rows:
        result["skippedRows"] = skipped_rows
    return result


def format_list_items(items: list, fields: list) -> str:
    lines = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        values = [str(item.get(field) or "").strip() for field in fields]
        line = " ".join(value for value in values if value)
        if line:
            lines.append(line)
    return "\n".join(lines)


def flatten_resume_fields(resume: dict) -> dict:
    profile = resume.get("profile") or {}
    education = resume.get("education") or []
    first_education = education[0] if education else {}
    internships = resume.get("internships") or []
    first_internship = internships[0] if internships else {}
    projects = resume.get("projects") or []
    first_project = projects[0] if projects else {}
    awards = resume.get("awards") or []
    first_award = awards[0] if awards else {}
    portfolios = resume.get("portfolios") or []
    first_portfolio = portfolios[0] if portfolios else {}
    verifier = resume.get("verifier") or {}
    fields = {
        "profile.name": profile.get("name", ""),
        "profile.gender": profile.get("gender", ""),
        "profile.countryRegion": profile.get("countryRegion", ""),
        "profile.idType": profile.get("idType", ""),
        "profile.idNumber": profile.get("idNumber", ""),
        "profile.phoneType": profile.get("phoneType", ""),
        "profile.phone": profile.get("phone", ""),
        "profile.email": profile.get("email", ""),
        "profile.currentLocation": profile.get("currentLocation", ""),
        "profile.wechat": profile.get("wechat", ""),
        "profile.qq": profile.get("qq", ""),
        "profile.emergencyContact": profile.get("emergencyContact", ""),
        "profile.emergencyPhone": profile.get("emergencyPhone", ""),
        "education.0.degree": first_education.get("degree", ""),
        "education.0.schoolName": first_education.get("schoolName", ""),
        "education.0.studyLocation": first_education.get("studyLocation", ""),
        "education.0.startDate": first_education.get("startDate", ""),
        "education.0.endDate": first_education.get("endDate", ""),
        "education.0.college": first_education.get("college", ""),
        "education.0.major": first_education.get("major", ""),
        "education.0.rank": first_education.get("rank", ""),
        "education.0.gpa": first_education.get("gpa", ""),
        "education.0.gpaBase": first_education.get("gpaBase", ""),
        "internships.0.company": first_internship.get("company", ""),
        "internships.0.position": first_internship.get("position", ""),
        "internships.0.startDate": first_internship.get("startDate", ""),
        "internships.0.endDate": first_internship.get("endDate", ""),
        "internships.0.description": first_internship.get("description", ""),
        "internships": format_list_items(internships, ["company", "position", "startDate", "endDate", "description"]),
        "projects.0.name": first_project.get("name", ""),
        "projects.0.role": first_project.get("role", ""),
        "projects.0.startDate": first_project.get("startDate", ""),
        "projects.0.endDate": first_project.get("endDate", ""),
        "projects.0.link": first_project.get("link", ""),
        "projects.0.description": first_project.get("description", ""),
        "projects": format_list_items(projects, ["name", "role", "startDate", "endDate", "description", "link"]),
        "awards.0.type": first_award.get("type", ""),
        "awards.0.date": first_award.get("date", ""),
        "awards.0.description": first_award.get("description", ""),
        "awards": format_list_items(awards, ["type", "date", "description"]),
        "portfolios.0.name": first_portfolio.get("name", ""),
        "portfolios.0.link": first_portfolio.get("link", ""),
        "portfolios.0.password": first_portfolio.get("password", ""),
        "portfolios": format_list_items(portfolios, ["name", "link", "password"]),
        "selfDescription": resume.get("selfDescription", ""),
        "verifier.name": verifier.get("name", ""),
        "verifier.identity": verifier.get("identity", ""),
        "verifier.phone": verifier.get("phone", ""),
    }
    return {key: value for key, value in fields.items() if value}


def multipart_form_data(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = "----zhixu" + secrets.token_hex(16)
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")
    for name, file_info in files.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            (
                f'Content-Disposition: form-data; name="{name}"; filename="{file_info["file_name"]}"\r\n'
                f'Content-Type: {file_info["mime_type"]}\r\n\r\n'
            ).encode("utf-8")
        )
        body.extend(file_info["data"])
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), boundary


def transcribe_audio_external(file_name: str, mime_type: str, audio_bytes: bytes) -> str:
    if not STT_API_URL or not STT_API_KEY:
        raise ValueError("stt_not_configured")
    body, boundary = multipart_form_data(
        {"model": STT_MODEL},
        {"file": {"file_name": file_name or "answer.webm", "mime_type": mime_type or "audio/webm", "data": audio_bytes}},
    )
    req = urllib.request.Request(
        STT_API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {STT_API_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    try:
        payload = json.loads(raw)
        return payload.get("text") or payload.get("result") or payload.get("transcript") or ""
    except json.JSONDecodeError:
        return raw.strip()


class AppHandler(BaseHTTPRequestHandler):
    server_version = "OfferOS/0.1"

    def log_message(self, fmt: str, *args) -> None:
        print("[%s] %s" % (utc_string(), fmt % args))

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.add_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/api/"):
            self.route_api("GET")
            return
        self.serve_static()

    def do_POST(self) -> None:
        self.route_api("POST")

    def do_PUT(self) -> None:
        self.route_api("PUT")

    def do_PATCH(self) -> None:
        self.route_api("PATCH")

    def do_DELETE(self) -> None:
        self.route_api("DELETE")

    def serve_static(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        if path == "/":
            path = "/index.html"
        if self.is_blocked_static_path(path):
            self.send_empty(404)
            return
        target = (PUBLIC_DIR / path.lstrip("/")).resolve()
        if not str(target).startswith(str(PUBLIC_DIR.resolve())):
            self.send_empty(404)
            return
        if not target.exists() or target.is_dir():
            if Path(path).suffix:
                self.send_empty(404)
                return
            target = PUBLIC_DIR / "index.html"

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def is_blocked_static_path(self, path: str) -> bool:
        parts = [part for part in path.split("/") if part]
        if any(part.startswith(".") for part in parts):
            return True
        if parts and parts[0] in {"backups", "data", "deploy", "extension", "scripts", "seed", "uploads"}:
            return True
        if parts and parts[-1] in {"DEPLOY.md", "PRD.md", "README.md", "requirements.txt", "server.py", "netlify.toml"}:
            return True
        return False

    def send_empty(self, status: int) -> None:
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        if length > MAX_JSON_BODY_SIZE:
            raise ValueError("request too large")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(self, status: int, payload: dict, headers=None) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.add_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(data)
        except BrokenPipeError:
            pass

    def add_cors_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin.startswith("chrome-extension://") or origin in {"http://127.0.0.1:8000", "http://localhost:8000"}:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def current_user(self):
        raw_cookie = self.headers.get("Cookie", "")
        jar = cookies.SimpleCookie(raw_cookie)
        token = jar.get("session")
        if not token:
            return None
        with connect_db() as conn:
            row = conn.execute(
                """
                SELECT users.* FROM users
                JOIN sessions ON sessions.user_id = users.id
                WHERE sessions.token = ? AND sessions.expires_at > ?
                """,
                (token.value, now()),
            ).fetchone()
        return row

    def require_user(self):
        user = self.current_user()
        if not user:
            self.send_json(401, {"error": "not_authenticated"})
            return None
        return user

    def current_plugin_user(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth.removeprefix("Bearer ").strip()
        if not token:
            return None
        with connect_db() as conn:
            return conn.execute(
                """
                SELECT users.* FROM users
                JOIN plugin_tokens ON plugin_tokens.user_id = users.id
                WHERE plugin_tokens.token_hash = ? AND plugin_tokens.revoked_at IS NULL
                """,
                (hash_token(token),),
            ).fetchone()

    def is_admin(self, user) -> bool:
        return bool(ADMIN_EMAILS and user["email"].lower() in ADMIN_EMAILS)

    def require_admin(self):
        user = self.require_user()
        if not user:
            return None
        if not self.is_admin(user):
            self.send_json(403, {"error": "admin_required"})
            return None
        return user

    def route_api(self, method: str) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            if method == "GET" and path == "/api/system/status":
                self.handle_system_status()
            elif method == "POST" and path == "/api/auth/send-code":
                self.handle_send_code()
            elif method == "POST" and path == "/api/auth/verify":
                self.handle_verify()
            elif method == "POST" and path == "/api/auth/logout":
                self.handle_logout()
            elif method == "GET" and path == "/api/me":
                self.handle_me()
            elif method == "GET" and path == "/api/resume":
                self.handle_get_resume()
            elif method == "PUT" and path == "/api/resume":
                self.handle_put_resume()
            elif method == "POST" and path == "/api/resume/analyze":
                self.handle_resume_analyze()
            elif method == "POST" and path == "/api/resume/parse-file":
                self.handle_resume_parse_file()
            elif method == "GET" and path.startswith("/api/resume/parse-jobs/"):
                self.handle_resume_parse_job(path)
            elif method == "GET" and path == "/api/jobs/suggestions":
                self.handle_job_suggestions()
            elif method == "GET" and path == "/api/jobs":
                self.handle_jobs()
            elif method == "GET" and path == "/api/applications":
                self.handle_get_applications()
            elif method == "POST" and path == "/api/applications":
                self.handle_upsert_application()
            elif method == "POST" and path == "/api/user/jobs":
                self.handle_create_user_job()
            elif method == "PATCH" and path.startswith("/api/applications/"):
                self.handle_patch_application(path)
            elif method == "DELETE" and path.startswith("/api/applications/"):
                self.handle_delete_application(path)
            elif method == "POST" and path == "/api/interviews/report":
                self.handle_interview_report()
            elif method == "POST" and path == "/api/speech/transcribe":
                self.handle_speech_transcribe()
            elif method == "GET" and path == "/api/interviews":
                self.handle_get_interviews()
            elif method == "DELETE" and path.startswith("/api/interviews/"):
                self.handle_delete_interview(path)
            elif method == "GET" and path == "/api/admin/stats":
                self.handle_admin_stats()
            elif method == "GET" and path == "/api/admin/job-submissions":
                self.handle_admin_job_submissions()
            elif method == "POST" and path.startswith("/api/admin/job-submissions/"):
                self.handle_admin_review_job_submission(path)
            elif method == "POST" and path == "/api/admin/jobs":
                self.handle_admin_upsert_job()
            elif method == "POST" and path == "/api/admin/jobs/import-csv":
                self.handle_admin_import_jobs_csv()
            elif method == "POST" and path == "/api/admin/jobs/sync-tencent":
                self.handle_admin_sync_tencent_jobs()
            elif method == "DELETE" and path.startswith("/api/admin/jobs/"):
                self.handle_admin_delete_job(path)
            elif method == "POST" and path == "/api/plugin/tokens":
                self.handle_create_plugin_token()
            elif method == "GET" and path == "/api/plugin/resume-fields":
                self.handle_plugin_resume_fields()
            elif method == "GET" and path == "/api/export":
                self.handle_export()
            else:
                self.send_json(404, {"error": "not_found"})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except sqlite3.Error:
            self.send_json(500, {"error": "database_error"})
        except Exception as exc:
            print(f"[{utc_string()}] api_error path={path} error={type(exc).__name__}")
            self.send_json(500, {"error": "server_error"})

    def handle_system_status(self) -> None:
        user = self.current_user()
        is_admin = bool(user and self.is_admin(user))
        smtp_configured = all(
            os.getenv(key) for key in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS")
        )
        payload = {
            "admin": is_admin,
            "sttConfigured": bool(STT_API_URL and STT_API_KEY),
        }
        if is_admin:
            payload.update(
                {
                    "env": APP_ENV,
                    "smtpConfigured": smtp_configured,
                    "aiConfigured": bool(AI_API_BASE and AI_API_KEY),
                    "resumeParseConfigured": bool(RESUME_PARSE_API_URL or (AI_API_BASE and AI_API_KEY)),
                    "models": {
                        "resume": AI_RESUME_MODEL,
                        "interview": AI_INTERVIEW_MODEL,
                        "fast": AI_FAST_MODEL,
                        "ocr": AI_OCR_MODEL,
                        "stt": STT_MODEL,
                    },
                }
            )
        self.send_json(200, payload)

    def handle_send_code(self) -> None:
        body = self.read_json()
        email_addr = (body.get("email") or "").strip().lower()
        if not EMAIL_RE.match(email_addr):
            self.send_json(400, {"error": "invalid_email"})
            return

        code = f"{secrets.randbelow(1_000_000):06d}"
        with connect_db() as conn:
            recent_minute = conn.execute(
                "SELECT COUNT(*) AS count FROM email_verifications WHERE email = ? AND created_at > ?",
                (email_addr, now() - CODE_SEND_WINDOW),
            ).fetchone()["count"]
            recent_hour = conn.execute(
                "SELECT COUNT(*) AS count FROM email_verifications WHERE email = ? AND created_at > ?",
                (email_addr, now() - 60 * 60),
            ).fetchone()["count"]
            if recent_minute >= CODE_SEND_WINDOW_MAX:
                self.send_json(429, {"error": "too_many_requests", "retryAfter": CODE_SEND_WINDOW})
                return
            if recent_hour >= CODE_SEND_HOUR_MAX:
                self.send_json(429, {"error": "too_many_requests", "retryAfter": 60 * 60})
                return
            conn.execute(
                "INSERT INTO email_verifications (email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (email_addr, hash_code(email_addr, code), now() + CODE_TTL, now()),
            )

        try:
            sent = send_email_code(email_addr, code)
        except Exception:
            if APP_ENV == "production":
                self.send_json(502, {"error": "email_send_failed"})
                return
            sent = False
        if not sent:
            self.send_json(500, {"error": "smtp_not_configured"})
            return
        payload = {"ok": True, "sent": sent}
        self.send_json(200, payload)

    def handle_verify(self) -> None:
        body = self.read_json()
        email_addr = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()
        if body.get("acceptedTerms") is not True:
            self.send_json(400, {"error": "accepted_terms_required"})
            return
        if not EMAIL_RE.match(email_addr):
            self.send_json(400, {"error": "invalid_email"})
            return
        if not re.match(r"^\d{6}$", code):
            self.send_json(400, {"error": "invalid_code"})
            return

        with connect_db() as conn:
            code_row = conn.execute(
                """
                SELECT * FROM email_verifications
                WHERE email = ? AND consumed_at IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (email_addr,),
            ).fetchone()
            if not code_row:
                self.send_json(400, {"error": "code_not_requested"})
                return
            if code_row["locked_until"] and code_row["locked_until"] > now():
                self.send_json(429, {"error": "too_many_attempts", "retryAfter": code_row["locked_until"] - now()})
                return
            if code_row["expires_at"] <= now():
                conn.execute("UPDATE email_verifications SET consumed_at = ? WHERE id = ?", (now(), code_row["id"]))
                self.send_json(400, {"error": "code_expired"})
                return
            if not hmac.compare_digest(code_row["code_hash"], hash_code(email_addr, code)):
                attempts = int(code_row["attempts"] or 0) + 1
                if attempts >= CODE_MAX_ATTEMPTS:
                    conn.execute(
                        "UPDATE email_verifications SET attempts = ?, locked_until = ? WHERE id = ?",
                        (attempts, now() + CODE_LOCK_TTL, code_row["id"]),
                    )
                    self.send_json(429, {"error": "too_many_attempts", "retryAfter": CODE_LOCK_TTL})
                    return
                conn.execute("UPDATE email_verifications SET attempts = ? WHERE id = ?", (attempts, code_row["id"]))
                self.send_json(400, {"error": "invalid_code", "attemptsRemaining": CODE_MAX_ATTEMPTS - attempts})
                return

            conn.execute("UPDATE email_verifications SET consumed_at = ? WHERE id = ?", (now(), code_row["id"]))
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email_addr,)).fetchone()
            if not user:
                conn.execute("INSERT INTO users (email, created_at, last_login_at) VALUES (?, ?, ?)", (email_addr, now(), now()))
                user = conn.execute("SELECT * FROM users WHERE email = ?", (email_addr,)).fetchone()
            else:
                conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now(), user["id"]))

            token = secrets.token_urlsafe(32)
            conn.execute(
                "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (token, user["id"], now() + SESSION_TTL, now()),
            )

        cookie = f"session={token}; Path=/; Max-Age={SESSION_TTL}; SameSite=Lax; HttpOnly"
        self.send_json(200, {"ok": True, "user": {"id": user["id"], "email": user["email"]}}, {"Set-Cookie": cookie})

    def handle_logout(self) -> None:
        raw_cookie = self.headers.get("Cookie", "")
        jar = cookies.SimpleCookie(raw_cookie)
        token = jar.get("session")
        if token:
            with connect_db() as conn:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token.value,))
        self.send_json(200, {"ok": True}, {"Set-Cookie": "session=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly"})

    def handle_me(self) -> None:
        user = self.require_user()
        if not user:
            return
        self.send_json(200, {"user": {"id": user["id"], "email": user["email"], "lastLoginAt": utc_string(user["last_login_at"])}})

    def handle_get_resume(self) -> None:
        user = self.require_user()
        if not user:
            return
        with connect_db() as conn:
            row = conn.execute("SELECT * FROM resumes WHERE user_id = ?", (user["id"],)).fetchone()
        if not row:
            self.send_json(200, {"resume": None})
            return
        data = json.loads(row["data"])
        self.send_json(200, {"resume": data, "rawText": row["raw_text"] or "", "updatedAt": utc_string(row["updated_at"])})

    def handle_put_resume(self) -> None:
        user = self.require_user()
        if not user:
            return
        body = self.read_json()
        resume = body.get("resume") or {}
        raw_text = body.get("rawText") or ""
        with connect_db() as conn:
            conn.execute(
                """
                INSERT INTO resumes (user_id, data, raw_text, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, raw_text = excluded.raw_text, updated_at = excluded.updated_at
                """,
                (user["id"], json.dumps(resume, ensure_ascii=False), raw_text, now()),
            )
        self.send_json(200, {"ok": True, "resume": resume})

    def handle_resume_analyze(self) -> None:
        user = self.require_user()
        if not user:
            return
        body = self.read_json()
        raw_text = (body.get("rawText") or "").strip()
        if len(raw_text) < 20:
            self.send_json(400, {"error": "resume_text_too_short"})
            return
        analysis = analyze_resume_text(raw_text)
        self.send_json(200, {"analysis": analysis})

    def handle_resume_parse_file(self) -> None:
        user = self.require_user()
        if not user:
            return
        body = self.read_json()
        file_name = (body.get("fileName") or "").strip()
        mime_type = (body.get("mimeType") or "application/octet-stream").strip()
        encoded = body.get("base64") or ""
        if not file_name or not encoded:
            self.send_json(400, {"error": "file_required"})
            return
        try:
            file_bytes = base64.b64decode(encoded, validate=True)
        except Exception:
            self.send_json(400, {"error": "invalid_file_data"})
            return
        if len(file_bytes) > MAX_RESUME_FILE_SIZE:
            self.send_json(400, {"error": "file_too_large"})
            return

        job_id = create_resume_parse_job(user["id"], file_name, mime_type, encoded, file_bytes)
        self.send_json(
            202,
            {
                "ok": True,
                "jobId": job_id,
                "status": "queued",
                "message": "文件已上传，后台正在解析。",
            },
        )

    def handle_resume_parse_job(self, path: str) -> None:
        user = self.require_user()
        if not user:
            return
        job_id = urllib.parse.unquote(path.rsplit("/", 1)[-1])
        cleanup_resume_parse_jobs()
        with RESUME_PARSE_JOBS_LOCK:
            job = dict(RESUME_PARSE_JOBS.get(job_id) or {})
        if not job or job.get("userId") != user["id"]:
            self.send_json(404, {"error": "parse_job_not_found"})
            return
        self.send_json(200, serialize_resume_parse_job(job))

    def handle_jobs(self) -> None:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

        def first_param(name: str, default: str = "") -> str:
            return clean_text((query.get(name) or [default])[0])

        try:
            limit = int(first_param("limit", "120") or 120)
            offset = int(first_param("offset", "0") or 0)
        except ValueError:
            self.send_json(400, {"error": "invalid_pagination"})
            return
        limit = max(1, min(limit, 300))
        offset = max(0, offset)

        clauses = ["review_status = 'approved'"]
        values = []
        batch = first_param("batch")
        city = first_param("city")
        company_type = first_param("companyType")
        keyword = first_param("q")
        sort_mode = first_param("sort", "match")
        if batch and batch != "all":
            clauses.append("batch = ?")
            values.append(batch)
        if city and city != "all":
            clauses.append("city LIKE ?")
            values.append(f"%{city}%")
        if company_type and company_type != "all":
            clauses.append("company_type = ?")
            values.append(company_type)
        if keyword:
            like = f"%{keyword}%"
            clauses.append(
                "(company LIKE ? OR title LIKE ? OR city LIKE ? OR category LIKE ? OR company_type LIKE ? OR batch LIKE ? OR description LIKE ? OR requirements LIKE ?)"
            )
            values.extend([like, like, like, like, like, like, like, like])
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        facet_clauses = ["review_status = 'approved'"]
        facet_values = []
        if batch and batch != "all":
            facet_clauses.append("batch = ?")
            facet_values.append(batch)
        if keyword:
            facet_clauses.append(
                "(company LIKE ? OR title LIKE ? OR city LIKE ? OR category LIKE ? OR company_type LIKE ? OR batch LIKE ? OR description LIKE ? OR requirements LIKE ?)"
            )
            facet_values.extend([like, like, like, like, like, like, like, like])
        facet_where_sql = f"WHERE {' AND '.join(facet_clauses)}" if facet_clauses else ""
        update_date_expr = (
            "CASE WHEN description LIKE '更新：____-__-__%' "
            "THEN substr(description, 4, 10) "
            "ELSE strftime('%Y-%m-%d', updated_at, 'unixepoch', 'localtime') END"
        )
        source_update_date_expr = (
            "CASE WHEN description LIKE '更新：____-__-__%' "
            "THEN substr(description, 4, 10) "
            "ELSE NULL END"
        )
        if sort_mode == "updated":
            order_sql = f"{update_date_expr} DESC, updated_at DESC, company ASC"
        else:
            order_sql = """
                    CASE WHEN deadline LIKE '____-__-__' THEN 0 ELSE 1 END,
                    deadline ASC,
                    updated_at DESC,
                    company ASC
                """

        with connect_db() as conn:
            total = conn.execute(f"SELECT COUNT(*) AS count FROM jobs {where_sql}", values).fetchone()["count"]
            latest_source_date = conn.execute(
                f"SELECT MAX({source_update_date_expr}) AS latest FROM jobs {where_sql}",
                values,
            ).fetchone()["latest"]
            cities = [
                row["city"]
                for row in conn.execute(
                    f"SELECT DISTINCT city FROM jobs {facet_where_sql} AND city != '' ORDER BY city"
                    if facet_where_sql
                    else "SELECT DISTINCT city FROM jobs WHERE city != '' ORDER BY city",
                    facet_values,
                ).fetchall()
            ]
            company_types = [
                row["company_type"]
                for row in conn.execute(
                    f"SELECT DISTINCT company_type FROM jobs {facet_where_sql} AND company_type != '' ORDER BY company_type"
                    if facet_where_sql
                    else "SELECT DISTINCT company_type FROM jobs WHERE company_type != '' ORDER BY company_type",
                    facet_values,
                ).fetchall()
            ]
            rows = conn.execute(
                f"""
                SELECT * FROM jobs
                {where_sql}
                ORDER BY {order_sql}
                LIMIT ? OFFSET ?
                """,
                values + [limit, offset],
            ).fetchall()
        self.send_json(
            200,
            {
                "jobs": [row_to_job(row) for row in rows],
                "meta": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "returned": len(rows),
                    "hasMore": offset + len(rows) < total,
                    "sort": sort_mode,
                    "latestSourceDate": latest_source_date or "",
                    "cities": cities,
                    "companyTypes": company_types,
                },
            },
        )

    def handle_job_suggestions(self) -> None:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

        def first_param(name: str, default: str = "") -> str:
            return clean_text((query.get(name) or [default])[0])

        keyword = first_param("q")
        if not keyword:
            self.send_json(200, {"suggestions": []})
            return
        try:
            limit = int(first_param("limit", "8") or 8)
        except ValueError:
            limit = 8
        limit = max(1, min(limit, 10))

        clauses = ["review_status = 'approved'"]
        values = []
        batch = first_param("batch")
        city = first_param("city")
        company_type = first_param("companyType")
        if batch and batch != "all":
            clauses.append("batch = ?")
            values.append(batch)
        if city and city != "all":
            clauses.append("city LIKE ?")
            values.append(f"%{city}%")
        if company_type and company_type != "all":
            clauses.append("company_type = ?")
            values.append(company_type)

        like = f"%{keyword}%"
        clauses.append("(company LIKE ? OR title LIKE ? OR city LIKE ? OR category LIKE ? OR company_type LIKE ? OR requirements LIKE ?)")
        values.extend([like, like, like, like, like, like])
        where_sql = f"WHERE {' AND '.join(clauses)}"
        prefix = f"{keyword}%"

        with connect_db() as conn:
            rows = conn.execute(
                f"""
                SELECT company, title, city, category, company_type, batch, requirements, updated_at
                FROM jobs
                {where_sql}
                ORDER BY
                  CASE
                    WHEN company LIKE ? THEN 0
                    WHEN title LIKE ? THEN 1
                    WHEN category LIKE ? THEN 2
                    WHEN city LIKE ? THEN 3
                    ELSE 4
                  END,
                  updated_at DESC,
                  company ASC
                LIMIT 80
                """,
                values + [prefix, prefix, prefix, prefix],
            ).fetchall()

        needle = keyword.lower()
        suggestions = []
        seen = set()

        def add(kind: str, value: str, detail: str = "") -> None:
            text = clean_text(value)
            if not text or needle not in text.lower():
                return
            key = (kind, text)
            if key in seen or len(suggestions) >= limit:
                return
            seen.add(key)
            suggestions.append(
                {
                    "type": kind,
                    "value": text,
                    "label": text,
                    "detail": clean_text(detail),
                }
            )

        for row in rows:
            add("公司", row["company"], " · ".join(part for part in [row["city"], row["company_type"]] if part))
            title = display_job_title(row["title"])
            add("岗位", title, " · ".join(part for part in [row["company"], row["city"]] if part))
            add("方向", row["category"], " · ".join(part for part in [row["batch"], row["company_type"]] if part))
            add("城市", row["city"], "工作地点")
            try:
                requirements = json.loads(row["requirements"] or "[]")
            except json.JSONDecodeError:
                requirements = []
            for requirement in requirements:
                add("能力", requirement, row["company"])
            if len(suggestions) >= limit:
                break

        self.send_json(200, {"suggestions": suggestions})

    def handle_get_applications(self) -> None:
        user = self.require_user()
        if not user:
            return
        with connect_db() as conn:
            rows = conn.execute(
                """
                SELECT applications.*, jobs.company, jobs.title, jobs.city, jobs.deadline, jobs.category, jobs.requirements,
                       jobs.company_type, jobs.batch, jobs.source, jobs.source_url, jobs.review_status, jobs.review_note
                FROM applications
                JOIN jobs ON jobs.id = applications.job_id
                WHERE applications.user_id = ?
                ORDER BY applications.updated_at DESC
                """,
                (user["id"],),
            ).fetchall()
        applications = []
        for row in rows:
            applications.append(
                {
                    "id": row["id"],
                    "jobId": row["job_id"],
                    "status": row["status"],
                    "statusLabel": STATUS_LABELS.get(row["status"], row["status"]),
                    "notes": row["notes"] or "",
                    "customTitle": row["custom_title"] or "",
                    "assessmentDeadlineAt": row["assessment_deadline_at"] or None,
                    "assessmentDeadline": utc_string(row["assessment_deadline_at"]) if row["assessment_deadline_at"] else "",
                    "assessmentReminderSentAt": row["assessment_reminder_sent_at"] or None,
                    "assessmentReminderSent": utc_string(row["assessment_reminder_sent_at"]) if row["assessment_reminder_sent_at"] else "",
                    "interviewDeadlineAt": row["interview_deadline_at"] or None,
                    "interviewDeadline": utc_string(row["interview_deadline_at"]) if row["interview_deadline_at"] else "",
                    "interviewReminderSentAt": row["interview_reminder_sent_at"] or None,
                    "interviewReminderSent": utc_string(row["interview_reminder_sent_at"]) if row["interview_reminder_sent_at"] else "",
                    "assessmentCompletedAt": row["assessment_completed_at"] or None,
                    "assessmentCompleted": utc_string(row["assessment_completed_at"]) if row["assessment_completed_at"] else "",
                    "interviewCompletedAt": row["interview_completed_at"] or None,
                    "interviewCompleted": utc_string(row["interview_completed_at"]) if row["interview_completed_at"] else "",
                    "updatedAt": utc_string(row["updated_at"]),
                    "job": {
                        "id": row["job_id"],
                        "company": row["company"],
                        "title": row["title"],
                        "city": row["city"],
                        "deadline": row["deadline"],
                        "category": row["category"],
                        "requirements": json.loads(row["requirements"] or "[]"),
                        "companyType": row["company_type"],
                        "batch": row["batch"],
                        "source": row["source"],
                        "sourceUrl": row["source_url"],
                        "reviewStatus": row["review_status"],
                        "reviewNote": row["review_note"] or "",
                    },
                }
            )
        self.send_json(200, {"applications": applications})

    def handle_upsert_application(self) -> None:
        user = self.require_user()
        if not user:
            return
        body = self.read_json()
        job_id = int(body.get("jobId") or 0)
        status = body.get("status") or "preparing"
        if status == "saved":
            status = "preparing"
        notes = body.get("notes") or ""
        if status not in STATUS_LABELS:
            self.send_json(400, {"error": "invalid_status"})
            return
        with connect_db() as conn:
            job = conn.execute("SELECT id, owner_user_id, review_status FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if not job:
                self.send_json(404, {"error": "job_not_found"})
                return
            if job["review_status"] != "approved" and int(job["owner_user_id"] or 0) != int(user["id"]):
                self.send_json(404, {"error": "job_not_found"})
                return
            conn.execute(
                """
                INSERT INTO applications (user_id, job_id, status, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, job_id) DO UPDATE SET
                status = excluded.status,
                notes = CASE WHEN excluded.notes = '' THEN applications.notes ELSE excluded.notes END,
                updated_at = excluded.updated_at
                """,
                (user["id"], job_id, status, notes, now(), now()),
            )
        self.send_json(200, {"ok": True})

    def handle_create_user_job(self) -> None:
        user = self.require_user()
        if not user:
            return
        body = self.read_json()
        body["title"] = clean_text(body.get("title") or "招聘岗位合集")
        body["source"] = "user_submission"
        try:
            job = sanitize_job_payload(body)
        except ValueError:
            self.send_json(400, {"error": "job_requires_company_title_url"})
            return
        if not is_public_job_url(job["source_url"]):
            self.send_json(400, {"error": "invalid_job_url"})
            return
        if not job["requirements"]:
            job["requirements"] = split_job_tokens(job["batch"], job["category"], job["title"], job["description"])[:10]
        status = body.get("status") or "preparing"
        if status == "saved":
            status = "preparing"
        if status not in STATUS_LABELS:
            status = "preparing"
        timestamp = now()
        requirements = json.dumps(job["requirements"], ensure_ascii=False)
        payload = {
            "company": job["company"],
            "title": job["title"],
            "city": job["city"],
            "category": job["category"],
            "companyType": job["company_type"],
            "batch": job["batch"],
            "deadline": job["deadline"],
            "sourceUrl": job["source_url"],
            "description": job["description"],
            "requirements": job["requirements"],
        }
        with connect_db() as conn:
            existing = conn.execute(
                "SELECT * FROM jobs WHERE company = ? AND source_url = ?",
                (job["company"], job["source_url"]),
            ).fetchone()
            if existing:
                job_id = existing["id"]
                review_status = existing["review_status"] or "approved"
                if review_status != "approved" and (
                    not existing["owner_user_id"]
                    or int(existing["owner_user_id"]) == int(user["id"])
                    or review_status == "rejected"
                ):
                    conn.execute(
                        """
                        UPDATE jobs
                        SET title = ?, city = ?, category = ?, company_type = ?, batch = ?, source = ?,
                            deadline = ?, description = ?, requirements = ?, owner_user_id = ?,
                            review_status = 'pending', review_note = '', updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            job["title"],
                            job["city"],
                            job["category"],
                            job["company_type"],
                            job["batch"],
                            "user_submission",
                            job["deadline"],
                            job["description"],
                            requirements,
                            user["id"],
                            timestamp,
                            job_id,
                        ),
                    )
                    review_status = "pending"
                submission_status = "approved" if review_status == "approved" else "pending"
            else:
                cursor = conn.execute(
                    """
                    INSERT INTO jobs
                    (company, title, city, category, company_type, batch, source, deadline, source_url,
                     description, requirements, updated_at, owner_user_id, review_status, review_note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '')
                    """,
                    (
                        job["company"],
                        job["title"],
                        job["city"],
                        job["category"],
                        job["company_type"],
                        job["batch"],
                        "user_submission",
                        job["deadline"],
                        job["source_url"],
                        job["description"],
                        requirements,
                        timestamp,
                        user["id"],
                    ),
                )
                job_id = cursor.lastrowid
                submission_status = "pending"

            conn.execute(
                """
                INSERT INTO applications (user_id, job_id, status, notes, created_at, updated_at)
                VALUES (?, ?, ?, '', ?, ?)
                ON CONFLICT(user_id, job_id) DO UPDATE SET
                    status = excluded.status,
                    updated_at = excluded.updated_at
                """,
                (user["id"], job_id, status, timestamp, timestamp),
            )
            conn.execute(
                """
                INSERT INTO job_submissions (user_id, job_id, status, payload, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user["id"], job_id, submission_status, json.dumps(payload, ensure_ascii=False), timestamp),
            )
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        self.send_json(
            200,
            {
                "ok": True,
                "reviewStatus": submission_status,
                "job": row_to_job(row),
            },
        )

    def handle_patch_application(self, path: str) -> None:
        user = self.require_user()
        if not user:
            return
        app_id = int(path.rsplit("/", 1)[-1])
        body = self.read_json()
        status = body.get("status")
        notes = body.get("notes")
        custom_title = clean_text(body.get("customTitle"))[:80] if "customTitle" in body else None
        if status == "saved":
            status = "preparing"
        assessment_deadline_provided = "assessmentDeadlineAt" in body or "assessmentDeadline" in body
        interview_deadline_provided = "interviewDeadlineAt" in body or "interviewDeadline" in body
        assessment_deadline_at = None
        interview_deadline_at = None
        if assessment_deadline_provided:
            assessment_deadline_at = parse_local_datetime(body.get("assessmentDeadlineAt", body.get("assessmentDeadline")))
            if assessment_deadline_at is None and body.get("assessmentDeadlineAt", body.get("assessmentDeadline")) not in (None, ""):
                self.send_json(400, {"error": "invalid_deadline"})
                return
        if interview_deadline_provided:
            interview_deadline_at = parse_local_datetime(body.get("interviewDeadlineAt", body.get("interviewDeadline")))
            if interview_deadline_at is None and body.get("interviewDeadlineAt", body.get("interviewDeadline")) not in (None, ""):
                self.send_json(400, {"error": "invalid_deadline"})
                return
        assessment_completed_provided = "assessmentCompleted" in body or "assessmentCompletedAt" in body
        interview_completed_provided = "interviewCompleted" in body or "interviewCompletedAt" in body
        timestamp = now()
        assessment_completed_at = timestamp if body.get("assessmentCompleted") or body.get("assessmentCompletedAt") else None
        interview_completed_at = timestamp if body.get("interviewCompleted") or body.get("interviewCompletedAt") else None
        if status is not None and status not in STATUS_LABELS:
            self.send_json(400, {"error": "invalid_status"})
            return
        with connect_db() as conn:
            row = conn.execute(
                "SELECT * FROM applications WHERE id = ? AND user_id = ?",
                (app_id, user["id"]),
            ).fetchone()
            if not row:
                self.send_json(404, {"error": "application_not_found"})
                return
            conn.execute(
                """
                UPDATE applications
                SET status = COALESCE(?, status),
                    notes = COALESCE(?, notes),
                    custom_title = COALESCE(?, custom_title),
                    assessment_deadline_at = CASE WHEN ? THEN ? ELSE assessment_deadline_at END,
                    assessment_reminder_sent_at = CASE WHEN ? THEN NULL ELSE assessment_reminder_sent_at END,
                    interview_deadline_at = CASE WHEN ? THEN ? ELSE interview_deadline_at END,
                    interview_reminder_sent_at = CASE WHEN ? THEN NULL ELSE interview_reminder_sent_at END,
                    assessment_completed_at = CASE WHEN ? THEN ? ELSE assessment_completed_at END,
                    interview_completed_at = CASE WHEN ? THEN ? ELSE interview_completed_at END,
                    updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (
                    status,
                    notes,
                    custom_title,
                    1 if assessment_deadline_provided else 0,
                    assessment_deadline_at,
                    1 if assessment_deadline_provided else 0,
                    1 if interview_deadline_provided else 0,
                    interview_deadline_at,
                    1 if interview_deadline_provided else 0,
                    1 if assessment_completed_provided else 0,
                    assessment_completed_at,
                    1 if interview_completed_provided else 0,
                    interview_completed_at,
                    timestamp,
                    app_id,
                    user["id"],
                ),
            )
        self.send_json(200, {"ok": True})

    def handle_delete_application(self, path: str) -> None:
        user = self.require_user()
        if not user:
            return
        app_id = int(path.rsplit("/", 1)[-1])
        with connect_db() as conn:
            cursor = conn.execute(
                "DELETE FROM applications WHERE id = ? AND user_id = ?",
                (app_id, user["id"]),
            )
            if cursor.rowcount == 0:
                self.send_json(404, {"error": "application_not_found"})
                return
        self.send_json(200, {"ok": True})

    def handle_interview_report(self) -> None:
        user = self.require_user()
        if not user:
            return
        body = self.read_json()
        job_id = body.get("jobId")
        submitted_title = clean_text(body.get("jobTitle"))[:80]
        answers = body.get("answers") or []
        if not answers:
            self.send_json(400, {"error": "answers_required"})
            return
        job = None
        with connect_db() as conn:
            if job_id:
                row = conn.execute(
                    """
                    SELECT jobs.*, applications.custom_title AS application_custom_title
                    FROM jobs
                    LEFT JOIN applications ON applications.job_id = jobs.id AND applications.user_id = ?
                    WHERE jobs.id = ?
                    """,
                    (user["id"], int(job_id)),
                ).fetchone()
                if row:
                    role_title = clean_text(row["application_custom_title"] or submitted_title)[:80]
                    if not role_title:
                        self.send_json(400, {"error": "job_title_required"})
                        return
                    job = row_to_job(row)
                    job["title"] = role_title
            fallback = local_interview_report(job, answers)
            report = external_ai_report(job, answers, fallback)
            cursor = conn.execute(
                "INSERT INTO interviews (user_id, job_id, report, created_at) VALUES (?, ?, ?, ?)",
                (user["id"], int(job_id) if job_id else None, json.dumps(report, ensure_ascii=False), now()),
            )
            interview_id = cursor.lastrowid
        self.send_json(200, {"report": report, "interviewId": interview_id})

    def handle_speech_transcribe(self) -> None:
        user = self.require_user()
        if not user:
            return
        body = self.read_json()
        encoded = body.get("base64") or ""
        file_name = body.get("fileName") or "answer.webm"
        mime_type = body.get("mimeType") or "audio/webm"
        if not encoded:
            self.send_json(400, {"error": "audio_required"})
            return
        try:
            audio_bytes = base64.b64decode(encoded, validate=True)
        except Exception:
            self.send_json(400, {"error": "invalid_audio_data"})
            return
        if len(audio_bytes) > 8 * 1024 * 1024:
            self.send_json(400, {"error": "audio_too_large"})
            return
        try:
            text = transcribe_audio_external(file_name, mime_type, audio_bytes)
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
            return
        except Exception:
            self.send_json(502, {"error": "stt_failed"})
            return
        self.send_json(200, {"text": text})

    def handle_get_interviews(self) -> None:
        user = self.require_user()
        if not user:
            return
        with connect_db() as conn:
            rows = conn.execute(
                "SELECT * FROM interviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
                (user["id"],),
            ).fetchall()
        self.send_json(
            200,
            {
                "interviews": [
                    {"id": row["id"], "jobId": row["job_id"], "report": json.loads(row["report"]), "createdAt": utc_string(row["created_at"])}
                    for row in rows
                ]
            },
        )

    def handle_delete_interview(self, path: str) -> None:
        user = self.require_user()
        if not user:
            return
        interview_id = int(path.rsplit("/", 1)[-1])
        with connect_db() as conn:
            cursor = conn.execute(
                "DELETE FROM interviews WHERE id = ? AND user_id = ?",
                (interview_id, user["id"]),
            )
            if cursor.rowcount == 0:
                self.send_json(404, {"error": "interview_not_found"})
                return
        self.send_json(200, {"ok": True})

    def handle_admin_stats(self) -> None:
        user = self.require_admin()
        if not user:
            return

        def mask_email_address(email_addr: str) -> str:
            local, _, domain = email_addr.partition("@")
            if not domain:
                return "***"
            if len(local) <= 2:
                masked_local = local[:1] + "***"
            else:
                masked_local = local[:2] + "***" + local[-1:]
            return f"{masked_local}@{domain}"

        def distribution(conn, column: str) -> list[dict]:
            rows = conn.execute(
                f"""
                SELECT COALESCE(NULLIF({column}, ''), '未分类') AS label, COUNT(*) AS count
                FROM jobs
                WHERE review_status = 'approved'
                GROUP BY COALESCE(NULLIF({column}, ''), '未分类')
                ORDER BY count DESC, label ASC
                LIMIT 8
                """
            ).fetchall()
            return [{"label": row["label"], "count": row["count"]} for row in rows]

        db_bytes = 0
        for suffix in ("", "-wal", "-shm"):
            path = Path(str(DB_PATH) + suffix)
            if path.exists():
                db_bytes += path.stat().st_size

        with connect_db() as conn:
            users = conn.execute("SELECT email, created_at, last_login_at FROM users").fetchall()
            total_accounts = len(users)
            admin_accounts = sum(1 for row in users if row["email"].lower() in ADMIN_EMAILS)
            real_users = total_accounts - admin_accounts
            active_cutoff = now() - 7 * 24 * 60 * 60
            active_users_7d = sum(
                1
                for row in users
                if row["email"].lower() not in ADMIN_EMAILS
                and is_recent_timestamp(row["last_login_at"], active_cutoff)
            )
            resume_count = conn.execute("SELECT COUNT(*) AS count FROM resumes").fetchone()["count"]
            job_count = conn.execute("SELECT COUNT(*) AS count FROM jobs WHERE review_status = 'approved'").fetchone()["count"]
            company_count = conn.execute("SELECT COUNT(DISTINCT company) AS count FROM jobs WHERE review_status = 'approved'").fetchone()["count"]
            application_count = conn.execute("SELECT COUNT(*) AS count FROM applications").fetchone()["count"]
            interview_count = conn.execute("SELECT COUNT(*) AS count FROM interviews").fetchone()["count"]
            pending_submission_count = conn.execute(
                "SELECT COUNT(*) AS count FROM job_submissions WHERE status = 'pending'"
            ).fetchone()["count"]
            plugin_token_count = conn.execute(
                "SELECT COUNT(*) AS count FROM plugin_tokens WHERE revoked_at IS NULL"
            ).fetchone()["count"]
            status_rows = conn.execute(
                "SELECT status, COUNT(*) AS count FROM applications GROUP BY status ORDER BY count DESC"
            ).fetchall()
            recent_users = conn.execute(
                "SELECT email, created_at, last_login_at FROM users ORDER BY created_at DESC LIMIT 8"
            ).fetchall()

            stats = {
                "counts": {
                    "totalAccounts": total_accounts,
                    "realUsers": real_users,
                    "adminAccounts": admin_accounts,
                    "activeUsers7d": active_users_7d,
                    "resumes": resume_count,
                    "jobs": job_count,
                    "companies": company_count,
                    "applications": application_count,
                    "interviews": interview_count,
                    "pluginTokens": plugin_token_count,
                    "pendingJobSubmissions": pending_submission_count,
                },
                "database": {
                    "bytes": db_bytes,
                    "updatedAt": utc_string(),
                },
                "jobsByCity": distribution(conn, "city"),
                "jobsByType": distribution(conn, "company_type"),
                "jobsByCategory": distribution(conn, "category"),
                "jobsByBatch": distribution(conn, "batch"),
                "applicationsByStatus": [
                    {
                        "label": STATUS_LABELS.get(row["status"], row["status"]),
                        "count": row["count"],
                    }
                    for row in status_rows
                ],
                "recentUsers": [
                    {
                        "email": mask_email_address(row["email"]),
                        "role": "管理员" if row["email"].lower() in ADMIN_EMAILS else "用户",
                        "createdAt": utc_string(row["created_at"]),
                        "lastLoginAt": utc_string(row["last_login_at"]) if row["last_login_at"] else "",
                    }
                    for row in recent_users
                ],
            }

        self.send_json(200, {"stats": stats})

    def handle_admin_job_submissions(self) -> None:
        user = self.require_admin()
        if not user:
            return

        def mask_email_address(email_addr: str) -> str:
            local, _, domain = email_addr.partition("@")
            if not domain:
                return "***"
            if len(local) <= 2:
                masked_local = local[:1] + "***"
            else:
                masked_local = local[:2] + "***" + local[-1:]
            return f"{masked_local}@{domain}"

        with connect_db() as conn:
            rows = conn.execute(
                """
                SELECT job_submissions.*, users.email, jobs.company, jobs.title, jobs.city, jobs.category,
                       jobs.company_type, jobs.batch, jobs.deadline, jobs.source_url, jobs.description,
                       jobs.requirements, jobs.review_status, jobs.review_note
                FROM job_submissions
                JOIN users ON users.id = job_submissions.user_id
                JOIN jobs ON jobs.id = job_submissions.job_id
                ORDER BY CASE job_submissions.status WHEN 'pending' THEN 0 ELSE 1 END,
                         job_submissions.created_at DESC
                LIMIT 50
                """
            ).fetchall()
        submissions = []
        for row in rows:
            payload = {}
            try:
                payload = json.loads(row["payload"] or "{}")
            except json.JSONDecodeError:
                payload = {}
            job_detail = {
                "company": row["company"],
                "title": row["title"],
                "city": row["city"],
                "category": row["category"],
                "companyType": row["company_type"],
                "batch": row["batch"],
                "deadline": row["deadline"],
                "sourceUrl": row["source_url"],
                "description": row["description"],
                "requirements": json.loads(row["requirements"] or "[]"),
                "reviewStatus": row["review_status"],
                "reviewNote": row["review_note"] or "",
            }
            submissions.append(
                {
                    "id": row["id"],
                    "jobId": row["job_id"],
                    "status": row["status"],
                    "submitter": mask_email_address(row["email"]),
                    "createdAt": utc_string(row["created_at"]),
                    "reviewedAt": utc_string(row["reviewed_at"]) if row["reviewed_at"] else "",
                    "reviewNote": row["review_note"] or "",
                    "payload": payload,
                    "warnings": job_submission_review_warnings(job_detail, payload),
                    "job": job_detail,
                }
            )
        self.send_json(200, {"submissions": submissions})

    def handle_admin_review_job_submission(self, path: str) -> None:
        user = self.require_admin()
        if not user:
            return
        parts = [part for part in path.strip("/").split("/") if part]
        if len(parts) < 3:
            self.send_json(404, {"error": "submission_not_found"})
            return
        try:
            submission_id = int(parts[-2] if parts[-1] == "review" else parts[-1])
        except ValueError:
            self.send_json(400, {"error": "invalid_submission_id"})
            return
        body = self.read_json()
        action = clean_text(body.get("action") or "")
        note = clean_text(body.get("note") or "")
        if action not in {"approve", "reject"}:
            self.send_json(400, {"error": "invalid_review_action"})
            return
        review_status = "approved" if action == "approve" else "rejected"
        timestamp = now()
        with connect_db() as conn:
            row = conn.execute(
                """
                SELECT job_submissions.*, jobs.review_status
                FROM job_submissions
                JOIN jobs ON jobs.id = job_submissions.job_id
                WHERE job_submissions.id = ?
                """,
                (submission_id,),
            ).fetchone()
            if not row:
                self.send_json(404, {"error": "submission_not_found"})
                return
            conn.execute(
                """
                UPDATE job_submissions
                SET status = ?, reviewed_at = ?, reviewed_by = ?, review_note = ?
                WHERE id = ?
                """,
                (review_status, timestamp, user["id"], note, submission_id),
            )
            if action == "approve":
                conn.execute(
                    """
                    UPDATE jobs
                    SET review_status = 'approved', review_note = ?, owner_user_id = NULL, updated_at = ?
                    WHERE id = ?
                    """,
                    (note, timestamp, row["job_id"]),
                )
            elif row["review_status"] != "approved":
                conn.execute(
                    """
                    UPDATE jobs
                    SET review_status = 'rejected', review_note = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (note, timestamp, row["job_id"]),
                )
        self.send_json(200, {"ok": True, "status": review_status})

    def handle_admin_upsert_job(self) -> None:
        user = self.require_admin()
        if not user:
            return
        payload = self.read_json()
        with connect_db() as conn:
            job_id = upsert_job(conn, payload)
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        self.send_json(200, {"ok": True, "job": row_to_job(row)})

    def handle_admin_import_jobs_csv(self) -> None:
        user = self.require_admin()
        if not user:
            return
        body = self.read_json()
        rows = parse_jobs_csv(body.get("csv") or "")
        if not rows:
            self.send_json(400, {"error": "csv_empty"})
            return
        imported = 0
        errors = []
        with connect_db() as conn:
            for index, row in enumerate(rows, start=2):
                try:
                    upsert_job(conn, row)
                    imported += 1
                except ValueError as exc:
                    errors.append({"row": index, "error": str(exc)})
        self.send_json(200, {"ok": True, "imported": imported, "errors": errors})

    def handle_admin_sync_tencent_jobs(self) -> None:
        user = self.require_admin()
        if not user:
            return
        body = self.read_json()
        action = (body.get("action") or "preview").strip()
        result = collect_tencent_jobs(
            body.get("startDate") or DEFAULT_SYNC_START_DATE,
            body.get("endDate") or DEFAULT_SYNC_END_DATE,
            body.get("minDeadline") or DEFAULT_MIN_DEADLINE_DATE,
        )
        jobs = result["jobs"]
        imported = 0
        if action == "import":
            with connect_db() as conn:
                conn.execute("DELETE FROM jobs WHERE source_url LIKE 'https://careers.example.com/%'")
                for job in jobs:
                    upsert_job(conn, job)
                    imported += 1
        sample = [
            {
                "company": job["company"],
                "batch": job["batch"],
                "city": job["city"],
                "companyType": job["companyType"],
                "deadline": job["deadline"],
                "sourceUrl": job["sourceUrl"],
            }
            for job in jobs[:8]
        ]
        self.send_json(
            200,
            {
                "ok": True,
                "action": action,
                "imported": imported,
                "summary": result["summary"],
                "sample": sample,
            },
        )

    def handle_admin_delete_job(self, path: str) -> None:
        user = self.require_admin()
        if not user:
            return
        job_id = int(path.rsplit("/", 1)[-1])
        with connect_db() as conn:
            conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        self.send_json(200, {"ok": True})

    def handle_create_plugin_token(self) -> None:
        user = self.require_user()
        if not user:
            return
        body = self.read_json()
        name = (body.get("name") or "Chrome 插件").strip()
        token = "zx_" + secrets.token_urlsafe(32)
        with connect_db() as conn:
            conn.execute(
                "INSERT INTO plugin_tokens (user_id, token_hash, name, created_at) VALUES (?, ?, ?, ?)",
                (user["id"], hash_token(token), name, now()),
            )
        self.send_json(200, {"token": token})

    def handle_plugin_resume_fields(self) -> None:
        user = self.current_plugin_user()
        if not user:
            self.send_json(401, {"error": "invalid_plugin_token"})
            return
        with connect_db() as conn:
            row = conn.execute("SELECT * FROM resumes WHERE user_id = ?", (user["id"],)).fetchone()
        if not row:
            self.send_json(404, {"error": "resume_not_found"})
            return
        resume = json.loads(row["data"])
        self.send_json(
            200,
            {
                "user": {"email": user["email"]},
                "fields": flatten_resume_fields(resume),
                "updatedAt": utc_string(row["updated_at"]),
            },
        )

    def handle_export(self) -> None:
        user = self.require_user()
        if not user:
            return
        with connect_db() as conn:
            resume = conn.execute("SELECT * FROM resumes WHERE user_id = ?", (user["id"],)).fetchone()
            applications = conn.execute("SELECT * FROM applications WHERE user_id = ?", (user["id"],)).fetchall()
            interviews = conn.execute("SELECT * FROM interviews WHERE user_id = ?", (user["id"],)).fetchall()
        self.send_json(
            200,
            {
                "user": {"id": user["id"], "email": user["email"]},
                "resume": json.loads(resume["data"]) if resume else None,
                "applications": [dict(row) for row in applications],
                "interviews": [json.loads(row["report"]) for row in interviews],
            },
        )


def main() -> None:
    init_db()
    start_background_tasks()
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), AppHandler)
    print(f"OfferOS running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
