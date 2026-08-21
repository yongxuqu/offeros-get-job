const FIELD_RULES = [
  { field: "profile.emergencyPhone", label: "紧急联系人电话", sensitive: false, patterns: ["紧急联系人电话", "紧急联系电话", "emergency phone"] },
  { field: "profile.emergencyContact", label: "紧急联系人", sensitive: false, patterns: ["紧急联系人", "emergency contact"] },
  { field: "verifier.identity", label: "证明人身份", sensitive: false, patterns: ["证明人身份", "资料证明人身份"] },
  { field: "verifier.phone", label: "证明人电话", sensitive: false, patterns: ["证明人电话", "证明人联系电话", "资料证明人电话"] },
  { field: "verifier.name", label: "资料证明人", sensitive: false, patterns: ["资料证明人", "证明人"] },
  { field: "profile.idType", label: "证件类型", sensitive: false, patterns: ["证件号码类型", "证件类型", "id type", "identity type", "证件类别"] },
  { field: "profile.idNumber", label: "证件号", sensitive: true, patterns: ["证件号码", "证件号", "身份证号", "身份证号码", "护照号", "id number", "identity number"] },
  { field: "profile.phoneType", label: "手机号码类型", sensitive: false, patterns: ["手机号码类型", "电话类型", "手机区号", "国家代码", "phone type", "phone area"] },
  { field: "profile.phone", label: "手机号", sensitive: false, patterns: ["手机号码", "手机号", "联系电话", "本人电话", "本人手机", "mobile", "phone", "tel"] },
  { field: "profile.email", label: "邮箱", sensitive: false, patterns: ["电子邮箱", "邮箱", "email", "e-mail", "mail"] },
  { field: "profile.gender", label: "性别", sensitive: false, patterns: ["性别", "gender", "sex"] },
  { field: "profile.countryRegion", label: "国家/地区", sensitive: false, patterns: ["国家/地区", "国家地区", "国籍", "国家", "country", "region"] },
  { field: "profile.currentLocation", label: "当前所在地", sensitive: false, patterns: ["当前所处地", "当前所在地", "现居城市", "现居地", "所在地", "所在城市", "居住城市", "current city", "city"] },
  { field: "profile.wechat", label: "微信号", sensitive: false, patterns: ["微信号", "微信", "wechat", "weixin"] },
  { field: "profile.qq", label: "QQ号", sensitive: false, patterns: ["qq号", "qq"] },
  { field: "profile.familyName", label: "姓", sensitive: false, patterns: ["姓", "姓氏", "last name", "family name", "surname"] },
  { field: "profile.givenName", label: "名", sensitive: false, patterns: ["名", "名字", "first name", "given name"] },
  { field: "profile.name", label: "姓名", sensitive: false, patterns: ["真实姓名", "中文姓名", "中文名", "姓名", "full name", "name"] },
  { field: "education.0.startDate", label: "教育开始时间", sensitive: false, patterns: ["教育开始时间", "入学时间", "就读开始", "入校时间", "开始年月", "start date"] },
  { field: "education.0.endDate", label: "教育结束时间", sensitive: false, patterns: ["教育结束时间", "毕业时间", "就读结束", "毕业年月", "结束年月", "end date"] },
  { field: "education.0.schoolName", label: "学校名称", sensitive: false, patterns: ["学校名称", "学校中文名称", "学校全称", "院校名称", "毕业院校", "所在学校", "就读学校", "学校", "院校", "university", "school"] },
  { field: "education.0.studyLocation", label: "就读地", sensitive: false, patterns: ["目前就读地", "就读地", "就读城市", "学校所在地"] },
  { field: "education.0.college", label: "院系", sensitive: false, patterns: ["院系名称", "学院名称", "院系", "学院", "college", "department"] },
  { field: "education.0.major", label: "专业", sensitive: false, patterns: ["专业中文名称", "专业名称", "所学专业", "专业", "major"] },
  { field: "education.0.rank", label: "成绩排名", sensitive: false, patterns: ["成绩排名", "专业排名", "年级排名", "班级排名", "排名", "rank"] },
  { field: "education.0.gpaBase", label: "GPA Base", sensitive: false, patterns: ["gpa base", "gps-base", "gpsbase", "绩点满分", "满绩", "满分"] },
  { field: "education.0.gpa", label: "GPA", sensitive: false, patterns: ["平均绩点", "绩点成绩", "gpa", "绩点"] },
  { field: "education.0.degree", label: "学历", sensitive: false, patterns: ["最高学历", "学历层次", "学历类型", "学位类型", "最高学位", "学历", "学位", "degree", "education"] },
  { field: "internships.0.company", label: "实习公司", sensitive: false, patterns: ["实习公司", "公司名称", "工作单位", "任职公司", "所在公司", "公司", "单位", "company", "employer"] },
  { field: "internships.0.position", label: "实习职位", sensitive: false, patterns: ["实习职位", "职位名称", "岗位名称", "任职岗位", "工作职位", "职位", "岗位", "position", "job title"] },
  { field: "internships.0.startDate", label: "实习开始时间", sensitive: false, patterns: ["实习开始时间", "工作开始时间", "入职时间", "起始时间", "开始时间", "start date"] },
  { field: "internships.0.endDate", label: "实习结束时间", sensitive: false, patterns: ["实习结束时间", "工作结束时间", "离职时间", "结束时间", "end date"] },
  { field: "internships.0.description", label: "实习描述", sensitive: false, patterns: ["实习描述", "工作描述", "职责描述", "工作内容", "经历描述", "主要职责", "职责", "description"] },
  { field: "internships", label: "实习经历", sensitive: false, patterns: ["实习经历", "工作经历", "实习", "internship", "work experience"] },
  { field: "projects.0.name", label: "项目名称", sensitive: false, patterns: ["项目名称", "项目名", "项目", "project name"] },
  { field: "projects.0.role", label: "项目角色", sensitive: false, patterns: ["项目角色", "项目中担任的角色", "担任角色", "负责角色", "角色", "role"] },
  { field: "projects.0.startDate", label: "项目开始时间", sensitive: false, patterns: ["项目开始时间", "项目起始时间", "开始时间", "start date"] },
  { field: "projects.0.endDate", label: "项目结束时间", sensitive: false, patterns: ["项目结束时间", "结束时间", "end date"] },
  { field: "projects.0.link", label: "项目链接", sensitive: false, patterns: ["项目链接", "项目地址", "项目网址", "链接", "url", "link"] },
  { field: "projects.0.description", label: "项目描述", sensitive: false, patterns: ["项目描述", "项目介绍", "项目职责", "项目内容", "描述", "description"] },
  { field: "projects", label: "项目经历", sensitive: false, patterns: ["项目经历", "项目", "project"] },
  { field: "awards.0.type", label: "获奖类型", sensitive: false, patterns: ["获奖类型", "奖项类型", "奖项类别", "奖学金", "竞赛获奖", "award type"] },
  { field: "awards.0.date", label: "获奖时间", sensitive: false, patterns: ["获奖时间", "获奖日期", "获奖年月", "颁奖时间", "award date"] },
  { field: "awards.0.description", label: "奖项说明", sensitive: false, patterns: ["奖项说明", "获奖说明", "奖项名称", "奖项描述", "award description"] },
  { field: "awards", label: "获奖信息", sensitive: false, patterns: ["获奖信息", "获奖经历", "奖项", "奖学金", "竞赛获奖", "award"] },
  { field: "portfolios.0.name", label: "作品名称", sensitive: false, patterns: ["作品名称", "作品名", "作品", "portfolio name"] },
  { field: "portfolios.0.link", label: "作品链接", sensitive: false, patterns: ["作品链接", "个人主页", "主页链接", "作品地址", "网址", "url", "link", "website"] },
  { field: "portfolios.0.password", label: "作品提取码", sensitive: false, patterns: ["提取码", "访问密码", "作品密码", "密码", "password"] },
  { field: "portfolios", label: "作品主页", sensitive: false, patterns: ["作品或个人主页", "作品链接", "个人主页", "作品", "主页", "portfolio", "website"] },
  { field: "selfDescription", label: "自我描述", sensitive: false, patterns: ["自我描述", "自我评价", "个人总结", "个人简介", "self introduction"] }
];

