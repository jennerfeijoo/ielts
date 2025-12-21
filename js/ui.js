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
  const { onAnswerChange } = opts;
  const callChange = () => { if (typeof onAnswerChange === "function") onAnswerChange(); };
  container.innerHTML = "";
  const labelText = q.label ?? (q.shortLabel ? `Q${q.shortLabel}` : (q.key ? `Q${q.key}` : ""));

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "12px";
  container.appendChild(wrap);

  const title = document.createElement("div");
  title.className = "row";
  title.innerHTML = `<div class="badge"><strong>${labelText}</strong></div>${q.hint ? `<div class="small">${q.hint}</div>` : ""}`;
  wrap.appendChild(title);

  if (q.prompt) {
    const p = document.createElement("div");
    p.className = "notice";
    p.textContent = q.prompt;
    wrap.appendChild(p);
  }

  const optionsList = Array.isArray(q.options) ? q.options : [];

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
  const letters = q.letters ?? ["A","B","C","D","E","F","G","H","I","J"];
  const letterForIndex = (idx) => normalizeLetter(letters[idx] ?? String.fromCharCode(65 + idx));
  const normalizedOptions = (() => {
    const opts = [];
    if (Array.isArray(q.options) && q.options.length) {
      q.options.forEach((opt, idx) => {
        if (typeof opt === "string") {
          opts.push({ id: letterForIndex(idx), text: opt });
          return;
        }
        const id = normalizeLetter(opt.id ?? opt.value ?? opt.letter ?? letters[idx] ?? String.fromCharCode(65 + idx));
        const text = opt.text ?? opt.label ?? opt.value ?? "";
        opts.push({ id, text });
      });
      return opts;
    }
    if (Array.isArray(q.optionTexts) && q.optionTexts.length) {
      q.optionTexts.forEach((text, idx) => {
        opts.push({ id: letterForIndex(idx), text });
      });
      return opts;
    }
    if (Array.isArray(q.letters) && Array.isArray(q.optionTexts)) {
      q.optionTexts.forEach((text, idx) => {
        opts.push({ id: letterForIndex(idx), text });
      });
      return opts;
    }
    return opts;
  })();
  const selectValues = (normalizedOptions.length
    ? normalizedOptions.map(o => o.id).filter(Boolean)
    : letters
  ).map(normalizeLetter);
  const expectedCount = q.expectedCount ?? 2;

  const makeRadioGroup = (values) => {
    const group = document.createElement("div");
    group.className = "row";
    group.style.gap = "8px";
    const val = typeof current === "string" ? normalizeLetter(current) : "";
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

  if (type === "multipleChoice") {
    if (!normalizedOptions.length) {
      const fallback = document.createElement("div");
      fallback.className = "notice";
      fallback.textContent = "No options available.";
      body.appendChild(fallback);
      return;
    }
    const maxSelect = (() => {
      if (Number.isFinite(Number(q.maxSelect)) && Number(q.maxSelect) > 0) return Number(q.maxSelect);
      if (typeof q.expectedCount === "number" && q.expectedCount > 1) return q.expectedCount;
      if (typeof q.hint === "string" && /choose\s+two/i.test(q.hint)) return 2;
      return 1;
    })();
    const allowMulti = maxSelect >= 2;
    const parseResponse = (val) => {
      if (Array.isArray(val)) return val.map(normalizeLetter).filter(Boolean);
      if (typeof val === "string") {
        if (val.includes(",")) return val.split(",").map(normalizeLetter).filter(Boolean);
        const solo = normalizeLetter(val);
        return solo ? [solo] : [];
      }
      return [];
    };
    const state = new Set(parseResponse(currentRaw));
    if (!allowMulti && state.size > 1) {
      const first = Array.from(state)[0];
      state.clear();
      if (first) state.add(first);
    }
    const group = document.createElement("div");
    group.className = "column";
    group.style.gap = "8px";

    const commit = () => {
      const sorted = Array.from(state).filter(Boolean).sort();
      setValue(engine, q.key, allowMulti ? sorted : (sorted[0] ?? ""));
      callChange();
    };

    const refreshDisabled = () => {
      if (!allowMulti) return;
      const atMax = state.size >= maxSelect;
      group.querySelectorAll("input[type='checkbox']").forEach(cb => {
        if (!cb.checked) cb.disabled = atMax;
      });
    };

    normalizedOptions.forEach((opt, idx) => {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "flex-start";
      label.style.gap = "8px";
      label.style.fontSize = "14px";

      const input = document.createElement("input");
      input.type = allowMulti ? "checkbox" : "radio";
      input.name = `mc-${q.key}`;
      input.value = opt.id ?? letterForIndex(idx);
      input.checked = state.has(input.value);
      input.addEventListener("change", () => {
        if (allowMulti) {
          if (input.checked) {
            if (state.size >= maxSelect) {
              input.checked = false;
              return;
            }
            state.add(input.value);
          } else {
            state.delete(input.value);
          }
        } else {
          state.clear();
          if (input.checked) state.add(input.value);
        }
        refreshDisabled();
        commit();
      });

      const letterSpan = document.createElement("span");
      letterSpan.style.fontWeight = "600";
      letterSpan.textContent = `${input.value || letterForIndex(idx)}.`;

      const textSpan = document.createElement("span");
      textSpan.textContent = opt.text ?? "";

      label.appendChild(input);
      label.appendChild(letterSpan);
      label.appendChild(textSpan);
      group.appendChild(label);
    });

    refreshDisabled();
    body.appendChild(group);
    if (allowMulti) {
      const note = document.createElement("div");
      note.className = "small";
      note.textContent = `Choose up to ${maxSelect} option(s).`;
      wrap.appendChild(note);
    }
    clearBtn.addEventListener("click", () => {
      state.clear();
      group.querySelectorAll("input").forEach(inp => { inp.checked = false; inp.disabled = false; });
      commit();
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
    const label = q.shortLabel ?? q.label ?? q.key ?? "";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "qbtn";
    b.textContent = label;
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
