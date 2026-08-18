#!/usr/bin/env python3
import email.message
import base64
import csv
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import shutil
import smtplib
import sqlite3
import subprocess
import time
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "zhixu.db"


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

APP_ENV = os.getenv("APP_ENV", "development")
APP_SECRET = os.getenv("APP_SECRET", "dev-secret-change-before-production")
SESSION_TTL = 60 * 60 * 24 * 30
CODE_TTL = 60 * 10

AI_API_BASE = os.getenv("AI_API_BASE", "").rstrip("/")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_DEFAULT_MODEL = os.getenv("AI_MODEL", "qwen-plus-latest")
AI_RESUME_MODEL = os.getenv("AI_RESUME_MODEL", AI_DEFAULT_MODEL)
AI_INTERVIEW_MODEL = os.getenv("AI_INTERVIEW_MODEL", AI_DEFAULT_MODEL)
AI_FAST_MODEL = os.getenv("AI_FAST_MODEL", "qwen-turbo")
AI_OCR_MODEL = os.getenv("AI_OCR_MODEL", "qwen-vl-ocr")
RESUME_PARSE_API_URL = os.getenv("RESUME_PARSE_API_URL", "")
RESUME_PARSE_API_KEY = os.getenv("RESUME_PARSE_API_KEY", "")
STT_API_URL = os.getenv("STT_API_URL", "")
STT_API_KEY = os.getenv("STT_API_KEY", "")
STT_MODEL = os.getenv("STT_MODEL", "paraformer-v2")
ADMIN_EMAILS = {item.strip().lower() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()}
MAX_RESUME_FILE_SIZE = 8 * 1024 * 1024
MAX_JSON_BODY_SIZE = 12 * 1024 * 1024

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

JOB_SEEDS = [
    {
        "company": "星河科技",
        "title": "产品经理校招",
        "city": "上海",
        "category": "产品",
        "company_type": "民企",
        "deadline": "2026-09-12",
        "source_url": "https://careers.example.com/xinghe/pm",
        "description": "负责用户需求分析、产品方案设计、数据复盘和跨团队推进。",
        "requirements": ["用户研究", "产品设计", "数据分析", "沟通协作"],
    },
    {
        "company": "云栈智能",
        "title": "后端开发工程师",
        "city": "杭州",
        "category": "技术",
        "company_type": "民企",
        "deadline": "2026-09-20",
        "source_url": "https://careers.example.com/yunzhan/backend",
        "description": "参与核心业务 API、数据库建模、任务队列和系统稳定性建设。",
        "requirements": ["Python", "Java", "数据库", "后端开发", "API"],
    },
    {
        "company": "海辰金融",
        "title": "数据分析管培生",
        "city": "上海",
        "category": "数据",
        "company_type": "央企",
        "deadline": "2026-09-05",
        "source_url": "https://careers.example.com/haichen/data",
        "description": "围绕业务指标、用户分层、投放效果和经营数据进行分析。",
        "requirements": ["SQL", "Python", "数据分析", "财务分析", "可视化"],
    },
    {
        "company": "极点汽车",
        "title": "供应链计划专员",
        "city": "深圳",
        "category": "供应链",
        "company_type": "国企",
        "deadline": "2026-09-18",
        "source_url": "https://careers.example.com/jidian/scm",
        "description": "支持需求预测、供应计划、库存分析和跨部门协同。",
        "requirements": ["供应链", "数据分析", "Excel", "沟通协作"],
    },
    {
        "company": "观远咨询",
        "title": "商业分析顾问",
        "city": "北京",
        "category": "咨询",
        "company_type": "外企",
        "deadline": "2026-09-25",
        "source_url": "https://careers.example.com/guanyuan/ba",
        "description": "参与行业研究、访谈分析、商业建模和客户汇报材料撰写。",
        "requirements": ["行业研究", "咨询", "数据分析", "表达汇报"],
    },
    {
        "company": "灵犀互娱",
        "title": "用户运营校招",
        "city": "广州",
        "category": "运营",
        "company_type": "民企",
        "deadline": "2026-09-08",
        "source_url": "https://careers.example.com/lingxi/operation",
        "description": "负责活动策划、用户增长、社群运营和数据复盘。",
        "requirements": ["用户增长", "内容运营", "活动策划", "数据分析"],
    },
    {
        "company": "矩阵安全",
        "title": "安全工程师校招",
        "city": "北京",
        "category": "技术",
        "company_type": "民企",
        "deadline": "2026-09-30",
        "source_url": "https://careers.example.com/matrix/sec",
        "description": "参与 Web 安全、漏洞分析、安全工具开发和应急响应。",
        "requirements": ["网络安全", "Python", "Linux", "Web 安全"],
    },
    {
        "company": "青岚制造",
        "title": "市场营销管培生",
        "city": "成都",
        "category": "市场",
        "company_type": "事业单位",
        "deadline": "2026-09-16",
        "source_url": "https://careers.example.com/qinglan/marketing",
        "description": "支持品牌传播、渠道活动、市场调研和销售线索分析。",
        "requirements": ["市场调研", "品牌传播", "活动策划", "沟通协作"],
    },
]

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
    "saved": "已收藏",
    "preparing": "准备投递",
    "applied": "已投递",
    "test": "测评/笔试",
    "interview": "面试",
    "offer": "Offer",
    "rejected": "已拒绝",
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


