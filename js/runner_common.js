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

    // Reading: iframe (materialFrame or pdfFrame depending on module page)
    materialFrame:
      document.getElementById("materialFrame") ??
      document.getElementById("pdfFrame"),

    // Listening: audio
    audioFile: document.getElementById("audioFile"),
    audio: document.getElementById("audio"),
    audioLinkWrap: document.getElementById("audioLinkWrap"),
    audioLink: document.getElementById("audioLink"),
  };

  // ---- status helpers (base + extra) ----
  let statusBase = "";
  let statusExtra = "";
  const refreshStatus = () => {
    if (!el.status) return;
    const parts = [statusBase, statusExtra].filter(Boolean);
    el.status.textContent = parts.join(" • ");
  };
  const setStatus = (msg) => {
    statusBase = msg ?? "";
    refreshStatus();
  };
  const setStatusExtra = (msg) => {
    statusExtra = msg ?? "";
    refreshStatus();
  };

  if (!el.testSelect || !el.sectionSelect || !el.qnav || !el.question) {
    console.error("Missing required layout elements for module boot.");
    setStatus("Unable to start: missing required layout elements.");
    return;
  }

  // ------------------------------------------------------------
  // IMPORTANT: Resolve ALL paths from SITE ROOT, not from /data/.
  // manifestPath is usually "../data/manifest.json" from modules/*.html
  // We resolve it relative to this JS module URL and then compute site root:
  //   manifestUrl: .../ielts/data/manifest.json
  //   appBaseUrl : .../ielts/
  // ------------------------------------------------------------
  const manifestUrl = new URL(manifestPath, import.meta.url);
  const appBaseUrl = new URL("..", manifestUrl);

  const logFetchFail = (label, url, err) => {
    console.error(`[${label}] failed`, url, err);
    setStatusExtra(`${label} failed (see console)`);
  };

  setStatus("Loading manifest...");

  let manifest;
  try {
    manifest = await loadJSON(manifestUrl);
  } catch (err) {
    logFetchFail("manifest", manifestUrl.href, err);
    setStatus(`Error loading manifest`);
    return;
  }

  const tests = manifest?.[moduleName] ?? [];
  if (!tests.length) {
    setStatus(`No tests found for module: ${moduleName}`);
    return;
  }

  // ---------- helpers ----------
  const resolveSite = (p) => {
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) return p;
    // resolve relative to site root (/ielts/)
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

  const updateTimerBadge = (remaining) => {
    if (!el.timer) return;
    if (remaining <= 300) el.timer.classList.add("danger");
    else el.timer.classList.remove("danger");
  };

  const getCurrentSectionId = () => engine?.getCurrent()?.sectionId ?? null;

  const getSectionById = (secId) =>
    (currentTest?.sections ?? []).find((s) => s.id === secId) ?? null;

  // --- Load the per-section material (reading passage / listening sheet) + audio ---
  const syncSectionResources = () => {
    if (!engine || !currentTest) return;

    const secId = getCurrentSectionId();
    const section = getSectionById(secId);

    // Reading & Listening "sheet": iframe
    // - For Reading: section.materialHtml (passage)
    // - For Listening sheet-mode: section.sheetHtml (form/table HTML)
    if (el.materialFrame) {
      const src =
        resolveSite(section?.sheetHtml ?? null) ??
        resolveSite(section?.materialHtml ?? null);

      if (src) {
        if (el.materialFrame.src !== src) el.materialFrame.src = src;
      } else {
        // Clear if no material configured
        el.materialFrame.removeAttribute("src");
      }
    }

    // Listening audio
    if (el.audio) {
      const raw =
        section?.audioFile ??
        section?.audio ??
        (Array.isArray(section?.audioFiles) ? section.audioFiles[0] : null) ??
        null;

      const audioUrl = resolveSite(normalizeAudioPath(raw));

      if (audioUrl) {
        // Avoid reloads if same audio
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
        setStatusExtra("Audio ready");
      } else {
        el.audio.removeAttribute("src");
        if (el.audioLinkWrap) el.audioLinkWrap.style.display = "none";
        setStatusExtra("");
      }
    }
  };

  const questionsForCurrentSection = () => {
    const secId = getCurrentSectionId();
    if (!secId || !engine) return [];
    return engine.questionFlat.filter((q) => q.sectionId === secId);
  };

  const renderAll = () => {
    if (!engine || !currentTest) return;

    syncSectionResources();

    // Keep section select synced
    const secId = getCurrentSectionId();
    if (secId) el.sectionSelect.value = secId;

    const cur = engine.getCurrent();
    if (!cur) {
      setStatus("No current question (engine state invalid).");
      return;
    }

    const navQs = questionsForCurrentSection();

    // IMPORTANT: ui.renderNav in your project expects:
    // renderNav(navEl, questions, responses, currentKey, onPick, flags)
    // And calls onPick(pickedKey).
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
      onAnswerChange: () => {
        // Refresh nav + flag state
        updateFlagBtn();
        const cur2 = engine.getCurrent();
        const nav2 = questionsForCurrentSection();
        renderNav(
          el.qnav,
          nav2,
          engine.responses,
          cur2?.key,
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
      opt.value = s.id; // IMPORTANT: value is section.id
      opt.textContent = s.title ?? `Section ${idx + 1}`;
      el.sectionSelect.appendChild(opt);
    });

    // Sync select to current section
    const secId = getCurrentSectionId();
    if (secId) el.sectionSelect.value = secId;
  };

  const loadTest = async (path) => {
    setStatus("Loading test...");
    setStatusExtra("");

    // tests[].path in manifest already starts with "data/..."
    const testUrl = new URL(path, appBaseUrl);

    try {
      currentTest = await loadJSON(testUrl);
    } catch (err) {
      logFetchFail("test JSON", testUrl.href, err);
      setStatus("Failed to load test JSON");
      return;
    }

    const storageKey = `ielts:${moduleName}:${currentTest.id ?? path}`;
    flagsKey = `${storageKey}:flags`;

    engine = new ExamEngine(currentTest, storageKey);
    engine.markStarted();

    // Ensure sectionIndex matches qIndex after load
    engine.goToIndex(engine.qIndex);

    flags = loadFlags(flagsKey);

    // timer
    timer?.stop();
    timer = new CountdownTimer(
      currentTest.timeLimitSeconds ?? 0,
      (remaining) => {
        if (el.timer) el.timer.textContent = timer.format();
        updateTimerBadge(remaining);
      },
      () => {
        engine.submit();
        renderResults(true);
      }
    );

    if (el.timer) el.timer.textContent = timer.format();
    updateTimerBadge(timer.remaining ?? 0);

    if ((currentTest.timeLimitSeconds ?? 0) > 0) timer.start();

    populateSections();
    if (el.results) el.results.textContent = "Submit to see results.";

    renderAll();
  };

  // ---------- wire UI ----------
  populateTests();
  await loadTest(el.testSelect.value);

  el.testSelect.addEventListener("change", async () => {
    await loadTest(el.testSelect.value);
  });

  el.sectionSelect.addEventListener("change", () => {
    if (!engine) return;
    const secId = el.sectionSelect.value;
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

  // Local audio override
  el.audioFile?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f || !el.audio) return;
    el.audio.src = blobURLFromFile(f);
    el.audio.load();
    setStatusExtra("Local audio loaded");
  });

  if (el.audio) {
    el.audio.addEventListener("error", () => {
      const code = el.audio?.error?.code ?? "unknown";
      setStatusExtra(`Audio error (code ${code})`);
      setStatus("Check MP3 URL/path (case-sensitive on GitHub Pages).");
    });
  }
}