const FIELD_META = Object.fromEntries(FIELD_RULES.map((rule) => [rule.field, rule]));
const IGNORED_TYPES = new Set(["hidden", "password", "submit", "button", "file", "image", "reset"]);
const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true'], [role='textbox']";
const CUSTOM_CONTROL_SELECTOR = [
  ".el-select__wrapper",
  ".el-input__wrapper",
  ".el-select",
  ".el-cascader",
  ".el-date-editor",
  ".el-time-picker",
  ".ant-select",
  ".ant-picker",
  ".ant-cascader-picker",
  "[role='combobox']"
].join(",");
const CUSTOM_OPTION_SELECTOR = [
  ".el-select-dropdown__item:not(.is-disabled)",
  ".el-select-dropdown li:not(.is-disabled)",
  ".el-popper .el-select-dropdown__item:not(.is-disabled)",
  ".el-popper li:not(.is-disabled)",
  ".el-scrollbar__view li:not(.is-disabled)",
  ".el-cascader-node:not(.is-disabled)",
  ".ant-select-item-option:not(.ant-select-item-option-disabled)",
  ".ant-select-dropdown .ant-select-item:not(.ant-select-item-option-disabled)",
  ".ant-cascader-menu-item:not(.ant-cascader-menu-item-disabled)",
  "[role='option']:not([aria-disabled='true'])",
  "[class*='dropdown'] li",
  "[class*='select'] [class*='option']"
].join(",");
const FORM_ITEM_SELECTOR = ".ant-form-item, .ant-row, .el-form-item, .el-form-item--default, .form-item, .form-group, .field, .moka-form-item, .moka-form-row, .form-row, li, td";
const LABEL_SELECTOR = [
  ".ant-form-item-label",
  ".el-form-item__label",
  ".moka-form-item-label",
  ".form-label",
  ".control-label",
  ".field-label",
  ".label",
  "label"
].join(",");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OFFEROS_PING") {
    sendResponse({ ok: true, version: "0.3.6" });
    return true;
  }
  if (message.type === "OFFEROS_PREVIEW" || message.type === "ZHIXU_SCAN") {
    sendResponse({ mappings: buildMappings(message.profile || {}) });
    return true;
  }
  if (message.type === "OFFEROS_FILL" || message.type === "ZHIXU_FILL") {
    fillFields(
        message.profile || {},
        message.selectedMappings || null,
        message.selectedIndexes || null
      )
      .then((mappings) => sendResponse({ mappings }))
      .catch((error) => sendResponse({ error: error.message || "fill_failed", mappings: [] }));
    return true;
  }
  return false;
});

