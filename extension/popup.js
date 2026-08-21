const FIELD_OPTIONS = [
  ["profile.name", "姓名"],
  ["profile.familyName", "姓"],
  ["profile.givenName", "名"],
  ["profile.gender", "性别"],
  ["profile.countryRegion", "国家/地区"],
  ["profile.idType", "证件类型"],
  ["profile.idNumber", "证件号"],
  ["profile.phoneType", "手机号码类型"],
  ["profile.phone", "手机号"],
  ["profile.email", "邮箱"],
  ["profile.currentLocation", "当前所在地"],
  ["profile.wechat", "微信号"],
  ["profile.qq", "QQ号"],
  ["profile.emergencyContact", "紧急联系人"],
  ["profile.emergencyPhone", "紧急联系人电话"],
  ["education.0.degree", "学历"],
  ["education.0.schoolName", "学校名称"],
  ["education.0.studyLocation", "就读地"],
  ["education.0.startDate", "教育开始时间"],
  ["education.0.endDate", "教育结束时间"],
  ["education.0.college", "院系"],
  ["education.0.major", "专业"],
  ["education.0.rank", "成绩排名"],
  ["education.0.gpa", "GPA"],
  ["education.0.gpaBase", "GPA Base"],
  ["internships.0.company", "第一段实习公司"],
  ["internships.0.position", "第一段实习职位"],
  ["internships.0.startDate", "第一段实习开始时间"],
  ["internships.0.endDate", "第一段实习结束时间"],
  ["internships.0.description", "第一段实习描述"],
  ["internships", "实习经历"],
  ["projects.0.name", "第一段项目名称"],
  ["projects.0.role", "第一段项目角色"],
  ["projects.0.startDate", "第一段项目开始时间"],
  ["projects.0.endDate", "第一段项目结束时间"],
  ["projects.0.link", "第一段项目链接"],
  ["projects.0.description", "第一段项目描述"],
  ["projects", "项目经历"],
  ["awards.0.type", "第一条获奖类型"],
  ["awards.0.date", "第一条获奖时间"],
  ["awards.0.description", "第一条奖项说明"],
  ["awards", "获奖信息"],
  ["portfolios.0.name", "第一项作品名称"],
  ["portfolios.0.link", "第一项作品链接"],
  ["portfolios.0.password", "第一项作品提取码"],
  ["portfolios", "作品主页"],
  ["selfDescription", "自我描述"],
  ["verifier.name", "资料证明人"],
  ["verifier.identity", "证明人身份"],
  ["verifier.phone", "证明人电话"]
];

const SENSITIVE_FIELDS = new Set(["profile.idNumber"]);
const FIELD_LABELS = Object.fromEntries(FIELD_OPTIONS);

const defaultProfile = {
  "profile.name": "张同学",
  "profile.gender": "女",
  "profile.countryRegion": "中国",
  "profile.idType": "居民身份证",
  "profile.idNumber": "",
  "profile.phoneType": "中国大陆",
  "profile.email": "zhang@example.com",
  "profile.phone": "13800000000",
  "profile.currentLocation": "上海",
  "profile.wechat": "zhang-career",
  "profile.qq": "",
  "profile.emergencyContact": "张先生",
  "profile.emergencyPhone": "13900000000",
  "education.0.degree": "本科",
  "education.0.schoolName": "某某大学",
  "education.0.college": "管理学院",
  "education.0.major": "信息管理与信息系统",
  "internships.0.company": "星云科技",
  "internships.0.position": "产品运营实习生",
  "internships.0.description": "负责活动策划、用户分层和数据复盘。",
  "internships": "星云科技 产品运营实习生：负责活动策划、用户分层和数据复盘。",
  "projects.0.name": "校园二手交易平台",
  "projects.0.role": "产品负责人",
  "projects.0.description": "负责需求调研、PRD、原型设计和数据分析，发布转化提升 18%。",
  "projects": "校园二手交易平台：负责需求调研、PRD、原型设计和数据分析，发布转化提升 18%。",
  "portfolios.0.name": "产品作品集",
  "portfolios.0.link": "https://example.com/portfolio",
  "portfolios.0.password": "2026",
  "portfolios": "产品作品集：https://example.com/portfolio 提取码：2026"
};

const profileEl = document.querySelector("#profile");
const serverBaseEl = document.querySelector("#server-base");
const tokenEl = document.querySelector("#plugin-token");
const resultEl = document.querySelector("#result");
const statusPillEl = document.querySelector("#status-pill");
const syncMetaEl = document.querySelector("#sync-meta");
const mappingCountEl = document.querySelector("#mapping-count");

