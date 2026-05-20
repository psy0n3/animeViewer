import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Film,
  Heart,
  Loader2,
  Moon,
  Play,
  Search,
  Server,
  Star,
  Sun,
  User,
  X,
} from 'lucide-react'
import './App.css'

const CONFIGURED_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim()
let API_PORT = import.meta.env.VITE_API_PORT || '3000'
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  if (params.has('apiPort')) {
    API_PORT = params.get('apiPort')
  }
}
const API_KEY = import.meta.env.VITE_API_KEY || ''
const ENABLE_LOCAL_ARTWORK = import.meta.env.VITE_ENABLE_LOCAL_ARTWORK !== 'false'
const ARTWORK_TIMEOUT_MS = 6000
const SEARCH_ARTWORK_LIMIT = 18
const ALL_CATEGORIES = 'all'
const SEARCH_CATEGORY = 'search'
const CONTENT_FILTERS = [
  { value: 'all', label: 'Todo' },
  { value: 'series', label: 'Series' },
  { value: 'movies', label: 'Películas' },
]

const PROVIDERS = [
  { label: 'Auto', value: '' },
  { label: 'AnimeAV1', value: 'animeav1' },
  { label: 'AnimeFLV', value: 'animeflv' },
  { label: 'TioAnime', value: 'tioanime' },
  { label: 'JKAnime', value: 'jkanime' },
  { label: 'MonosChinos', value: 'monoschinos' },
]

const STREAM_TYPES = {
  iframe: 'Embed',
  hls: 'HLS',
  video: 'Video',
  external: 'Link',
}

const VARIANT_LABELS = {
  SUB: 'Subtitulado',
  DUB: 'Doblaje',
}

const POSTER_GRADIENTS = [
  'linear-gradient(135deg, #e50914 0%, #111827 48%, #26a69a 100%)',
  'linear-gradient(135deg, #f97316 0%, #27272a 46%, #0ea5e9 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #111827 50%, #f43f5e 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #172554 46%, #facc15 100%)',
]

const artworkCache = new Map()

function resolveApiBaseUrl() {
  if (CONFIGURED_API_BASE_URL) return CONFIGURED_API_BASE_URL.replace(/\/$/, '')
  if (typeof window === 'undefined') return ''

  const { hostname, port, protocol } = window.location
  if (protocol === 'file:') {
    return `http://127.0.0.1:${API_PORT}`
  }

  const isViteDevServer = /^517\d$/.test(port) || port === '8555'

  if (isViteDevServer) {
    return `${protocol}//${hostname}:${API_PORT}`
  }

  return ''
}

const API_BASE_URL = resolveApiBaseUrl()

const FRANCHISE_RULES = [
  { name: 'Naruto', test: /\b(naruto|boruto)\b/i },
  { name: 'One Piece', test: /\bone piece\b/i },
  { name: 'Bleach', test: /\bbleach\b/i },
  { name: 'Shingeki no Kyojin', test: /\b(shingeki no kyojin|attack on titan)\b/i },
  { name: 'Dragon Ball', test: /\bdragon ball\b/i },
  { name: 'Kimetsu no Yaiba', test: /\b(kimetsu no yaiba|demon slayer)\b/i },
  { name: 'Jujutsu Kaisen', test: /\bjujutsu kaisen\b/i },
  { name: 'Hunter x Hunter', test: /\bhunter x hunter\b/i },
  { name: 'Boku no Hero Academia', test: /\b(boku no hero academia|my hero academia)\b/i },
  { name: 'Fullmetal Alchemist', test: /\bfullmetal alchemist\b/i },
  { name: 'Fairy Tail', test: /\bfairy tail\b/i },
  { name: 'Black Clover', test: /\bblack clover\b/i },
  { name: 'Sword Art Online', test: /\bsword art online\b/i },
  { name: 'Chainsaw Man', test: /\bchainsaw man\b/i },
  { name: 'Tokyo Ghoul', test: /\btokyo ghoul\b/i },
  { name: 'Hellsing', test: /\bhellsing\b/i },
  { name: 'Death Note', test: /\bdeath note\b/i },
  { name: 'Monster', test: /\bmonster\b/i },
  { name: 'Berserk', test: /\bberserk\b/i },
  { name: 'Vinland Saga', test: /\bvinland saga\b/i },
  { name: 'Made in Abyss', test: /\bmade in abyss\b/i },
]

