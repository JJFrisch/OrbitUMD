import type { UmdCourseSummary } from "@/lib/types/course";
import {
  getCatalogSearchVersion,
  loadCatalogSearchSeed,
  searchCatalogCoursesFromRpc,
} from "@/lib/api/umdCourses";

type CatalogSearchSeedRow = {
  course_code: string;
  term_code: string;
  year: number;
  name: string;
  dept_id: string;
  credits: number | null;
  min_credits: number | null;
  max_credits: number | null;
  geneds: string[] | null;
  description: string | null;
  search_text: string;
  source_fingerprint: string;
  updated_at: string;
};

type SearchCacheFilters = {
  deptId?: string;
  genEdTag?: string;
  limitCount?: number;
};

type SearchCacheRecord = {
  version: string;
  cacheKey: string;
  results: UmdCourseSummary[];
  createdAt: number;
};

type SearchCacheIndexRecord = {
  version: string;
  rows: CatalogSearchSeedRow[];
  createdAt: number;
};

const DB_NAME = "orbitumd-search-cache";
const DB_VERSION = 1;
const INDEX_STORE = "search-index";
const RESULTS_STORE = "search-results";
const META_STORE = "search-meta";

const INDEX_META_KEY = "search-index-version";
const INDEX_TIMESTAMP_KEY = "search-index-updated-at";

let dbPromise: Promise<IDBDatabase> | null = null;
let versionPromise: Promise<string | null> | null = null;
let seedPromise: Promise<CatalogSearchSeedRow[]> | null = null;

function isBrowserStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalizeQuery(value).split(/\s+/).filter(Boolean);
}

function makeQueryKey(query: string, filters: SearchCacheFilters): string {
  return JSON.stringify({
    query: normalizeQuery(query),
    deptId: filters.deptId ?? null,
    genEdTag: filters.genEdTag ?? null,
    limitCount: filters.limitCount ?? 20,
  });
}

function makeVersionedCacheKey(version: string, queryKey: string): string {
  return `${version}::${queryKey}`;
}

function scoreRow(queryTokens: string[], row: CatalogSearchSeedRow): number {
  const normalizedCode = row.course_code.toLowerCase();
  const normalizedName = row.name.toLowerCase();
  const normalizedDept = row.dept_id.toLowerCase();
  const normalizedSearch = row.search_text.toLowerCase();
  const normalizedQuery = queryTokens.join(" ");

  if (!normalizedQuery) {
    return 1;
  }

  let score = 0;

  if (normalizedCode === normalizedQuery) score += 1000;
  if (normalizedCode.startsWith(normalizedQuery)) score += 700;
  if (normalizedDept === normalizedQuery) score += 220;
  if (normalizedName.includes(normalizedQuery)) score += 120;
  if (normalizedSearch.includes(normalizedQuery)) score += 40;

  for (const token of queryTokens) {
    if (normalizedCode.includes(token)) score += 8;
    if (normalizedName.includes(token)) score += 6;
    if (normalizedDept.includes(token)) score += 4;
    if (normalizedSearch.includes(token)) score += 2;
  }

  return score;
}

function rowToSummary(row: CatalogSearchSeedRow): UmdCourseSummary {
  const [deptId, number = ""] = row.course_code.split(/(?=\d)/);
  return {
    id: row.course_code,
    deptId: row.dept_id ?? deptId ?? "",
    number,
    title: row.name,
    credits: Number(row.credits ?? row.max_credits ?? 0),
    genEdTags: row.geneds ?? [],
    description: row.description ?? undefined,
  };
}

function matchesFilters(row: CatalogSearchSeedRow, filters: SearchCacheFilters): boolean {
  if (filters.deptId && row.dept_id !== filters.deptId) {
    return false;
  }

  if (filters.genEdTag && !(row.geneds ?? []).includes(filters.genEdTag)) {
    return false;
  }

  return true;
}

async function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  if (!isBrowserStorageAvailable()) {
    throw new Error("IndexedDB is not available in this environment.");
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(INDEX_STORE)) {
        db.createObjectStore(INDEX_STORE, { keyPath: "version" });
      }

      if (!db.objectStoreNames.contains(RESULTS_STORE)) {
        db.createObjectStore(RESULTS_STORE, { keyPath: "cacheKey" });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open search cache database"));
  });

  return dbPromise;
}

async function readStoreValue<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  if (!isBrowserStorageAvailable()) {
    return null;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`));
  });
}

async function writeStoreValue(storeName: string, value: unknown): Promise<void> {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to write ${storeName}`));
  });
}

