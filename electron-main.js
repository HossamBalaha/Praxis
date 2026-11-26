const {app, BrowserWindow} = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");

const PORT = 3000;
let mainWindow;

function prepareAndStartServer() {
  const standaloneDir = path.join(__dirname, ".next", "standalone");
  const serverPath = path.join(standaloneDir, "server.js");

  // Ensure Next.js static & public assets exist inside .next/standalone
  const staticSrc = path.join(__dirname, ".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  if (fs.existsSync(staticSrc) && !fs.existsSync(staticDest)) {
    fs.cpSync(staticSrc, staticDest, {recursive: true});
  }

  const publicSrc = path.join(__dirname, "public");
  const publicDest = path.join(standaloneDir, "public");
  if (fs.existsSync(publicSrc) && !fs.existsSync(publicDest)) {
    fs.cpSync(publicSrc, publicDest, {recursive: true});
  }

  // Configure and start the Next.js standalone server inside Electron's Node runtime
  process.env.PORT = String(PORT);
  process.env.HOSTNAME = "127.0.0.1";
  process.chdir(standaloneDir);
  require(serverPath);
}

function waitForServer(callback) {
  const client = net.connect({port: PORT, host: "127.0.0.1"}, () => {
    client.end();
    callback();
  });
  client.on("error", () => {
    setTimeout(() => waitForServer(callback), 250);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Praxis",
    icon: path.join(__dirname, ".next", "standalone", "public", "android-chrome-512x512.png"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(() => {
  prepareAndStartServer();
  waitForServer(createWindow);
});

app.on("window-all-closed", () => {
  app.quit();
});
