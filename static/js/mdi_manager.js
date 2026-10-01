/* ========================================================
   1C:ENTERPRISE MDI (MULTIPLE DOCUMENT INTERFACE) WINDOW MANAGER
   mdi_manager.js
   ======================================================== */

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
window.escapeHtml = escapeHtml;

const MdiManager = {
  windows: {},
  activeWindowId: null,
  topZIndex: 100,
  windowCounter: 1,

  auditStack(trigger) {
    try {
      const list = [];
      Object.values(this.windows).forEach(w => {
        if (w && w.element) {
          list.push({
            id: w.id,
            type: "WINDOW",
            zIndex: parseInt(w.element.style.zIndex) || 0,
            display: w.element.style.display || window.getComputedStyle(w.element).display,
            isOpen: !!w.isOpen,
            isMinimized: !!w.isMinimized
          });
        }
      });

      const modalIds = [
        "valueListModalOverlay",
        "fieldSelectorModalOverlay",
        "operationTypeModalOverlay",
        "settingsRestoreModalOverlay",
        "settingsSaveModalOverlay",
        "loginModalOverlay"
      ];
      modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          list.push({
            id: id,
            type: "MODAL",
            zIndex: parseInt(el.style.zIndex) || 0,
            display: el.style.display || window.getComputedStyle(el).display,
            isOpen: el.classList.contains("active") || el.style.display === "flex",
            isMinimized: false
          });
        }
      });

      list.sort((a, b) => b.zIndex - a.zIndex);
      const visible = list.filter(item => item.display !== "none" && item.isOpen);
      const summary = visible.map((v, i) => `#${i + 1}:${v.id}(z=${v.zIndex})`).join(" > ");
      console.log(`[MDI AUDIT | ${trigger}] Visible (${visible.length}): ${summary || "None"}`);
    } catch (err) {
      console.error("[MDI AUDIT ERROR]", err);
    }
  },

  init() {
    console.log("[MDI INIT] Starting MDI Manager with unified window registry...");
    this.bindGlobalEvents();

    // 1. Primary Report Window (starts hidden so only Dashboard is shown initially)
    const primaryWin = document.getElementById("mdiWindow-1");
    if (primaryWin) {
      this.registerWindow("mdiWindow-1", {
        title: "Товары на складах",
        icon: "📦",
        element: primaryWin,
        isDefault: true,
        startHidden: true
      });
    }

    // 2. Settings Window (starts hidden)
    const settingsWin = document.getElementById("settingsWindowModal");
    if (settingsWin) {
      this.registerWindow("settingsWindowModal", {
        title: "Настройка: Товары на складах",
        icon: "⚙️",
        element: settingsWin,
        isDefault: true,
        isDialog: true,
        startHidden: true,
        closeFn: () => {
          if (typeof closeSettingsModal === "function") closeSettingsModal();
        }
      });
    }

    // 3. Catalog Window (starts hidden)
    const catalogWin = document.getElementById("catalogWindowModal");
    if (catalogWin) {
      this.registerWindow("catalogWindowModal", {
        title: "Справочник: Номенклатура",
        icon: "📋",
        element: catalogWin,
        isDefault: true,
        isDialog: true,
        startHidden: true,
        closeFn: () => {
          if (typeof CatalogSelector !== "undefined" && CatalogSelector.close) CatalogSelector.close();
        }
      });
    }

    // 4. Value List Modal (Список значений - starts hidden)
    const valListEl = document.getElementById("valueListModalOverlay");
    if (valListEl) {
      this.registerWindow("valueListModalOverlay", {
        title: "Список значений",
        icon: "📋",
        element: valListEl,
        isDefault: true,
        isDialog: true,
        isModal: true,
        startHidden: true,
        closeFn: () => {
          if (typeof ValueListModal !== "undefined" && ValueListModal.close) ValueListModal.close();
        }
      });
    }

    // 5. Field Selector Modal (Выбор поля - starts hidden)
    const fieldSelEl = document.getElementById("fieldSelectorModalOverlay");
    if (fieldSelEl) {
      this.registerWindow("fieldSelectorModalOverlay", {
        title: "Выбор поля",
        icon: "🔍",
        element: fieldSelEl,
        isDefault: true,
        isDialog: true,
        isModal: true,
        startHidden: true,
        closeFn: () => {
          if (typeof FieldSelector !== "undefined" && FieldSelector.close) FieldSelector.close();
        }
      });
    }

    // 6. Operation Type Modal (Вид операции - starts hidden)
    const opTypeEl = document.getElementById("operationTypeModalOverlay");
    if (opTypeEl) {
      this.registerWindow("operationTypeModalOverlay", {
        title: "Вид операции",
        icon: "📝",
        element: opTypeEl,
        isDefault: true,
        isDialog: true,
        isModal: true,
        startHidden: true,
        closeFn: () => {
          if (typeof OperationTypeSelector !== "undefined" && OperationTypeSelector.close) OperationTypeSelector.close();
        }
      });
    }

    // 7. Settings Restore Modal (Восстановление настройки - starts hidden)
    const restoreEl = document.getElementById("settingsRestoreModalOverlay");
    if (restoreEl) {
      this.registerWindow("settingsRestoreModalOverlay", {
        title: "Восстановление настройки",
        icon: "📥",
        element: restoreEl,
        isDefault: true,
        isDialog: true,
        isModal: true,
        startHidden: true,
        closeFn: () => {
          if (typeof closeRestoreSettingsModal === "function") closeRestoreSettingsModal();
        }
      });
    }

    // 8. Settings Save Modal (Сохранение настройки - starts hidden)
    const saveEl = document.getElementById("settingsSaveModalOverlay");
    if (saveEl) {
      this.registerWindow("settingsSaveModalOverlay", {
        title: "Сохранение настройки",
        icon: "📤",
        element: saveEl,
        isDefault: true,
        isDialog: true,
        isModal: true,
        startHidden: true,
        closeFn: () => {
          if (typeof closeSaveSettingsModal === "function") closeSaveSettingsModal();
        }
      });
    }

    // 9. Login Modal (Авторизация базы данных - starts hidden)
    const loginEl = document.getElementById("loginModalOverlay");
    if (loginEl) {
      this.registerWindow("loginModalOverlay", {
        title: "Авторизация базы данных",
        icon: "🔄",
        element: loginEl,
        isDefault: true,
        isDialog: true,
        isModal: true,
        startHidden: true,
        closeFn: () => {
          if (typeof closeLoginModal === "function") closeLoginModal();
        }
      });
    }

    // 10. Portfolio Catalog Report Window (Товары по портфелям - starts hidden)
    const pcWin = document.getElementById("portfolioCatalogWindow");
    if (pcWin) {
      this.registerWindow("portfolioCatalogWindow", {
        title: "Товары по портфелям",
        icon: "📋",
        element: pcWin,
        isDefault: true,
        startHidden: true,
        closeFn: () => {
          if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.close) PortfolioCatalog.close();
        }
      });
    }
  },

  registerWindow(id, options = {}) {
    const el = options.element || document.getElementById(id);
    if (!el) return;

    const winObj = {
      id: id,
      title: options.title || "Окно",
      icon: options.icon || "📄",
      element: el,
      isMaximized: false,
      isMinimized: !!options.startHidden,
      isDefault: !!options.isDefault,
      isDialog: !!options.isDialog,
      savedRect: {
        top: el.style.top || "20px",
        left: el.style.left || "20px",
        width: el.style.width || "calc(100% - 40px)",
        height: el.style.height || "calc(100% - 40px)"
      }
    };

    this.windows[id] = winObj;

    // Attach dragging & activation handlers
    this.setupWindowDragging(winObj);

    if (options.startHidden) {
      el.classList.add("minimized");
      el.classList.remove("active");
      el.style.display = "none";
    } else {
      this.createTaskbarTab(winObj);
      this.activateWindow(id);
    }

    // Initial positioning if not set
    if (!el.style.top || el.style.top === "auto") {
      const offset = (Object.keys(this.windows).length - 1) * 28;
      el.style.top = `${20 + offset}px`;
      el.style.left = `${20 + offset}px`;
      el.style.width = "calc(100% - 40px)";
      el.style.height = "calc(100% - 40px)";
    }

    this.updateWindowMenu();
  },

  setupWindowDragging(winObj) {
    const header = winObj.element.querySelector(".mdi-window-header") ||
                   winObj.element.querySelector(".settings-header") ||
                   winObj.element.querySelector(".preset-window-header");
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.onmousedown = (e) => {
      if (e.target.closest(".mdi-win-btn, .window-btn-close, .window-btn-sys")) return;
      if (winObj.isMaximized) return;

      this.activateWindow(winObj.id);
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = winObj.element.getBoundingClientRect();
      const workspaceRect = document.getElementById("mdiWorkspace")?.getBoundingClientRect() || { left: 0, top: 0 };
      initialLeft = rect.left - workspaceRect.left;
      initialTop = rect.top - workspaceRect.top;

      document.onmousemove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // Workspace boundaries
        newLeft = Math.max(0, newLeft);
        newTop = Math.max(0, newTop);

        winObj.element.style.left = `${newLeft}px`;
        winObj.element.style.top = `${newTop}px`;
        if (winObj.savedRect) {
          winObj.savedRect.left = `${newLeft}px`;
          winObj.savedRect.top = `${newTop}px`;
        }
      };

      document.onmouseup = () => {
        isDragging = false;
        document.onmousemove = null;
        document.onmouseup = null;
      };
    };

    // Header double-click toggles maximize/restore
    header.ondblclick = (e) => {
      if (e.target.closest(".mdi-win-btn, .window-btn-close, .window-btn-sys")) return;
      this.toggleMaximize(winObj.id);
    };

    // Clicking anywhere inside window activates it (except control buttons)
    winObj.element.onmousedown = (e) => {
      if (e && e.target && e.target.closest && e.target.closest(".mdi-win-btn, .window-btn-close, .window-btn-sys")) {
        return;
      }
      this.activateWindow(winObj.id);
    };
  },

  createTaskbarTab(winObj) {
    const tabsContainer = document.getElementById("mdiTaskbarTabs");
    if (!tabsContainer) return;

    let tab = document.getElementById(`tab-${winObj.id}`);
    if (!tab) {
      tab = document.createElement("button");
      tab.className = "mdi-taskbar-tab";
      tab.id = `tab-${winObj.id}`;
      tab.innerHTML = `
        <span>${winObj.icon || "📄"}</span>
        <span class="mdi-tab-label">${escapeHtml(winObj.title || "Окно")}</span>
        <span class="mdi-taskbar-tab-close" title="Закрыть">✕</span>
      `;

      tab.onclick = (e) => {
        if (e.target.classList.contains("mdi-taskbar-tab-close")) {
          e.stopPropagation();
          console.log(`[MDI TASKBAR CLOSE] Clicked ✕ on tab #${winObj.id}`);
          this.closeWindow(winObj.id);
          return;
        }
        console.log(`[MDI TASKBAR CLICK] Clicked tab #${winObj.id}`);
        if (this.activeWindowId === winObj.id && !winObj.isMinimized) {
          this.minimizeWindow(winObj.id);
        } else {
          if (winObj.isMinimized) {
            this.restoreFromMinimize(winObj.id);
          }
          this.activateWindow(winObj.id);
        }
      };

      tabsContainer.appendChild(tab);
    }

    winObj.tabElement = tab;
    tab.style.display = "inline-flex";
  },

  activateWindow(id, options = {}) {
    try {
      let winObj = this.windows[id];
      if (!winObj) {
        const el = document.getElementById(id);
        if (el) {
          this.registerWindow(id, {
            title: options.title || "Окно",
            icon: options.icon || "📄",
            element: el,
            isDialog: true,
            closeFn: options.closeFn
          });
          winObj = this.windows[id];
        }
      }
      if (!winObj) {
        console.warn(`[MDI ACTIVATE] Target window #${id} not found!`);
        return;
      }

      if (options.title) winObj.title = options.title;
      if (options.icon) winObj.icon = options.icon;
      if (options.closeFn) winObj.closeFn = options.closeFn;

      // 1. Immediately increment topZIndex and bring this window in front
      this.topZIndex += 10;
      this.activeWindowId = id;

      winObj.isOpen = true;
      winObj.isMinimized = false;
      if (winObj.element) {
        winObj.element.classList.remove("minimized");
        winObj.element.classList.add("active");
        winObj.element.style.display = "flex";
        winObj.element.style.zIndex = this.topZIndex;
      }

      // 2. Deactivate other windows visually
      Object.values(this.windows).forEach(w => {
        if (w.id !== id && w.element) {
          w.element.classList.remove("active");
        }
      });

      // 3. Ensure the taskbar tab exists and is marked active
      try {
        this.createTaskbarTab(winObj);
        if (winObj.tabElement) {
          winObj.tabElement.style.display = "inline-flex";
          winObj.tabElement.classList.add("active");
          const lbl = winObj.tabElement.querySelector(".mdi-tab-label");
          if (lbl && winObj.title) lbl.textContent = winObj.title;
          const iconSpan = winObj.tabElement.querySelector("span:first-child");
          if (iconSpan && winObj.icon) iconSpan.textContent = winObj.icon;
        }

        const tabsContainer = document.getElementById("mdiTaskbarTabs");
        if (tabsContainer) {
          tabsContainer.querySelectorAll(".mdi-taskbar-tab").forEach(t => {
            if (t.id !== `tab-${id}`) t.classList.remove("active");
          });
        }
      } catch (tabErr) {
        console.error("[MDI TASKBAR TAB ERROR]", tabErr);
      }

      console.log(`[MDI ACTIVATE] Window #${id} ("${winObj.title}") -> assigned zIndex = ${this.topZIndex}`);

      this.updateWindowTitlebar(id);
      this.updateWindowMenu();
      this.auditStack("activateWindow: " + id);
    } catch (actErr) {
      console.error("[MDI ACTIVATE FATAL ERROR]", actErr);
    }
  },

  toggleMaximize(id) {
    const winObj = this.windows[id];
    if (!winObj) return;

    if (winObj.isMaximized) {
      this.restoreWindow(id);
    } else {
      this.maximizeWindow(id);
    }
  },

  maximizeWindow(id) {
    const winObj = this.windows[id];
    if (!winObj) return;

    if (!winObj.isMaximized) {
      // Save current floating dimensions
      winObj.savedRect = {
        top: winObj.element.style.top || "20px",
        left: winObj.element.style.left || "20px",
        width: winObj.element.style.width || "calc(100% - 40px)",
        height: winObj.element.style.height || "calc(100% - 40px)"
      };
    }

    winObj.isMaximized = true;
    winObj.isMinimized = false;
    winObj.element.classList.add("maximized");
    winObj.element.classList.remove("minimized");

    const maxBtn = winObj.element.querySelector(".mdi-win-btn-max");
    if (maxBtn) {
      maxBtn.textContent = "🗗";
      maxBtn.title = "Восстановить (Bərpa et)";
    }
    this.activateWindow(id);
  },

  restoreWindow(id) {
    const winObj = this.windows[id];
    if (!winObj) return;

    winObj.isMaximized = false;
    winObj.isMinimized = false;
    winObj.element.classList.remove("maximized");
    winObj.element.classList.remove("minimized");

    // Restore saved rect
    winObj.element.style.top = winObj.savedRect.top || "20px";
    winObj.element.style.left = winObj.savedRect.left || "20px";
    winObj.element.style.width = winObj.savedRect.width || "calc(100% - 40px)";
    winObj.element.style.height = winObj.savedRect.height || "calc(100% - 40px)";

    const maxBtn = winObj.element.querySelector(".mdi-win-btn-max");
    if (maxBtn) {
      maxBtn.textContent = "□";
      maxBtn.title = "Развернуть (Böyüt)";
    }
    this.activateWindow(id);
  },

  minimizeWindow(id) {
    const winObj = this.windows[id];
    if (!winObj) return;

    winObj.isMinimized = true;
    winObj.element.classList.add("minimized");
    winObj.element.classList.remove("active");
    winObj.element.style.display = "none";
    if (winObj.tabElement) winObj.tabElement.classList.remove("active");

    // Ensure taskbar tab is always present when window is minimized
    if (!winObj.tabElement || !document.getElementById(`tab-${winObj.id}`)) {
      this.createTaskbarTab(winObj);
    }

    // Activate the next available floating window if any
    const available = Object.values(this.windows).filter(w => !w.isMinimized && w.id !== id);
    if (available.length > 0) {
      this.activateWindow(available[available.length - 1].id);
    } else {
      this.activeWindowId = null;
      this.updateWindowTitlebar(null);
    }
  },

  restoreFromMinimize(id) {
    const winObj = this.windows[id];
    if (!winObj) return;

    winObj.isMinimized = false;
    winObj.element.classList.remove("minimized");
    winObj.element.style.display = "flex";
    this.activateWindow(id);
  },

  closeWindow(id) {
    console.log(`[MDI CLOSE] Request to close window/modal #${id}`);
    const winObj = this.windows[id];
    if (!winObj) {
      console.warn(`[MDI CLOSE] Window #${id} not found in this.windows`);
      const domEl = document.getElementById(id);
      if (domEl) {
        domEl.style.display = "none";
        domEl.classList.remove("active");
        domEl.classList.add("minimized");
      }
      const domTab = document.getElementById(`tab-${id}`);
      if (domTab) domTab.remove();
      return;
    }

    if (winObj._closing) return;
    winObj._closing = true;

    try {
      // 1. Explicitly mark window as closed and hidden
      winObj.isOpen = false;
      winObj.isMinimized = false;
      if (winObj.element) {
        winObj.element.classList.remove("active");
        winObj.element.classList.add("minimized");
        winObj.element.style.display = "none";
      }

      // 2. Remove tab from bottom taskbar
      if (winObj.tabElement) {
        winObj.tabElement.remove();
        winObj.tabElement = null;
      }
      const domTab = document.getElementById(`tab-${id}`);
      if (domTab) {
        domTab.remove();
      }

      // 3. Call any custom close handler if defined
      if (typeof winObj.closeFn === "function") {
        try { winObj.closeFn(); } catch (err) { console.error("[MDI CLOSE FN ERROR]", err); }
      }

      // 4. Activate next remaining open window ONLY if it is currently open and visible!
      const remaining = Object.values(this.windows).filter(w =>
        w.id !== id &&
        w.isOpen &&
        !w.isMinimized &&
        w.element &&
        w.element.style.display !== "none"
      );

      console.log(`[MDI CLOSE] Closed #${id}. Remaining open windows (${remaining.length}):`, remaining.map(w => `${w.id}(z=${w.element.style.zIndex || 0})`));

      if (remaining.length > 0) {
        remaining.sort((a, b) => (parseInt(b.element.style.zIndex) || 0) - (parseInt(a.element.style.zIndex) || 0));
        const nextWin = remaining[0];
        console.log(`[MDI CLOSE] Reactivating next highest window #${nextWin.id} ("${nextWin.title}")`);
        this.activateWindow(nextWin.id);
      } else {
        this.activeWindowId = null;
        this.updateWindowTitlebar(null);
      }
    } finally {
      winObj._closing = false;
    }

    this.updateWindowMenu();
    this.auditStack("closeWindow: " + id);
  },

  openOrRestoreReportWindow() {
    const primaryWin = this.windows["mdiWindow-1"];
    if (primaryWin) {
      primaryWin.isMinimized = false;
      primaryWin.element.classList.remove("minimized");
      primaryWin.element.style.display = "flex";
      this.activateWindow("mdiWindow-1");
    } else {
      this.createNewReportWindow();
    }
  },

  setWindowTitle(id, title) {
    const winObj = this.windows[id];
    if (!winObj) return;
    winObj.title = title;

    const titleEl = winObj.element.querySelector(".mdi-win-title-text");
    if (titleEl) titleEl.textContent = title;

    if (winObj.tabElement) {
      const lbl = winObj.tabElement.querySelector(".mdi-tab-label");
      if (lbl) lbl.textContent = title;
    }

    if (this.activeWindowId === id) {
      this.updateWindowTitlebar(id);
    }
  },

  updateWindowTitlebar(id) {
    const winObj = this.windows[id];
    const appTitle = document.getElementById("mdiAppWindowTitle");
    if (appTitle) {
      const baseName = SessionManager?.state?.ref || "Aztrade_test3";
      const userName = SessionManager?.state?.user || "Nesib";
      if (winObj) {
        appTitle.textContent = `1С:Предприятие 8.3 - [${winObj.title}] (${baseName} - ${userName})`;
        document.title = `1С:Предприятие 8.3 - [${winObj.title}]`;
      } else {
        appTitle.textContent = `1С:Предприятие 8.3 - (${baseName} - ${userName})`;
        document.title = "1С:Предприятие 8.3";
      }
    }
  },

  /* ----------------------------------------------------
     CREATE SECOND / NEW REPORT WINDOW
     ---------------------------------------------------- */
  createNewReportWindow(presetToLoad = null) {
    this.windowCounter += 1;
    const newId = `mdiWindow-${this.windowCounter}`;
    const workspace = document.getElementById("mdiWorkspace");
    if (!workspace) return;

    // Clone the template or master report window
    const masterWin = document.getElementById("mdiWindow-1");
    if (!masterWin) return;

    const clone = masterWin.cloneNode(true);
    clone.id = newId;
    clone.classList.remove("active", "maximized", "minimized");

    // Clear unique ID collisions in cloned tree
    const suffix = `_${this.windowCounter}`;
    clone.querySelectorAll("[id]").forEach(el => {
      // Don't rename inputs that global handlers specifically target, or append suffix
      el.id = `${el.id}${suffix}`;
    });

    const offset = (Object.keys(this.windows).length) * 30;
    clone.style.top = `${25 + (offset % 180)}px`;
    clone.style.left = `${25 + (offset % 240)}px`;
    clone.style.width = "calc(100% - 60px)";
    clone.style.height = "calc(100% - 60px)";

    workspace.appendChild(clone);

    const winTitle = `Товары на складах (${this.windowCounter})`;
    this.registerWindow(newId, {
      title: winTitle,
      icon: "📦",
      element: clone
    });

    // Wire up child window buttons
    const btnMin = clone.querySelector(".mdi-win-btn-min");
    if (btnMin) btnMin.onclick = () => this.minimizeWindow(newId);

    const btnMax = clone.querySelector(".mdi-win-btn-max");
    if (btnMax) btnMax.onclick = () => this.toggleMaximize(newId);

    const btnClose = clone.querySelector(".mdi-win-btn-close");
    if (btnClose) btnClose.onclick = () => this.closeWindow(newId);

    this.activateWindow(newId);

    // If preset provided, apply it, else generate default
    setTimeout(() => {
      if (typeof onActionFormirovat === "function") {
        onActionFormirovat();
      }
    }, 200);

    return newId;
  },

  /* ----------------------------------------------------
     WINDOW ARRANGEMENT (КАСКАД, РЯДОМ, СВЕРХУ ВНИЗ)
     ---------------------------------------------------- */
  cascadeWindows() {
    const list = Object.values(this.windows).filter(w => !w.isMinimized);
    list.forEach((w, idx) => {
      w.isMaximized = false;
      w.element.classList.remove("maximized");
      const offset = idx * 28;
      w.element.style.top = `${20 + offset}px`;
      w.element.style.left = `${20 + offset}px`;
      w.element.style.width = "calc(100% - 80px)";
      w.element.style.height = "calc(100% - 80px)";
      const maxBtn = w.element.querySelector(".mdi-win-btn-max");
      if (maxBtn) maxBtn.textContent = "□";
    });
    if (list.length > 0) this.activateWindow(list[list.length - 1].id);
  },

  tileHorizontal() {
    const list = Object.values(this.windows).filter(w => !w.isMinimized);
    if (list.length === 0) return;
    const widthPct = (100 / list.length);
    list.forEach((w, idx) => {
      w.isMaximized = false;
      w.element.classList.remove("maximized");
      w.element.style.top = "0px";
      w.element.style.left = `${idx * widthPct}%`;
      w.element.style.width = `${widthPct}%`;
      w.element.style.height = "100%";
      const maxBtn = w.element.querySelector(".mdi-win-btn-max");
      if (maxBtn) maxBtn.textContent = "□";
    });
  },

  tileVertical() {
    const list = Object.values(this.windows).filter(w => !w.isMinimized);
    if (list.length === 0) return;
    const heightPct = (100 / list.length);
    list.forEach((w, idx) => {
      w.isMaximized = false;
      w.element.classList.remove("maximized");
      w.element.style.left = "0px";
      w.element.style.top = `${idx * heightPct}%`;
      w.element.style.width = "100%";
      w.element.style.height = `${heightPct}%`;
      const maxBtn = w.element.querySelector(".mdi-win-btn-max");
      if (maxBtn) maxBtn.textContent = "□";
    });
  },

  closeAllWindows() {
    const ids = Object.keys(this.windows);
    ids.forEach((id, idx) => {
      if (idx > 0) this.closeWindow(id);
    });
  },

  updateWindowMenu() {
    const menuContainer = document.getElementById("mdiWindowsMenuList");
    if (!menuContainer) return;

    menuContainer.innerHTML = `
      <div class="mdi-dropdown-entry" onclick="MdiManager.cascadeWindows()">
        <span>🗔 Каскадом</span>
      </div>
      <div class="mdi-dropdown-entry" onclick="MdiManager.tileHorizontal()">
        <span>🗖 Слева направо (Рядом)</span>
      </div>
      <div class="mdi-dropdown-entry" onclick="MdiManager.tileVertical()">
        <span>🗕 Сверху вниз</span>
      </div>
      <div class="mdi-dropdown-sep"></div>
      <div class="mdi-dropdown-entry" onclick="MdiManager.createNewReportWindow()">
        <span>➕ Открыть еще окно отчета</span>
      </div>
      <div class="mdi-dropdown-entry" onclick="MdiManager.closeAllWindows()">
        <span>✕ Закрыть другие окна</span>
      </div>
      <div class="mdi-dropdown-sep"></div>
    `;

    Object.values(this.windows).forEach((w, idx) => {
      const item = document.createElement("div");
      item.className = "mdi-dropdown-entry";
      const isCurrent = this.activeWindowId === w.id;
      item.innerHTML = `
        <span>${isCurrent ? "✔ " : ""}${idx + 1}. ${escapeHtml(w.title)}</span>
      `;
      item.onclick = () => {
        if (w.isMinimized) this.restoreFromMinimize(w.id);
        this.activateWindow(w.id);
      };
      menuContainer.appendChild(item);
    });
  },

  getNextZIndex() {
    this.topZIndex += 10;
    return this.topZIndex;
  },

  bringModalToFront(modalEl, options = {}) {
    if (!modalEl) return;
    const id = typeof modalEl === "string" ? modalEl : (modalEl.id || "");
    if (!id) return;
    console.log(`[MDI BRING MODAL TO FRONT] Forwarding #${id} to activateWindow`);
    this.activateWindow(id, options);
  },

  createModalTaskbarTab(modalId, title, icon, closeFn) {
    let winObj = this.windows[modalId];
    if (winObj) {
      if (title) winObj.title = title;
      if (icon) winObj.icon = icon;
      if (closeFn) winObj.closeFn = closeFn;
      this.createTaskbarTab(winObj);
    }
  },

  removeModalTaskbarTab(modalId) {
    console.log(`[MDI REMOVE MODAL TAB] Forwarding #${modalId} to closeWindow`);
    this.closeWindow(modalId);
  },

  handleEscape() {
    // 1. Close calendar / date picker if open
    if (typeof OneCCalendar !== "undefined" && OneCCalendar.isOpen && OneCCalendar.isOpen()) {
      OneCCalendar.close();
      return true;
    }
    if (typeof OneCPeriodPicker !== "undefined" && OneCPeriodPicker.isOpen && OneCPeriodPicker.isOpen()) {
      OneCPeriodPicker.close();
      return true;
    }
    const cal = document.getElementById("calendarPickerModal");
    if (cal && cal.style.display !== "none") {
      if (typeof closeDatePicker === "function") closeDatePicker();
      else cal.style.display = "none";
      return true;
    }

    // 2. Close context menus & dropdowns
    const ctxMenu = document.getElementById("reportContextMenu");
    if (ctxMenu && ctxMenu.style.display !== "none") {
      ctxMenu.style.display = "none";
      return true;
    }

    const priceDropdown = document.getElementById("priceTypeDropdownMenu");
    if (priceDropdown && priceDropdown.style.display !== "none") {
      priceDropdown.style.display = "none";
      return true;
    }

    const actionsMenu = document.getElementById("actionsDropdownMenu");
    if (actionsMenu && actionsMenu.classList.contains("show")) {
      actionsMenu.classList.remove("show");
      return true;
    }

    const openMenus = document.querySelectorAll(".mdi-menu-item.open, .mdi-dropdown-menu.show");
    if (openMenus.length > 0) {
      openMenus.forEach(m => m.classList.remove("open", "show"));
      return true;
    }

    // 3. Find and close the topmost active MDI window or Modal (highest z-index)
    const visibleWins = Object.values(this.windows).filter(w =>
      w.isOpen &&
      !w.isMinimized &&
      w.element &&
      w.element.style.display !== "none"
    );

    if (visibleWins.length > 0) {
      visibleWins.sort((a, b) => (parseInt(b.element.style.zIndex) || 0) - (parseInt(a.element.style.zIndex) || 0));
      const topWin = visibleWins[0];
      console.log(`[HOTKEY ESC] Closing topmost window #${topWin.id} ("${topWin.title}", z=${topWin.element.style.zIndex || 0})`);
      this.closeWindow(topWin.id);
      return true;
    }

    return false;
  },

  handleConfirm() {
    // 1. If date/period picker popup is open, close/confirm it
    if (typeof OneCCalendar !== "undefined" && OneCCalendar.isOpen && OneCCalendar.isOpen()) {
      OneCCalendar.close();
      return true;
    }
    if (typeof OneCPeriodPicker !== "undefined" && OneCPeriodPicker.isOpen && OneCPeriodPicker.isOpen()) {
      OneCPeriodPicker.close();
      return true;
    }
    const cal = document.getElementById("calendarPickerModal");
    if (cal && cal.style.display !== "none") {
      if (typeof closeDatePicker === "function") closeDatePicker();
      else cal.style.display = "none";
      return true;
    }

    // 2. Find topmost visible window or modal
    const visibleWins = Object.values(this.windows).filter(w =>
      w.isOpen &&
      !w.isMinimized &&
      w.element &&
      w.element.style.display !== "none"
    );

    if (visibleWins.length > 0) {
      visibleWins.sort((a, b) => (parseInt(b.element.style.zIndex) || 0) - (parseInt(a.element.style.zIndex) || 0));
      const topWin = visibleWins[0];
      console.log(`[HOTKEY CTRL+ENTER] Confirming topmost window #${topWin.id} ("${topWin.title}", z=${topWin.element.style.zIndex || 0})`);

      if (topWin.id === "catalogWindowModal") {
        if (typeof CatalogSelector !== "undefined" && CatalogSelector.confirmSelection) {
          CatalogSelector.confirmSelection(true);
        } else {
          this.closeWindow("catalogWindowModal");
        }
        return true;
      }

      if (topWin.id === "valueListModalOverlay") {
        if (typeof ValueListModal !== "undefined" && ValueListModal.applyAndClose) {
          ValueListModal.applyAndClose();
        } else {
          this.closeWindow("valueListModalOverlay");
        }
        return true;
      }

      if (topWin.id === "fieldSelectorModalOverlay") {
        if (typeof confirmFieldSelection === "function") confirmFieldSelection();
        else if (typeof FieldSelector !== "undefined" && FieldSelector.confirm) FieldSelector.confirm();
        else this.closeWindow("fieldSelectorModalOverlay");
        return true;
      }

      if (topWin.id === "operationTypeModalOverlay") {
        if (typeof OperationTypeSelector !== "undefined" && OperationTypeSelector.confirm) {
          OperationTypeSelector.confirm();
        } else {
          this.closeWindow("operationTypeModalOverlay");
        }
        return true;
      }

      if (topWin.id === "settingsRestoreModalOverlay") {
        if (typeof confirmApplySelectedPreset === "function") confirmApplySelectedPreset();
        else this.closeWindow("settingsRestoreModalOverlay");
        return true;
      }

      if (topWin.id === "settingsSaveModalOverlay") {
        if (typeof confirmSaveCurrentPreset === "function") confirmSaveCurrentPreset();
        else this.closeWindow("settingsSaveModalOverlay");
        return true;
      }

      if (topWin.id === "loginModalOverlay") {
        if (typeof submitLoginModal === "function") submitLoginModal();
        else this.closeWindow("loginModalOverlay");
        return true;
      }

      if (topWin.id === "settingsWindowModal") {
        if (typeof applySettingsAndGenerate === "function") {
          applySettingsAndGenerate();
        } else {
          if (typeof applySettingsAndClose === "function") applySettingsAndClose();
          if (typeof onActionFormirovat === "function") onActionFormirovat();
        }
        return true;
      }
    }

    // 3. Default: Active report window has "Сформировать"
    if (typeof onActionFormirovat === "function") {
      onActionFormirovat();
      return true;
    }

    return false;
  },

  bindGlobalEvents() {
    // 1. Global User Click Tracker for Realtime Terminal Debugging & Auto-Activation
    document.addEventListener("mousedown", (e) => {
      try {
        const el = e.target;
        if (!el) return;
        const tag = el.tagName || "DIV";
        const id = el.id ? `#${el.id}` : "";
        const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().replace(/\s+/g, '.')}` : "";
        const text = (el.textContent || "").trim().slice(0, 30);
        console.log(`[USER CLICK] <${tag}${id}${cls}> text="${text}"`);

        // If clicked inside an open window or modal, ensure it gets activated to top
        const parentWin = el.closest(".mdi-window, .modal-overlay-1c");
        if (parentWin && parentWin.id && MdiManager.windows[parentWin.id]) {
          if (!el.closest(".mdi-win-btn, .window-btn-close, .window-btn-sys")) {
            MdiManager.activateWindow(parentWin.id);
          }
        }
      } catch (err) {
        console.error("[MDI CLICK TRACKER ERROR]", err);
      }
    }, true);

    // 2. Close dropdown menus when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".mdi-menu-item")) {
        document.querySelectorAll(".mdi-menu-item.open").forEach(m => m.classList.remove("open"));
      }
    });

    // 3. Global ESC key listener (capture phase ensures priority)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.code === "Escape") {
        const handled = this.handleEscape();
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    // 4. Global Ctrl+Enter (OK / Сформировать) listener (capture phase ensures priority)
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter")) {
        const handled = this.handleConfirm();
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);
  }
};

/* Menu Toggle Helpers */
function toggleMdiMenu(e, menuId) {
  e.stopPropagation();
  const parent = e.currentTarget.closest(".mdi-menu-item");
  const wasOpen = parent.classList.contains("open");
  document.querySelectorAll(".mdi-menu-item.open").forEach(m => m.classList.remove("open"));
  if (!wasOpen) {
    parent.classList.add("open");
  }
}

// Global Window Export
window.MdiManager = MdiManager;
if (typeof module !== "undefined" && module.exports) {
  module.exports = MdiManager;
}
