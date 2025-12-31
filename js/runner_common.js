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
    groupTitle: document.getElementById("groupTitle"),

    // Reading: iframe (passage)
    materialFrame:
      document.getElementById("materialFrame") ??
      document.getElementById("pdfFrame") ??
      document.getElementById("sheetFrame") ??
      null,

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

  // manifestPath is resolved relative to THIS FILE (js/runner_common.js)
  const manifestUrl = new URL(manifestPath, import.meta.url);

  // IMPORTANT:
  // manifestUrl is .../ielts/data/manifest.json
  // appBaseUrl must be .../ielts/ (site root), not .../ielts/data/
  const appBaseUrl = new URL("..", manifestUrl);

  setStatus("Loading manifest...");
  const manifest = await loadJSON(manifestUrl);

  const tests = manifest?.[moduleName] ?? [];
  if (!tests.length) {
    setStatus(`No tests found for module: ${moduleName}`);
    return;
  }

  // ---------------- helpers ----------------
  const resolveAsset = (p) => {
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) return p;
    return new URL(p, appBaseUrl).href;
  };

  // If you ever store audio as just "file.mp3" without a folder,
  // normalize it to assets/audio/file.mp3.
  const normalizeAudioPath = (raw) => {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!raw.includes("/")) return `assets/audio/${raw}`;
    return raw;
  };

  // ---------------- state ----------------
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
    try {
      localStorage.setItem(flagsKey, JSON.stringify(Array.from(flags)));
    } catch {}
  };

  const updateFlagBtn = () => {
    if (!el.flagBtn || !engine) return;
    const k = engine.getCurrent()?.key;
    const on = k ? flags.has(k) : false;
    el.flagBtn.textContent = on ? "Unflag" : "Flag for review";
    el.flagBtn.classList.toggle("danger", on);
  };

  const getCurrentSectionId = () => engine?.getCurrent()?.sectionId ?? null;

  const getSectionById = (secId) =>
    (currentTest?.sections ?? []).find((s) => s.id === secId) ?? null;

  const syncSectionResources = () => {
    if (!engine || !currentTest) return;

    const secId = getCurrentSectionId();
    const section = getSectionById(secId);

    // Reading: passage iframe
    if (el.materialFrame) {
      const src =
        resolveAsset(section?.materialHtml ?? null) ??
        resolveAsset(section?.sheetHtml ?? null);
      if (src && el.materialFrame.src !== src) el.materialFrame.src = src;
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
    return engine.questionFlat.filter((q) => q.sectionId === secId);
  };

  const renderAll = () => {
    if (!engine || !currentTest) return;

    syncSectionResources();

    if (el.groupTitle) {
      const secId = getCurrentSectionId();
      const section = getSectionById(secId);
      const title = section?.instructions ?? section?.title ?? "";
      el.groupTitle.textContent = title;
      el.groupTitle.style.display = title ? "block" : "none";
    }

    // keep section select synced to current question's sectionId
    const secId = getCurrentSectionId();
    if (secId) el.sectionSelect.value = secId;

    const cur = engine.getCurrent();
    const navQs = questionsForCurrentSection();

    renderNav(
      el.qnav,
      navQs,
      engine.responses,
      cur.key,
      (pickedKey) => {
        const idx = engine.questionFlat.findIndex((q) => q.key === pickedKey);
        if (idx >= 0) {
          engine.goToIndex(idx);
          renderAll();
        }
      },
      flags
    );

    renderQuestion(el.question, cur, engine, {
      moduleName,
      section: getSectionById(cur.sectionId),
      onAnswerChange: () => {
        updateFlagBtn();
        const cur2 = engine.getCurrent();
        const nav2 = questionsForCurrentSection();
        renderNav(
          el.qnav,
          nav2,
          engine.responses,
          cur2.key,
          (pickedKey) => {
            const idx = engine.questionFlat.findIndex((q) => q.key === pickedKey);
            if (idx >= 0) {
              engine.goToIndex(idx);
              renderAll();
            }
          },
          flags
        );
      },
    });

    updateFlagBtn();

    setStatus(
      `Section ${engine.sectionIndex + 1}/${(currentTest.sections ?? []).length} • ` +
        `Q ${engine.qIndex + 1}/${engine.getTotalQuestions()}`
    );
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
      opt.value = s.id; // IMPORTANT: use section.id, not index
      opt.textContent = s.title ?? `Section ${idx + 1}`;
      el.sectionSelect.appendChild(opt);
    });

    const secId = getCurrentSectionId();
    if (secId) el.sectionSelect.value = secId;
  };

  const loadTest = async (path) => {
    setStatus("Loading test...");

    // path in manifest is relative to site root (appBaseUrl)
    const testUrl = new URL(path, appBaseUrl);
    currentTest = await loadJSON(testUrl);

    const storageKey = `ielts:${moduleName}:${currentTest.id ?? path}`;
    flagsKey = `${storageKey}:flags`;

    engine = new ExamEngine(currentTest, storageKey);
    engine.markStarted();
    engine.goToIndex(engine.qIndex); // keep sectionIndex aligned

    flags = loadFlags(flagsKey);

    // timer
    timer?.stop();
    timer = new CountdownTimer(
      currentTest.timeLimitSeconds ?? 0,
      () => {
        if (el.timer) el.timer.textContent = timer.format();
      },
      () => {
        engine.submit();
        renderResults(true);
      }
    );

    if (el.timer) el.timer.textContent = timer.format();
    if ((currentTest.timeLimitSeconds ?? 0) > 0) timer.start();

    populateSections();
    if (el.results) el.results.textContent = "Submit to see results.";

    renderAll();
  };

  // ---------------- wire UI ----------------
  populateTests();
  await loadTest(el.testSelect.value);

  el.testSelect.addEventListener("change", async () => {
    await loadTest(el.testSelect.value);
  });

  el.sectionSelect.addEventListener("change", () => {
    const secId = el.sectionSelect.value; // section.id
    const firstIdx = engine.questionFlat.findIndex((q) => q.sectionId === secId);
    if (firstIdx >= 0) {
      engine.goToIndex(firstIdx);
      renderAll();
    }
  });

  el.prevBtn?.addEventListener("click", () => {
    engine.prev();
    renderAll();
  });

  el.nextBtn?.addEventListener("click", () => {
    engine.next();
    renderAll();
  });

  el.flagBtn?.addEventListener("click", () => {
    const k = engine.getCurrent()?.key;
    if (!k) return;
    if (flags.has(k)) flags.delete(k);
    else flags.add(k);
    saveFlags();
    renderAll();
  });

  el.resetBtn?.addEventListener("click", () => {
    engine.resetAll();
    flags.clear();
    saveFlags();
    if (el.results) el.results.textContent = "Submit to see results.";
    renderAll();
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
