"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, dialog, Menu } = require("electron");
const { appendFileSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

app.setName("TAIS ABYS");
if (process.env.ABYS_DESKTOP_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.ABYS_DESKTOP_USER_DATA_DIR));
}

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
}

let mainWindow = null;
let serverProcess = null;
let serverPort = null;
let quitting = false;
let logFile = null;

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    if (logFile) appendFileSync(logFile, line, "utf8");
  } catch {
    // Logging must never prevent the desktop application from starting.
  }
}

function parseEnvExample(file) {
  const values = {};
  const content = readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].replace(/\s+#.*$/, "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function getRuntimePaths() {
  const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
  return {
    serverEntry: app.isPackaged
      ? path.join(root, "app-server", "server.js")
      : path.join(root, "desktop", "runtime", "app-server", "server.js"),
    nodeExecutable: app.isPackaged
      ? path.join(root, "node", "node.exe")
      : process.execPath,
    envExample: app.isPackaged
      ? path.join(root, "config", ".env.example")
      : path.join(root, ".env.example"),
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "app.asar", "desktop", "assets", "abys.ico")
      : path.join(root, "desktop", "assets", "abys.ico"),
  };
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitForHealth(port, child, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (child.exitCode !== null) {
        reject(new Error(`Yerel ABYS hizmeti erken kapandı (kod ${child.exitCode}).`));
        return;
      }
      const request = http.get(
        { hostname: "127.0.0.1", port, path: "/api/health", timeout: 1500 },
        (response) => {
          response.resume();
          if (response.statusCode === 200) {
            resolve();
          } else {
            retry();
          }
        }
      );
      request.once("timeout", () => request.destroy());
      request.once("error", retry);
    };
    const retry = () => {
      if (Date.now() - started >= timeoutMs) {
        reject(new Error("Yerel ABYS hizmeti 60 saniye içinde hazır olmadı."));
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  });
}

function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const pid = serverProcess.pid;
  log(`Stopping local service pid=${pid}`);
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
}

async function startServer() {
  const paths = getRuntimePaths();
  const config = parseEnvExample(paths.envExample);
  const required = ["TAIS_DEMO_ADMIN_EMAIL", "TAIS_DEMO_ADMIN_PASSWORD"];
  for (const name of required) {
    if (!config[name]) throw new Error(`${name} .env.example içinde tanımlı değil.`);
  }

  serverPort = await getAvailablePort();
  const userData = app.getPath("userData");
  const dataDirectory = path.join(userData, "data", "abys-db");
  mkdirSync(dataDirectory, { recursive: true });

  const env = {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(serverPort),
    AUTH_COOKIE_SECURE: "false",
    ABYS_DB_DIR: dataDirectory,
    NODE_PATH: path.join(path.dirname(paths.serverEntry), "runtime-modules"),
    AI_POLICY: config.AI_POLICY || "DEMO_DETERMINISTIC",
    TAIS_DEMO_ADMIN_EMAIL: config.TAIS_DEMO_ADMIN_EMAIL,
    TAIS_DEMO_ADMIN_PASSWORD: config.TAIS_DEMO_ADMIN_PASSWORD,
    ALLOW_TAIS_DEMO_BOOTSTRAP: "true",
    ALLOW_TAIS_DEMO_RESET: "true",
    BITRIX24_MODE: config.BITRIX24_MODE || "demo",
  };

  serverProcess = spawn(paths.nodeExecutable, [paths.serverEntry], {
    cwd: path.dirname(paths.serverEntry),
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (chunk) => log(`[service] ${chunk.toString().trimEnd()}`));
  serverProcess.stderr.on("data", (chunk) => log(`[service:error] ${chunk.toString().trimEnd()}`));
  serverProcess.once("exit", (code, signal) => {
    log(`Local service exited code=${code} signal=${signal || "none"}`);
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      if (!process.env.ABYS_DESKTOP_QA_FILE) {
        dialog.showErrorBox(
          "TAIS ABYS hizmet hatası",
          "Yerel ABYS hizmeti beklenmedik biçimde kapandı. Ayrıntılar uygulama günlüklerindedir."
        );
      }
      app.quit();
    }
  });

  log(`Local service started pid=${serverProcess.pid} port=${serverPort}`);
  await waitForHealth(serverPort, serverProcess);
  return { url: `http://127.0.0.1:${serverPort}`, icon: paths.icon };
}

