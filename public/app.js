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
    query: "",
    category: "all",
    city: "all",
    companyType: "all",
    systemStatus: null,
    pluginToken: "",
    importResult: null,
    pendingParse: null,
    parseProgress: null,
    interview: null,
    recording: false,
    error: "",
    notice: "",
    toast: null,
  },
  parseTimer: null,
  toastTimer: null,

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
      throw new Error(data.error || "request_failed");
    }
    return data;
  },

  async loadData() {
    const status = await this.api("/api/system/status");
    this.state.systemStatus = status;
    const jobs = await this.api("/api/jobs");
    this.state.jobs = jobs.jobs;

    if (status.admin) {
      const stats = await this.api("/api/admin/stats");
      this.state.adminStats = stats.stats;
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
            <div><strong>进程持续可见</strong><span>收藏、投递、笔试、面试和 Offer 状态集中管理。</span></div>
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
          <div class="toolbar" style="margin-top: 14px;">
            <button class="btn primary" onclick="App.verifyCode()">进入工作台</button>
          </div>
          ${message ? `<div class="notice">${this.escape(message)}</div>` : ""}
          <div id="auth-feedback"></div>
        </section>
      </main>
    `;
  },

  authFeedback(html, type = "notice") {
    const el = document.querySelector("#auth-feedback");
    if (el) el.innerHTML = `<div class="${type}">${html}</div>`;
  },

  async sendCode() {
    const email = document.querySelector("#email").value.trim();
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
    try {
      const data = await this.api("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email, code }),
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
    this.state.view = view;
    this.state.notice = "";
    this.state.error = "";
    this.render();
  },

  render() {
    if (!this.state.user) {
      this.renderAuth();
      return;
    }
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
                : `<div>求职资料闭环</div><div>简历 / 岗位 / 投递 / 面试</div>`
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
    `;
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

  matchJob(job) {
    const tags = new Set(this.tagNames());
    const hits = job.requirements.filter((item) => tags.has(item));
    const score = Math.min(96, 42 + Math.round((hits.length / Math.max(job.requirements.length, 1)) * 52));
    const missing = job.requirements.filter((item) => !tags.has(item));
    return {
      score,
      hits,
      missing,
      reason: hits.length
        ? `匹配 ${hits.join("、")}。`
        : "简历能力标签还不够明确，建议先完善项目和技能。",
    };
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
    return `
      <section class="section-title">
        <div>
          <h2>今日工作台</h2>
          <p>先把简历、岗位、投递和面试串成一条线。</p>
        </div>
        <button class="btn primary" onclick="App.nav('resume')">完善简历</button>
      </section>
      <section class="grid cols-4">
        <div class="metric"><span>简历完整度</span><strong>${completion}%</strong><small>结构化字段 + 能力标签</small></div>
        <div class="metric"><span>可匹配岗位</span><strong>${this.state.jobs.length}</strong><small>当前种子岗位库</small></div>
        <div class="metric"><span>投递记录</span><strong>${apps.length}</strong><small>收藏到 Offer 全流程</small></div>
        <div class="metric"><span>面试报告</span><strong>${this.state.interviews.length}</strong><small>只存报告和总结</small></div>
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
              <input type="file" id="resume-file" onchange="App.parseResumeFile(this)" accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" hidden />
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
      const data = await this.apiJsonWithUploadProgress(
        "/api/resume/parse-file",
        { fileName: file.name, mimeType: file.type || "application/octet-stream", base64 },
        (progress) => {
          if (progress.complete) {
            this.updateParseProgress({
              phaseLabel: "解析中",
              detail: "文件已上传，正在提取文本并结构化字段",
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
            <p class="muted">${this.escape(progress.detail || "")}</p>
            <p class="muted">真实耗时：${progress.elapsedSeconds || 0}s</p>
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

  apiJsonWithUploadProgress(path, payload, onUploadProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", path);
      xhr.withCredentials = true;
      xhr.timeout = 120000;
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
          reject(new Error(data.error || "request_failed"));
        }
      };
      xhr.onerror = () => reject(new Error("network_error"));
      xhr.ontimeout = () => reject(new Error("request_timeout"));
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
      const inCategory = this.state.category === "all" || job.category === this.state.category;
      const inCity = this.state.city === "all" || job.city === this.state.city;
      const inCompanyType = this.state.companyType === "all" || job.companyType === this.state.companyType;
      const text = `${job.company} ${job.title} ${job.city} ${job.category} ${job.companyType || ""} ${job.description} ${job.requirements.join(" ")}`.toLowerCase();
      return inCategory && inCity && inCompanyType && (!query || text.includes(query));
    });
  },

  renderJobs() {
    const categories = ["all", ...new Set(this.state.jobs.map((job) => job.category))];
    const cities = ["all", ...new Set(this.state.jobs.map((job) => job.city))];
    const companyTypes = ["all", ...new Set(this.state.jobs.map((job) => job.companyType || "未分类"))];
    const jobs = this.filteredJobs().sort((a, b) => this.matchJob(b).score - this.matchJob(a).score);
    return `
      <section class="section-title">
        <div>
          <h2>岗位匹配</h2>
          <p>按能力匹配、城市、岗位方向和企业类型筛选，去投递会打开官方校招链接。</p>
        </div>
      </section>
      <section class="panel">
        <div class="toolbar">
          <input value="${this.escape(this.state.query)}" placeholder="搜索公司、岗位、城市、能力、企业类型" oninput="App.setQuery(this.value)" />
          <select onchange="App.setCity(this.value)">
            ${cities.map((item) => `<option value="${this.escape(item)}" ${this.state.city === item ? "selected" : ""}>${item === "all" ? "全部城市" : this.escape(item)}</option>`).join("")}
          </select>
          <select onchange="App.setCategory(this.value)">
            ${categories.map((item) => `<option value="${this.escape(item)}" ${this.state.category === item ? "selected" : ""}>${item === "all" ? "全部方向" : this.escape(item)}</option>`).join("")}
          </select>
          <select onchange="App.setCompanyType(this.value)">
            ${companyTypes.map((item) => `<option value="${this.escape(item)}" ${this.state.companyType === item ? "selected" : ""}>${item === "all" ? "全部类型" : this.escape(item)}</option>`).join("")}
          </select>
        </div>
        <div class="grid cols-2">${jobs.length ? jobs.map((job) => this.jobCard(job)).join("") : `<div class="empty">没有匹配的岗位，试着放宽城市或企业类型。</div>`}</div>
      </section>
    `;
  },

  setQuery(value) {
    this.state.query = value;
    this.render();
  },

  setCategory(value) {
    this.state.category = value;
    this.render();
  },

  setCity(value) {
    this.state.city = value;
    this.render();
  },

  setCompanyType(value) {
    this.state.companyType = value;
    this.render();
  },

  jobCard(job, compact = false) {
    const match = this.matchJob(job);
    const app = this.state.applications.find((item) => item.jobId === job.id);
    const appStatus = app ? `已加入：${app.statusLabel || "投递看板"}` : "";
    return `
      <article class="job-card">
        <div class="job-head">
          <div>
            <h3 class="job-title">${this.escape(job.company)} · ${this.escape(job.title)}</h3>
            <div class="job-meta">${this.escape(job.city)} · ${this.escape(job.category)} · ${this.escape(job.companyType || "未分类")} · 截止 ${this.escape(job.deadline)}</div>
          </div>
          <div class="match">${match.score}%</div>
        </div>
        <p class="muted" style="margin: 0;">${this.escape(job.description)}</p>
        <div class="chips">
          ${job.requirements.map((req) => `<span class="chip ${match.hits.includes(req) ? "green" : "amber"}">${this.escape(req)}</span>`).join("")}
        </div>
        <div class="muted">${this.escape(match.reason)}${match.missing.length ? ` 缺口：${this.escape(match.missing.slice(0, 2).join("、"))}` : ""}</div>
        ${appStatus ? `<div class="muted">${this.escape(appStatus)}</div>` : ""}
        <div class="toolbar">
          <a class="btn small primary" href="${this.escape(job.sourceUrl)}" target="_blank" rel="noopener noreferrer">去投递</a>
          <button class="btn small" onclick="App.addApplication(${job.id}, 'saved')">${app ? "改为收藏" : "收藏"}</button>
          <button class="btn small" onclick="App.addApplication(${job.id}, 'applied')">标记已投递</button>
          ${app ? `<button class="btn small danger" onclick="App.deleteApplication(${app.id})">取消加入</button>` : ""}
          ${compact ? "" : `<button class="btn small" onclick="App.startInterview(${job.id})">练面试</button>`}
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
      this.setNotice(status === "applied" ? "已加入投递看板：已投递。" : "已加入投递看板：已收藏。");
      this.render();
    } catch (error) {
      this.setError(`操作失败：${error.message}`);
      this.render();
    }
  },

  renderApplications() {
    const statuses = [
      ["saved", "已收藏"],
      ["preparing", "准备投递"],
      ["applied", "已投递"],
      ["test", "测评/笔试"],
      ["interview", "面试"],
      ["offer", "Offer"],
      ["rejected", "已拒绝"],
    ];
    return `
      <section class="section-title">
        <div>
          <h2>投递看板</h2>
          <p>不用打开很多招聘网站，也能先把状态统一管起来。</p>
        </div>
        <button class="btn primary" onclick="App.nav('jobs')">添加岗位</button>
      </section>
      <section class="kanban">
        ${statuses
          .map(([status, label]) => {
            const items = this.state.applications.filter((item) => item.status === status);
            return `
              <div class="kanban-column">
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

  applicationCard(item, statuses) {
    return `
      <div class="application-card">
        <strong>${this.escape(item.job.company)} · ${this.escape(item.job.title)}</strong>
        <p>${this.escape(item.job.city)} · ${this.escape(item.job.category)} · ${this.escape(item.job.companyType || "未分类")} · 截止 ${this.escape(item.job.deadline)}</p>
        <select onchange="App.updateApplication(${item.id}, this.value)">
          ${statuses.map(([status, label]) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <div class="toolbar" style="margin-top: 10px;">
          <a class="btn small" href="${this.escape(item.job.sourceUrl || "#")}" target="_blank" rel="noopener noreferrer">去投递</a>
          <button class="btn small danger" onclick="App.deleteApplication(${item.id})">移出看板</button>
        </div>
      </div>
    `;
  },

  async updateApplication(id, status) {
    await this.api(`/api/applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    const apps = await this.api("/api/applications");
    this.state.applications = apps.applications;
    this.render();
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
      const stats = await this.api("/api/admin/stats");
      this.state.adminStats = stats.stats;
      this.setNotice("后台统计已刷新。");
      this.render();
    } catch (error) {
      this.setError(`刷新统计失败：${error.message}`);
      this.render();
    }
  },

  interviewQuestions(job) {
    const req = job?.requirements || ["岗位要求"];
    return [
      `请你用 1 分钟介绍自己，并说明为什么适合${job ? job.title : "这个岗位"}。`,
      `结合一段项目或实习经历，说明你如何体现「${req[0]}」能力。`,
      `如果面试官追问你的项目结果，你会如何量化自己的贡献？`,
      `这个岗位还要求「${req[1] || req[0]}」，你认为自己最需要补强的地方是什么？`,
    ];
  },

  startInterview(jobId) {
    const job = this.state.jobs.find((item) => item.id === jobId) || this.state.jobs[0];
    this.state.view = "interview";
    this.state.interview = {
      jobId: job?.id || null,
      index: 0,
      answers: [],
      questions: this.interviewQuestions(job),
      report: null,
    };
    this.render();
  },

  renderInterview() {
    const selectedJobId = this.state.interview?.jobId || this.state.jobs[0]?.id;
    const job = this.state.jobs.find((item) => item.id === Number(selectedJobId));
    const interview = this.state.interview;
    return `
      <section class="section-title">
        <div>
          <h2>AI 语音模拟面试</h2>
          <p>不保存音视频原件。语音转写用于生成报告，默认只留总结。</p>
        </div>
      </section>
      <section class="interview-board">
        <div class="panel">
          <div class="toolbar">
            <select onchange="App.startInterview(Number(this.value))">
              ${this.state.jobs.map((item) => `<option value="${item.id}" ${item.id === selectedJobId ? "selected" : ""}>${this.escape(item.company)} · ${this.escape(item.title)}</option>`).join("")}
            </select>
            <button class="btn primary" onclick="App.startInterview(${selectedJobId})">开始面试</button>
          </div>
          ${interview ? this.renderInterviewSession(job, interview) : `<div class="empty">选择岗位后开始。每题可语音回答，也可以直接输入文字。</div>`}
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
      body: JSON.stringify({ jobId: interview.jobId, answers: validAnswers }),
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
      ["实习经历", "internships", "textarea + label: 实习"],
      ["项目经历", "projects", "textarea + label: 项目"],
      ["作品链接", "portfolios", "label: 作品 / 主页"],
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
        ${this.renderAdminDistribution("岗位方向", stats.jobsByCategory)}
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

  renderAdmin() {
    const csvSample = `company,title,city,category,companyType,deadline,sourceUrl,description,requirements
中国移动,产品经理校招,北京,产品,央企,2026-09-30,https://job.10086.cn,负责产品规划和需求推进,产品设计、数据分析、沟通协作
某某银行,金融科技管培生,上海,技术,国企,2026-10-15,https://career.example-bank.com,参与金融科技项目和数据平台建设,Python、SQL、数据分析`;
    return `
      <section class="section-title">
        <div>
          <h2>招聘企业与岗位管理</h2>
          <p>维护真实企业岗位库；手动新增和 CSV 导入都以官方链接作为去重依据。</p>
        </div>
      </section>
      <div class="split">
        <section class="panel">
          <h2 style="margin-top: 0;">手动新增/更新</h2>
          <div class="resume-form">
            ${this.textField("admin-company", "公司", "")}
            ${this.textField("admin-title", "岗位名称", "")}
            ${this.textField("admin-city", "城市", "")}
            ${this.textField("admin-category", "岗位方向", "")}
            ${this.selectField("admin-companyType", "企业类型", "", ["", "央企", "国企", "民企", "外企", "事业单位", "政府机关", "其他"])}
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
        <h2 style="margin-top: 0;">当前岗位库</h2>
        <table>
          <thead><tr><th>公司</th><th>岗位</th><th>城市</th><th>类型</th><th>截止</th><th>链接</th><th>操作</th></tr></thead>
          <tbody>${this.state.jobs.map((job) => `<tr><td>${this.escape(job.company)}</td><td>${this.escape(job.title)}</td><td>${this.escape(job.city)}</td><td>${this.escape(job.companyType || "未分类")}</td><td>${this.escape(job.deadline)}</td><td><a href="${this.escape(job.sourceUrl)}" target="_blank" rel="noopener noreferrer">打开</a></td><td><button class="btn small danger" onclick="App.deleteJob(${job.id})">删除</button></td></tr>`).join("")}</tbody>
        </table>
      </section>
    `;
  },

  collectAdminJob() {
    return {
      company: this.getInput("admin-company"),
      title: this.getInput("admin-title"),
      city: this.getInput("admin-city"),
      category: this.getInput("admin-category"),
      companyType: this.getInput("admin-companyType"),
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
      const jobs = await this.api("/api/jobs");
      this.state.jobs = jobs.jobs;
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
      const jobs = await this.api("/api/jobs");
      this.state.jobs = jobs.jobs;
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

  async deleteJob(id) {
    if (!confirm("确认删除这个岗位？")) return;
    try {
      await this.api(`/api/admin/jobs/${id}`, {
        method: "DELETE",
      });
      const jobs = await this.api("/api/jobs");
      this.state.jobs = jobs.jobs;
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
            <p>管理账号数据与导出备份。</p>
          </div>
        </section>
        <section class="panel">
          <div class="grid cols-3">
            <div class="metric"><span>账号</span><strong>${this.escape(this.state.user.email.split("@")[0])}</strong><small>邮箱验证码登录</small></div>
            <div class="metric"><span>资料范围</span><strong>求职资料</strong><small>简历、投递和面试报告</small></div>
            <div class="metric"><span>语音数据</span><strong>不保留原件</strong><small>只保存报告和总结</small></div>
          </div>
          <div class="toolbar" style="margin-top: 16px;">
            <button class="btn primary" onclick="App.exportData()">导出数据</button>
          </div>
          <textarea id="export-box" placeholder="导出的 JSON 会显示在这里。"></textarea>
        </section>
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
    `;
  },

  async exportData() {
    const data = await this.api("/api/export");
    document.querySelector("#export-box").value = JSON.stringify(data, null, 2);
  },
};

window.App = App;
App.init();
