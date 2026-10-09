import re

with open('static/js/universal_journal.js', 'r', encoding='utf-8') as f:
    orig = f.read()

# 1. Replace document.getElementById for window elements with this.getEl
window_ids = [
    "ujTableBody", "ujSearchInput", "ujTableWrapper", "ujLoadingState",
    "ujDebugBadge", "ujEmptyState", "ujDocTypeSelect", "ujWindowTitle",
    "ujTableHeadRow", "ujTotalRowsCount", "ujPeriodLabel", "ujBottomLoadingIndicator",
    "ujFilterCountBadge", "ujBtnClearFilter", "ujBtnQuickFilter", "ujBtnRemoveColumnFilter",
    "ujActiveFilterBadge", "ujActiveFilterName", "ujBtnEdit", "ujSearchActionBtn",
    "ujStatusRight", "ujStatusLeft"
]

code = orig
for wid in window_ids:
    code = code.replace(f'document.getElementById("{wid}")', f'this.getEl("{wid}")')
    code = code.replace(f"document.getElementById('{wid}')", f"this.getEl('{wid}')")

# Fix document.querySelector on loading state
code = code.replace(
    'const loadingText = document.querySelector("#ujLoadingState div:nth-child(2)");',
    'const loadingStateEl = this.getEl("ujLoadingState");\n    const loadingText = (loadingStateEl && loadingStateEl.querySelector) ? loadingStateEl.querySelector("div:nth-child(2)") : null;'
)
code = code.replace(
    'document.querySelector("#ujLoadingState div:nth-child(2)")',
    '(this.getEl("ujLoadingState")?.querySelector ? this.getEl("ujLoadingState").querySelector("div:nth-child(2)") : null)'
)

# Fix document.querySelector on c1-cell-active
code = code.replace(
    "document.querySelector('#ujTableBody .c1-cell-active')",
    "(this.getEl('ujTableBody')?.querySelector ? this.getEl('ujTableBody').querySelector('.c1-cell-active') : null)"
)

code = code.replace(
    '''  isJournalActive: function() {
    const win = document.getElementById("universalJournalWindow");
    return Boolean(win && win.style.display !== "none");
  },''',
    '''  isJournalActive: function() {
    if (typeof MdiManager !== "undefined" && MdiManager.activeWindowId) {
      const myId = this.windowId || "universalJournalWindow";
      if (MdiManager.activeWindowId !== myId) return false;
    }
    const win = this.windowElement || ((typeof document !== "undefined" && document.getElementById) ? document.getElementById(this.windowId || "universalJournalWindow") : null);
    return Boolean(win && win.style.display !== "none");
  },'''
)

# Find where UniversalJournal begins and ends
start_pattern = "const UniversalJournal = {"
end_pattern = "\nwindow.UniversalJournal = UniversalJournal;"

start_idx = code.index(start_pattern) + len(start_pattern)
end_idx = code.index(end_pattern)
last_brace_idx = code.rindex("};\n", 0, end_idx + 1)

body = code[start_idx:last_brace_idx]

# Replace openDirect and close inside body with prototype versions
body = body.replace("openDirect: function(", "_openDirectProto: function(")
body = body.replace("close: function() {", "_closeProto: function() {")

