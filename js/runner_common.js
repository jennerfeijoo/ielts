// js/runner_common.js
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

    // Reading: iframe
    materialFrame: document.getElementById("materialFrame") ?? document.getElementById("pdfFrame"),

    // Listening: audio
    audioFile: document.getElementById("audioFile"),
    audio: document.getElementById("audio"),
    audioLinkWrap: document.getElementById("audioLinkWrap"),
    audioLink: document.getElementById("audioLink"),
  };

  const setStatus = (msg) => {
    if (el.status) el.status.textContent = msg ?? "";
  };

  if (!el.testSelect || !el.sectionSelect || !el.qnav || !el.question) {
    setStatus("Unable to start: missing required layout elements.");
    return;
  }

  // manifestPath is relative to runner_common.js (js/)
  const manifestUrl = new URL(manifestPath, import.meta.url);
  const appBaseUrl = new URL("..", manifestUrl); // site root (…/ielts/)
  setStatus("Loading manifest...");

  const manifest = await loadJSON(manifestUrl);
  const tests = manifest?.[moduleName] ?? [];
  if (!tests.length) {
    setStatus(`No tests found for module: ${moduleName}`);
    return;
  }

  // ---------- helpers ----------
  const resolveAsset = (p) => {
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) return p;
    return new URL(p, appBaseUrl).href;
  };

  const normalizeAudioPath = (raw) => {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    // If it's just "file.mp3" (no folder), assume assets/audio/
    if (!raw.includes("/")) return `assets/audio/${raw}`;
    return raw;
  };

  // ---------- state ----------
  let currentTest = null;
  let engine = null;
  let timer = null;

  let flags = new Set();
  let flagsKey = "";

  const loadFlags = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch {
      return new Set();
    }
  };

  const saveFlags = () => {
    if (!flagsKey) return;
    try { localStorage.setItem(flagsKey, JSON.stringify(Array.from(flags))); } catch {}
  };

  const updateFlagBtn = () => {
    if (!el.flagBtn || !engine) return;
    const k = engine.getCurrent()?.key;
    const on = k ? flags.has(k) : false;
    el.flagBtn.textContent = on ? "Unflag" : "Flag for review";
    el.flagBtn.classList.toggle("danger", on);
  };

  const getCurrentSectionId = () => engine?.getCurrent()?.sectionId ?? null;

  const getSectionById = (secId) => (currentTest?.sections ?? []).find(s => s.id === secId) ?? null;

  const getAnswerValue = (key) => {
    if (!engine || !key) return "";
    if (typeof engine.getAnswer === "function") return engine.getAnswer(key) ?? "";
    if (typeof engine.getResponse === "function") return engine.getResponse(key) ?? "";
    return engine.responses?.[key] ?? "";
  };

  const setAnswerValue = (key, value) => {
    if (!engine || !key) return;
    if (typeof engine.setAnswer === "function") engine.setAnswer(key, value);
    else if (typeof engine.setResponse === "function") engine.setResponse(key, value);
    else if (engine.responses) engine.responses[key] = value;
  };

  const syncSectionResources = () => {
    if (!engine || !currentTest) return;

    const secId = getCurrentSectionId();
    const section = getSectionById(secId);

    // Reading: passage iframe
    if (el.materialFrame) {
      const src = resolveAsset(section?.materialHtml ?? null);
      if (src) el.materialFrame.src = src;
    }

    // Listening: audio
    if (el.audio) {
      const raw =
        section?.audioFile ??
        section?.audio ??
        (Array.isArray(section?.audioFiles) ? section.audioFiles[0] : null) ??
        null;

      const audioUrl = resolveAsset(normalizeAudioPath(raw));
      if (audioUrl) {
        if (el.audio.src !== audioUrl) {
          el.audio.src = audioUrl;
          el.audio.preload = "auto";
          el.audio.load();
        }
        if (el.audioLink && el.audioLinkWrap) {
          el.audioLink.href = audioUrl;
          el.audioLink.textContent = "Open audio URL";
          el.audioLinkWrap.style.display = "block";
        }
      } else {
        el.audio.removeAttribute("src");
        if (el.audioLinkWrap) el.audioLinkWrap.style.display = "none";
      }
    }
  };

  const questionsForCurrentSection = () => {
    const secId = getCurrentSectionId();
    return engine.questionFlat.filter(q => q.sectionId === secId);
  };

  const sheetHtmlCache = new Map();
  let renderedSheetSectionId = null;
  let lastQuestionKey = null;

  const loadSheetTemplate = async (section) => {
    if (!section?.sheetHtml) return null;
    if (sheetHtmlCache.has(section.id)) return sheetHtmlCache.get(section.id);
    const url = resolveAsset(section.sheetHtml);
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
      const html = await res.text();
      sheetHtmlCache.set(section.id, html);
      return html;
    } catch (err) {
      console.error(err);
      setStatus("Unable to load section sheet.");
      return null;
    }
  };

  const highlightBlank = (key, { scroll } = {}) => {
    if (!el.question) return;
    const blanks = Array.from(el.question.querySelectorAll("[data-q]"));
    blanks.forEach(b => b.classList?.remove("active"));
    const target = blanks.find(b => `${b.dataset.q}` === `${key}`);
    if (target) {
      target.classList.add("active");
      if (scroll) target.scrollIntoView({ block: "nearest" });
    }
  };

  const syncSheetValues = () => {
    if (!el.question) return;
    const blanks = el.question.querySelectorAll("input[data-q], textarea[data-q]");
    blanks.forEach(inp => {
      const key = inp.dataset.q?.trim();
      if (!key) return;
      const val = getAnswerValue(key) ?? "";
      if (inp.value !== val) inp.value = val;
    });
  };

  const bindSheetInputs = () => {
    if (!el.question) return;
    const blanks = el.question.querySelectorAll("input[data-q], textarea[data-q]");
    blanks.forEach(inp => {
      const key = inp.dataset.q?.trim();
      if (!key) return;
      const val = getAnswerValue(key) ?? "";
      if (inp.value !== val) inp.value = val;
      inp.addEventListener("input", () => {
        setAnswerValue(key, inp.value.trim());
        refreshNav();
      });
    });
  };

  const renderSheetForSection = async (section, curKey, shouldScroll) => {
    const html = await loadSheetTemplate(section);
    if (!html) return false;
    if (renderedSheetSectionId !== section.id) {
      el.question.innerHTML = html;
      renderedSheetSectionId = section.id;
      bindSheetInputs();
    } else {
      syncSheetValues();
    }
    highlightBlank(curKey, { scroll: shouldScroll });
    return true;
  };

  const navPickHandler = async (pickedKey) => {
    const idx = engine.questionFlat.findIndex(q => q.key === pickedKey);
    if (idx >= 0) {
      engine.goToIndex(idx);
      await renderAll();
    }
  };

  const refreshNav = () => {
    const cur = engine.getCurrent();
    const navQs = questionsForCurrentSection();
    renderNav(el.qnav, navQs, engine.responses, cur?.key, navPickHandler, flags);
  };

  const renderAll = async () => {
    if (!engine || !currentTest) return;

    syncSectionResources();

    // Keep section select synced to the current sectionId
    const secId = getCurrentSectionId();
    if (secId) el.sectionSelect.value = secId;

    const cur = engine.getCurrent();
    const section = getSectionById(cur?.sectionId);
    const shouldScroll = lastQuestionKey !== cur?.key;

    refreshNav();

    const usedSheet = moduleName === "listening" && section?.sheetHtml
      ? await renderSheetForSection(section, cur?.key, shouldScroll)
      : false;

    if (!usedSheet) {
      renderedSheetSectionId = null;
      renderQuestion(el.question, cur, engine, {
        onAnswerChange: () => {
          updateFlagBtn();
          refreshNav();
        }
      });
    }

    updateFlagBtn();

    setStatus(
      `Section ${engine.sectionIndex + 1}/${(currentTest.sections ?? []).length} • ` +
      `Q ${engine.qIndex + 1}/${engine.getTotalQuestions()}`
    );

    lastQuestionKey = cur?.key ?? null;
  };

  const renderResults = (auto = false) => {
    if (!el.results || !currentTest || !engine) return;
    const g = gradeModule(currentTest, engine.responses);
    const band = estimateBand(moduleName, g.raw);

    el.results.innerHTML = `
      <div class="kpi">
        <div class="item"><div class="v">${g.raw}</div><div class="k">Raw score</div></div>
        <div class="item"><div class="v">${g.max}</div><div class="k">Max</div></div>
        <div class="item"><div class="v">${Number(band).toFixed(1)}</div><div class="k">Estimated band</div></div>
      </div>
      <div style="height:10px"></div>
      <div class="small">${auto ? "Time finished. " : ""}Auto-marking applies only to Listening and Reading.</div>
    `;
  };

  const populateTests = () => {
    el.testSelect.innerHTML = "";
    for (const t of tests) {
      const opt = document.createElement("option");
      opt.value = t.path;
      opt.textContent = t.title ?? t.id ?? t.path;
      el.testSelect.appendChild(opt);
    }
  };

  const populateSections = () => {
    el.sectionSelect.innerHTML = "";
    (currentTest.sections ?? []).forEach((s, idx) => {
      const opt = document.createElement("option");
      opt.value = s.id; // IMPORTANT: value is section.id
      opt.textContent = s.title ?? `Section ${idx + 1}`;
      el.sectionSelect.appendChild(opt);
    });

    // sync select to current section
    const secId = getCurrentSectionId();
    if (secId) el.sectionSelect.value = secId;
  };

  const loadTest = async (path) => {
    setStatus("Loading test...");
    const testUrl = new URL(path, appBaseUrl);
    currentTest = await loadJSON(testUrl);

    const storageKey = `ielts:${moduleName}:${currentTest.id ?? path}`;
    flagsKey = `${storageKey}:flags`;

    engine = new ExamEngine(currentTest, storageKey);
    engine.markStarted();
    // ensure sectionIndex matches qIndex after load
    engine.goToIndex(engine.qIndex);

    sheetHtmlCache.clear();
    renderedSheetSectionId = null;
    lastQuestionKey = null;

    flags = loadFlags(flagsKey);

    // timer
    timer?.stop();
    timer = new CountdownTimer(
      currentTest.timeLimitSeconds ?? 0,
      () => { if (el.timer) el.timer.textContent = timer.format(); },
      () => { engine.submit(); renderResults(true); }
    );
    if (el.timer) el.timer.textContent = timer.format();
    if ((currentTest.timeLimitSeconds ?? 0) > 0) timer.start();

    populateSections();
    if (el.results) el.results.textContent = "Submit to see results.";

    await renderAll();
  };

  // ---------- wire UI ----------
  populateTests();
  await loadTest(el.testSelect.value);

  el.testSelect.addEventListener("change", async () => {
    await loadTest(el.testSelect.value);
  });

  el.sectionSelect.addEventListener("change", async () => {
    const secId = el.sectionSelect.value; // section.id
    const firstIdx = engine.questionFlat.findIndex(q => q.sectionId === secId);
    if (firstIdx >= 0) {
      engine.goToIndex(firstIdx);
      await renderAll();
    }
  });

  el.prevBtn?.addEventListener("click", async () => { engine.prev(); await renderAll(); });
  el.nextBtn?.addEventListener("click", async () => { engine.next(); await renderAll(); });

  el.flagBtn?.addEventListener("click", async () => {
    const k = engine.getCurrent()?.key;
    if (!k) return;
    if (flags.has(k)) flags.delete(k);
    else flags.add(k);
    saveFlags();
    await renderAll();
  });

  el.resetBtn?.addEventListener("click", async () => {
    engine.resetAll();
    flags.clear();
    saveFlags();
    if (el.results) el.results.textContent = "Submit to see results.";
    await renderAll();
  });

  el.submitBtn?.addEventListener("click", () => {
    engine.submit();
    renderResults(false);
  });

  el.audioFile?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f || !el.audio) return;
    el.audio.src = blobURLFromFile(f);
    el.audio.load();
  });

  if (el.audio) {
    el.audio.addEventListener("error", () => {
      const code = el.audio?.error?.code ?? "unknown";
      setStatus(`Audio error (code ${code}). Check the MP3 URL/path.`);
    });
  }
}
