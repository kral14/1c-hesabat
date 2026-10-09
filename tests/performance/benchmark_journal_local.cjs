// Measures actual journal filtering, sorting, cache restoration and row HTML generation.
// Minimal DOM stand-ins exclude browser layout/paint and all network/database time.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const elements = {
  universalJournalWindow: { style: { display: 'flex' } },
  ujSearchInput: { value: '' },
  ujTableBody: { innerHTML: '' },
  ujTableWrapper: { scrollTop: 0, clientHeight: 500, addEventListener() {} }
};
let requests = 0;
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} }, AbortController, setTimeout, clearTimeout,
  window: { SessionManager: true, MdiManager: true },
  SessionManager: { getCredentials: () => ({ server: 'Test1C', ref: 'Aztrade_test3', user: 'test' }) },
  MdiManager: { activeWindowId: 'universalJournalWindow' },
  localStorage: { getItem: () => null },
  document: { getElementById: id => elements[id] || null, addEventListener() {} },
  fetch: () => { requests++; throw Error('Unexpected network request during local benchmark'); }
});
vm.runInContext(fs.readFileSync('static/js/universal_journal.js', 'utf8') + '\nthis.journal = UniversalJournal;', context);
const journal = context.journal;
for (const method of ['updateStatus', 'updateCountBadge', 'updateActiveFilterBadgeUI',
  'updateFilterButtonsState', 'updateBottomLoadingState', 'updateSearchIcon', 'renderTableHead']) {
  journal[method] = () => {};
}
const fields = ['status', 'date', 'number', 'kontragent', 'kontragent_code', 'portfolio',
  'amount', 'warehouse', 'deal', 'obrabotka_number', 'vms_status', 'contract',
  'contract_price_type', 'pogruzka_marshrut', 'pogruzka_voditel', 'responsible', 'comment'];
const columns = fields.map(key => ({ key, label: key, width: 120, visible: true }));
journal.loadColumnsConfig = cols => { journal.defaultColumns = cols; journal.columns = cols; };
journal.loadColumnsConfig(columns);
function measure(action) {
  for (let i = 0; i < 5; i++) action();
  const times = [];
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    action();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { median_ms: +times[15].toFixed(2), p95_ms: +times[28].toFixed(2) };
}
const report = { scope: 'synthetic data; actual journal JS; excludes browser layout/paint and network', cases: [] };
for (const count of [1500, 10000, 30000]) {
  journal.items = Array.from({ length: count }, (_, i) => Object.assign(
    Object.fromEntries(fields.map(key => [key, 'Sample value'])), {
      number: `TEST${String(i).padStart(8, '0')}`, date: '07.10.2026 12:00:00',
      amount: i * 1.25, posted: true, kontragent: `Customer ${i % 100}`
    }));
  journal.activeFilters = [];
  journal._listKey = journal.getListKey();
  journal._listReady = true;
  journal.hasMoreDocs = false;
  journal.saveListCache();
  const entry = { rows: count };
  entry.cache_reopen = measure(() => journal.loadDocuments({ search: '', filters: [] }));
  journal.activeFilters = [{ fieldKey: 'kontragent', comparison: 'Равно', value: 'Customer 5', enabled: true }];
  entry.filter = measure(() => journal.executeSearchOrFilter());
  assert.equal(journal.filteredItems.length, count / 100);
  journal.activeFilters = [];
  elements.ujSearchInput.value = '00001';
  journal.activeSearchColKey = 'number';
  entry.search = measure(() => journal.executeSearchOrFilter());
  elements.ujSearchInput.value = '';
  entry.clear_filter_search = measure(() => journal.executeSearchOrFilter());
  assert.equal(journal.filteredItems.length, count);
  report.cases.push(entry);
}
report.network_requests = requests;
assert.equal(requests, 0);
fs.writeFileSync('tests/journal_local_benchmark_results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
