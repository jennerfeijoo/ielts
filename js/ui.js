import { normalizeLetter } from "./normalize.js";

const canonicalVal = (engine, key) => {
  if (!engine) return null;
  if (typeof engine.getAnswer === "function") return engine.getAnswer(key);
  if (typeof engine.getResponse === "function") return engine.getResponse(key);
  return engine.responses?.[key] ?? null;
};

const setValue = (engine, key, value) => {
  if (!engine) return;
  if (typeof engine.setAnswer === "function") { engine.setAnswer(key, value); return; }
  if (typeof engine.setResponse === "function") { engine.setResponse(key, value); return; }
  if (engine.responses) engine.responses[key] = value;
};

export function renderQuestion(container, q, engine, opts = {}) {
  if (!container || !q) return;
  const { onAnswerChange, flagged = false } = opts;
  const callChange = () => { if (typeof onAnswerChange === "function") onAnswerChange(); };
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "12px";
  container.appendChild(wrap);

  const title = document.createElement("div");
  title.className = "row";
  const flagBadge = flagged ? `<div class="badge danger">Flagged</div>` : "";
  title.innerHTML = `<div class="badge"><strong>${q.label ?? ""}</strong></div>${flagBadge}${q.hint ? `<div class="small">${q.hint}</div>` : ""}`;
  wrap.appendChild(title);

  if (q.prompt) {
    const p = document.createElement("div");
    p.className = "notice";
    p.textContent = q.prompt;
    wrap.appendChild(p);
  }

  const optionsList = Array.isArray(q.options) ? q.options : [];
  if (optionsList.length) {
    const list = document.createElement("div");
    list.className = "small";
    list.style.lineHeight = "1.5";
    for (const opt of optionsList) {
      const row = document.createElement("div");
      row.textContent = `${opt.letter ? `${opt.letter}) ` : ""}${opt.text ?? ""}`.trim();
      list.appendChild(row);
    }
    wrap.appendChild(list);
  }

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn secondary";
  clearBtn.style.alignSelf = "flex-start";
  clearBtn.textContent = "Clear answer";

  const body = document.createElement("div");
  body.className = "row";
  body.style.alignItems = "flex-start";
  body.style.flexWrap = "wrap";
  body.style.gap = "12px";
  wrap.appendChild(body);

  const type = q.type;
  const currentRaw = canonicalVal(engine, q.key);
  const current = Array.isArray(currentRaw) ? currentRaw : (typeof currentRaw === "string" ? currentRaw : "");
  const letters = q.letters ?? ["A","B","C","D"];
  const selectValues = (optionsList.length
    ? optionsList.map(o => o.letter ?? o.text).filter(Boolean)
    : letters
  ).map(normalizeLetter);
  const expectedCount = q.expectedCount ?? 2;

  const makeRadioGroup = (values) => {
    const group = document.createElement("div");
    group.className = "row";
    group.style.gap = "8px";
    const val = typeof current === "string" ? current : "";
    values.forEach(v => {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.style.fontSize = "14px";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `radio-${q.key}`;
      input.value = v;
      input.checked = val === v;
      input.addEventListener("change", () => {
        setValue(engine, q.key, v);
        callChange();
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(v));
      group.appendChild(label);
    });
    return group;
  };

  const makeSelect = (vals, placeholder="Select...") => {
    const select = document.createElement("select");
    const addOpt = (val, text) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = text ?? val;
      select.appendChild(o);
    };
    addOpt("", placeholder);
    vals.forEach(v => addOpt(v, v));
    select.value = typeof current === "string" ? current : "";
    select.addEventListener("change", () => {
      setValue(engine, q.key, select.value);
      callChange();
    });
    return select;
  };

  if (type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = typeof current === "string" ? current : "";
    input.addEventListener("input", () => {
      setValue(engine, q.key, input.value.trim());
      callChange();
    });
    body.appendChild(input);
    clearBtn.addEventListener("click", () => {
      input.value = "";
      setValue(engine, q.key, "");
      callChange();
    });
    wrap.appendChild(clearBtn);
    return;
  }

  if (type === "textarea") {
    const ta = document.createElement("textarea");
    ta.value = typeof current === "string" ? current : "";
    ta.addEventListener("input", () => {
      setValue(engine, q.key, ta.value.trim());
      callChange();
    });
    body.appendChild(ta);
    clearBtn.addEventListener("click", () => {
      ta.value = "";
      setValue(engine, q.key, "");
      callChange();
    });
    wrap.appendChild(clearBtn);
    return;
  }

  if (type === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.value = typeof current === "string" ? current : "";
    input.addEventListener("input", () => {
      setValue(engine, q.key, input.value.trim());
      callChange();
    });
    body.appendChild(input);
    clearBtn.addEventListener("click", () => {
      input.value = "";
      setValue(engine, q.key, "");
      callChange();
    });
    wrap.appendChild(clearBtn);
    return;
  }

  if (type === "tfng") {
    const group = makeRadioGroup(["TRUE","FALSE","NOT GIVEN"]);
    body.appendChild(group);
    clearBtn.addEventListener("click", () => {
      setValue(engine, q.key, "");
      const radios = group.querySelectorAll("input[type='radio']");
      radios.forEach(r => { r.checked = false; });
      callChange();
    });
    wrap.appendChild(clearBtn);
    return;
  }

  if (type === "ynng") {
    const group = makeRadioGroup(["YES","NO","NOT GIVEN"]);
    body.appendChild(group);
    clearBtn.addEventListener("click", () => {
      setValue(engine, q.key, "");
      const radios = group.querySelectorAll("input[type='radio']");
      radios.forEach(r => { r.checked = false; });
      callChange();
    });
    wrap.appendChild(clearBtn);
    return;
  }

  if (type === "single_letter") {
    const group = makeRadioGroup(selectValues);
    body.appendChild(group);
    clearBtn.addEventListener("click", () => {
      setValue(engine, q.key, "");
      group.querySelectorAll("input[type='radio']").forEach(r => { r.checked = false; });
      callChange();
    });
    wrap.appendChild(clearBtn);
    return;
  }

  if (type === "multi_letter") {
    const currentArr = Array.isArray(currentRaw)
      ? currentRaw.map(normalizeLetter)
      : (typeof currentRaw === "string" && currentRaw.includes(",")) ? currentRaw.split(",").map(normalizeLetter) : [];
    const state = new Set(currentArr);
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(56px,1fr))";
    grid.style.gap = "8px";

    const updateStorage = () => {
      const sorted = Array.from(state).sort();
      setValue(engine, q.key, sorted);
      callChange();
    };

    const refreshDisabled = () => {
      const atMax = state.size >= expectedCount;
      grid.querySelectorAll("input[type='checkbox']").forEach(cb => {
        if (!cb.checked) cb.disabled = atMax;
      });
    };

    letters.map(normalizeLetter).forEach(letter => {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.style.fontSize = "14px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = letter;
      cb.checked = state.has(letter);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          if (state.size >= expectedCount) {
            cb.checked = false;
            return;
          }
          state.add(letter);
        } else {
          state.delete(letter);
        }
        refreshDisabled();
        updateStorage();
      });

      label.appendChild(cb);
      label.appendChild(document.createTextNode(letter));
      grid.appendChild(label);
    });

    refreshDisabled();
    body.appendChild(grid);
    const note = document.createElement("div");
    note.className = "small";
    note.textContent = `Select up to ${expectedCount} option(s).`;
    wrap.appendChild(note);
    clearBtn.addEventListener("click", () => {
      state.clear();
      grid.querySelectorAll("input[type='checkbox']").forEach(cb => { cb.checked = false; cb.disabled = false; });
      updateStorage();
    });
    wrap.appendChild(clearBtn);
    return;
  }

  if (type === "matching" || type === "headings" || type === "dropdown") {
    const select = makeSelect(selectValues);
    body.appendChild(select);
    clearBtn.addEventListener("click", () => {
      select.value = "";
      setValue(engine, q.key, "");
      callChange();
    });
    wrap.appendChild(clearBtn);
    return;
  }

  const fallback = document.createElement("div");
  fallback.className = "notice";
  fallback.textContent = `Unsupported question type: ${type ?? "unknown"}`;
  wrap.appendChild(fallback);
}

export function renderNav(navEl, questions, responses, currentKey, onPick, flagged=new Set()) {
  if (!navEl) return;
  navEl.innerHTML = "";
  for (const q of questions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "qbtn";
    b.textContent = q.shortLabel;
    const val = responses?.[q.key];
    if (val != null && val !== "" && !(Array.isArray(val) && val.length === 0)) {
      b.classList.add("ans");
    }
    if (flagged.has(q.key)) b.classList.add("flagged");
    if (q.key === currentKey) b.classList.add("cur");
    b.addEventListener("click", () => onPick(q.key));
    navEl.appendChild(b);
  }
}