function joinUrl(path) {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL}${path}`
}

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
    ...options.headers,
  }

  let response
  try {
    response = await fetch(joinUrl(path), { ...options, headers })
  } catch (requestError) {
    const apiLocation = API_BASE_URL || 'la misma URL del front'
    throw new Error(
      `No pude conectar con la API en ${apiLocation}. Revisa que anime1v-api este corriendo y que VITE_API_BASE_URL o VITE_API_PORT apunten al lugar correcto.`,
      { cause: requestError },
    )
  }
  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `Error HTTP ${response.status}`)
  }

  return payload
}

function normalizeArtworkOptions(options) {
  if (typeof options === 'number') {
    return { itemLimit: options, groupLimit: options }
  }

  return {
    itemLimit: options?.itemLimit ?? 10,
    groupLimit: options?.groupLimit ?? options?.itemLimit ?? 10,
  }
}

async function enrichListWithArtwork(items, options = {}) {
  if (!ENABLE_LOCAL_ARTWORK) return items
  const { itemLimit, groupLimit } = normalizeArtworkOptions(options)

  const candidateTitles = [
    ...items.slice(0, itemLimit).map((item) => item?.title),
    ...groupAnimeItems(items).slice(0, groupLimit).map((group) => group.name),
  ].filter(Boolean)

  const titlesToFetch = [...new Set(candidateTitles)]
  if (!titlesToFetch.length) return items

  const artworkByTitle = new Map()
  const artworkResults = await Promise.allSettled(
    titlesToFetch.map(async (title) => [title, await fetchArtworkWithFallback(title)]),
  )
  artworkResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      const [title, artwork] = result.value
      artworkByTitle.set(title, artwork)
    }
  })

  return items.map((item) => {
    const artwork = artworkByTitle.get(item.title) || artworkByTitle.get(getFranchiseName(item.title))
    if (!artwork) return item

    return {
      ...item,
      image: artwork.image || item.image,
      backdrop: artwork.backdrop || item.backdrop,
      accentColor: artwork.accentColor,
      anilistTitle: artwork.anilistTitle,
    }
  })
}

async function fetchArtworkWithFallback(title) {
  const artwork = await fetchAniListArtwork(title)
  if (artwork?.image || artwork?.backdrop) return artwork

  const franchiseName = getFranchiseName(title)
  if (!franchiseName || franchiseName === title) return artwork

  return (await fetchAniListArtwork(franchiseName)) || artwork
}

async function fetchAniListArtwork(title) {
  const cleanTitle = title?.trim()
  if (!cleanTitle) return null
  if (artworkCache.has(cleanTitle)) return artworkCache.get(cleanTitle)

  try {
    const params = new URLSearchParams({ title: cleanTitle })
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), ARTWORK_TIMEOUT_MS)
    const payload = await apiRequest(`/api/v1/artwork?${params.toString()}`, { signal: controller.signal })
      .finally(() => window.clearTimeout(timeoutId))
    const artwork = payload?.data || null

    artworkCache.set(cleanTitle, artwork)
    return artwork
  } catch {
    artworkCache.set(cleanTitle, null)
    return null
  }
}

function getPlayableType(url = '') {
  const clean = url.split('?')[0].toLowerCase()

  if (clean.endsWith('.m3u8')) return 'hls'
  if (/\.(mp4|webm|ogg|mov)$/.test(clean)) return 'video'
  if (/\/embed\/|player|streamwish|yourupload|mp4upload|filemoon|luluvideo|voe|dood|mixdrop/i.test(url)) {
    return 'iframe'
  }

  return 'external'
}

function getAllEpisodeLinks(episodeData, variant) {
  const streams = episodeData?.streamLinks?.[variant] || []
  const downloads = episodeData?.downloadLinks?.[variant] || []
  const fallbackStreams = episodeData?.servers?.[variant.toLowerCase()] || []

  const linksByKey = new Map()
  const usedServers = new Set()

  function addLink(link, { skipExistingServer = false } = {}) {
    if (!link?.url) return

    const serverKey = (link.server || link.name || '').trim().toLowerCase()
    if (skipExistingServer && serverKey && usedServers.has(serverKey)) return

    const key = `${serverKey}:${link.url}`.toLowerCase()
    if (!linksByKey.has(key)) {
      linksByKey.set(key, { ...link, playableType: getPlayableType(link.url) })
      if (serverKey) usedServers.add(serverKey)
    }
  }

  streams.forEach((link) => addLink(link))
  fallbackStreams.forEach((link) => addLink(link))
  downloads.forEach((link) => addLink(link, { skipExistingServer: true }))

  return [...linksByKey.values()]
}

function getPosterStyle(anime) {
  const image = anime?.image || anime?.backdrop
  if (image) return { backgroundImage: `url("${image}")` }

  const title = anime?.title || 'Anime'
  const index = [...title].reduce((total, character) => total + character.charCodeAt(0), 0) % POSTER_GRADIENTS.length
  const accent = anime?.accentColor
  if (accent) {
    return {
      backgroundImage: `linear-gradient(135deg, ${accent} 0%, #101315 52%, #0f766e 100%)`,
    }
  }

  return { backgroundImage: POSTER_GRADIENTS[index] }
}

function getFranchiseName(title = '') {
  const normalized = title.toString().trim()
  const rule = FRANCHISE_RULES.find((item) => item.test.test(normalized))
  if (rule) return rule.name

  return normalized
    .replace(/\s+(season|movie|film|ova|ona|special|especial)\b.*$/i, '')
    .split(':')[0]
    .split(' - ')[0]
    .trim()
}

const NSFW_REGEX = /\b(uchi no otouto|mankitsu|kuroinu|boku to misaki|shoujo ramune|euphoria|resort boin|kanojo x kanojo x kanojo|dropout|bible black|seikatsu shuukan|sora no iro|discipline|enjo kouhai|jk bitch|chikan|mako-chan|seishoujo|chizuru-chan|ero|hentai|porno|boin|overflow|yosuga no sora|maki-chan|otome dori|kansen|bitch|kyonyuu|incest|fela pure|tsuma|netorare|ntr)\b/i

function isHentaiItem(item) {
  const title = (item?.title || '').toString().toLowerCase()
  return NSFW_REGEX.test(title)
}

function isMovieItem(item) {
  const type = (item?.type || '').toString().toLowerCase()
  const title = (item?.title || '').toString().toLowerCase()

  return (
    /\b(movie|pel[ií]cula|film|ova|ona|special|especial)\b/i.test(type) ||
    /\b(movie|pel[ií]cula|film)\b/i.test(title)
  )
}

function filterContentItems(items, contentFilter) {
  if (contentFilter === 'hentai') return items.filter(isHentaiItem)
  if (contentFilter === 'movies') return items.filter(isMovieItem)
  if (contentFilter === 'series') return items.filter((item) => !isMovieItem(item))
  return items
}

function groupAnimeItems(items) {
  const groups = new Map()

  for (const item of items) {
    const name = getFranchiseName(item.title)
    const key = name.toLowerCase()
    const current = groups.get(key) || {
      id: key,
      name,
      items: [],
      image: item.image,
      backdrop: item.backdrop,
      accentColor: item.accentColor,
    }

    current.items.push(item)
    current.image ||= item.image
    current.backdrop ||= item.backdrop
    current.accentColor ||= item.accentColor
    groups.set(key, current)
  }

  return [...groups.values()].sort((left, right) => {
    const countSort = right.items.length - left.items.length
    if (countSort) return countSort

    const leftHasArtwork = left.image || left.backdrop ? 1 : 0
    const rightHasArtwork = right.image || right.backdrop ? 1 : 0
    if (leftHasArtwork !== rightHasArtwork) return rightHasArtwork - leftHasArtwork

    return left.name.localeCompare(right.name)
  })
}

function getPosterClassName(item) {
  return `poster-art ${item?.image || item?.backdrop ? 'has-artwork' : 'missing-artwork'}`
}

function randomItem(items) {
  if (!items.length) return null
  return items[Math.floor(Math.random() * items.length)]
}

