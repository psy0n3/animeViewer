# AnimeViewer - Build desktop local

## v0.1.0-beta

Fecha: 2026-05-20  
Rama: `main`  
Estado: build local para pruebas

Esta nota documenta la build desktop local de AnimeViewer. Incluye la aplicacion web, el backend local y el empaquetado para macOS, Windows y Linux, pero los binarios no se distribuyen desde el repositorio.

## Que incluye

- Frontend React/Vite con interfaz tipo streaming.
- Backend Express embebido para resolver catalogo, fichas, episodios, artwork y descargas.
- Busqueda multi-proveedor: AnimeAV1, JKAnime, AnimeFLV, TioAnime y MonosChinos.
- Catalogo inicial amplio con imagenes scrapeadas desde proveedores cuando estan disponibles.
- Cache local para catalogo, artwork y descargas.
- Docker Compose para ejecutar la version web local.
- App Electron con icono propio de AnimeViewer.

## Artefactos generados localmente

Los binarios se generan en `release/`, carpeta ignorada por Git.

| Plataforma | Arquitectura | Archivos |
| :--- | :--- | :--- |
| macOS | `arm64` | `AnimeViewer-0.1.0-beta-mac-arm64.dmg`, `AnimeViewer-0.1.0-beta-mac-arm64.zip` |
| macOS | `x64` | `AnimeViewer-0.1.0-beta-mac-x64.dmg`, `AnimeViewer-0.1.0-beta-mac-x64.zip` |
| Windows | `x64` | `AnimeViewer-0.1.0-beta-win-x64.exe`, `AnimeViewer-0.1.0-beta-win-x64.zip` |
| Windows | `arm64` | `AnimeViewer-0.1.0-beta-win-arm64.exe`, `AnimeViewer-0.1.0-beta-win-arm64.zip` |
| Linux | `x64` | `AnimeViewer-0.1.0-beta-linux-x86_64.AppImage`, `AnimeViewer-0.1.0-beta-linux-amd64.deb`, `AnimeViewer-0.1.0-beta-linux-x64.tar.gz` |
| Linux | `arm64` | `AnimeViewer-0.1.0-beta-linux-arm64.AppImage`, `AnimeViewer-0.1.0-beta-linux-arm64.deb`, `AnimeViewer-0.1.0-beta-linux-arm64.tar.gz` |

Tambien se genera `AnimeViewer-0.1.0-beta-win.exe`, instalador combinado para Windows.

## Instalacion web con Docker

```bash
git clone https://github.com/psy0n3/animeViewer.git
cd animeViewer
docker compose up --build
```

Luego abre:

```text
http://localhost:8080
```

## Compilar desktop localmente

```bash
npm run install:all
npm run build:electron:all
```

Los paquetes quedan en:

```text
release/
```

## Notas conocidas

- Esta build no esta firmada ni notarizada.
- macOS y Windows pueden mostrar advertencias de seguridad al abrir la app.
- La primera carga de catalogo puede tardar algunos segundos porque consulta varios proveedores.
- El catalogo completo y el artwork se cachean localmente despues de la primera ejecucion.

## Siguiente etapa

- Firmar/notarizar macOS.
- Firmar instaladores Windows.
- Evaluar publicacion de releases solo si el proyecto queda revisado legalmente.
- Mejorar code splitting del frontend.
- Agregar pruebas de integracion para catalogo, busqueda y reproduccion.
