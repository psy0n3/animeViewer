const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const axios = require("axios");

const ANILIST_API_URL = "https://graphql.anilist.co";
const CACHE_TTL_MS = Number(process.env.ARTWORK_CACHE_TTL_MS || 24 * 60 * 60 * 1000);

function getArtworkDir() {
  return path.resolve(process.env.ARTWORK_DIR || "storage/artwork");
}

function getIndexPath() {
  return path.resolve(process.env.ARTWORK_INDEX_PATH || "storage/image-cache.json");
}

let indexCache = null;
const pendingLookups = new Map();

function normalizeTitle(title) {
  return (title || "").toString().trim().replace(/\s+/g, " ");
}

function cleanTitleForSearch(title) {
  if (!title) return "";
  return title
    .replace(/\s+/g, " ")
    // Remove common Spanish streaming suffix tags in parenthesis or brackets
    .replace(/\s*[\(\[][^\]\)]*(?:sub|esp|latino|doblaje|tv|uncensored|censored|castellano|completo|hd|1080p|720p|audio|dual)[^\]\)]*[\)\]]/gi, "")
    // Remove specific trailing suffixes
    .replace(/\s+sub\s+español\s*$/i, "")
    .replace(/\s+doblaje\s*$/i, "")
    .replace(/\s+latino\s*$/i, "")
    // Strip trailing dashes, parenthesis, colons or spaces after cleanup
    .replace(/[\s\-\:\(\)]+$/, "")
    .trim();
}

function getCacheKey(title) {
  return normalizeTitle(title).toLowerCase();
}

function getFileBase(title, kind) {
  const slug = normalizeTitle(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  const hash = crypto.createHash("sha1").update(`${kind}:${title}`).digest("hex").slice(0, 10);
  return `${slug || "anime"}-${kind}-${hash}`;
}

function getExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      return extension;
    }
  } catch (_error) {
    // Fall through to default.
  }

  return ".jpg";
}

async function ensureStorage() {
  await fs.mkdir(getArtworkDir(), { recursive: true });
  await fs.mkdir(path.dirname(getIndexPath()), { recursive: true });
}

async function readIndex() {
  if (indexCache) {
    return indexCache;
  }

  await ensureStorage();

  try {
    const raw = await fs.readFile(getIndexPath(), "utf8");
    indexCache = JSON.parse(raw);
  } catch (_error) {
    indexCache = {};
  }

  return indexCache;
}

async function writeIndex(index) {
  await ensureStorage();
  await fs.writeFile(getIndexPath(), `${JSON.stringify(index, null, 2)}\n`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

function resolveImagePath(cachedPath) {
  if (!cachedPath) return null;
  return path.join(getArtworkDir(), path.basename(cachedPath));
}

function toPublicUrl(filePath, baseUrl) {
  if (!filePath) {
    return null;
  }

  return `${baseUrl}/artwork/${path.basename(filePath)}`;
}

function isFreshCacheEntry(entry) {
  if (!entry?.updatedAt) {
    return false;
  }

  const updatedAt = new Date(entry.updatedAt).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < CACHE_TTL_MS;
}

function mapCachedArtwork(title, cached, baseUrl) {
  if (!cached || cached.notFound) {
    return null;
  }

  return {
    title,
    image: toPublicUrl(resolveImagePath(cached.imagePath), baseUrl),
    backdrop: toPublicUrl(resolveImagePath(cached.backdropPath), baseUrl),
    accentColor: cached.accentColor || null,
    anilistTitle: cached.anilistTitle || null,
    anilistId: cached.anilistId || null,
    cached: true,
    updatedAt: cached.updatedAt || null,
  };
}

async function fetchAniListArtwork(title) {
  const query = `
    query MediaArtwork($search: String) {
      Media(search: $search, type: ANIME) {
        id
        title {
          romaji
          english
          native
        }
        coverImage {
          extraLarge
          large
          color
        }
        bannerImage
      }
    }
  `;

  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await axios.post(
        ANILIST_API_URL,
        { query, variables: { search: title } },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          timeout: Number(process.env.ARTWORK_REQUEST_TIMEOUT_MS || 15000),
        }
      );
      break;
    } catch (error) {
      if (error.response?.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // backoff 1s, 2s
        continue;
      }
      throw error;
    }
  }

  const media = response.data?.data?.Media;
  if (!media) {
    return null;
  }

  return {
    anilistId: media.id || null,
    anilistTitle: media.title?.english || media.title?.romaji || media.title?.native || null,
    imageUrl: media.coverImage?.extraLarge || media.coverImage?.large || null,
    backdropUrl: media.bannerImage || null,
    accentColor: media.coverImage?.color || null,
  };
}

