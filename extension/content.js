const FIELD_RULES = [
  { field: "profile.emergencyPhone", label: "紧急联系人电话", sensitive: false, patterns: ["紧急联系人电话", "紧急联系电话", "emergency phone"] },
  { field: "profile.emergencyContact", label: "紧急联系人", sensitive: false, patterns: ["紧急联系人", "emergency contact"] },
  { field: "verifier.identity", label: "证明人身份", sensitive: false, patterns: ["证明人身份", "资料证明人身份"] },
  { field: "verifier.phone", label: "证明人电话", sensitive: false, patterns: ["证明人电话", "证明人联系电话", "资料证明人电话"] },
  { field: "verifier.name", label: "资料证明人", sensitive: false, patterns: ["资料证明人", "证明人"] },
  { field: "profile.idType", label: "证件类型", sensitive: false, patterns: ["证件号码类型", "证件类型", "id type", "identity type", "证件类别"] },
  { field: "profile.idNumber", label: "证件号", sensitive: true, patterns: ["证件号码", "证件号", "身份证号", "身份证", "护照号", "id number", "identity number"] },
  { field: "profile.phoneType", label: "手机号码类型", sensitive: false, patterns: ["手机号码类型", "电话类型", "手机区号", "国家代码", "phone type", "phone area"] },
  { field: "profile.phone", label: "手机号", sensitive: false, patterns: ["手机号码", "手机号", "联系电话", "电话", "手机", "mobile", "phone", "tel"] },
  { field: "profile.email", label: "邮箱", sensitive: false, patterns: ["电子邮箱", "邮箱", "email", "e-mail", "mail"] },
  { field: "profile.gender", label: "性别", sensitive: false, patterns: ["性别", "gender", "sex"] },
  { field: "profile.countryRegion", label: "国家/地区", sensitive: false, patterns: ["国家/地区", "国家地区", "国家", "country", "region"] },
  { field: "profile.currentLocation", label: "当前所在地", sensitive: false, patterns: ["当前所处地", "当前所在地", "现居城市", "现居地", "所在地", "所在城市", "居住城市", "city"] },
  { field: "profile.wechat", label: "微信号", sensitive: false, patterns: ["微信号", "微信", "wechat", "weixin"] },
  { field: "profile.qq", label: "QQ号", sensitive: false, patterns: ["qq号", "qq"] },
  { field: "profile.name", label: "姓名", sensitive: false, patterns: ["真实姓名", "姓名", "中文名", "name"] },
  { field: "education.0.startDate", label: "教育开始时间", sensitive: false, patterns: ["教育开始时间", "入学时间", "就读开始", "开始时间", "start date"] },
  { field: "education.0.endDate", label: "教育结束时间", sensitive: false, patterns: ["教育结束时间", "毕业时间", "就读结束", "结束时间", "end date"] },
  { field: "education.0.schoolName", label: "学校名称", sensitive: false, patterns: ["学校名称", "毕业院校", "所在学校", "学校", "院校", "university", "school"] },
  { field: "education.0.studyLocation", label: "就读地", sensitive: false, patterns: ["目前就读地", "就读地", "就读城市"] },
  { field: "education.0.college", label: "院系", sensitive: false, patterns: ["院系", "学院", "college", "department"] },
  { field: "education.0.major", label: "专业", sensitive: false, patterns: ["专业名称", "专业", "major"] },
  { field: "education.0.rank", label: "成绩排名", sensitive: false, patterns: ["成绩排名", "专业排名", "排名", "rank"] },
  { field: "education.0.gpaBase", label: "GPA Base", sensitive: false, patterns: ["gpa base", "绩点满分", "满绩", "满分"] },
  { field: "education.0.gpa", label: "GPA", sensitive: false, patterns: ["gpa", "绩点"] },
  { field: "education.0.degree", label: "学历", sensitive: false, patterns: ["最高学历", "学历", "学位", "degree", "education"] },
  { field: "internships", label: "实习经历", sensitive: false, patterns: ["实习经历", "工作经历", "实习", "internship", "work experience"] },
  { field: "projects", label: "项目经历", sensitive: false, patterns: ["项目经历", "项目", "project"] },
  { field: "awards", label: "获奖信息", sensitive: false, patterns: ["获奖信息", "获奖经历", "奖项", "奖学金", "竞赛获奖", "award"] },
  { field: "portfolios", label: "作品主页", sensitive: false, patterns: ["作品或个人主页", "作品链接", "个人主页", "作品", "主页", "portfolio", "website"] },
  { field: "selfDescription", label: "自我描述", sensitive: false, patterns: ["自我描述", "自我评价", "个人总结", "个人简介", "self introduction"] }
];

const IGNORED_TYPES = new Set(["hidden", "password", "submit", "button", "file", "image", "reset"]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OFFEROS_PREVIEW" || message.type === "ZHIXU_SCAN") {
    sendResponse({ mappings: buildMappings(message.profile || {}) });
    return true;
  }
  if (message.type === "OFFEROS_FILL" || message.type === "ZHIXU_FILL") {
    sendResponse({ mappings: fillFields(message.profile || {}, message.selectedIndexes || null) });
    return true;
  }
  return false;
});

function buildMappings(profile) {
  return getFields().map((element, index) => describeField(element, index, profile));
}

function fillFields(profile, selectedIndexes) {
  const selected = Array.isArray(selectedIndexes) ? new Set(selectedIndexes.map(Number)) : null;
  return getFields().map((element, index) => {
    const mapping = describeField(element, index, profile);
    const shouldFill = (!selected || selected.has(index)) && mapping.field && mapping.value && mapping.canFill;
    if (shouldFill) {
      mapping.filled = applyValue(element, mapping.value);
      mapping.currentValue = getElementValue(element);
    }
    return mapping;
  });
}

