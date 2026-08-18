const FIELD_RULES = [
  { field: "profile.name", patterns: ["姓名", "name", "真实姓名"] },
  { field: "profile.gender", patterns: ["性别", "gender", "sex"] },
  { field: "profile.countryRegion", patterns: ["国家", "地区", "country", "region"] },
  { field: "profile.idType", patterns: ["证件类型", "证件号码类型", "id type", "identity type"] },
  { field: "profile.idNumber", patterns: ["证件号", "证件号码", "身份证", "护照号", "id number"] },
  { field: "profile.phoneType", patterns: ["手机号码类型", "电话类型", "phone type"] },
  { field: "profile.email", patterns: ["邮箱", "email", "mail"] },
  { field: "profile.phone", patterns: ["手机", "电话", "手机号", "phone", "tel"] },
  { field: "profile.currentLocation", patterns: ["当前所处地", "现居", "所在地", "城市", "city"] },
  { field: "profile.wechat", patterns: ["微信", "wechat"] },
  { field: "profile.qq", patterns: ["qq"] },
  { field: "profile.emergencyContact", patterns: ["紧急联系人"] },
  { field: "profile.emergencyPhone", patterns: ["紧急联系人电话", "紧急联系电话"] },
  { field: "education.0.degree", patterns: ["学历", "最高学历", "degree", "education"] },
  { field: "education.0.schoolName", patterns: ["学校", "学校名称", "school", "university"] },
  { field: "education.0.studyLocation", patterns: ["就读地", "就读城市"] },
  { field: "education.0.college", patterns: ["院系", "学院", "college"] },
  { field: "education.0.major", patterns: ["专业", "major"] },
  { field: "education.0.rank", patterns: ["成绩排名", "排名", "rank"] },
  { field: "education.0.gpa", patterns: ["gpa"] },
  { field: "education.0.gpaBase", patterns: ["gpa base", "满绩", "满分"] },
  { field: "internships", patterns: ["实习", "实习经历", "工作经历", "internship"] },
  { field: "projects", patterns: ["项目", "项目经历", "project"] },
  { field: "awards", patterns: ["获奖", "奖项", "奖学金", "award"] },
  { field: "portfolios", patterns: ["作品", "个人主页", "主页", "portfolio", "website"] },
  { field: "selfDescription", patterns: ["自我描述", "自我评价", "个人总结"] },
  { field: "verifier.name", patterns: ["资料证明人", "证明人"] },
  { field: "verifier.identity", patterns: ["证明人身份"] },
  { field: "verifier.phone", patterns: ["证明人电话", "证明人联系电话"] }
];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ZHIXU_SCAN") {
    sendResponse({ mappings: scanFields() });
    return true;
  }
  if (message.type === "ZHIXU_FILL") {
    sendResponse({ mappings: fillFields(message.profile || {}) });
    return true;
  }
  return false;
});

function scanFields() {
  return getFields().map((element) => {
    const label = getFieldLabel(element);
    return {
      label,
      field: inferField(label),
      value: ""
    };
  });
}

function fillFields(profile) {
  return getFields().map((element) => {
    const label = getFieldLabel(element);
    const field = inferField(label);
    const value = field ? getProfileValue(profile, field) : "";
    if (value) applyValue(element, value);
    return { label, field, value };
  });
}

function getFields() {
  return [...document.querySelectorAll("input, textarea, select")].filter((element) => {
    const type = (element.getAttribute("type") || "").toLowerCase();
    return !element.disabled && !element.readOnly && !["hidden", "password", "submit", "button", "file"].includes(type);
  });
}

function getFieldLabel(element) {
  const id = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.innerText : "";
  const closestLabel = element.closest("label")?.innerText || "";
  const aria = element.getAttribute("aria-label") || "";
  const placeholder = element.getAttribute("placeholder") || "";
  const name = element.getAttribute("name") || "";
  const elementId = element.getAttribute("id") || "";
  return [id, closestLabel, aria, placeholder, name, elementId].filter(Boolean).join(" ").trim();
}

function inferField(label) {
  const normalized = label.toLowerCase();
  const rule = FIELD_RULES.find((item) => item.patterns.some((pattern) => normalized.includes(pattern.toLowerCase())));
  return rule?.field || "";
}

function applyValue(element, value) {
  if (element.tagName === "SELECT") {
    const option = [...element.options].find((item) => item.text.includes(value) || item.value.includes(value));
    if (option) element.value = option.value;
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function getProfileValue(profile, field) {
  if (profile[field]) return profile[field];
  const value = field.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, profile);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        return Object.values(item).filter(Boolean).join(" ");
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value).filter(Boolean).join(" ");
  }
  return value || "";
}
