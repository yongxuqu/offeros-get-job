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
    this.readOnly = false;
    this.offsetParent = {};
    this.sectionTitle = config.sectionTitle || "";
    this.options = (config.options || []).map((option) => ({
      value: option.value,
      textContent: option.label || option.value
    }));
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

  closest(selector) {
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

function loadContentScript(fields, labels) {
  const context = {
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    CSS: { escape: (value) => String(value) },
    Event: class {},
    document: {
      querySelectorAll: (selector) => {
        if (selector === "input, textarea, select") return fields;
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
  "internships.0.company": "星云科技",
  "internships.0.position": "产品运营实习生",
  "projects.0.startDate": "2025-01-01",
  "projects.0.link": "https://example.com/project"
};

const contentScript = loadContentScript(fields, labels);
const { buildMappings, fillFields } = contentScript;
const mappings = buildMappings(profile);
const byId = Object.fromEntries(mappings.map((mapping, index) => [fields[index].id, mapping]));

const expectations = {
  realName: "profile.name",
  familyName: "profile.familyName",
  givenName: "profile.givenName",
  school: "education.0.schoolName",
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
fillFields(profile, selectedMappings);

const fillExpectations = {
  realName: "张同学",
  familyName: "张",
  givenName: "同学",
  school: "某某大学",
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

if (failed) process.exit(1);