function buildMappings(profile) {
  return getFields().map((element, index) => describeField(element, index, profile));
}

async function fillFields(profile, selectedMappings, selectedIndexes) {
  const selected = normalizeSelectedMappings(selectedMappings, selectedIndexes);
  const mappings = [];
  const initialFields = getFields();
  const maxSelectedIndex = Math.max(-1, ...selected.keys());
  const fieldCount = Math.max(initialFields.length, maxSelectedIndex + 1);
  for (let index = 0; index < fieldCount; index += 1) {
    const element = getFields()[index];
    if (!element) continue;
    let mapping = describeField(element, index, profile);
    const selectedField = selected.get(index);
    if (selectedField !== undefined) {
      mapping = withManualField(mapping, profile, selectedField);
    }
    const shouldFill = selected.has(index) && mapping.field && mapping.value && mapping.canFill;
    if (shouldFill) {
      mapping.filled = await applyValue(element, mapping.value);
      await wait(160);
      mapping.currentValue = getElementValue(getFields()[index] || element);
    }
    mappings.push(mapping);
  }
  return mappings;
}

function normalizeSelectedMappings(selectedMappings, selectedIndexes) {
  const selected = new Map();
  if (Array.isArray(selectedMappings)) {
    selectedMappings.forEach((item) => {
      selected.set(Number(item.index), item.field || "");
    });
    return selected;
  }
  if (Array.isArray(selectedIndexes)) {
    selectedIndexes.forEach((index) => selected.set(Number(index), undefined));
  }
  return selected;
}

function describeField(element, index, profile) {
  const contexts = getFieldContexts(element);
  const inferred = inferField(contexts, element);
  const value = inferred.field ? getProfileValue(profile, inferred.field) : "";
  const label = displayLabel(contexts, element);
  return {
    index,
    signature: fieldSignature(element, label),
    label,
    field: inferred.field,
    fieldLabel: inferred.label,
    confidence: inferred.confidence,
    score: Math.round(inferred.score || 0),
    reason: inferred.reason,
    sensitive: inferred.sensitive,
    value: normalizeValueForElement(element, value, label),
    currentValue: getElementValue(element),
    elementType: elementTypeName(element),
    elementFillable: canAttemptFillElement(element),
    elementCustom: isReadonlyCustomControl(element),
    canFill: Boolean(inferred.field && value && canAttemptFillElement(element)),
    canAutoSelect: Boolean(inferred.field && value && inferred.score >= 72 && !inferred.sensitive && canAttemptFillElement(element)),
    filled: false
  };
}

function withManualField(mapping, profile, field) {
  if (!field) {
    return {
      ...mapping,
      field: "",
      fieldLabel: "",
      confidence: "手动跳过",
      sensitive: false,
      value: "",
      canFill: false,
      canAutoSelect: false
    };
  }
  const meta = FIELD_META[field] || { field, label: field, sensitive: false };
  const element = findElementByMapping(mapping);
  const value = getProfileValue(profile, field);
  const elementFillable = canAttemptFillElement(element);
  return {
    ...mapping,
    field,
    fieldLabel: meta.label,
    confidence: mapping.field === field ? mapping.confidence : "手动",
    sensitive: Boolean(meta.sensitive),
    value: normalizeValueForElement(element, value, mapping.label),
    elementFillable,
    elementCustom: isReadonlyCustomControl(element),
    canFill: Boolean(value && elementFillable),
    canAutoSelect: false
  };
}

function findElementByMapping(mapping) {
  return getFields()[mapping.index] || document.createElement("input");
}

function getFields() {
  const seenRadioGroups = new Set();
  const candidates = getFieldDocuments().flatMap((doc) => [...doc.querySelectorAll(FIELD_SELECTOR)]).filter((element) => {
    const type = (element.getAttribute("type") || "").toLowerCase();
    const hidden = isHiddenElement(element);
    if (type === "radio" && element.name) {
      if (seenRadioGroups.has(element.name)) return false;
      seenRadioGroups.add(element.name);
    }
    const readonly = element.readOnly && !isReadonlyCustomControl(element);
    return !(hidden || element.disabled || readonly || IGNORED_TYPES.has(type));
  });
  return dedupeFieldCandidates(candidates);
}

function getFieldDocuments() {
  const docs = [document];
  document.querySelectorAll("iframe, frame").forEach((frame) => {
    try {
      if (frame.contentDocument && !docs.includes(frame.contentDocument)) docs.push(frame.contentDocument);
    } catch {
      // Cross-origin frames are handled by their own content script when the browser allows it.
    }
  });
  return docs;
}

function isHiddenElement(element) {
  return element.offsetParent === null && element.getClientRects().length === 0;
}

function isReadonlyCustomControl(element) {
  return Boolean(element.readOnly && element.closest?.(CUSTOM_CONTROL_SELECTOR));
}

