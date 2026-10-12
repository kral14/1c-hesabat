/**
 * static/js/order_analysis_settings.js
 * ====================================
 * Müştəri Sifarişləri Analizi (Заказ покупателя анализ) hesabatının
 * tənzimləmə (Настройка) pəncərəsinin idarəedicisi.
 * UniversalReportSettings bazası üzərində tam 1C 8.3 standartında işləyir.
 */

window.OrderAnalysisSettings = (function() {
  const STORAGE_KEY = "1c_order_analysis_settings_v3";

  let engine = null;

  function getEngine() {
    if (!engine && window.UniversalReportSettings) {
      engine = UniversalReportSettings.register({
        key: "order_analysis",
        windowId: "orderAnalysisSettingsModal",
        title: "Настройка: Заказы покупателей (Анализ)",
        storageKey: STORAGE_KEY,
        dateInputs: {
          dlgStart: "oaDlgStartDate",
          dlgEnd: "oaDlgEndDate",
          topStart: "oaStartDateInput",
          topEnd: "oaEndDateInput",
          labelId: "oaDlgPeriodLabel"
        },
        selectors: {
          tableRowGroupings: "#oaRowGroupingsBody",
          tableColGroupings: "#oaColGroupingsBody",
          tableFilters: "#oaFiltersTableBody",
          indicatorsContainer: "#oaIndicatorsTree",
          advancedCheck: "#oaChkAdvancedSettings"
        },
        fieldCatalogMap: {
          "Контрагент": "Контрагенты",
          "Номенклатура": "Номенклатура",
          "Склад": "Склады",
          "Портфель": "Портфели",
          "Агент": "Агенты",
          "Номенклатура.Номенклатурная группа": "НоменклатурныеГруппы",
          "Номенклатурная группа": "НоменклатурныеГруппы",
          "Качество": "Качество",
          "Регистратор.Вид операции": "Вид операции",
          "Регистратор.Ответственный": "Пользователи"
        },
        fieldPlaceholderMap: {
          "Контрагент": "Müştəri seç...",
          "Номенклатура": "Məhsul seç...",
          "Склад": "Anbar seç...",
          "Портфель": "Portfel seç...",
          "Агент": "Agent seç...",
          "Номенклатура.Номенклатурная группа": "Qrup seç...",
          "Качество": "Keyfiyyət...",
          "Регистратор.Вид операции": "Əməliyyat növü...",
          "Регистратор.Ответственный": "Məsul şəxs..."
        },
        onGenerate: function(settings) {
          applyAndGenerate();
        },
        onApply: function(settings) {
          applyAndClose();
        }
      });
    }
    return engine;
  }

  function init() {
    getEngine();
    loadSavedSettings();
  }

  function open() {
    loadSavedSettings();
    const eng = getEngine();
    if (eng) eng.open();
  }

  function close() {
    const el = document.getElementById("orderAnalysisSettingsModal");
    if (el) {
      el.style.setProperty("display", "none", "important");
      el.classList.remove("active");
      el.classList.add("minimized");
    }
    const tab = document.getElementById("tab-orderAnalysisSettingsModal");
    if (tab) tab.remove();
    if (window.MdiManager) {
      try {
        if (typeof MdiManager.closeWindow === "function") {
          MdiManager.closeWindow("orderAnalysisSettingsModal");
        }
      } catch (e) {}
      try {
        if (typeof MdiManager.activateWindow === "function") {
          MdiManager.activateWindow("orderAnalysisWindow");
        }
      } catch (e) {}
    }
  }

  function getSettings() {
    const eng = getEngine();
    const collected = eng ? eng.collectSettings() : {};

    // Indicators
    const indicators = {
      qty_order: document.getElementById("oaIndQtyOrder")?.checked ?? true,
      sum_order: document.getElementById("oaIndSumOrder")?.checked ?? true,
      qty_real: document.getElementById("oaIndQtyReal")?.checked ?? true,
      sum_real: document.getElementById("oaIndSumReal")?.checked ?? true,
      qty_diff: document.getElementById("oaIndQtyDiff")?.checked ?? true,
      sum_diff: document.getElementById("oaIndSumDiff")?.checked ?? true,
      qty_ret: document.getElementById("oaIndQtyRet")?.checked ?? true,
      sum_ret: document.getElementById("oaIndSumRet")?.checked ?? true,
      qty_net: document.getElementById("oaIndQtyNet")?.checked ?? true,
      sum_net: document.getElementById("oaIndSumNet")?.checked ?? true,
      show_code: document.getElementById("oaIndShowCode")?.checked ?? true,
      show_article: document.getElementById("oaIndShowArticle")?.checked ?? true,
      show_barcode: document.getElementById("oaIndShowBarcode")?.checked ?? true
    };

    // Parameters
    const postedOnly = document.getElementById("oaChkPostedOnly")?.checked ?? true;
    const showTotals = document.getElementById("oaChkShowTotals")?.checked ?? true;
    const negativeRed = document.getElementById("oaChkNegativeRed")?.checked ?? true;
    const showDetails = document.getElementById("oaChkShowDetails")?.checked ?? false;
    const useProperties = document.getElementById("oaChkUseProperties")?.checked ?? true;

    // Row Groupings format for report
    const groupings = [];
    if (collected.rowGroupings && collected.rowGroupings.length > 0) {
      collected.rowGroupings.forEach(g => {
        if (g.field) groupings.push(g.field);
      });
    } else {
      groupings.push("Заказ покупателя", "Номенклатура");
    }

    return {
      startDate: collected.startDate || "01.08.2026",
      endDate: collected.endDate || "30.09.2026",
      groupings: groupings,
      rowGroupings: collected.rowGroupings || [],
      colGroupings: collected.colGroupings || [],
      indicators: indicators,
      posted_only: postedOnly,
      show_totals: showTotals,
      negative_red: negativeRed,
      show_details: showDetails,
      use_properties: useProperties,
      filters: collected.filters || []
    };
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  function loadSavedSettings() {
    try {
      const savedStr = localStorage.getItem(STORAGE_KEY);
      if (!savedStr) return;
      const saved = JSON.parse(savedStr);

      if (saved.indicators) {
        if (document.getElementById("oaIndQtyOrder")) document.getElementById("oaIndQtyOrder").checked = !!saved.indicators.qty_order;
        if (document.getElementById("oaIndSumOrder")) document.getElementById("oaIndSumOrder").checked = !!saved.indicators.sum_order;
        if (document.getElementById("oaIndQtyReal")) document.getElementById("oaIndQtyReal").checked = !!saved.indicators.qty_real;
        if (document.getElementById("oaIndSumReal")) document.getElementById("oaIndSumReal").checked = !!saved.indicators.sum_real;
        if (document.getElementById("oaIndQtyDiff")) document.getElementById("oaIndQtyDiff").checked = !!saved.indicators.qty_diff;
        if (document.getElementById("oaIndSumDiff")) document.getElementById("oaIndSumDiff").checked = !!saved.indicators.sum_diff;
        if (document.getElementById("oaIndQtyRet")) document.getElementById("oaIndQtyRet").checked = !!saved.indicators.qty_ret;
        if (document.getElementById("oaIndSumRet")) document.getElementById("oaIndSumRet").checked = !!saved.indicators.sum_ret;
        if (document.getElementById("oaIndQtyNet")) document.getElementById("oaIndQtyNet").checked = !!saved.indicators.qty_net;
        if (document.getElementById("oaIndSumNet")) document.getElementById("oaIndSumNet").checked = !!saved.indicators.sum_net;
        if (document.getElementById("oaIndShowCode")) document.getElementById("oaIndShowCode").checked = !!saved.indicators.show_code;
        if (document.getElementById("oaIndShowArticle")) document.getElementById("oaIndShowArticle").checked = !!saved.indicators.show_article;
        if (document.getElementById("oaIndShowBarcode")) document.getElementById("oaIndShowBarcode").checked = !!saved.indicators.show_barcode;
      }

      if (saved.posted_only !== undefined && document.getElementById("oaChkPostedOnly")) {
        document.getElementById("oaChkPostedOnly").checked = !!saved.posted_only;
      }
      if (saved.show_totals !== undefined && document.getElementById("oaChkShowTotals")) {
        document.getElementById("oaChkShowTotals").checked = !!saved.show_totals;
      }
      if (saved.negative_red !== undefined && document.getElementById("oaChkNegativeRed")) {
        document.getElementById("oaChkNegativeRed").checked = !!saved.negative_red;
      }

      // Restore dynamic groupings and filters tables
      const eng = getEngine();
      if (eng && typeof eng.restoreSettings === "function") {
        eng.restoreSettings(saved);
      }
    } catch (e) {
      console.warn("loadSavedSettings error:", e);
    }
  }

  function applyAndGenerate() {
    let s = null;
    try {
      s = getSettings();
      saveSettings(s);
    } catch (e) {
      console.warn("getSettings error:", e);
    }

    try {
      const eng = getEngine();
      if (eng && typeof eng.syncDatesToTop === "function") {
        eng.syncDatesToTop();
      }
    } catch (e) {}

    close();

    if (window.MdiManager && typeof MdiManager.activateWindow === "function") {
      try { MdiManager.activateWindow("orderAnalysisWindow"); } catch (e) {}
    }

    if (window.OrderAnalysisReport && typeof OrderAnalysisReport.generate === "function") {
      setTimeout(() => {
        OrderAnalysisReport.generate();
      }, 50);
    }
  }

  function applyAndClose() {
    applyAndGenerate();
  }

  function pickSingleDate(inputId, btn) {
    if (typeof pickDate === "function") {
      pickDate(inputId, btn);
    } else if (window.CalendarPicker && typeof CalendarPicker.open === "function") {
      const inp = document.getElementById(inputId);
      CalendarPicker.open(btn, inp ? inp.value : "", (val) => {
        if (inp) inp.value = val;
        const eng = getEngine();
        if (eng && typeof eng.syncDatesToTop === "function") eng.syncDatesToTop();
      });
    }
  }

  // Auto-init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init,
    open,
    close,
    getSettings,
    applyAndGenerate,
    applyAndClose,
    pickSingleDate,

    // Proxy methods to UniversalReportSettings engine
    syncDatesToTop: () => getEngine()?.syncDatesToTop(),
    updatePeriodLabel: () => getEngine()?.updatePeriodLabel(),
    openPeriodPicker: (btn) => getEngine()?.openPeriodPicker(btn),
    toggleTreeNode: (el) => getEngine()?.toggleTreeNode(el),
    checkAllIndicators: (val) => getEngine()?.checkAllIndicators(val),

    selectGroupingRow: (tr) => getEngine()?.selectGroupingRow(tr),
    addRowGrouping: (f, t) => getEngine()?.addRowGrouping(f, t),
    removeSelectedRowGrouping: () => getEngine()?.removeSelectedRowGrouping(),
    moveRowGroupingUp: () => getEngine()?.moveRowGroupingUp(),
    moveRowGroupingDown: () => getEngine()?.moveRowGroupingDown(),

    addColGrouping: (f, t) => getEngine()?.addColGrouping(f, t),
    removeSelectedColGrouping: () => getEngine()?.removeSelectedColGrouping(),
    moveColGroupingUp: () => getEngine()?.moveColGroupingUp(),
    moveColGroupingDown: () => getEngine()?.moveColGroupingDown(),

    moveGroupingToColumns: () => getEngine()?.moveGroupingToColumns(),
    moveGroupingToRows: () => getEngine()?.moveGroupingToRows(),

    selectFilterRow: (tr) => getEngine()?.selectFilterRow(tr),
    addFilterRow: (f, c, v) => getEngine()?.addFilterRow(f, c, v),
    removeSelectedFilterRow: () => getEngine()?.removeSelectedFilterRow(),
    clearAllFilters: () => getEngine()?.clearAllFilters(),
    saveFiltersPreset: () => alert("Süzgəclər cari sessiyada saxlanıldı.")
  };
})();
