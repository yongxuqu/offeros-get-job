(() => {
  if (window.__offerosPageBridge) return;
  window.__offerosPageBridge = true;

  const findVm = (node) => {
    for (let current = node; current; current = current.parentElement) {
      if (current.__vue__) return current.__vue__;
      if (current.__vueParentComponent) {
        return current.__vueParentComponent.ctx || current.__vueParentComponent.proxy;
      }
    }
    return null;
  };

  const reactProps = (node) => {
    if (!node) return null;
    const key = Object.keys(node).find((item) =>
      item.startsWith("__reactEventHandlers$") || item.startsWith("__reactProps$")
    );
    return key ? node[key] : null;
  };

  const invokeReactOption = (option, expected) => {
    const exact = [option, ...option.querySelectorAll("*")]
      .filter((node) => String(node.innerText || node.textContent || "").trim() === expected);
    const clickTarget = exact[exact.length - 1] || option;
    let node = clickTarget;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const props = reactProps(node);
      const handler = props?.onClick || props?.onMouseDown || props?.onSelect;
      if (typeof handler !== "function") continue;
      handler.call(node, new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      return true;
    }
    return false;
  };

  document.addEventListener("offeros:select", async (event) => {
    const marker = String(event.detail?.marker || "");
    if (!marker) return;
    const control = document.querySelector(`[data-offeros-control-id="${CSS.escape(marker)}"]`);
    const option = document.querySelector(`[data-offeros-option-id="${CSS.escape(marker)}"]`);
    let ok = false;

    try {
      const expected = String(event.detail?.value || "").trim();
      if (option && invokeReactOption(option, expected)) {
        ok = true;
      }
      const optionVm = findVm(option);
      const controlRoot = control?.closest(".el-select, .el-cascader, .ant-select") || control;
      const controlVm = findVm(controlRoot);
      if (!ok && optionVm && typeof optionVm.selectOptionClick === "function") {
        optionVm.selectOptionClick();
        ok = true;
      } else if (!ok && controlVm && optionVm && typeof controlVm.handleOptionSelect === "function") {
        controlVm.handleOptionSelect(optionVm, true);
        ok = true;
      } else if (!ok && controlVm && optionVm && typeof controlVm.$emit === "function" && optionVm.value !== undefined) {
        controlVm.$emit("input", optionVm.value);
        controlVm.$emit("change", optionVm.value);
        if ("visible" in controlVm) controlVm.visible = false;
        ok = true;
      } else if (!ok && option) {
        const candidates = [option, ...option.querySelectorAll("*")]
          .filter((node) => String(node.innerText || node.textContent || "").trim() === expected);
        (candidates[candidates.length - 1] || option).click();
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (ok) await new Promise((resolve) => setTimeout(resolve, 120));
    window.dispatchEvent(new CustomEvent(`${marker}:selected`, { detail: { ok } }));
  });
})();