function dedupeFieldCandidates(elements) {
  const groupIds = new WeakMap();
  let nextGroupId = 1;
  const groupIndex = new Map();
  const result = [];

  elements.forEach((element) => {
    const key = duplicateGroupKey(element, groupIds, () => nextGroupId++);
    if (!key) {
      result.push(element);
      return;
    }

    const existingIndex = groupIndex.get(key);
    if (existingIndex === undefined) {
      groupIndex.set(key, result.length);
      result.push(element);
      return;
    }

    const existing = result[existingIndex];
    const duplicateIsInternal = isReadonlyCustomControl(element) || isReadonlyCustomControl(existing);
    if (!duplicateIsInternal) {
      result.push(element);
      return;
    }
    if (preferFieldCandidate(element, existing)) {
      result[existingIndex] = element;
    }
  });

  return result;
}

function duplicateGroupKey(element, groupIds, nextId) {
  const formItem = element.closest?.(FORM_ITEM_SELECTOR);
  const label = componentLabel(element) || labelForId(element) || element.getAttribute("aria-label") || "";
  if (!formItem || !label) return "";
  if (!groupIds.has(formItem)) groupIds.set(formItem, nextId());
  return `${groupIds.get(formItem)}:${normalize(label)}`;
}

function preferFieldCandidate(candidate, existing) {
  const candidateReadonly = isReadonlyCustomControl(candidate);
  const existingReadonly = isReadonlyCustomControl(existing);
  if (candidateReadonly !== existingReadonly) return !candidateReadonly;
  if (isFillableElement(candidate) !== isFillableElement(existing)) return isFillableElement(candidate);
  return Boolean(candidate.getAttribute("placeholder")) && !existing.getAttribute("placeholder");
}

function getFieldContexts(element) {
  const contexts = [];
  addContext(contexts, "label", labelForId(element), 12);
  addContext(contexts, "label", element.closest("label")?.innerText, 11);
  addContext(contexts, "label", componentLabel(element), 10);
  addContext(contexts, "table", tableHeaderText(element), 9);
  addContext(contexts, "placeholder", element.getAttribute("placeholder"), 8);
  addContext(contexts, "aria", element.getAttribute("aria-label"), 8);
  addContext(contexts, "section", sectionHeadingText(element), 6);
  addContext(contexts, "nearby", previousTextNode(element), 5);
  addContext(contexts, "attr", element.getAttribute("autocomplete"), 4);
  addContext(contexts, "attr", element.getAttribute("data-label"), 4);
  addContext(contexts, "attr", element.getAttribute("data-name"), 4);
  addContext(contexts, "attr", element.getAttribute("name"), 3);
  addContext(contexts, "attr", element.getAttribute("id"), 3);
  addContext(contexts, "container", compactContainerText(element), 2);
  return contexts.filter((item, index, all) =>
    item.text && all.findIndex((other) => normalize(other.text) === normalize(item.text)) === index
  );
}

function addContext(contexts, source, value, weight) {
  const text = compactText(value || "");
  if (!text) return;
  contexts.push({ source, text, normalized: normalize(text), weight });
}

function labelForId(element) {
  if (!element.id) return "";
  return (element.ownerDocument || document).querySelector(`label[for="${CSS.escape(element.id)}"]`)?.innerText || "";
}

function componentLabel(element) {
  const formItem = element.closest(FORM_ITEM_SELECTOR);
  if (!formItem) return "";
  const label = formItem.querySelector(LABEL_SELECTOR);
  if (label && !label.contains(element)) return label.innerText || label.textContent || "";
  return "";
}

function tableHeaderText(element) {
  const cell = element.closest("td, th");
  const table = element.closest("table");
  if (!cell || !table || cell.cellIndex < 0) return "";
  const row = [...table.rows].find((candidate) => [...candidate.cells].some((cellItem) => cellItem.tagName === "TH"));
  return row?.cells?.[cell.cellIndex]?.innerText || "";
}

function compactContainerText(element) {
  const formItem = element.closest(FORM_ITEM_SELECTOR);
  if (!formItem) return "";
  const fields = formItem.querySelectorAll(FIELD_SELECTOR);
  if (fields.length > 1 && element.tagName !== "SELECT") return "";
  const clone = formItem.cloneNode(true);
  clone.querySelectorAll(`${FIELD_SELECTOR}, button, script, style`).forEach((item) => item.remove());
  return compactText(clone.innerText || clone.textContent || "").slice(0, 80);
}

function sectionHeadingText(element) {
  const section = element.closest("section, fieldset, .section, .form-section, .ant-card, .el-card, .moka-section, .moka-card, .ant-collapse-item, .collapse-item, .panel");
  const headingSelector = "legend, h1, h2, h3, h4, .section-title, .title, .card-title, .ant-card-head-title, .ant-collapse-header, .el-collapse-item__header";
  const heading = section?.querySelector(headingSelector);
  if (heading && !heading.contains(element)) {
    return heading.innerText || heading.textContent || "";
  }
  let node = element.closest(FORM_ITEM_SELECTOR)?.previousElementSibling || element.previousElementSibling;
  for (let i = 0; node && i < 4; i += 1, node = node.previousElementSibling) {
    if (/^(h1|h2|h3|h4|legend)$/i.test(node.tagName) || node.matches?.(".section-title, .title, .card-title")) {
      return node.innerText || node.textContent || "";
    }
  }
  return "";
}

