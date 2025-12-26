import { normalizeLetter } from "./normalize.js";

/**
 * ui.js
 * Pure DOM rendering helpers for the simulator (Reading/Listening runners).
 * Keeps rendering logic separate from ExamEngine and runner_common.
 */

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

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

function renderOptionsBox(box) {
  if (!box) return null;
  const items = box.items ?? box.options ?? null;
  if (!Array.isArray(items) || items.length === 0) return null;

  const wrap = document.createElement("div");
  wrap.className = "notice";
  wrap.style.margin = "10px 0";

  const title = box.title
    ? `<div class="small"><strong>${escapeHtml(box.title)}</strong></div>`
    : `<div class="small"><strong>Options</strong></div>`;

  const cols = box.columns ?? 2;

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.style.gap = "6px";
  grid.style.marginTop = "6px";

  items.forEach((it) => {
    const row = document.createElement("div");
    if (typeof it === "string") {
      row.textContent = it;
    } else {
      const k = it.letter ?? it.key ?? "";
      const t = it.text ?? it.label ?? "";
      row.innerHTML = `<strong>${escapeHtml(k)}</strong> ${escapeHtml(t)}`.trim();
    }
    grid.appendChild(row);
  });

  wrap.innerHTML = title;
  wrap.appendChild(grid);
  return wrap;
}

function computeGroupTitle(groupQuestions) {
  const nums = groupQuestions
    .map(q => Number(String(q.key).match(/\d+/)?.[0]))
    .filter(n => Number.isFinite(n))
    .sort((a,b)=>a-b);

  if (nums.length >= 2) return `Questions ${nums[0]}–${nums[nums.length-1]}`;
  if (nums.length === 1) return `Question ${nums[0]}`;
  return "Questions";
}

function normalizeMcOptions(q) {
  const raw = Array.isArray(q.options) ? q.options : [];
  const out = [];
  const re = /^\s*([A-Z])\s*[\).:\-]?\s*(.*)$/;

  for (let i = 0; i < raw.length; i++) {
    const it = raw[i];
    if (typeof it === "string") {
      const m = it.match(re);
      if (m && m[1]) {
        out.push({ id: m[1], text: m[2] || "" });
      } else {
        out.push({ id: String.fromCharCode(65 + i), text: it });
      }
    } else if (it && typeof it === "object") {
      const id = it.id ?? it.key ?? it.letter ?? String.fromCharCode(65 + i);
      const text = it.text ?? it.label ?? "";
      out.push({ id: String(id), text: String(text) });
    }
  }
  return out;
}