def utc_string(ts=None) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(coerce_timestamp(ts) or now()))


def is_recent_timestamp(value, cutoff: int) -> bool:
    parsed = coerce_timestamp(value)
    return bool(parsed and parsed >= cutoff)


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(exist_ok=True)
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
                created_at INTEGER NOT NULL
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
                deadline TEXT NOT NULL,
                source_url TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL,
                requirements TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                notes TEXT,
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
        job_columns = {row["name"] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
        if "company_type" not in job_columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN company_type TEXT NOT NULL DEFAULT '未分类'")
        for job in JOB_SEEDS:
            conn.execute(
                """
                INSERT OR IGNORE INTO jobs
                (company, title, city, category, company_type, deadline, source_url, description, requirements, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job["company"],
                    job["title"],
                    job["city"],
                    job["category"],
                    job["company_type"],
                    job["deadline"],
                    job["source_url"],
                    job["description"],
                    json.dumps(job["requirements"], ensure_ascii=False),
                    now(),
                ),
            )
            conn.execute(
                "UPDATE jobs SET company_type = ? WHERE source_url = ?",
                (job["company_type"], job["source_url"]),
            )


def hash_code(email: str, code: str) -> str:
    payload = f"{email.lower()}:{code}".encode("utf-8")
    return hmac.new(APP_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def hash_token(token: str) -> str:
    return hmac.new(APP_SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def send_email_code(email_addr: str, code: str) -> bool:
    host = os.getenv("SMTP_HOST", "")
    if not host:
        return False

    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    sender = os.getenv("MAIL_FROM", user or f"no-reply@{host}")

    msg = email.message.EmailMessage()
    msg["Subject"] = "OfferOS 登录验证码"
    msg["From"] = sender
    msg["To"] = email_addr
    msg.set_content(f"你的登录验证码是：{code}\n\n验证码 10 分钟内有效。")

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


def row_to_job(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "company": row["company"],
        "title": row["title"],
        "city": row["city"],
        "category": row["category"],
        "companyType": row["company_type"],
        "deadline": row["deadline"],
        "sourceUrl": row["source_url"],
        "description": row["description"],
        "requirements": json.loads(row["requirements"]),
        "updatedAt": utc_string(row["updated_at"]),
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
    if lower.endswith((".txt", ".md")) or mime_type.startswith("text/"):
        return clean_extracted_text(file_bytes.decode("utf-8", errors="replace"))
    if lower.endswith(".docx"):
        return clean_extracted_text(extract_docx_text(file_bytes))
    if lower.endswith(".doc"):
        return extract_legacy_doc_text(file_name, file_bytes)
    if lower.endswith(".pdf") or mime_type == "application/pdf":
        return extract_pdf_text_with_libraries(file_bytes) or clean_extracted_text(extract_pdf_text_basic(file_bytes))
    return ""


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


def parse_resume_with_external_api(file_info: dict, raw_text: str, fallback: dict) -> dict:
    if RESUME_PARSE_API_URL:
        headers = {"Content-Type": "application/json"}
        if RESUME_PARSE_API_KEY:
            headers["Authorization"] = f"Bearer {RESUME_PARSE_API_KEY}"
        body = {
            "fileName": file_info["fileName"],
            "mimeType": file_info["mimeType"],
            "base64": file_info["base64"],
            "text": raw_text,
            "schema": "zhixu_resume_v1",
        }
        try:
            req = urllib.request.Request(
                RESUME_PARSE_API_URL,
                data=json.dumps(body).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=40) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return normalize_resume_ai_output(payload.get("resume") or payload)
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
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
            with urllib.request.urlopen(req, timeout=40) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            content = payload["choices"][0]["message"]["content"]
            return normalize_resume_ai_output(parse_json_object(content))
        except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError):
            return fallback

    return normalize_resume_ai_output(fallback)


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
        "岗位": "title",
        "岗位名称": "title",
        "职位": "title",
        "城市": "city",
        "工作城市": "city",
        "岗位方向": "category",
        "岗位类别": "category",
        "类别": "category",
        "企业类型": "companyType",
        "公司类型": "companyType",
        "类型": "companyType",
        "截止时间": "deadline",
        "投递截止": "deadline",
        "截止日期": "deadline",
        "官方链接": "sourceUrl",
        "网申链接": "sourceUrl",
        "校招链接": "sourceUrl",
        "链接": "sourceUrl",
        "JD": "description",
        "职位描述": "description",
        "岗位描述": "description",
        "岗位要求": "requirements",
        "能力要求": "requirements",
    }
    normalized = {}
    for key, value in row.items():
        clean_key = (key or "").strip()
        target = aliases.get(clean_key, clean_key)
        normalized[target] = (value or "").strip()
    return normalized


def sanitize_job_payload(payload: dict) -> dict:
    job = normalize_csv_row(payload)
    company = (job.get("company") or "").strip()
    title = (job.get("title") or "").strip()
    source_url = (job.get("sourceUrl") or job.get("source_url") or "").strip()
    if not company or not title or not source_url:
        raise ValueError("job requires company, title and sourceUrl")
    return {
        "id": job.get("id"),
        "company": company,
        "title": title,
        "city": (job.get("city") or "未标注").strip(),
        "category": (job.get("category") or "未分类").strip(),
        "company_type": (job.get("companyType") or job.get("company_type") or "未分类").strip(),
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
        conn.execute(
            """
            UPDATE jobs
            SET company = ?, title = ?, city = ?, category = ?, company_type = ?,
                deadline = ?, source_url = ?, description = ?, requirements = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                job["company"],
                job["title"],
                job["city"],
                job["category"],
                job["company_type"],
                job["deadline"],
                job["source_url"],
                job["description"],
                requirements,
                now(),
                job_id,
            ),
        )
        return job_id

    conn.execute(
        """
        INSERT INTO jobs
        (company, title, city, category, company_type, deadline, source_url, description, requirements, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_url) DO UPDATE SET
            company = excluded.company,
            title = excluded.title,
            city = excluded.city,
            category = excluded.category,
            company_type = excluded.company_type,
            deadline = excluded.deadline,
            description = excluded.description,
            requirements = excluded.requirements,
            updated_at = excluded.updated_at
        """,
        (
            job["company"],
            job["title"],
            job["city"],
            job["category"],
            job["company_type"],
            job["deadline"],
            job["source_url"],
            job["description"],
            requirements,
            now(),
        ),
    )
    return conn.execute("SELECT id FROM jobs WHERE source_url = ?", (job["source_url"],)).fetchone()["id"]


