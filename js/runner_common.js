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
    materialFile: document.getElementById("materialFile") ?? document.getElementById("pdfFile"),
    materialFrame: document.getElementById("materialFrame") ?? document.getElementById("pdfFrame"),
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

  const resolveAssetPath = (p) => {
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) return p;
    return `../${p}`;
  };

  const syncSectionResources = () => {
    const section = currentTest.sections?.[engine.sectionIndex];

    // Section material (HTML/text)
    if (el.materialFrame) {
      const target = resolveAssetPath(section?.materialHtml ?? currentTest.assets?.materialHtml ?? null);
      if (target) {
        if (el.materialFrame.getAttribute("src") !== target) el.materialFrame.src = target;
      } else {
        el.materialFrame.removeAttribute("src");
      }
    }

    // Audio (if provided)
    if (el.audio) {
      const audioPath = resolveAssetPath(section?.audio ?? currentTest.assets?.audio ?? null);
      if (audioPath) {
        if (el.audio.getAttribute("src") !== audioPath) el.audio.src = audioPath;
      } else {
        el.audio.removeAttribute("src");
      }
    }
  };

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
    syncSectionResources();

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

  // Local material load (HTML/text)
  el.materialFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file || !el.materialFrame) return;
    el.materialFrame.src = blobURLFromFile(file);
  });

  // Local audio load
  el.audioFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file || !el.audio) return;
    el.audio.src = blobURLFromFile(file);
  });

  await loadTest(tests[0].path);
}
