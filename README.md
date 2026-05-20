<div align="center">
  <img src="branding/horizontal.png" alt="AnimeViewer Logo" width="400"/>

  # AnimeViewer

  [![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)](https://react.dev/)
  [![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
  [![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  [![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

  *Una interfaz web moderna estilo streaming para explorar catálogos de anime, abrir fichas, cambiar servidores y descargar contenido desde un backend local.*
</div>

---

**AnimeViewer** está pensado como una experiencia **full-stack**: un frontend React/Vite con branding propio, modo claro/oscuro, catálogo enriquecido con portadas y un backend Express que centraliza scraping, artwork, caché y descargas.

## Características

- **Catálogo Enriquecido**: Navegación por filas y colecciones, con portadas y banners cacheados de alta calidad.
- **Búsqueda Multi-proveedor**: Busca contenido a través de *AnimeAV1, AnimeFLV, TioAnime, JKAnime y MonosChinos*.
- **Filtros Reales**: Filtra contenido fácilmente entre *Todo, Series y Películas*.
- **Modal de Detalle Inmersivo**: Hero visual, póster de la serie, reproductor y lista lateral de episodios y servidores.
- **Reproductor Integrado**: Soporte completo para HLS (mediante `hls.js`), video directo e iframes.
- **Selector de Servidores**: Elige tu opción preferida de servidores y variantes SUB/DUB.
- **Cola de Descargas**: Descarga episodios directamente usando `ffmpeg-static` y `fluent-ffmpeg`.
- **Tema Persistente**: Modo Claro y Oscuro adaptativo, guardado en `localStorage`.
- **Docker-Ready**: Infraestructura lista para levantar frontend, backend, caché y descargas con un solo comando.

## Stack Tecnológico

| Capa | Tecnología |
| :--- | :--- |
| **Frontend** | React 19, Vite, hls.js, lucide-react |
| **Backend** | Node.js, Express, Axios, Cheerio, Puppeteer |
| **Media** | ffmpeg-static, fluent-ffmpeg |
| **Infra Local** | Docker Compose, nginx |
| **Caché** | JSON + filesystem local / volúmenes Docker |

## Estructura del repositorio

```text
animeviewer/
├── front/                 # Aplicación React + Vite
├── back/                  # API Express basada en anime1v-api
├── branding/              # Logotipos y arte del proyecto
├── docker-compose.yml     # Orquestación local
├── package.json           # Scripts raíz de desarrollo
└── README.md              # Este archivo
```

## Inicio rápido con Docker

La forma más rápida de ejecutar AnimeViewer es usando Docker.

```bash
# 1. Clonar el repositorio
git clone https://github.com/psy0n3/animeViewer.git
cd animeViewer

# 2. Levantar los contenedores
docker compose up --build
```

> [!TIP]
> **Luego abre tu navegador en:** [http://localhost:8080](http://localhost:8080)

## Build de escritorio local

AnimeViewer puede compilarse como app de escritorio con Electron y empaquetado multiplataforma. Los binarios no se versionan dentro del repositorio porque son archivos grandes y porque cada usuario debe generarlos localmente según su plataforma.

Artefactos generados:

| Plataforma | Arquitectura | Formatos |
| :--- | :--- | :--- |
| macOS | Apple Silicon `arm64` | `.dmg`, `.zip` |
| macOS | Intel `x64` | `.dmg`, `.zip` |
| Windows | `x64` | `.exe`, `.zip` |
| Windows | `arm64` | `.exe`, `.zip` |
| Linux | `x64` | `.AppImage`, `.deb`, `.tar.gz` |
| Linux | `arm64` | `.AppImage`, `.deb`, `.tar.gz` |

Para compilar todos los paquetes localmente:

```bash
npm run install:all
npm run build:electron:all
```

Los archivos quedan en `release/`, carpeta ignorada por Git.

> [!NOTE]
> Esta primera build no está firmada ni notarizada. macOS y Windows pueden mostrar advertencias de seguridad al abrirla.

### ¿Qué levanta Docker Compose?
- `backend`: API Express ejecutándose en el puerto interno `3000`.
- `frontend`: Build optimizado de Vite servido por nginx en el puerto `8080`.
- **Volumen `anime_artwork`**: Caché de catálogo, portadas y banners.
- **Volumen `anime_downloads`**: Tus archivos de video descargados.

## Desarrollo local

Si prefieres ejecutarlo sin Docker para desarrollar:

**1. Instala dependencias globales:**
```bash
npm run install:all
```

**2. Levanta los entornos (en terminales separadas):**
```bash
npm run dev:back   # Levanta la API en http://127.0.0.1:3000
npm run dev:front  # Levanta el Front en http://127.0.0.1:5173
```
*(Si Vite encuentra el puerto ocupado, usará el siguiente disponible).*

### Scripts útiles

| Comando | Descripción |
| :--- | :--- |
| `npm run build` | Compila el frontend para producción. |
| `npm run build:electron:all` | Compila builds desktop para macOS, Windows y Linux. |
| `npm run build:electron:mac` | Compila solo macOS. |
| `npm run build:electron:win` | Compila solo Windows. |
| `npm run build:electron:linux` | Compila solo Linux. |
| `npm run lint` | Ejecuta ESLint en el directorio `front/`. |
| `npm run check:back` | Valida la sintaxis del backend. |
| `npm run update:back`| Actualiza `back/` desde el subtree original. |

## Variables y almacenamiento

El backend soporta las siguientes rutas configurables (ideales para Docker, entorno local o una futura app en Electron):

| Variable | Descripción de Uso |
| :--- | :--- |
| `PORT` | Puerto del backend Express |
| `DISABLE_AUTH` | Desactiva autenticación para entorno local |
| `DISABLE_RATE_LIMIT` | Desactiva rate limit para entorno local |
| `ARTWORK_DIR` | Carpeta local/volumen para portadas y banners |
| `ARTWORK_INDEX_PATH` | Ruta del índice JSON de artwork |
| `CATALOG_CACHE_PATH` | Ruta de caché JSON del catálogo |
| `DOWNLOADS_DIR` | Carpeta de descargas de episodios |

> [!NOTE]
> En modo local, el backend genera el caché en `back/storage/` y guarda las descargas según `DOWNLOADS_DIR`. En Docker, todos estos datos persisten de manera segura en **volúmenes**.

## Flujo de la aplicación

1. **Frontend**: Carga el catálogo base consultando `/api/v1/anime/catalog`.
2. **Backend**: Consulta los distintos proveedores, agrupa resultados, enriquece metadatos e imágenes usando **AniList**.
3. **UI**: Agrupa títulos por franquicia, permite filtrar y presenta una interfaz fluida.
4. **Ficha**: Al abrir un título, se resuelven en tiempo real los episodios y servidores.
5. **Reproducción**: El reproductor usa la mejor estrategia (HLS / video / iframe) dependiendo de la fuente.
6. **Descarga**: La cola resuelve el enlace final del servidor y extrae/procesa el video con FFmpeg hacia tu carpeta local.

## Roadmap

- [x] Empaquetado multiplataforma como app de escritorio con **Electron**.
- [x] Configuración de `userData` nativa para caché y descargas en desktop.
- [ ] Mejorar *code splitting* del frontend para reducir el chunk principal.
- [ ] Añadir tests de integración para filtros, modal y endpoints críticos.
- [ ] Configurar actualizaciones automáticas integradas en escritorio.

## Créditos

- Frontend, integración general y experiencia de usuario: psy0n3
- Backend base / API: [FxxMorgan/anime1v-api](https://github.com/FxxMorgan/anime1v-api)

---

## ⚠️ Disclaimer

> **AnimeViewer no aloja, distribuye ni almacena contenido con derechos de autor.** La aplicación funciona puramente como una interfaz local que consume información y resuelve enlaces disponibles públicamente a través de proveedores de terceros (el backend).
> 
> El uso de esta herramienta recae bajo la estricta **responsabilidad de cada usuario**. Este proyecto no fomenta de ninguna manera la piratería ni pretende reemplazar los servicios de streaming oficiales. 
> 
> Si un contenido está disponible en plataformas legales en tu región, apoyamos y recomendamos encarecidamente utilizar servicios autorizados como Crunchyroll, Netflix, Prime Video, entre otros.
> 
> Si eres titular de derechos y consideras que la naturaleza de este proyecto afecta tus derechos, por favor, abre un issue o contacta directamente al mantenedor para revisar la situación.
