const { app, BrowserWindow, shell } = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const isDev = !app.isPackaged;
let backendProcess = null;

function getResourcePath(...segments) {
  return isDev ? path.join(app.getAppPath(), ...segments) : path.join(process.resourcesPath, ...segments);
}

function getAppFilePath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function getWritablePath(...segments) {
  return path.join(app.getPath("userData"), ...segments);
}

function findOpenPort(startPort = 3000) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        findOpenPort(startPort + 1).then(resolve, reject);
        return;
      }
      reject(error);
    });
    server.listen(startPort, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForBackend(port, attempts = 80) {
  const url = `http://127.0.0.1:${port}/health`;

  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_error) {
      // Backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Backend did not become ready in time");
}

async function startBackend() {
  const port = await findOpenPort(Number(process.env.ANIMEVIEWER_BACKEND_PORT || 3000));
  const backendEntry = getResourcePath("back", "src", "server.js");
  const storageDir = getWritablePath("storage");
  const downloadsDir = getWritablePath("downloads");
  const artworkDir = path.join(storageDir, "artwork");

  fs.mkdirSync(artworkDir, { recursive: true });
  fs.mkdirSync(downloadsDir, { recursive: true });

  backendProcess = fork(backendEntry, {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DISABLE_AUTH: "true",
      DISABLE_RATE_LIMIT: "true",
      ARTWORK_DIR: artworkDir,
      ARTWORK_INDEX_PATH: path.join(storageDir, "image-cache.json"),
      CATALOG_CACHE_PATH: path.join(storageDir, "catalog-cache.json"),
      DOWNLOADS_DIR: downloadsDir,
    },
    stdio: isDev ? "inherit" : "ignore",
  });

  await waitForBackend(port);
  return port;
}

async function createWindow() {
  const apiPort = await startBackend();
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#101315",
    title: "AnimeViewer",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadFile(getAppFilePath("front", "dist", "index.html"), {
    query: { apiPort: String(apiPort) },
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
