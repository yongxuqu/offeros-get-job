# 阿里云学生机部署说明

目标配置：2 核 2G 学生 ECS 可以承载当前版本。当前服务是 Python 标准库 + SQLite + 静态前端，不需要 Node、Redis 或对象存储。AI、简历解析、语音转写都走外部 API。

## 1. 准备服务器

```bash
sudo dnf makecache
sudo dnf install -y python3.11 nginx sqlite
sudo mkdir -p /opt/offeros
sudo chown -R "$USER":"$USER" /opt/offeros
```

把项目文件上传到 `/opt/offeros`，然后创建环境变量文件：

```bash
cd /opt/offeros
python3.11 -m ensurepip --upgrade
python3.11 -m pip install -r requirements.txt
cp .env.example .env
nano .env
```

必须改这些值：

```text
APP_ENV=production
APP_SECRET=一串足够长的随机字符串
ADMIN_EMAILS=你的管理邮箱
SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM
AI_API_BASE/AI_API_KEY/AI_MODEL
AI_RESUME_MODEL/AI_INTERVIEW_MODEL/AI_FAST_MODEL/AI_OCR_MODEL
STT_API_URL/STT_API_KEY/STT_MODEL
```

可以先用个人 163 邮箱：

```text
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_USER=你的邮箱@163.com
SMTP_PASS=163 客户端授权码
MAIL_FROM="OfferOS <你的邮箱@163.com>"
```

`SMTP_PASS` 不要填邮箱登录密码。需要先在 163 网页邮箱开启 POP3/SMTP/IMAP，并生成客户端授权码。

`RESUME_PARSE_API_URL` 可选。没有专门解析 API 时，系统会先尝试本地提取 DOCX/PDF 文本，再用大模型做结构化。

配置完成后收紧权限，确保服务进程可以写 SQLite：

```bash
sudo chmod 600 /opt/offeros/.env
sudo chown -R nginx:nginx /opt/offeros
```

## 2. 配置进程守护

```bash
sudo cp deploy/offeros.service /etc/systemd/system/offeros.service
sudo systemctl daemon-reload
sudo systemctl enable --now offeros
sudo systemctl status offeros
```

服务默认监听 `127.0.0.1:8000`，由 Nginx 反代到公网。

## 3. 配置 Nginx

先把 `deploy/nginx.conf` 里的 `server_name` 改成你的域名：

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/offeros
sudo ln -s /etc/nginx/sites-available/offeros /etc/nginx/sites-enabled/offeros
sudo nginx -t
sudo systemctl reload nginx
```

国内服务器绑定域名通常需要备案。没有域名时，可以先用公网 IP 测试 HTTP。

## 4. 配 HTTPS

如果域名已解析并备案，可以用 Certbot 或阿里云免费证书。Certbot 示例：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

## 5. SQLite 备份

```bash
sudo chmod +x /opt/offeros/scripts/backup-sqlite.sh
sudo mkdir -p /opt/offeros/backups
```

编辑 root crontab：

```bash
sudo crontab -e
```

加入每天 03:20 备份：

```text
20 3 * * * APP_DIR=/opt/offeros BACKUP_DIR=/opt/offeros/backups /opt/offeros/scripts/backup-sqlite.sh
```

备份脚本保留最近 14 天。

## 6. 上线前检查

```bash
python3.11 -m py_compile server.py
curl -sS http://127.0.0.1:8000/api/system/status
sudo journalctl -u offeros -n 100 --no-pager
```

上线前不要提交真实 `.env`。官方邮箱、AI Key、STT Key 都只放服务器环境变量里。
