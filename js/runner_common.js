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
    audioLinkWrap: document.getElementById("audioLinkWrap"),
    audioLink: document.getElementById("audioLink"),
    notesArea: document.getElementById("notesArea")
  };

  // Status helpers (base + extra) used across the module runner
  let statusBase = "";
  let statusExtra = "";
  const refreshStatus = () => {
    if (!el.status) return;
    const parts = [statusBase, statusExtra].filter(Boolean);
    el.status.textContent = parts.join(" • ");
  };
  const setStatus = (msg) => { statusBase = msg ?? ""; refreshStatus(); };
  const setStatusExtra = (msg) => { statusExtra = msg ?? ""; refreshStatus(); };

  if (!el.testSelect || !el.sectionSelect || !el.qnav || !el.question) {
    console.error("Required layout elements not found; aborting boot.");
    setStatus("Unable to start: missing layout elements.");
    return;
  }

  const manifestUrl = new URL(manifestPath, import.meta.url);
  // IMPORTANT: base should be repo root (../ from /data/manifest.json)
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
  let audioPlayed = new Set();

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
    } catch {}
    return new Set();
  };

  const saveFlags = () => {
    if (!flagsKey) return;
    try { localStorage.setItem(flagsKey, JSON.stringify(Array.from(flags))); } catch {}
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

  const applySectionSelection = () => {
    const cur = engine.getCurrent();
    if (!cur) return;
    const currentSectionId = cur.sectionId;
    if (el.sectionSelect && el.sectionSelect.value !== currentSectionId) {
      el.sectionSelect.value = currentSectionId ?? "";
    }
  };

  const syncSectionResources = () => {
    const cur = engine.getCurrent();
    if (!cur) return;
    const sectionId = cur.sectionId;
    const section = currentTest.sections?.find(s => s.id === sectionId);

    if (el.materialFrame) {
      const htmlPath = section?.materialHtml ?? currentTest.assets?.materialHtml ?? null;
      const target = resolveAsset(htmlPath);
      if (target) {
        if (el.materialFrame.getAttribute("src") !== target) el.materialFrame.src = target;
      } else {
        el.materialFrame.removeAttribute("src");
      }
    }

    if (el.audio) {
      const audioPathRaw =
        section?.audio
        ?? section?.audioFile
        ?? section?.audioFiles?.[engine.sectionIndex]
        ?? currentTest.assets?.audio
        ?? currentTest.assets?.audioFile
        ?? currentTest.assets?.audioFiles?.[engine.sectionIndex]
        ?? null;

      const audioPath = resolveAssetPath(audioPathRaw);
      currentAudioUrl = audioPath ?? null;

      if (audioPath) {
        if (el.audio.getAttribute("src") !== audioPath) el.audio.src = audioPath;

        if (el.audioLink) {
          el.audioLink.href = audioPath;
          el.audioLink.textContent = "Open audio URL";
          if (el.audioLinkWrap) el.audioLinkWrap.style.display = "block";
        }
        setStatusExtra("Audio ready");
      } else {
        el.audio.removeAttribute("src");
        if (el.audioLinkWrap) el.audioLinkWrap.style.display = "none";
        setStatusExtra("");
      }
    }
  };

  const render = () => {
    const q = engine.getCurrent();
    if (!q) return;

    renderNav(el.qnav, engine.questionFlat, engine.qIndex, {
      isAnswered: (key) => engine.responses[key] != null && `${engine.responses[key]}`.trim() !== "",
      isFlagged: (key) => flags.has(key),
      onJump: (idx) => { engine.goTo(idx); render(); }
    });

    renderQuestion(el.question, q, {
      getResponse: (key) => engine.responses[key],
      setResponse: (key, value) => { engine.setResponse(key, value); renderNav(el.qnav, engine.questionFlat, engine.qIndex, {
        isAnswered: (k) => engine.responses[k] != null && `${engine.responses[k]}`.trim() !== "",
        isFlagged: (k) => flags.has(k),
        onJump: (idx) => { engine.goTo(idx); render(); }
      }); },
    });

    if (el.sectionSelect) {
      const sec = currentTest.sections?.[engine.sectionIndex];
      if (sec) el.sectionSelect.value = `${engine.sectionIndex}`;
    }

    if (el.prevBtn) el.prevBtn.disabled = engine.qIndex <= 0;
    if (el.nextBtn) el.nextBtn.disabled = engine.qIndex >= engine.questionFlat.length - 1;

    updateFlagBtn();
    syncSectionResources();
    setStatus(`Section ${engine.sectionIndex + 1} • Q ${engine.qIndex + 1}/${engine.questionFlat.length}`);
  };

  const renderResults = (autoSubmitted = false) => {
    if (!el.results) return;
    const g = gradeModule(currentTest, engine.responses);
    const band = estimateBand(moduleName, g.correct, g.total);

    const flaggedCount = flags.size;
    const answeredCount = Object.values(engine.responses).filter(v => `${v ?? ""}`.trim() !== "").length;

    el.results.innerHTML = `
      <div class="kpi">
        <div class="item"><div class="v">${g.correct}/${g.total}</div><div class="k">Correct</div></div>
        <div class="item"><div class="v">${band}</div><div class="k">Estimated band</div></div>
        <div class="item"><div class="v">${answeredCount}</div><div class="k">Answered</div></div>
        <div class="item"><div class="v">${flaggedCount}</div><div class="k">Flagged</div></div>
        <div class="item"><div class="v">${autoSubmitted ? "Yes" : "No"}</div><div class="k">Auto submitted</div></div>
      </div>
    `;
  };

  const loadTest = async (path) => {
    setStatus("Loading test...");
    setStatusExtra("");

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
    audioPlayed = new Set();

    timer?.stop();
    timer = new CountdownTimer(
      currentTest.timeLimitSeconds ?? 0,
      (remaining) => { if (el.timer) el.timer.textContent = timer.format(); updateTimerBadge(remaining); },
      () => { engine.submit(); renderResults(true); }
    );

    if (el.timer) {
      el.timer.textContent = timer.format();
      updateTimerBadge(timer.remaining ?? 0);
    }

    // Sections
    el.sectionSelect.innerHTML = "";
    (currentTest.sections ?? []).forEach((s, idx) => {
      const o = document.createElement("option");
      o.value = `${idx}`;
      o.textContent = s.title ?? `Section ${idx + 1}`;
      el.sectionSelect.appendChild(o);
    });

    render();
  };

  el.testSelect?.addEventListener("change", async () => {
    await loadTest(el.testSelect.value);
  });

  el.sectionSelect.addEventListener("change", () => {
    if (!engine) return;
    const idx = Number(el.sectionSelect.value);
    if (!Number.isFinite(idx)) return;
    engine.goToSection(idx);
    render();
  });

  el.prevBtn?.addEventListener("click", () => { engine?.prev(); render(); });
  el.nextBtn?.addEventListener("click", () => { engine?.next(); render(); });

  el.flagBtn?.addEventListener("click", () => {
    if (!engine) return;
    const key = engine.getCurrent()?.key;
    if (!key) return;
    if (flags.has(key)) flags.delete(key);
    else flags.add(key);
    saveFlags();
    updateFlagBtn();
    renderNav(el.qnav, engine.questionFlat, engine.qIndex, {
      isAnswered: (k) => engine.responses[k] != null && `${engine.responses[k]}`.trim() !== "",
      isFlagged: (k) => flags.has(k),
      onJump: (idx) => { engine.goTo(idx); render(); }
    });
  });

  el.resetBtn?.addEventListener("click", () => {
    if (!engine) return;
    if (!confirm("Reset this test? (clears answers in this browser)")) return;
    engine.reset();
    flags.clear();
    saveFlags();
    render();
    if (el.results) el.results.textContent = "Submit to see results.";
  });

  el.submitBtn?.addEventListener("click", () => {
    if (!engine) return;
    engine.submit();
    renderResults(false);
  });

  el.materialFile?.addEventListener("change", (e) => {
    const f = e.target?.files?.[0];
    if (!f) return;
    const url = blobURLFromFile(f);
    if (el.materialFrame) el.materialFrame.src = url;
  });

  el.audioFile?.addEventListener("change", (e) => {
    const f = e.target?.files?.[0];
    if (!f) return;
    const url = blobURLFromFile(f);
    if (el.audio) el.audio.src = url;
    setStatusExtra("Local audio loaded");
  });

  el.audio?.addEventListener("play", () => {
    if (!engine) return;
    const sec = currentTest?.sections?.[engine.sectionIndex];
    const sid = sec?.id ?? `${engine.sectionIndex}`;
    audioPlayed.add(sid);
  });

  // Initial load
  await loadTest(el.testSelect.value);
}
