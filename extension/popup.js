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

chrome.storage.local.get(["zhixuProfile", "zhixuServerBase", "zhixuPluginToken"], (data) => {
  serverBaseEl.value = data.zhixuServerBase || "";
  tokenEl.value = data.zhixuPluginToken || "";
  profileEl.value = JSON.stringify(data.zhixuProfile || defaultProfile, null, 2);
});

document.querySelector("#save").addEventListener("click", () => {
  try {
    const profile = JSON.parse(profileEl.value);
    chrome.storage.local.set({
      zhixuProfile: profile,
      zhixuServerBase: cleanServerBase(),
      zhixuPluginToken: tokenEl.value.trim()
    });
    resultEl.innerHTML = `<div class="row">已保存资料</div>`;
  } catch {
    resultEl.innerHTML = `<div class="row">JSON 格式不正确</div>`;
  }
});

document.querySelector("#sync").addEventListener("click", async () => {
  try {
    const serverBase = cleanServerBase();
    const token = tokenEl.value.trim();
    if (!serverBase || !token) throw new Error("请先填写主站地址和连接令牌");
    const response = await fetch(`${serverBase}/api/plugin/resume-fields`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "sync_failed");
    profileEl.value = JSON.stringify(data.fields || {}, null, 2);
    chrome.storage.local.set({
      zhixuProfile: data.fields || {},
      zhixuServerBase: serverBase,
      zhixuPluginToken: token
    });
    resultEl.innerHTML = `<div class="row"><strong>同步完成</strong><span>${escapeHtml(data.user?.email || "")} · ${escapeHtml(data.updatedAt || "")}</span></div>`;
  } catch (error) {
    resultEl.innerHTML = `<div class="row">同步失败：${escapeHtml(error.message)}</div>`;
  }
});

document.querySelector("#scan").addEventListener("click", async () => {
  const response = await sendToTab({ type: "ZHIXU_SCAN" });
  renderMappings(response?.mappings || []);
});

document.querySelector("#fill").addEventListener("click", async () => {
  try {
    const profile = JSON.parse(profileEl.value);
    const response = await sendToTab({ type: "ZHIXU_FILL", profile });
    renderMappings(response?.mappings || []);
  } catch {
    resultEl.innerHTML = `<div class="row">JSON 格式不正确</div>`;
  }
});

async function sendToTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.tabs.sendMessage(tab.id, message);
}

function cleanServerBase() {
  return serverBaseEl.value.trim().replace(/\/+$/, "");
}

function renderMappings(mappings) {
  resultEl.innerHTML = mappings.length
    ? mappings.map((item) => `<div class="row"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.field || "未识别")} · ${escapeHtml(item.value || "未填充")}</span></div>`).join("")
    : `<div class="row">没有找到可填写字段</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
