export function getPlanetTerpUrlForProfessor(name: string, planetTerpSlug?: string): string {
  const slug = (planetTerpSlug?.trim() || name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-"));

  return `https://planetterp.com/professor/${encodeURIComponent(slug)}`;
}

export function formatRatingStars(rating?: number): string {
  if (rating === undefined || !Number.isFinite(rating)) {
    return "☆☆☆☆☆";
  }

  const rounded = Math.round(Math.max(0, Math.min(5, rating)));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}
