const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const exists = (p) => fs.existsSync(p);

const errors = [];
const warn = [];

const manifest = readJson(path.join(root, "data/manifest.json"));
const writingSets = readJson(path.join(root, "data/writing/sets.json"));

const hasTest = (arr, id) => Array.isArray(arr) && arr.some((t) => t.id === id);

if (!hasTest(manifest.listening, "test2")) {
  errors.push("manifest.json missing listening test2");
}
if (!hasTest(manifest.reading, "test2")) {
  errors.push("manifest.json missing reading test2");
}
if (!hasTest(writingSets.sets, "test2")) {
  errors.push("writing/sets.json missing test2");
}

const loadTest = (p) => readJson(path.join(root, p));

const listeningTest2 = loadTest("data/listening/test2.json");
if ((listeningTest2.sections ?? []).length !== 4) {
  errors.push("listening test2 does not have exactly 4 sections");
}

const collectKeys = (testJson) => {
  const keys = [];
  (testJson.sections ?? []).forEach((sec) => {
    (sec.questions ?? []).forEach((q) => keys.push(String(q.key)));
  });
  return keys;
};

const ensureKeys = (keys, label) => {
  for (let i = 1; i <= 40; i += 1) {
    if (!keys.includes(String(i))) {
      errors.push(`${label} missing key ${i}`);
    }
  }
};

ensureKeys(collectKeys(listeningTest2), "listening test2");

const readingTest2 = loadTest("data/reading/test2.json");
ensureKeys(collectKeys(readingTest2), "reading test2");

const expectedGroups = {
  "1-5": [1,2,3,4,5],
  "6-13": [6,7,8,9,10,11,12,13],
  "14-18": [14,15,16,17,18],
  "19-23": [19,20,21,22,23],
  "24-26": [24,25,26],
  "27-31": [27,28,29,30,31],
  "32-36": [32,33,34,35,36],
  "37-40": [37,38,39,40]
};

const readingQuestions = new Map();
(readingTest2.sections ?? []).forEach((sec) => {
  (sec.questions ?? []).forEach((q) => readingQuestions.set(String(q.key), { q, sec }));
});

Object.entries(expectedGroups).forEach(([groupId, keys]) => {
  keys.forEach((k) => {
    const entry = readingQuestions.get(String(k));
    if (!entry) return;
    if (entry.q.groupId !== groupId) {
      errors.push(`reading test2 key ${k} missing groupId ${groupId}`);
    }
  });
});

const block3740 = ["37","38","39","40"].map((k) => readingQuestions.get(k)?.q).filter(Boolean);
if (block3740.length !== 4) {
  errors.push("reading test2 block 37–40 missing questions");
} else {
  block3740.forEach((q) => {
    if (q.type !== "matching") {
      errors.push(`reading test2 key ${q.key} should be type matching`);
    }
    const allowed = Array.isArray(q.allowedLetters) ? q.allowedLetters : [];
    const letters = ["A","B","C","D","E","F","G"];
    if (!letters.every((l) => allowed.includes(l))) {
      errors.push(`reading test2 key ${q.key} missing allowedLetters A–G`);
    }
  });

  const section = readingQuestions.get("37")?.sec;
  const optionsBox = section?.questionGroups?.["37-40"]?.optionsBox ?? [];
  const optionIds = optionsBox.map((o) => (typeof o === "string" ? o.trim().slice(0,1) : String(o.id))).filter(Boolean);
  const letters = ["A","B","C","D","E","F","G"];
  if (!letters.every((l) => optionIds.includes(l))) {
    errors.push("reading test2 block 37–40 optionsBox missing A–G");
  }
}

const checkHtmlRefs = (testJson, label) => {
  (testJson.sections ?? []).forEach((sec) => {
    if (sec.sheetHtml) {
      const p = path.join(root, sec.sheetHtml);
      if (!exists(p)) errors.push(`${label} missing sheetHtml ${sec.sheetHtml}`);
    }
    if (sec.materialHtml) {
      const p = path.join(root, sec.materialHtml);
      if (!exists(p)) errors.push(`${label} missing materialHtml ${sec.materialHtml}`);
    }
  });
};

checkHtmlRefs(loadTest("data/listening/test1.json"), "listening test1");
checkHtmlRefs(listeningTest2, "listening test2");
checkHtmlRefs(loadTest("data/reading/test1.json"), "reading test1");
checkHtmlRefs(readingTest2, "reading test2");

if (errors.length) {
  console.error("Verification failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}

if (warn.length) {
  console.warn("Warnings:\n" + warn.map((w) => `- ${w}`).join("\n"));
}

console.log("Verification passed.");