function describeField(element, index, profile) {
  const label = getFieldLabel(element);
  const inferred = inferField(label, element);
  const value = inferred.field ? getProfileValue(profile, inferred.field) : "";
  return {
    index,
    label: compactText(label) || element.getAttribute("name") || element.id || element.tagName.toLowerCase(),
    field: inferred.field,
    fieldLabel: inferred.label,
    confidence: inferred.confidence,
    sensitive: inferred.sensitive,
    value: normalizeValueForElement(element, value),
    currentValue: getElementValue(element),
    elementType: elementTypeName(element),
    canFill: Boolean(inferred.field && value),
    filled: false
  };
}

function getFields() {
  const seenRadioGroups = new Set();
  return [...document.querySelectorAll("input, textarea, select")].filter((element) => {
    const type = (element.getAttribute("type") || "").toLowerCase();
    const hidden = element.offsetParent === null && element.getClientRects().length === 0;
    if (type === "radio" && element.name) {
      if (seenRadioGroups.has(element.name)) return false;
      seenRadioGroups.add(element.name);
    }
    return !hidden && !element.disabled && !element.readOnly && !IGNORED_TYPES.has(type);
  });
}

function getFieldLabel(element) {
  const idLabel = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.innerText : "";
  const closestLabel = element.closest("label")?.innerText || "";
  const formItem = element.closest(".ant-form-item, .el-form-item, .form-item, .form-group, .field, .moka-form-item, li, td");
  const formText = formItem?.innerText || "";
  const previousText = previousTextNode(element);
  const attrs = [
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("autocomplete"),
    element.getAttribute("data-label"),
    element.getAttribute("data-name")
  ];
  return compactText([idLabel, closestLabel, formText, previousText, ...attrs].filter(Boolean).join(" "));
}

function previousTextNode(element) {
  const previous = element.previousElementSibling;
  if (!previous) return "";
  return previous.innerText || previous.textContent || "";
}

function inferField(label, element) {
  const normalized = normalize(label);
  const type = (element.getAttribute("type") || "").toLowerCase();
  let best = { score: 0, rule: null };
  FIELD_RULES.forEach((rule, ruleIndex) => {
    rule.patterns.forEach((pattern) => {
      const normalizedPattern = normalize(pattern);
      if (!normalizedPattern || !normalized.includes(normalizedPattern)) return;
      let score = normalizedPattern.length * 4 + (FIELD_RULES.length - ruleIndex) / 100;
      if (type === "email" && rule.field === "profile.email") score += 80;
      if (type === "tel" && rule.field === "profile.phone") score += 60;
      if (type === "radio" && rule.field === "profile.gender") score += 30;
      if (element.tagName === "TEXTAREA" && ["internships", "projects", "awards", "selfDescription"].includes(rule.field)) score += 20;
      if (score > best.score) best = { score, rule };
    });
  });
  if (!best.rule) return { field: "", label: "", confidence: "none", sensitive: false };
  return {
    field: best.rule.field,
    label: best.rule.label,
    confidence: best.score >= 80 ? "高" : best.score >= 36 ? "中" : "低",
    sensitive: best.rule.sensitive
  };
}

function applyValue(element, value) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (element.tagName === "SELECT") {
    const option = findBestOption([...element.options], value);
    if (!option) return false;
    setNativeValue(element, option.value);
  } else if (type === "radio") {
    const group = element.name ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)] : [element];
    const normalizedValue = normalize(value);
    const target = group.find((item) => optionLabel(item).includes(normalizedValue) || normalize(item.value) === normalizedValue);
    if (!target) return false;
    target.checked = true;
    dispatchInputEvents(target);
    return true;
  } else if (type === "checkbox") {
    const desired = ["true", "是", "yes", "有", "1"].some((item) => normalize(value).includes(normalize(item)));
    element.checked = desired;
    dispatchInputEvents(element);
    return true;
  } else {
    setNativeValue(element, normalizeValueForElement(element, value));
  }
  dispatchInputEvents(element);
  return true;
}

function findBestOption(options, value) {
  const normalizedValue = normalize(value);
  return (
    options.find((option) => normalize(option.textContent) === normalizedValue || normalize(option.value) === normalizedValue) ||
    options.find((option) => normalize(option.textContent).includes(normalizedValue) || normalizedValue.includes(normalize(option.textContent))) ||
    options.find((option) => normalize(option.value).includes(normalizedValue))
  );
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function dispatchInputEvents(element) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function getElementValue(element) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (type === "radio" || type === "checkbox") return element.checked ? element.value || "已选" : "";
  return element.value || "";
}

function getProfileValue(profile, field) {
  if (profile[field]) return profile[field];
  const value = field.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, profile);
  if (Array.isArray(value)) {
    return value.map(formatNestedValue).filter(Boolean).join("\n");
  }
  return formatNestedValue(value);
}

function formatNestedValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(formatNestedValue).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(formatNestedValue).filter(Boolean).join(" ");
  return "";
}

function normalizeValueForElement(element, value) {
  const raw = String(value || "").trim();
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (type === "date") {
    const match = raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }
  return raw;
}

function elementTypeName(element) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  return element.tagName === "INPUT" && type ? type : element.tagName.toLowerCase();
}

function optionLabel(element) {
  const idLabel = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.innerText : "";
  return normalize([idLabel, element.closest("label")?.innerText, element.value].filter(Boolean).join(" "));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:*＊·•\-_/\\|()[\]{}，,。.;；]/g, "");
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}
