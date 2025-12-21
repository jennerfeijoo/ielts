import { loadJSON, blobURLFromFile } from "./loader.js";
import { ExamEngine } from "./engine.js";
import { CountdownTimer } from "./timer.js";
import { renderQuestion, renderNav } from "./ui.js";
import { gradeModule, estimateBand } from "./grader.js";

export async function bootModule({ moduleName, manifestPath }) {
  const el = {
    testSelect: document.getElementById("testSelect"),
    sectionSelect: document.getElementById("sectionSelect"),
    qnav: document.getElementById("qnav"),
    question: document.getElementById("question"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    flagBtn: document.getElementById("flagBtn"),
    resetBtn: document.getElementById("resetBtn"),
    submitBtn: document.getElementById("submitBtn"),
    timer: document.getElementById("timer"),
    status: document.getElementById("status"),
    results: document.getElementById("results"),
    materialFile: document.getElementById("materialFile") ?? document.getElementById("pdfFile"),
    materialFrame: document.getElementById("materialFrame") ?? document.getElementById("pdfFrame"),
    audioFile: document.getElementById("audioFile"),
    audio: document.getElementById("audio"),
    notesArea: document.getElementById("notesArea")
  };
  const setStatus = (msg) => { statusBase = msg ?? ""; refreshStatus(); };
  const setStatusExtra = (msg) => { statusExtra = msg ?? ""; refreshStatus(); };

  if (!el.testSelect || !el.sectionSelect || !el.qnav || !el.question) {
    console.error("Required layout elements not found; aborting boot.");
    setStatus("Unable to start: missing layout elements.");
    return;
  }

  const manifestUrl = new URL(manifestPath, import.meta.url);
  const manifestBaseUrl = new URL(".", manifestUrl);
  setStatus("Loading manifest...");
  let manifest = null;
  try {
    manifest = await loadJSON(manifestUrl);
  } catch (err) {
    console.error(`Failed to load manifest from ${manifestUrl.href}`, err);
    setStatus(`Error loading manifest: ${err.message}`);
    throw err;
  }

  const tests = (manifest[moduleName] ?? []);
  if (!tests.length) {
    const err = new Error(`No tests found for module: ${moduleName}`);
    setStatus(err.message);
    throw err;
  }

  const setStatus = (msg) => { if (el.status) el.status.textContent = msg; };

  if (!el.testSelect || !el.sectionSelect || !el.qnav || !el.question) {
    console.error("Required layout elements not found; aborting boot.");
    setStatus("Unable to start: missing layout elements.");
    return;
  }

  const manifestUrl = new URL(manifestPath, import.meta.url);
  const manifestBaseUrl = new URL("..", manifestUrl);
  setStatus("Loading manifest...");
  let manifest = null;
  try {
    manifest = await loadJSON(manifestUrl);
  } catch (err) {
    console.error(`Failed to load manifest from ${manifestUrl.href}`, err);
    setStatus(`Error loading manifest: ${err.message}`);
    throw err;
  }

  const tests = (manifest[moduleName] ?? []);
  if (!tests.length) {
    const err = new Error(`No tests found for module: ${moduleName}`);
    setStatus(err.message);
    throw err;
  }

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
  let flags = new Set();
  let flagsKey = null;
  let currentAudioUrl = null;

  const resolveAssetPath = (p) => {
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) return p;
    return new URL(p, manifestBaseUrl).href;
  };

  const loadFlags = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    } catch { /* ignore */ }
    return new Set();
  };

  const saveFlags = () => {
    if (!flagsKey) return;
    try { localStorage.setItem(flagsKey, JSON.stringify(Array.from(flags))); } catch { /* ignore */ }
  };

  const updateFlagBtn = () => {
    if (!el.flagBtn || !engine) return;
    const curKey = engine.getCurrent()?.key;
    const isFlagged = curKey ? flags.has(curKey) : false;
    el.flagBtn.textContent = isFlagged ? "Unflag" : "Flag for review";
    el.flagBtn.classList.toggle("danger", isFlagged);
  };

  const updateTimerBadge = (remaining) => {
    if (!el.timer) return;
    if (remaining <= 300) el.timer.classList.add("danger");
    else el.timer.classList.remove("danger");
  };

  const syncSectionResources = () => {
    const section = currentTest.sections?.[engine.sectionIndex];

    if (el.materialFrame) {
      const target = resolveAssetPath(section?.materialHtml ?? currentTest.assets?.materialHtml ?? null);
      if (target) {
        if (el.materialFrame.getAttribute("src") !== target) el.materialFrame.src = target;
      } else {
        el.materialFrame.removeAttribute("src");
      }
    }

    if (el.audio) {
      const audioPathRaw =
        section?.audio
        ?? section?.audioFiles?.[engine.sectionIndex]
        ?? currentTest.assets?.audio
        ?? currentTest.assets?.audioFiles?.[engine.sectionIndex]
        ?? null;
      const audioPath = resolveAssetPath(audioPathRaw);
      currentAudioUrl = audioPath ?? null;
      if (audioPath) {
        if (el.audio.getAttribute("src") !== audioPath) {
          el.audio.src = audioPath;
          el.audio.preload = "auto";
          el.audio.load();
        }
        setStatusExtra("");
        if (el.audioLink) {
          el.audioLink.href = audioPath;
          el.audioLink.textContent = "Open audio URL";
          if (el.audioLinkWrap) el.audioLinkWrap.style.display = "block";
        }
      } else {
        el.audio.removeAttribute("src");
        setStatusExtra("");
        if (el.audioLinkWrap) el.audioLinkWrap.style.display = "none";
      }
    }
  };

  const loadTest = async (path) => {
    setStatus("Loading test...");
    const testUrl = new URL(path, manifestBaseUrl);
    try {
      currentTest = await loadJSON(testUrl);
    } catch (err) {
      console.error(`Failed to load test from ${testUrl.href}`, err);
      setStatus(`Error loading test: ${err.message}`);
      throw err;
    }

    const storageKey = `ielts:${moduleName}:${currentTest.id ?? path}`;
    flagsKey = `${storageKey}:flags`;
    engine = new ExamEngine(currentTest, storageKey);
    engine.markStarted();
    flags = loadFlags(flagsKey);

    timer?.stop();
    timer = new CountdownTimer(currentTest.timeLimitSeconds ?? 0,
      (remaining) => { if (el.timer) el.timer.textContent = timer.format(); updateTimerBadge(remaining); },
      () => { engine.submit(); renderResults(true); }
    );
    if (el.timer) {
      el.timer.textContent = timer.format();
      updateTimerBadge(timer.remaining ?? 0);
    }
    if ((currentTest.timeLimitSeconds ?? 0) > 0) timer.start();

    if (el.sectionSelect) {
      el.sectionSelect.innerHTML = "";
      (currentTest.sections ?? []).forEach((s, idx) => {
        const o = document.createElement("option");
        o.value = String(idx);
        o.textContent = s.title ?? `Section ${idx+1}`;
        el.sectionSelect.appendChild(o);
      });
      el.sectionSelect.value = String(engine.sectionIndex);
    }

    renderAll();
    if (el.results) el.results.textContent = "Submit to see results.";
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

    const navQs = getNavQuestions();
    renderNav(el.qnav, navQs, engine.responses, cur.key, (k) => {
      const idx = engine.questionFlat.findIndex(q => q.key === k);
      if (idx >= 0) { engine.goToIndex(idx); renderAll(); }
    }, flags);

    renderQuestion(el.question, cur, engine, { onAnswerChange: renderAllNavOnly });

    if (el.sectionSelect) el.sectionSelect.value = String(engine.sectionIndex);
    setStatus(`${moduleName.toUpperCase()} • ${currentTest.title ?? ""} • ${cur.label}`);
    updateFlagBtn();
  };

  const renderAllNavOnly = () => {
    const cur = engine.getCurrent();
    const navQs = getNavQuestions();
    renderNav(el.qnav, navQs, engine.responses, cur.key, (k) => {
      const idx = engine.questionFlat.findIndex(q => q.key === k);
      if (idx >= 0) { engine.goToIndex(idx); renderAll(); }
    }, flags);
    updateFlagBtn();
  };

  const renderResults = (auto=false) => {
    if (!currentTest.answerKey) {
      if (el.results) el.results.textContent = "This module is not auto-scored.";
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

    if (el.results) el.results.innerHTML = lines.join("");
  };

  el.testSelect?.addEventListener("change", async () => {
    await loadTest(el.testSelect.value);
  });

  el.sectionSelect?.addEventListener("change", () => {
    engine.sectionIndex = Number(el.sectionSelect.value);
    const secId = currentTest.sections?.[engine.sectionIndex]?.id;
    const firstIdx = engine.questionFlat.findIndex(q => q.sectionId === secId);
    engine.goToIndex(firstIdx < 0 ? 0 : firstIdx);

    renderAll();
  });

  el.prevBtn?.addEventListener("click", () => { engine.prev(); renderAll(); });
  el.nextBtn?.addEventListener("click", () => { engine.next(); renderAll(); });
  el.flagBtn?.addEventListener("click", () => {
    const curKey = engine.getCurrent()?.key;
    if (!curKey) return;
    if (flags.has(curKey)) flags.delete(curKey);
    else flags.add(curKey);
    saveFlags();
    renderAllNavOnly();
  });

  el.resetBtn?.addEventListener("click", () => {
    if (!confirm("Reset all answers for this module and test?")) return;
    engine.resetAll();
    flags.clear();
    saveFlags();
    renderAll();
    if (el.results) el.results.textContent = "Submit to see results.";
  });

  el.submitBtn?.addEventListener("click", () => {
    engine.submit();
    renderResults(false);
  });

  el.materialFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file || !el.materialFrame) return;
    el.materialFrame.src = blobURLFromFile(file);
  });

  if (el.notesArea && typeof queueSaveNotes === "function") {
    el.notesArea.addEventListener("input", queueSaveNotes);
  }

  el.audioFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file || !el.audio) return;
    el.audio.src = blobURLFromFile(file);
  });

  if (el.audio) {
    el.audio.preload = "auto";
    el.audio.addEventListener("loadedmetadata", () => {
      setStatusExtra(currentAudioUrl ? `Audio loaded: ${currentAudioUrl}` : "Audio loaded");
    });
    el.audio.addEventListener("canplay", () => {
      setStatusExtra(currentAudioUrl ? `Audio ready: ${currentAudioUrl}` : "Audio ready");
    });
    el.audio.addEventListener("error", () => {
      const code = el.audio?.error?.code ?? "unknown";
      const msg = `Audio error (code ${code})${currentAudioUrl ? ` at ${currentAudioUrl}` : ""}`;
      console.error(msg, el.audio?.error);
      setStatusExtra(msg);
    });
  }

  await loadTest(tests[0].path);
}
