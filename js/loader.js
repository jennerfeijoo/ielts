const CARD_HEADER = /^type\s*;\s*front/i;
const DEFAULT_AREAS = ["education", "tech", "environment", "society", "economy"];
const DEFAULT_TYPES = ["vocab", "collocation"];

async function loadFile(area) {
  try {
    const res = await fetch(`./data/${area}.txt`);
    if (!res.ok) {
      throw new Error(`No se pudo cargar data/${area}.txt (${res.status})`);
    }

    const text = await res.text();
    return text
      .replace(/\uFEFF/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err) {
    console.error(`[loader] Error al leer ${area}:`, err);
    return [];
  }
}

function parseLine(line) {
  const cleanLine = line.replace(/\uFEFF/g, "");
  if (!cleanLine || cleanLine.startsWith("#")) return null;

  const parts = cleanLine.split(";");
  const type = parts[0];
  const front = parts[1];
  const backRaw = parts[2] || "";
  const examplesRaw = parts.slice(3).join(";");

  if (!type || !front) return null;

  return {
    type: type.trim(),
    front: front.trim(),
    back: backRaw
      .split("/")
      .map((t) => t.trim())
      .filter(Boolean),
    examples: examplesRaw
      .split("|")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

function parseSelection(key, fallback, allowlist) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    const filtered = Array.isArray(raw) ? raw.filter((item) => allowlist.includes(item)) : [];
    return filtered.length ? filtered : fallback;
  } catch (err) {
    console.warn(`[loader] Selección inválida para ${key}, usando valores por defecto.`, err);
    return fallback;
  }
}

async function loadSelectedCards() {
  const areas = parseSelection("selectedAreas", DEFAULT_AREAS, DEFAULT_AREAS);
  const allowedTypes = parseSelection("selectedTypes", DEFAULT_TYPES, DEFAULT_TYPES);

  const cards = [];

  for (const area of areas) {
    const lines = await loadFile(area);
    for (const l of lines) {
      const line = l.trim();
      if (!line || CARD_HEADER.test(line)) continue;
      const parsed = parseLine(line);
      if (parsed && allowedTypes.includes(parsed.type)) {
        cards.push({ ...parsed, area });
      }
    }
  }

  return cards;
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

window.cardLoader = {
  loadSelectedCards,
  shuffle,
};
