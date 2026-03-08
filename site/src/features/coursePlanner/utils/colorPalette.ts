const BASE_SEQUENCE = [
  "#A6C0E9",
  "#E8B0B0",
  "#9CD1C8",
  "#C5A9DD",
  "#D3C97B",
  "#E7BD8D",
  "#A5D8E7",
  "#B7B7E8",
];

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function toRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function blendToWhite(hex: string, ratio = 0.55): string {
  const [r, g, b] = toRgb(hex);
  return toHex([
    Math.round(r + (255 - r) * ratio),
    Math.round(g + (255 - g) * ratio),
    Math.round(b + (255 - b) * ratio),
  ]);
}

export function getPastelColor(index: number): string {
  return blendToWhite(BASE_SEQUENCE[index % BASE_SEQUENCE.length], 0.55);
}

export function getPastelPalette(count: number): string[] {
  return Array.from({ length: count }, (_, idx) => getPastelColor(idx));
}
