// Opt-in browser measurement harness. Enabled only with ?journal_perf=1.
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.createElement('section');
  panel.id = 'journalPerfPanel';
  panel.style.cssText = 'position:fixed;right:8px;bottom:50px;z-index:999999;background:white;border:2px solid #205080;padding:8px;font:12px monospace;max-width:620px;max-height:70vh;overflow:auto';
  panel.innerHTML = '<strong>Test1C journal paint measurement</strong><div id="journalPerfButtons"></div><pre id="journalPerfResults">Ready</pre>';
  document.body.appendChild(panel);
  document.getElementById('journalPerfResults').style.cssText = 'max-height:220px;overflow:auto';
  let pending = null;
  const results = [];
  panel.dataset.completed = '0';
  const publish = () => {
    panel.dataset.completed = String(results.length);
    document.getElementById('journalPerfResults').textContent = JSON.stringify(results, null, 2);
    panel.querySelectorAll('button').forEach(btn => { btn.disabled = false; });
  };
  const originalRender = UniversalJournal.renderTable;
  UniversalJournal.renderTable = function(...args) {
    const result = originalRender.apply(this, args);
    if (pending && !pending.rendered) {
      const measurement = pending;
      measurement.rendered = performance.now();
      const rows = document.querySelectorAll('#ujTableBody tr.uj-row').length;
      // The first rAF runs before paint; the next frame follows a paint opportunity.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (pending !== measurement) return;
        const win = document.getElementById('universalJournalWindow');
        const loading = document.getElementById('ujLoadingState');
        results.push({ action: measurement.action,
          to_dom_ms: +(measurement.rendered - measurement.start).toFixed(1),
          to_paint_opportunity_ms: +(performance.now() - measurement.start).toFixed(1),
          loaded_rows: UniversalJournal.items.length, visible_dom_rows: rows,
          cached_lists: UniversalJournal.listCache.size,
          cached_rows: [...UniversalJournal.listCache.values()].reduce((sum, entry) => sum + entry.items.length, 0),
          js_heap_mb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
          table_visible: getComputedStyle(win).display !== 'none',
          overlay_hidden: getComputedStyle(loading).display === 'none' });
        pending = null;
        // This benchmark is bounded: do not download millions of documents.
        UniversalJournal.pauseLoading();
        publish();
      }));
    }
    return result;
  };
  function button(label, action) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onclick = () => {
      const creds = SessionManager.getCredentials();
      if (creds.server.toLowerCase() !== 'test1c' || creds.ref.toLowerCase() !== 'aztrade_test3') {
        document.getElementById('journalPerfResults').textContent = 'Blocked: select Test1C / Aztrade_test3';
        return;
      }
      if (pending) return;
      pending = { action: label, start: performance.now(), rendered: null };
      panel.querySelectorAll('button').forEach(button => { button.disabled = true; });
      document.getElementById('journalPerfResults').textContent = 'Measuring ' + label;
      action();
    };
    document.getElementById('journalPerfButtons').appendChild(btn);
  }
  button('First load 2000', () => {
    UniversalJournal._paused = false;
    MdiManager.activateWindow('universalJournalWindow');
    UniversalJournal.startDateStr = UniversalJournal.endDateStr = '';
    UniversalJournal.activeFilters = [];
    document.getElementById('ujSearchInput').value = '';
    UniversalJournal.updatePeriodLabel();
    UniversalJournal.loadDocuments({ force: true, search: '', filters: [] });
  });
  button('Cache reopen 2000', () => UniversalJournal.loadDocuments({ search: '', filters: [] }));
  button('Refresh 2000', () => UniversalJournal.refresh());
  button('Redraw table', () => UniversalJournal.renderTable());
  for (const [name, type] of [
    ['Sales', 'РеализацияТоваровУслуг'], ['Loading', 'ПогрузкиМашин'],
    ['Returns', 'ВозвратТоваровОтПокупателя'], ['Prices', 'УстановкаЦенНоменклатуры'],
    ['Receipts', 'ПоступлениеТоваровУслуг'], ['Orders', 'ЗаказПокупателя'],
    ['Inventory', 'ИнвентаризацияТоваровНаСкладе'], ['Writeoffs', 'СписаниеТоваров'],
    ['Stock receipts', 'ОприходованиеТоваров']
  ]) {
    button('Section ' + name, () => {
      UniversalJournal.activeDocType = type;
      document.getElementById('ujDocTypeSelect').value = type;
      UniversalJournal.selectedRow = null;
      UniversalJournal.activeFilters = [];
      UniversalJournal.startDateStr = UniversalJournal.endDateStr = '';
      UniversalJournal.loadDocuments({ search: '', filters: [] });
    });
  }
  button('Large load 10000', () => {
    UniversalJournal.activeDocType = 'РеализацияТоваровУслуг';
    document.getElementById('ujDocTypeSelect').value = UniversalJournal.activeDocType;
    UniversalJournal.startDateStr = UniversalJournal.endDateStr = '';
    UniversalJournal.activeFilters = [];
    const limit = UniversalJournal.initialChunkLimit;
    UniversalJournal.initialChunkLimit = 10000;
    UniversalJournal.loadDocuments({ force: true, search: '', filters: [] });
    UniversalJournal.initialChunkLimit = limit;
  });
  button('Scroll large list', () => {
    const wrapper = document.getElementById('ujTableWrapper');
    wrapper.scrollTop = Math.max(0, UniversalJournal.items.length - 50) * UniversalJournal.rowHeight;
    UniversalJournal.lastRenderedStart = -1;
    UniversalJournal.renderTable();
  });
  button('Search loaded preview', () => {
    UniversalJournal.activeFilters = [];
    document.getElementById('ujSearchInput').value = 'C000044';
    UniversalJournal.onSearchInput();
  });
  button('Search server results', () => {
    UniversalJournal.loadDocuments({ search: 'C000044', filters: [], background: true, force: true });
  });
  button('Clear search filter', () => {
    UniversalJournal.activeFilters = [];
    document.getElementById('ujSearchInput').value = '';
    UniversalJournal.executeSearchOrFilter();
  });
  button('Filter complete result', () => {
    const base = UniversalJournal.listCache.get(UniversalJournal.getListKey());
    const value = base?.items[0]?.kontragent;
    UniversalJournal.activeFilters = [{ fieldKey: 'kontragent', comparison: 'Равно', value, enabled: true }];
    document.getElementById('ujSearchInput').value = '';
    UniversalJournal.executeSearchOrFilter();
  });
});
