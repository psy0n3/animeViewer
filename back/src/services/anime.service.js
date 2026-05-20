const { URL } = require("node:url");
const { ApiError } = require("../utils/api-error");
const animeav1Service = require("./animeav1.service");
const jkanimeService = require("./jkanime.service");
const animeflvService = require("./animeflv.service");
const hentailaService = require("./hentaila.service");
const tioanimeService = require("./tioanime.service");
const monoschinosService = require("./monoschinos.service");

const DEFAULT_ANIME_DOMAIN = process.env.DEFAULT_ANIME_DOMAIN || "animeav1.com";

const PROVIDERS = [
  {
    id: "animeav1",
    label: "AnimeAV1",
    domains: [DEFAULT_ANIME_DOMAIN, "animeav1.com", "www.animeav1.com"],
    service: animeav1Service,
  },
  {
    id: "jkanime",
    label: "JKAnime",
    domains: ["jkanime.net", "www.jkanime.net"],
    service: jkanimeService,
  },
  {
    id: "animeflv",
    label: "AnimeFLV",
    domains: ["animeflv.net", "www.animeflv.net", "www4.animeflv.net"],
    service: animeflvService,
  },
  {
    id: "hentaila",
    label: "HentaiLA",
    domains: ["hentaila.com", "www.hentaila.com"],
    service: hentailaService,
  },
  {
    id: "tioanime",
    label: "TioAnime",
    domains: ["tioanime.com", "www.tioanime.com"],
    service: tioanimeService,
  },
  {
    id: "monoschinos",
    label: "MonosChinos",
    domains: ["monoschinos2.com", "www.monoschinos2.com"],
    service: monoschinosService,
  },
];
const DEFAULT_SEARCH_PROVIDERS = PROVIDERS.filter((provider) => provider.id !== "hentaila");

function normalizeDomain(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  try {
    if (trimmed.includes("://")) {
      return new URL(trimmed).hostname.toLowerCase();
    }
    return new URL(`https://${trimmed}`).hostname.toLowerCase();
  } catch (_error) {
    return trimmed.split("/")[0];
  }
}

function domainMatches(domain, candidate) {
  if (!domain || !candidate) {
    return false;
  }

  if (domain === candidate) {
    return true;
  }

  return domain.endsWith(`.${candidate}`);
}

function findProviderByDomain(domainCandidate) {
  const domain = normalizeDomain(domainCandidate);
  if (!domain) {
    return null;
  }

  return (
    PROVIDERS.find((provider) => provider.domains.some((candidate) => domainMatches(domain, candidate))) || null
  );
}

function findProviderById(providerId) {
  if (!providerId || typeof providerId !== "string") {
    return null;
  }

  const normalized = providerId.trim().toLowerCase();
  return PROVIDERS.find((provider) => provider.id === normalized) || null;
}

function findProviderForUrl(urlCandidate) {
  if (!urlCandidate || typeof urlCandidate !== "string") {
    return null;
  }

  try {
    const host = new URL(urlCandidate).hostname;
    return findProviderByDomain(host);
  } catch (_error) {
    return null;
  }
}

function normalizeTitleKey(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:season|temporada|movie|pelicula|film|ova|ona|special|especial|part|cour)\b.*$/i, "")
    .trim();
}

function getQueryTerms(query) {
  return normalizeTitleKey(query)
    .split(/\s+/)
    .filter((term) => term.length > 2 && !["the", "and", "los", "las", "una", "uno", "para"].includes(term));
}

function isRelevantSearchResult(item, query) {
  const terms = getQueryTerms(query);
  if (!terms.length) return true;

  const title = normalizeTitleKey(item?.title);
  const compactTitle = title.replace(/\s+/g, "");
  const compactQuery = terms.join("");

  if (compactTitle.includes(compactQuery)) return true;
  if (terms.every((term) => title.includes(term))) return true;
  if (terms.includes("naruto") && /\b(boruto|konoha|hokage)\b/.test(title)) return true;
  if (terms.includes("dragon") && terms.includes("ball") && /\b(dbz|dragonball)\b/.test(compactTitle)) return true;

  return false;
}

