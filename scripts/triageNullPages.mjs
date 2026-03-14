import * as cheerio from "cheerio";

const urls = [
  "https://academiccatalog.umd.edu/undergraduate/colleges-schools/arts-humanities/art-history-archaeology/archaeology-minor/",
  "https://academiccatalog.umd.edu/undergraduate/colleges-schools/arts-humanities/classical-languages-literature/archaeology-minor/",
  "https://academiccatalog.umd.edu/undergraduate/colleges-schools/arts-humanities/classical-languages-literature/greek-language-culture-minor/",
  "https://academiccatalog.umd.edu/undergraduate/colleges-schools/arts-humanities/history/history-minor/",
  "https://academiccatalog.umd.edu/undergraduate/colleges-schools/arts-humanities/languages-literatures-cultures/germanic-studies/german-studies-minor/",
  "https://academiccatalog.umd.edu/undergraduate/colleges-schools/arts-humanities/music/music-major/",
  "https://academiccatalog.umd.edu/undergraduate/colleges-schools/undergraduate-studies/global-studies-minor/",
];

function normalize(s) {
  return s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

for (const url of urls) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const $ = cheerio.load(html);
    const container = $("#requirementstextcontainer");
    const scope = container.length ? container : $("main");
    const scopeText = normalize(scope.text());
    const tables = scope.find("table").length;
    const lists = scope.find("ul, ol").length;
    const hs = scope
      .find("h2, h3, h4, p strong")
      .slice(0, 10)
      .toArray()
      .map((node) => normalize($(node).text()))
      .filter(Boolean);
    const listItems = scope
      .find("li")
      .slice(0, 12)
      .toArray()
      .map((node) => normalize($(node).text()))
      .filter(Boolean);
    const codes = [
      ...new Set([...scopeText.matchAll(/\b[A-Z]{2,6}\s?\d{3}[A-Z]?\b/g)].map((m) => m[0].replace(/\s+/g, ""))),
    ].slice(0, 30);

    console.log("\nURL:", url);
    console.log("status:", res.status, "tables:", tables, "lists:", lists, "hasContainer:", container.length > 0);
    console.log("headings:", hs.join(" | "));
    console.log("listItems:", listItems.slice(0, 6).join(" || "));
    console.log("codes:", codes.join(", "));
  } catch (e) {
    console.log("\nURL:", url);
    console.log("error:", e?.message || String(e));
  }
}