let currentMappings = [];
let currentHost = "";

chrome.storage.local.get(
  ["offerosProfile", "offerosServerBase", "offerosPluginToken", "offerosLastSync", "zhixuProfile", "zhixuServerBase", "zhixuPluginToken"],
  (data) => {
    const profile = data.offerosProfile || data.zhixuProfile || defaultProfile;
    serverBaseEl.value = data.offerosServerBase || data.zhixuServerBase || "https://www.offeros.top";
    tokenEl.value = data.offerosPluginToken || data.zhixuPluginToken || "";
    profileEl.value = JSON.stringify(profile, null, 2);
    updateStatus(data.offerosLastSync ? `已同步 ${data.offerosLastSync}` : "未同步", Boolean(data.offerosProfile || data.zhixuProfile));
  }
);

document.querySelector("#save").addEventListener("click", () => {
  try {
    const profile = readProfile();
    saveLocal(profile, "配置已保存");
  } catch {
    showMessage("JSON 格式不正确", "error");
  }
});

document.querySelector("#sync").addEventListener("click", async () => {
  try {
    const serverBase = cleanServerBase();
    const token = tokenEl.value.trim();
    if (!serverBase || !token) throw new Error("请先填写主站地址和连接令牌");
    showMessage("正在从主站同步...");
    const response = await fetch(`${serverBase}/api/plugin/resume-fields`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorLabel(data.error || "sync_failed"));
    const profile = data.fields || {};
    profileEl.value = JSON.stringify(profile, null, 2);
    const syncText = data.updatedAt || new Date().toLocaleString();
    chrome.storage.local.set({
      offerosProfile: profile,
      offerosServerBase: serverBase,
      offerosPluginToken: token,
      offerosLastSync: syncText,
      zhixuProfile: profile,
      zhixuServerBase: serverBase,
      zhixuPluginToken: token
    });
    updateStatus(`已同步 ${syncText}`, true);
    showMessage(`同步完成：${data.user?.email || ""}`);
  } catch (error) {
    showMessage(`同步失败：${error.message}`, "error");
  }
});

document.querySelector("#scan").addEventListener("click", async () => {
  try {
    const profile = readProfile();
    showMessage("正在扫描当前页面...");
    const response = await sendToTab({ type: "OFFEROS_PREVIEW", profile });
    currentHost = await activeHost();
    currentMappings = await applySavedOverrides(response?.mappings || [], profile);
    renderMappings(currentMappings);
  } catch (error) {
    showMessage(`扫描失败：${tabErrorLabel(error.message)}`, "error");
  }
});

document.querySelector("#fill").addEventListener("click", async () => {
  try {
    const profile = readProfile();
    if (!currentMappings.length) {
      const response = await sendToTab({ type: "OFFEROS_PREVIEW", profile });
      currentHost = await activeHost();
      currentMappings = await applySavedOverrides(response?.mappings || [], profile);
    }
    const selectedMappings = selectedMappingPayload();
    if (!selectedMappings.length) {
      showMessage("请先选择要填充的字段", "error");
      return;
    }
    const response = await sendToTab({ type: "OFFEROS_FILL", profile, selectedMappings });
    currentMappings = await applySavedOverrides(response?.mappings || [], profile);
    renderMappings(currentMappings, true);
    syncMetaEl.textContent = `已填充 ${currentMappings.filter((item) => item.filled).length} 个字段`;
  } catch (error) {
    showMessage(`填充失败：${tabErrorLabel(error.message)}`, "error");
  }
});

resultEl.addEventListener("change", async (event) => {
  if (!event.target.matches(".field-select")) return;
  const index = Number(event.target.dataset.index);
  const mapping = currentMappings.find((item) => Number(item.index) === index);
  if (!mapping) return;
  updateMappingField(mapping, event.target.value, readProfile());
  await saveOverride(mapping);
  renderMappings(currentMappings);
});

function readProfile() {
  return JSON.parse(profileEl.value || "{}");
}

function saveLocal(profile, message) {
  chrome.storage.local.set({
    offerosProfile: profile,
    offerosServerBase: cleanServerBase(),
    offerosPluginToken: tokenEl.value.trim(),
    zhixuProfile: profile,
    zhixuServerBase: cleanServerBase(),
    zhixuPluginToken: tokenEl.value.trim()
  });
  showMessage(message);
}

async function sendToTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有找到当前标签页");
  if (!canRunOnPage(tab.url)) throw new Error("unsupported_page");
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (!shouldInjectContentScript(error.message)) throw error;
    await injectContentScript(tab.id);
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

async function activeHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return new URL(tab?.url || "").host || "local";
  } catch {
    return "local";
  }
}

