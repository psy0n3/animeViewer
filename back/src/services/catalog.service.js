const fs = require("node:fs/promises");
const path = require("node:path");
const animeService = require("./anime.service");
const artworkService = require("./artwork.service");

function getCatalogIndexPath() {
  return path.resolve(process.env.CATALOG_CACHE_PATH || "storage/catalog-cache.json");
}
const CACHE_TTL_MS = Number(process.env.CATALOG_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const ARTWORK_ITEM_LIMIT = Number(process.env.CATALOG_ARTWORK_ITEM_LIMIT || 12);
const ARTWORK_GROUP_LIMIT = Number(process.env.CATALOG_ARTWORK_GROUP_LIMIT || 24);
const INFO_CONCURRENCY = Number(process.env.CATALOG_INFO_CONCURRENCY || 12);
const INITIAL_CATALOG_TIMEOUT_MS = Number(process.env.INITIAL_CATALOG_TIMEOUT_MS || 25000);
const INITIAL_CATALOG_SECTIONS = Number(process.env.INITIAL_CATALOG_SECTIONS || 0);
const INITIAL_CATALOG_QUERIES = Number(process.env.INITIAL_CATALOG_QUERIES || 0);
const CACHE_VERSION = 3;

const CATALOG_SECTIONS = [
  { title: "Shonen esenciales", queries: ["naruto", "dragon ball", "hunter x hunter", "jujutsu kaisen", "kimetsu no yaiba", "boku no hero academia"] },
  { title: "Aventura y poder", queries: ["one piece", "fullmetal alchemist", "fairy tail", "black clover", "sword art online", "magi"] },
  { title: "Accion intensa", queries: ["bleach", "chainsaw man", "cyberpunk", "tokyo ghoul", "hellsing", "fire force"] },
  { title: "Mundos oscuros", queries: ["attack on titan", "death note", "monster", "berserk", "vinland saga", "made in abyss"] },
  { title: "Isekai y fantasia", queries: ["re zero", "tensei shitara slime", "mushoku tensei", "overlord", "konosuba", "shield hero"] },
  { title: "Romance y drama", queries: ["kaguya sama", "horimiya", "toradora", "clannad", "your lie in april", "fruits basket"] },
  { title: "Comedia y vida diaria", queries: ["spy x family", "nichijou", "gintama", "saiki kusuo", "danshi koukousei", "barakamon"] },
  { title: "Deportes", queries: ["haikyuu", "kuroko no basket", "blue lock", "hajime no ippo", "slam dunk", "yowamushi pedal"] },
  { title: "Mecha y sci-fi", queries: ["gundam", "evangelion", "code geass", "steins gate", "psycho pass", "cowboy bebop"] },
  { title: "Magia y sobrenatural", queries: ["fate", "madoka magica", "ao no exorcist", "noragami", "d gray man", "soul eater"] },
  { title: "Escolares", queries: ["classroom of the elite", "oregairu", "assassination classroom", "komi san", "hyouka", "school rumble"] },
  { title: "Peliculas y especiales", queries: ["ghibli", "shinkai", "one piece movie", "dragon ball movie", "naruto movie", "fate movie"] },
  { title: "Clasicos", queries: ["yu yu hakusho", "rurouni kenshin", "trigun", "inuyasha", "ranma", "saint seiya"] },
  { title: "Terror y misterio", queries: ["another", "higurashi", "mirai nikki", "erased", "parasyte", "shiki"] },
  { title: "Musica e idols", queries: ["k on", "love live", "bang dream", "beck", "nana", "bocchi the rock"] },
  { title: "Cortos y ligeros", queries: ["ova", "ona", "special", "chibi", "short", "mini anime"] },
];

const FRANCHISE_RULES = [
  { name: "Naruto", test: /\b(naruto|boruto)\b/i },
  { name: "One Piece", test: /\bone piece\b/i },
  { name: "Bleach", test: /\bbleach\b/i },
  { name: "Shingeki no Kyojin", test: /\b(shingeki no kyojin|attack on titan)\b/i },
  { name: "Dragon Ball", test: /\bdragon ball\b/i },
  { name: "Kimetsu no Yaiba", test: /\b(kimetsu no yaiba|demon slayer)\b/i },
  { name: "Jujutsu Kaisen", test: /\bjujutsu kaisen\b/i },
  { name: "Hunter x Hunter", test: /\bhunter x hunter\b/i },
  { name: "Boku no Hero Academia", test: /\b(boku no hero academia|my hero academia)\b/i },
  { name: "Fullmetal Alchemist", test: /\bfullmetal alchemist\b/i },
  { name: "Fairy Tail", test: /\bfairy tail\b/i },
  { name: "Black Clover", test: /\bblack clover\b/i },
  { name: "Sword Art Online", test: /\bsword art online\b/i },
  { name: "Chainsaw Man", test: /\bchainsaw man\b/i },
  { name: "Tokyo Ghoul", test: /\btokyo ghoul\b/i },
  { name: "Hellsing", test: /\bhellsing\b/i },
  { name: "Death Note", test: /\bdeath note\b/i },
  { name: "Monster", test: /\bmonster\b/i },
  { name: "Berserk", test: /\bberserk\b/i },
  { name: "Vinland Saga", test: /\bvinland saga\b/i },
  { name: "Made in Abyss", test: /\bmade in abyss\b/i },
];

let catalogCache = null;
let pendingCatalog = null;

function getFranchiseName(title = "") {
  const match = FRANCHISE_RULES.find((rule) => rule.test.test(title));
  if (match) return match.name;

  return title
    .replace(/\b(?:season|temporada|movie|pelicula|ova|ona|special|part|cour)\b.*$/i, "")
    .replace(/\b(?:s\d+|\d+(?:st|nd|rd|th)? season)\b.*$/i, "")
    .replace(/[:(（-].*$/u, "")
    .trim();
}

function getAnimeKey(item) {
  return (item?.url || item?.slug || item?.title || "").toString().trim().toLowerCase();
}

function uniqueAnimeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getAnimeKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupAnimeItems(items) {
  const groups = new Map();
  items.forEach((item) => {
    const name = getFranchiseName(item.title) || item.title;
    const key = name.toLowerCase();
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
      if (!existing.image && item.image) existing.image = item.image;
      if (!existing.backdrop && item.backdrop) existing.backdrop = item.backdrop;
      return;
    }

    groups.set(key, {
      name,
      image: item.image || null,
      backdrop: item.backdrop || null,
      items: [item],
    });
  });

  return [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

async function ensureStorage() {
  await fs.mkdir(path.dirname(getCatalogIndexPath()), { recursive: true });
}

async function readCatalogCache() {
  if (catalogCache) return catalogCache;

  await ensureStorage();
  try {
    catalogCache = JSON.parse(await fs.readFile(getCatalogIndexPath(), "utf8"));
  } catch (_error) {
    catalogCache = null;
  }

  return catalogCache;
}

async function writeCatalogCache(payload) {
  await ensureStorage();
  catalogCache = payload;
  await fs.writeFile(getCatalogIndexPath(), `${JSON.stringify(payload, null, 2)}\n`);
}

function isFresh(payload) {
  const updatedAt = new Date(payload?.updatedAt || "").getTime();
  return (
    payload?.version === CACHE_VERSION &&
    payload?.partial !== true &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt < CACHE_TTL_MS
  );
}

function rebaseLocalUrl(url, baseUrl) {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/artwork/")) {
      return `${baseUrl}${parsed.pathname}`;
    }
  } catch (_error) {
    if (url.startsWith("/artwork/")) {
      return `${baseUrl}${url}`;
    }
  }

  return url;
}

function rebaseCatalogUrls(payload, baseUrl) {
  return {
    ...payload,
    rows: (payload.rows || []).map((row) => ({
      ...row,
      items: (row.items || []).map((item) => ({
        ...item,
        image: rebaseLocalUrl(item.image, baseUrl),
        backdrop: rebaseLocalUrl(item.backdrop, baseUrl),
      })),
    })),
  };
}

async function loadSection(section) {
  const resultsByQuery = await Promise.allSettled(
    section.queries.map(async (query) => {
      const payload = await animeService.searchAnime(query);
      return payload?.data?.results || [];
    })
  );
  const items = await filterItemsWithEpisodes(
    uniqueAnimeItems(resultsByQuery.flatMap((result) => (result.status === "fulfilled" ? result.value : [])))
  );

  return {
    ...section,
    items,
  };
}

function withTimeout(promise, timeoutMs, fallbackValue) {
  let timer = null;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function loadInitialSection(section) {
  const queryLimit = INITIAL_CATALOG_QUERIES > 0 ? INITIAL_CATALOG_QUERIES : section.queries.length;
  const queries = section.queries.slice(0, queryLimit);
  const resultsByQuery = await Promise.allSettled(
    queries.map(async (query) => {
      const payload = await withTimeout(animeService.searchAnime(query), 8000, null);
      return payload?.data?.results || [];
    })
  );
  const items = uniqueAnimeItems(resultsByQuery.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));

  return {
    ...section,
    items,
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function filterItemsWithEpisodes(items) {
  const checked = await mapWithConcurrency(items, INFO_CONCURRENCY, async (item) => {
    if (!item?.url) return null;

    try {
      const payload = await animeService.getAnimeInfo(item.url);
      const episodes = payload?.data?.episodes || [];
      if (!episodes.length) return null;

      return {
        ...item,
        totalEpisodes: payload?.data?.totalEpisodes || episodes.length,
      };
    } catch (_error) {
      return null;
    }
  });

  return checked.filter(Boolean);
}

async function resolveArtworkMap(items, baseUrl) {
  const titles = [
    ...items.slice(0, ARTWORK_ITEM_LIMIT).map((item) => item?.title),
    ...groupAnimeItems(items).slice(0, ARTWORK_GROUP_LIMIT).map((group) => group.name),
  ].filter(Boolean);
  const uniqueTitles = [...new Set(titles)];
  const resolved = new Map();

  await mapWithConcurrency(uniqueTitles, 3, async (title) => {
    await new Promise((r) => setTimeout(r, 250)); // Delay to respect rate limits
    try {
      const artwork = await artworkService.resolveArtwork(title, baseUrl);
      resolved.set(title, artwork || null);
    } catch {
      resolved.set(title, null);
    }
  });

  return resolved;
}

async function enrichSection(section, baseUrl) {
  const artworkByTitle = await resolveArtworkMap(section.items, baseUrl);

  return {
    ...section,
    items: section.items.map((item) => {
      const artwork = artworkByTitle.get(item.title) || artworkByTitle.get(getFranchiseName(item.title));
      if (!artwork) return item;

      return {
        ...item,
        image: artwork.image || item.image,
        backdrop: artwork.backdrop || item.backdrop,
        accentColor: artwork.accentColor,
        anilistTitle: artwork.anilistTitle,
      };
    }),
  };
}

async function buildCatalog(baseUrl) {
  const rows = [];

  for (const section of CATALOG_SECTIONS) {
    const loaded = await loadSection(section);
    if (!loaded.items.length) continue;
    rows.push(await enrichSection(loaded, baseUrl));
  }

  return {
    version: CACHE_VERSION,
    rows,
    updatedAt: new Date().toISOString(),
    ttlMs: CACHE_TTL_MS,
  };
}

async function buildInitialCatalog() {
  const sectionLimit = INITIAL_CATALOG_SECTIONS > 0 ? INITIAL_CATALOG_SECTIONS : CATALOG_SECTIONS.length;
  const sections = CATALOG_SECTIONS.slice(0, sectionLimit);
  const loaded = await withTimeout(
    mapWithConcurrency(sections, 4, loadInitialSection),
    INITIAL_CATALOG_TIMEOUT_MS,
    []
  );
  const rows = loaded.filter((section) => section.items.length);

  return {
    version: CACHE_VERSION,
    rows,
    updatedAt: new Date().toISOString(),
    ttlMs: CACHE_TTL_MS,
    partial: true,
  };
}

function startBackgroundCatalogBuild(baseUrl) {
  if (pendingCatalog) return pendingCatalog;

  pendingCatalog = buildCatalog(baseUrl)
    .then(async (payload) => {
      await writeCatalogCache(payload);
      console.log("Background catalog rebuild complete.");
      return { ...payload, cached: false };
    })
    .catch((error) => {
      console.error("Error building catalog in background:", error);
      return null;
    })
    .finally(() => {
      pendingCatalog = null;
    });

  return pendingCatalog;
}

async function getCatalog(baseUrl, options = {}) {
  const force = options.force === true;
  const cached = await readCatalogCache();

  // If we have a cached catalog, return it immediately to prevent blocking
  if (!force && cached?.rows?.length) {
    const fresh = isFresh(cached);
    if (!fresh && !pendingCatalog) {
      // Trigger background update if it's stale, but don't await it
      console.log("Catalog cache is stale, triggering background rebuild...");
      startBackgroundCatalogBuild(baseUrl);
    }
    return { ...rebaseCatalogUrls(cached, baseUrl), cached: true, stale: !fresh };
  }

  if (!force) {
    startBackgroundCatalogBuild(baseUrl);

    const payload = await buildInitialCatalog(baseUrl);
    await writeCatalogCache(payload);
    return { ...rebaseCatalogUrls(payload, baseUrl), cached: false, stale: true };
  }

  const payload = await buildCatalog(baseUrl);
  await writeCatalogCache(payload);
  return { ...payload, cached: false };
}


module.exports = {
  filterItemsWithEpisodes,
  getCatalog,
};
