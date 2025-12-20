export function normalizeText(s) {
  if (s == null) return "";
  let x = String(s).trim().toLowerCase();

  // Collapse whitespace
  x = x.replace(/\s+/g, " ");

  // Strip surrounding quotes
  x = x.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");

  // Strip trailing punctuation (common IELTS entry issues)
  x = x.replace(/[.,;:!?]+$/g, "");

  return x.trim();
}

export function normalizeLetter(s) {
  if (s == null) return "";
  return String(s).trim().toUpperCase();
}