function previousTextNode(element) {
  const previous = element.previousElementSibling;
  if (!previous || /^(input|textarea|select|button)$/i.test(previous.tagName)) return "";
  return previous.innerText || previous.textContent || "";
}

function displayLabel(contexts, element) {
  const labelContext = contexts.find((item) => ["label", "table", "placeholder", "aria", "nearby"].includes(item.source));
  return compactText(labelContext?.text || element.getAttribute("name") || element.id || element.tagName.toLowerCase());
}

function inferField(contexts, element) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  const allText = contexts.map((item) => item.text).join(" ");
  const normalizedAll = normalize(allText);
  const candidates = [];

  FIELD_RULES.forEach((rule, ruleIndex) => {
    const scoreInfo = scoreRule(rule, ruleIndex, contexts, normalizedAll, element, type);
    if (scoreInfo.score > 0) {
      candidates.push({ ...scoreInfo, rule });
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 36) {
    return { field: "", label: "", confidence: "none", sensitive: false, score: 0, reason: "" };
  }
  const second = candidates.find((candidate) => candidate.rule.field !== best.rule.field);
  const ambiguous = second && best.score - second.score < 8 && best.score < 92;
  const finalScore = ambiguous ? Math.max(0, best.score - 24) : best.score;
  if (finalScore < 36) {
    return { field: "", label: "", confidence: "none", sensitive: false, score: finalScore, reason: "" };
  }
  return {
    field: best.rule.field,
    label: best.rule.label,
    confidence: ambiguous ? "需确认" : finalScore >= 72 ? "高" : finalScore >= 52 ? "中" : "低",
    sensitive: best.rule.sensitive,
    score: finalScore,
    reason: ambiguous ? `${best.reason} · 可能也是 ${second.rule.label}` : best.reason
  };
}

function scoreRule(rule, ruleIndex, contexts, normalizedAll, element, type) {
  let score = 0;
  let reason = "";
  rule.patterns.forEach((pattern) => {
    const normalizedPattern = normalize(pattern);
    if (!normalizedPattern) return;
    contexts.forEach((context) => {
      const match = matchStrength(context.normalized, normalizedPattern);
      if (!match) return;
      const nextScore = match * context.weight + Math.min(normalizedPattern.length, 10) * 1.4 + (FIELD_RULES.length - ruleIndex) / 100;
      if (nextScore > score) {
        score = nextScore;
        reason = `${context.source}: ${pattern}`;
      }
    });
  });

  if (!score) return { score: 0, reason: "" };
  score += elementTypeBonus(rule.field, element, type);
  score += guardBonus(rule.field, normalizedAll, element, type);
  score = Math.max(0, score);
  return { score, reason };
}

function matchStrength(text, pattern) {
  if (!text || !pattern) return 0;
  if (text === pattern) return 9;
  if (text.startsWith(pattern) || text.endsWith(pattern)) return 7;
  if (text.includes(pattern)) return 5;
  return 0;
}

function elementTypeBonus(field, element, type) {
  let bonus = 0;
  if (type === "email" && field === "profile.email") bonus += 80;
  if (type === "tel" && field === "profile.phone") bonus += 50;
  if (type === "url" && ["projects.0.link", "portfolios.0.link"].includes(field)) bonus += 28;
  if (["date", "month"].includes(type) && field.endsWith("Date")) bonus += 18;
  if (type === "radio" && field === "profile.gender") bonus += 24;
  if (element.tagName === "SELECT" && ["profile.gender", "profile.idType", "profile.phoneType", "education.0.degree", "education.0.rank"].includes(field)) bonus += 16;
  if (element.tagName === "TEXTAREA" && ["internships", "projects", "awards", "selfDescription", "internships.0.description", "projects.0.description", "awards.0.description"].includes(field)) bonus += 22;
  if (element.tagName !== "TEXTAREA" && ["internships", "projects", "awards", "selfDescription", "internships.0.description", "projects.0.description", "awards.0.description"].includes(field)) bonus -= 28;
  return bonus;
}

function guardBonus(field, normalizedAll, element, type) {
  let bonus = 0;
  const hasEmergency = /紧急|emergency/.test(normalizedAll);
  const hasVerifier = /证明人|资料证明/.test(normalizedAll);
  const hasContact = /联系人|contact/.test(normalizedAll);
  const hasId = /身份证|证件|护照|identity|idnumber/.test(normalizedAll);
  const hasEducation = /教育|学校|院校|学院|专业|学历|学位|毕业|入学|就读|gpa|绩点/.test(normalizedAll);
  const hasCompany = /公司|单位|企业|company|雇主/.test(normalizedAll);
  const hasWork = /实习|工作经历|工作经验|任职|入职|离职|雇主|company|employer|internship|workexperience|employment/.test(normalizedAll);
  const hasProject = /项目|project/.test(normalizedAll);
  const hasAward = /获奖|奖项|奖学金|竞赛|award/.test(normalizedAll);
  const hasPortfolio = /作品|主页|portfolio|website|链接|网址|提取码|密码/.test(normalizedAll);
  const isSplitNameField = field === "profile.familyName" || field === "profile.givenName";
  const hasSplitNameSignal = /(^姓$|^名$|姓氏|lastname|familyname|surname|firstname|givenname)/.test(normalizedAll);
  const isInternshipField = field.startsWith("internships.");
  const isProjectField = field.startsWith("projects.");
  const isAwardField = field.startsWith("awards.");
  const isPortfolioField = field.startsWith("portfolios.");

  if (field === "profile.phone" && (hasEmergency || hasVerifier || hasId)) bonus -= 90;
  if (field === "profile.phone" && hasContact && !hasEmergency) bonus -= 70;
  if (field === "profile.name" && (hasEmergency || hasVerifier || hasContact || hasCompany || /学校|项目|作品/.test(normalizedAll))) bonus -= 55;
  if (field === "profile.name" && hasSplitNameSignal) bonus -= 90;
  if (isSplitNameField && /姓名|真实姓名|中文姓名|中文名|fullname/.test(normalizedAll)) bonus -= 45;
  if (isSplitNameField && /公司|企业|单位|学校|院校|项目|作品|奖项|专业|职位|岗位|名称/.test(normalizedAll) && !hasSplitNameSignal) bonus -= 95;
  if (field === "profile.idNumber" && type === "text") bonus += 8;
  if (field === "profile.currentLocation" && /就读|学校|院校/.test(normalizedAll)) bonus -= 70;
  if (field === "education.0.studyLocation" && /就读|学校|院校/.test(normalizedAll)) bonus += 28;
  if (field.startsWith("education.") && hasEducation) bonus += 18;
  if (field.startsWith("education.") && !hasEducation && /开始|结束|时间|date/.test(normalizedAll)) bonus -= 35;
  if (field === "education.0.schoolName" && hasCompany) bonus -= 55;
  if (isInternshipField && !hasWork && !/公司|单位|职位|岗位|职责/.test(normalizedAll)) bonus -= 72;
  if (isInternshipField && (hasEducation || hasProject || hasAward || hasPortfolio) && !hasWork) bonus -= 50;
  if (isProjectField && !hasProject) bonus -= 72;
  if (isProjectField && (hasEducation || hasWork || hasAward) && !hasProject) bonus -= 50;
  if (isAwardField && !hasAward) bonus -= 72;
  if (isPortfolioField && !hasPortfolio) bonus -= 72;
  if (field === "projects.0.link" && !hasProject) bonus -= 64;
  if (field === "portfolios.0.link" && hasProject) bonus -= 45;
  if (field === "verifier.name" && hasVerifier) bonus += 34;
  if (field === "profile.emergencyContact" && hasEmergency) bonus += 36;
  if (field === "profile.emergencyPhone" && hasEmergency) bonus += 36;
  if (field === "profile.email" && type !== "email" && /验证码|登录|账号/.test(normalizedAll)) bonus -= 60;
  if (field === "profile.qq" && /微信|wechat|weixin/.test(normalizedAll)) bonus -= 80;
  return bonus;
}

async function applyValue(element, value) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (!canAttemptFillElement(element)) return false;
  if (isReadonlyCustomControl(element)) {
    return fillCustomControl(element, value);
  }
  if (element.tagName === "SELECT") {
    const option = findBestOption([...element.options], value);
    if (!option) return false;
    setNativeValue(element, option.value);
  } else if (type === "radio") {
    const group = element.name ? [...(element.ownerDocument || document).querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)] : [element];
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
  } else if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    element.textContent = normalizeValueForElement(element, value);
  } else {
    setNativeValue(element, normalizeValueForElement(element, value));
  }
  dispatchInputEvents(element);
  return true;
}