function Player({ source, initialTime = 0, onTimeUpdate }) {
  const videoRef = useRef(null)
  const type = source ? source.playableType : null
  const initialTimeAppliedRef = useRef(null)

  useEffect(() => {
    if (source?.url) {
      initialTimeAppliedRef.current = source.url
    }
  }, [source])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !source?.url || type !== 'hls') return undefined

    const applyInitialTime = () => {
      if (initialTimeAppliedRef.current === source.url && initialTime > 0) {
        video.currentTime = initialTime
        initialTimeAppliedRef.current = null
      }
    }

    video.addEventListener('loadedmetadata', applyInitialTime)
    video.addEventListener('canplay', applyInitialTime)

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source.url
      return () => {
        video.removeEventListener('loadedmetadata', applyInitialTime)
        video.removeEventListener('canplay', applyInitialTime)
      }
    }

    if (!Hls.isSupported()) return undefined

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    })
    hls.loadSource(source.url)
    hls.attachMedia(video)

    return () => {
      hls.destroy()
      video.removeEventListener('loadedmetadata', applyInitialTime)
      video.removeEventListener('canplay', applyInitialTime)
    }
  }, [source, type])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !source?.url || type === 'iframe') return undefined

    const applyInitialTime = () => {
      if (initialTimeAppliedRef.current === source.url && initialTime > 0) {
        video.currentTime = initialTime
        initialTimeAppliedRef.current = null
      }
    }

    const handleTimeUpdate = () => {
      if (onTimeUpdate) {
        onTimeUpdate(video.currentTime)
      }
    }

    video.addEventListener('loadedmetadata', applyInitialTime)
    video.addEventListener('canplay', applyInitialTime)
    video.addEventListener('timeupdate', handleTimeUpdate)

    return () => {
      video.removeEventListener('loadedmetadata', applyInitialTime)
      video.removeEventListener('canplay', applyInitialTime)
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [source, type, onTimeUpdate])

  if (!source) {
    return (
      <div className="player-empty">
        <Film size={34} />
        <span>Elige un episodio y un servidor para reproducir.</span>
      </div>
    )
  }

  if (type === 'hls') {
    return <video ref={videoRef} className="video" controls playsInline />
  }

  if (type === 'video') {
    return <video ref={videoRef} className="video" src={source.url} controls playsInline />
  }

  if (type === 'iframe') {
    return (
      <iframe
        className="video"
        title={source.name || 'Servidor de video'}
        src={source.url}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />
    )
  }

  return (
    <div className="player-empty">
      <ExternalLink size={34} />
      <span>Este servidor abre fuera del reproductor integrado.</span>
      <a className="primary-link" href={source.url} target="_blank" rel="noreferrer">
        Abrir servidor
      </a>
    </div>
  )
}

function StatusMessage({ state, children }) {
  if (!children) return null

  const Icon = state === 'error' ? AlertCircle : CheckCircle2
  return (
    <div className={`status ${state}`}>
      <Icon size={18} />
      <span>{children}</span>
    </div>
  )
}

