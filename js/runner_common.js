// js/runner_common.js
import { loadJSON, blobURLFromFile } from "./loader.js";
import { ExamEngine } from "./engine.js";
import { CountdownTimer } from "./timer.js";
import { renderQuestion, renderNav } from "./ui.js";
import { gradeModule, estimateBand } from "./grader.js";

/**
 * Sheet mode:
 * If a section has `sheetHtml`, we render that HTML into #question and bind
 * any inputs/textarea/select with [data-q="..."] to engine responses.
 *
 * Intended use: Listening Part 1 “form” like IELTS on computer.
 *
 * JSON example (inside a section):
 *   "sheetHtml": "assets/sheets/test1/listening_part1.html"
 *
 * In the HTML:
 *   <input class="blank" data-q="1" />
 *   <input class="blank" data-q="2" />
 *   ...
 */
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

  // Safe CSS escaping for querySelector
  const cssEscape = (s) => {
    try {
      // Modern browsers
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(s));
    } catch {}
    // Minimal fallback
    return String(s).replace(/["\\]/g, "\\$&");
  };

  // ---------- state ----------
  let currentTest = null;
  let engine = null;
  let timer = null;

  let flags = new Set();
  let flagsKey = "";

  // Sheet-mode cache
  let renderedSheetSectionId = null;
  let renderedSheetHtmlUrl = null;

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

  const getSectionById = (secId) => (currentTest?.sections ?? []).find((s) => s.id === secId) ?? null;

  const getCurrentSection = () => {
    const secId = getCurrentSectionId();
    return secId ? getSectionById(secId) : null;
  };

  const syncSectionResources = () => {
    if (!engine || !currentTest) return;

    const section = getCurrentSection();

    // Reading: passage iframe
    if (el.materialFrame) {
      const src = resolveAsset(section?.materialHtml ?? null);
      if (src) el.materialFrame.src = src;
    }

    // Listening: audio (optional; you said you can load manually; still keep auto-load logic)
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

  // ---------- sheet mode ----------
  async function fetchHtml(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load sheetHtml (${res.status}): ${url}`);
    return await res.text();
  }

  function getResponseValue(key) {
    // engine.responses is used by renderNav; prefer engine.getResponse if available
    if (engine && typeof engine.getResponse === "function") return engine.getResponse(key) ?? "";
    return (engine?.responses?.[key] ?? "");
  }

  function setResponseValue(key, value) {
    if (!engine) return;
    // prefer engine.setResponse if available
    if (typeof engine.setResponse === "function") {
      engine.setResponse(key, value);
      return;
    }
    // fallback: directly set
    engine.responses[key] = value;
  }

  function bindSheetInputs() {
    if (!el.question) return;

    const fields = el.question.querySelectorAll("[data-q]");
    fields.forEach((field) => {
      const keyRaw = field.getAttribute("data-q");
      if (!keyRaw) return;

      const key = String(keyRaw).trim();
      if (!key) return;

      // Prefill current stored answer
      const current = getResponseValue(key);
      const fieldType = field.getAttribute("type");
      if (fieldType === "radio") {
        const val = normalizeTextValue(current);
        field.checked = val !== "" && String(field.value) === val;
      } else if (fieldType === "checkbox") {
        const list = normalizeListValue(current);
        field.checked = list.includes(String(field.value));
      } else if (typeof field.value !== "undefined" && field.value !== current) {
        field.value = current;
      }

      // Avoid multiple identical listeners if re-binding
      if (field.dataset.bound === "1") return;
      field.dataset.bound = "1";

      const handler = () => {
        const type = field.getAttribute("type");
        if (type === "radio") {
          if (field.checked) setResponseValue(key, field.value);
        } else if (type === "checkbox") {
          const values = collectCheckboxValues(key);
          setResponseValue(key, values);
        } else {
          const v = (typeof field.value === "string") ? field.value : "";
          setResponseValue(key, v);
        }

        // Update nav highlighting (answered state)
        const cur = engine.getCurrent();
        const nav = questionsForCurrentSection();
        renderNav(
          el.qnav,
          nav,
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
        updateFlagBtn();
      };

      const evt = (field.tagName === "SELECT" || fieldType === "radio" || fieldType === "checkbox")
        ? "change"
        : "input";
      field.addEventListener(evt, handler);
    });
  }

  function normalizeTextValue(val) {
    if (Array.isArray(val)) return val.map(String).join(",");
    if (val == null) return "";
    return String(val);
  }

  function normalizeListValue(val) {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") {
      if (val.includes(",")) return val.split(",").map(v => v.trim()).filter(Boolean);
      if (val.trim()) return [val.trim()];
    }
    return [];
  }

  function collectCheckboxValues(key) {
    if (!el.question) return [];
    const selector = `[data-q="${cssEscape(key)}"][type="checkbox"]`;
    const boxes = Array.from(el.question.querySelectorAll(selector));
    return boxes.filter(b => b.checked).map(b => b.value);
  }

  function highlightActiveBlank(activeKey) {
    if (!el.question) return;
    const all = el.question.querySelectorAll("[data-q]");
    all.forEach((x) => x.classList.remove("active"));

    const selector = `[data-q="${cssEscape(activeKey)}"]`;
    const target = el.question.querySelector(selector);
    if (target) {
      target.classList.add("active");
      // keep focus behavior natural: only focus if user navigated (not on every render)
      try {
        target.scrollIntoView({ block: "nearest" });
      } catch {}
    }
  }

  async function ensureSheetRendered(section) {
    if (!section?.sheetHtml) return false;

    const sheetUrl = resolveAsset(section.sheetHtml);
    if (!sheetUrl) return false;

    // Only (re)render if section changed or URL changed
    if (renderedSheetSectionId === section.id && renderedSheetHtmlUrl === sheetUrl) {
      return true;
    }

    const html = await fetchHtml(sheetUrl);
    el.question.innerHTML = html;

    renderedSheetSectionId = section.id;
    renderedSheetHtmlUrl = sheetUrl;

    // bind immediately after injecting HTML
    bindSheetInputs();
    return true;
  }

  function clearSheetCacheIfNeeded(section) {
    // When not in sheet mode, clear cache so next time it can re-render cleanly
    if (!section?.sheetHtml) {
      renderedSheetSectionId = null;
      renderedSheetHtmlUrl = null;
      // (do not clear el.question here; renderQuestion will replace it)
    }
  }

  // ---------- render ----------
  const renderGroup = (groupId, section) => {
    if (!el.question) return;
    const groupQuestions = questionsForCurrentSection().filter((q) => q.groupId === groupId);
    if (!groupQuestions.length) {
      return;
    }

    el.question.innerHTML = "";

    const groupMeta =
      section?.questionGroups?.[groupId] ??
      groupQuestions.find((q) => q.groupMeta)?.groupMeta ??
      null;

    if (groupMeta?.title) {
      const title = document.createElement("div");
      title.className = "h1";
      title.style.fontSize = "18px";
      title.textContent = groupMeta.title;
      el.question.appendChild(title);
    }

    if (Array.isArray(groupMeta?.optionsBox) && groupMeta.optionsBox.length) {
      const box = document.createElement("div");
      box.className = "sheet-box";
      groupMeta.optionsBox.forEach((opt) => {
        const row = document.createElement("div");
        row.className = "opt";
        if (typeof opt === "string") {
          row.textContent = opt;
        } else {
          const label = document.createElement("strong");
          label.textContent = opt.id ?? opt.value ?? "";
          row.appendChild(label);
          row.appendChild(document.createTextNode(` ${opt.text ?? ""}`));
        }
        box.appendChild(row);
      });
      el.question.appendChild(box);
    }

    groupQuestions.forEach((q) => {
      const holder = document.createElement("div");
      holder.style.marginBottom = "10px";
      renderQuestion(holder, q, engine, {
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
              const idx = engine.questionFlat.findIndex((qq) => qq.key === pickedKey);
              if (idx >= 0) {
                engine.goToIndex(idx);
                renderAll();
              }
            },
            flags
          );
        },
      });
      el.question.appendChild(holder);
    });
  };

  const renderAll = async () => {
    if (!engine || !currentTest) return;

    syncSectionResources();

    // Keep section select synced to the current sectionId
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

    const section = getCurrentSection();

    // Sheet mode for Listening (or any module if you want): enabled by section.sheetHtml
    const useSheet = !!section?.sheetHtml;

    if (useSheet) {
      await ensureSheetRendered(section);
      bindSheetInputs();
      highlightActiveBlank(cur.key);
    } else {
      clearSheetCacheIfNeeded(section);

      if (cur.groupId) {
        renderGroup(cur.groupId, section);
      } else {
        renderQuestion(el.question, cur, engine, {
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
      }
    }

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

    flags = loadFlags(flagsKey);

    // reset sheet cache per test
    renderedSheetSectionId = null;
    renderedSheetHtmlUrl = null;

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
    const firstIdx = engine.questionFlat.findIndex((q) => q.sectionId === secId);
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