async function fillCustomControl(element, value) {
  const formattedValue = normalizeValueForElement(element, value);
  const rootDocument = element.ownerDocument || document;

  await openCustomControl(element, [formattedValue, value], rootDocument);
  let option = await waitForCustomOption([formattedValue, value], rootDocument, 1800);
  if (!option) {
    setNativeValue(element, formattedValue);
    dispatchInputEvents(element);
    dispatchKeyboardEvents(element, "ArrowDown");
    await wait(120);
    option = await waitForCustomOption([formattedValue, value], rootDocument, 1200);
  }
  if (option) {
    const frameworkSelected = await selectFrameworkOption(element, option, formattedValue);
    if (!frameworkSelected) clickCustomOption(option);
    dispatchKeyboardEvents(element, "Enter");
    await wait(240);
    forceCustomInputValue(element, formattedValue);
    dispatchInputEvents(element);
    return true;
  }

  if (isDateLikeElement(element)) {
    setNativeValue(element, formattedValue);
    dispatchInputEvents(element);
    await wait(80);
    return normalize(getElementValue(element)) === normalize(formattedValue);
  }

  return false;
}

async function openCustomControl(element, values, rootDocument) {
  const targets = uniqueElements([
    element,
    element.closest?.(".el-select__wrapper, .el-input__wrapper, .ant-select-selector, .ant-picker"),
    element.closest?.(CUSTOM_CONTROL_SELECTOR),
    element.parentElement,
    element.closest?.(".el-form-item, .ant-form-item, .moka-form-item")
  ]);
  for (const target of targets) {
    clickElement(target);
    await wait(120);
    if (values.some((value) => findBestCustomOption(value, rootDocument))) return;
  }
}