function App() {
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('')
  const [catalogRows, setCatalogRows] = useState([])
  const [featuredAnime, setFeaturedAnime] = useState(null)
  const [results, setResults] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [selectedContentFilter, setSelectedContentFilter] = useState('all')
  const [selectedAnime, setSelectedAnime] = useState(null)
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [activeModal, setActiveModal] = useState(null)
  const [animeInfo, setAnimeInfo] = useState(null)
  const [selectedEpisode, setSelectedEpisode] = useState(null)
  const [episodeData, setEpisodeData] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState('SUB')
  const [selectedSource, setSelectedSource] = useState(null)
  const [loading, setLoading] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [downloadQueue, setDownloadQueue] = useState([])
  const [currentDownloadIndex, setCurrentDownloadIndex] = useState(-1)
  const [isDownloading, setIsDownloading] = useState(false)
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem('animeviewer-theme') || 'dark'
  })

  const [watchProgress, setWatchProgress] = useState(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(window.localStorage.getItem('animeviewer-progress') || '{}')
    } catch {
      return {}
    }
  })

  const [watchedEpisodes, setWatchedEpisodes] = useState(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(window.localStorage.getItem('animeviewer-watched') || '{}')
    } catch {
      return {}
    }
  })

  const [favorites, setFavorites] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(window.localStorage.getItem('animeviewer-favorites') || '[]')
    } catch {
      return []
    }
  })

  const lastSavedTimeRef = useRef(0)

  const updateWatchProgress = (episodeUrl, time) => {
    if (!episodeUrl) return
    if (Math.abs(lastSavedTimeRef.current - time) < 3) return
    lastSavedTimeRef.current = time
    setWatchProgress((prev) => {
      const next = { ...prev, [episodeUrl]: time }
      window.localStorage.setItem('animeviewer-progress', JSON.stringify(next))
      return next
    })
  }

  const toggleFavorite = (anime) => {
    if (!anime) return
    setFavorites((prev) => {
      const exists = prev.some((item) => item.url === anime.url)
      let next
      if (exists) {
        next = prev.filter((item) => item.url !== anime.url)
      } else {
        next = [
          ...prev,
          {
            title: anime.title || anime.name,
            image: anime.image,
            backdrop: anime.backdrop,
            url: anime.url,
            type: anime.type,
            year: anime.year,
            status: anime.status,
          },
        ]
      }
      window.localStorage.setItem('animeviewer-favorites', JSON.stringify(next))
      return next
    })
  }

  const animeRequestRef = useRef(0)
  const episodeRequestRef = useRef(0)
  const downloadPollRef = useRef(null)
  const downloadAbortRef = useRef(false)
  const isLightTheme = themeMode === 'light'

  const episodeLinks = useMemo(
    () => getAllEpisodeLinks(episodeData, selectedVariant),
    [episodeData, selectedVariant],
  )

  const filteredResults = useMemo(
    () => filterContentItems(results, selectedContentFilter),
    [results, selectedContentFilter],
  )
  const searchGroups = useMemo(() => groupAnimeItems(filteredResults), [filteredResults])
  const catalogGroupRows = useMemo(
    () =>
      catalogRows
        .map((row) => {
          const items = filterContentItems(row.items, selectedContentFilter)
          return {
            ...row,
            items,
            groups: groupAnimeItems(items),
          }
        })
        .filter((row) => row.items.length),
    [catalogRows, selectedContentFilter],
  )
  const heroAnime = activeHero(
    selectedContentFilter === 'all' ? featuredAnime : null,
    catalogGroupRows,
  )
  const categoryOptions = useMemo(
    () => [
      { value: ALL_CATEGORIES, label: 'Todas las categorías' },
      ...(filteredResults.length ? [{ value: SEARCH_CATEGORY, label: 'Resultados de búsqueda' }] : []),
      ...catalogGroupRows.map((row) => ({ value: row.title, label: row.title })),
    ],
    [catalogGroupRows, filteredResults.length],
  )
  const effectiveCategory = categoryOptions.some((option) => option.value === selectedCategory)
    ? selectedCategory
    : ALL_CATEGORIES
  const visibleCatalogRows = useMemo(() => {
    if (effectiveCategory === ALL_CATEGORIES) return catalogGroupRows
    return catalogGroupRows.filter((row) => row.title === effectiveCategory)
  }, [catalogGroupRows, effectiveCategory])
  const showSearchResults = filteredResults.length > 0 && (effectiveCategory === ALL_CATEGORIES || effectiveCategory === SEARCH_CATEGORY)

  useEffect(() => {
    window.localStorage.setItem('animeviewer-theme', themeMode)
  }, [themeMode])

  useEffect(() => {
    let ignore = false

    async function loadCatalog() {
      setLoading('catalog')
      setError('')
      setCatalogRows([])

      try {
        const params = new URLSearchParams()
        if (!API_KEY) params.set('apiKey', 'local-dev')
        const payload = await apiRequest(`/api/v1/anime/catalog?${params.toString()}`)
        const rows = payload?.data?.rows || []
        if (ignore) return

        setCatalogRows(rows)
        const candidates = rows.flatMap((row) => row.items || [])
        setFeaturedAnime(randomItem(candidates.filter((item) => item.backdrop || item.image)) || randomItem(candidates))
      } catch (requestError) {
        if (!ignore) setError(requestError.message)
      } finally {
        if (!ignore) setLoading('')
      }
    }

    loadCatalog()

    return () => {
      ignore = true
    }
  }, [])

  async function searchAnime(event) {
    event?.preventDefault()
    const cleanQuery = query.trim()

    setLoading('search')
    setError('')
    setMessage('')
    setResults([])
    setSelectedCategory(ALL_CATEGORIES)
    setSelectedCollection(null)

    if (!cleanQuery) {
      setLoading('')
      return
    }

    try {
      const params = new URLSearchParams({ q: cleanQuery })
      if (provider) params.set('domain', provider)
      params.set('withEpisodes', 'true')
      if (!API_KEY) params.set('apiKey', 'local-dev')

      const payload = await apiRequest(`/api/v1/anime/search?${params.toString()}`)
      const found = await enrichListWithArtwork(payload?.data?.results || [], {
        itemLimit: SEARCH_ARTWORK_LIMIT,
        groupLimit: SEARCH_ARTWORK_LIMIT,
      })
      setResults(found)
      if (found.length) setSelectedCategory(SEARCH_CATEGORY)
      setMessage(found.length ? `${found.length} resultados encontrados.` : 'No encontré resultados.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading('')
    }
  }

  async function loadAnime(anime) {
    const requestId = animeRequestRef.current + 1
    animeRequestRef.current = requestId
    episodeRequestRef.current += 1

    setActiveModal({ type: 'anime' })
    setLoading('info')
    setError('')
    setMessage('')
    setSelectedAnime(anime)
    setAnimeInfo(null)
    setSelectedEpisode(null)
    setEpisodeData(null)
    setSelectedSource(null)

    try {
      const params = new URLSearchParams({ url: anime.url })
      if (!API_KEY) params.set('apiKey', 'local-dev')

      const payload = await apiRequest(`/api/v1/anime/info?${params.toString()}`)
      let info = payload?.data
      const artwork = await fetchArtworkWithFallback(info?.title || anime.title)
      if (artwork) {
        info = {
          ...info,
          image: artwork.image || info?.image || anime.image,
          backdrop: artwork.backdrop || info?.backdrop || anime.backdrop,
          accentColor: artwork.accentColor || info?.accentColor || anime.accentColor,
        }
      }
      if (requestId !== animeRequestRef.current) return

      setAnimeInfo(info)
      setMessage(`${info?.episodes?.length || 0} episodios cargados.`)
    } catch (requestError) {
      if (requestId === animeRequestRef.current) {
        setError(requestError.message)
      }
    } finally {
      if (requestId === animeRequestRef.current) {
        setLoading('')
      }
    }
  }

  async function fetchEpisodeData(episode) {
    const params = new URLSearchParams({
      url: episode.url,
      includeMega: 'false',
    })
    if (!API_KEY) params.set('apiKey', 'local-dev')

    const payload = await apiRequest(`/api/v1/anime/episode?${params.toString()}`)
    return payload?.data
  }

  async function loadEpisode(episode) {
    const requestId = episodeRequestRef.current + 1
    episodeRequestRef.current = requestId

    setLoading('episode')
    setError('')
    setMessage('')
    setSelectedEpisode(episode)
    setWatchedEpisodes((prev) => {
      const next = { ...prev, [episode.url]: true }
      window.localStorage.setItem('animeviewer-watched', JSON.stringify(next))
      return next
    })
    setEpisodeData(null)
    setSelectedSource(null)

    try {
      const data = await fetchEpisodeData(episode)
      const defaultVariant = data?.variants?.SUB ? 'SUB' : data?.variants?.DUB ? 'DUB' : 'SUB'
      const links = getAllEpisodeLinks(data, defaultVariant)
      if (requestId !== episodeRequestRef.current) return

      setSelectedVariant(defaultVariant)
      setEpisodeData(data)
      setSelectedSource(links[0] || null)
      setMessage(links.length ? `${links.length} servidores disponibles.` : 'No hay servidores reproducibles.')
    } catch (requestError) {
      if (requestId === episodeRequestRef.current) {
        setError(requestError.message)
      }
    } finally {
      if (requestId === episodeRequestRef.current) {
        setLoading('')
      }
    }
  }

  function openCollection(collection) {
    animeRequestRef.current += 1
    episodeRequestRef.current += 1

    setSelectedCollection(collection)
    setSelectedAnime(null)
    setAnimeInfo(null)
    setSelectedEpisode(null)
    setEpisodeData(null)
    setSelectedSource(null)
    setActiveModal({ type: 'collection' })
  }

  function closeModal() {
    animeRequestRef.current += 1
    episodeRequestRef.current += 1

    setActiveModal(null)
    setSelectedCollection(null)
    setSelectedAnime(null)
    setAnimeInfo(null)
    setSelectedEpisode(null)
    setEpisodeData(null)
    setSelectedSource(null)
    setMessage('')
  }

  function openDownloadModal() {
    if (!episodes.length) return
    const queue = episodes.map(ep => ({
      episode: ep.number,
      url: ep.url,
      selected: true,
      status: 'pending',
      downloadId: null,
      progress: 0,
      error: null,
    }))
    setDownloadQueue(queue)
    setCurrentDownloadIndex(-1)
    setIsDownloading(false)
    downloadAbortRef.current = false
    setDownloadModalOpen(true)
  }

  function toggleEpisodeSelect(index) {
    if (isDownloading) return
    setDownloadQueue(prev => prev.map((item, idx) =>
      idx === index ? { ...item, selected: !item.selected } : item
    ))
  }

  function selectAllEpisodes() {
    if (isDownloading) return
    setDownloadQueue(prev => prev.map(item => ({ ...item, selected: true })))
  }

  function deselectAllEpisodes() {
    if (isDownloading) return
    setDownloadQueue(prev => prev.map(item => ({ ...item, selected: false })))
  }

  // eslint-disable-next-line no-unused-vars
  function selectRange(start, end) {
    if (isDownloading) return
    setDownloadQueue(prev => prev.map((item, idx) => ({
      ...item,
      selected: idx >= start && idx <= end,
    })))
  }

  function closeDownloadModal() {
    downloadAbortRef.current = true
    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current)
      downloadPollRef.current = null
    }
    setDownloadModalOpen(false)
    setDownloadQueue([])
    setCurrentDownloadIndex(-1)
    setIsDownloading(false)
  }

  async function startDownloadQueue() {
    if (isDownloading) return
    const selectedEpisodes = downloadQueue.filter(e => e.selected)
    if (!selectedEpisodes.length) return

    setIsDownloading(true)
    downloadAbortRef.current = false

    const selectedIndices = downloadQueue
      .map((item, idx) => item.selected ? idx : -1)
      .filter(idx => idx !== -1)

    for (let i = 0; i < selectedIndices.length; i++) {
      if (downloadAbortRef.current) break

      const idx = selectedIndices[i]
      setCurrentDownloadIndex(idx)
      await downloadSingleEpisode(idx)

      if (i < selectedIndices.length - 1 && !downloadAbortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    setIsDownloading(false)
    setCurrentDownloadIndex(-1)
    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current)
      downloadPollRef.current = null
    }
  }

  async function downloadSingleEpisode(index) {
    const episode = downloadQueue[index]
    if (!episode || downloadAbortRef.current) return

    setDownloadQueue(prev => prev.map((item, idx) =>
      idx === index ? { ...item, status: 'downloading', progress: 0 } : item
    ))

    try {
      const params = new URLSearchParams()
      if (!API_KEY) params.set('apiKey', 'local-dev')

      const response = await apiRequest(`/api/v1/anime/download?${params.toString()}`, {
        method: 'POST',
        body: JSON.stringify({
          url: episode.url,
          variant: selectedVariant,
          quality: '1080p',
        }),
      })

      const downloadId = response.data.downloadId
      setDownloadQueue(prev => prev.map((item, idx) =>
        idx === index ? { ...item, downloadId, status: 'downloading' } : item
      ))

      await pollDownloadStatus(downloadId, index)
    } catch (err) {
      setDownloadQueue(prev => prev.map((item, idx) =>
        idx === index ? { ...item, status: 'failed', error: err.message } : item
      ))
    }
  }

  function pollDownloadStatus(downloadId, index) {
    return new Promise((resolve) => {
      const poll = async () => {
        if (downloadAbortRef.current) {
          resolve()
          return
        }

        try {
          const params = new URLSearchParams()
          if (!API_KEY) params.set('apiKey', 'local-dev')

          const response = await apiRequest(`/api/v1/anime/download/${downloadId}?${params.toString()}`)
          const data = response.data

          setDownloadQueue(prev => prev.map((item, idx) =>
            idx === index ? {
              ...item,
              status: data.status === 'completed' ? 'completed' : data.status === 'failed' ? 'failed' : 'downloading',
              progress: data.progress || 0,
              error: data.error,
            } : item
          ))

          if (data.status === 'completed' || data.status === 'failed') {
            if (downloadPollRef.current) {
              clearInterval(downloadPollRef.current)
              downloadPollRef.current = null
            }
            resolve()
          }
        } catch (err) {
          setDownloadQueue(prev => prev.map((item, idx) =>
            idx === index ? { ...item, status: 'failed', error: err.message } : item
          ))
          if (downloadPollRef.current) {
            clearInterval(downloadPollRef.current)
            downloadPollRef.current = null
          }
          resolve()
        }
      }

      poll()
      downloadPollRef.current = setInterval(poll, 2000)
    })
  }

  function stopDownload() {
    downloadAbortRef.current = true
    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current)
      downloadPollRef.current = null
    }
    setIsDownloading(false)
    setCurrentDownloadIndex(-1)
  }

  const modalInfo = animeInfo || selectedAnime || selectedCollection
  const modalOpen = Boolean(activeModal)
  const hasActiveWatch = Boolean(selectedAnime || animeInfo || selectedEpisode || selectedSource)
  const episodes = animeInfo?.episodes || []
  const currentEpisodeIndex = selectedEpisode ? episodes.findIndex((episode) => episode.url === selectedEpisode.url) : -1
  const modalArtwork = animeInfo?.backdrop || animeInfo?.image || selectedAnime?.backdrop || selectedAnime?.image || selectedCollection?.backdrop || selectedCollection?.image || ''

  useEffect(() => {
    if (!modalOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [modalOpen])

  useEffect(() => {
    return () => {
      if (downloadPollRef.current) {
        clearInterval(downloadPollRef.current)
      }
    }
  }, [])

  return (
    <main className="app-shell" data-theme={themeMode}>
      <header className="stream-nav">
        <a className="brand" href="#catalog" aria-label="AnimeViewer inicio">
          <picture>
            <source media="(max-width: 680px)" srcSet="./branding/isologo.png" />
            <img src="./branding/horizontal.png" alt="AnimeViewer" />
          </picture>
        </a>
        <nav className="nav-links" aria-label="Navegacion principal">
          {CONTENT_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={selectedContentFilter === filter.value ? 'active' : ''}
              type="button"
              onClick={() => setSelectedContentFilter(filter.value)}
            >
              {filter.value === 'all' ? 'Inicio' : filter.label}
            </button>
          ))}

        </nav>
        <form className="nav-search" onSubmit={searchAnime}>
          <Search size={18} />
          <input
            aria-label="Buscar anime"
            value={query}
            onChange={(event) => {
              const val = event.target.value
              setQuery(val)
              if (!val.trim()) {
                setResults([])
                setSelectedCategory(ALL_CATEGORIES)
                setMessage('')
                setError('')
              }
            }}
            placeholder="Buscar"
          />
          <select aria-label="Proveedor" value={provider} onChange={(event) => setProvider(event.target.value)}>
            {PROVIDERS.map((item) => (
              <option key={item.value || 'auto'} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={loading === 'search'} title="Buscar">
            {loading === 'search' ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
          </button>
        </form>
        <div className="nav-actions" aria-label="Acciones">
          <button type="button" className="nav-icon" aria-label="Notificaciones" title="Notificaciones">
            <Bell size={18} />
          </button>
          <button
            type="button"
            className="nav-icon"
            onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={isLightTheme ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
            title={isLightTheme ? 'Tema oscuro' : 'Tema claro'}
          >
            {isLightTheme ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button type="button" className="nav-avatar" aria-label="Perfil" title="Perfil">
            <User size={17} />
          </button>
        </div>
      </header>

      <section
        className="hero-stage"
        style={{
          '--hero-image': `url("${heroAnime?.backdrop || heroAnime?.image || ''}")`,
        }}
      >

        <div className="hero-copy">
          <div className="hero-badge">
            <Star size={15} />
            <span>アニメ</span>
            {[heroAnime?.type, heroAnime?.year, heroAnime?.status].filter(Boolean).join(' · ') || 'Estreno destacado'}
          </div>
          <h1>{heroAnime?.title || 'Explora anime sin salir del reproductor'}</h1>
          <p>
            {heroAnime?.description ||
              'Busca una serie, abre su ficha, elige episodio y cambia de servidor desde una interfaz pensada para mirar, no para pelearse con endpoints.'}
          </p>
          <div className="hero-actions">
            <button className="button primary" type="button" onClick={() => heroAnime && loadAnime(heroAnime)} disabled={!heroAnime}>
              <Play size={20} />
              Ver ficha
            </button>
            <a className="button ghost" href="#catalog">
              Explorar catalogo
            </a>
          </div>
        </div>
      </section>

      <div className="app-status">
        <StatusMessage state={error ? 'error' : 'ok'}>{error || message}</StatusMessage>
        {loading === 'catalog' ? (
          <div className="status ok">
            <Loader2 className="spin" size={18} />
            <span>Cargando catalogo...</span>
          </div>
        ) : null}
      </div>

      <section className="catalog" id="catalog">
        <div className="catalog-toolbar">
          <div className="content-filter" aria-label="Filtrar contenido">
            {CONTENT_FILTERS.map((filter) => (
              <button
                key={filter.value}
                className={selectedContentFilter === filter.value ? 'active' : ''}
                type="button"
                onClick={() => setSelectedContentFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="category-filter">
            <label htmlFor="category-select">Categoría</label>
            <select
              id="category-select"
              aria-label="Seleccionar categoría"
              value={effectiveCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {favorites.length > 0 && effectiveCategory === ALL_CATEGORIES && (
          <TitleRow
            title="Mis Favoritos"
            items={favorites}
            selectedAnime={selectedAnime}
            onSelect={loadAnime}
          />
        )}

        {showSearchResults ? (
          <GroupRow
            title="Resultados de busqueda"
            groups={searchGroups}
            selectedCollection={selectedCollection}
            onSelect={openCollection}
          />
        ) : null}

        {visibleCatalogRows.map((row) => (
          <GroupRow
            key={row.title}
            title={row.title}
            groups={row.groups}
            selectedCollection={selectedCollection}
            onSelect={openCollection}
          />
        ))}
      </section>

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section className={`details-modal ${hasActiveWatch ? 'watching' : ''}`} role="dialog" aria-modal="true" aria-label={modalInfo?.title || modalInfo?.name || 'Detalle'} onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={closeModal} aria-label="Cerrar">
              ×
            </button>
            {!hasActiveWatch && (
              <div
                className="modal-hero"
                style={{
                  '--modal-image': `url("${modalArtwork}")`,
                  '--modal-poster': `url("${animeInfo?.image || selectedAnime?.image || selectedCollection?.image || modalArtwork}")`,
                }}
              >
                <div className="modal-poster-preview" aria-hidden="true">
                  <span>{activeModal.type === 'collection' ? selectedCollection?.name : animeInfo?.title || selectedAnime?.title}</span>
                </div>
                <div className="modal-copy">
                  <p className="eyebrow">{activeModal.type === 'collection' ? 'Coleccion' : [modalInfo?.type, modalInfo?.year, modalInfo?.status].filter(Boolean).join(' · ') || 'Detalle'}</p>
                  <h2>{modalInfo?.title || modalInfo?.name || 'Anime'}</h2>
                  <p>
                    {animeInfo?.description ||
                      (activeModal.type === 'collection'
                        ? `${selectedCollection?.items.length || 0} titulos relacionados disponibles.`
                        : 'Carga la ficha para ver episodios y servidores disponibles.')}
                  </p>
                  {selectedAnime && (
                    <div className="modal-actions-bar">
                      <button
                        type="button"
                        className={`favorite-btn ${favorites.some(fav => fav.url === selectedAnime.url) ? 'active' : ''}`}
                        onClick={() => toggleFavorite(selectedAnime)}
                      >
                        <Heart size={15} fill={favorites.some(fav => fav.url === selectedAnime.url) ? 'currentColor' : 'none'} />
                        <span>
                          {favorites.some(fav => fav.url === selectedAnime.url) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                        </span>
                      </button>
                    </div>
                  )}
                  <div className="modal-summary">
                    {animeInfo?.totalEpisodes ? <span>{animeInfo.totalEpisodes} episodios</span> : null}
                    {selectedEpisode ? <span>Ep. {selectedEpisode.number}</span> : null}
                    {selectedSource ? <span>{STREAM_TYPES[selectedSource.playableType]}</span> : null}
                    {loading === 'info' ? <Loader2 className="spin" size={20} /> : null}
                  </div>
                </div>
              </div>
            )}

            <div className="modal-body">
              {hasActiveWatch ? (
                <div className="watch-layout">
                  <div className="player-stack">
                    <div className="player-frame">
                      <Player
                        source={selectedSource}
                        initialTime={watchProgress[selectedEpisode?.url] || 0}
                        onTimeUpdate={(time) => updateWatchProgress(selectedEpisode?.url, time)}
                      />
                    </div>
                  </div>

                  <aside className="watch-sidebar">
                    <section className="panel flat watch-details-panel">
                      <div className="watch-anime-meta">
                        <div className="mini-poster-preview" style={{ backgroundImage: `url("${animeInfo?.image || selectedAnime?.image || modalArtwork}")` }} />
                        <div className="watch-anime-info">
                          <p className="eyebrow">{[modalInfo?.type, modalInfo?.year, modalInfo?.status].filter(Boolean).join(' · ')}</p>
                          <h2>{modalInfo?.title || modalInfo?.name}</h2>
                          {selectedAnime && (
                            <button
                              type="button"
                              className={`favorite-btn compact ${favorites.some(fav => fav.url === selectedAnime.url) ? 'active' : ''}`}
                              onClick={() => toggleFavorite(selectedAnime)}
                            >
                              <Heart size={13} fill={favorites.some(fav => fav.url === selectedAnime.url) ? 'currentColor' : 'none'} />
                              <span>{favorites.some(fav => fav.url === selectedAnime.url) ? 'Quitar Favorito' : 'Favorito'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="watch-anime-description">
                        {animeInfo?.description || 'Cargando descripción...'}
                      </p>
                    </section>

                    <section className="panel flat episode-panel">
                      <div className="panel-title">
                        <Film size={18} />
                        <h3>Episodios</h3>
                        {loading === 'info' ? <Loader2 className="spin" size={16} /> : null}
                      </div>
                      <div className="sidebar-hint">
                        {selectedEpisode ? `Viendo episodio ${selectedEpisode.number}` : `${episodes.length || 0} episodios disponibles`}
                      </div>
                      {animeInfo?.episodes?.length ? (
                        <>
                          <div className="episode-picker compact-picker">
                            <button
                              className="episode-step"
                              type="button"
                              onClick={() => currentEpisodeIndex > 0 && loadEpisode(episodes[currentEpisodeIndex - 1])}
                              disabled={currentEpisodeIndex <= 0 || loading === 'episode'}
                              aria-label="Episodio anterior"
                              title="Episodio anterior"
                            >
                              <ChevronLeft size={18} />
                            </button>

                            <select
                              aria-label="Seleccionar episodio"
                              className="episode-select"
                              value={selectedEpisode?.url || ''}
                              onChange={(event) => {
                                const nextEpisode = episodes.find((episode) => episode.url === event.target.value)
                                if (nextEpisode) loadEpisode(nextEpisode)
                              }}
                            >
                              <option value="" disabled>
                                Selecciona episodio
                              </option>
                              {episodes.map((episode) => (
                                <option key={episode.url} value={episode.url}>
                                  Episodio {episode.number}
                                </option>
                              ))}
                            </select>

                            <button
                              className="episode-step"
                              type="button"
                              onClick={() => currentEpisodeIndex >= 0 && currentEpisodeIndex < episodes.length - 1 && loadEpisode(episodes[currentEpisodeIndex + 1])}
                              disabled={currentEpisodeIndex < 0 || currentEpisodeIndex >= episodes.length - 1 || loading === 'episode'}
                              aria-label="Episodio siguiente"
                              title="Episodio siguiente"
                            >
                              <ChevronRight size={18} />
                            </button>

                            <span className="episode-count">
                              {currentEpisodeIndex >= 0 ? `${currentEpisodeIndex + 1} / ${episodes.length}` : `${episodes.length} disponibles`}
                            </span>
                          </div>
                          <div className="episode-list" aria-label="Lista de episodios">
                            {episodes.map((episode) => (
                              <button
                                key={episode.url}
                                className={`${selectedEpisode?.url === episode.url ? 'active' : ''} ${watchedEpisodes[episode.url] ? 'watched' : ''}`}
                                type="button"
                                onClick={() => loadEpisode(episode)}
                                disabled={loading === 'episode'}
                              >
                                <span>Ep. {episode.number}</span>
                                <small>
                                  {selectedEpisode?.url === episode.url
                                    ? 'Reproduciendo'
                                    : watchedEpisodes[episode.url]
                                      ? '✓ Visto'
                                      : 'Disponible'}
                                </small>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="panel-empty">
                          {loading === 'info' ? 'Cargando episodios...' : 'No hay episodios disponibles para esta ficha.'}
                        </p>
                      )}

                      {episodes.length > 0 && (
                        <div className="download-section">
                          <button
                            className="download-btn"
                            type="button"
                            onClick={openDownloadModal}
                            disabled={isDownloading}
                            title="Abrir panel de descarga"
                          >
                            <Download size={16} />
                            Descargar episodios
                          </button>
                        </div>
                      )}
                    </section>

                    <section className="panel flat server-panel">
                      <div className="panel-title">
                        <Server size={18} />
                        <h3>Servidores</h3>
                        {loading === 'episode' ? <Loader2 className="spin" size={16} /> : null}
                      </div>

                      <div className="server-controls">
                        <div className="variant-tabs compact">
                          {['SUB', 'DUB'].map((variant) => (
                            <button
                              key={variant}
                              className={selectedVariant === variant ? 'active' : ''}
                              type="button"
                              onClick={() => {
                                const links = getAllEpisodeLinks(episodeData, variant)
                                setSelectedVariant(variant)
                                setSelectedSource(links[0] || null)
                              }}
                            >
                              {VARIANT_LABELS[variant] || variant}
                            </button>
                          ))}
                        </div>

                        <div className="server-strip">
                          {episodeLinks.map((link, index) => (
                            <button
                              className={`server-chip ${selectedSource?.url === link.url ? 'active' : ''}`}
                              key={`${link.url}-${index}`}
                              type="button"
                              onClick={() => setSelectedSource(link)}
                            >
                              {link.name || link.server || `Servidor ${index + 1}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  </aside>
                </div>
              ) : null}

              {episodes.length > 0 && !hasActiveWatch && (
                <div className="download-section standalone">
                  <button
                    className="download-btn"
                    type="button"
                    onClick={openDownloadModal}
                    disabled={isDownloading}
                    title="Abrir panel de descarga"
                  >
                    <Download size={16} />
                    Descargar episodios ({episodes.length})
                  </button>
                </div>
              )}

              {selectedCollection?.items?.length && !hasActiveWatch ? (
                <TitleRow
                  title={selectedCollection.name}
                  items={selectedCollection.items}
                  selectedAnime={selectedAnime}
                  onSelect={loadAnime}
                />
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {downloadModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeDownloadModal}>
          <section className="download-modal" role="dialog" aria-modal="true" aria-label="Descargar episodios" onMouseDown={(event) => event.stopPropagation()}>
            <div className="download-modal-header">
              <h3>Descargar episodios - {selectedAnime?.title || 'Anime'}</h3>
              <button className="modal-close" type="button" onClick={closeDownloadModal} aria-label="Cerrar">
                ×
              </button>
            </div>

            <div className="download-modal-controls">
              <div className="download-variant-selector">
                <label>Versión:</label>
                <div className="variant-tabs compact">
                  <button
                    className={selectedVariant === 'SUB' ? 'active' : ''}
                    type="button"
                    onClick={() => !isDownloading && setSelectedVariant('SUB')}
                    disabled={isDownloading}
                  >
                    Subtitulado
                  </button>
                  <button
                    className={selectedVariant === 'DUB' ? 'active' : ''}
                    type="button"
                    onClick={() => !isDownloading && setSelectedVariant('DUB')}
                    disabled={isDownloading}
                  >
                    Doblaje
                  </button>
                </div>
              </div>
              {!isDownloading && (
                <div className="download-select-controls">
                  <button className="select-btn" type="button" onClick={selectAllEpisodes}>Todos</button>
                  <button className="select-btn" type="button" onClick={deselectAllEpisodes}>Ninguno</button>
                </div>
              )}
              <div className="download-summary">
                <span>{downloadQueue.filter(e => e.selected).length} seleccionados</span>
                <span>{downloadQueue.filter(e => e.status === 'completed').length} completados</span>
                <span>{downloadQueue.filter(e => e.status === 'failed').length} fallidos</span>
              </div>
              <div className="download-actions">
                {!isDownloading && downloadQueue.some(e => e.selected && e.status === 'pending') && (
                  <button className="download-start-btn" type="button" onClick={startDownloadQueue}>
                    <Play size={16} />
                    Descargar seleccionados
                  </button>
                )}
                {isDownloading && (
                  <button className="download-stop-btn" type="button" onClick={stopDownload}>
                    <X size={16} />
                    Detener
                  </button>
                )}
              </div>
            </div>

            <div className="download-queue">
              {downloadQueue.map((item, index) => (
                <div
                  key={item.episode}
                  className={`download-item ${item.status} ${currentDownloadIndex === index ? 'current' : ''} ${!item.selected ? 'unselected' : ''}`}
                >
                  <div className="download-item-info">
                    <label className="download-item-checkbox">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleEpisodeSelect(index)}
                        disabled={isDownloading}
                      />
                      <span className="checkmark"></span>
                    </label>
                    <span className="download-item-number">Ep. {item.episode}</span>
                    <span className={`download-item-status ${item.status}`}>
                      {item.status === 'pending' && (item.selected ? 'Pendiente' : 'No seleccionado')}
                      {item.status === 'downloading' && `Descargando... ${item.progress}%`}
                      {item.status === 'completed' && 'Completado'}
                      {item.status === 'failed' && 'Fallido'}
                    </span>
                  </div>
                  {item.status === 'downloading' && (
                    <div className="download-item-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  )}
                  {item.status === 'failed' && item.error && (
                    <div className="download-item-error">{item.error}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <img src="./branding/isologo.png" alt="" />
            <div>
              <strong>AnimeViewer</strong>
              <p>Anime en una interfaz directa, oscura y hecha para llegar rápido al episodio.</p>
            </div>
          </div>
          <div className="footer-links">
            <a href="https://github.com/psy0n3" target="_blank" rel="noreferrer">
              <span>Frontend</span>
              psy0n3
              <ExternalLink size={14} />
            </a>
            <a href="https://github.com/FxxMorgan/anime1v-api" target="_blank" rel="noreferrer">
              <span>Backend</span>
              FxxMorgan anime1v-api
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-disclaimer">
            Disclaimer: Interfaz gráfica (frontend). El contenido y streaming proviene del backend anime1v-api (FxxMorgan). No alojamos ni controlamos el material.
          </p>
          <p className="footer-love">Build experimental mantenida por psy0n3.</p>
        </div>
      </footer>
    </main>
  )
}

function activeHero(featuredAnime, catalogRows) {
  if (featuredAnime) return featuredAnime
  return catalogRows.find((row) => row.items.length)?.items[0] || null
}

function GroupRow({ title, groups, selectedCollection, onSelect }) {
  return (
    <section className="catalog-row">
      <div className="row-title">
        <h2>{title}</h2>
      </div>
      <div className="title-rail">
        {groups.map((group) => (
          <button
            className={`title-card collection-card ${selectedCollection?.id === group.id ? 'active' : ''}`}
            key={group.id}
            type="button"
            onClick={() => onSelect(group)}
          >
            <div className={getPosterClassName(group)} style={getPosterStyle(group)} aria-hidden="true">
              {!(group.image || group.backdrop) && <span>{group.name}</span>}
            </div>
            <span>
              <strong>{group.name}</strong>
              <small>{group.items.length} titulos relacionados</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function TitleRow({ title, items, selectedAnime, onSelect }) {
  return (
    <section className="catalog-row">
      <div className="row-title">
        <h2>{title}</h2>
      </div>
      <div className="title-rail">
        {items.map((anime) => (
          <button
            className={`title-card ${selectedAnime?.url === anime.url ? 'active' : ''}`}
            key={anime.url}
            type="button"
            onClick={() => onSelect(anime)}
          >
            <div className={getPosterClassName(anime)} style={getPosterStyle(anime)} aria-hidden="true">
              {!(anime.image || anime.backdrop) && <span>{anime.title}</span>}
            </div>
            <span>
              <strong>{anime.title}</strong>
              <small>{[anime.type, anime.year].filter(Boolean).join(' · ') || 'Anime'}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default App