function canRunOnPage(url) {
  return /^(https?:|file:)/i.test(url || "");
}

function shouldInjectContentScript(message) {
  return /Receiving end does not exist|Could not establish connection/i.test(message || "");
}

async function injectContentScript(tabId) {
  if (!chrome.scripting?.executeScript) {
    throw new Error("missing_scripting_permission");
  }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"]
  });
}

function cleanServerBase() {
  return serverBaseEl.value.trim().replace(/\/+$/, "");
}

async function applySavedOverrides(mappings, profile) {
  const host = currentHost || await activeHost();
  const overrides = await loadOverrides(host);
  return mappings.map((item) => {
    const mapping = {
      ...item,
      autoField: item.field,
      autoFieldLabel: item.fieldLabel,
      autoConfidence: item.confidence
    };
    if (overrides[item.signature] !== undefined) {
      updateMappingField(mapping, overrides[item.signature], profile, true);
    }
    return mapping;
  });
}

function renderMappings(mappings, afterFill = false) {
  const visible = mappings.filter((item) => item.field || item.label);
  const fillableCount = visible.filter((item) => selectedField(item) && profileValue(readProfile(), selectedField(item)) && item.canFill).length;
  mappingCountEl.textContent = `${fillableCount}/${visible.length} 项`;
  resultEl.innerHTML = visible.length
    ? visible.map((item) => mappingRow(item, afterFill)).join("")
    : `<div class="empty">没有找到可填写字段</div>`;
}

function mappingRow(item, afterFill) {
  const field = selectedField(item);
  const value = item.value || profileValue(readProfile(), field);
  const canFill = Boolean(item.canFill);
  const disabled = !field || !value || !canFill;
  const state = mappingState(item, field, value, afterFill);
  const sensitive = SENSITIVE_FIELDS.has(field) || item.sensitive;
  const checked = Boolean(item.canAutoSelect || item.manual) && Boolean(field && value && canFill) && !sensitive;
  const hint = mappingHint(item, field, value, sensitive);
  return `
    <div class="mapping-row ${item.filled ? "filled" : ""} ${disabled ? "disabled" : ""} ${item.manual ? "manual" : ""} ${!canFill && field && value ? "manual-fill" : ""}">
      <input type="checkbox" data-index="${item.index}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
      <span class="mapping-main">
        <strong title="${escapeHtml(item.label || "未命名字段")}">${escapeHtml(item.label || "未命名字段")}</strong>
        <select class="field-select" data-index="${item.index}">
          ${fieldOptionsHtml(field)}
        </select>
        <small>${escapeHtml(item.reason || item.autoFieldLabel || item.autoField || "未匹配")}${hint ? ` · ${escapeHtml(hint)}` : ""}</small>
        <em>${escapeHtml(previewValue(value || item.currentValue || ""))}</em>
      </span>
      <span class="mapping-state ${state.className}">${escapeHtml(state.label)}</span>
    </div>
  `;
}

function mappingState(item, field, value, afterFill) {
  if (afterFill) return item.filled ? { label: "已填", className: "ok" } : { label: "未填", className: "muted" };
  if (!field) return { label: "未识别", className: "muted" };
  if (!value) return { label: "无数据", className: "muted" };
  if (item.elementCustom && item.canFill) return { label: "自动选择", className: "ok" };
  if (!item.canFill) return { label: "需处理", className: "warn" };
  return { label: item.confidence || "已识别", className: "" };
}

function mappingHint(item, field, value, sensitive) {
  if (sensitive) return "敏感字段，需手动勾选";
  if (!field) return "";
  if (!value) return "本地简历没有这个字段";
  if (item.elementCustom && item.canFill) return "网页控件会自动选择";
  if (!item.canFill) return "网页控件无法自动处理";
  return "";
}

function fieldOptionsHtml(selected) {
  return [
    `<option value="" ${selected ? "" : "selected"}>不填充</option>`,
    ...FIELD_OPTIONS.map(([field, label]) => `<option value="${escapeHtml(field)}" ${field === selected ? "selected" : ""}>${escapeHtml(label)}</option>`)
  ].join("");
}

function selectedMappingPayload() {
  return [...resultEl.querySelectorAll('input[type="checkbox"][data-index]:checked')]
    .map((item) => {
      const index = Number(item.dataset.index);
      const select = resultEl.querySelector(`.field-select[data-index="${index}"]`);
      return { index, field: select?.value || "" };
    })
    .filter((item) => item.field);
}

function selectedField(item) {
  return item.field || "";
}

