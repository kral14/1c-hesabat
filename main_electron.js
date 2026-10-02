const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 650,
    title: "1C:Предприятие 8.3 - Товары на складах",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false
    }
  });

  // Always open maximized
  win.maximize();

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

  // Enable F5, Ctrl+R (Reload) and F12 / Ctrl+Shift+I (DevTools toggle)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) {
        win.reload();
        event.preventDefault();
      }
      if (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')) {
        win.webContents.toggleDevTools();
        event.preventDefault();
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
    } else {
      app.quit();
    }
  });

  win.webContents.session.clearCache().finally(() => {
    win.loadURL('http://127.0.0.1:5050');
  });

  win.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      win.loadURL('http://127.0.0.1:5050');
    }, 1200);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
