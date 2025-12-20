import { loadJSON, blobURLFromFile } from "./loader.js";
import { CountdownTimer } from "./timer.js";

const el = {
  setSelect: document.getElementById("setSelect"),
  p1: document.getElementById("p1"),
  p2: document.getElementById("p2"),
  p3: document.getElementById("p3"),
  p1Btn: document.getElementById("p1Btn"),
  p3Btn: document.getElementById("p3Btn"),
  cueTimer: document.getElementById("cueTimer"),
  startCue: document.getElementById("startCue"),
  resetCue: document.getElementById("resetCue"),
  resetBtn: document.getElementById("resetBtn"),
  recStart: document.getElementById("recStart"),
  recStop: document.getElementById("recStop"),
  recDownload: document.getElementById("recDownload"),
  recStatus: document.getElementById("recStatus"),
  pdfFile: document.getElementById("pdfFile"),
  pdfFrame: document.getElementById("pdfFrame")
};

let sets = null;
let current = null;
let cue = null;

function pickN(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

async function loadSet(path) {
  current = await loadJSON(`../${path}`);
  renderAll();
}

function renderAll() {
  el.p1.innerHTML = "<ul>" + pickN(current.part1Questions ?? [], 6).map(q => `<li>${q}</li>`).join("") + "</ul>";
  el.p2.innerHTML = `<div class="notice"><strong>${current.part2?.cue ?? "Cue card"}</strong><ul>${(current.part2?.points ?? []).map(p => `<li>${p}</li>`).join("")}</ul></div>`;
  el.p3.innerHTML = "<ul>" + pickN(current.part3Questions ?? [], 6).map(q => `<li>${q}</li>`).join("") + "</ul>";

  cue?.stop();
  cue = new CountdownTimer(60, () => { el.cueTimer.textContent = cue.format(); }, () => {});
  el.cueTimer.textContent = cue.format();
}

el.p1Btn.addEventListener("click", () => renderAll());
el.p3Btn.addEventListener("click", () => renderAll());

el.startCue.addEventListener("click", () => { cue?.stop(); cue = new CountdownTimer(60, () => { el.cueTimer.textContent = cue.format(); }, () => {}); cue.start(); });
el.resetCue.addEventListener("click", () => { cue?.stop(); cue = new CountdownTimer(60, () => { el.cueTimer.textContent = cue.format(); }, () => {}); el.cueTimer.textContent = cue.format(); });

el.resetBtn.addEventListener("click", () => {
  if (!confirm("Reset Speaking set display?")) return;
  renderAll();
});

// Recording
let mediaRecorder = null;
let chunks = [];

async function startRec() {
  if (!navigator.mediaDevices?.getUserMedia) {
    el.recStatus.textContent = "Recording not supported in this browser.";
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  chunks = [];

  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    el.recDownload.href = url;
    el.recDownload.style.display = "inline-flex";
    el.recStatus.textContent = "Recording ready for download.";
    // stop tracks
    stream.getTracks().forEach(t => t.stop());
  };

  mediaRecorder.start();
  el.recStatus.textContent = "Recording...";
  el.recDownload.style.display = "none";
}

function stopRec() {
  if (!mediaRecorder) return;
  mediaRecorder.stop();
}

el.recStart.addEventListener("click", () => startRec().catch(err => { el.recStatus.textContent = err.message; }));
el.recStop.addEventListener("click", () => stopRec());

// PDF local load
el.pdfFile?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  el.pdfFrame.src = blobURLFromFile(file);
});

async function init() {
  sets = await loadJSON("../data/speaking/sets.json");
  el.setSelect.innerHTML = "";
  for (const s of sets.sets) {
    const o = document.createElement("option");
    o.value = s.path;
    o.textContent = s.title ?? s.path;
    el.setSelect.appendChild(o);
  }
  await loadSet(sets.sets[0].path);

  el.setSelect.addEventListener("change", async () => {
    await loadSet(el.setSelect.value);
  });
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div class="container"><div class="card"><h2>Error</h2><pre>${err.message}</pre></div></div>`;
});