async function fetchJikanArtwork(title) {
  const cleanTitle = title?.trim();
  if (!cleanTitle) return null;

  try {
    const response = await axios.get("https://api.jikan.moe/v4/anime", {
      params: { q: cleanTitle, limit: 1 },
      timeout: Number(process.env.ARTWORK_REQUEST_TIMEOUT_MS || 15000),
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    const media = response.data?.data?.[0];
    if (!media) {
      return null;
    }

    return {
      anilistId: media.mal_id || null,
      anilistTitle: media.title_english || media.title || null,
      imageUrl: media.images?.webp?.large_image_url || media.images?.jpg?.large_image_url || null,
      backdropUrl: null,
      accentColor: null,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[Artwork] Jikan fallback failed for "${cleanTitle}":`, error.message);
    return null;
  }
}

async function downloadImage(url, title, kind) {
  if (!url) {
    return null;
  }

  await ensureStorage();

  const extension = getExtensionFromUrl(url);
  const fileName = `${getFileBase(title, kind)}${extension}`;
  const filePath = path.join(getArtworkDir(), fileName);

  if (await fileExists(filePath)) {
    return filePath;
  }

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: Number(process.env.ARTWORK_REQUEST_TIMEOUT_MS || 15000),
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });

  await fs.writeFile(filePath, response.data);
  return filePath;
}

async function resolveArtwork(title, baseUrl) {
  const normalizedTitle = normalizeTitle(title);
  const cacheKey = getCacheKey(normalizedTitle);
  if (!cacheKey) {
    return null;
  }

  if (pendingLookups.has(cacheKey)) {
    return pendingLookups.get(cacheKey);
  }

  const lookup = resolveArtworkInternal(normalizedTitle, cacheKey, baseUrl).finally(() => {
    pendingLookups.delete(cacheKey);
  });
  pendingLookups.set(cacheKey, lookup);
  return lookup;
}

async function resolveArtworkInternal(title, cacheKey, baseUrl) {
  const index = await readIndex();
  const cached = index[cacheKey];

  if (cached?.imagePath || cached?.backdropPath || cached?.notFound) {
    const imageExists = !cached.imagePath || (await fileExists(resolveImagePath(cached.imagePath)));
    const backdropExists = !cached.backdropPath || (await fileExists(resolveImagePath(cached.backdropPath)));

    if (imageExists && backdropExists && isFreshCacheEntry(cached)) {
      return mapCachedArtwork(title, cached, baseUrl);
    }
  }

  const cleanedTitle = cleanTitleForSearch(title);
  let remote = null;

  try {
    remote = await fetchAniListArtwork(cleanedTitle);
    if (!remote) {
      // eslint-disable-next-line no-console
      console.log(`[Artwork] AniList returned no results for "${cleanedTitle}". Trying Jikan fallback...`);
      remote = await fetchJikanArtwork(cleanedTitle);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[Artwork] AniList failed for "${cleanedTitle}". Trying Jikan fallback...`);
    try {
      remote = await fetchJikanArtwork(cleanedTitle);
    } catch (_jikanError) {
      // Fall through
    }
    if (!remote) {
      if (cached?.imagePath || cached?.backdropPath) {
        return mapCachedArtwork(title, cached, baseUrl);
      }
      throw error;
    }
  }

  if (!remote) {
    index[cacheKey] = {
      title,
      notFound: true,
      updatedAt: new Date().toISOString(),
    };
    await writeIndex(index);
    return null;
  }

  let imagePath = null;
  try {
    imagePath = await downloadImage(remote.imageUrl, title, "poster");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Artwork] Error downloading poster for "${title}":`, err.message);
  }

  let backdropPath = null;
  try {
    backdropPath = await downloadImage(remote.backdropUrl, title, "banner");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Artwork] Error downloading banner for "${title}":`, err.message);
  }

  index[cacheKey] = {
    title,
    anilistId: remote.anilistId,
    anilistTitle: remote.anilistTitle,
    accentColor: remote.accentColor,
    imagePath,
    backdropPath,
    sourceImageUrl: remote.imageUrl,
    sourceBackdropUrl: remote.backdropUrl,
    updatedAt: new Date().toISOString(),
  };
  await writeIndex(index);

  return {
    title,
    image: toPublicUrl(imagePath, baseUrl),
    backdrop: toPublicUrl(backdropPath, baseUrl),
    accentColor: remote.accentColor,
    anilistTitle: remote.anilistTitle,
    anilistId: remote.anilistId,
    cached: false,
  };
}


module.exports = {
  getArtworkDir,
  resolveArtwork,
};
