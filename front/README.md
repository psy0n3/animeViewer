# Anime Viewer

Front en React + Vite para consumir `FxxMorgan/anime1v-api`.

## Requisitos

- Node.js 18+
- Backend `anime1v-api` corriendo localmente

## Configuracion

```bash
cp .env.example .env
npm install
npm run dev
```

Variables disponibles:

```bash
VITE_API_BASE_URL=
VITE_API_PORT=3000
VITE_API_KEY=
VITE_ENABLE_LOCAL_ARTWORK=true
```

Si `VITE_API_BASE_URL` queda vacio, el front calcula la API con el mismo host donde se abrio la app. Por ejemplo, si el front corre en `http://127.0.0.1:5174`, usara `http://127.0.0.1:3000`. Si lo abres desde otra IP local, mantiene esa IP y cambia solo al puerto `VITE_API_PORT`.

Si el backend corre sin `DISABLE_AUTH=true`, define `VITE_API_KEY` con una key valida. En modo local, el front tambien envia `apiKey=local-dev` cuando no hay `VITE_API_KEY`.

## Backend

```bash
git clone https://github.com/FxxMorgan/anime1v-api
cd anime1v-api
npm install
DISABLE_AUTH=true npm start
```

La app permite buscar anime, cargar ficha, listar episodios y reproducir servidores devueltos por la API. Usa `hls.js` para streams `.m3u8`, video nativo para MP4/WebM y `iframe` para embeds.

Las portadas y banners se piden al backend por `/api/v1/artwork`. El backend consulta AniList solo cuando falta cache local, descarga los archivos a `back/storage/artwork/` y luego devuelve URLs locales. Puedes desactivar este enriquecimiento en el front con `VITE_ENABLE_LOCAL_ARTWORK=false`.
