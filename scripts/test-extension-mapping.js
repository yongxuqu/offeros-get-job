const fs = require("fs");
const vm = require("vm");

class FakeElement {
  constructor(config) {
    this.tagName = (config.tagName || "input").toUpperCase();
    this.attrs = config.attrs || {};
    this.id = this.attrs.id || "";
    this.name = this.attrs.name || "";
    this.value = config.value || "";
    this.disabled = false;
    this.readOnly = Boolean(config.readOnly || this.attrs.readOnly);
    this.customControl = Boolean(config.customControl);
    this.offsetParent = {};
    this.sectionTitle = config.sectionTitle || "";
    this.options = (config.options || []).map((option) => {
      const value = typeof option === "string" ? option : option.value;
      return {
        value,
        textContent: typeof option === "string" ? option : option.label || option.value
      };
    });
  }

  getAttribute(name) {
    return this.attrs[name] || "";
  }

  getClientRects() {
    return [1];
  }

  dispatchEvent() {
    return true;
  }

  scrollIntoView() {
    return true;
  }

  focus() {
    return true;
  }

  click() {
    return true;
  }

  closest(selector) {
    if (this.customControl && selector.includes(".el-select")) {
      return this;
    }
    if (selector.includes("section") && this.sectionTitle) {
      return {
        querySelector: () => ({
          innerText: this.sectionTitle,
          textContent: this.sectionTitle,
          contains: () => false
        })
      };
    }
    return null;
  }
}

