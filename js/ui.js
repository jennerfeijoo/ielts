import { normalizeLetter } from "./normalize.js";

export function renderQuestion(q, container, currentValue, onChange) {
  container.innerHTML = "";

  const title = document.createElement("div");
  title.className = "row";
  title.innerHTML = `<div class="badge"><strong>${q.label}</strong></div><div class="small">${q.hint ?? ""}</div>`;
  container.appendChild(title);

  if (q.prompt) {
    const p = document.createElement("div");
    p.className = "notice";
    p.textContent = q.prompt;
    container.appendChild(p);
  } else {
    const p = document.createElement("div");
    p.className = "notice";
    p.innerHTML = `Answer here. Use your test PDF/audio for the original question text.`;
    container.appendChild(p);
  }

  const body = document.createElement("div");
  body.className = "row";
  body.style.marginTop = "12px";
  body.style.alignItems = "stretch";
  container.appendChild(body);

  const type = q.type;

  if (type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type your answer (e.g., one word/number)";
    input.value = currentValue ?? "";
    input.addEventListener("input", () => onChange(input.value));
    body.appendChild(input);
    return;
  }

  const select = document.createElement("select");
  const addOpt = (val, label) => {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = label ?? val;
    select.appendChild(o);
  };

  if (type === "tfng") {
    addOpt("", "Select...");
    ["TRUE","FALSE","NOT GIVEN"].forEach(v => addOpt(v, v));
    select.value = currentValue ?? "";
    select.addEventListener("change", () => onChange(select.value));
    body.appendChild(select);
    return;
  }

  if (type === "ynng") {
    addOpt("", "Select...");
    ["YES","NO","NOT GIVEN"].forEach(v => addOpt(v, v));
    select.value = currentValue ?? "";
    select.addEventListener("change", () => onChange(select.value));
    body.appendChild(select);
    return;
  }

  if (type === "single_letter") {
    addOpt("", "Select...");
    (q.letters ?? ["A","B","C","D"]).forEach(v => addOpt(v, v));
    select.value = currentValue ?? "";
    select.addEventListener("change", () => onChange(normalizeLetter(select.value)));
    body.appendChild(select);
    return;
  }

  if (type === "multi_letter") {
    const current = Array.isArray(currentValue) ? currentValue : [];
    const expected = q.expectedCount ?? 2;

    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "repeat(5, minmax(0,1fr))";
    wrap.style.gap = "10px";
    wrap.style.width = "100%";

    const state = new Set(current.map(normalizeLetter));

    const update = () => onChange(Array.from(state).sort());

    for (const L of (q.letters ?? ["A","B","C","D","E"])) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary";
      btn.textContent = L;
      const refresh = () => {
        btn.style.borderColor = state.has(L) ? "rgba(57,217,138,.55)" : "rgba(255,255,255,.12)";
      };
      refresh();
      btn.addEventListener("click", () => {
        if (state.has(L)) {
          state.delete(L);
        } else {
          if (state.size >= expected) return; // enforce max
          state.add(L);
        }
        refresh();
        update();
        // refresh all buttons in the grid
        for (const b of wrap.querySelectorAll("button")) {
          const lab = b.textContent.trim();
          b.style.borderColor = state.has(lab) ? "rgba(57,217,138,.55)" : "rgba(255,255,255,.12)";
        }
      });
      wrap.appendChild(btn);
    }

    const note = document.createElement("div");
    note.className = "small";
    note.style.marginTop = "8px";
    note.textContent = `Select exactly ${expected}. (No penalty, but extra selections are blocked.)`;

    body.appendChild(wrap);
    container.appendChild(note);
    return;
  }

  const fallback = document.createElement("div");
  fallback.className = "notice";
  fallback.textContent = `Unsupported question type: ${type}`;
  container.appendChild(fallback);
}

export function renderNav(navEl, questions, responses, currentKey, onPick) {
  navEl.innerHTML = "";
  for (const q of questions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "qbtn";
    b.textContent = q.shortLabel;
    if (responses[q.key] != null && responses[q.key] !== "" && !(Array.isArray(responses[q.key]) && responses[q.key].length === 0)) {
      b.classList.add("ans");
    }
    if (q.key === currentKey) b.classList.add("cur");
    b.addEventListener("click", () => onPick(q.key));
    navEl.appendChild(b);
  }
}