function uniqueElements(items) {
  return items.filter((element, index, list) => element && list.indexOf(element) === index);
}

function clickElement(element) {
  if (!element) return;
  element.scrollIntoView?.({ block: "center", inline: "center" });
  element.focus?.();
  ["pointerover", "mouseover", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup"].forEach((type) => dispatchMouseLikeEvent(element, type));
  if (typeof element.click === "function") {
    element.click();
  } else {
    dispatchMouseLikeEvent(element, "click");
  }
}

function clickCustomOption(option) {
  const target = option.querySelector?.("span, div, [class*='label'], [class*='text']") || option;
  clickElement(target);
  if (target !== option) clickElement(option);
}

async function selectFrameworkOption(element, option, value) {
  if (trySelectFrameworkOption(element, option)) return true;
  return runPageWorldSelect(element, option, value);
}

function trySelectFrameworkOption(element, option) {
  const optionVm = findVueInstance(option);
  const controlVm = findVueInstance(element.closest?.(".el-select, .el-cascader, .ant-select") || element);
  try {
    if (optionVm && typeof optionVm.selectOptionClick === "function") {
      optionVm.selectOptionClick();
      return true;
    }
    if (controlVm && optionVm && typeof controlVm.handleOptionSelect === "function") {
      controlVm.handleOptionSelect(optionVm, true);
      return true;
    }
    if (controlVm && optionVm && typeof controlVm.$emit === "function" && optionVm.value !== undefined) {
      controlVm.$emit("input", optionVm.value);
      controlVm.$emit("change", optionVm.value);
      if ("visible" in controlVm) controlVm.visible = false;
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function findVueInstance(element) {
  for (let current = element; current; current = current.parentElement) {
    if (current.__vue__) return current.__vue__;
    if (current.__vueParentComponent) return current.__vueParentComponent.ctx || current.__vueParentComponent.proxy;
  }
  return null;
}

function runPageWorldSelect(element, option, value) {
  const doc = element.ownerDocument || document;
  const host = doc.documentElement || doc.body || doc.head;
  if (!host || !doc.createElement || !window.addEventListener || typeof CustomEvent !== "function") return Promise.resolve(false);

  const marker = `offeros-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  element.setAttribute("data-offeros-control-id", marker);
  option.setAttribute("data-offeros-option-id", marker);

  return new Promise((resolve) => {
    const eventName = `${marker}:selected`;
    const cleanup = () => {
      window.removeEventListener(eventName, onResult);
      element.removeAttribute("data-offeros-control-id");
      option.removeAttribute("data-offeros-option-id");
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, 700);
    const onResult = (event) => {
      window.clearTimeout(timer);
      cleanup();
      resolve(Boolean(event.detail?.ok));
    };
    window.addEventListener(eventName, onResult, { once: true });

    const script = doc.createElement("script");
    script.textContent = `(() => {
      const control = document.querySelector(${JSON.stringify(`[data-offeros-control-id="${marker}"]`)});
      const option = document.querySelector(${JSON.stringify(`[data-offeros-option-id="${marker}"]`)});
      let ok = false;
      const findVm = (node) => {
        for (let current = node; current; current = current.parentElement) {
          if (current.__vue__) return current.__vue__;
          if (current.__vueParentComponent) return current.__vueParentComponent.ctx || current.__vueParentComponent.proxy;
        }
        return null;
      };
      try {
        const optionVm = findVm(option);
        const controlVm = findVm(control && (control.closest(".el-select, .el-cascader, .ant-select") || control));
        if (optionVm && typeof optionVm.selectOptionClick === "function") {
          optionVm.selectOptionClick();
          ok = true;
        } else if (controlVm && optionVm && typeof controlVm.handleOptionSelect === "function") {
          controlVm.handleOptionSelect(optionVm, true);
          ok = true;
        } else if (controlVm && optionVm && typeof controlVm.$emit === "function" && optionVm.value !== undefined) {
          controlVm.$emit("input", optionVm.value);
          controlVm.$emit("change", optionVm.value);
          if ("visible" in controlVm) controlVm.visible = false;
          ok = true;
        }
      } catch (error) {
        ok = false;
      }
      window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: { ok } }));
      document.currentScript && document.currentScript.remove();
    })();`;
    host.appendChild(script);
  });
}

function forceCustomInputValue(element, value) {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return;
  const currentValue = normalize(getElementValue(element));
  if (!currentValue || !textMatchesValue(currentValue, normalizedValue)) {
    setNativeValue(element, value);
  }
  const placeholder = element.getAttribute?.("placeholder") || "";
  if (textMatchesValue(normalize(placeholder), normalizedValue)) {
    element.setAttribute("placeholder", placeholderTextForElement(element));
  }
}

function placeholderTextForElement(element) {
  const label = componentLabel(element) || labelForId(element) || "";
  if (/学历/.test(label)) return "请选择学历";
  if (/年级排名|成绩排名/.test(label)) return "请选择年级排名";
  if (/培养方式/.test(label)) return "请选择培养方式";
  return "请选择";
}

function dispatchMouseLikeEvent(element, type) {
  const rect = element.getBoundingClientRect?.();
  const clientX = rect ? rect.left + rect.width / 2 : 0;
  const clientY = rect ? rect.top + rect.height / 2 : 0;
  const EventConstructor = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
  element.dispatchEvent?.(new EventConstructor(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
    button: 0,
    buttons: type.includes("down") ? 1 : 0,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true
  }));
}

async function waitForCustomOption(values, rootDocument, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    for (const value of values) {
      const option = findBestCustomOption(value, rootDocument);
      if (option) return option;
    }
    await wait(120);
  }
  return null;
}

function findBestCustomOption(value, rootDocument = document) {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return null;
  const docs = rootDocument === document ? [document] : [rootDocument, document];
  const options = docs.flatMap((doc) => [...doc.querySelectorAll(CUSTOM_OPTION_SELECTOR)])
    .filter(isVisibleElement)
    .map((element) => ({ element, text: customOptionText(element), normalized: normalize(customOptionText(element)) }))
    .filter((item) => item.normalized);
  const matched = (
    options.find((item) => item.normalized === normalizedValue) ||
    options.find((item) => textMatchesValue(item.normalized, normalizedValue))
  );
  return matched?.element || null;
}

function textMatchesValue(optionText, valueText) {
  if (!optionText || !valueText) return false;
  const compactOption = optionText.replace(/\s+/g, "");
  const compactValue = valueText.replace(/\s+/g, "");
  return compactOption.includes(compactValue) || compactValue.includes(compactOption);
}

function customOptionText(element) {
  return compactText([
    element.innerText,
    element.textContent,
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title")
  ].filter(Boolean).join(" "));
}

function isVisibleElement(element) {
  return !(element.offsetParent === null && element.getClientRects().length === 0);
}

function isDateLikeElement(element) {
  const text = normalize([
    element.getAttribute("placeholder"),
    element.getAttribute("aria-label"),
    componentLabel(element),
    labelForId(element)
  ].filter(Boolean).join(" "));
  return Boolean(element.closest?.(".el-date-editor, .ant-picker") || /日期|时间|年月|yyyymm|yyyy/.test(text));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findBestOption(options, value) {
  const normalizedValue = normalize(value);
  const usableOptions = options.filter((option) => normalize(option.textContent || option.value));
  return (
    usableOptions.find((option) => normalize(option.textContent) === normalizedValue || normalize(option.value) === normalizedValue) ||
    usableOptions.find((option) => normalize(option.textContent).includes(normalizedValue) || normalizedValue.includes(normalize(option.textContent))) ||
    usableOptions.find((option) => normalize(option.value).includes(normalizedValue))
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
  element.dispatchEvent(new Event("beforeinput", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function dispatchKeyboardEvents(element, key) {
  if (typeof KeyboardEvent !== "function") return;
  ["keydown", "keyup"].forEach((type) => {
    element.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  });
}

function getElementValue(element) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") return element.textContent || "";
  if (type === "radio" || type === "checkbox") return element.checked ? element.value || "已选" : "";
  return element.value || "";
}

function getProfileValue(profile, field) {
  const virtualValue = getVirtualProfileValue(profile, field);
  if (virtualValue !== undefined) return virtualValue;
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

function getVirtualProfileValue(profile, field) {
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

function formatNestedValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(formatNestedValue).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(formatNestedValue).filter(Boolean).join(" ");
  return "";
}

function normalizeValueForElement(element, value, extraText = "") {
  const raw = String(value || "").trim();
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (wantsMonthValue(element, extraText)) {
    const match = raw.match(/(20\d{2})[-/.年](\d{1,2})/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}`;
  }
  if (type === "date") {
    const match = raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }
  if (type === "month") {
    const match = raw.match(/(20\d{2})[-/.年](\d{1,2})/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}`;
  }
  return raw;
}

function wantsMonthValue(element, extraText = "") {
  const text = normalize([
    element.getAttribute("placeholder"),
    element.getAttribute("aria-label"),
    componentLabel(element),
    labelForId(element),
    extraText
  ].filter(Boolean).join(" "));
  return /yyyymm|年月|入学时间|毕业时间|开始年月|结束年月/.test(text);
}

function canAttemptFillElement(element) {
  if (element.tagName === "SELECT") return element.options.length > 0;
  return true;
}

function elementTypeName(element) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (isReadonlyCustomControl(element)) return "custom-control";
  return element.tagName === "INPUT" && type ? type : element.tagName.toLowerCase();
}

function optionLabel(element) {
  const idLabel = element.id ? (element.ownerDocument || document).querySelector(`label[for="${CSS.escape(element.id)}"]`)?.innerText : "";
  return normalize([idLabel, element.closest("label")?.innerText, element.value].filter(Boolean).join(" "));
}

function fieldSignature(element, label) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  return [
    element.tagName.toLowerCase(),
    type,
    element.getAttribute("name") || "",
    element.id || "",
    element.getAttribute("autocomplete") || "",
    compactText(label || "")
  ].map(normalize).join("|").slice(0, 220);
}

function normalize(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:*＊·•\-_/\\|()[\]{}，,。.;；]/g, "");
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}
