import { normalizeText, normalizeLetter } from "./normalize.js";

function toAcceptedArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  return [x];
}

function normByType(val, type) {
  if (type === "single_letter" || type === "tfng" || type === "ynng") return normalizeLetter(val);
  if (type === "multi_letter") return Array.isArray(val) ? val.map(normalizeLetter).sort() : [];
  return normalizeText(val);
}

function acceptedNormalized(accepted, type) {
  const arr = toAcceptedArray(accepted);
  if (type === "single_letter" || type === "tfng" || type === "ynng") return arr.map(normalizeLetter);
  if (type === "multi_letter") return arr.map(normalizeLetter).sort();
  return arr.map(normalizeText);
}

/**
 * Grade a module that contains:
 * - sections[].questions[] with a "key" field that identifies answerKey entry
 * - answerKey object whose keys match question.key
 */
export function gradeModule(testJson, responses) {
  const key = testJson.answerKey ?? {};
  const flat = [];
  for (const sec of (testJson.sections ?? [])) {
    for (const q of (sec.questions ?? [])) {
      flat.push(q);
    }
  }

  let raw = 0;
  let max = 0;
  const details = [];

  for (const q of flat) {
    const qKey = q.key;
    const rule = key[qKey];
    if (!rule) continue;

    // scoring weight
    const weight = rule.weight ?? (rule.type === "multi_letter" ? (rule.expectedCount ?? 1) : 1);
    max += weight;

    const user = responses[qKey];
    let gained = 0;

    if (rule.type === "multi_letter") {
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
