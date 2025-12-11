const CARD_HEADER = /^type\s*;\s*front/i;

async function loadFile(area) {
  const res = await fetch(`./data/${area}.txt`);
  if (!res.ok) {
    throw new Error(`No se pudo cargar data/${area}.txt (${res.status})`);
  }
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean);
}

function parseLine(line) {
  const [type, front, back = "", examples = ""] = line.split(";");
  if (!type || !front) return null;

  return {
    type: type.trim(),
    front: front.trim(),
    back: back
      .split("/")
      .map((t) => t.trim())
      .filter(Boolean),
    examples: examples
      .split("|")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

async function loadSelectedCards() {
  const selectedAreas = JSON.parse(localStorage.getItem("selectedAreas") || "[]");
  const selectedTypes = JSON.parse(localStorage.getItem("selectedTypes") || "[]");

  const areas = selectedAreas.length ? selectedAreas : ["education", "tech", "environment", "society", "economy"];
  const allowedTypes = selectedTypes.length ? selectedTypes : ["vocab", "collocation"];

  const cards = [];

  for (const area of areas) {
    const lines = await loadFile(area);
    for (const l of lines) {
      if (CARD_HEADER.test(l)) continue;
      const parsed = parseLine(l);
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