function updateMappingField(mapping, field, profile, fromSaved = false) {
  mapping.field = field || "";
  mapping.fieldLabel = FIELD_LABELS[field] || "";
  mapping.sensitive = SENSITIVE_FIELDS.has(field);
  mapping.value = field ? profileValue(profile, field) : "";
  mapping.canFill = Boolean(field && mapping.value && mapping.elementFillable !== false);
  mapping.canAutoSelect = false;
  mapping.manual = Boolean(field) && (!fromSaved || field !== mapping.autoField);
  mapping.confidence = field ? (field === mapping.autoField ? mapping.autoConfidence : "手动") : "未匹配";
}

async function loadOverrides(host) {
  const key = overrideStorageKey(host);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (data) => resolve(data[key] || {}));
  });
}

async function saveOverride(mapping) {
  const host = currentHost || await activeHost();
  const key = overrideStorageKey(host);
  const overrides = await loadOverrides(host);
  overrides[mapping.signature] = mapping.field || "";
  chrome.storage.local.set({ [key]: overrides });
}

function overrideStorageKey(host) {
  return `offerosFieldOverrides:${host || "local"}`;
}

function profileValue(profile, field) {
  if (!field) return "";
  const virtualValue = virtualProfileValue(profile, field);
  if (virtualValue !== undefined) return virtualValue;
  if (profile[field]) return profile[field];
  const value = field.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, profile);
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join("\n");
  return formatValue(value);
}

function virtualProfileValue(profile, field) {
  if (field !== "profile.familyName" && field !== "profile.givenName") return undefined;
  const fullName = String(profile["profile.name"] || profile.profile?.name || "").replace(/\s+/g, " ").trim();
  if (!fullName) return "";
  if (/\s/.test(fullName)) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (field === "profile.familyName") return parts.length > 1 ? parts[parts.length - 1] : "";
    return parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  }
  const compact = fullName.replace(/\s+/g, "");
  const compoundFamilyNames = [
    "欧阳", "太史", "端木", "上官", "司马", "东方", "独孤", "南宫", "万俟", "闻人",
    "夏侯", "诸葛", "尉迟", "公羊", "赫连", "澹台", "皇甫", "宗政", "濮阳", "公冶",
    "太叔", "申屠", "公孙", "慕容", "仲孙", "钟离", "长孙", "宇文", "司徒", "鲜于",
    "司空", "闾丘", "子车", "亓官", "司寇", "巫马", "公西", "颛孙", "壤驷", "公良",
    "漆雕", "乐正", "宰父", "谷梁", "拓跋", "夹谷", "轩辕", "令狐", "段干", "百里",
    "呼延", "东郭", "南门", "羊舌", "微生", "公户", "公玉", "公仪", "梁丘", "公仲",
    "公上", "公门", "公山", "公坚", "左丘", "公伯", "西门", "公祖", "第五", "公乘",
    "贯丘", "公皙", "南荣", "东里", "东宫", "仲长", "子书", "子桑", "即墨", "达奚",
    "褚师"
  ];
  const familyName = compoundFamilyNames.find((name) => compact.startsWith(name)) || compact.slice(0, 1);
  if (field === "profile.familyName") return familyName;
  return compact.slice(familyName.length);
}

function formatValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(formatValue).filter(Boolean).join(" ");
  return "";
}

function previewValue(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "无可填内容";
  return text.length > 54 ? `${text.slice(0, 54)}...` : text;
}

function updateStatus(text, ok = false) {
  statusPillEl.textContent = ok ? "已连接" : "未连接";
  statusPillEl.classList.toggle("ok", ok);
  syncMetaEl.textContent = text;
}

function showMessage(message, type = "info") {
  resultEl.innerHTML = `<div class="empty ${type}">${escapeHtml(message)}</div>`;
  if (!currentMappings.length) mappingCountEl.textContent = "0 项";
}

function tabErrorLabel(message) {
  if (message === "unsupported_page") return "当前页面不允许插件扫描，请打开招聘网站页面后再试";
  if (message === "missing_scripting_permission") return "插件缺少脚本注入权限，请在扩展管理页刷新插件后重试";
  if (/Cannot access contents|Cannot access a chrome|Extension manifest must request permission|The extensions gallery cannot be scripted/i.test(message)) {
    return "当前页面不允许插件扫描，请打开招聘网站页面后再试";
  }
  if (/Receiving end does not exist/i.test(message)) return "当前页面尚未加载插件脚本，请刷新页面后重试";
  return message || "操作失败";
}

function errorLabel(error) {
  const labels = {
    invalid_plugin_token: "连接令牌无效，请重新生成",
    resume_not_found: "主站还没有可同步的简历"
  };
  return labels[error] || error;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
