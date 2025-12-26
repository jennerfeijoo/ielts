import { loadJSON } from "./loader.js";
import { CountdownTimer } from "./timer.js";

const STORAGE_KEY = "ielts:writing:v1";

const el = {
  promptSelect: document.getElementById("promptSelect"),
  taskSelect: document.getElementById("taskSelect"),

  // Left viewer pane (writing.html)
  taskViewer: document.getElementById("taskViewer"),
  taskImage: document.getElementById("taskImage"),
  taskImageHint: document.getElementById("taskImageHint"),

  essay: document.getElementById("essay"),
  wordCount: document.getElementById("wordCount"),
  timer: document.getElementById("timer"),
  resetBtn: document.getElementById("resetBtn"),
  exportBtn: document.getElementById("exportBtn")
};

let sets = null;
let timer = null;
let state = { setPath: null, taskIndex: 0, essay: "" };

// Resolve assets from site root (…/ielts/) regardless of which module page is open.
const appBaseUrl = new URL("..", import.meta.url); // js/.. => site root
const resolveAsset = (p) => {
  const raw = String(p ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return new URL(raw, appBaseUrl).href;
};

function countWords(s) {
  const x = String(s ?? "").trim();
  if (!x) return 0;
  return x.split(/\s+/).filter(Boolean).length;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const st = JSON.parse(raw);
    if (st && typeof st === "object") state = { ...state, ...st };
  } catch {}
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function setImage(url, alt) {
  if (!el.taskImage) return;

  if (!url) {
    el.taskImage.style.display = "none";
    if (el.taskImageHint) el.taskImageHint.style.display = "none";
    return;
  }

  el.taskImage.alt = alt ?? "";
  el.taskImage.style.display = "block";

  el.taskImage.onerror = () => {
    el.taskImage.style.display = "none";
    if (el.taskImageHint) {
      el.taskImageHint.textContent = "Image failed to load. Check imageUrl path in the JSON and that the file exists.";
      el.taskImageHint.style.display = "block";
    }
  };

  el.taskImage.src = url;

  if (el.taskImageHint) {
    el.taskImageHint.textContent = "";
    el.taskImageHint.style.display = "none";
  }
}

async function init() {
  // Guard against layout mismatches to avoid null reference crashes
  if (!el.promptSelect || !el.taskSelect || !el.taskViewer || !el.essay) {
    document.body.innerHTML = `
      <div class="container">
        <div class="card">
          <h2>Error</h2>
          <pre>writing.html is missing required elements (promptSelect, taskSelect, taskViewer, essay).</pre>
        </div>
      </div>`;
    return;
  }

  load();

  // sets.json is referenced from /modules/writing.html -> "../data/...". Here we resolve from js via loader.
  sets = await loadJSON("../data/writing/sets.json");

  el.promptSelect.innerHTML = "";
  for (const s of (sets?.sets ?? [])) {
    const o = document.createElement("option");
    o.value = s.path;
    o.textContent = s.title ?? s.path;
    el.promptSelect.appendChild(o);
  }

  const first = sets?.sets?.[0]?.path;
  el.promptSelect.value = state.setPath ?? first ?? "";
  await loadSet(el.promptSelect.value);
}

async function loadSet(path) {
  if (!path) return;
  const setJson = await loadJSON(`../${path}`);

  state.setPath = path;
  state.taskIndex = Math.min(Number(state.taskIndex ?? 0), Math.max(0, (setJson.tasks?.length ?? 1) - 1));
  save();

  el.taskSelect.innerHTML = "";
  (setJson.tasks ?? []).forEach((t, idx) => {
    const o = document.createElement("option");
    o.value = String(idx);
    o.textContent = t.title ?? `Task ${t.taskNumber ?? t.task ?? (idx + 1)}`;
    el.taskSelect.appendChild(o);
  });
  el.taskSelect.value = String(state.taskIndex);

  renderTask(setJson);
}

function renderTask(setJson) {
  const t = setJson.tasks?.[state.taskIndex];
  if (!t) return;

  const title = t.title ?? `Task ${t.taskNumber ?? t.task ?? (state.taskIndex + 1)}`;
  const instructions = t.instructions ?? "";
  const prompt = t.prompt ?? "";
  const requirements = t.requirements ?? "";

  const html = [
    `<div class="badge">${escapeHtml(title)}</div>`,
    instructions ? `<div class="small" style="margin-top:6px">${escapeHtml(instructions)}</div>` : "",
    prompt ? `<div class="notice" style="margin-top:10px">${escapeHtml(prompt).replace(/\n/g, "<br>")}</div>` : "",
    requirements ? `<div class="small" style="margin-top:8px"><strong>${escapeHtml(requirements)}</strong></div>` : ""
  ].filter(Boolean).join("");

  el.taskViewer.innerHTML = html;

  // Image in the left pane
  const imgUrl = t.imageUrl ? resolveAsset(t.imageUrl) : "";
  setImage(imgUrl, t.imageAlt ?? "");

  // Restore essay
  el.essay.value = state.essay ?? "";
  if (el.wordCount) el.wordCount.textContent = String(countWords(el.essay.value));

  // Timer per task (optional)
  timer?.stop();
  timer = new CountdownTimer(
    Number(t.timeLimitSeconds ?? 0),
    () => { if (el.timer) el.timer.textContent = timer.format(); },
    () => { /* no auto submit */ }
  );
  if (el.timer) el.timer.textContent = timer.format();
  if ((t.timeLimitSeconds ?? 0) > 0) timer.start();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------- events ----------

el.promptSelect?.addEventListener("change", async () => {
  state.taskIndex = 0;
  state.essay = "";
  save();
  await loadSet(el.promptSelect.value);
});

el.taskSelect?.addEventListener("change", async () => {
  const setJson = await loadJSON(`../${el.promptSelect.value}`);
  state.taskIndex = Number(el.taskSelect.value);
  state.essay = "";
  save();
  renderTask(setJson);
});

el.essay?.addEventListener("input", () => {
  state.essay = el.essay.value;
  if (el.wordCount) el.wordCount.textContent = String(countWords(state.essay));
  save();
});

el.resetBtn?.addEventListener("click", () => {
  if (!confirm("Reset writing response?")) return;
  state.essay = "";
  el.essay.value = "";
  if (el.wordCount) el.wordCount.textContent = "0";
  save();
});

el.exportBtn?.addEventListener("click", () => {
  const words = countWords(state.essay);
  downloadText("ielts-writing.txt", `WORDS: ${words}\n\n${state.essay}`);
});

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div class="container"><div class="card"><h2>Error</h2><pre>${String(err?.stack ?? err?.message ?? err)}</pre></div></div>`;
});