function mergeSearchResults(resultsByProvider, query) {
  const byTitle = new Map();
  const byUrl = new Set();

  for (const { provider, result } of resultsByProvider) {
    for (const rawItem of result?.data?.results || []) {
      if (!isRelevantSearchResult(rawItem, query)) continue;

      const titleKey = normalizeTitleKey(rawItem?.title);
      const urlKey = (rawItem?.url || "").toString().trim().toLowerCase();
      if (!titleKey || !urlKey || byUrl.has(urlKey)) continue;

      const item = {
        ...rawItem,
        provider: provider.id,
        source: provider.id,
      };
      const current = byTitle.get(titleKey);

      if (!current) {
        byTitle.set(titleKey, item);
        byUrl.add(urlKey);
        continue;
      }

      byTitle.set(titleKey, {
        ...current,
        image: current.image || item.image || null,
        backdrop: current.backdrop || item.backdrop || null,
        score: current.score ?? item.score ?? null,
        status: current.status || item.status || null,
        year: current.year || item.year || null,
        alternatives: [...(current.alternatives || []), item],
      });
      byUrl.add(urlKey);
    }
  }

  return [...byTitle.values()];
}

async function searchAnime(query, domainCandidate) {
  const forcedProvider = findProviderByDomain(domainCandidate) || findProviderById(domainCandidate);
  const providersToTry = forcedProvider ? [forcedProvider] : DEFAULT_SEARCH_PROVIDERS;

  let lastEmpty = null;
  const errors = [];

  if (forcedProvider) {
    try {
      const result = await forcedProvider.service.searchAnime(query, forcedProvider.domains[0]);
      return {
        ...result,
        source: result?.source || forcedProvider.id,
      };
    } catch (error) {
      throw error;
    }
  }

  const settledResults = await Promise.allSettled(
    providersToTry.map(async (provider) => ({
      provider,
      result: await provider.service.searchAnime(query, provider.domains[0]),
    }))
  );

  const fulfilled = [];
  for (const settled of settledResults) {
    if (settled.status === "fulfilled") {
      const { provider, result } = settled.value;
      const count = result?.data?.count ?? 0;
      if (count > 0) {
        fulfilled.push({ provider, result });
      } else if (!lastEmpty) {
        lastEmpty = {
          ...result,
          source: result?.source || provider.id,
        };
      }
    } else {
      errors.push(settled.reason);
    }
  }

  if (fulfilled.length) {
    const results = mergeSearchResults(fulfilled, query);
    return {
      success: true,
      data: {
        query: (query || "").toString().trim(),
        results,
        count: results.length,
      },
      source: "multi",
      providers: fulfilled.map(({ provider }) => provider.id),
    };
  }

  if (lastEmpty) {
    return lastEmpty;
  }

  if (errors.length === providersToTry.length && errors[0]) {
    throw errors[0];
  }

  throw new ApiError(502, "No se pudo completar la busqueda en proveedores");
}

async function searchAnimeSingleProvider(query, domainCandidate) {
  const forcedProvider = findProviderByDomain(domainCandidate) || findProviderById(domainCandidate);
  const providersToTry = forcedProvider ? [forcedProvider] : DEFAULT_SEARCH_PROVIDERS;

  let lastEmpty = null;
  const errors = [];

  for (const provider of providersToTry) {
    try {
      const result = await provider.service.searchAnime(query, provider.domains[0]);
      const count = result?.data?.count ?? 0;
      if (count > 0 || forcedProvider) {
        return {
          ...result,
          source: result?.source || provider.id,
        };
      }

      if (!lastEmpty) {
        lastEmpty = {
          ...result,
          source: result?.source || provider.id,
        };
      }
    } catch (error) {
      errors.push({ provider: provider.id, error });
    }
  }

  if (lastEmpty) {
    return lastEmpty;
  }

  if (errors.length === providersToTry.length && errors[0]?.error) {
    throw errors[0].error;
  }

  throw new ApiError(502, "No se pudo completar la busqueda en proveedores");
}

async function getAnimeInfo(urlCandidate) {
  const provider = findProviderForUrl(urlCandidate) || PROVIDERS[0];
  if (!provider) {
    throw new ApiError(400, "Proveedor no soportado");
  }

  const result = await provider.service.getAnimeInfo(urlCandidate);
  return {
    ...result,
    source: result?.source || provider.id,
  };
}

async function getEpisodeLinks(urlCandidate, includeMega, excludeServers) {
  const provider = findProviderForUrl(urlCandidate) || PROVIDERS[0];
  if (!provider) {
    throw new ApiError(400, "Proveedor no soportado");
  }

  const result = await provider.service.getEpisodeLinks(urlCandidate, includeMega, excludeServers);
  return {
    ...result,
    source: result?.source || provider.id,
  };
}

module.exports = {
  searchAnime,
  getAnimeInfo,
  getEpisodeLinks,
};