async function clearStore(storeName: string): Promise<void> {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to clear ${storeName}`));
  });
}

async function getCachedVersion(): Promise<string | null> {
  const record = await readStoreValue<{ key: string; value: string }>(META_STORE, INDEX_META_KEY);
  return record?.value ?? null;
}

async function setCachedVersion(version: string): Promise<void> {
  await writeStoreValue(META_STORE, { key: INDEX_META_KEY, value: version, updatedAt: Date.now() });
  await writeStoreValue(META_STORE, { key: INDEX_TIMESTAMP_KEY, value: String(Date.now()), updatedAt: Date.now() });
}

async function getCachedIndex(version: string): Promise<CatalogSearchSeedRow[] | null> {
  const record = await readStoreValue<SearchCacheIndexRecord>(INDEX_STORE, version);
  return record?.rows ?? null;
}

async function putCachedIndex(version: string, rows: CatalogSearchSeedRow[]): Promise<void> {
  await writeStoreValue(INDEX_STORE, {
    version,
    rows,
    createdAt: Date.now(),
  } satisfies SearchCacheIndexRecord);
  await setCachedVersion(version);
}

async function getCachedResults(version: string, queryKey: string): Promise<UmdCourseSummary[] | null> {
  const record = await readStoreValue<SearchCacheRecord>(RESULTS_STORE, makeVersionedCacheKey(version, queryKey));
  return record?.results ?? null;
}

async function putCachedResults(version: string, queryKey: string, results: UmdCourseSummary[]): Promise<void> {
  await writeStoreValue(RESULTS_STORE, {
    version,
    cacheKey: makeVersionedCacheKey(version, queryKey),
    results,
    createdAt: Date.now(),
  } satisfies SearchCacheRecord);
}

async function ensureLatestIndex(): Promise<{ version: string | null; rows: CatalogSearchSeedRow[] }> {
  const version = await getCatalogSearchVersion();
  if (!version) {
    return { version: null, rows: [] };
  }

  const cachedVersion = await getCachedVersion();
  if (cachedVersion === version) {
    const cachedRows = await getCachedIndex(version);
    if (cachedRows) {
      return { version, rows: cachedRows };
    }
  }

  if (cachedVersion && cachedVersion !== version) {
    await clearStore(RESULTS_STORE);
    await clearStore(INDEX_STORE);
  }

  if (!seedPromise) {
    seedPromise = loadCatalogSearchSeed().finally(() => {
      seedPromise = null;
    });
  }

  const rows = await seedPromise;
  if (rows.length > 0) {
    await clearStore(INDEX_STORE);
    await putCachedIndex(version, rows);
    return { version, rows };
  }

  return { version, rows: [] };
}

function searchRowsLocally(rows: CatalogSearchSeedRow[], query: string, filters: SearchCacheFilters): UmdCourseSummary[] {
  const queryTokens = tokenize(query);
  const deduped = new Map<string, { row: CatalogSearchSeedRow; score: number }>();

  for (const row of rows) {
    if (!matchesFilters(row, filters)) {
      continue;
    }

    const score = scoreRow(queryTokens, row);
    if (score <= 0) {
      continue;
    }

    const key = row.course_code.toUpperCase();
    const existing = deduped.get(key);
    if (!existing || score > existing.score) {
      deduped.set(key, { row, score });
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.row.year !== left.row.year) {
        return right.row.year - left.row.year;
      }
      return left.row.course_code.localeCompare(right.row.course_code);
    })
    .slice(0, filters.limitCount ?? 20)
    .map(({ row }) => rowToSummary(row));
}

async function refreshServerResults(query: string, filters: SearchCacheFilters, version: string): Promise<void> {
  const serverRows = await searchCatalogCoursesFromRpc({
    query,
    deptId: filters.deptId,
    genEdTag: filters.genEdTag,
    limitCount: filters.limitCount ?? 20,
  });

  if (serverRows.length > 0) {
    await putCachedResults(version, makeQueryKey(query, filters), serverRows);
  }
}

export async function prefetchCatalogSearchIndex(): Promise<void> {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  const { version, rows } = await ensureLatestIndex();
  if (!version || rows.length === 0) {
    return;
  }
}

export async function searchLatestCatalogCourses(
  query: string,
  filters: SearchCacheFilters = {}
): Promise<UmdCourseSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const versionAndRows = await ensureLatestIndex();
  const version = versionAndRows.version;
  const rows = versionAndRows.rows;
  const queryKey = makeQueryKey(trimmed, filters);

  if (version) {
    const cachedResults = await getCachedResults(version, queryKey);
    if (cachedResults) {
      return cachedResults;
    }
  }

  if (rows.length > 0) {
    const localResults = searchRowsLocally(rows, trimmed, filters);
    if (version) {
      void refreshServerResults(trimmed, filters, version).catch(() => undefined);
      await putCachedResults(version, queryKey, localResults);
    }
    return localResults;
  }

  const serverResults = await searchCatalogCoursesFromRpc({
    query: trimmed,
    deptId: filters.deptId,
    genEdTag: filters.genEdTag,
    limitCount: filters.limitCount ?? 20,
  });

  if (version) {
    await putCachedResults(version, queryKey, serverResults);
  }

  return serverResults;
}