function loadContentScript(fields, labels, hostname = "example.com") {
  const customOptions = ["前5%", "前10%", "前20%"].map((text) => ({
    innerText: text,
    textContent: text,
    offsetParent: {},
    getClientRects: () => [1],
    getAttribute: () => "",
    dispatchEvent: () => true,
    scrollIntoView: () => true,
    focus: () => true,
    click: () => {
      const target = fields.find((field) => field.id === "rankSelect");
      if (target) target.value = text;
    }
  }));
  const context = {
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    CSS: { escape: (value) => String(value) },
    Event: class {},
    MouseEvent: class {},
    setTimeout,
    window: { location: { hostname } },
    document: {
      querySelectorAll: (selector) => {
        if (selector.includes("el-select-dropdown__item") || selector.includes("[role='option']")) return customOptions;
        if (selector.includes("input")) return fields;
        return [];
      },
      querySelector: (selector) => {
        const match = selector.match(/^label\[for="(.+)"\]$/);
        if (!match) return null;
        const text = labels[match[1]];
        return text ? { innerText: text, textContent: text } : null;
      },
      createElement: (tagName) => new FakeElement({ tagName })
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("extension/content.js", "utf8"), context);
  return context;
}

function input(id, label, attrs = {}, sectionTitle = "") {
  return {
    element: new FakeElement({
      attrs: { id, name: id, type: attrs.type || "text", placeholder: attrs.placeholder || "" },
      tagName: attrs.tagName || "input",
      readOnly: attrs.readOnly,
      customControl: attrs.customControl,
      options: attrs.options,
      sectionTitle
    }),
    label
  };
}

const cases = [
  input("realName", "姓名"),
  input("familyName", "姓"),
  input("givenName", "名"),
  input("school", "学校名称", {}, "教育经历"),
  input("rankSelect", "年级排名", { readOnly: true, customControl: true }, "教育经历"),
  input("language", "语言类型", { tagName: "select", options: ["英语", "中文"] }, "语言能力"),
  input("languageCertificate", "语言证书", {}, "语言能力"),
  input("company", "公司名称", {}, "实习经历"),
  input("position", "职位", {}, "实习经历"),
  input("projectStart", "开始时间", { type: "date" }, "项目经历"),
  input("projectUrl", "项目链接", { type: "url" }, "项目经历"),
  input("contactPhone", "联系人电话"),
  input("emergencyPhone", "紧急联系人电话"),
  input("emailCode", "邮箱验证码"),
  input("idNumber", "证件号码")
];

const fields = cases.map((item) => item.element);
const labels = Object.fromEntries(cases.map((item) => [item.element.id, item.label]));
const profile = {
  "profile.name": "张同学",
  "profile.phone": "13800000000",
  "profile.emergencyPhone": "13900000000",
  "profile.email": "zhang@example.com",
  "profile.idNumber": "110101199901010000",
  "education.0.schoolName": "某某大学",
  "education.0.rank": "前10%",
  "languageAbilities.0.language": "英语",
  "languageAbilities.0.certificate": "CET-6",
  "internships.0.company": "星云科技",
  "internships.0.position": "产品运营实习生",
  "projects.0.startDate": "2025-01-01",
  "projects.0.link": "https://example.com/project"
};

(async () => {
const contentScript = loadContentScript(fields, labels);
const { buildMappings, fillFields } = contentScript;
const mappings = buildMappings(profile);
const byId = Object.fromEntries(mappings.map((mapping, index) => [fields[index].id, mapping]));

const expectations = {
  realName: "profile.name",
  familyName: "profile.familyName",
  givenName: "profile.givenName",
  school: "education.0.schoolName",
  rankSelect: "education.0.rank",
  language: "languageAbilities.0.language",
  languageCertificate: "languageAbilities.0.certificate",
  company: "internships.0.company",
  position: "internships.0.position",
  projectStart: "projects.0.startDate",
  projectUrl: "projects.0.link",
  contactPhone: "",
  emergencyPhone: "profile.emergencyPhone",
  emailCode: "",
  idNumber: "profile.idNumber"
};

let failed = false;
for (const [id, expected] of Object.entries(expectations)) {
  const actual = byId[id]?.field || "";
  const auto = byId[id]?.canAutoSelect ? "auto" : "manual";
  console.log(`${id}: ${actual || "未识别"} (${auto}, ${byId[id]?.confidence || "-"})`);
  if (actual !== expected) {
    failed = true;
    console.error(`Expected ${id} -> ${expected || "未识别"}, got ${actual || "未识别"}`);
  }
}

if (byId.idNumber?.canAutoSelect) {
  failed = true;
  console.error("证件号不应该默认自动勾选");
}

const selectedMappings = mappings
  .map((mapping, index) => ({ index, field: expectations[fields[index].id] }))
  .filter((item) => item.field && item.field !== "profile.idNumber");
await fillFields(profile, selectedMappings);

const fillExpectations = {
  realName: "张同学",
  familyName: "张",
  givenName: "同学",
  school: "某某大学",
  rankSelect: "前10%",
  language: "英语",
  languageCertificate: "CET-6",
  company: "星云科技",
  position: "产品运营实习生",
  projectStart: "2025-01-01",
  projectUrl: "https://example.com/project",
  emergencyPhone: "13900000000",
  contactPhone: ""
};

for (const [id, expected] of Object.entries(fillExpectations)) {
  const actual = fields.find((field) => field.id === id)?.value || "";
  if (actual !== expected) {
    failed = true;
    console.error(`Expected filled ${id} -> ${expected || "空"}, got ${actual || "空"}`);
  }
}

if (!byId.rankSelect?.canFill || !byId.rankSelect?.canAutoSelect) {
  failed = true;
  console.error("自定义只读下拉应该默认自动填充");
}

const mokaVipScript = loadContentScript([], {}, "xmbank.mokahr.vip");
if (!mokaVipScript.isMokaPage()) {
  failed = true;
  console.error("mokahr.vip 应该识别为 Moka 页面");
}

const zhiyeScript = loadContentScript([], {}, "transsion.zhiye.com");
if (!zhiyeScript.isStructuredRecruitmentPage()) {
  failed = true;
  console.error("zhiye.com 应该识别为结构化招聘页面");
}

const hotjobScript = loadContentScript([], {}, "wecruit.hotjob.cn");
if (!hotjobScript.isStructuredRecruitmentPage()) {
  failed = true;
  console.error("hotjob.cn 应该识别为结构化招聘页面");
}

if (failed) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