function renderAnswerControl(q, engine, callChange) {
  const type = q.type ?? "text";
  const currentRaw = canonicalVal(engine, q.key);

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

    select.value = typeof currentRaw === "string" ? currentRaw : "";
    select.addEventListener("change", () => {
      setValue(engine, q.key, select.value);
      callChange();
    });
    return select;
  };

  // Free text entry
  if (type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = q.placeholder ?? "Type your answer";
    input.value = typeof currentRaw === "string" ? currentRaw : "";
    input.addEventListener("input", () => {
      setValue(engine, q.key, input.value);
      callChange();
    });
    return input;
  }

  // TRUE/FALSE/NOT GIVEN or YES/NO/NOT GIVEN
  if (type === "tfng" || type === "ynng") {
    const vals = type === "tfng"
      ? ["TRUE", "FALSE", "NOT GIVEN"]
      : ["YES", "NO", "NOT GIVEN"];
    return makeSelect(vals, "Select...");
  }

  // Single letter selection (Listening/Reading matching)
  if (type === "single_letter" || type === "matching") {
    const letters = q.allowedLetters ?? q.letters ?? q.options ?? ["A","B","C","D","E","F","G"];
    return makeSelect(letters, "Select letter...");
  }

  // Multiple choice (single or multi)
  if (type === "multipleChoice") {
    const opts = normalizeMcOptions(q);
    const maxSelect = (() => {
      if (typeof q.maxSelect === "number") return q.maxSelect;
      if (q.multipleAnswers === true) return q.expectedCount ?? 2;
      if (typeof q.expectedCount === "number" && q.expectedCount > 1) return q.expectedCount;
      if (typeof q.hint === "string" && /choose\s+two/i.test(q.hint)) return 2;
      return 1;
    })();

    const allowMulti = maxSelect >= 2;

    const current = (() => {
      if (allowMulti) {
        if (Array.isArray(currentRaw)) return currentRaw.map(normalizeLetter).filter(Boolean);
        if (typeof currentRaw === "string") return currentRaw.split(",").map(normalizeLetter).filter(Boolean);
        return [];
      }
      return typeof currentRaw === "string" ? normalizeLetter(currentRaw) : "";
    })();

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    const name = `mc_${q.key}_${Math.random().toString(16).slice(2)}`;

    opts.forEach((o) => {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.gap = "10px";
      row.style.alignItems = "flex-start";
      row.style.cursor = "pointer";

      const inp = document.createElement("input");
      inp.type = allowMulti ? "checkbox" : "radio";
      inp.name = name;
      inp.value = o.id;

      if (allowMulti) {
        inp.checked = Array.isArray(current) ? current.includes(normalizeLetter(o.id)) : false;
      } else {
        inp.checked = current === normalizeLetter(o.id);
      }

      inp.addEventListener("change", () => {
        if (allowMulti) {
          const next = new Set(Array.isArray(current) ? current : []);
          const id = normalizeLetter(o.id);
          if (inp.checked) next.add(id); else next.delete(id);
          setValue(engine, q.key, Array.from(next));
        } else {
          setValue(engine, q.key, normalizeLetter(o.id));
        }
        callChange();
      });

      const txt = document.createElement("div");
      txt.innerHTML = `<strong>${escapeHtml(o.id)}</strong> ${escapeHtml(o.text)}`.trim();

      row.appendChild(inp);
      row.appendChild(txt);
      wrap.appendChild(row);
    });

    // Small hint under options (if present)
    if (q.hint) {
      const h = document.createElement("div");
      h.className = "small";
      h.style.marginTop = "2px";
      h.textContent = q.hint;
      wrap.appendChild(h);
    }

    return wrap;
  }

  // Fallback
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type your answer";
  input.value = typeof currentRaw === "string" ? currentRaw : "";
  input.addEventListener("input", () => {
    setValue(engine, q.key, input.value);
    callChange();
  });
  return input;
}

function renderQuestionInline(parent, q, engine, callChange) {
  const row = document.createElement("div");
  row.style.border = "1px solid var(--border)";
  row.style.padding = "10px 12px";
  row.style.borderRadius = "12px";

  const head = document.createElement("div");
  head.className = "row";
  const label = q.shortLabel ?? q.key;
  head.innerHTML = `<div class="badge"><strong>Q${escapeHtml(label)}</strong></div>`;
  row.appendChild(head);

  if (q.prompt) {
    const p = document.createElement("div");
    p.className = "small";
    p.style.fontSize = "14px";
    p.innerHTML = escapeHtml(q.prompt);
    row.appendChild(p);
  }

  const control = renderAnswerControl(q, engine, callChange);
  row.appendChild(control);

  parent.appendChild(row);
}

/**
 * Render the question panel.
 * - For Reading, if the current question belongs to a group (groupId), render the whole group together.
 */
