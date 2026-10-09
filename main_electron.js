const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');

let serverProc = null;

function ensureServerRunning() {
  if (app.isPackaged) {
    const serverExe = path.join(process.resourcesPath, 'server_bin', '1c_server.exe');
    if (fs.existsSync(serverExe)) {
      console.log('[Electron] Packaged 1C server işə salınır:', serverExe);
      serverProc = child_process.spawn(serverExe, [], {
        cwd: path.dirname(serverExe),
        windowsHide: true,
        stdio: 'ignore'
      });
      serverProc.on('error', (err) => {
        console.error('[Electron] Server xətası:', err);
      });
    }
  }
}

function stopServer() {
  if (serverProc) {
    try {
      child_process.execSync(`taskkill /F /T /PID ${serverProc.pid}`);
    } catch (e) {}
    serverProc = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 650,
    title: "1C:Предприятие 8.3",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false
    }
  });

  win.maximize();
  win.show();
  win.focus();

  // Prevent internal pages or presets from polluting the main window title bar
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    win.setTitle("1C:Предприятие 8.3");
  });

  // Remove top menu bar for clean native 1C desktop look
  Menu.setApplicationMenu(null);

  // Forward renderer console logs to terminal
  win.webContents.on('console-message', (event, ...args) => {
    let msg = "";
    let src = "";
    let line = "";
    if (typeof event === 'object' && event && event.message !== undefined) {
      msg = event.message;
      src = event.sourceId;
      line = event.lineNumber;
    } else if (args[1] !== undefined) {
      msg = args[1];
      line = args[2];
      src = args[3];
    } else if (args[0] && typeof args[0] === 'object' && args[0].message) {
      msg = args[0].message;
      line = args[0].lineNumber;
      src = args[0].sourceId;
    } else if (typeof args[0] === 'string') {
      msg = args[0];
    }
    console.log(`[Renderer] ${msg} (${src ? path.basename(src) : 'inline'}:${line || ''})`);
  });

  // Enable F5 (Window Refresh), Ctrl+R (Reload) and F12 / Ctrl+Shift+I (DevTools toggle)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // F5: Tell web page to refresh active window in place, and PREVENT Chromium from reloading the whole app!
      if (input.key === 'F5' || input.code === 'F5') {
        event.preventDefault();
        win.webContents.send('window-hotkey-refresh');
        return;
      }

      // Ctrl+R: Full application reload (praqrami yenilemek Ctrl+R olmalidir)
      if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
        win.reload();
        event.preventDefault();
        return;
      }

      // F12 / Ctrl+Shift+I: DevTools
      if (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')) {
        win.webContents.toggleDevTools();
        event.preventDefault();
        return;
      }
    }
  });

  // Window control IPC events from web page titlebar
  ipcMain.on('window-minimize', (event) => {
    const targetWin = BrowserWindow.fromWebContents(event.sender) || win;
    if (targetWin) targetWin.minimize();
  });

  ipcMain.on('window-maximize', (event) => {
    const targetWin = BrowserWindow.fromWebContents(event.sender) || win;
    if (targetWin) {
      if (targetWin.isMaximized()) {
        targetWin.unmaximize();
      } else {
        targetWin.maximize();
      }
    }
  });

  ipcMain.on('window-close', (event) => {
    const targetWin = BrowserWindow.fromWebContents(event.sender) || win;
    if (targetWin) {
      targetWin.close();
    }
    app.quit();
    process.exit(0);
  });

  // Load URL directly without blocking cache manipulations
  const targetUrl = process.env.SERVER_URL || process.argv.find(arg => arg.startsWith('http://') || arg.startsWith('https://')) || 'http://127.0.0.1:5050';
  win.loadURL(targetUrl);

  win.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      win.loadURL(targetUrl);
    }, 1200);
  });

  return win;
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  let mainWin = null;

  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });

  app.whenReady().then(() => {
    ensureServerRunning();
    mainWin = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWin = createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    stopServer();
  });
}
