const App = {
  state: {
    user: null,
    view: "dashboard",
    resume: null,
    rawText: "",
    jobs: [],
    applications: [],
    interviews: [],
    adminStats: null,
    jobSubmissions: [],
    jobsMeta: { total: 0, limit: 120, offset: 0, returned: 0, hasMore: false },
    jobsPage: 1,
    jobsPerPage: 120,
    query: "",
    queryDraft: "",
    jobSuggestions: [],
    jobSuggestionsOpen: false,
    category: "all",
    city: "all",
    companyType: "all",
    batch: "27届秋招",
    jobSort: "match",
    selectedCompanyKey: "",
    systemStatus: null,
    pluginToken: "",
    importResult: null,
    syncResult: null,
    pendingParse: null,
    parseProgress: null,
    manualJobModalOpen: false,
    applicationTitleModal: null,
    assessmentDeadlineModal: null,
    adminSubmissionDetailId: null,
    interview: null,
    recording: false,
    error: "",
    notice: "",
    toast: null,
    legalModal: null,
    legalAccepted: false,
  },
  parseTimer: null,
  toastTimer: null,
  jobSearchTimer: null,
  jobSuggestionTimer: null,
  jobRequestId: 0,
  jobSuggestionRequestId: 0,
  composingQuery: false,
  matchCache: new Map(),
  matchContext: null,
  matchContextSignature: "",

  async init() {
    try {
      const me = await this.api("/api/me");
      this.state.user = me.user;
      await this.loadData();
      this.render();
    } catch {
      this.renderAuth();
    }
  },

  async api(path, options = {}) {
    const res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this.formatApiError(data.error || "request_failed", res.status, data));
    }
    return data;
  },

  formatApiError(error, status = 0, data = {}) {
    if (status === 504 || error === "request_failed_504") {
      return "服务器解析超时，请稍后重试，或换一份可复制文本的 PDF/DOCX。";
    }
    if (status === 413 || error === "file_too_large") {
      return "文件太大，单份简历请控制在 8MB 内。";
    }
    if (error === "request_timeout") {
      return "请求超时，请稍后重试。";
    }
    if (error === "network_error") {
      return "网络连接失败，请检查当前访问地址是否能连到后端。";
    }
    const labels = {
      not_authenticated: "登录状态已失效，请重新登录。",
      invalid_email: "请输入正确的邮箱地址。",
      invalid_code: data.attemptsRemaining ? `验证码不正确，还可尝试 ${data.attemptsRemaining} 次。` : "验证码不正确。",
      code_not_requested: "请先发送验证码。",
      code_expired: "验证码已过期，请重新发送。",
      too_many_requests: data.retryAfter ? `请求太频繁，请 ${Math.ceil(data.retryAfter / 60)} 分钟后再试。` : "请求太频繁，请稍后再试。",
      too_many_attempts: data.retryAfter ? `验证码错误次数过多，请 ${Math.ceil(data.retryAfter / 60)} 分钟后再试。` : "验证码错误次数过多，请稍后再试。",
      email_send_failed: "验证码邮件发送失败，请稍后再试。",
      smtp_not_configured: "验证码邮件服务未配置。",
      invalid_file_data: "文件读取失败，请重新选择文件。",
      file_required: "请先选择一份简历文件。",
      job_requires_company_title_url: "请填写公司、岗位名称和官方链接。",
      invalid_job_url: "请填写有效的公网官方链接，不能使用 localhost、内网地址或无效域名。",
      invalid_deadline: "截止时间格式不正确，请使用 2026-08-21 18:00 这样的格式。",
      invalid_review_action: "审核操作无效。",
      submission_not_found: "这条提交记录不存在。",
      accepted_terms_required: "请先同意《用户协议》和《隐私政策》。",
      server_error: "服务器处理失败，请稍后重试。",
    };
    return labels[error] || error || "请求失败";
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  async loadData() {
    const status = await this.api("/api/system/status");
    this.state.systemStatus = status;
    await this.loadJobs(true);

    if (status.admin) {
      const [stats, submissions] = await Promise.all([
        this.api("/api/admin/stats"),
        this.api("/api/admin/job-submissions"),
      ]);
      this.state.adminStats = stats.stats;
      this.state.jobSubmissions = submissions.submissions || [];
      this.state.resume = null;
      this.state.rawText = "";
      this.state.applications = [];
      this.state.interviews = [];
      if (!["admin", "adminStats", "settings"].includes(this.state.view)) {
        this.state.view = "admin";
      }
      return;
    }

    const [resume, applications, interviews] = await Promise.all([
      this.api("/api/resume"),
      this.api("/api/applications"),
      this.api("/api/interviews"),
    ]);
    this.state.resume = resume.resume;
    this.state.rawText = resume.rawText || "";
    this.state.applications = applications.applications;
    this.state.interviews = interviews.interviews;
    this.state.adminStats = null;
  },

  async loadJobs(reset = true) {
    const requestId = ++this.jobRequestId;
    const limit = this.state.jobsPerPage || 120;
    const page = Math.max(1, Number(this.state.jobsPage) || 1);
    const offset = (page - 1) * limit;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      batch: this.state.batch,
      sort: this.state.jobSort,
    });
    if (this.state.city !== "all") params.set("city", this.state.city);
    if (this.state.companyType !== "all") params.set("companyType", this.state.companyType);
    if (this.state.query.trim()) params.set("q", this.state.query.trim());
    const data = await this.api(`/api/jobs?${params.toString()}`);
    if (requestId !== this.jobRequestId) return false;
    this.state.jobs = data.jobs || [];
    this.state.jobsMeta = data.meta || {
      total: this.state.jobs.length,
      limit,
      offset,
      returned: this.state.jobs.length,
      hasMore: false,
    };
    return true;
  },

  async reloadJobs() {
    try {
      if (await this.loadJobs(true)) {
        if (!this.composingQuery) this.render();
      }
    } catch (error) {
      this.setError(`岗位加载失败：${error.message}`);
      if (!this.composingQuery) this.render();
    }
  },

  async loadMoreJobs() {
    this.goJobsPage((this.state.jobsPage || 1) + 1);
  },

  escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },

  appEl() {
    return document.querySelector("#app");
  },

  renderAuth(message = "") {
    this.appEl().innerHTML = `
      <main class="auth-shell">
        <section class="auth-brief">
          <div>
            <div class="brand-mark"><span class="brand-dot"></span><span>OfferOS</span></div>
            <h1>把求职流程从混乱列表，变成一张可执行的工作台。</h1>
            <p>集中管理简历结构化、能力画像、岗位匹配、投递进程和语音面试报告。</p>
          </div>
          <div class="auth-stack">
            <div><strong>简历一次维护</strong><span>结构化简历字段可复用于岗位匹配、网申填表和面试训练。</span></div>
            <div><strong>岗位自动匹配</strong><span>根据能力标签解释为什么匹配，也提示缺口和补强方向。</span></div>
            <div><strong>进程持续可见</strong><span>准备投递、笔试、面试和 Offer 状态集中管理。</span></div>
          </div>
        </section>
        <section class="auth-card">
          <h2>邮箱验证码登录</h2>
          <p>只支持邮箱登录。验证码会发送到你的邮箱，不在页面展示。</p>
          <div class="form-row">
            <label>邮箱</label>
            <input id="email" placeholder="name@example.com" autocomplete="email" />
          </div>
          <div class="toolbar" style="margin-top: 14px;">
            <button class="btn primary" onclick="App.sendCode()">发送验证码</button>
          </div>
          <div class="form-row">
            <label>验证码</label>
            <input id="code" placeholder="6 位数字" inputmode="numeric" />
          </div>
          <div class="legal-consent">
            <input type="checkbox" id="legal-consent" ${this.state.legalAccepted ? "checked" : ""} onchange="App.syncLegalConsent(this)" />
            <span>
              我已阅读并同意
              <button type="button" class="text-link" onclick="App.openLegalDoc('terms')">《用户协议》</button>
              和
              <button type="button" class="text-link" onclick="App.openLegalDoc('privacy')">《隐私政策》</button>
            </span>
          </div>
          <div class="toolbar" style="margin-top: 14px;">
            <button class="btn primary" onclick="App.verifyCode()">进入工作台</button>
          </div>
          ${message ? `<div class="notice">${this.escape(message)}</div>` : ""}
          <div id="auth-feedback"></div>
        </section>
      </main>
      ${this.renderLegalModal()}
    `;
  },

  authFeedback(html, type = "notice") {
    const el = document.querySelector("#auth-feedback");
    if (el) el.innerHTML = `<div class="${type}">${html}</div>`;
  },

  async sendCode() {
    const email = document.querySelector("#email").value.trim();
    if (!this.hasAcceptedLegalTerms()) {
      this.authFeedback("请先勾选同意《用户协议》和《隐私政策》。", "error");
      return;
    }
    try {
      await this.api("/api/auth/send-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      this.authFeedback("验证码已发送，请查看邮箱。");
    } catch (error) {
      this.authFeedback(`发送失败：${this.escape(error.message)}`, "error");
    }
  },

  async verifyCode() {
    const email = document.querySelector("#email").value.trim();
    const code = document.querySelector("#code").value.trim();
    if (!this.hasAcceptedLegalTerms()) {
      this.authFeedback("请先勾选同意《用户协议》和《隐私政策》。", "error");
      return;
    }
    try {
      const data = await this.api("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email, code, acceptedTerms: true }),
      });
      this.state.user = data.user;
      await this.loadData();
      this.render();
    } catch (error) {
      this.authFeedback(`验证失败：${this.escape(error.message)}`, "error");
    }
  },

  async logout() {
    await this.api("/api/auth/logout", { method: "POST", body: "{}" });
    this.state.user = null;
    this.renderAuth();
  },

  nav(view) {
    if (this.state.view === view) return;
    this.state.view = view;
    this.state.notice = "";
    this.state.error = "";
    this.render();
  },

  render() {
    const active = this.captureActiveElement();
    if (!this.state.user) {
      this.renderAuth();
      return;
    }
    this.prepareMatchContext();
    const isAdmin = Boolean(this.state.systemStatus?.admin);
    const navItems = isAdmin
      ? [
          ["admin", "招聘管理"],
          ["adminStats", "数据统计"],
          ["settings", "设置"],
        ]
      : [
          ["dashboard", "工作台"],
          ["resume", "简历"],
          ["jobs", "岗位"],
          ["applications", "投递"],
          ["interview", "面试"],
          ["plugin", "插件"],
          ["settings", "设置"],
        ];
    const allowedViews = new Set(navItems.map(([id]) => id));
    if (!allowedViews.has(this.state.view)) {
      this.state.view = navItems[0][0];
    }
    this.appEl().innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand-mark"><span class="brand-dot"></span><span>OfferOS</span></div>
          <nav class="nav">
            ${navItems
              .map(([id, label]) => `<button class="${this.state.view === id ? "active" : ""}" onclick="App.nav('${id}')">${label}</button>`)
              .join("")}
          </nav>
          <div class="sidebar-foot">
            ${
              isAdmin
                ? `<div>后台管理</div><div>岗位库 / 用户统计 / 系统状态</div>`
                : ""
            }
          </div>
        </aside>
        <main class="main">
          <div class="topbar">
            <div class="user-pill"><span class="brand-dot"></span>${this.escape(this.state.user.email)}</div>
            <button class="btn small" onclick="App.logout()">退出</button>
          </div>
          ${this.renderView()}
        </main>
      </div>
      ${this.renderToast()}
      ${this.renderParseModal()}
      ${this.renderManualJobModal()}
      ${this.renderApplicationTitleModal()}
      ${this.renderAssessmentDeadlineModal()}
      ${this.renderJobSubmissionDetailModal()}
      ${this.renderLegalModal()}
    `;
    this.restoreActiveElement(active);
  },

  syncLegalConsent(input) {
    this.state.legalAccepted = Boolean(input?.checked);
  },

  hasAcceptedLegalTerms() {
    const input = document.querySelector("#legal-consent");
    if (input) this.state.legalAccepted = Boolean(input.checked);
    return Boolean(this.state.legalAccepted);
  },

  legalDocument(type) {
    const docs = {
      terms: {
        title: "用户协议",
        updatedAt: "2026-08-20",
        sections: [
          ["服务范围", "OfferOS 提供简历结构化、岗位信息聚合、投递进程管理、插件填表辅助和 AI 面试报告等工具能力。岗位信息来自公开招聘页面、在线表格或后台录入，平台会尽量清洗和去重，但不承诺信息完整、实时或绝对准确。"],
          ["账号使用", "当前仅支持邮箱验证码登录。你需要对自己的账号使用行为负责，不得批量抓取、攻击服务、绕过权限或上传违法、侵权、虚假内容。"],
          ["求职行为", "平台展示的岗位入口仅作为求职辅助。是否投递、填写何种内容、是否参加测评或面试，由你自行判断和承担结果。"],
          ["AI 输出", "简历解析、能力标签和面试报告由程序和第三方模型辅助生成，可能存在遗漏或误判。正式提交前请自行核对所有字段。"],
          ["服务变更", "MVP 阶段功能可能调整、下线或出现短时不可用。我们会尽量保持数据可用和服务稳定，但不对间接损失承担责任。"],
        ],
      },
      privacy: {
        title: "隐私政策",
        updatedAt: "2026-08-20",
        sections: [
          ["我们收集什么", "为提供服务，我们会保存邮箱账号、结构化简历、岗位准备投递和投递状态、AI 面试报告、插件连接令牌以及必要的系统日志。语音面试不保存音视频原件，只保存转写后用于报告生成的结果和报告摘要。"],
          ["如何使用数据", "这些数据用于登录验证、简历解析、岗位匹配、投递看板、面试反馈、插件填表预览和基础运营统计。我们不会把你的简历公开展示给其他普通用户。"],
          ["第三方服务", "邮箱验证码会通过已配置的发信邮箱服务发送；简历解析、OCR、语音转文字和面试报告可能调用第三方 AI/API 服务。调用时会传入完成任务所需的最少内容。"],
          ["数据保存", "账号、简历、投递记录和报告会保存在服务端数据库中，便于你下次继续使用。系统会做数据库备份，备份仅用于故障恢复。"],
          ["你的选择", "你可以在设置页导出自己的数据；如需删除账号或相关数据，可联系平台维护者处理。"],
        ],
      },
    };
    return docs[type] || docs.privacy;
  },

  openLegalDoc(type) {
    this.state.legalModal = type;
    this.render();
  },

  closeLegalDoc() {
    this.state.legalModal = null;
    this.render();
  },

  renderLegalModal() {
    if (!this.state.legalModal) return "";
    const doc = this.legalDocument(this.state.legalModal);
    return `
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <section class="legal-modal">
          <div class="modal-head">
            <span class="modal-indicator ok"></span>
            <div>
              <h3>${this.escape(doc.title)}</h3>
              <p>更新日期：${this.escape(doc.updatedAt)}</p>
            </div>
          </div>
          <div class="legal-doc">
            ${doc.sections
              .map(([heading, body]) => `
                <section>
                  <h4>${this.escape(heading)}</h4>
                  <p>${this.escape(body)}</p>
                </section>
              `)
              .join("")}
          </div>
          <div class="toolbar legal-actions">
            <button class="btn primary" onclick="App.closeLegalDoc()">知道了</button>
          </div>
        </section>
      </div>
    `;
  },

  captureActiveElement() {
    const element = document.activeElement;
    if (!element || !element.id || !this.appEl()?.contains(element)) {
      return null;
    }
    const snapshot = { id: element.id };
    try {
      snapshot.start = element.selectionStart;
      snapshot.end = element.selectionEnd;
    } catch {
      snapshot.start = null;
      snapshot.end = null;
    }
    return snapshot;
  },

  restoreActiveElement(snapshot) {
    if (!snapshot?.id) return;
    requestAnimationFrame(() => {
      const element = document.getElementById(snapshot.id);
      if (!element) return;
      element.focus({ preventScroll: true });
      if (snapshot.start !== null && typeof element.setSelectionRange === "function") {
        try {
          element.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
        } catch {
          // Some controls, such as date inputs, do not support text ranges.
        }
      }
    });
  },

  setNotice(message) {
    this.showToast(message, "notice");
  },

  setError(message) {
    this.showToast(message, "error");
  },

  showToast(message, type = "notice") {
    if (!message) return;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.state.notice = "";
    this.state.error = "";
    this.state.toast = {
      id: Date.now(),
      type,
      message,
    };
    this.toastTimer = setTimeout(() => {
      this.state.toast = null;
      this.render();
    }, 3200);
  },

  renderToast() {
    const toast = this.state.toast;
    if (!toast) return "";
    return `
      <div class="toast ${toast.type}">
        <span class="toast-dot"></span>
        <strong>${this.escape(toast.message)}</strong>
        <button aria-label="关闭提示" onclick="App.closeToast()">×</button>
      </div>
    `;
  },

  closeToast() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.state.toast = null;
    this.render();
  },

  renderView() {
    const views = {
      dashboard: () => this.renderDashboard(),
      resume: () => this.renderResume(),
      jobs: () => this.renderJobs(),
      applications: () => this.renderApplications(),
      interview: () => this.renderInterview(),
      plugin: () => this.renderPlugin(),
      admin: () => this.renderAdmin(),
      adminStats: () => this.renderAdminStats(),
      settings: () => this.renderSettings(),
    };
    return (views[this.state.view] || views.dashboard)();
  },

  prepareMatchContext() {
    const tags = this.resumeTags();
    const resumeText = this.resumeMatchText();
    const signature = `${resumeText.length}:${resumeText.slice(0, 160)}:${tags.map((tag) => `${tag.name}:${tag.confidence}`).join("|")}`;
    if (signature !== this.matchContextSignature) {
      this.matchCache = new Map();
      this.matchContextSignature = signature;
    }
    this.matchContext = { tags, resumeText };
  },

  resumeTags() {
    return this.normalizeAbilityTags(this.state.resume?.abilityTags || []);
  },

  normalizeAbilityTags(tags) {
    return (tags || [])
      .map((tag, index) => {
        const item = typeof tag === "string" ? { name: tag } : tag || {};
        const confidence = this.normalizeConfidence(item.confidence, index);
        return { ...item, name: String(item.name || "").trim(), confidence };
      })
      .filter((tag) => tag.name);
  },

  normalizeConfidence(value, index = 0) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) {
      return Math.max(0.01, Math.min(0.99, number > 1 ? number / 100 : number));
    }
    return Math.max(0.58, 0.82 - index * 0.04);
  },

  tagNames() {
    return this.resumeTags().map((tag) => tag.name);
  },

  flattenText(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap((item) => this.flattenText(item));
    if (typeof value === "object") return Object.values(value).flatMap((item) => this.flattenText(item));
    return [String(value)];
  },

  normalizeMatchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "");
  },

  resumeMatchText() {
    const resume = this.normalizeResume(this.state.resume);
    return this.normalizeMatchText([
      this.state.rawText || "",
      resume.summary || "",
      resume.selfDescription || "",
      ...(resume.gaps || []),
      ...this.flattenText(resume.profile),
      ...this.flattenText(resume.education),
      ...this.flattenText(resume.internships),
      ...this.flattenText(resume.projects),
      ...this.flattenText(resume.awards),
      ...this.flattenText(resume.portfolios),
      ...this.resumeTags().map((tag) => tag.name),
    ].join(" "));
  },

  matchVariants(value) {
    const term = this.normalizeMatchText(value);
    const aliases = {
      python: ["python"],
      java: ["java"],
      javascript: ["javascript", "js", "前端", "web"],
      typescript: ["typescript", "ts", "前端", "web"],
      sql: ["sql", "mysql", "postgresql", "数据库", "数据分析"],
      数据分析: ["数据分析", "数据", "分析", "可视化", "sql", "excel", "spss"],
      后端开发: ["后端", "服务端", "api", "接口", "数据库", "python", "java"],
      前端开发: ["前端", "web", "javascript", "typescript", "react", "vue", "小程序", "移动端"],
      移动端开发: ["移动端", "app", "ios", "android", "小程序", "xcode", "swift", "flutter", "前端"],
      ai工具应用: ["ai", "人工智能", "大模型", "llm", "aigc", "prompt", "提示词", "智能体", "claude", "qwen", "豆包"],
      机器学习: ["机器学习", "深度学习", "ai", "算法", "模型"],
      产品设计: ["产品", "产品设计", "需求", "prd", "原型", "用户调研", "竞品", "产品思维"],
      项目管理: ["项目管理", "项目推进", "协作", "沟通", "产品思维"],
      项目管理与产品思维: ["项目管理", "项目推进", "产品", "需求", "prd", "产品思维", "协作"],
      技术: ["技术", "开发", "工程", "python", "java", "前端", "后端", "移动端", "ai", "算法"],
      uiux设计: ["ui", "ux", "uiux", "交互", "视觉", "figma", "原型", "用户体验", "设计"],
      "ui/ux": ["ui", "ux", "uiux", "交互", "视觉", "figma", "原型", "用户体验", "设计"],
      "ui/ux设计": ["ui", "ux", "uiux", "交互", "视觉", "figma", "原型", "用户体验", "设计"],
      新媒体运营: ["新媒体", "运营", "内容运营", "视频", "剪辑", "活动", "社群"],
      视频剪辑与新媒体运营: ["新媒体", "运营", "内容运营", "视频", "剪辑", "活动", "社群"],
      运营: ["运营", "内容运营", "新媒体", "活动", "社群", "增长", "用户"],
      设计: ["设计", "ui", "ux", "figma", "原型", "视觉", "交互"],
      有机合成实验: ["有机合成", "实验", "化学", "材料化学", "高分子", "研发"],
      化学: ["化学", "材料化学", "高分子", "有机合成", "实验", "研发"],
      供应链: ["供应链", "采购", "物流", "计划", "交付"],
      财务分析: ["财务", "金融", "会计", "分析", "报表"],
      市场营销: ["市场", "营销", "品牌", "增长", "用户"],
    };
    const values = new Set([term]);
    Object.entries(aliases).forEach(([key, variants]) => {
      const normalizedKey = this.normalizeMatchText(key);
      const normalizedVariants = variants.map((item) => this.normalizeMatchText(item));
      if (term === normalizedKey || normalizedVariants.includes(term)) {
        normalizedVariants.forEach((item) => values.add(item));
        values.add(normalizedKey);
      }
    });
    return [...values].filter(Boolean);
  },

  variantsOverlap(left, right) {
    const leftVariants = this.matchVariants(left);
    const rightVariants = this.matchVariants(right);
    return leftVariants.some((a) =>
      rightVariants.some((b) => a === b || (a.length >= 2 && b.includes(a)) || (b.length >= 2 && a.includes(b)))
    );
  },

  requirementMatchScore(requirement, resumeText, tags) {
    let best = 0;
    tags.forEach((tag) => {
      if (this.variantsOverlap(tag.name, requirement)) {
        best = Math.max(best, tag.confidence || 0.72);
      }
    });
    const variants = this.matchVariants(requirement);
    if (variants.some((item) => item && resumeText.includes(item))) {
      best = Math.max(best, 0.68);
    }
    return Math.min(0.98, best);
  },

  matchJob(job) {
    const cacheKey = job?.id || `${job?.company || ""}-${job?.sourceUrl || ""}`;
    if (cacheKey && this.matchCache?.has(cacheKey)) {
      return this.matchCache.get(cacheKey);
    }
    const requirements = job.requirements || [];
    const tags = this.matchContext?.tags || this.resumeTags();
    const resumeText = this.matchContext?.resumeText || this.resumeMatchText();
    const hasResumeSignal = tags.length > 0 || resumeText.length > 20;
    const scored = requirements.map((item) => ({
      item,
      score: this.requirementMatchScore(item, resumeText, tags),
    }));
    const hits = scored.filter((item) => item.score >= 0.5).map((item) => item.item);
    const missing = scored.filter((item) => item.score < 0.42).map((item) => item.item);
    const average = scored.length
      ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length
      : 0;
    const categoryBonus = this.matchVariants(job.category).some((item) => resumeText.includes(item)) ? 0.08 : 0;
    const titleBonus = this.matchVariants(job.title).some((item) => resumeText.includes(item)) ? 0.05 : 0;
    const score = hasResumeSignal
      ? Math.max(36, Math.min(96, Math.round(38 + (average + categoryBonus + titleBonus) * 58 + Math.min(hits.length, 4) * 2)))
      : 42;
    const result = {
      score,
      hits,
      missing,
      reason: hits.length
        ? `匹配 ${hits.join("、")}。`
        : "简历能力标签还不够明确，建议先完善项目和技能。",
    };
    if (cacheKey) this.matchCache.set(cacheKey, result);
    return result;
  },

  suggestedResumeRoles() {
    const resumeText = this.resumeMatchText();
    const tags = this.resumeTags();
    const hasSignal = tags.length > 0 || resumeText.length > 20;
    const catalog = [
      ["产品经理", ["产品", "需求", "prd", "原型", "用户研究", "数据分析", "项目管理"]],
      ["后端开发工程师", ["后端开发", "java", "python", "api", "数据库", "linux", "服务端"]],
      ["前端开发工程师", ["前端开发", "react", "vue", "typescript", "javascript", "ui/ux"]],
      ["数据分析师", ["数据分析", "sql", "python", "报表", "可视化", "tableau"]],
      ["算法工程师", ["算法", "机器学习", "深度学习", "pytorch", "模型", "ai"]],
      ["测试工程师", ["测试", "自动化", "质量", "python", "bug"]],
      ["UI/UX 设计师", ["ui/ux", "设计", "figma", "原型", "交互", "用户体验"]],
      ["新媒体运营", ["新媒体运营", "运营", "内容", "视频剪辑", "活动策划", "社群"]],
      ["市场营销", ["市场营销", "市场", "营销", "品牌", "市场调研", "渠道"]],
      ["供应链专员", ["供应链", "物流", "采购", "计划", "交付"]],
      ["财务分析师", ["财务分析", "财务", "金融", "会计", "报表"]],
      ["项目助理", ["项目管理", "沟通协作", "推进", "组织", "表达汇报"]],
      ["秘书/行政助理", ["秘书", "行政", "文书", "沟通协作", "表达汇报", "组织"]],
      ["银行管培生", ["银行", "金融", "数据分析", "沟通协作", "财务分析"]],
      ["化工研发工程师", ["化学", "材料化学", "有机合成实验", "实验", "研发"]],
    ];
    const defaults = ["产品经理", "开发工程师", "数据分析师", "运营专员", "项目助理"];
    if (!hasSignal) return defaults;
    return catalog
      .map(([role, keywords], index) => {
        const scores = keywords.map((keyword) => this.requirementMatchScore(keyword, resumeText, tags));
        const best = Math.max(...scores, 0);
        const total = scores.reduce((sum, value) => sum + value, 0);
        return { role, score: best * 0.7 + Math.min(1, total / Math.max(2, keywords.length)) * 0.3, index };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.role)
      .slice(0, 5);
  },

  completion() {
    if (!this.state.resume) return 0;
    const profile = this.state.resume.profile || {};
    const fields = ["name", "gender", "countryRegion", "idType", "idNumber", "phoneType", "phone", "email", "currentLocation"];
    const filled = fields.filter((key) => profile[key]).length;
    const tags = this.resumeTags().length > 0 ? 1 : 0;
    return Math.round(((filled + tags) / (fields.length + 1)) * 100);
  },

  renderDashboard() {
    const completion = this.completion();
    const apps = this.state.applications;
    const recommended = [...this.state.jobs].sort((a, b) => this.matchJob(b).score - this.matchJob(a).score).slice(0, 3);
    const dueSoon = this.state.jobs.filter((job) => new Date(job.deadline) - new Date() < 1000 * 60 * 60 * 24 * 14).slice(0, 4);
    const jobTotal = this.state.jobsMeta?.total || this.state.jobs.length;
    return `
      <section class="section-title">
        <div>
          <h2>今日工作台</h2>
          <p>先把简历、岗位、投递和面试串成一条线。</p>
        </div>
        <button class="btn primary" onclick="App.nav('resume')">完善简历</button>
      </section>
      <section class="grid cols-4">
        <div class="metric"><span>简历完整度</span><strong>${completion}%</strong></div>
        <div class="metric"><span>可匹配岗位</span><strong>${jobTotal}</strong></div>
        <div class="metric"><span>投递记录</span><strong>${apps.length}</strong></div>
        <div class="metric"><span>面试报告</span><strong>${this.state.interviews.length}</strong></div>
      </section>
      <div class="split" style="margin-top: 14px;">
        <section class="panel">
          <div class="section-title">
            <div>
              <h2>推荐岗位</h2>
              <p>按你的能力画像计算，点击可加入投递看板。</p>
            </div>
            <button class="btn small" onclick="App.nav('jobs')">查看全部</button>
          </div>
          <div class="grid">${recommended.map((job) => this.jobCard(job, true)).join("")}</div>
        </section>
        <aside class="panel">
          <h2 style="margin-top: 0;">待处理</h2>
          <div class="list">
            ${dueSoon
              .map((job) => `<div class="list-item"><strong>${this.escape(job.company)} ${this.escape(job.title)}</strong><div class="muted">截止 ${this.escape(job.deadline)} · ${this.escape(job.city)}</div></div>`)
              .join("")}
            ${dueSoon.length === 0 ? `<div class="empty">暂无 14 天内截止岗位。</div>` : ""}
          </div>
        </aside>
      </div>
    `;
  },

  renderResume() {
    const resume = this.normalizeResume(this.state.resume);
    const profile = resume.profile;
    const tags = this.resumeTags();
    const roleSuggestions = this.suggestedResumeRoles();
    return `
      <section class="section-title">
        <div>
          <h2>简历与能力画像</h2>
          <p>上传 PDF/Word 简历后自动解析填入字段，再手动确认。</p>
        </div>
        <button class="btn primary" onclick="App.saveResume()">保存简历</button>
      </section>
      <div class="split">
        <section class="panel">
          <div class="upload-zone">
            <div>
              <strong>上传简历解析</strong>
              <span>${this.escape(resume.sourceFile || "支持 PDF、DOCX、DOC；解析后可选择写入方式。")}</span>
            </div>
            <label class="btn primary">
              选择文件
              <input type="file" id="resume-file" onchange="App.parseResumeFile(this)" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/png,image/jpeg" hidden />
            </label>
          </div>
          <div class="resume-block">
            <h3>基础信息</h3>
            <div class="resume-form">
              <div class="form-row wide">
                <label>照片</label>
                <div class="photo-row">
                  ${profile.photoData ? `<img class="photo-preview" src="${profile.photoData}" alt="简历照片" />` : `<div class="photo-placeholder">照片</div>`}
                  <div>
                    <input type="file" id="profile-photo" onchange="App.readPhoto(this)" accept="image/*" />
                    <div class="muted">${this.escape(profile.photoName || "可选，建议小于 500KB。")}</div>
                  </div>
                </div>
              </div>
              ${this.textField("profile-name", "姓名", profile.name)}
              ${this.selectField("profile-gender", "性别", profile.gender, ["", "男", "女", "其他", "不透露"])}
              ${this.textField("profile-countryRegion", "国家/地区", profile.countryRegion)}
              ${this.selectField("profile-idType", "证件号码类型", profile.idType, ["", "居民身份证", "护照", "港澳居民来往内地通行证", "台湾居民来往大陆通行证", "其他"])}
              ${this.textField("profile-idNumber", "证件号", profile.idNumber)}
              ${this.selectField("profile-phoneType", "手机号码类型", profile.phoneType, ["中国大陆", "中国香港", "中国澳门", "中国台湾", "海外"])}
              ${this.textField("profile-phone", "手机号", profile.phone)}
              ${this.textField("profile-email", "邮箱", profile.email || this.state.user.email, "email")}
              ${this.textField("profile-currentLocation", "当前所处地", profile.currentLocation)}
              ${this.textField("profile-wechat", "微信号", profile.wechat)}
              ${this.textField("profile-qq", "QQ 号", profile.qq)}
              ${this.textField("profile-emergencyContact", "紧急联系人", profile.emergencyContact)}
              ${this.textField("profile-emergencyPhone", "紧急联系人电话", profile.emergencyPhone)}
            </div>
          </div>

          ${this.renderEducation(resume.education)}
          ${this.renderInternships(resume.internships)}
          ${this.renderProjects(resume.projects)}
          ${this.renderAwards(resume.awards)}
          ${this.renderPortfolios(resume.portfolios)}

          <div class="resume-block">
            <h3>自我描述</h3>
            ${this.textareaField("self-description", "自我描述", resume.selfDescription)}
          </div>

          <div class="resume-block">
            <h3>资料证明人</h3>
            <div class="resume-form">
              ${this.textField("verifier-name", "以上资料证明人", resume.verifier.name)}
              ${this.textField("verifier-identity", "证明人身份", resume.verifier.identity)}
              ${this.textField("verifier-phone", "联系电话", resume.verifier.phone)}
            </div>
          </div>

          <div class="resume-form">
          </div>
          <div class="toolbar" style="margin-top: 14px;">
            <button class="btn primary" onclick="App.saveResume()">保存简历</button>
          </div>
        </section>
        <aside class="panel">
          <h2 style="margin-top: 0;">能力画像</h2>
          <p class="muted">${this.escape(this.state.resume?.summary || "解析简历后会在这里显示能力总结。")}</p>
          <div class="chips">
            ${tags.map((tag) => `<span class="chip green">${this.escape(tag.name)} ${Math.round(tag.confidence * 100)}%</span>`).join("")}
          </div>
          <div class="list">
            ${(this.state.resume?.gaps || []).map((gap) => `<div class="list-item">${this.escape(gap)}</div>`).join("")}
            ${tags.length === 0 ? `<div class="empty">暂无能力标签。</div>` : ""}
          </div>
          <div class="role-suggestions">
            <h3>适合的岗位</h3>
            <div class="chips">
              ${roleSuggestions.map((role) => `<span class="chip amber">${this.escape(role)}</span>`).join("")}
            </div>
          </div>
        </aside>
      </div>
    `;
  },

  normalizeResume(resume) {
    const base = {
      profile: {
        photoName: "",
        photoData: "",
        name: "",
        gender: "",
        countryRegion: "中国",
        idType: "",
        idNumber: "",
        phoneType: "中国大陆",
        phone: "",
        email: this.state.user?.email || "",
        currentLocation: "",
        wechat: "",
        qq: "",
        emergencyContact: "",
        emergencyPhone: "",
      },
      education: [
        { degree: "", schoolName: "", studyLocation: "", startDate: "", endDate: "", college: "", major: "", rank: "", gpa: "", gpaBase: "" },
      ],
      internships: [],
      projects: [],
      awards: [],
      portfolios: [],
      selfDescription: "",
      verifier: { name: "", identity: "", phone: "" },
      abilityTags: [],
      summary: "",
      gaps: [],
      sourceFile: "",
    };
    const merged = { ...base, ...(resume || {}) };
    merged.profile = { ...base.profile, ...(resume?.profile || {}) };
    merged.education = resume?.education?.length ? resume.education : base.education;
    merged.internships = resume?.internships || [];
    merged.projects = resume?.projects || [];
    merged.awards = resume?.awards || [];
    merged.portfolios = resume?.portfolios || [];
    merged.verifier = { ...base.verifier, ...(resume?.verifier || {}) };
    merged.abilityTags = this.normalizeAbilityTags(resume?.abilityTags || []);
    return merged;
  },

  textField(id, label, value, type = "text", placeholder = "") {
    const dateAttrs = type === "date" ? `onclick="App.openDatePicker(this)" onfocus="App.openDatePicker(this)"` : "";
    return `
      <div class="form-row">
        <label>${label}</label>
        <input id="${id}" type="${type}" value="${this.escape(value || "")}" placeholder="${this.escape(placeholder)}" ${dateAttrs} />
      </div>
    `;
  },

  openDatePicker(input) {
    try {
      if (input?.showPicker) input.showPicker();
    } catch {
      // Some browsers only allow showPicker during direct pointer activation.
    }
  },

  selectField(id, label, value, options) {
    return `
      <div class="form-row">
        <label>${label}</label>
        <select id="${id}">
          ${options.map((option) => `<option value="${this.escape(option)}" ${value === option ? "selected" : ""}>${this.escape(option || "请选择")}</option>`).join("")}
        </select>
      </div>
    `;
  },

  textareaField(id, label, value) {
    return `
      <div class="form-row wide">
        <label>${label}</label>
        <textarea id="${id}">${this.escape(value || "")}</textarea>
      </div>
    `;
  },

  renderEducation(items) {
    return `
      <div class="resume-block">
        <div class="block-head"><h3>教育经历</h3><button class="btn small" onclick="App.addResumeItem('education')">添加</button></div>
        ${items.map((item, index) => `
          <div class="repeat-card">
            <div class="repeat-head"><strong>教育经历 ${index + 1}</strong><button class="btn small danger" onclick="App.removeResumeItem('education', ${index})">删除</button></div>
            <div class="resume-form">
              ${this.selectField(`education-${index}-degree`, "学历", item.degree, ["", "本科", "硕士", "博士", "大专", "其他"])}
              ${this.textField(`education-${index}-schoolName`, "学校名称", item.schoolName)}
              ${this.textField(`education-${index}-studyLocation`, "目前就读地", item.studyLocation)}
              ${this.textField(`education-${index}-startDate`, "开始时间", item.startDate, "date")}
              ${this.textField(`education-${index}-endDate`, "结束时间", item.endDate, "date")}
              ${this.textField(`education-${index}-college`, "院系", item.college)}
              ${this.textField(`education-${index}-major`, "专业", item.major)}
              ${this.selectField(`education-${index}-rank`, "成绩排名", item.rank, ["", "前5%", "前10%", "前20%", "前30%", "前50%", "其他"])}
              ${this.textField(`education-${index}-gpa`, "GPA", item.gpa, "text", "例如 3.7")}
              ${this.textField(`education-${index}-gpaBase`, "GPA Base", item.gpaBase, "text", "例如 4.0 / 5.0")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  },

  renderInternships(items) {
    return this.renderSimpleList("internships", "实习经历", items, [
      ["company", "公司"],
      ["position", "职位"],
      ["startDate", "开始时间", "date"],
      ["endDate", "结束时间", "date"],
      ["description", "描述", "textarea"],
    ]);
  },

  renderProjects(items) {
    return this.renderSimpleList("projects", "项目经历", items, [
      ["name", "项目名称"],
      ["role", "在项目中担任的角色"],
      ["startDate", "开始时间", "date"],
      ["endDate", "结束时间", "date"],
      ["link", "项目链接"],
      ["description", "描述", "textarea"],
    ]);
  },

  renderAwards(items) {
    return this.renderSimpleList("awards", "获奖信息", items, [
      ["type", "获奖类型", "select", ["", "奖学金", "竞赛获奖", "其他"]],
      ["date", "获奖时间", "date"],
      ["description", "奖项说明", "textarea"],
    ]);
  },

  renderPortfolios(items) {
    return this.renderSimpleList("portfolios", "作品或个人主页", items, [
      ["name", "作品名称"],
      ["link", "作品链接"],
      ["password", "密码或提取码"],
    ]);
  },

  renderSimpleList(key, title, items, fields) {
    return `
      <div class="resume-block">
        <div class="block-head"><h3>${title}</h3><button class="btn small" onclick="App.addResumeItem('${key}')">添加</button></div>
        ${items.length ? items.map((item, index) => `
          <div class="repeat-card">
            <div class="repeat-head"><strong>${title} ${index + 1}</strong><button class="btn small danger" onclick="App.removeResumeItem('${key}', ${index})">删除</button></div>
            <div class="resume-form">
              ${fields.map(([field, label, type, options]) => {
                const id = `${key}-${index}-${field}`;
                if (type === "textarea") return this.textareaField(id, label, item[field]);
                if (type === "select") return this.selectField(id, label, item[field], options);
                return this.textField(id, label, item[field], type || "text");
              }).join("")}
            </div>
          </div>
        `).join("") : `<div class="empty">暂无${title}，可按需添加。</div>`}
      </div>
    `;
  },

  getInput(id) {
    return document.querySelector(`#${CSS.escape(id)}`)?.value.trim() || "";
  },

  collectResume() {
    const current = this.normalizeResume(this.state.resume);
    const collectItems = (key, fields) =>
      (current[key] || []).map((_, index) => {
        const item = {};
        fields.forEach((field) => {
          item[field] = this.getInput(`${key}-${index}-${field}`);
        });
        return item;
      });
    return {
      profile: {
        photoName: current.profile.photoName,
        photoData: current.profile.photoData,
        name: this.getInput("profile-name"),
        gender: this.getInput("profile-gender"),
        countryRegion: this.getInput("profile-countryRegion"),
        idType: this.getInput("profile-idType"),
        idNumber: this.getInput("profile-idNumber"),
        phoneType: this.getInput("profile-phoneType"),
        phone: this.getInput("profile-phone"),
        email: this.getInput("profile-email"),
        currentLocation: this.getInput("profile-currentLocation"),
        wechat: this.getInput("profile-wechat"),
        qq: this.getInput("profile-qq"),
        emergencyContact: this.getInput("profile-emergencyContact"),
        emergencyPhone: this.getInput("profile-emergencyPhone"),
      },
      education: collectItems("education", ["degree", "schoolName", "studyLocation", "startDate", "endDate", "college", "major", "rank", "gpa", "gpaBase"]),
      internships: collectItems("internships", ["company", "position", "startDate", "endDate", "description"]),
      projects: collectItems("projects", ["name", "role", "startDate", "endDate", "link", "description"]),
      awards: collectItems("awards", ["type", "date", "description"]),
      portfolios: collectItems("portfolios", ["name", "link", "password"]),
      selfDescription: this.getInput("self-description"),
      verifier: {
        name: this.getInput("verifier-name"),
        identity: this.getInput("verifier-identity"),
        phone: this.getInput("verifier-phone"),
      },
      abilityTags: current.abilityTags || [],
      summary: current.summary || "",
      gaps: current.gaps || [],
      sourceFile: current.sourceFile || "",
    };
  },

  async saveResume() {
    const resume = this.collectResume();
    const rawText = this.state.rawText || "";
    try {
      await this.api("/api/resume", {
        method: "PUT",
        body: JSON.stringify({ resume, rawText }),
      });
      this.state.resume = resume;
      this.state.rawText = rawText;
      this.setNotice("简历已保存。");
      this.render();
    } catch (error) {
      this.setError(`保存失败：${error.message}`);
      this.render();
    }
  },

  formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  },

  clearParseTimer() {
    if (this.parseTimer) {
      clearInterval(this.parseTimer);
      this.parseTimer = null;
    }
  },

  beginParseProgress(file) {
    this.clearParseTimer();
    this.state.pendingParse = null;
    this.state.parseProgress = {
      status: "running",
      fileName: file.name,
      phaseLabel: "读取文件",
      detail: `正在读取 ${this.formatBytes(file.size)}`,
      percent: 0,
      startedAt: Date.now(),
      elapsedSeconds: 0,
    };
    this.parseTimer = setInterval(() => {
      if (!this.state.parseProgress || this.state.parseProgress.status !== "running") return;
      this.state.parseProgress.elapsedSeconds = Math.floor((Date.now() - this.state.parseProgress.startedAt) / 1000);
      this.render();
    }, 1000);
  },

  updateParseProgress(updates) {
    if (!this.state.parseProgress) return;
    this.state.parseProgress = {
      ...this.state.parseProgress,
      ...updates,
      elapsedSeconds: Math.floor((Date.now() - this.state.parseProgress.startedAt) / 1000),
    };
    this.render();
  },

  finishParseProgress(message) {
    const progress = this.state.parseProgress || {};
    this.clearParseTimer();
    this.state.parseProgress = {
      ...progress,
      status: "done",
      phaseLabel: "解析完成",
      detail: message || "解析完成，请选择写入方式。",
      percent: 100,
      elapsedSeconds: Math.floor((Date.now() - (progress.startedAt || Date.now())) / 1000),
    };
  },

  failParseProgress(message) {
    const progress = this.state.parseProgress || {};
    this.clearParseTimer();
    this.state.parseProgress = {
      ...progress,
      status: "error",
      phaseLabel: "解析失败",
      detail: message,
      percent: null,
      elapsedSeconds: Math.floor((Date.now() - (progress.startedAt || Date.now())) / 1000),
    };
  },

  async parseResumeFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      this.setError("文件太大，单份简历不超过 8MB。");
      this.render();
      return;
    }
    const currentDraft = this.state.view === "resume" ? this.collectResume() : this.normalizeResume(this.state.resume);
    try {
      this.state.resume = currentDraft;
      this.state.notice = "";
      this.state.error = "";
      this.beginParseProgress(file);
      this.render();
      const base64 = await this.fileToBase64(file, (progress) => {
        this.updateParseProgress({
          phaseLabel: "读取文件",
          detail: `已读取 ${this.formatBytes(progress.loaded)} / ${this.formatBytes(progress.total || file.size)}`,
          percent: progress.percent,
        });
      });
      this.updateParseProgress({
        phaseLabel: "上传文件",
        detail: "正在上传文件",
        percent: 0,
      });
      let data = await this.apiJsonWithUploadProgress(
        "/api/resume/parse-file",
        { fileName: file.name, mimeType: file.type || "application/octet-stream", base64 },
        (progress) => {
          if (progress.complete) {
            this.updateParseProgress({
              phaseLabel: "解析中",
              detail: "文件已上传，正在提取文本；扫描版会自动尝试 OCR",
              percent: null,
            });
            return;
          }
          this.updateParseProgress({
            phaseLabel: "上传文件",
            detail: `已上传 ${this.formatBytes(progress.loaded)} / ${this.formatBytes(progress.total)}`,
            percent: progress.percent,
          });
        }
      );
      if (data.jobId) {
        this.updateParseProgress({
          phaseLabel: "等待解析",
          detail: data.message || "文件已上传，等待服务器开始解析。",
          percent: null,
        });
        data = await this.waitResumeParseJob(data.jobId);
      }
      this.state.resume = currentDraft;
      this.state.pendingParse = {
        resume: data.resume,
        rawText: data.rawText || "",
        fileName: file.name,
        message: data.message || "解析完成，请选择写入方式。",
      };
      this.finishParseProgress(this.state.pendingParse.message);
      this.render();
    } catch (error) {
      this.setError(`解析失败：${error.message}`);
      this.state.pendingParse = null;
      this.failParseProgress(error.message);
      this.render();
    } finally {
      input.value = "";
    }
  },

  async waitResumeParseJob(jobId) {
    const startedAt = Date.now();
    let transientFailures = 0;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await this.sleep(attempt < 6 ? 1000 : 2000);
      let data = {};
      try {
        data = await this.api(`/api/resume/parse-jobs/${encodeURIComponent(jobId)}`);
        transientFailures = 0;
      } catch (error) {
        transientFailures += 1;
        if (transientFailures <= 3) {
          this.updateParseProgress({
            phaseLabel: "等待解析",
            detail: "解析仍在进行，正在重试获取结果。",
            percent: null,
          });
          continue;
        }
        throw error;
      }
      if (data.status === "done") {
        return data.result || {};
      }
      if (data.status === "error") {
        throw new Error(data.message || this.formatApiError(data.error || "server_error"));
      }
      this.updateParseProgress({
        phaseLabel: data.phaseLabel || (data.status === "queued" ? "等待解析" : "解析中"),
        detail: data.message || "服务器正在解析简历。",
        percent: null,
      });
      if (Date.now() - startedAt > 8 * 60 * 1000) {
        throw new Error("解析等待超时，请稍后重试。");
      }
    }
    throw new Error("解析等待超时，请稍后重试。");
  },

  renderParseModal() {
    const progress = this.state.parseProgress;
    if (!progress) return "";
    const running = progress.status === "running";
    const done = progress.status === "done";
    const failed = progress.status === "error";
    const percent = typeof progress.percent === "number" ? Math.max(0, Math.min(100, progress.percent)) : null;
    return `
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <section class="parse-modal">
          <div class="modal-head">
            <span class="modal-indicator ${running ? "pulse" : done ? "ok" : "warn"}"></span>
            <div>
              <h3>${done ? "解析完成" : failed ? "解析失败" : "正在解析简历"}</h3>
              <p>${this.escape(progress.fileName || "")}</p>
            </div>
          </div>
          ${running ? `
            <div class="progress-meta">
              <span>${this.escape(progress.phaseLabel || "处理中")}</span>
              <strong>${percent === null ? `${progress.elapsedSeconds || 0}s` : `${Math.round(percent)}%`}</strong>
            </div>
            <div class="progress-bar ${percent === null ? "indeterminate" : ""}">
              <span style="width: ${percent === null ? 100 : percent}%"></span>
            </div>
          ` : `
            <p class="modal-result">${this.escape(progress.detail || "")}</p>
            ${done ? `
              <div class="toolbar">
                <button class="btn primary" onclick="App.applyParsedResume('overwrite')">覆盖当前字段</button>
                <button class="btn" onclick="App.applyParsedResume('fill-empty')">只填空字段</button>
                <button class="btn ghost" onclick="App.cancelParsedResume()">取消</button>
              </div>
            ` : `
              <div class="toolbar">
                <button class="btn primary" onclick="App.closeParseModal()">关闭</button>
              </div>
            `}
          `}
        </section>
      </div>
    `;
  },

  renderManualJobModal() {
    if (!this.state.manualJobModalOpen) return "";
    const statuses = this.applicationStatuses();
    return `
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <section class="parse-modal job-submit-modal">
          <div class="modal-head">
            <span class="modal-indicator ok"></span>
            <div>
              <h3>手动添加岗位</h3>
              <p>先保存到你的投递看板，同时提交给官方审核。</p>
            </div>
          </div>
          <div class="resume-form compact-form">
            ${this.textField("manual-company", "公司", "", "text", "例如 字节跳动")}
            ${this.textField("manual-title", "岗位名称", "招聘岗位合集", "text", "例如 产品经理 / 招聘岗位合集")}
            ${this.textField("manual-city", "城市", "", "text", "例如 北京 上海")}
            ${this.textField("manual-category", "岗位方向/行业", "", "text", "例如 互联网 / AI / 产品")}
            ${this.selectField("manual-companyType", "企业类型", "", ["", "央企", "国企", "央国企", "民企", "外企", "事业单位", "银行", "其他"])}
            ${this.selectField("manual-batch", "招聘批次", "27届秋招", ["27届秋招", "实习", "26届春招"])}
            ${this.textField("manual-deadline", "截止日期", "", "text", "例如 2026-09-30 / 尽快投递")}
            <div class="form-row">
              <label>加入状态</label>
              <select id="manual-status">
                ${statuses.map(([status, label]) => `<option value="${this.escape(status)}" ${status === "preparing" ? "selected" : ""}>${this.escape(label)}</option>`).join("")}
              </select>
            </div>
            ${this.textField("manual-sourceUrl", "官方校招/网申链接", "", "url", "https://...")}
            ${this.textareaField("manual-requirements", "关键词", "")}
            ${this.textareaField("manual-description", "备注/岗位说明", "")}
          </div>
          <div class="toolbar modal-actions">
            <button class="btn primary" onclick="App.submitManualJob()">保存并提交审核</button>
            <button class="btn ghost" onclick="App.closeManualJobModal()">取消</button>
          </div>
        </section>
      </div>
    `;
  },

  renderApplicationTitleModal() {
    const modal = this.state.applicationTitleModal;
    if (!modal) return "";
    const suggestions = ["产品经理", "后端开发", "前端开发", "算法工程师", "数据分析", "运营", "市场", "财务", "秘书"];
    return `
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <section class="parse-modal application-edit-modal">
          <div class="modal-head">
            <span class="modal-indicator ok"></span>
            <div>
              <h3>岗位名称</h3>
              <p>${this.escape(modal.company || "")}</p>
            </div>
          </div>
          <div class="application-edit-body">
            <label class="modal-field">
              <span>你投递的具体岗位</span>
              <input id="application-title-input" value="${this.escape(modal.value || "")}" placeholder="例如 产品经理、后端开发、秘书" autocomplete="off" />
            </label>
            <div class="choice-chips">
              ${suggestions.map((item) => `<button class="chip-button" onclick="App.fillApplicationTitle('${this.escape(item)}')">${this.escape(item)}</button>`).join("")}
            </div>
          </div>
          <div class="toolbar modal-actions">
            <button class="btn primary" onclick="App.saveApplicationTitleModal()">保存</button>
            <button class="btn" onclick="App.clearApplicationTitleModal()">清除</button>
            <button class="btn ghost" onclick="App.closeApplicationTitleModal()">取消</button>
          </div>
        </section>
      </div>
    `;
  },

  renderAssessmentDeadlineModal() {
    const modal = this.state.assessmentDeadlineModal;
    if (!modal) return "";
    const isInterview = modal.kind === "interview";
    const title = isInterview ? "面试时间" : "测评/笔试截止时间";
    const clearLabel = isInterview ? "清除面试提醒" : "清除测评提醒";
    return `
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <section class="parse-modal application-edit-modal deadline-modal">
          <div class="modal-head">
            <span class="modal-indicator ok"></span>
            <div>
              <h3>${title}</h3>
              <p>${this.escape(modal.company || "")}${modal.title ? ` · ${this.escape(modal.title)}` : ""}</p>
            </div>
          </div>
          ${this.renderDeadlineCalendar(modal)}
          <div class="deadline-time-row">
            <label>
              <span>小时</span>
              <select id="assessment-hour" onchange="App.updateAssessmentDeadlineTime('hour', this.value)">
                ${Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")).map((hour) => `<option value="${hour}" ${hour === modal.hour ? "selected" : ""}>${hour}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>分钟</span>
              <select id="assessment-minute" onchange="App.updateAssessmentDeadlineTime('minute', this.value)">
                ${this.minuteOptions().map((minute) => `<option value="${minute}" ${minute === modal.minute ? "selected" : ""}>${minute}</option>`).join("")}
              </select>
            </label>
            <div class="deadline-preview">
              <span>已选</span>
              <strong id="assessment-deadline-preview">${modal.date ? `${this.dateLabel(modal.date)} ${modal.hour}:${modal.minute}` : "请选择日期"}</strong>
            </div>
          </div>
          <div class="toolbar modal-actions">
            <button class="btn primary" onclick="App.saveAssessmentDeadlineModal()">保存</button>
            <button class="btn" onclick="App.clearAssessmentDeadlineModal()">${clearLabel}</button>
            <button class="btn ghost" onclick="App.closeAssessmentDeadlineModal()">取消</button>
          </div>
        </section>
      </div>
    `;
  },

  renderDeadlineCalendar(modal) {
    const monthStart = this.parseDateValue(`${modal.month}-01`) || new Date();
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayValue = this.formatDateValue(new Date());
    const cells = [];
    for (let index = 0; index < firstDay; index += 1) {
      cells.push(`<span class="calendar-empty"></span>`);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const value = this.formatDateValue(new Date(year, month, day));
      const active = value === modal.date;
      const today = value === todayValue;
      const disabled = value < todayValue;
      cells.push(`
        <button class="calendar-day ${active ? "active" : ""} ${today ? "today" : ""}" ${disabled ? "disabled" : `onclick="App.selectAssessmentDeadlineDate('${value}')"`}>
          ${day}
        </button>
      `);
    }
    return `
      <div class="calendar-picker">
        <div class="calendar-head">
          <button class="btn small" onclick="App.shiftAssessmentDeadlineMonth(-1)">上月</button>
          <strong>${this.escape(this.monthLabel(modal.month))}</strong>
          <button class="btn small" onclick="App.shiftAssessmentDeadlineMonth(1)">下月</button>
        </div>
        <div class="calendar-weekdays">
          ${["日", "一", "二", "三", "四", "五", "六"].map((item) => `<span>${item}</span>`).join("")}
        </div>
        <div class="calendar-days">${cells.join("")}</div>
      </div>
    `;
  },

  openManualJobModal() {
    this.state.manualJobModalOpen = true;
    this.render();
  },

  closeManualJobModal() {
    this.state.manualJobModalOpen = false;
    this.render();
  },

  collectManualJob() {
    return {
      company: this.getInput("manual-company"),
      title: this.getInput("manual-title") || "招聘岗位合集",
      city: this.getInput("manual-city"),
      category: this.getInput("manual-category"),
      companyType: this.getInput("manual-companyType"),
      batch: this.getInput("manual-batch"),
      deadline: this.getInput("manual-deadline") || "待确认",
      sourceUrl: this.getInput("manual-sourceUrl"),
      requirements: this.getInput("manual-requirements"),
      description: this.getInput("manual-description"),
      status: this.getInput("manual-status") || "preparing",
    };
  },

  async submitManualJob() {
    try {
      const payload = this.collectManualJob();
      if (!payload.company || !payload.title || !payload.sourceUrl) {
        this.setError("请填写公司、岗位名称和官方链接。");
        this.render();
        return;
      }
      const data = await this.api("/api/user/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const apps = await this.api("/api/applications");
      this.state.applications = apps.applications;
      if (data.reviewStatus === "approved") {
        await this.loadJobs(true);
        this.setNotice("已加入投递看板，公共岗位库已有该岗位。");
      } else {
        this.setNotice("已加入投递看板，并提交官方审核。");
      }
      this.state.manualJobModalOpen = false;
      this.render();
    } catch (error) {
      this.setError(`添加岗位失败：${error.message}`);
      this.render();
    }
  },

  apiJsonWithUploadProgress(path, payload, onUploadProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", path);
      xhr.withCredentials = true;
      xhr.timeout = 300000;
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onUploadProgress?.({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
          complete: false,
        });
      };
      xhr.upload.onload = () => {
        onUploadProgress?.({ loaded: 1, total: 1, percent: 100, complete: true });
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText || "{}");
        } catch {
          data = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(this.formatApiError(data.error || `request_failed_${xhr.status || "unknown"}`, xhr.status, data)));
        }
      };
      xhr.onerror = () => reject(new Error(this.formatApiError("network_error")));
      xhr.ontimeout = () => reject(new Error(this.formatApiError("request_timeout")));
      xhr.send(JSON.stringify(payload));
    });
  },

  async applyParsedResume(mode) {
    const pending = this.state.pendingParse;
    if (!pending) return;
    const currentDraft = this.state.view === "resume" ? this.collectResume() : this.normalizeResume(this.state.resume);
    const resume = this.mergeParsedResume(currentDraft, pending.resume, mode);
    const rawText = pending.rawText || this.state.rawText || "";
    try {
      await this.api("/api/resume", {
        method: "PUT",
        body: JSON.stringify({ resume, rawText }),
      });
      this.state.resume = resume;
      this.state.rawText = rawText;
      this.state.pendingParse = null;
      this.state.parseProgress = null;
      this.setNotice(mode === "fill-empty" ? "已只填充空字段并保存。" : "已覆盖当前字段并保存。");
      this.render();
    } catch (error) {
      this.setError(`保存解析结果失败：${error.message}`);
      this.render();
    }
  },

  cancelParsedResume() {
    this.state.pendingParse = null;
    this.state.parseProgress = null;
    this.setNotice("已取消写入解析结果。");
    this.render();
  },

  closeParseModal() {
    this.clearParseTimer();
    this.state.parseProgress = null;
    this.render();
  },

  fileToBase64(file, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress?.({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      };
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });
  },

  mergeParsedResume(current, parsed, mode = "overwrite") {
    const normalized = this.normalizeResume(parsed);
    const mergeObject = (oldObj, newObj) => {
      const result = { ...(oldObj || {}) };
      Object.entries(newObj || {}).forEach(([key, value]) => {
        if (!value) return;
        if (mode === "fill-empty" && result[key]) return;
        result[key] = value;
      });
      return result;
    };
    const chooseList = (oldItems, newItems) => {
      const oldFilled = this.hasFilledItems(oldItems);
      const newFilled = this.hasFilledItems(newItems);
      if (mode === "fill-empty") {
        if (!oldFilled) return newFilled ? newItems : oldItems;
        if (!newFilled) return oldItems;
        const length = Math.max(oldItems.length, newItems.length);
        return Array.from({ length }, (_, index) => {
          const oldItem = oldItems[index];
          const newItem = newItems[index];
          if (!oldItem) return newItem;
          if (!newItem) return oldItem;
          if (typeof oldItem === "object" && typeof newItem === "object") {
            return mergeObject(oldItem, newItem);
          }
          return oldItem || newItem;
        });
      }
      return newFilled ? newItems : oldItems;
    };
    return {
      ...normalized,
      profile: mergeObject(current.profile, normalized.profile),
      education: chooseList(current.education, normalized.education),
      internships: chooseList(current.internships, normalized.internships),
      projects: chooseList(current.projects, normalized.projects),
      awards: chooseList(current.awards, normalized.awards),
      portfolios: chooseList(current.portfolios, normalized.portfolios),
      selfDescription: mode === "fill-empty" ? current.selfDescription || normalized.selfDescription : normalized.selfDescription || current.selfDescription,
      verifier: mergeObject(current.verifier, normalized.verifier),
      abilityTags: chooseList(current.abilityTags, normalized.abilityTags),
      summary: mode === "fill-empty" ? current.summary || normalized.summary : normalized.summary || current.summary,
      gaps: chooseList(current.gaps, normalized.gaps),
      sourceFile: normalized.sourceFile || current.sourceFile,
    };
  },

  hasFilledItems(items) {
    return (items || []).some((item) => Object.values(item || {}).some(Boolean));
  },

  readPhoto(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      this.setError("照片请控制在 500KB 内。");
      this.render();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const resume = this.normalizeResume(this.collectResume());
      resume.profile.photoName = file.name;
      resume.profile.photoData = String(reader.result || "");
      this.state.resume = resume;
      this.setNotice("照片已加载，保存简历后会同步到账号资料。");
      this.render();
    };
    reader.readAsDataURL(file);
  },

  addResumeItem(key) {
    const resume = this.normalizeResume(this.collectResume());
    const defaults = {
      education: { degree: "", schoolName: "", studyLocation: "", startDate: "", endDate: "", college: "", major: "", rank: "", gpa: "", gpaBase: "" },
      internships: { company: "", position: "", startDate: "", endDate: "", description: "" },
      projects: { name: "", role: "", startDate: "", endDate: "", link: "", description: "" },
      awards: { type: "", date: "", description: "" },
      portfolios: { name: "", link: "", password: "" },
    };
    resume[key] = [...(resume[key] || []), defaults[key]];
    this.state.resume = resume;
    this.render();
  },

  removeResumeItem(key, index) {
    const resume = this.normalizeResume(this.collectResume());
    resume[key] = (resume[key] || []).filter((_, itemIndex) => itemIndex !== index);
    if (key === "education" && resume[key].length === 0) {
      resume[key] = [{ degree: "", schoolName: "", studyLocation: "", startDate: "", endDate: "", college: "", major: "", rank: "", gpa: "", gpaBase: "" }];
    }
    this.state.resume = resume;
    this.render();
  },

  filteredJobs() {
    const query = this.state.query.trim().toLowerCase();
    return this.state.jobs.filter((job) => {
      const inCity = this.state.city === "all" || job.city === this.state.city;
      const inCompanyType = this.state.companyType === "all" || job.companyType === this.state.companyType;
      const inBatch = job.batch === this.state.batch;
      const text = `${job.company} ${job.title} ${job.city} ${job.category} ${job.companyType || ""} ${job.batch || ""} ${job.description} ${job.requirements.join(" ")}`.toLowerCase();
      return inCity && inCompanyType && inBatch && (!query || text.includes(query));
    });
  },

  sortJobs(jobs) {
    const items = [...jobs];
    if (this.state.jobSort === "updated") {
      return items.sort((a, b) =>
        this.jobUpdateDate(b).localeCompare(this.jobUpdateDate(a)) ||
        this.matchJob(b).score - this.matchJob(a).score ||
        a.company.localeCompare(b.company, "zh-CN")
      );
    }
    return items.sort((a, b) =>
      this.matchJob(b).score - this.matchJob(a).score ||
      this.jobUpdateDate(b).localeCompare(this.jobUpdateDate(a)) ||
      a.company.localeCompare(b.company, "zh-CN")
    );
  },

  renderJobs() {
    const meta = this.state.jobsMeta || {};
    const cities = ["all", ...new Set([...(meta.cities || []), ...this.state.jobs.map((job) => job.city)].filter(Boolean))];
    const companyTypes = ["all", ...new Set([...(meta.companyTypes || []), ...this.state.jobs.map((job) => job.companyType || "未分类")].filter(Boolean))];
    const jobs = this.sortJobs(this.filteredJobs());
    const companyGroups = this.companyGroups(jobs);
    const total = meta.total ?? jobs.length;
    const latestUpdate = meta.latestSourceDate || this.latestJobUpdateDate(this.state.jobs);
    const selectedCompany = this.state.selectedCompanyKey
      ? companyGroups.find((group) => group.key === this.state.selectedCompanyKey)
      : null;
    return `
      <section class="section-title">
        <div>
          <h2>岗位匹配</h2>
          <p>最新更新：${this.escape(latestUpdate || "暂无")} · 当前显示 ${jobs.length}/${total} 条，去投递会打开官方校招链接。</p>
          <div class="batch-tabs">
            ${["27届秋招", "实习", "26届春招"].map((item) => `
              <button class="pill-button ${this.state.batch === item ? "active" : ""}" onclick="App.setBatch('${item}')">
                ${item}
              </button>
            `).join("")}
          </div>
        </div>
      </section>
      <section class="panel" id="jobs-panel">
        <div class="toolbar">
          <div class="job-search-box">
            <input id="job-search" value="${this.escape(this.state.queryDraft ?? this.state.query)}" placeholder="搜索公司、岗位、城市、能力、企业类型" autocomplete="off" oncompositionstart="App.startQueryComposition()" oncompositionend="App.endQueryComposition(this.value)" oninput="App.setQuery(this.value, event)" onkeydown="App.handleJobSearchKeydown(event)" onfocus="App.openJobSuggestions()" onblur="setTimeout(() => App.closeJobSuggestions(), 140)" />
            <button class="btn primary job-search-submit" onclick="App.submitJobSearch()">搜索</button>
            <div id="job-suggestions" class="job-suggestions ${this.state.jobSuggestionsOpen && this.state.jobSuggestions.length ? "open" : ""}">
              ${this.jobSuggestionsHtml()}
            </div>
          </div>
          <select onchange="App.setCity(this.value)">
            ${cities.map((item) => `<option value="${this.escape(item)}" ${this.state.city === item ? "selected" : ""}>${item === "all" ? "全部城市" : this.escape(item)}</option>`).join("")}
          </select>
          <select onchange="App.setCompanyType(this.value)">
            ${companyTypes.map((item) => `<option value="${this.escape(item)}" ${this.state.companyType === item ? "selected" : ""}>${item === "all" ? "全部类型" : this.escape(item)}</option>`).join("")}
          </select>
          <select onchange="App.setJobSort(this.value)">
            <option value="match" ${this.state.jobSort === "match" ? "selected" : ""}>按匹配度</option>
            <option value="updated" ${this.state.jobSort === "updated" ? "selected" : ""}>按更新时间</option>
          </select>
        </div>
        ${selectedCompany ? this.renderCompanyDetail(selectedCompany) : `${this.renderCompanyGroups(companyGroups)}${this.renderJobsPager()}`}
      </section>
    `;
  },

  renderJobsPager() {
    const meta = this.state.jobsMeta || {};
    const total = meta.total ?? this.state.jobs.length;
    const limit = meta.limit || this.state.jobsPerPage || 120;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    if (pageCount <= 1) return "";
    const current = Math.min(Math.max(1, this.state.jobsPage || 1), pageCount);
    const pages = this.jobsPageItems(current, pageCount);
    return `
      <div class="pager-row">
        <span>第 ${current}/${pageCount} 页 · 共 ${total} 条</span>
        <div class="pager-buttons">
          <button class="btn small" ${current <= 1 ? "disabled" : `onclick="App.goJobsPage(${current - 1})"`}>上一页</button>
          ${pages
            .map((page) =>
              page === "..."
                ? `<span class="pager-ellipsis">...</span>`
                : `<button class="btn small pager-button ${page === current ? "active" : ""}" ${page === current ? "disabled" : `onclick="App.goJobsPage(${page})"`}>${page}</button>`
            )
            .join("")}
          <button class="btn small" ${current >= pageCount ? "disabled" : `onclick="App.goJobsPage(${current + 1})"`}>下一页</button>
        </div>
      </div>
    `;
  },

  jobsPageItems(current, pageCount) {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    const pages = new Set([1, pageCount, current - 1, current, current + 1]);
    const sorted = [...pages].filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b);
    return sorted.reduce((items, page, index) => {
      if (index > 0 && page - sorted[index - 1] > 1) items.push("...");
      items.push(page);
      return items;
    }, []);
  },

  renderJobGrid(jobs) {
    return `<div class="grid cols-2">${jobs.length ? jobs.map((job) => this.jobCard(job)).join("") : `<div class="empty">没有匹配的岗位，试着放宽城市或企业类型。</div>`}</div>`;
  },

  jobUpdateDate(job) {
    if (job.sourceDate) return String(job.sourceDate).slice(0, 10);
    const sourceDate = String(job.description || "").match(/(?:^|\n)更新[：:]\s*(\d{4}-\d{2}-\d{2})/);
    if (sourceDate) return sourceDate[1];
    return "";
  },

  latestJobUpdateDate(jobs) {
    return jobs
      .map((job) => this.jobUpdateDate(job))
      .filter(Boolean)
      .sort()
      .pop() || "";
  },

  visibleJobDescription(job) {
    const text = String(job.description || "");
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !/^(来源|更新|批次|公告)[：:]/.test(line));
    return lines.join("\n") || job.category || "";
  },

  companyGroupKey(company) {
    return encodeURIComponent(company || "未命名公司");
  },

  companyGroups(jobs) {
    const groups = new Map();
    jobs.forEach((job) => {
      const company = job.company || "未命名公司";
      const key = this.companyGroupKey(company);
      if (!groups.has(key)) {
        groups.set(key, { key, company, jobs: [] });
      }
      groups.get(key).jobs.push(job);
    });
    return [...groups.values()]
      .map((group) => {
        const scoredJobs = group.jobs
          .map((job) => ({ job, match: this.matchJob(job) }))
          .sort((a, b) => b.match.score - a.match.score);
        return {
          ...group,
          jobs: scoredJobs.map((item) => item.job),
          bestScore: scoredJobs[0]?.match.score || 0,
          bestMatch: scoredJobs[0]?.match || null,
          latestUpdate: this.latestJobUpdateDate(group.jobs),
        };
      })
      .sort((a, b) => {
        if (this.state.jobSort === "updated") {
          return b.latestUpdate.localeCompare(a.latestUpdate) || b.bestScore - a.bestScore || a.company.localeCompare(b.company, "zh-CN");
        }
        return b.bestScore - a.bestScore || b.latestUpdate.localeCompare(a.latestUpdate) || a.company.localeCompare(b.company, "zh-CN");
      });
  },

  renderCompanyGroups(groups) {
    if (!groups.length) {
      return `<div class="empty">没有匹配的公司，试着放宽城市或企业类型。</div>`;
    }
    return `<div class="grid cols-2">${groups.map((group) => this.companyCard(group)).join("")}</div>`;
  },

  companyCard(group) {
    const jobs = group.jobs;
    const cities = [...new Set(jobs.map((job) => job.city).filter(Boolean))];
    const categories = [...new Set(jobs.map((job) => job.category).filter(Boolean))];
    const companyTypes = [...new Set(jobs.map((job) => job.companyType || "未分类"))];
    const deadlines = jobs.map((job) => job.deadline).filter(Boolean).sort();
    const updateDate = this.latestJobUpdateDate(jobs);
    const addedCount = jobs.filter((job) => this.state.applications.some((item) => item.jobId === job.id)).length;
    const allRequirements = [...new Set(jobs.flatMap((job) => job.requirements || []))].slice(0, 8);
    return `
      <article class="job-card company-card" role="button" tabindex="0" onclick="App.viewCompanyJobs('${group.key}')" onkeydown="App.openCompanyFromKey(event, '${group.key}')">
        <div class="job-head">
          <div>
            <h3 class="job-title">${this.escape(group.company)}</h3>
            <div class="job-meta">${this.escape(cities.slice(0, 4).join(" / ") || "城市待确认")} · ${this.escape(companyTypes.join(" / "))}${updateDate ? ` · 更新 ${this.escape(updateDate)}` : ""}</div>
          </div>
          <div class="match">${group.bestScore}%</div>
        </div>
        <p class="muted" style="margin: 0;">覆盖 ${this.escape(categories.join("、") || "多个")} 方向${deadlines[0] ? ` · 最近截止 ${this.escape(deadlines[0])}` : ""}</p>
        <div class="chips">
          ${allRequirements.map((req) => `<span class="chip ${group.bestMatch?.hits?.includes(req) ? "green" : "amber"}">${this.escape(req)}</span>`).join("")}
        </div>
        ${addedCount ? `<div class="muted">已加入投递看板：${addedCount} 个岗位</div>` : ""}
        <div class="toolbar">
          <button class="btn small primary" onclick="event.stopPropagation(); App.viewCompanyJobs('${group.key}')">查看详情</button>
        </div>
      </article>
    `;
  },

  renderCompanyDetail(group) {
    const cities = [...new Set(group.jobs.map((job) => job.city).filter(Boolean))];
    const categories = [...new Set(group.jobs.map((job) => job.category).filter(Boolean))];
    const updateDate = this.latestJobUpdateDate(group.jobs);
    return `
      <div class="company-detail-head">
        <div>
          <button class="btn small" onclick="App.closeCompanyJobs()">返回公司列表</button>
          <h3>${this.escape(group.company)}</h3>
          <p class="muted">${this.escape(cities.join(" / ") || "城市待确认")} · ${this.escape(categories.join(" / ") || "方向待确认")}${updateDate ? ` · 更新 ${this.escape(updateDate)}` : ""}</p>
        </div>
      </div>
      ${this.renderJobGrid(group.jobs)}
    `;
  },

  setBatch(value) {
    this.state.batch = value;
    this.state.jobsPage = 1;
    this.state.selectedCompanyKey = "";
    this.reloadJobs();
  },

  setJobSort(value) {
    this.state.jobSort = value;
    this.state.jobsPage = 1;
    this.state.selectedCompanyKey = "";
    this.reloadJobs();
  },

  async goJobsPage(page) {
    const meta = this.state.jobsMeta || {};
    const limit = meta.limit || this.state.jobsPerPage || 120;
    const total = meta.total ?? this.state.jobs.length;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    const nextPage = Math.max(1, Math.min(Number(page) || 1, pageCount));
    if (nextPage === this.state.jobsPage) return;
    this.state.jobsPage = nextPage;
    this.state.selectedCompanyKey = "";
    try {
      if (await this.loadJobs(true)) {
        this.render();
        requestAnimationFrame(() => document.querySelector("#jobs-panel")?.scrollIntoView({ block: "start" }));
      }
    } catch (error) {
      this.setError(`岗位加载失败：${error.message}`);
      this.render();
    }
  },

  viewCompanyJobs(key) {
    this.state.selectedCompanyKey = key;
    this.render();
  },

  openCompanyFromKey(event, key) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.viewCompanyJobs(key);
    }
  },

  closeCompanyJobs() {
    this.state.selectedCompanyKey = "";
    this.render();
  },

  setQuery(value, event = null) {
    this.state.queryDraft = value;
    this.state.selectedCompanyKey = "";
    this.jobRequestId += 1;
    if (this.jobSearchTimer) clearTimeout(this.jobSearchTimer);
    if (this.jobSuggestionTimer) clearTimeout(this.jobSuggestionTimer);
    if (this.composingQuery || event?.isComposing) return;

    const keyword = value.trim();
    if (!keyword) {
      this.jobSuggestionRequestId += 1;
      this.state.jobSuggestions = [];
      this.state.jobSuggestionsOpen = false;
      this.updateJobSuggestionLayer();
      return;
    }

    this.state.jobSuggestionsOpen = true;
    this.jobSuggestionTimer = setTimeout(() => this.loadJobSuggestions(keyword), 180);
  },

  startQueryComposition() {
    this.composingQuery = true;
    if (this.jobSearchTimer) clearTimeout(this.jobSearchTimer);
    if (this.jobSuggestionTimer) clearTimeout(this.jobSuggestionTimer);
    this.jobRequestId += 1;
  },

  endQueryComposition(value) {
    this.composingQuery = false;
    this.setQuery(value);
  },

  async loadJobSuggestions(keyword = this.state.queryDraft.trim()) {
    const requestId = ++this.jobSuggestionRequestId;
    if (!keyword) {
      this.state.jobSuggestions = [];
      this.state.jobSuggestionsOpen = false;
      this.updateJobSuggestionLayer();
      return;
    }
    const params = new URLSearchParams({
      q: keyword,
      batch: this.state.batch,
      limit: "8",
    });
    if (this.state.city !== "all") params.set("city", this.state.city);
    if (this.state.companyType !== "all") params.set("companyType", this.state.companyType);
    try {
      const data = await this.api(`/api/jobs/suggestions?${params.toString()}`);
      if (requestId !== this.jobSuggestionRequestId || keyword !== this.state.queryDraft.trim()) return;
      this.state.jobSuggestions = data.suggestions || [];
      this.state.jobSuggestionsOpen = Boolean(this.state.jobSuggestions.length);
      this.updateJobSuggestionLayer();
    } catch {
      if (requestId !== this.jobSuggestionRequestId) return;
      this.state.jobSuggestions = [];
      this.state.jobSuggestionsOpen = false;
      this.updateJobSuggestionLayer();
    }
  },

  jobSuggestionsHtml() {
    if (!this.state.jobSuggestionsOpen || !this.state.jobSuggestions.length) return "";
    return `
      <div class="job-suggestions-title">候选建议</div>
      ${this.state.jobSuggestions
        .map((item) => `
          <button class="job-suggestion-item" type="button" onmousedown="event.preventDefault()" data-value="${this.escape(item.value)}" onclick="App.chooseJobSuggestion(this.dataset.value)">
            <span>
              <strong>${this.escape(item.label || item.value)}</strong>
              <small>${this.escape([item.type, item.detail].filter(Boolean).join(" · "))}</small>
            </span>
          </button>
        `)
        .join("")}
    `;
  },

  updateJobSuggestionLayer() {
    const layer = document.querySelector("#job-suggestions");
    if (!layer) return;
    layer.classList.toggle("open", Boolean(this.state.jobSuggestionsOpen && this.state.jobSuggestions.length));
    layer.innerHTML = this.jobSuggestionsHtml();
  },

  openJobSuggestions() {
    if (!this.state.queryDraft.trim() || !this.state.jobSuggestions.length) return;
    this.state.jobSuggestionsOpen = true;
    this.updateJobSuggestionLayer();
  },

  closeJobSuggestions() {
    this.state.jobSuggestionsOpen = false;
    this.updateJobSuggestionLayer();
  },

  handleJobSearchKeydown(event) {
    if (event.key === "Escape") {
      this.closeJobSuggestions();
      return;
    }
    if (event.key === "Enter" && !this.composingQuery && !event.isComposing) {
      event.preventDefault();
      this.submitJobSearch(event.currentTarget.value);
    }
  },

  chooseJobSuggestion(value) {
    this.state.queryDraft = value;
    const input = document.querySelector("#job-search");
    if (input) input.value = value;
    this.submitJobSearch(value);
  },

  submitJobSearch(value = null) {
    const inputValue = value ?? document.querySelector("#job-search")?.value ?? this.state.queryDraft;
    const keyword = String(inputValue || "").trim();
    this.state.queryDraft = keyword;
    this.state.query = keyword;
    this.state.jobsPage = 1;
    this.state.selectedCompanyKey = "";
    this.state.jobSuggestions = [];
    this.state.jobSuggestionsOpen = false;
    this.jobSuggestionRequestId += 1;
    if (this.jobSearchTimer) clearTimeout(this.jobSearchTimer);
    if (this.jobSuggestionTimer) clearTimeout(this.jobSuggestionTimer);
    this.reloadJobs();
  },

  setCategory(value) {
    this.state.category = value;
    this.state.jobsPage = 1;
    this.state.selectedCompanyKey = "";
    this.render();
  },

  setCity(value) {
    this.state.city = value;
    this.state.jobsPage = 1;
    this.state.selectedCompanyKey = "";
    this.reloadJobs();
  },

  setCompanyType(value) {
    this.state.companyType = value;
    this.state.jobsPage = 1;
    this.state.selectedCompanyKey = "";
    this.reloadJobs();
  },

  jobCard(job, compact = false) {
    const match = this.matchJob(job);
    const app = this.state.applications.find((item) => item.jobId === job.id);
    const appStatus = app ? `已加入：${app.statusLabel || "投递看板"}` : "";
    const displayTitle = job.title && job.title !== "招聘岗位合集"
      ? `${job.company} · ${job.title}`
      : job.company;
    const batchText = job.batch ? `${job.batch} · ` : "";
    const updateDate = this.jobUpdateDate(job);
    const description = this.visibleJobDescription(job);
    return `
      <article class="job-card">
        <div class="job-head">
          <div>
            <h3 class="job-title">${this.escape(displayTitle)}</h3>
            <div class="job-meta">${this.escape(job.city)} · ${this.escape(batchText)}${this.escape(job.companyType || "未分类")}${updateDate ? ` · 更新 ${this.escape(updateDate)}` : ""} · 截止 ${this.escape(job.deadline)}</div>
          </div>
          <div class="match">${match.score}%</div>
        </div>
        <p class="muted" style="margin: 0;">${this.escape(description)}</p>
        <div class="chips">
          ${job.requirements.map((req) => `<span class="chip ${match.hits.includes(req) ? "green" : "amber"}">${this.escape(req)}</span>`).join("")}
        </div>
        <div class="muted">${this.escape(match.reason)}${match.missing.length ? ` 缺口：${this.escape(match.missing.slice(0, 2).join("、"))}` : ""}</div>
        ${appStatus ? `<div class="muted">${this.escape(appStatus)}</div>` : ""}
        <div class="toolbar">
          <a class="btn small primary" href="${this.escape(job.sourceUrl)}" target="_blank" rel="noopener noreferrer">去投递</a>
          <button class="btn small" onclick="App.addApplication(${job.id}, 'preparing')">${app ? "改为准备投递" : "准备投递"}</button>
          <button class="btn small" onclick="App.addApplication(${job.id}, 'applied')">标记已投递</button>
          ${app ? `<button class="btn small danger" onclick="App.deleteApplication(${app.id})">取消加入</button>` : ""}
        </div>
      </article>
    `;
  },

  async addApplication(jobId, status) {
    try {
      await this.api("/api/applications", {
        method: "POST",
        body: JSON.stringify({ jobId, status }),
      });
      const apps = await this.api("/api/applications");
      this.state.applications = apps.applications;
      this.setNotice(status === "applied" ? "已加入投递看板：已投递。" : "已加入投递看板：准备投递。");
      this.render();
    } catch (error) {
      this.setError(`操作失败：${error.message}`);
      this.render();
    }
  },

  applicationStatuses() {
    return [
      ["preparing", "准备投递"],
      ["applied", "已投递"],
      ["test", "测评/笔试"],
      ["interview", "面试"],
      ["offer", "Offer"],
      ["rejected", "未通过"],
      ["abandoned", "已弃投"],
    ];
  },

  renderApplications() {
    const statuses = this.applicationStatuses();
    return `
      <section class="section-title">
        <div>
          <h2>投递看板</h2>
          <p>不用打开很多招聘网站，也能先把状态统一管起来。</p>
        </div>
        <div class="toolbar section-actions">
          <button class="btn primary" onclick="App.openManualJobModal()">手动添加岗位</button>
          <button class="btn" onclick="App.nav('jobs')">寻找岗位</button>
        </div>
      </section>
      <section class="kanban">
        ${statuses
          .map(([status, label]) => {
            const items = this.state.applications.filter((item) => item.status === status);
            return `
              <div class="kanban-column" data-status="${this.escape(status)}" ondragover="App.allowApplicationDrop(event)" ondragleave="App.leaveApplicationDrop(event)" ondrop="App.dropApplication(event, '${this.escape(status)}')">
                <h3>${label}<span>${items.length}</span></h3>
                ${
                  items.length
                    ? items.map((item) => this.applicationCard(item, statuses)).join("")
                    : `<div class="empty">暂无记录</div>`
                }
              </div>
            `;
          })
          .join("")}
      </section>
    `;
  },

  publicApplicationTitle(title) {
    const text = String(title || "").trim();
    return text && text !== "招聘岗位合集" ? text : "";
  },

  applicationPositionTitle(item) {
    return String(item.customTitle || "").trim() || this.publicApplicationTitle(item.job?.title);
  },

  formatTimestampShort(timestamp) {
    if (!timestamp) return "";
    const date = new Date(Number(timestamp) * 1000);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  formatTimestampInput(timestamp) {
    if (!timestamp) return "";
    const date = new Date(Number(timestamp) * 1000);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  formatDateValue(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },

  parseDateValue(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(date.getTime())) return null;
    return date;
  },

  formatMonthValue(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  },

  shiftMonthValue(value, delta) {
    const [year, month] = String(value || this.formatMonthValue(new Date())).split("-").map(Number);
    const date = new Date(year || new Date().getFullYear(), (month || new Date().getMonth() + 1) - 1 + delta, 1);
    return this.formatMonthValue(date);
  },

  monthLabel(value) {
    const [year, month] = String(value || "").split("-").map(Number);
    if (!year || !month) return "";
    return `${year}年${month}月`;
  },

  dateLabel(value) {
    const date = this.parseDateValue(value);
    if (!date) return "";
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
  },

  minuteOptions() {
    return Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
  },

  applicationCard(item, statuses) {
    const actionLabels = {
      preparing: "去投递",
      applied: "看进度",
      test: "去测评",
      interview: "去面试",
      offer: "看 Offer",
    };
    const actionLabel = actionLabels[item.status] || "";
    const actionUrl = item.job.sourceUrl || "#";
    const reviewLabels = {
      pending: "官方审核中",
      rejected: "审核未通过",
    };
    const reviewLabel = reviewLabels[item.job.reviewStatus] || "";
    const positionTitle = this.applicationPositionTitle(item);
    return `
      <div class="application-card" draggable="true" ondragstart="App.startApplicationDrag(event, ${item.id})" ondragend="App.endApplicationDrag(event)">
        <button class="application-remove" onclick="App.deleteApplication(${item.id})" aria-label="移出看板" title="移出看板">&times;</button>
        <strong class="application-title">
          <span>${this.escape(item.job.company)}</span>
          <button class="application-title-edit" onclick="App.setApplicationTitle(${item.id})">· ${this.escape(positionTitle || "添加岗位")}</button>
        </strong>
        <p>${this.escape(item.job.city)} · ${this.escape(item.job.batch || "未标注批次")} · ${this.escape(item.job.companyType || "未分类")} · 截止 ${this.escape(item.job.deadline)}</p>
        ${reviewLabel ? `<div class="review-badge ${this.escape(item.job.reviewStatus)}">${this.escape(reviewLabel)}</div>` : ""}
        ${this.applicationCompletionBadge(item)}
        ${this.applicationActions(item, actionLabel, actionUrl)}
      </div>
    `;
  },

  applicationActions(item, actionLabel, actionUrl) {
    const completed = this.applicationStageCompleted(item);
    const stageButtons = this.applicationStageButtons(item);
    if (!actionLabel && !stageButtons) return "";
    return `
      <div class="application-actions">
        ${completed ? "" : actionLabel ? `<a class="btn small application-action" href="${this.escape(actionUrl)}" target="_blank" rel="noopener noreferrer">${actionLabel}</a>` : ""}
        ${stageButtons}
      </div>
    `;
  },

  applicationStageButtons(item) {
    if (item.status === "test") {
      const deadlineLabel = item.assessmentDeadlineAt ? `截止 ${this.formatTimestampShort(item.assessmentDeadlineAt)}` : "截止时间";
      const completed = Boolean(item.assessmentCompletedAt);
      if (completed) {
        return `<button class="btn small application-action success" onclick="App.toggleApplicationCompletion(${item.id}, 'assessment', false)">取消完成</button>`;
      }
      return `
        <button class="btn small application-action" onclick="App.setApplicationDeadline(${item.id}, 'assessment')">${this.escape(deadlineLabel)}</button>
        <button class="btn small application-action" onclick="App.toggleApplicationCompletion(${item.id}, 'assessment', true)">已完成</button>
      `;
    }
    if (item.status === "interview") {
      const deadlineLabel = item.interviewDeadlineAt ? `面试 ${this.formatTimestampShort(item.interviewDeadlineAt)}` : "面试时间";
      const completed = Boolean(item.interviewCompletedAt);
      if (completed) {
        return `<button class="btn small application-action success" onclick="App.toggleApplicationCompletion(${item.id}, 'interview', false)">取消完成</button>`;
      }
      return `
        <button class="btn small application-action" onclick="App.setApplicationDeadline(${item.id}, 'interview')">${this.escape(deadlineLabel)}</button>
        <button class="btn small application-action" onclick="App.toggleApplicationCompletion(${item.id}, 'interview', true)">已完成</button>
      `;
    }
    return "";
  },

  applicationStageCompleted(item) {
    return (item.status === "test" && item.assessmentCompletedAt) || (item.status === "interview" && item.interviewCompletedAt);
  },

  applicationCompletionBadge(item) {
    if (item.status === "test" && item.assessmentCompletedAt) {
      return `<div class="review-badge completed">测评/笔试已完成</div>`;
    }
    if (item.status === "interview" && item.interviewCompletedAt) {
      return `<div class="review-badge completed">面试已完成</div>`;
    }
    return "";
  },

  startApplicationDrag(event, id) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(id));
    event.currentTarget.classList.add("dragging");
  },

  endApplicationDrag(event) {
    event.currentTarget.classList.remove("dragging");
    document.querySelectorAll(".kanban-column.drag-over").forEach((element) => element.classList.remove("drag-over"));
  },

  allowApplicationDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.add("drag-over");
  },

  leaveApplicationDrop(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      event.currentTarget.classList.remove("drag-over");
    }
  },

  async dropApplication(event, status) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    const id = Number(event.dataTransfer.getData("text/plain"));
    const item = this.state.applications.find((entry) => Number(entry.id) === id);
    if (!item || item.status === status) return;
    try {
      await this.patchApplication(id, { status }, `已移动到${this.applicationStatuses().find(([key]) => key === status)?.[1] || "新状态"}。`);
    } catch (error) {
      this.setError(`移动失败：${error.message}`);
      this.render();
    }
  },

  async patchApplication(id, payload, notice = "") {
    await this.api(`/api/applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const apps = await this.api("/api/applications");
    this.state.applications = apps.applications;
    if (notice) this.setNotice(notice);
    this.render();
  },

  async updateApplication(id, status) {
    await this.patchApplication(id, { status });
  },

  setApplicationTitle(id) {
    const item = this.state.applications.find((entry) => entry.id === id);
    if (!item) return;
    this.state.applicationTitleModal = {
      id,
      company: item.job?.company || "",
      value: this.applicationPositionTitle(item || {}),
    };
    this.render();
  },

  fillApplicationTitle(value) {
    const input = document.querySelector("#application-title-input");
    if (input) input.value = value;
  },

  closeApplicationTitleModal() {
    this.state.applicationTitleModal = null;
    this.render();
  },

  async saveApplicationTitleModal() {
    const modal = this.state.applicationTitleModal;
    if (!modal) return;
    const value = document.querySelector("#application-title-input")?.value || "";
    try {
      this.state.applicationTitleModal = null;
      await this.patchApplication(modal.id, { customTitle: value }, value.trim() ? "岗位名称已更新。" : "岗位名称已清除。");
    } catch (error) {
      this.setError(`更新岗位名称失败：${error.message}`);
      this.render();
    }
  },

  async clearApplicationTitleModal() {
    const modal = this.state.applicationTitleModal;
    if (!modal) return;
    try {
      this.state.applicationTitleModal = null;
      await this.patchApplication(modal.id, { customTitle: "" }, "岗位名称已清除。");
    } catch (error) {
      this.setError(`更新岗位名称失败：${error.message}`);
      this.render();
    }
  },

  setApplicationDeadline(id, kind = "assessment") {
    const item = this.state.applications.find((entry) => entry.id === id);
    if (!item) return;
    const deadlineAt = kind === "interview" ? item.interviewDeadlineAt : item.assessmentDeadlineAt;
    const currentText = this.formatTimestampInput(deadlineAt);
    const currentDate = currentText ? currentText.slice(0, 10) : this.formatDateValue(new Date());
    const currentTime = currentText ? currentText.slice(11).split(":") : ["18", "00"];
    this.state.assessmentDeadlineModal = {
      id,
      kind,
      company: item.job?.company || "",
      title: this.applicationPositionTitle(item),
      date: currentDate,
      month: this.formatMonthValue(this.parseDateValue(currentDate) || new Date()),
      hour: currentTime[0] || "18",
      minute: this.minuteOptions().includes(currentTime[1]) ? currentTime[1] : "00",
    };
    this.render();
  },

  setAssessmentDeadline(id) {
    this.setApplicationDeadline(id, "assessment");
  },

  closeAssessmentDeadlineModal() {
    this.state.assessmentDeadlineModal = null;
    this.render();
  },

  shiftAssessmentDeadlineMonth(delta) {
    if (!this.state.assessmentDeadlineModal) return;
    this.state.assessmentDeadlineModal.month = this.shiftMonthValue(this.state.assessmentDeadlineModal.month, delta);
    this.render();
  },

  selectAssessmentDeadlineDate(value) {
    if (!this.state.assessmentDeadlineModal) return;
    this.state.assessmentDeadlineModal.date = value;
    this.state.assessmentDeadlineModal.month = this.formatMonthValue(this.parseDateValue(value) || new Date());
    this.render();
  },

  updateAssessmentDeadlineTime(part, value) {
    if (!this.state.assessmentDeadlineModal) return;
    if (part === "hour") this.state.assessmentDeadlineModal.hour = value;
    if (part === "minute") this.state.assessmentDeadlineModal.minute = value;
    const modal = this.state.assessmentDeadlineModal;
    const preview = document.querySelector("#assessment-deadline-preview");
    if (preview) {
      preview.textContent = modal.date ? `${this.dateLabel(modal.date)} ${modal.hour}:${modal.minute}` : "请选择日期";
    }
  },

  async saveAssessmentDeadlineModal() {
    const modal = this.state.assessmentDeadlineModal;
    const isInterview = modal?.kind === "interview";
    if (!modal?.date) {
      this.setError(isInterview ? "请选择面试日期。" : "请选择测评/笔试截止日期。");
      this.render();
      return;
    }
    const hour = document.querySelector("#assessment-hour")?.value || modal.hour || "18";
    const minute = document.querySelector("#assessment-minute")?.value || modal.minute || "00";
    const value = `${modal.date} ${hour}:${minute}`;
    const payloadKey = isInterview ? "interviewDeadlineAt" : "assessmentDeadlineAt";
    const notice = isInterview ? "面试时间已设置，开始前 3 小时会邮件提醒。" : "测评/笔试截止时间已设置，截止前 3 小时会邮件提醒。";
    try {
      this.state.assessmentDeadlineModal = null;
      await this.patchApplication(
        modal.id,
        { [payloadKey]: value },
        notice,
      );
    } catch (error) {
      this.setError(`设置截止时间失败：${error.message}`);
      this.render();
    }
  },

  async clearAssessmentDeadlineModal() {
    const modal = this.state.assessmentDeadlineModal;
    if (!modal) return;
    const isInterview = modal.kind === "interview";
    const payloadKey = isInterview ? "interviewDeadlineAt" : "assessmentDeadlineAt";
    const notice = isInterview ? "面试提醒已清除。" : "测评/笔试提醒已清除。";
    try {
      this.state.assessmentDeadlineModal = null;
      await this.patchApplication(modal.id, { [payloadKey]: "" }, notice);
    } catch (error) {
      this.setError(`设置截止时间失败：${error.message}`);
      this.render();
    }
  },

  async toggleApplicationCompletion(id, kind, completed) {
    const isInterview = kind === "interview";
    const label = isInterview ? "面试" : "测评/笔试";
    const payload = isInterview ? { interviewCompleted: completed } : { assessmentCompleted: completed };
    try {
      await this.patchApplication(id, payload, completed ? `${label}已标记完成。` : `${label}完成标记已取消。`);
    } catch (error) {
      this.setError(`更新完成状态失败：${error.message}`);
      this.render();
    }
  },

  async deleteApplication(id) {
    if (!window.confirm("确定要把这条记录移出投递看板吗？")) return;
    try {
      await this.api(`/api/applications/${id}`, {
        method: "DELETE",
      });
      const apps = await this.api("/api/applications");
      this.state.applications = apps.applications;
      this.setNotice("已移出投递看板。");
      this.render();
    } catch (error) {
      this.setError(`移除失败：${error.message}`);
      this.render();
    }
  },

  async refreshAdminStats() {
    try {
      const [stats, submissions] = await Promise.all([
        this.api("/api/admin/stats"),
        this.api("/api/admin/job-submissions"),
      ]);
      this.state.adminStats = stats.stats;
      this.state.jobSubmissions = submissions.submissions || [];
      this.setNotice("后台统计已刷新。");
      this.render();
    } catch (error) {
      this.setError(`刷新统计失败：${error.message}`);
      this.render();
    }
  },

  async refreshJobSubmissions() {
    try {
      const submissions = await this.api("/api/admin/job-submissions");
      this.state.jobSubmissions = submissions.submissions || [];
      this.setNotice("审核列表已刷新。");
      this.render();
    } catch (error) {
      this.setError(`刷新审核列表失败：${error.message}`);
      this.render();
    }
  },

  findJobSubmission(id) {
    return (this.state.jobSubmissions || []).find((item) => Number(item.id) === Number(id));
  },

  openJobSubmissionDetail(id) {
    this.state.adminSubmissionDetailId = Number(id);
    this.render();
  },

  closeJobSubmissionDetail() {
    this.state.adminSubmissionDetailId = null;
    this.render();
  },

  async reviewJobSubmission(id, action) {
    const item = this.findJobSubmission(id);
    const detailOpen = Number(this.state.adminSubmissionDetailId) === Number(id);
    const note = detailOpen ? this.getInput("submission-review-note") : action === "reject" ? window.prompt("驳回原因（选填）") || "" : "";
    if (action === "approve") {
      const warnings = item?.warnings || [];
      const message = warnings.length
        ? `这条提交有 ${warnings.length} 个审核提醒，确认已经打开链接核对并通过？`
        : "确认已经核对链接和字段，通过后进入全站岗位库？";
      if (!window.confirm(message)) return;
    }
    try {
      await this.api(`/api/admin/job-submissions/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ action, note }),
      });
      const [submissions, stats] = await Promise.all([
        this.api("/api/admin/job-submissions"),
        this.api("/api/admin/stats"),
      ]);
      this.state.jobSubmissions = submissions.submissions || [];
      this.state.adminStats = stats.stats;
      this.state.adminSubmissionDetailId = null;
      await this.loadJobs(true);
      this.setNotice(action === "approve" ? "已通过，岗位已进入公共岗位库。" : "已驳回，岗位不会进入公共岗位库。");
      this.render();
    } catch (error) {
      this.setError(`审核失败：${error.message}`);
      this.render();
    }
  },

  interviewQuestions(job) {
    const title = job?.title || "这个岗位";
    const req = job?.requirements?.length ? job.requirements : [title, "岗位核心能力"];
    return [
      `请你用 1 分钟介绍自己，并说明为什么适合${title}。`,
      `结合一段项目或实习经历，说明你如何体现${title}需要的「${req[0]}」能力。`,
      `如果面试官围绕${title}追问你的项目结果，你会如何量化自己的贡献？`,
      `从${title}的工作内容看，你认为自己最需要补强的地方是什么？`,
    ];
  },

  interviewApplications() {
    return this.state.applications.filter((item) => item.status === "interview" && item.job);
  },

  interviewReadyApplications() {
    return this.interviewApplications().filter((item) => String(item.customTitle || "").trim());
  },

  interviewPendingTitleApplications() {
    return this.interviewApplications().filter((item) => !String(item.customTitle || "").trim());
  },

  interviewJobFromApplication(jobId) {
    const application = this.interviewReadyApplications().find((item) => Number(item.jobId) === Number(jobId));
    if (!application) return null;
    const customTitle = String(application.customTitle || "").trim();
    if (!customTitle) return null;
    return {
      ...application.job,
      id: application.jobId,
      title: customTitle,
      requirements: application.job.requirements || [],
    };
  },

  startInterview(jobId) {
    const job = this.interviewJobFromApplication(jobId);
    if (!job) {
      this.setError("请先把岗位拖到投递看板的面试列，并填写具体岗位名称。");
      this.render();
      return;
    }
    this.state.view = "interview";
    this.state.interview = {
      jobId: job?.id || null,
      jobTitle: job?.title || "",
      index: 0,
      answers: [],
      questions: this.interviewQuestions(job),
      report: null,
    };
    this.render();
  },

  renderInterview() {
    const readyApplications = this.interviewReadyApplications();
    const pendingTitleApplications = this.interviewPendingTitleApplications();
    const selectedJobId = this.state.interview?.jobId || readyApplications[0]?.jobId || null;
    const job = this.interviewJobFromApplication(selectedJobId);
    const interview = this.state.interview;
    const canStart = Boolean(readyApplications.length && selectedJobId);
    return `
      <section class="section-title">
        <div>
          <h2>AI 语音模拟面试</h2>
        </div>
      </section>
      <section class="interview-board">
        <div class="panel">
          <div class="toolbar">
            <select onchange="App.startInterview(Number(this.value))" ${canStart ? "" : "disabled"}>
              ${readyApplications.map((item) => {
                const title = String(item.customTitle || "").trim();
                return `<option value="${item.jobId}" ${Number(item.jobId) === Number(selectedJobId) ? "selected" : ""}>${this.escape(item.job.company)} · ${this.escape(title)}</option>`;
              }).join("")}
            </select>
            <button class="btn primary" ${canStart ? `onclick="App.startInterview(${selectedJobId})"` : "disabled"}>开始面试</button>
          </div>
          ${pendingTitleApplications.length ? this.renderInterviewTitleReminder(pendingTitleApplications) : ""}
          ${interview ? this.renderInterviewSession(job, interview) : canStart ? `<div class="empty">选择岗位后开始。每题可语音回答，也可以直接输入文字。</div>` : `<div class="empty">${this.interviewApplications().length ? "请先填写具体岗位名称，填写后这里才会出现可面试岗位。" : "把岗位拖到投递看板的“面试”列后，这里才会出现。"}</div>`}
        </div>
        <aside class="panel">
          <h2 style="margin-top: 0;">历史报告</h2>
          <div class="list">
            ${this.state.interviews
              .map((item) => `
                <div class="list-item">
                  <strong>${this.escape(item.report.title)}</strong>
                  <div class="muted">${this.escape(item.createdAt || "")}</div>
                  <div class="muted">${this.escape(item.report.summary)}</div>
                  <div class="toolbar" style="margin-top: 10px;">
                    <button class="btn small" onclick="App.viewInterviewReport(${item.id})">查看详情</button>
                    <button class="btn small danger" onclick="App.deleteInterviewReport(${item.id})">删除</button>
                  </div>
                </div>
              `)
              .join("")}
            ${this.state.interviews.length === 0 ? `<div class="empty">暂无报告。</div>` : ""}
          </div>
        </aside>
      </section>
    `;
  },

  renderInterviewTitleReminder(items) {
    return `
      <div class="review-warning-box warn">
        <strong>先填写具体岗位</strong>
        <p>面试题会按具体岗位生成，不再使用“招聘岗位合集”。</p>
        <div class="list">
          ${items.map((item) => `
            <div class="list-item">
              <strong>${this.escape(item.job.company)}</strong>
              <div class="muted">${this.escape(item.job.city)} · ${this.escape(item.job.batch || "未标注批次")}</div>
              <div class="toolbar" style="margin-top: 10px;">
                <button class="btn small primary" onclick="App.setApplicationTitle(${item.id})">填写岗位</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  },

  renderInterviewSession(job, interview) {
    if (interview.report) {
      return this.renderReport(interview.report, {
        interviewId: interview.historyId,
        createdAt: interview.createdAt,
        readonly: interview.readonly,
      });
    }
    const question = interview.questions[interview.index];
    return `
      <div class="question-box">
        <div class="job-meta">第 ${interview.index + 1} / ${interview.questions.length} 题 · ${this.escape(job?.company || "")} ${this.escape(job?.title || "")}</div>
        <h3>${this.escape(question)}</h3>
        <div class="form-row">
          <label>回答转写或文字回答</label>
          <textarea id="answer-text" placeholder="点击录音后说话，或直接输入你的回答。">${this.escape(interview.answers[interview.index]?.answer || "")}</textarea>
        </div>
        <div class="toolbar" style="margin-top: 14px;">
          <button class="btn ${this.state.recording ? "danger" : ""}" onclick="App.toggleRecording()">${this.state.recording ? "停止录音" : "开始录音"}</button>
          <button class="btn" onclick="App.saveCurrentAnswer()">保存本题</button>
          <button class="btn primary" onclick="App.nextQuestion()">${interview.index === interview.questions.length - 1 ? "生成报告" : "下一题"}</button>
        </div>
        <div class="muted">${this.state.recording ? "正在录音或听写，请保持麦克风权限开启。" : this.state.systemStatus?.sttConfigured ? "当前可录音转写；音频只用于本次识别。" : "当前可使用浏览器语音识别，也可手动输入。"}</div>
      </div>
    `;
  },

  renderReport(report, options = {}) {
    return `
      <div class="report-card">
        <div class="toolbar report-toolbar">
          <div class="report-score">${this.escape(report.score)}</div>
          <div class="report-heading">
            <h2 style="margin: 0;">${this.escape(report.title)}</h2>
            <p class="muted">${this.escape(report.summary)}</p>
            ${options.createdAt ? `<p class="muted">生成时间：${this.escape(options.createdAt)}</p>` : ""}
          </div>
          <div class="report-actions">
            ${options.readonly ? `<button class="btn small" onclick="App.closeInterviewReport()">返回面试</button>` : ""}
            ${options.interviewId ? `<button class="btn small danger" onclick="App.deleteInterviewReport(${options.interviewId})">删除报告</button>` : ""}
          </div>
        </div>
        <div class="grid cols-3" style="margin-top: 12px;">
          <div><h3>优势</h3><div class="list">${(report.strengths || []).map((item) => `<div class="list-item">${this.escape(item)}</div>`).join("")}</div></div>
          <div><h3>风险</h3><div class="list">${(report.risks || []).map((item) => `<div class="list-item">${this.escape(item)}</div>`).join("")}</div></div>
          <div><h3>下一步</h3><div class="list">${(report.actions || []).map((item) => `<div class="list-item">${this.escape(item)}</div>`).join("")}</div></div>
        </div>
      </div>
    `;
  },

  viewInterviewReport(id) {
    const item = this.state.interviews.find((report) => report.id === id);
    if (!item) {
      this.setError("报告不存在或已删除。");
      this.render();
      return;
    }
    this.state.interview = {
      jobId: item.jobId || null,
      index: 0,
      answers: [],
      questions: [],
      report: item.report,
      historyId: item.id,
      createdAt: item.createdAt,
      readonly: true,
    };
    this.render();
  },

  closeInterviewReport() {
    this.state.interview = null;
    this.render();
  },

  async deleteInterviewReport(id) {
    if (!confirm("确认删除这份面试报告？")) return;
    try {
      await this.api(`/api/interviews/${id}`, {
        method: "DELETE",
      });
      const interviews = await this.api("/api/interviews");
      this.state.interviews = interviews.interviews;
      if (this.state.interview?.historyId === id) {
        this.state.interview = null;
      }
      this.setNotice("面试报告已删除。");
      this.render();
    } catch (error) {
      this.setError(`删除失败：${error.message}`);
      this.render();
    }
  },

  saveCurrentAnswer() {
    const interview = this.state.interview;
    if (!interview) return;
    const answer = document.querySelector("#answer-text")?.value.trim() || "";
    interview.answers[interview.index] = {
      question: interview.questions[interview.index],
      answer,
    };
    this.setNotice("本题已保存。");
    this.render();
  },

  async nextQuestion() {
    const interview = this.state.interview;
    if (!interview) return;
    const answer = document.querySelector("#answer-text")?.value.trim() || "";
    interview.answers[interview.index] = {
      question: interview.questions[interview.index],
      answer,
    };
    if (interview.index < interview.questions.length - 1) {
      interview.index += 1;
      this.render();
      return;
    }
    const validAnswers = interview.answers.filter((item) => item.answer);
    if (!validAnswers.length) {
      this.setError("至少需要一段回答才能生成报告。");
      this.render();
      return;
    }
    const data = await this.api("/api/interviews/report", {
      method: "POST",
      body: JSON.stringify({ jobId: interview.jobId, jobTitle: interview.jobTitle || "", answers: validAnswers }),
    });
    interview.report = data.report;
    interview.historyId = data.interviewId;
    interview.createdAt = "刚刚生成";
    interview.readonly = false;
    const interviews = await this.api("/api/interviews");
    this.state.interviews = interviews.interviews;
    this.setNotice("报告已生成并保存。");
    this.render();
  },

  async toggleRecording() {
    if (this.mediaRecorder && this.state.recording) {
      this.mediaRecorder.stop();
      return;
    }

    if (this.state.systemStatus?.sttConfigured && navigator.mediaDevices && window.MediaRecorder) {
      await this.startApiRecording();
      return;
    }

    this.startBrowserSpeechRecognition();
  },

  async startApiRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.audioChunks.push(event.data);
      };
      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(this.audioChunks, { type: "audio/webm" });
        this.mediaRecorder = null;
        this.state.recording = false;
        this.setNotice("录音结束，正在转写。");
        this.render();
        try {
          const base64 = await this.blobToBase64(blob);
          const data = await this.api("/api/speech/transcribe", {
            method: "POST",
            body: JSON.stringify({ fileName: "answer.webm", mimeType: blob.type || "audio/webm", base64 }),
          });
          this.applyAnswerText(data.text || "");
          this.setNotice("语音已转写。");
          this.render();
        } catch (error) {
          this.setError(`语音转写失败：${error.message}`);
          this.render();
        }
      };
      this.mediaRecorder.start();
      this.state.recording = true;
      this.setNotice("正在录音，点击停止录音后会转写。");
      this.render();
    } catch {
      this.setError("无法获取麦克风权限，请手动输入或检查浏览器权限。");
      this.render();
    }
  },

  startBrowserSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.setError("当前浏览器不支持语音识别，请先手动输入回答。");
      this.render();
      return;
    }

    if (this.recognition && this.state.recording) {
      this.recognition.stop();
      this.state.recording = false;
      this.render();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      this.applyAnswerText(text);
    };
    recognition.onend = () => {
      this.state.recording = false;
      this.render();
    };
    recognition.onerror = () => {
      this.state.recording = false;
      this.setError("语音识别失败，请检查麦克风权限或改用文字输入。");
      this.render();
    };
    this.recognition = recognition;
    this.state.recording = true;
    recognition.start();
    this.render();
  },

  applyAnswerText(text) {
    const interview = this.state.interview;
    if (interview) {
      interview.answers[interview.index] = {
        question: interview.questions[interview.index],
        answer: text,
      };
    }
    const target = document.querySelector("#answer-text");
    if (target) target.value = text;
  },

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("audio_read_failed"));
      reader.readAsDataURL(blob);
    });
  },

  renderPlugin() {
    const rows = [
      ["姓名", "profile.name", "input[name*=name], label: 姓名"],
      ["性别", "profile.gender", "select + label: 性别"],
      ["国家/地区", "profile.countryRegion", "label: 国家 / 地区"],
      ["证件类型", "profile.idType", "label: 证件号码类型"],
      ["证件号", "profile.idNumber", "label: 证件号，敏感字段需二次确认"],
      ["邮箱", "profile.email", "input[type=email], label: 邮箱"],
      ["手机号码类型", "profile.phoneType", "label: 手机号码类型"],
      ["手机号", "profile.phone", "input[type=tel], label: 手机"],
      ["当前所处地", "profile.currentLocation", "label: 当前所处地 / 现居城市"],
      ["微信号", "profile.wechat", "label: 微信"],
      ["QQ 号", "profile.qq", "label: QQ"],
      ["紧急联系人", "profile.emergencyContact", "label: 紧急联系人"],
      ["紧急联系人电话", "profile.emergencyPhone", "label: 紧急联系人电话"],
      ["最高学历", "education.0.degree", "select + label: 学历"],
      ["学校名称", "education.0.schoolName", "label: 学校"],
      ["院系/专业", "education.0.college / education.0.major", "label: 院系、专业"],
      ["实习经历", "internships.0.* / internships", "公司、职位、起止时间、描述"],
      ["项目经历", "projects.0.* / projects", "项目名、角色、起止时间、链接、描述"],
      ["获奖信息", "awards.0.* / awards", "获奖类型、时间、奖项说明"],
      ["作品主页", "portfolios.0.* / portfolios", "作品名、链接、提取码"],
    ];
    return `
      <section class="section-title">
        <div>
          <h2>插件字段映射</h2>
          <p>插件用连接令牌从主站拉取结构化简历字段，填表前仍由用户确认。</p>
        </div>
        <button class="btn primary" onclick="App.generatePluginToken()">生成插件连接令牌</button>
      </section>
      <section class="panel">
        <div class="grid cols-2" style="margin-bottom: 16px;">
          <div class="list-item">
            <strong>主站地址</strong>
            <div class="muted">${this.escape(window.location.origin)}</div>
          </div>
          <div class="list-item">
            <strong>连接令牌</strong>
            <div class="muted">生成后只显示一次，填到 Chrome 插件弹窗里。</div>
          </div>
        </div>
        ${this.state.pluginToken ? `<textarea readonly>${this.escape(this.state.pluginToken)}</textarea>` : ""}
        <table>
          <thead><tr><th>网申页面字段</th><th>本站结构化字段</th><th>识别依据</th></tr></thead>
          <tbody>${rows.map((row) => `<tr><td>${this.escape(row[0])}</td><td>${this.escape(row[1])}</td><td>${this.escape(row[2])}</td></tr>`).join("")}</tbody>
        </table>
        <div class="notice">安全原则：只自动填充，不自动提交；身份证、住址、附件等敏感字段需要二次确认。</div>
      </section>
    `;
  },

  async generatePluginToken() {
    try {
      const data = await this.api("/api/plugin/tokens", {
        method: "POST",
        body: JSON.stringify({ name: "Chrome 插件" }),
      });
      this.state.pluginToken = data.token;
      this.setNotice("插件连接令牌已生成，只显示一次。");
      this.render();
    } catch (error) {
      this.setError(`生成失败：${error.message}`);
      this.render();
    }
  },

  renderAdminStats() {
    const stats = this.state.adminStats || {};
    const counts = stats.counts || {};
    const metrics = [
      ["真实用户", counts.realUsers ?? 0, "不含后台账号"],
      ["近 7 天活跃", counts.activeUsers7d ?? 0, "普通用户登录"],
      ["简历数量", counts.resumes ?? 0, "已保存结构化简历"],
      ["企业数量", counts.companies ?? 0, "按岗位公司去重"],
      ["岗位数量", counts.jobs ?? 0, "当前岗位库"],
      ["待审岗位", counts.pendingJobSubmissions ?? 0, "用户提交"],
      ["投递记录", counts.applications ?? 0, "用户看板记录"],
      ["面试报告", counts.interviews ?? 0, "仅报告与总结"],
      ["插件令牌", counts.pluginTokens ?? 0, "未撤销连接令牌"],
      ["数据库", this.formatBytes(stats.database?.bytes || 0), "SQLite + WAL"],
    ];
    return `
      <section class="section-title">
        <div>
          <h2>后台数据统计</h2>
          <p>只展示聚合和脱敏数据，用来判断真实用户量、岗位库规模和系统使用情况。</p>
        </div>
        <button class="btn primary" onclick="App.refreshAdminStats()">刷新统计</button>
      </section>
      <section class="panel">
        <div class="grid cols-3">
          ${metrics
            .map(([label, value, hint]) => `<div class="metric"><span>${this.escape(label)}</span><strong>${this.escape(value)}</strong><small>${this.escape(hint)}</small></div>`)
            .join("")}
        </div>
      </section>
      <div class="grid cols-3" style="margin-top: 14px;">
        ${this.renderAdminDistribution("城市分布", stats.jobsByCity)}
        ${this.renderAdminDistribution("企业类型", stats.jobsByType)}
        ${this.renderAdminDistribution("招聘批次", stats.jobsByBatch)}
      </div>
      <div class="split" style="margin-top: 14px;">
        <section class="panel">
          <h2 style="margin-top: 0;">投递状态分布</h2>
          ${this.renderAdminDistributionList(stats.applicationsByStatus)}
        </section>
        <aside class="panel">
          <h2 style="margin-top: 0;">最近注册账号</h2>
          <table>
            <thead><tr><th>邮箱</th><th>角色</th><th>注册时间</th><th>最近登录</th></tr></thead>
            <tbody>${(stats.recentUsers || []).map((item) => `<tr><td>${this.escape(item.email)}</td><td>${this.escape(item.role)}</td><td>${this.escape(item.createdAt)}</td><td>${this.escape(item.lastLoginAt || "-")}</td></tr>`).join("")}</tbody>
          </table>
        </aside>
      </div>
    `;
  },

  renderAdminDistribution(title, items) {
    return `
      <section class="panel">
        <h2 style="margin-top: 0;">${this.escape(title)}</h2>
        ${this.renderAdminDistributionList(items)}
      </section>
    `;
  },

  renderAdminDistributionList(items) {
    const rows = items || [];
    if (!rows.length) return `<div class="empty">暂无数据</div>`;
    const max = Math.max(...rows.map((item) => item.count || 0), 1);
    return `
      <div class="stat-list">
        ${rows
          .map((item) => `
            <div class="stat-row">
              <div><span>${this.escape(item.label)}</span><strong>${this.escape(item.count)}</strong></div>
              <i style="width: ${Math.max(8, Math.round(((item.count || 0) / max) * 100))}%"></i>
            </div>
          `)
          .join("")}
      </div>
    `;
  },

  renderSubmissionValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join("、") || "-";
    return String(value ?? "").trim() || "-";
  },

  renderJobSubmissionDetailModal() {
    const id = this.state.adminSubmissionDetailId;
    if (!id) return "";
    const item = this.findJobSubmission(id);
    if (!item) return "";
    const job = item.job || {};
    const payload = item.payload || {};
    const statusLabels = {
      pending: "待审核",
      approved: "已通过",
      rejected: "已驳回",
    };
    const fields = [
      ["公司", job.company, payload.company],
      ["岗位名称", job.title, payload.title],
      ["批次", job.batch, payload.batch],
      ["城市", job.city, payload.city],
      ["岗位方向/行业", job.category, payload.category],
      ["企业类型", job.companyType, payload.companyType],
      ["截止日期", job.deadline, payload.deadline],
      ["关键词", job.requirements, payload.requirements],
    ];
    const description = this.renderSubmissionValue(job.description || payload.description);
    const warnings = item.warnings || [];
    return `
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <section class="parse-modal submission-detail-modal">
          <div class="modal-head">
            <span class="modal-indicator ${warnings.length ? "warn" : "ok"}"></span>
            <div>
              <h3>提交详情</h3>
              <p>${this.escape(item.submitter || "-")} · ${this.escape(item.createdAt || "-")} · ${this.escape(statusLabels[item.status] || item.status)}</p>
            </div>
          </div>

          <div class="review-warning-box ${warnings.length ? "warn" : "ok"}">
            <strong>${warnings.length ? "需要核对" : "基础校验通过"}</strong>
            ${
              warnings.length
                ? `<ul>${warnings.map((warning) => `<li>${this.escape(warning)}</li>`).join("")}</ul>`
                : `<p>仍需打开官方链接，确认公司、批次和网申入口真实对应后再通过。</p>`
            }
          </div>

          <div class="submission-fields">
            ${fields
              .map(([label, normalized, raw]) => {
                const normalizedText = this.renderSubmissionValue(normalized);
                const rawText = this.renderSubmissionValue(raw);
                const changed = rawText !== "-" && rawText !== normalizedText;
                return `
                  <div class="submission-field">
                    <span>${this.escape(label)}</span>
                    <strong>${this.escape(normalizedText)}</strong>
                    ${changed ? `<small>用户原填：${this.escape(rawText)}</small>` : ""}
                  </div>
                `;
              })
              .join("")}
          </div>

          <div class="submission-link-row">
            <span>官方链接</span>
            <a href="${this.escape(job.sourceUrl || payload.sourceUrl || "")}" target="_blank" rel="noopener noreferrer">${this.escape(job.sourceUrl || payload.sourceUrl || "-")}</a>
          </div>

          <div class="submission-description">
            <span>备注/岗位说明</span>
            <p>${this.escape(description)}</p>
          </div>

          <div class="form-row">
            <label>审核备注</label>
            <textarea id="submission-review-note" placeholder="通过可留空；驳回建议写明原因。">${this.escape(item.reviewNote || job.reviewNote || "")}</textarea>
          </div>

          <div class="toolbar modal-actions">
            ${
              item.status === "pending"
                ? `
                  <a class="btn" href="${this.escape(job.sourceUrl || payload.sourceUrl || "")}" target="_blank" rel="noopener noreferrer">打开链接核对</a>
                  <button class="btn primary" onclick="App.reviewJobSubmission(${item.id}, 'approve')">通过</button>
                  <button class="btn danger" onclick="App.reviewJobSubmission(${item.id}, 'reject')">驳回</button>
                `
                : `<span class="muted">审核结果：${this.escape(statusLabels[item.status] || item.status)}</span>`
            }
            <button class="btn ghost" onclick="App.closeJobSubmissionDetail()">关闭</button>
          </div>
        </section>
      </div>
    `;
  },

  renderJobSubmissionQueue() {
    const submissions = this.state.jobSubmissions || [];
    const pending = submissions.filter((item) => item.status === "pending");
    const visible = pending.length ? pending : submissions.slice(0, 6);
    const statusLabels = {
      pending: "待审核",
      approved: "已通过",
      rejected: "已驳回",
    };
    return `
      <section class="panel" style="margin-bottom: 14px;">
        <div class="company-detail-head">
          <div>
            <h3 style="margin-top: 0;">用户提交审核</h3>
            <p class="muted">通过后进入全站岗位库；驳回后仍只保留在提交用户自己的投递看板。</p>
          </div>
          <button class="btn small" onclick="App.refreshJobSubmissions()">刷新</button>
        </div>
        ${
          visible.length
            ? `<table>
                <thead><tr><th>公司</th><th>批次</th><th>城市</th><th>提交人</th><th>状态</th><th>链接</th><th>操作</th></tr></thead>
                <tbody>${visible
                  .map((item) => `
                    <tr>
                      <td><strong>${this.escape(item.job.company)}</strong><br><span class="muted">${this.escape(item.job.title)}</span></td>
                      <td>${this.escape(item.job.batch || "未标注")}</td>
                      <td>${this.escape(item.job.city || "未标注")}</td>
                      <td>${this.escape(item.submitter || "-")}</td>
                      <td>${this.escape(statusLabels[item.status] || item.status)}</td>
                      <td><a href="${this.escape(item.job.sourceUrl)}" target="_blank" rel="noopener noreferrer">打开</a></td>
                      <td>
                        <div class="toolbar table-actions">
                          <button class="btn small primary" onclick="App.openJobSubmissionDetail(${item.id})">查看详情</button>
                          ${item.warnings?.length ? `<span class="review-badge rejected">提醒 ${item.warnings.length}</span>` : ""}
                        </div>
                      </td>
                    </tr>
                  `)
                  .join("")}</tbody>
              </table>`
            : `<div class="empty">暂无待审核岗位</div>`
        }
      </section>
    `;
  },

  renderAdmin() {
    const csvSample = `company,title,city,category,companyType,batch,deadline,sourceUrl,description,requirements
中国移动,招聘岗位合集,北京,产品,央企,27届秋招,2026-09-30,https://job.10086.cn,负责产品规划和需求推进,产品设计、数据分析、沟通协作
某某银行,招聘岗位合集,上海,技术,国企,27届秋招,2026-10-15,https://career.example-bank.com,参与金融科技项目和数据平台建设,Python、SQL、数据分析`;
    return `
      <section class="section-title">
        <div>
          <h2>招聘企业与岗位管理</h2>
          <p>维护真实企业岗位库；手动新增和 CSV 导入都以官方链接作为去重依据。</p>
        </div>
      </section>
      ${this.renderJobSubmissionQueue()}
      <div class="split">
        <section class="panel">
          <h2 style="margin-top: 0;">手动新增/更新</h2>
          <div class="resume-form">
            ${this.textField("admin-company", "公司", "")}
            ${this.textField("admin-title", "岗位名称", "")}
            ${this.textField("admin-city", "城市", "")}
            ${this.textField("admin-category", "岗位方向", "")}
            ${this.selectField("admin-companyType", "企业类型", "", ["", "央企", "国企", "民企", "外企", "事业单位", "政府机关", "其他"])}
            ${this.selectField("admin-batch", "招聘批次", "27届秋招", ["27届秋招", "实习", "26届春招"])}
            ${this.textField("admin-deadline", "截止日期", "", "date")}
            ${this.textField("admin-sourceUrl", "官方校招/网申链接", "")}
            ${this.textareaField("admin-requirements", "岗位要求关键词", "")}
            ${this.textareaField("admin-description", "岗位描述", "")}
          </div>
          <div class="toolbar" style="margin-top: 14px;">
            <button class="btn primary" onclick="App.saveJob()">保存岗位</button>
          </div>
        </section>
        <aside class="panel">
          <h2 style="margin-top: 0;">CSV 导入</h2>
          <p class="muted">支持英文表头，也支持“公司、岗位名称、城市、企业类型、网申链接”等中文表头。</p>
          <input type="file" accept=".csv,text/csv" onchange="App.readCsvFile(this)" />
          <textarea id="admin-csv" style="margin-top: 12px;">${this.escape(csvSample)}</textarea>
          <div class="toolbar" style="margin-top: 12px;">
            <button class="btn primary" onclick="App.importJobsCsv()">导入 CSV</button>
          </div>
          ${this.state.importResult ? `<div class="notice">已导入 ${this.state.importResult.imported} 条，错误 ${this.state.importResult.errors.length} 条。</div>` : ""}
        </aside>
      </div>
      <section class="panel" style="margin-top: 14px;">
        <h2 style="margin-top: 0;">腾讯文档同步</h2>
        <p class="muted">读取两张在线表格，按公司和校招链接合并；明确截止早于 2026-08-18 的数据会跳过。</p>
        <div class="toolbar">
          <label class="inline-field">开始日期<input id="sync-start" type="date" value="2026-07-01" /></label>
          <label class="inline-field">结束日期<input id="sync-end" type="date" value="2026-08-18" /></label>
          <label class="inline-field">最早截止<input id="sync-min-deadline" type="date" value="2026-08-18" /></label>
          <button class="btn" onclick="App.syncTencentJobs('preview')">预览</button>
          <button class="btn primary" onclick="App.syncTencentJobs('import')">导入真实数据</button>
        </div>
        ${this.renderSyncResult()}
      </section>
      <section class="panel" style="margin-top: 14px;">
        <h2 style="margin-top: 0;">当前岗位库</h2>
        <p class="muted">当前批次已加载 ${this.state.jobs.length}/${this.state.jobsMeta?.total || this.state.jobs.length} 条。</p>
        <table>
          <thead><tr><th>公司</th><th>批次</th><th>城市</th><th>类型</th><th>截止</th><th>链接</th><th>操作</th></tr></thead>
          <tbody>${this.state.jobs.map((job) => `<tr><td>${this.escape(job.company)}</td><td>${this.escape(job.batch || "未标注")}</td><td>${this.escape(job.city)}</td><td>${this.escape(job.companyType || "未分类")}</td><td>${this.escape(job.deadline)}</td><td><a href="${this.escape(job.sourceUrl)}" target="_blank" rel="noopener noreferrer">打开</a></td><td><button class="btn small danger" onclick="App.deleteJob(${job.id})">删除</button></td></tr>`).join("")}</tbody>
        </table>
        ${this.renderJobsPager()}
      </section>
    `;
  },

  renderSyncResult() {
    const result = this.state.syncResult;
    if (!result) return "";
    const summary = result.summary || {};
    const skipped = summary.skipped || {};
    return `
      <div class="notice">
        ${result.action === "import" ? `已导入/更新 ${result.imported || 0} 条。` : "预览完成。"}
        扫描 ${summary.scanned || 0} 行，符合规则 ${summary.matched || 0} 行，合并去重 ${summary.deduped || 0} 行，待写入 ${summary.ready || 0} 条。
      </div>
      <div class="grid cols-2">
        <div class="mini-list">
          <strong>跳过原因</strong>
          ${Object.keys(skipped).length ? Object.entries(skipped).map(([key, count]) => `<span>${this.escape(key)}：${count}</span>`).join("") : `<span>无</span>`}
        </div>
        <div class="mini-list">
          <strong>样本</strong>
          ${(result.sample || []).slice(0, 6).map((item) => `<span>${this.escape(item.company)} · ${this.escape(item.batch)} · ${this.escape(item.city)}</span>`).join("") || `<span>无样本</span>`}
        </div>
      </div>
    `;
  },

  collectAdminJob() {
    return {
      company: this.getInput("admin-company"),
      title: this.getInput("admin-title"),
      city: this.getInput("admin-city"),
      category: this.getInput("admin-category"),
      companyType: this.getInput("admin-companyType"),
      batch: this.getInput("admin-batch"),
      deadline: this.getInput("admin-deadline"),
      sourceUrl: this.getInput("admin-sourceUrl"),
      requirements: this.getInput("admin-requirements"),
      description: this.getInput("admin-description"),
    };
  },

  async saveJob() {
    try {
      await this.api("/api/admin/jobs", {
        method: "POST",
        body: JSON.stringify(this.collectAdminJob()),
      });
      await this.loadJobs(true);
      const stats = await this.api("/api/admin/stats");
      this.state.adminStats = stats.stats;
      this.setNotice("岗位已保存。");
      this.render();
    } catch (error) {
      this.setError(`保存岗位失败：${error.message}`);
      this.render();
    }
  },

  readCsvFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const target = document.querySelector("#admin-csv");
      if (target) target.value = String(reader.result || "");
    };
    reader.readAsText(file);
  },

  async importJobsCsv() {
    try {
      const csv = document.querySelector("#admin-csv")?.value || "";
      const data = await this.api("/api/admin/jobs/import-csv", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      await this.loadJobs(true);
      this.state.importResult = data;
      const stats = await this.api("/api/admin/stats");
      this.state.adminStats = stats.stats;
      this.setNotice("CSV 导入完成。");
      this.render();
    } catch (error) {
      this.setError(`CSV 导入失败：${error.message}`);
      this.render();
    }
  },

  async syncTencentJobs(action) {
    try {
      const payload = {
        action,
        startDate: document.querySelector("#sync-start")?.value || "2026-07-01",
        endDate: document.querySelector("#sync-end")?.value || "2026-08-18",
        minDeadline: document.querySelector("#sync-min-deadline")?.value || "2026-08-18",
      };
      const data = await this.api("/api/admin/jobs/sync-tencent", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      this.state.syncResult = data;
      if (action === "import") {
        await this.loadJobs(true);
        const stats = await this.api("/api/admin/stats");
        this.state.adminStats = stats.stats;
      }
      this.setNotice(action === "import" ? "腾讯文档数据已导入。" : "腾讯文档同步预览完成。");
      this.render();
    } catch (error) {
      this.setError(`腾讯文档同步失败：${error.message}`);
      this.render();
    }
  },

  async deleteJob(id) {
    if (!confirm("确认删除这个岗位？")) return;
    try {
      await this.api(`/api/admin/jobs/${id}`, {
        method: "DELETE",
      });
      await this.loadJobs(true);
      const stats = await this.api("/api/admin/stats");
      this.state.adminStats = stats.stats;
      this.setNotice("岗位已删除。");
      this.render();
    } catch (error) {
      this.setError(`删除岗位失败：${error.message}`);
      this.render();
    }
  },

  renderSettings() {
    const status = this.state.systemStatus || {};
    const isAdmin = Boolean(status.admin);
    if (!isAdmin) {
      return `
        <section class="section-title">
          <div>
            <h2>账号与数据</h2>
          </div>
        </section>
        <section class="panel">
          <div class="metric"><span>账号</span><strong>${this.escape(this.state.user.email.split("@")[0])}</strong><small>邮箱验证码登录</small></div>
          <div class="toolbar" style="margin-top: 16px; margin-bottom: 0;">
            <button class="btn primary" onclick="App.exportData()">导出数据</button>
          </div>
        </section>
        ${this.renderLegalSettingsPanel()}
      `;
    }
    const statusRows = [
      ["验证码发信 SMTP", status.smtpConfigured],
      ["大模型 API", status.aiConfigured],
      ["语音转写 STT API", status.sttConfigured],
      ["简历解析 API/AI", status.resumeParseConfigured],
      ["后台权限", status.admin],
    ];
    const models = status.models || {};
    const modelRows = [
      ["简历解析/结构化 JSON", models.resume],
      ["面试报告生成", models.interview],
      ["能力标签/岗位匹配", models.fast],
      ["扫描版简历 OCR", models.ocr],
      ["语音转文字", models.stt],
    ].filter(([, value]) => value);
    return `
      <section class="section-title">
        <div>
          <h2>系统设置</h2>
          <p>检查外部能力接入状态和后台权限。</p>
        </div>
      </section>
      <section class="panel">
        <div class="grid cols-3">
          <div class="metric"><span>账号</span><strong>${this.escape(this.state.user.email.split("@")[0])}</strong><small>邮箱验证码登录</small></div>
          <div class="metric"><span>存储策略</span><strong>轻量</strong><small>只存必要数据</small></div>
          <div class="metric"><span>AI 数据</span><strong>最小化</strong><small>不存音视频原件</small></div>
        </div>
        <div class="status-grid">
          ${statusRows
            .map(([label, ok]) => `<div class="status-row"><span>${this.escape(label)}</span><strong class="${ok ? "ok" : "warn"}">${ok ? "已配置" : "未配置"}</strong></div>`)
            .join("")}
        </div>
        <div class="status-grid">
          ${modelRows
            .map(([label, value]) => `<div class="status-row"><span>${this.escape(label)}</span><strong>${this.escape(value)}</strong></div>`)
            .join("")}
        </div>
      </section>
      ${this.renderLegalSettingsPanel()}
    `;
  },

  renderLegalSettingsPanel() {
    return `
      <section class="panel legal-panel">
        <div>
          <h3>协议与隐私</h3>
          <p class="muted">查看服务边界、数据使用范围和第三方能力说明。</p>
        </div>
        <div class="toolbar">
          <button class="btn" onclick="App.openLegalDoc('terms')">用户协议</button>
          <button class="btn" onclick="App.openLegalDoc('privacy')">隐私政策</button>
        </div>
      </section>
    `;
  },

  async exportData() {
    const data = await this.api("/api/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `offeros-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.setNotice("数据导出已开始下载。");
  },
};

window.App = App;
App.init();
