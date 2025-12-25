import { normalizeText, normalizeLetter } from "./normalize.js";

function toAcceptedArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  return [x];
}

function normalizeMultipleChoiceResponse(val) {
  if (Array.isArray(val)) return val.map(normalizeLetter).filter(Boolean);
  if (typeof val === "string") {
    if (val.includes(",")) return val.split(",").map(normalizeLetter).filter(Boolean);
    const solo = normalizeLetter(val);
    return solo ? [solo] : [];
  }
  return [];
}

function normByType(val, type) {
  if (type === "single_letter" || type === "tfng" || type === "ynng") return normalizeLetter(val);
  if (type === "multi_letter") return Array.isArray(val) ? val.map(normalizeLetter).sort() : [];
  if (type === "multipleChoice") {
    const list = normalizeMultipleChoiceResponse(val);
    return list.length <= 1 ? (list[0] ?? "") : list;
  }
  return normalizeText(val);
}

function acceptedNormalized(accepted, type) {
  const arr = toAcceptedArray(accepted);
  if (type === "single_letter" || type === "tfng" || type === "ynng") return arr.map(normalizeLetter);
  if (type === "multi_letter") return arr.map(normalizeLetter).sort();
  if (type === "multipleChoice") return arr.map(normalizeLetter);
  return arr.map(normalizeText);
}

/**
 * Grade a module that contains:
 * - sections[].questions[] with a "key" field that identifies answerKey entry
 * - answerKey object whose keys match question.key
 */
export function gradeModule(testJson, responses) {
  const key = testJson.answerKey ?? {};
  const groups = Array.isArray(testJson.answerGroups) ? testJson.answerGroups : [];
  const flat = [];
  for (const sec of (testJson.sections ?? [])) {
    for (const q of (sec.questions ?? [])) {
      flat.push(q);
    }
  }

  // Keys that are scored via answerGroups (to avoid double-counting)
  const groupedKeys = new Set();
  for (const g of groups) {
    for (const k of (g?.keys ?? [])) groupedKeys.add(String(k));
  }

  let raw = 0;
  let max = 0;
  const details = [];

  // 1) Score grouped questions (e.g., "Choose TWO letters" where order doesn't matter)
  for (const g of groups) {
    const keys = (g?.keys ?? []).map(String).filter(Boolean);
    if (!keys.length) continue;

    const acceptedSet = new Set((g.acceptedSet ?? []).map(normalizeLetter).filter(Boolean));
    const expectedCount = g.expectedCount ?? acceptedSet.size;
    if (!acceptedSet.size || !expectedCount) continue;

    let userSet = new Set();
    for (const k of keys) {
      const v = normalizeLetter(responses?.[k]);
      if (v) userSet.add(v);
    }

    let gained = 0;
    for (const v of userSet) if (acceptedSet.has(v)) gained += 1;
    gained = Math.min(gained, expectedCount);

    raw += gained;
    max += expectedCount;
    details.push({
      key: g.id ?? keys.join(","),
      type: "answerGroup",
      gained,
      max: expectedCount,
      user: Array.from(userSet),
      accepted: Array.from(acceptedSet)
    });
  }

  // 2) Score regular questions
  for (const q of flat) {
    const qKey = q.key;
    if (groupedKeys.has(String(qKey))) continue;
    const rule = key[qKey];
    if (!rule) continue;

    // scoring weight
    const weight = rule.weight ?? (rule.type === "multi_letter" ? (rule.expectedCount ?? 1) : 1);
    max += weight;

    const user = responses[qKey];
    let gained = 0;

    if (q.type === "multipleChoice") {
      const acceptedLetters = acceptedNormalized(rule.accepted, q.type).filter(Boolean);
      const userVals = normalizeMultipleChoiceResponse(user);
      if (acceptedLetters.length <= 1) {
        const userVal = userVals[0] ?? "";
        gained = acceptedLetters.includes(userVal) ? 1 : 0;
      } else {
        const accSet = new Set(acceptedLetters);
        const userSet = new Set(userVals);
        const match = accSet.size === userSet.size && acceptedLetters.every(v => userSet.has(v));
        gained = match ? 1 : 0;
      }
    } else if (rule.type === "multi_letter") {
      // partial: intersection size (no negative marking)
      const userArr = Array.isArray(user) ? user.map(normalizeLetter) : [];
      const accSet = new Set((rule.acceptedSet ?? []).map(normalizeLetter));
      gained = userArr.filter(x => accSet.has(x)).length;
      gained = Math.min(gained, rule.expectedCount ?? accSet.size);
    } else {
      const userNorm = normByType(user, q.type);
      const accepted = acceptedNormalized(rule.accepted, q.type);
      gained = accepted.includes(userNorm) ? 1 : 0;
    }

    raw += gained;

    details.push({
      key: qKey,
      type: q.type,
      gained,
      max: weight,
      user,
      accepted: rule.type === "multi_letter" ? (rule.acceptedSet ?? []) : (rule.accepted ?? [])
    });
  }

  return { raw, max, details };
}

export function estimateBand(moduleName, raw) {
  // Conservative default tables (typical Cambridge Academic conversions).
  // You can override per test later if desired.
  const listening = [
    [39, 9.0],[37, 8.5],[35, 8.0],[32, 7.5],[30, 7.0],[26, 6.5],[23, 6.0],[18, 5.5],[16, 5.0],[13, 4.5]
  ];
  const readingAcademic = [
    [39, 9.0],[37, 8.5],[35, 8.0],[33, 7.5],[30, 7.0],[27, 6.5],[23, 6.0],[19, 5.5],[15, 5.0],[10, 4.5]
  ];

  const table = moduleName === "listening" ? listening : readingAcademic;
  for (const [min, band] of table) if (raw >= min) return band;
  return 4.0;
}