full_script = f"""
function JournalInstance(windowId, docType, options = {{}}) {{
  this.windowId = windowId || "universalJournalWindow";
  this.windowElement = options.element || ((typeof document !== "undefined" && document.getElementById) ? document.getElementById(this.windowId) : null);
  this.activeDocType = docType || "РеализацияТоваровУслуг";
  const meta = this.getDocMeta ? this.getDocMeta(this.activeDocType) : {{ title: "Реализация товаров и услуг", icon: "🚚" }};
  this.docTitle = options.title || meta.title;
  this.icon = options.icon || meta.icon;
  this.startDateStr = "";
  this.endDateStr = "";
  this.items = [];
  this.filteredItems = [];
  this.columns = [];
  this.selectedRow = null;
  this.selectedColKey = null;
  this.currentSortCol = "date";
  this.currentSortAsc = false;
  this.searchMatchMode = "contains";
  this._columnSelectedForFind = false;
  this.activeFilters = [];
  this.activePresetName = "";
  this.listCache = new Map();
  this._listAbortController = null;
  this._listReady = false;
  this._listKey = null;
  this._paused = false;
  this._lastScrollTop = 0;
  this._renderRaf = null;
  this._scrollScheduled = false;
  this._searchDebounceTimer = null;
  this._filterDebounceTimer = null;
  this.hasMoreDocs = true;
  this.lastRenderedStart = -1;
  this.lastRenderedEnd = -1;
  this.rowHeight = 21;
  this._virtualScroll = {{
    rowHeight: 21,
    visibleCount: 40,
    bufferCount: 20,
    lastRenderedStart: 0
  }};
}}

const _UniversalJournalTarget = {{
  instances: {{}},
  _winCounter: 1,
  lastActiveInstanceId: "universalJournalWindow",

  getEl: function(id) {{
    if (this.windowElement && this.windowElement.querySelector) {{
      const scoped = this.windowElement.querySelector(`[data-uj="${{id}}"], #${{id}}_${{this.windowId}}, #${{id}}, .${{id}}`);
      if (scoped) return scoped;
    }}
    const win = (this.windowId && typeof document !== "undefined" && document.getElementById) ? document.getElementById(this.windowId) : null;
    if (win && win.querySelector) {{
      const scoped = win.querySelector(`[data-uj="${{id}}"], #${{id}}_${{this.windowId}}, #${{id}}, .${{id}}`);
      if (scoped) return scoped;
    }}
    return (typeof document !== "undefined" && document.getElementById) ? document.getElementById(id) : null;
  }},

  getActiveInstance: function(eventOrWinId) {{
    if (typeof eventOrWinId === "string" && this.instances[eventOrWinId]) {{
      this.lastActiveInstanceId = eventOrWinId;
      return this.instances[eventOrWinId];
    }}
    let winId = null;
    if (eventOrWinId && eventOrWinId.target && eventOrWinId.target.closest) {{
      const win = eventOrWinId.target.closest(".mdi-window");
      if (win && win.id) winId = win.id;
    }}
    if (!winId && typeof MdiManager !== "undefined" && MdiManager.activeWindowId) {{
      winId = MdiManager.activeWindowId;
    }}
    if (winId && this.instances[winId]) {{
      this.lastActiveInstanceId = winId;
      return this.instances[winId];
    }}
    if (this.lastActiveInstanceId && this.instances[this.lastActiveInstanceId]) {{
      return this.instances[this.lastActiveInstanceId];
    }}
    const keys = Object.keys(this.instances);
    if (keys.length > 0) {{
      return this.instances[keys[keys.length - 1]];
    }}
    if (!this.instances["universalJournalWindow"]) {{
      this.instances["universalJournalWindow"] = new JournalInstance("universalJournalWindow", "РеализацияТоваровУслуг");
    }}
    return this.instances["universalJournalWindow"];
  }},

  getInstance: function(winId) {{
    return this.instances[winId] || this.getActiveInstance(winId);
  }},

  open: function(defaultDocType) {{
    return this.openDirect(defaultDocType);
  }},

  openDirect: function(docType, options = {{}}) {{
    const targetType = docType || "РеализацияТоваровУслуг";
    const meta = this.getDocMeta ? this.getDocMeta(targetType) : {{ title: targetType, icon: "🗂️" }};
    const forceNew = !!options.forceNew;

    // 1. If not forcing new instance, activate already open window of this docType
    if (!forceNew) {{
      for (const [id, inst] of Object.entries(this.instances)) {{
        if (inst && inst.activeDocType === targetType) {{
          const winEl = inst.windowElement || ((typeof document !== "undefined" && document.getElementById) ? document.getElementById(id) : null);
          if (winEl && winEl.style.display !== "none") {{
            if (typeof MdiManager !== "undefined") {{
              MdiManager.activateWindow(id);
            }}
            this.lastActiveInstanceId = id;
            return id;
          }}
        }}
      }}
    }}

    // 2. Generate window ID
    let winId = options.windowId;
    if (!winId) {{
      const safeType = targetType.replace(/[^a-zA-Z0-9_\\u0400-\\u04FF]/g, "_");
      if (!forceNew && !this.instances[`ujWin_${{safeType}}`]) {{
        winId = `ujWin_${{safeType}}`;
      }} else {{
        this._winCounter = (this._winCounter || 1) + 1;
        winId = `ujWin_${{safeType}}_${{this._winCounter}}`;
      }}
    }}

    // 3. Obtain or clone DOM element
    let winEl = (typeof document !== "undefined" && document.getElementById) ? document.getElementById(winId) : null;
    let isCloned = false;

    if (!winEl && typeof document !== "undefined" && document.getElementById) {{
      const baseWin = document.getElementById("universalJournalWindow");
      if (baseWin && winId !== "universalJournalWindow") {{
        winEl = baseWin.cloneNode(true);
        winEl.id = winId;
        isCloned = true;

        // Scope internal element IDs and set data-uj
        winEl.querySelectorAll("[id]").forEach(el => {{
          el.dataset.uj = el.id;
          el.id = `${{el.id}}_${{winId}}`;
        }});

        // Calculate staggered offset
        const winCount = (typeof MdiManager !== "undefined" && MdiManager.windows) ? Object.keys(MdiManager.windows).length : 1;
        const offset = (winCount * 26) % 180;
        winEl.style.top = `${{25 + offset}}px`;
        winEl.style.left = `${{30 + offset}}px`;
        winEl.style.width = "calc(100% - 70px)";
        winEl.style.height = "calc(100% - 60px)";
        winEl.style.display = "flex";
        winEl.classList.remove("minimized");

        // Set header title and icon
        const countMatch = winId.match(/_(\\d+)$/);
        const instanceNumber = countMatch ? ` (${{countMatch[1]}})` : "";
        const displayTitle = options.title || `${{meta.title}}${{instanceNumber}}`;
        const titleEl = winEl.querySelector(".mdi-win-title-text, [data-uj='ujWindowTitle']");
        if (titleEl) titleEl.textContent = displayTitle;
        const iconEl = winEl.querySelector(".mdi-win-icon, [data-uj='ujWindowIcon']");
        if (iconEl) iconEl.textContent = meta.icon;

        // Wire window header buttons
        const closeBtn = winEl.querySelector(".mdi-win-btn-close");
        if (closeBtn) {{
          closeBtn.removeAttribute("onclick");
          closeBtn.onclick = (e) => {{
            e.stopPropagation();
            UniversalJournal.close(winId);
          }};
        }}
        const maxBtn = winEl.querySelector(".mdi-win-btn-max");
        if (maxBtn) {{
          maxBtn.removeAttribute("onclick");
          maxBtn.onclick = (e) => {{
            e.stopPropagation();
            if (typeof MdiManager !== "undefined") MdiManager.toggleMaximize(winId);
          }};
        }}
        const minBtn = winEl.querySelector(".mdi-win-btn-min");
        if (minBtn) {{
          minBtn.removeAttribute("onclick");
          minBtn.onclick = (e) => {{
            e.stopPropagation();
            if (typeof MdiManager !== "undefined") MdiManager.minimizeWindow(winId);
          }};
        }}
        const newBtn = winEl.querySelector(".mdi-win-btn-new");
        if (newBtn) {{
          newBtn.removeAttribute("onclick");
          newBtn.onclick = (e) => {{
            e.stopPropagation();
            UniversalJournal.duplicateWindow(winId);
          }};
        }}
        const header = winEl.querySelector(".mdi-window-header");
        if (header) {{
          header.removeAttribute("ondblclick");
          header.ondblclick = (e) => {{
            if (e.target.closest(".mdi-win-btn, .window-btn-close")) return;
            if (typeof MdiManager !== "undefined") MdiManager.toggleMaximize(winId);
          }};
        }}

        winEl.setAttribute("onmousedown", `MdiManager.activateWindow('${{winId}}')`);

        const ws = document.getElementById("mdiWorkspace");
        if (ws) ws.appendChild(winEl);
      }} else if (baseWin && winId === "universalJournalWindow") {{
        winEl = baseWin;
        winEl.style.display = "flex";
        winEl.classList.remove("minimized");
      }}
    }} else if (winEl) {{
      winEl.style.display = "flex";
      winEl.classList.remove("minimized");
    }}

    const countMatch = winId.match(/_(\\d+)$/);
    const instanceNumber = countMatch ? ` (${{countMatch[1]}})` : "";
    const displayTitle = options.title || `${{meta.title}}${{instanceNumber}}`;

    // 4. Register with MdiManager
    if (typeof MdiManager !== "undefined" && winEl) {{
      MdiManager.registerWindow(winId, {{
        title: displayTitle,
        icon: meta.icon,
        element: winEl,
        closeFn: () => {{
          UniversalJournal.close(winId);
        }}
      }});
      MdiManager.activateWindow(winId);
    }}

    // 5. Create or get instance
    let instance = this.instances[winId];
    if (!instance) {{
      instance = new JournalInstance(winId, targetType, {{
        element: winEl,
        title: displayTitle,
        icon: meta.icon,
        isCloned: isCloned
      }});
      this.instances[winId] = instance;
    }} else {{
      instance.windowElement = winEl;
      instance.activeDocType = targetType;
      instance.docTitle = displayTitle;
      instance.icon = meta.icon;
    }}

    this.lastActiveInstanceId = winId;

    // 6. Set docType select value
    const sel = instance.getEl("ujDocTypeSelect");
    if (sel) sel.value = targetType;

    // 7. Load documents
    instance.loadDocuments({{ force: true }});
    return winId;
  }},

  duplicateWindow: function(sourceWinId) {{
    const srcId = sourceWinId || this.lastActiveInstanceId || (typeof MdiManager !== "undefined" ? MdiManager.activeWindowId : null);
    const src = this.instances[srcId] || this.getActiveInstance();
    const docType = src ? src.activeDocType : "РеализацияТоваровУслуг";
    return this.openDirect(docType, {{ forceNew: true }});
  }},

  openNewWindow: function(docType) {{
    if (docType) {{
      return this.openDirect(docType, {{ forceNew: true }});
    }}
    return this.duplicateWindow(this.lastActiveInstanceId);
  }},

  close: function(winId) {{
    const targetId = winId || this.lastActiveInstanceId || (typeof MdiManager !== "undefined" ? MdiManager.activeWindowId : null) || "universalJournalWindow";
    const inst = this.instances[targetId];
    if (inst) {{
      inst.clearRenderAndState();
      inst.pauseLoading();
      inst.updateBottomLoadingState(false);
      delete this.instances[targetId];
    }}
    if (typeof MdiManager !== "undefined") {{
      MdiManager.closeWindow(targetId);
    }}
    const winEl = (typeof document !== "undefined" && document.getElementById) ? document.getElementById(targetId) : null;
    if (winEl) {{
      if (targetId === "universalJournalWindow") {{
        winEl.style.display = "none";
      }} else {{
        winEl.remove();
      }}
    }}
    if (this.lastActiveInstanceId === targetId) {{
      const remaining = Object.keys(this.instances);
      this.lastActiveInstanceId = remaining.length ? remaining[remaining.length - 1] : null;
    }}
  }},

  onPeriodSelected: function(startDate, endDate) {{
    const inst = this.getActiveInstance();
    if (inst) {{
      inst.startDateStr = startDate;
      inst.endDateStr = endDate;
      inst.updatePeriodLabel();
      inst.loadDocuments({{ force: true }});
    }}
  }},

  openPeriodPicker: function(e) {{
    const inst = this.getActiveInstance(e || (typeof window !== "undefined" ? window.event : null));
    if (!inst) return;
    this.lastActiveInstanceId = inst.windowId;
    if (typeof PeriodPicker !== "undefined" && typeof PeriodPicker.open === "function") {{
      PeriodPicker.open({{
        startDate: inst.startDateStr,
        endDate: inst.endDateStr,
        onSelect: (start, end) => {{
          inst.startDateStr = start;
          inst.endDateStr = end;
          inst.updatePeriodLabel();
          inst.loadDocuments({{ force: true }});
        }}
      }});
    }}
  }},
{body}
}};

JournalInstance.prototype = _UniversalJournalTarget;
JournalInstance.prototype.constructor = JournalInstance;

// Setup default instance
_UniversalJournalTarget.instances["universalJournalWindow"] = new JournalInstance("universalJournalWindow", "РеализацияТоваровУслуг");

// Wrap methods on _UniversalJournalTarget so when called directly on UniversalJournal, 'this' is bound to the active instance
for (const [key, val] of Object.entries(_UniversalJournalTarget)) {{
  if (typeof val === "function" && !["getActiveInstance", "getInstance", "duplicateWindow", "openNewWindow", "openDirect", "close", "onPeriodSelected", "openPeriodPicker"].includes(key)) {{
    const origFn = val;
    _UniversalJournalTarget[key] = function(...args) {{
      const ctx = (this === _UniversalJournalTarget || this === UniversalJournal) ? _UniversalJournalTarget.getActiveInstance() : this;
      return origFn.apply(ctx, args);
    }};
  }}
}}

const UniversalJournal = new Proxy(_UniversalJournalTarget, {{
  get(target, prop, receiver) {{
    if (["instances", "_winCounter", "lastActiveInstanceId", "getActiveInstance", "getInstance", "duplicateWindow", "openNewWindow", "openDirect", "close", "onPeriodSelected", "openPeriodPicker", "prefetchCache", "prefetchQueue", "activePrefetchCount", "maxConcurrentPrefetches", "prefetchAbortController", "clearPrefetchCache", "getPrefetchedPriceDoc", "getPendingPrefetchPromise", "invalidatePrefetch"].includes(prop)) {{
      return target[prop];
    }}
    const inst = target.getActiveInstance();
    if (inst && typeof target[prop] !== "function") {{
      return inst[prop];
    }}
    if (prop in target) {{
      return target[prop];
    }}
    return inst ? inst[prop] : undefined;
  }},
  set(target, prop, value, receiver) {{
    if (["instances", "_winCounter", "lastActiveInstanceId", "prefetchCache", "prefetchQueue", "activePrefetchCount", "maxConcurrentPrefetches", "prefetchAbortController"].includes(prop)) {{
      target[prop] = value;
      return true;
    }}
    if (typeof value === "function") {{
      target[prop] = function(...args) {{
        const ctx = (this === _UniversalJournalTarget || this === UniversalJournal) ? _UniversalJournalTarget.getActiveInstance() : this;
        return value.apply(ctx, args);
      }};
      JournalInstance.prototype[prop] = target[prop];
      return true;
    }}
    const inst = target.getActiveInstance();
    if (inst) {{
      inst[prop] = value;
      return true;
    }}
    target[prop] = value;
    return true;
  }}
}});
"""

orig_end_idx = orig.index(end_pattern)
full_content = code[:code.index(start_pattern)] + full_script + orig[orig_end_idx:]

with open('static/js/universal_journal_test.js', 'w', encoding='utf-8') as f:
    f.write(full_content)

print("Generated static/js/universal_journal_test.js with Proxy support!")