export function renderQuestion(container, q, engine, opts = {}) {
  if (!container || !q) return;
  const { onAnswerChange } = opts;
  const callChange = () => { if (typeof onAnswerChange === "function") onAnswerChange(); };

  // Reading group mode
  if (opts?.moduleName === "reading" && opts?.section && q.groupId) {
    const sec = opts.section;
    const allQs = Array.isArray(sec.questions) ? sec.questions : [];
    const groupQs = allQs.filter(x => x && x.groupId === q.groupId);

    if (groupQs.length) {
      container.innerHTML = "";
      const wrapG = document.createElement("div");
      wrapG.style.display = "flex";
      wrapG.style.flexDirection = "column";
      wrapG.style.gap = "12px";
      container.appendChild(wrapG);

      const meta = (Array.isArray(sec.groups) ? sec.groups : []).find(g => g && g.id === q.groupId) ?? null;
      const gTitle = meta?.title ?? q.groupTitle ?? computeGroupTitle(groupQs);
      const gInstr = meta?.instructions ?? q.groupInstructions ?? "";
      const gBox = meta?.optionsBox ?? meta?.sharedOptionsBox ?? q.optionsBox ?? q.sharedOptionsBox ?? null;

      const title = document.createElement("div");
      title.className = "h1";
      title.style.fontSize = "18px";
      title.textContent = gTitle;
      wrapG.appendChild(title);

      if (gInstr) {
        const instr = document.createElement("div");
        instr.className = "notice";
        instr.innerHTML = escapeHtml(gInstr);
        wrapG.appendChild(instr);
      }

      const boxEl = renderOptionsBox(gBox);
      if (boxEl) wrapG.appendChild(boxEl);

      groupQs.forEach((qq) => renderQuestionInline(wrapG, qq, engine, callChange));
      return;
    }
  }

  // Default single-question mode
  container.innerHTML = "";

  const title = document.createElement("div");
  title.className = "h1";
  title.style.fontSize = "18px";
  title.textContent = q.title ?? (q.label ? String(q.label) : `Question ${q.key}`);
  container.appendChild(title);

  if (q.hint) {
    const hint = document.createElement("div");
    hint.className = "small";
    hint.style.marginTop = "6px";
    hint.textContent = q.hint;
    container.appendChild(hint);
  }

  if (q.prompt) {
    const p = document.createElement("div");
    p.className = "notice";
    p.style.marginTop = "10px";
    p.innerHTML = escapeHtml(q.prompt);
    container.appendChild(p);
  }

  const control = renderAnswerControl(q, engine, callChange);
  control.style.marginTop = "10px";
  container.appendChild(control);

  const clear = document.createElement("button");
  clear.className = "btn secondary";
  clear.style.marginTop = "10px";
  clear.textContent = "Clear answer";
  clear.addEventListener("click", () => {
    const t = q.type ?? "text";
    const isMulti = (t === "multipleChoice") && (() => {
      const maxSelect = typeof q.maxSelect === "number" ? q.maxSelect
        : (q.multipleAnswers === true ? (q.expectedCount ?? 2)
        : (typeof q.expectedCount === "number" ? q.expectedCount : 1));
      return maxSelect >= 2;
    })();
    setValue(engine, q.key, isMulti ? [] : "");
    callChange();
    // re-render to reflect cleared state
    renderQuestion(container, q, engine, opts);
  });
  container.appendChild(clear);
}

/**
 * Render the question navigation grid (Q1..Qn).
 */
export function renderNav(navEl, questions, responses, currentKey, onPick, flagged = new Set()) {
  if (!navEl) return;

  navEl.innerHTML = "";
  // Ensure grid layout comes from CSS (.qnav on the element)
  // Questions are rendered as buttons inside the grid.
  (questions ?? []).forEach((q, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qbtn";

    const key = q.key ?? String(idx + 1);
    const label = q.shortLabel ?? String(key);

    btn.textContent = label;

    const ans = responses?.[key];
    const answered = (() => {
      if (ans == null) return false;
      if (Array.isArray(ans)) return ans.filter(Boolean).length > 0;
      return String(ans).trim().length > 0;
    })();

    if (answered) btn.classList.add("ans");
    if (String(key) === String(currentKey)) btn.classList.add("cur");
    if (flagged && typeof flagged.has === "function" && flagged.has(String(key))) btn.classList.add("flagged");

    btn.addEventListener("click", () => {
      if (typeof onPick === "function") onPick(idx, q);
    });

    navEl.appendChild(btn);
  });
}