async function runQaIfRequested() {
  const reportPath = process.env.ABYS_DESKTOP_QA_FILE;
  if (!reportPath || !mainWindow) return;
  const config = parseEnvExample(getRuntimePaths().envExample);
  const mode = process.env.ABYS_DESKTOP_QA_MODE || "login";
  const logoSizes = [];
  for (const [width, height] of [
    [1440, 960],
    [1024, 720],
  ]) {
    mainWindow.setSize(width, height);
    await new Promise((resolve) => setTimeout(resolve, 200));
    logoSizes.push(
      await mainWindow.webContents.executeJavaScript(
        `(() => {
          const logo = document.querySelector('img[alt="ABYS"]');
          const rect = logo?.getBoundingClientRect();
          return {
            window: { width: innerWidth, height: innerHeight },
            visible: Boolean(rect && rect.width > 0 && rect.height > 0),
            objectFit: logo ? getComputedStyle(logo).objectFit : null
          };
        })()`,
        true
      )
    );
  }
  const script =
    mode === "login"
      ? `(${async function qaLogin(email, password) {
          const waitFor = async (test, timeout = 30000) => {
            const started = Date.now();
            while (!test()) {
              if (Date.now() - started > timeout) throw new Error("QA timeout");
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          };
          await waitFor(() => document.querySelector("form"));
          const emailInput = document.querySelector('input[name="email"]');
          const passwordInput = document.querySelector('input[name="password"]');
          const setValue = (element, value) => {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value"
            ).set;
            setter.call(element, value);
            element.dispatchEvent(new Event("input", { bubbles: true }));
          };
          setValue(emailInput, email);
          setValue(passwordInput, "yanlis-parola");
          document.querySelector("form").requestSubmit();
          await waitFor(() => document.querySelector('[role="alert"]'));
          const invalidMessage = document.querySelector('[role="alert"]').textContent.trim();
          const retainedEmail = emailInput.value;
          const retainedPassword = passwordInput.value;
          setValue(passwordInput, password);
          document.querySelector("form").requestSubmit();
          await waitFor(() => location.pathname === "/dashboard", 60000);
          const logo = document.querySelector('img[alt="ABYS"]');
          const logoStyle = logo ? getComputedStyle(logo) : null;
          return {
            invalidStatus: invalidMessage.includes("hatalı") ? "passed" : "failed",
            invalidMessage,
            inputsRetained: retainedEmail === email && retainedPassword === "yanlis-parola",
            validStatus: location.pathname === "/dashboard" ? "passed" : "failed",
            dashboardPath: location.pathname,
            logoVisible: Boolean(
              logo && logo.getBoundingClientRect().width > 0 && logo.getBoundingClientRect().height > 0
            ),
            logoObjectFit: logoStyle?.objectFit || null,
            windowSize: { width: innerWidth, height: innerHeight },
          };
        }.toString()})(${JSON.stringify(config.TAIS_DEMO_ADMIN_EMAIL)}, ${JSON.stringify(
          config.TAIS_DEMO_ADMIN_PASSWORD
        )})`
      : `Promise.resolve({ status: "passed", path: location.pathname, title: document.title })`;

  const result = await mainWindow.webContents.executeJavaScript(script, true);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ...result,
        logoSizes,
        servicePid: serverProcess?.pid ?? null,
        servicePort: serverPort,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
  log(`QA report written to ${reportPath}`);
  if (process.env.ABYS_DESKTOP_QA_AUTO_QUIT === "1") app.quit();
}

async function createWindow() {
  const { url, icon } = await startServer();
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: "#f3efe6",
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!navigationUrl.startsWith(url)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadURL(`${url}/login`);
  log(`Desktop window loaded ${mainWindow.webContents.getURL()}`);
  await runQaIfRequested();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("before-quit", () => {
  quitting = true;
  stopServer();
});

app.on("window-all-closed", () => app.quit());

if (lock) {
  app.whenReady().then(async () => {
    const logs = path.join(app.getPath("userData"), "logs");
    mkdirSync(logs, { recursive: true });
    logFile = path.join(logs, "desktop.log");
    log(`TAIS ABYS desktop starting packaged=${app.isPackaged}`);
    try {
      await createWindow();
    } catch (error) {
      log(`Startup failed: ${error?.stack || error}`);
      if (!process.env.ABYS_DESKTOP_QA_FILE) {
        dialog.showErrorBox(
          "TAIS ABYS başlatılamadı",
          error instanceof Error ? error.message : String(error)
        );
      }
      app.quit();
    }
  });
}
