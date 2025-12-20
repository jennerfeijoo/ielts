import { loadJSON, blobURLFromFile } from "./loader.js";
import { CountdownTimer } from "./timer.js";

const STORAGE_KEY = "ielts:writing:v1";

const el = {
  promptSelect: document.getElementById("promptSelect"),
  taskSelect: document.getElementById("taskSelect"),
  promptBox: document.getElementById("promptBox"),
  essay: document.getElementById("essay"),
  wordCount: document.getElementById("wordCount"),
  timer: document.getElementById("timer"),
  resetBtn: document.getElementById("resetBtn"),
  exportBtn: document.getElementById("exportBtn"),
  pdfFile: document.getElementById("pdfFile"),
  pdfFrame: document.getElementById("pdfFrame")
};

let sets = null;
let timer = null;
let state = { setPath: null, taskIndex: 0, essay: "" };

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
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function init() {
  load();
  sets = await loadJSON("../data/writing/sets.json");

  el.promptSelect.innerHTML = "";
  for (const s of sets.sets) {
    const o = document.createElement("option");
    o.value = s.path;
    o.textContent = s.title ?? s.path;
    el.promptSelect.appendChild(o);
  }

  el.promptSelect.value = state.setPath ?? sets.sets[0].path;
  await loadSet(el.promptSelect.value);
}

async function loadSet(path) {
  const setJson = await loadJSON(`../${path}`);
  state.setPath = path;
  state.taskIndex = Math.min(state.taskIndex ?? 0, (setJson.tasks.length - 1));
  save();

  el.taskSelect.innerHTML = "";
  setJson.tasks.forEach((t, idx) => {
    const o = document.createElement("option");
    o.value = String(idx);
    o.textContent = t.title ?? `Task ${t.task ?? (idx+1)}`;
    el.taskSelect.appendChild(o);
  });
  el.taskSelect.value = String(state.taskIndex);

  renderTask(setJson);
}

function renderTask(setJson) {
  const t = setJson.tasks[state.taskIndex];
  el.promptBox.innerHTML = `<strong>${t.title ?? `Task ${t.task ?? (state.taskIndex+1)}`}</strong><br><span class="small">${t.promptNote ?? "Use your PDF prompt."}</span>`;
  el.essay.value = state.essay ?? "";
  el.wordCount.textContent = String(countWords(el.essay.value));

  timer?.stop();
  timer = new CountdownTimer(t.timeLimitSeconds ?? 0,
    () => { el.timer.textContent = timer.format(); },
    () => { /* time over: no auto submit */ }
  );
  el.timer.textContent = timer.format();
  if ((t.timeLimitSeconds ?? 0) > 0) timer.start();
}

el.promptSelect.addEventListener("change", async () => {
  state.taskIndex = 0;
  state.essay = "";
  save();
  await loadSet(el.promptSelect.value);
});

el.taskSelect.addEventListener("change", async () => {
  const setJson = await loadJSON(`../${el.promptSelect.value}`);
  state.taskIndex = Number(el.taskSelect.value);
  state.essay = "";
  save();
  renderTask(setJson);
});

el.essay.addEventListener("input", async () => {
  state.essay = el.essay.value;
  el.wordCount.textContent = String(countWords(state.essay));
  save();
});

el.resetBtn.addEventListener("click", () => {
  if (!confirm("Reset writing response?")) return;
  state.essay = "";
  el.essay.value = "";
  el.wordCount.textContent = "0";
  save();
});

el.exportBtn.addEventListener("click", () => {
  const words = countWords(state.essay);
  downloadText("ielts-writing.txt", `WORDS: ${words}\n\n${state.essay}`);
});

el.pdfFile?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  el.pdfFrame.src = blobURLFromFile(file);
});

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div class="container"><div class="card"><h2>Error</h2><pre>${err.message}</pre></div></div>`;
});
