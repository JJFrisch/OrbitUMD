export function getPlanetTerpUrlForProfessor(name: string, planetTerpSlug?: string): string {
  if (!planetTerpSlug?.trim()) {
    return `https://planetterp.com/search?query=${encodeURIComponent(name.trim())}`;
  }

  const slug = planetTerpSlug.trim();

  return `https://planetterp.com/professor/${encodeURIComponent(slug)}`;
}

const PLANETTERP_BASE = import.meta.env.VITE_PLANETTERP_API_BASE_URL ?? "https://planetterp.com/api/v1";
const slugCache = new Map<string, Promise<string | undefined>>();
const professorMetaCache = new Map<string, Promise<{ slug?: string; averageRating?: number } | undefined>>();

export function normalizeProfessorName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function resolvePlanetTerpProfessorMetaByName(
  name: string
): Promise<{ slug?: string; averageRating?: number } | undefined> {
  const normalized = normalizeProfessorName(name);
  if (!normalized) return undefined;

  const key = normalized.toLowerCase();
  const existing = professorMetaCache.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const url = new URL("professor", PLANETTERP_BASE.endsWith("/") ? PLANETTERP_BASE : `${PLANETTERP_BASE}/`);
    url.searchParams.set("name", normalized);

    const response = await fetch(url.toString());
    if (!response.ok) return undefined;

    const row = await response.json();
    const slug = typeof row?.slug === "string" ? row.slug.trim() : "";
    const rawRating = row?.average_rating ?? row?.averageRating ?? row?.avg_rating;
    const parsedRating = typeof rawRating === "number" ? rawRating : Number(rawRating);

    return {
      slug: slug || undefined,
      averageRating: Number.isFinite(parsedRating) ? parsedRating : undefined,
    };
  })().catch(() => undefined);

  professorMetaCache.set(key, pending);
  return pending;
}

export async function resolvePlanetTerpSlugByName(name: string): Promise<string | undefined> {
  const normalized = normalizeProfessorName(name);
  if (!normalized) return undefined;

  const key = normalized.toLowerCase();
  const existing = slugCache.get(key);
  if (existing) return existing;

  const pending = resolvePlanetTerpProfessorMetaByName(normalized).then((row) => row?.slug);

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
