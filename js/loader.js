export async function loadJSON(path) {
  // Resolve paths robustly across modules (e.g., /modules/*.html on GitHub Pages)
  // - If `path` is a URL, use it directly.
  // - If `path` is an absolute URL string, use it directly.
  // - Otherwise, resolve against the current document base URI.
  const target = (path instanceof URL)
    ? path.href
    : (/^https?:\/\//i.test(String(path))
        ? String(path)
        : new URL(String(path), document.baseURI).href);

  const res = await fetch(target, { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`Failed to load ${res.url || target} (status ${res.status})`);
    err.status = res.status;
    err.url = res.url || target;
    throw err;
  }
  return await res.json();
}

export function blobURLFromFile(file) {
  return URL.createObjectURL(file);
}
