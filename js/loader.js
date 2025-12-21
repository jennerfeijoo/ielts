export async function loadJSON(path) {
  const target = path instanceof URL ? path.href : path;
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
