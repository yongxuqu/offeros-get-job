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
  "internships": "星云科技 产品运营实习生：负责活动策划、用户分层和数据复盘。",
  "projects": "校园二手交易平台：负责需求调研、PRD、原型设计和数据分析，发布转化提升 18%。",
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
    currentMappings = response?.mappings || [];
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
      currentMappings = response?.mappings || [];
    }
    const selectedIndexes = selectedMappingIndexes();
    if (!selectedIndexes.length) {
      showMessage("请先选择要填充的字段", "error");
      return;
    }
    const response = await sendToTab({ type: "OFFEROS_FILL", profile, selectedIndexes });
    currentMappings = response?.mappings || [];
    renderMappings(currentMappings, true);
    syncMetaEl.textContent = `已填充 ${currentMappings.filter((item) => item.filled).length} 个字段`;
  } catch (error) {
    showMessage(`填充失败：${tabErrorLabel(error.message)}`, "error");
  }
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
  return chrome.tabs.sendMessage(tab.id, message);
}

function cleanServerBase() {
  return serverBaseEl.value.trim().replace(/\/+$/, "");
}

function renderMappings(mappings, afterFill = false) {
  const visible = mappings.filter((item) => item.field || item.label);
  const fillableCount = visible.filter((item) => item.field && item.value).length;
  mappingCountEl.textContent = `${fillableCount}/${visible.length} 项`;
  resultEl.innerHTML = visible.length
    ? visible.map((item) => mappingRow(item, afterFill)).join("")
    : `<div class="empty">没有找到可填写字段</div>`;
}

function mappingRow(item, afterFill) {
  const checked = item.field && item.value && item.confidence !== "低" && !item.sensitive;
  const disabled = !item.field || !item.value;
  const state = item.filled ? "已填充" : item.field ? item.confidence || "已识别" : "未识别";
  return `
    <label class="mapping-row ${item.filled ? "filled" : ""} ${disabled ? "disabled" : ""}">
      <input type="checkbox" data-index="${item.index}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
      <span class="mapping-main">
        <strong>${escapeHtml(item.label || "未命名字段")}</strong>
        <small>${escapeHtml(item.fieldLabel || item.field || "未匹配")} · ${escapeHtml(item.elementType || "")}${item.sensitive ? " · 敏感" : ""}</small>
        <em>${escapeHtml(previewValue(item.value || item.currentValue || ""))}</em>
      </span>
      <span class="mapping-state">${afterFill ? (item.filled ? "已填" : "未填") : escapeHtml(state)}</span>
    </label>
  `;
}

function selectedMappingIndexes() {
  return [...resultEl.querySelectorAll('input[type="checkbox"][data-index]:checked')].map((item) => Number(item.dataset.index));
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
