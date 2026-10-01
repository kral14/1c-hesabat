/* ========================================================
   1C:ENTERPRISE UNIVERSAL REPORT - MAIN APPLICATION BOOTSTRAP
   app.js
   ======================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Initialize Subsystems safely (MdiManager MUST be first for window registry)
  try { MdiManager.init(); } catch (e) { console.error("MdiManager init error:", e); }
  try { SessionManager.init(); } catch (e) { console.error("SessionManager init error:", e); }
  try { await SettingsModal.init(); } catch (e) { console.error("SettingsModal init error:", e); }
  try { await SettingsPresets.init(); } catch (e) { console.error("SettingsPresets init error:", e); }

  // 2. Global Hotkey bindings (F5: Formirovat, Ctrl+N: New Window, Pause/Break: Stop Loading)
  document.addEventListener("keydown", (e) => {
    // PAUSE / BREAK KEY -> Stop & cancel any active loading immediately
    if (e.key === "Pause" || e.code === "Pause" || e.key === "Break" || e.code === "PauseBreak") {
      e.preventDefault();
      e.stopPropagation();
      console.log("[KEYBOARD PAUSE] Pause key pressed! Cancelling ongoing 1C operation...");
      if (window.ReportEngine && typeof ReportEngine.cancelReport === "function") {
        ReportEngine.cancelReport();
      }
      if (window.CatalogSelector && typeof CatalogSelector.cancel === "function") {
        CatalogSelector.cancel();
      }
      const overlay = document.getElementById("loadingOverlay");
      if (overlay) overlay.style.display = "none";
      return;
    }

    if (e.key === "F5") {
      e.preventDefault();
      if (window.MdiManager) {
        MdiManager.handleConfirm();
      } else if (typeof onActionFormirovat === "function") {
        onActionFormirovat();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      MdiManager.createNewReportWindow();
    }
  }, true);

  // 3. Close actions dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("actionsDropdownMenu");
    const btn = document.getElementById("btnActionsDropdown");
    if (dropdown && !dropdown.contains(e.target) && btn && !btn.contains(e.target)) {
      dropdown.classList.remove("show");
    }
  });

  console.log("1C Universal Report Engine & MDI Desktop Initialized.");
});

function toggleActionsMenu(e) {
  e.stopPropagation();
  const dropdown = document.getElementById("actionsDropdownMenu");
  if (dropdown) {
    dropdown.classList.toggle("show");
  }
}

function minimizeAppWindow() {
  if (window.electronAPI && typeof window.electronAPI.minimize === "function") {
    window.electronAPI.minimize();
    return;
  }
  if (typeof require !== "undefined") {
    try {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('window-minimize');
      return;
    } catch (e) {}
  }
  fetch("/api/app/minimize", { method: "POST" }).catch(() => {});
}

function maximizeAppWindow() {
  if (window.electronAPI && typeof window.electronAPI.maximize === "function") {
    window.electronAPI.maximize();
    return;
  }
  if (typeof require !== "undefined") {
    try {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('window-maximize');
      return;
    } catch (e) {}
  }
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function closeAppWindow() {
  if (window.electronAPI && typeof window.electronAPI.close === "function") {
    window.electronAPI.close();
    return;
  }
  if (typeof require !== "undefined") {
    try {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('window-close');
      return;
    } catch (e) {}
  }
  fetch("/api/app/close", { method: "POST" }).finally(() => {
    window.close();
  });
}

function confirmCloseWindow() {
  closeAppWindow();
}

function openCatalogDirect(catalogName) {
  const cs = (typeof CatalogSelector !== "undefined") ? CatalogSelector : window.CatalogSelector;
  if (cs) {
    cs.open({
      catalog: catalogName,
      targetInput: null,
      podborMode: false,
      onSelect: (item) => {
        console.log("Selected item:", item);
      }
    });
  }
}

function toggleFullScreenApp() {
  maximizeAppWindow();
}
