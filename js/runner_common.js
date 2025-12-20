import { loadJSON, blobURLFromFile } from "./loader.js";
import { ExamEngine } from "./engine.js";
import { CountdownTimer } from "./timer.js";
import { renderQuestion, renderNav } from "./ui.js";
import { gradeModule, estimateBand } from "./grader.js";

export async function bootModule({ moduleName, manifestPath }) {
  const manifest = await loadJSON(manifestPath);
  const tests = (manifest[moduleName] ?? []);
  if (!tests.length) throw new Error(`No tests found for module: ${moduleName}`);

  const el = {
    testSelect: document.getElementById("testSelect"),
    sectionSelect: document.getElementById("sectionSelect"),
    qnav: document.getElementById("qnav"),
    question: document.getElementById("question"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    resetBtn: document.getElementById("resetBtn"),
    submitBtn: document.getElementById("submitBtn"),
    timer: document.getElementById("timer"),
    status: document.getElementById("status"),
    results: document.getElementById("results"),
    pdfFile: document.getElementById("pdfFile"),
    pdfFrame: document.getElementById("pdfFrame"),
    audioFile: document.getElementById("audioFile"),
    audio: document.getElementById("audio")
  };

  // Populate test select
  el.testSelect.innerHTML = "";
  for (const t of tests) {
    const o = document.createElement("option");
    o.value = t.path;
    o.textContent = t.title ?? t.id ?? t.path;
    el.testSelect.appendChild(o);
  }

  let engine = null;
  let timer = null;
  let currentTest = null;

  const loadTest = async (path) => {
    currentTest = await loadJSON(`../${path}`);
    const storageKey = `ielts:${moduleName}:${currentTest.id ?? path}`;
    engine = new ExamEngine(currentTest, storageKey);
    engine.markStarted();

    // Timer
    timer?.stop();
    timer = new CountdownTimer(currentTest.timeLimitSeconds ?? 0,
      () => { el.timer.textContent = timer.format(); },
      () => { engine.submit(); renderResults(true); }
    );
    el.timer.textContent = timer.format();
    if ((currentTest.timeLimitSeconds ?? 0) > 0) timer.start();

    // Sections selector
    el.sectionSelect.innerHTML = "";
    (currentTest.sections ?? []).forEach((s, idx) => {
      const o = document.createElement("option");
      o.value = String(idx);
      o.textContent = s.title ?? `Section ${idx+1}`;
      el.sectionSelect.appendChild(o);
    });
    el.sectionSelect.value = String(engine.sectionIndex);

    // Auto-load PDF/audio if configured
    const pdf = currentTest.assets?.pdf;
    if (pdf) el.pdfFrame.src = `../${pdf}`;
    else el.pdfFrame.removeAttribute("src");

    const audio = currentTest.sections?.[engine.sectionIndex]?.audio;
    if (audio && el.audio) el.audio.src = `../${audio}`;
    else if (el.audio) el.audio.removeAttribute("src");

    renderAll();
    el.results.textContent = "Submit to see results.";
  };

  const getNavQuestions = () => {
    const secId = currentTest.sections?.[engine.sectionIndex]?.id;
    return engine.questionFlat
      .filter(q => q.sectionId === secId)
      .map(q => ({
        key: q.key,
        shortLabel: q.shortLabel,
        label: q.label,
        hint: q.hint,
        type: q.type,
        letters: q.letters,
        expectedCount: q.expectedCount,
        prompt: q.prompt
      }));
  };

  const renderAll = () => {
    // Ensure engine.qIndex corresponds to current section; if not, jump to first q of section
    const secId = currentTest.sections?.[engine.sectionIndex]?.id;
    const secQs = engine.questionFlat.filter(q => q.sectionId === secId);
    if (secQs.length) {
      const cur = engine.getCurrent();
      if (cur.sectionId !== secId) {
        const firstIdx = engine.questionFlat.findIndex(q => q.sectionId === secId);
        engine.goToIndex(firstIdx);
      }
    }

    const cur = engine.getCurrent();
    const val = engine.getResponse(cur.key);

    // Navigation buttons for section
    const navQs = getNavQuestions();
    renderNav(el.qnav, navQs, engine.responses, cur.key, (k) => {
      const idx = engine.questionFlat.findIndex(q => q.key === k);
      if (idx >= 0) { engine.goToIndex(idx); renderAll(); }
    });

    renderQuestion(cur, el.question, val, (newVal) => {
      engine.setResponse(cur.key, newVal);
      renderAllNavOnly();
    });

    el.sectionSelect.value = String(engine.sectionIndex);
    el.status.textContent = `${moduleName.toUpperCase()} • ${currentTest.title ?? ""} • ${cur.label}`;

    // Keep audio in sync with section
    const audio = currentTest.sections?.[engine.sectionIndex]?.audio;
    if (audio && el.audio) el.audio.src = el.audio.src.includes(audio) ? el.audio.src : `../${audio}`;
  };

  const renderAllNavOnly = () => {
    const cur = engine.getCurrent();
    const navQs = getNavQuestions();
    renderNav(el.qnav, navQs, engine.responses, cur.key, (k) => {
      const idx = engine.questionFlat.findIndex(q => q.key === k);
      if (idx >= 0) { engine.goToIndex(idx); renderAll(); }
    });
  };

  const renderResults = (auto=false) => {
    if (!currentTest.answerKey) {
      el.results.textContent = "This module is not auto-scored.";
      return;
    }
    const g = gradeModule(currentTest, engine.responses);
    const band = estimateBand(moduleName, g.raw);

    const lines = [];
    lines.push(`<div class="kpi">
      <div class="item"><div class="v">${g.raw}/${g.max}</div><div class="k">Raw score</div></div>
      <div class="item"><div class="v">${band}</div><div class="k">Estimated band</div></div>
      <div class="item"><div class="v">${auto ? "AUTO" : "MANUAL"}</div><div class="k">Submit mode</div></div>
    </div>`);
    lines.push("<hr />");
    lines.push("<div class='small'>Per-question feedback (green = correct, red = incorrect):</div>");
    lines.push("<div class='qnav' style='margin-top:10px'>");

    for (const d of g.details) {
      const ok = d.gained === d.max;
      lines.push(`<div class="qbtn ${ok ? "ans" : "bad"}" style="cursor:default">
        <div style="font-size:12px">${d.key}</div>
        <div style="font-size:12px">${ok ? "✓" : "✗"}</div>
      </div>`);
    }
    lines.push("</div>");

    el.results.innerHTML = lines.join("");
  };

  // Events
  el.testSelect.addEventListener("change", async () => {
    await loadTest(el.testSelect.value);
  });

  el.sectionSelect.addEventListener("change", () => {
    engine.sectionIndex = Number(el.sectionSelect.value);
    const secId = currentTest.sections?.[engine.sectionIndex]?.id;
    const firstIdx = engine.questionFlat.findIndex(q => q.sectionId === secId);
    engine.goToIndex(firstIdx < 0 ? 0 : firstIdx);

    // Load section audio if any
    const audio = currentTest.sections?.[engine.sectionIndex]?.audio;
    if (audio && el.audio) el.audio.src = `../${audio}`;
    renderAll();
  });

  el.prevBtn.addEventListener("click", () => { engine.prev(); renderAll(); });
  el.nextBtn.addEventListener("click", () => { engine.next(); renderAll(); });

  el.resetBtn.addEventListener("click", () => {
    if (!confirm("Reset all answers for this module and test?")) return;
    engine.resetAll();
    renderAll();
    el.results.textContent = "Submit to see results.";
  });

  el.submitBtn.addEventListener("click", () => {
    engine.submit();
    renderResults(false);
  });

  // Local PDF load
  el.pdfFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    el.pdfFrame.src = blobURLFromFile(file);
  });

  // Local audio load
  el.audioFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file || !el.audio) return;
    el.audio.src = blobURLFromFile(file);
  });

  await loadTest(tests[0].path);
}
