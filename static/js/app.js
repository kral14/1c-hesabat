/* ========================================================
   1C:ENTERPRISE UNIVERSAL REPORT - MAIN APPLICATION BOOTSTRAP
   app.js
   ======================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  // Ensure document editor and detail modals NEVER pop up on clean startup or page reload
  ["pogruzkaDocEditorWindow", "salesDocEditorWindow", "priceDocEditorWindow", "docVersionDiffWindow", "auditJournalWindow", "nomenclatureCardWindow"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  // 1. Initialize Subsystems safely (MdiManager MUST be first for window registry)
  try { MdiManager.init(); } catch (e) { console.error("MdiManager init error:", e); }
  try { SessionManager.init(); } catch (e) { console.error("SessionManager init error:", e); }
  try { await SettingsModal.init(); } catch (e) { console.error("SettingsModal init error:", e); }
  try { await SettingsPresets.init(); } catch (e) { console.error("SettingsPresets init error:", e); }
  try {
    if (window.PeriodPicker && typeof PeriodPicker.restoreSavedPeriod === "function") {
      PeriodPicker.restoreSavedPeriod();
    }
    if (window.OrderAnalysisReport && typeof OrderAnalysisReport.init === "function") {
      OrderAnalysisReport.init();
    }
  } catch (e) { console.error("Period / OrderAnalysis init error:", e); }

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

    if (e.key === "F5" || e.code === "F5") {
      e.preventDefault();
      e.stopPropagation();
      if (window.MdiManager && typeof MdiManager.handleRefresh === "function") {
        MdiManager.handleRefresh();
      } else if (typeof onActionFormirovat === "function") {
        onActionFormirovat();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      MdiManager.createNewReportWindow();
    }
  }, true);

  // Electron IPC listener: F5 triggers in-place refresh without window reload
  if (window.electronAPI && typeof window.electronAPI.onRefresh === "function") {
    window.electronAPI.onRefresh(() => {
      console.log("[Electron IPC] window-hotkey-refresh received! Refreshing active window in place...");
      if (window.MdiManager && typeof MdiManager.handleRefresh === "function") {
        MdiManager.handleRefresh();
      }
    });
  }

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

function openReportDirect() {
  const primaryWin = window.MdiManager?.windows?.["mdiWindow-1"];
  // Əgər əsas hesabat artıq açılıbsa (hətta minimize olunsa da), Dashboard-dan basanda MÜTLƏQ ikincisini açırıq
  if (primaryWin && primaryWin.isOpen) {
    if (window.MdiManager && typeof MdiManager.createNewReportWindow === "function") {
      MdiManager.createNewReportWindow();
      return;
    }
  }
  if (window.MdiManager && typeof MdiManager.openOrRestoreReportWindow === "function") {
    MdiManager.openOrRestoreReportWindow();
  }
}
window.openReportDirect = openReportDirect;

function openOrderAnalysisDirect() {
  const mdi = window.MdiManager || (typeof MdiManager !== "undefined" ? MdiManager : null);
  if (mdi) {
    const primaryWin = document.getElementById("mdiWindow-1");
    if (primaryWin && primaryWin.style.display !== "none") {
      mdi.minimizeWindow("mdiWindow-1");
    }
    mdi.activateWindow("orderAnalysisWindow", {
      title: "Заказы покупателей (Анализ)",
      icon: "🛒"
    });
  } else {
    const win = document.getElementById("orderAnalysisWindow");
    if (win) {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }
  }

  if (window.OrderAnalysisReport && typeof OrderAnalysisReport.openWindow === "function") {
    OrderAnalysisReport.openWindow();
  }
}
window.openOrderAnalysisDirect = openOrderAnalysisDirect;

function switchReportWindow(reportKey) {
  console.log(`[REPORT SWITCH] Switching to report: ${reportKey}`);
  const mdi = window.MdiManager || (typeof MdiManager !== "undefined" ? MdiManager : null);

  if (reportKey === "ЗаказПокупателяАнализ") {
    openOrderAnalysisDirect();
  } else if (reportKey === "ТоварыНаСкладах") {
    const oaWin = document.getElementById("orderAnalysisWindow");
    if (oaWin && oaWin.style.display !== "none") {
      if (mdi) mdi.minimizeWindow("orderAnalysisWindow");
      else oaWin.style.display = "none";
    }
    openReportDirect();
  }

  // Keep all switcher dropdowns in sync
  const s1 = document.getElementById("mainReportSwitcher");
  const s2 = document.getElementById("oaReportSwitcher");
  if (s1) s1.value = reportKey;
  if (s2) s2.value = reportKey;
}
window.switchReportWindow = switchReportWindow;

function openCurrentReportSettings(e) {
  const switcher = document.getElementById("mainReportSwitcher");
  if (switcher && switcher.value === "ЗаказПокупателяАнализ") {
    if (window.OrderAnalysisSettings) {
      OrderAnalysisSettings.open();
      return;
    }
  }
  if (typeof openSettingsModal === "function") {
    openSettingsModal(e);
  }
}
window.openCurrentReportSettings = openCurrentReportSettings;

function executeCurrentReport() {
  const switcher = document.getElementById("mainReportSwitcher");
  if (switcher && switcher.value === "ЗаказПокупателяАнализ") {
    if (window.OrderAnalysisReport) {
      OrderAnalysisReport.generate();
      return;
    }
  }
  if (typeof onActionFormirovat === "function") {
    onActionFormirovat();
  }
}
window.executeCurrentReport = executeCurrentReport;

function openCatalogDirect(catalogName) {
  const catSafe = String(catalogName).replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, "_");
  const winId = `catalogWin_${catSafe}`;
  const winObj = window.MdiManager?.windows?.[winId];
  const existingWin = document.getElementById(winId);

  // Əgər pəncərə artıq açılıbsa (hətta minimize olunsa da), təkrar kliklədikdə dərhal ikincisini / yeni nüsxəsini açırıq
  if ((winObj && winObj.isOpen) || (existingWin && existingWin.dataset && existingWin.dataset.opened === "true")) {
    if (window.MdiManager && typeof MdiManager.createDuplicateCatalogWindow === "function") {
      MdiManager.createDuplicateCatalogWindow(catalogName);
      return;
    }
  }

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
    const openedWin = document.getElementById(winId);
    if (openedWin) openedWin.dataset.opened = "true";
  }
}
window.openCatalogDirect = openCatalogDirect;

function toggleFullScreenApp() {
  maximizeAppWindow();
}

function openJournalDirect(docType) {
  if (window.UniversalJournal && typeof UniversalJournal.openDirect === "function") {
    UniversalJournal.openDirect(docType);
  } else if (typeof openUniversalJournalWindow === "function") {
    openUniversalJournalWindow(docType);
  }
}
window.openJournalDirect = openJournalDirect;

