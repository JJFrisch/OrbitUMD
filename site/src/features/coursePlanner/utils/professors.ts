export function getPlanetTerpUrlForProfessor(name: string, planetTerpSlug?: string): string {
  const slug = (planetTerpSlug?.trim() || name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-"));

  return `https://planetterp.com/professor/${encodeURIComponent(slug)}`;
}

const PLANETTERP_BASE = import.meta.env.VITE_PLANETTERP_API_BASE_URL ?? "https://planetterp.com/api/v1";
const slugCache = new Map<string, Promise<string | undefined>>();

export function normalizeProfessorName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function resolvePlanetTerpSlugByName(name: string): Promise<string | undefined> {
  const normalized = normalizeProfessorName(name);
  if (!normalized) return undefined;

  const key = normalized.toLowerCase();
  const existing = slugCache.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const url = new URL("professor", PLANETTERP_BASE.endsWith("/") ? PLANETTERP_BASE : `${PLANETTERP_BASE}/`);
    url.searchParams.set("name", normalized);

    const response = await fetch(url.toString());
    if (!response.ok) return undefined;

    const row = await response.json();
    const slug = typeof row?.slug === "string" ? row.slug.trim() : "";
    return slug || undefined;
  })().catch(() => undefined);

  slugCache.set(key, pending);
  return pending;
}

export function formatRatingStars(rating?: number): string {
  if (rating === undefined || !Number.isFinite(rating)) {
    return "☆☆☆☆☆";
  }

  const rounded = Math.round(Math.max(0, Math.min(5, rating)));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}