def parse_jobs_csv(csv_text: str) -> list:
    text = csv_text.lstrip("\ufeff").strip()
    if not text:
        return []
    reader = csv.DictReader(io.StringIO(text))
    return [normalize_csv_row(row) for row in reader]


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
        "internships": format_list_items(resume.get("internships") or [], ["company", "position", "startDate", "endDate", "description"]),
        "projects": format_list_items(resume.get("projects") or [], ["name", "role", "startDate", "endDate", "description", "link"]),
        "awards": format_list_items(resume.get("awards") or [], ["type", "date", "description"]),
        "portfolios": format_list_items(resume.get("portfolios") or [], ["name", "link", "password"]),
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
        target = (PUBLIC_DIR / path.lstrip("/")).resolve()
        if not str(target).startswith(str(PUBLIC_DIR.resolve())) or not target.exists() or target.is_dir():
            target = PUBLIC_DIR / "index.html"

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

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
        self.wfile.write(data)

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
            elif method == "GET" and path == "/api/jobs":
                self.handle_jobs()
            elif method == "GET" and path == "/api/applications":
                self.handle_get_applications()
            elif method == "POST" and path == "/api/applications":
                self.handle_upsert_application()
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
            elif method == "POST" and path == "/api/admin/jobs":
                self.handle_admin_upsert_job()
            elif method == "POST" and path == "/api/admin/jobs/import-csv":
                self.handle_admin_import_jobs_csv()
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
            recent = conn.execute(
                "SELECT COUNT(*) AS count FROM email_verifications WHERE email = ? AND created_at > ?",
                (email_addr, now() - 60),
            ).fetchone()["count"]
            if recent >= 3:
                self.send_json(429, {"error": "too_many_requests"})
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
        if not EMAIL_RE.match(email_addr) or not re.match(r"^\d{6}$", code):
            self.send_json(400, {"error": "invalid_code"})
            return

        with connect_db() as conn:
            code_row = conn.execute(
                """
                SELECT * FROM email_verifications
                WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (email_addr, now()),
            ).fetchone()
            if not code_row or not hmac.compare_digest(code_row["code_hash"], hash_code(email_addr, code)):
                self.send_json(400, {"error": "invalid_code"})
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

        raw_text = extract_resume_text(file_name, mime_type, file_bytes)
        fallback = analyze_resume_text(raw_text) if len(raw_text) >= 20 else empty_resume()
        fallback["sourceFile"] = file_name

        parsed = parse_resume_with_external_api(
            {"fileName": file_name, "mimeType": mime_type, "base64": encoded},
            raw_text,
            fallback,
        )
        parsed["sourceFile"] = parsed.get("sourceFile") or file_name

        if not resume_has_content(parsed):
            message = "未从这个文件识别出可写入字段。请换可复制文本的 PDF/DOCX，或接入 OCR/专用解析服务后再解析扫描版文件。"
        elif len(raw_text) < 20:
            message = "已得到解析结果，但本地文本提取很少；请重点检查字段准确性。"
        else:
            message = "简历解析完成，请选择覆盖当前字段或只填空字段。"

        self.send_json(200, {"resume": parsed, "rawText": raw_text, "message": message})

    def handle_jobs(self) -> None:
        with connect_db() as conn:
            rows = conn.execute("SELECT * FROM jobs ORDER BY deadline ASC").fetchall()
        self.send_json(200, {"jobs": [row_to_job(row) for row in rows]})

    def handle_get_applications(self) -> None:
        user = self.require_user()
        if not user:
            return
        with connect_db() as conn:
            rows = conn.execute(
                """
                SELECT applications.*, jobs.company, jobs.title, jobs.city, jobs.deadline, jobs.category, jobs.company_type, jobs.source_url
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
                    "updatedAt": utc_string(row["updated_at"]),
                    "job": {
                        "company": row["company"],
                        "title": row["title"],
                        "city": row["city"],
                        "deadline": row["deadline"],
                        "category": row["category"],
                        "companyType": row["company_type"],
                        "sourceUrl": row["source_url"],
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
        status = body.get("status") or "saved"
        notes = body.get("notes") or ""
        if status not in STATUS_LABELS:
            self.send_json(400, {"error": "invalid_status"})
            return
        with connect_db() as conn:
            job = conn.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if not job:
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

    def handle_patch_application(self, path: str) -> None:
        user = self.require_user()
        if not user:
            return
        app_id = int(path.rsplit("/", 1)[-1])
        body = self.read_json()
        status = body.get("status")
        notes = body.get("notes")
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
                SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (status, notes, now(), app_id, user["id"]),
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
        answers = body.get("answers") or []
        if not answers:
            self.send_json(400, {"error": "answers_required"})
            return
        job = None
        with connect_db() as conn:
            if job_id:
                row = conn.execute("SELECT * FROM jobs WHERE id = ?", (int(job_id),)).fetchone()
                job = row_to_job(row) if row else None
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
            job_count = conn.execute("SELECT COUNT(*) AS count FROM jobs").fetchone()["count"]
            company_count = conn.execute("SELECT COUNT(DISTINCT company) AS count FROM jobs").fetchone()["count"]
            application_count = conn.execute("SELECT COUNT(*) AS count FROM applications").fetchone()["count"]
            interview_count = conn.execute("SELECT COUNT(*) AS count FROM interviews").fetchone()["count"]
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
                },
                "database": {
                    "bytes": db_bytes,
                    "updatedAt": utc_string(),
                },
                "jobsByCity": distribution(conn, "city"),
                "jobsByType": distribution(conn, "company_type"),
                "jobsByCategory": distribution(conn, "category"),
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
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), AppHandler)
    print(f"OfferOS running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
