/* ========================================================
   RENDER & MDI DEBUG LOG CONTROL
   (Render loglarını silmirik, sadəcə deaktiv edirik.
    İstənilən vaxt yenidən aktivləşdirmək üçün true edin:
    window.ENABLE_RENDER_LOGS = true)
   ======================================================== */
window.ENABLE_RENDER_LOGS = false;

if (typeof window._origConsoleLog === "undefined") {
  window._origConsoleLog = console.log.bind(console);
  console.log = function(...args) {
    if (!window.ENABLE_RENDER_LOGS) {
      const first = (typeof args[0] === "string") ? args[0] : "";
      if (
        first.startsWith("[MDI") ||
        first.startsWith("[USER CLICK") ||
        first.startsWith("[PORTFOLIO") ||
        first.startsWith("[SETTINGS") ||
        first.startsWith("[VALUE LIST") ||
        first.startsWith("[CATALOG") ||
        first.startsWith("[KEYBOARD") ||
        first.startsWith("[REPORT") ||
        first.startsWith("[SettingsPresets") ||
        first.startsWith("1C Universal Report Engine") ||
        first.startsWith("Selected item:")
      ) {
        return; // Deaktiv edilib (silinməyib, sadəcə susdurulub)
      }
    }
    window._origConsoleLog(...args);
  };
}

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

  getWindowState(id) {
    try {
      const raw = localStorage.getItem("1c_mdi_window_states");
      const states = raw ? JSON.parse(raw) : {};
      return states[id] || {};
    } catch (e) {
      return {};
    }
  },

  saveWindowState(id, state) {
    try {
      const raw = localStorage.getItem("1c_mdi_window_states");
      const states = raw ? JSON.parse(raw) : {};
      states[id] = Object.assign(states[id] || {}, state);
      localStorage.setItem("1c_mdi_window_states", JSON.stringify(states));
    } catch (e) {}
  },

  saveOpenWindowsSession() {
    try {
      const openWins = [];
      Object.values(this.windows).forEach(w => {
        if (w.isOpen && !w.isMinimized && w.element && w.element.style.display !== "none") {
          let docNum = null;
          let docDate = null;
          if (w.id === "priceDocEditorWindow") {
            try {
              const rawDoc = localStorage.getItem("1c_last_open_price_doc");
              if (rawDoc) {
                const parsed = JSON.parse(rawDoc);
                docNum = parsed.number;
                docDate = parsed.date;
              }
            } catch(e) {}
            if (!docNum && window.PriceDocEditor) {
              docNum = PriceDocEditor.currentDocNumber;
            }
          } else if (w.id === "salesDocEditorWindow") {
            if (window.SalesDocEditor) {
              docNum = SalesDocEditor.currentDocNumber;
              docDate = SalesDocEditor.currentDocDate;
            }
          }

          openWins.push({
            id: w.id,
            title: w.title,
            icon: w.icon,
            isActive: (w.id === this.activeWindowId),
            isMinimized: !!w.isMinimized,
            isMaximized: !!w.isMaximized,
            zIndex: parseInt(w.element.style.zIndex) || 0,
            docNumber: docNum,
            docDate: docDate,
            journalType: (w.id === "universalJournalWindow" && window.UniversalJournal) ? UniversalJournal.activeDocType : null
          });
        }
      });

      // Sort by zIndex so bottom windows are restored first, top window last
      openWins.sort((a, b) => a.zIndex - b.zIndex);
      localStorage.setItem("1c_mdi_session_windows", JSON.stringify(openWins));
    } catch(e) {}
  },

  restoreOpenWindowsSession() {
    try {
      const raw = localStorage.getItem("1c_mdi_session_windows");
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || !list.length) return;

      console.log(`[MDI SESSION RESTORE] Restoring ${list.length} open windows after page reload:`, list);

      let topActiveId = null;

      list.forEach(item => {
        if (item.isActive) topActiveId = item.id;

        if (item.id === "priceDocEditorWindow") {
          let docNum = item.docNumber;
          let docDate = item.docDate;
          if (!docNum) {
            try {
              const rawDoc = localStorage.getItem("1c_last_open_price_doc");
              if (rawDoc) {
                const parsed = JSON.parse(rawDoc);
                docNum = parsed.number;
                docDate = parsed.date;
              }
            } catch(e) {}
          }

          if (docNum && window.PriceDocEditor && typeof PriceDocEditor.open === "function") {
            PriceDocEditor.open(docNum, docDate);
          } else {
            this.activateWindow(item.id, { title: item.title, icon: item.icon });
          }
        } else if (item.id === "salesDocEditorWindow") {
          let docNum = item.docNumber;
          let docDate = item.docDate;
          if (docNum && window.SalesDocEditor && typeof SalesDocEditor.open === "function") {
            SalesDocEditor.open(docNum, docDate);
          } else {
            this.activateWindow(item.id, { title: item.title, icon: item.icon });
          }
        } else if (item.id === "universalJournalWindow") {
          if (window.UniversalJournal && typeof UniversalJournal.open === "function") {
            UniversalJournal.open(item.journalType);
          } else {
            this.activateWindow(item.id, { title: item.title, icon: item.icon });
          }
        } else if (item.id === "portfolioCatalogWindow") {
          if (window.PortfolioCatalog && typeof PortfolioCatalog.open === "function") {
            PortfolioCatalog.open();
          } else {
            this.activateWindow(item.id, { title: item.title, icon: item.icon });
          }
        } else if (item.id === "mdiWindow-1") {
          this.activateWindow("mdiWindow-1");
        } else {
          const el = document.getElementById(item.id);
          if (el) {
            this.activateWindow(item.id, { title: item.title, icon: item.icon });
          }
        }

        if (item.isMaximized) {
          setTimeout(() => this.maximizeWindow(item.id, false), 60);
        }
      });

      if (topActiveId) {
        setTimeout(() => {
          this.activateWindow(topActiveId);
        }, 220);
      }
    } catch(e) {
      console.warn("[MDI SESSION RESTORE ERROR]", e);
    }
  },

  auditStack(trigger) {
    if (!window.ENABLE_RENDER_LOGS) return;
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

    // 11. Universal Document Journal Window (Журнал документов - starts hidden)
    const ujWin = document.getElementById("universalJournalWindow");
    if (ujWin) {
      this.registerWindow("universalJournalWindow", {
        title: "Журнал документов",
        icon: "🗂️",
        element: ujWin,
        isDefault: true,
        startHidden: true,
        closeFn: () => {
          if (typeof UniversalJournal !== "undefined" && UniversalJournal.close) UniversalJournal.close();
        }
      });
    }

    // 11b. Universal Document Journal Filter Window (Настройка списка - starts hidden)
    const ujFilterWin = document.getElementById("ujFilterWindow");
    if (ujFilterWin) {
      this.registerWindow("ujFilterWindow", {
        title: "Настройка списка",
        icon: "📑",
        element: ujFilterWin,
        isDefault: true,
        isDialog: true,
        startHidden: true,
        closeFn: () => {
          if (typeof UniversalJournal !== "undefined" && UniversalJournal.closeFilterModal) UniversalJournal.closeFilterModal();
        }
      });
    }

    // 12. Price Document Editor Window (Установка цен номенклатуры - starts hidden)
    const pdeWin = document.getElementById("priceDocEditorWindow");
    if (pdeWin) {
      this.registerWindow("priceDocEditorWindow", {
        title: "Установка цен номенклатуры",
        icon: "📋",
        element: pdeWin,
        isDefault: true,
        startHidden: true,
        closeFn: () => {
          if (typeof PriceDocEditor !== "undefined" && PriceDocEditor.close) PriceDocEditor.close();
        }
      });
    }

    // 13. Nomenclature Item Card Window (Номенклатура / Элемент - starts hidden)
    const ncWin = document.getElementById("nomenclatureCardWindow");
    if (ncWin) {
      this.registerWindow("nomenclatureCardWindow", {
        title: "Номенклатура (элемент)",
        icon: "📦",
        element: ncWin,
        isDefault: true,
        startHidden: true,
        closeFn: () => {
          if (typeof NomenclatureCard !== "undefined" && NomenclatureCard.close) NomenclatureCard.close();
        }
      });
    }

    // 14. Sales Document Editor Window (Реализация товаров и услуг - starts hidden)
    const sdeWin = document.getElementById("salesDocEditorWindow");
    if (sdeWin) {
      this.registerWindow("salesDocEditorWindow", {
        title: "Реализация товаров и услуг",
        icon: "📋",
        element: sdeWin,
        isDefault: true,
        startHidden: true,
        closeFn: () => {
          if (typeof SalesDocEditor !== "undefined" && SalesDocEditor.close) SalesDocEditor.close();
        }
      });
    }

    // Auto-restore open windows after F5 page reload
    setTimeout(() => {
      this.restoreOpenWindowsSession();
    }, 120);

    // Save open windows state before page unload / F5
    window.addEventListener("beforeunload", () => {
      this.saveOpenWindowsSession();
    });
  },

  registerWindow(id, options = {}) {
    const el = options.element || document.getElementById(id);
    if (!el) return;

    const savedState = this.getWindowState(id);
    const wasMax = (savedState && savedState.isMaximized === true);
    const initialSavedRect = (savedState && savedState.savedRect) ? savedState.savedRect : {
      top: el.style.top || "20px",
      left: el.style.left || "20px",
      width: el.style.width || "calc(100% - 40px)",
      height: el.style.height || "calc(100% - 40px)"
    };

    const winObj = {
      id: id,
      title: options.title || "Окно",
      icon: options.icon || "📄",
      element: el,
      isMaximized: wasMax,
      isMinimized: !!options.startHidden,
      isDefault: !!options.isDefault,
      isDialog: !!options.isDialog,
      savedRect: initialSavedRect
    };

    if (wasMax) {
      el.classList.add("maximized");
      const maxBtn = el.querySelector(".mdi-win-btn-max");
      if (maxBtn) {
        maxBtn.textContent = "🗗";
        maxBtn.title = "Восстановить (Bərpa et)";
      }
    }

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

    // Initial positioning if not set (never offset modal overlays!)
    if (!options.isModal && !el.classList.contains("modal-overlay-1c") && !wasMax && (!el.style.top || el.style.top === "auto")) {
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
        if (winObj.savedRect) {
          this.saveWindowState(winObj.id, { savedRect: winObj.savedRect });
        }
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
          const isModal = el.classList.contains("modal-overlay-1c") || el.id.includes("Overlay");
          this.registerWindow(id, {
            title: options.title || "Окно",
            icon: options.icon || "📄",
            element: el,
            isDialog: true,
            isModal: isModal,
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

      // Restore maximized state from localStorage if remembered
      const savedState = this.getWindowState(id);
      if (savedState && savedState.isMaximized) {
        if (!winObj.isMaximized) {
          this.maximizeWindow(id, false);
        }
      } else if (savedState && savedState.isMaximized === false) {
        if (winObj.isMaximized) {
          this.restoreWindow(id, false);
        }
      }

      this.updateWindowTitlebar(id);
      this.updateWindowMenu();
      this.auditStack("activateWindow: " + id);
      this.saveOpenWindowsSession();
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

  maximizeWindow(id, doActivate = true) {
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

    this.saveWindowState(id, { isMaximized: true, savedRect: winObj.savedRect });

    if (doActivate) {
      this.activateWindow(id);
    }
  },

  restoreWindow(id, doActivate = true) {
    const winObj = this.windows[id];
    if (!winObj) return;

    winObj.isMaximized = false;
    winObj.isMinimized = false;
    winObj.element.classList.remove("maximized");
    winObj.element.classList.remove("minimized");

    // Restore saved rect
    if (winObj.savedRect) {
      winObj.element.style.top = winObj.savedRect.top || "20px";
      winObj.element.style.left = winObj.savedRect.left || "20px";
      winObj.element.style.width = winObj.savedRect.width || "calc(100% - 40px)";
      winObj.element.style.height = winObj.savedRect.height || "calc(100% - 40px)";
    }

    const maxBtn = winObj.element.querySelector(".mdi-win-btn-max");
    if (maxBtn) {
      maxBtn.textContent = "□";
      maxBtn.title = "Развернуть (Böyüt)";
    }

    this.saveWindowState(id, { isMaximized: false, savedRect: winObj.savedRect });

    if (doActivate) {
      this.activateWindow(id);
    }
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
    this.saveOpenWindowsSession();
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
    this.saveOpenWindowsSession();
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
      } else {
        appTitle.textContent = `1С:Предприятие 8.3 - (${baseName} - ${userName})`;
      }
    }
    document.title = "1С:Предприятие 8.3";
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

  getTopmostVisibleWindow() {
    const visibleWins = Object.values(this.windows).filter(w =>
      w.isOpen &&
      !w.isMinimized &&
      w.element &&
      w.element.style.display !== "none"
    );
    if (!visibleWins.length) return null;
    visibleWins.sort((a, b) => (parseInt(b.element.style.zIndex) || 0) - (parseInt(a.element.style.zIndex) || 0));
    return visibleWins[0];
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

    // 2.5 Close Period Picker Modal if open
    const ppModal = document.getElementById("periodPickerModalOverlay");
    if (ppModal && ppModal.style.display === "flex") {
      if (typeof PeriodPicker !== "undefined") PeriodPicker.close();
      else ppModal.style.display = "none";
      return true;
    }

    const ujDetModal = document.getElementById("ujDocDetailsModal");
    if (ujDetModal && ujDetModal.style.display === "flex") {
      ujDetModal.style.display = "none";
      return true;
    }

    // 2.6 Close Portfolio Find Modal if open
    const pcFindModal = document.getElementById("pcFindModal");
    if (pcFindModal && pcFindModal.style.display === "flex") {
      if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.closeFindModal) {
        PortfolioCatalog.closeFindModal();
        return true;
      }
    }

    // 3. Find and close the topmost active MDI window or Modal (highest z-index)
    const topWin = this.getTopmostVisibleWindow();
    if (topWin) {
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

    // Check if Portfolio Find Modal is open
    const pcFindModal = document.getElementById("pcFindModal");
    if (pcFindModal && pcFindModal.style.display === "flex") {
      if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.applyFindModal) {
        PortfolioCatalog.applyFindModal();
        return true;
      }
    }

    // 2. Find topmost visible window or modal (strictly based on highest z-index)
    const topWin = this.getTopmostVisibleWindow();
    if (!topWin) {
      if (typeof onActionFormirovat === "function") {
        onActionFormirovat();
        return true;
      }
      return false;
    }

    console.log(`[HOTKEY CTRL+ENTER] Confirming topmost window #${topWin.id} ("${topWin.title}", z=${topWin.element.style.zIndex || 0})`);

    // Topmost: Portfolio Catalog Report Window
    if (topWin.id === "portfolioCatalogWindow") {
      if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.generate) {
        PortfolioCatalog.generate();
        return true;
      }
    }

    // Topmost: Catalog Selector Modal
    if (topWin.id === "catalogWindowModal") {
      if (typeof CatalogSelector !== "undefined" && CatalogSelector.confirmSelection) {
        CatalogSelector.confirmSelection(true);
      } else {
        this.closeWindow("catalogWindowModal");
      }
      return true;
    }

    // Topmost: Value List Modal
    if (topWin.id === "valueListModalOverlay") {
      if (typeof ValueListModal !== "undefined" && ValueListModal.applyAndClose) {
        ValueListModal.applyAndClose();
      } else {
        this.closeWindow("valueListModalOverlay");
      }
      return true;
    }

    // Topmost: Field Selector Modal
    if (topWin.id === "fieldSelectorModalOverlay") {
      if (typeof confirmFieldSelection === "function") confirmFieldSelection();
      else if (typeof FieldSelector !== "undefined" && FieldSelector.confirm) FieldSelector.confirm();
      else this.closeWindow("fieldSelectorModalOverlay");
      return true;
    }

    // Topmost: Operation Type Modal
    if (topWin.id === "operationTypeModalOverlay") {
      if (typeof OperationTypeSelector !== "undefined" && OperationTypeSelector.confirm) {
        OperationTypeSelector.confirm();
      } else {
        this.closeWindow("operationTypeModalOverlay");
      }
      return true;
    }

    // Topmost: Settings Restore Modal
    if (topWin.id === "settingsRestoreModalOverlay") {
      if (typeof confirmApplySelectedPreset === "function") confirmApplySelectedPreset();
      else this.closeWindow("settingsRestoreModalOverlay");
      return true;
    }

    // Topmost: Settings Save Modal
    if (topWin.id === "settingsSaveModalOverlay") {
      if (typeof confirmSaveCurrentPreset === "function") confirmSaveCurrentPreset();
      else this.closeWindow("settingsSaveModalOverlay");
      return true;
    }

    // Topmost: Login Modal
    if (topWin.id === "loginModalOverlay") {
      if (typeof submitLoginModal === "function") submitLoginModal();
      else this.closeWindow("loginModalOverlay");
      return true;
    }

    // Topmost: Settings Dialog Window
    if (topWin.id === "settingsWindowModal") {
      if (typeof applySettingsAndGenerate === "function") {
        applySettingsAndGenerate();
      } else {
        if (typeof applySettingsAndClose === "function") applySettingsAndClose();
        if (typeof onActionFormirovat === "function") onActionFormirovat();
      }
      return true;
    }

    // Topmost: Period Picker Modal
    if (topWin.id === "periodPickerModalOverlay") {
      if (typeof PeriodPicker !== "undefined" && PeriodPicker.confirm) {
        PeriodPicker.confirm();
        return true;
      }
    }

    // Topmost: Price Document Editor Window ("Установка цен номенклатуры")
    if (topWin.id === "priceDocEditorWindow") {
      if (typeof PriceDocEditor !== "undefined" && PriceDocEditor.currentDocNumber) {
        console.log(`[MDI F5 REFRESH] Refreshing price doc №${PriceDocEditor.currentDocNumber}...`);
        const docDate = document.getElementById("pdeDocDate")?.value;
        PriceDocEditor.loadDocumentData(PriceDocEditor.currentDocNumber, docDate);
        return true;
      }
    }

    // Topmost: Sales Document Editor Window ("Реализация товаров и услуг")
    if (topWin.id === "salesDocEditorWindow") {
      if (typeof SalesDocEditor !== "undefined" && SalesDocEditor.currentDocNumber) {
        console.log(`[MDI F5 REFRESH] Refreshing sales doc №${SalesDocEditor.currentDocNumber}...`);
        SalesDocEditor.fetchDocumentData(SalesDocEditor.currentDocNumber);
        return true;
      }
    }

    // Topmost: Universal Journal Window ("Журнал документов")
    if (topWin.id === "universalJournalWindow") {
      if (typeof UniversalJournal !== "undefined" && UniversalJournal.loadDocuments) {
        UniversalJournal.loadDocuments();
        return true;
      }
    }

    // Topmost: Portfolio Catalog Window ("Товары по портфелям")
    if (topWin.id === "portfolioCatalogWindow") {
      if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.generate) {
        PortfolioCatalog.generate();
        return true;
      }
    }

    // Topmost: Main Report Window ("Товары на складах")
    if (topWin.id === "mdiWindow-1") {
      if (typeof onActionFormirovat === "function") {
        onActionFormirovat();
        return true;
      }
    }

    return false;
  },

  handleSearch() {
    // 0. If Portfolio Find Modal is already open, focus its input!
    const pcFindModal = document.getElementById("pcFindModal");
    if (pcFindModal && pcFindModal.style.display === "flex") {
      const inp = document.getElementById("pcFindModalInput");
      if (inp) {
        inp.focus();
        inp.select();
        return true;
      }
    }

    // Check if user is inside or focused on Portfolio Catalog Window
    const pcWin = document.getElementById("portfolioCatalogWindow");
    if (pcWin && pcWin.style.display !== "none" && !pcWin.classList.contains("minimized")) {
      const isPcActive = (this.activeWindowId === "portfolioCatalogWindow") ||
                         pcWin.classList.contains("active") ||
                         pcWin.contains(document.activeElement) ||
                         (document.getSelection && document.getSelection().anchorNode && pcWin.contains(document.getSelection().anchorNode.nodeType === 1 ? document.getSelection().anchorNode : document.getSelection().anchorNode.parentElement));
      
      const topWin = this.getTopmostVisibleWindow();
      if (isPcActive || (topWin && topWin.id === "portfolioCatalogWindow")) {
        if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.onSearchHotkey) {
          PortfolioCatalog.onSearchHotkey();
          return true;
        }
      }
    }

    const topWin = this.getTopmostVisibleWindow();
    if (!topWin) return false;

    console.log(`[HOTKEY CTRL+F] Search in topmost window #${topWin.id} ("${topWin.title}", z=${topWin.element.style.zIndex || 0})`);

    // 0.5 Universal Journal Window
    if (topWin.id === "universalJournalWindow") {
      if (typeof UniversalJournal !== "undefined" && UniversalJournal.openFindModal) {
        UniversalJournal.openFindModal();
        return true;
      }
    }

    // 1. Portfolio Catalog Window
    if (topWin.id === "portfolioCatalogWindow") {
      if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.onSearchHotkey) {
        PortfolioCatalog.onSearchHotkey();
        return true;
      }
    }

    // 2. Catalog Selector Modal
    if (topWin.id === "catalogWindowModal") {
      const inp = document.getElementById("catSearchInput");
      if (inp) {
        inp.focus();
        inp.select();
        return true;
      }
    }

    // 3. Operation Type Modal
    if (topWin.id === "operationTypeModalOverlay") {
      const inp = document.getElementById("opTypeSearchInput");
      if (inp) {
        inp.focus();
        inp.select();
        return true;
      }
    }

    // 4. Value List Modal
    if (topWin.id === "valueListModalOverlay") {
      const inp = document.querySelector("#valueListModalOverlay input[type='text']");
      if (inp) {
        inp.focus();
        inp.select();
        return true;
      }
    }

    // 5. Settings Window
    if (topWin.id === "settingsWindowModal") {
      const inp = document.getElementById("priceTypeSearch");
      if (inp) {
        inp.focus();
        inp.select();
        return true;
      }
    }

    return false;
  },

  handleCancelSearch() {
    const pcFindModal = document.getElementById("pcFindModal");
    if (pcFindModal && pcFindModal.style.display === "flex") {
      if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.clearFindModal) {
        PortfolioCatalog.clearFindModal();
        return true;
      }
    }

    const pcWin = document.getElementById("portfolioCatalogWindow");
    if (pcWin && pcWin.style.display !== "none" && !pcWin.classList.contains("minimized")) {
      const isPcActive = (this.activeWindowId === "portfolioCatalogWindow") ||
                         pcWin.classList.contains("active") ||
                         pcWin.contains(document.activeElement);
      const topWin = this.getTopmostVisibleWindow();
      if (isPcActive || (topWin && topWin.id === "portfolioCatalogWindow")) {
        if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.clearSearch) {
          PortfolioCatalog.clearSearch();
          return true;
        }
      }
    }

    const topWin = this.getTopmostVisibleWindow();
    if (!topWin) return false;

    console.log(`[HOTKEY CTRL+Q] Cancel search in topmost window #${topWin.id} ("${topWin.title}", z=${topWin.element.style.zIndex || 0})`);

    // 0.5 Universal Journal Window
    if (topWin.id === "universalJournalWindow") {
      if (typeof UniversalJournal !== "undefined" && UniversalJournal.clearSearch) {
        UniversalJournal.clearSearch();
        return true;
      }
    }

    // 1. Portfolio Catalog Window
    if (topWin.id === "portfolioCatalogWindow") {
      if (typeof PortfolioCatalog !== "undefined" && PortfolioCatalog.clearSearch) {
        PortfolioCatalog.clearSearch();
        return true;
      }
    }

    // 2. Catalog Selector Modal
    if (topWin.id === "catalogWindowModal") {
      const inp = document.getElementById("catSearchInput");
      if (inp) {
        inp.value = "";
        if (typeof CatalogSelector !== "undefined" && CatalogSelector.search) CatalogSelector.search();
        inp.blur();
        return true;
      }
    }

    // 3. Operation Type Modal
    if (topWin.id === "operationTypeModalOverlay") {
      const inp = document.getElementById("opTypeSearchInput");
      if (inp) {
        inp.value = "";
        if (typeof OperationTypeSelector !== "undefined" && OperationTypeSelector.filter) OperationTypeSelector.filter("");
        inp.blur();
        return true;
      }
    }

    // 4. Settings Window
    if (topWin.id === "settingsWindowModal") {
      const inp = document.getElementById("priceTypeSearch");
      if (inp) {
        inp.value = "";
        if (typeof filterPriceTypesList === "function") filterPriceTypesList("");
        inp.blur();
        return true;
      }
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

    // 4. Global Ctrl+Enter (OK / Сформировать) listener (strictly scoped to topmost z-index window)
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter")) {
        const handled = this.handleConfirm();
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    // 5. Global Ctrl+F (Search in active window)
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F" || e.code === "KeyF")) {
        const handled = this.handleSearch();
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    // 6. Global Ctrl+Q (Cancel / Clear search in active window)
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "q" || e.key === "Q" || e.code === "KeyQ")) {
        const handled = this.handleCancelSearch();
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
