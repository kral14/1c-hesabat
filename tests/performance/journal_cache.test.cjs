const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = {
  universalJournalWindow: { style: { display: 'flex' } },
  ujSearchInput: { value: '' },
  ujLoadingState: { style: { display: 'none' } }
};
const requests = [];
const stored = new Map();
const cursorClasses = new Set();
const keydownHandlers = [];
const context = vm.createContext({
  console, AbortController, setTimeout, clearTimeout,
  window: { SessionManager: true, MdiManager: true },
  SessionManager: { getCredentials: () => ({ server: 'Test1C', ref: 'Aztrade_test3', user: 'test' }) },
  MdiManager: { activeWindowId: 'universalJournalWindow' },
  document: { documentElement: { classList: { toggle: (key, enabled) => enabled ? cursorClasses.add(key) : cursorClasses.delete(key) } }, getElementById: id => elements[id] || null, addEventListener(type, handler) { if (type === 'keydown') keydownHandlers.push(handler); } },
  localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
  fetch: (url, options) => new Promise(resolve => requests.push({
    payload: JSON.parse(options.body), signal: options.signal,
    reply: data => resolve({ json: async () => data })
  }))
});
vm.runInContext(fs.readFileSync('static/js/universal_journal.js', 'utf8') + '\nthis.journal = UniversalJournal;', context);
const journal = context.journal;
const originalSortBy = journal.sortBy;
const originalRenderRow = journal.renderRowHtml;
for (const method of ['updateStatus', 'updateCountBadge', 'updateActiveFilterBadgeUI',
  'updateFilterButtonsState', 'updateBottomLoadingState', 'updateHeaderSearchHighlights']) journal[method] = () => {};
journal.loadColumnsConfig = columns => { journal.defaultColumns = columns; };
journal.applyFiltersAndSearch = () => {
  const q = elements.ujSearchInput.value;
  journal.filteredItems = journal.items.filter(item => !q || item.number.includes(q));
};
journal.checkAndApplyStartupFilter = journal.applyFiltersAndSearch;
const flush = () => new Promise(resolve => setImmediate(resolve));
const answer = (request, numbers, more = false) => request.reply({
  success: true, items: numbers.map(number => ({ number })), columns: [], has_more: more,
  last_number: numbers.at(-1), last_date: '2026-10-01', doc_title: 'Test journal'
});

(async () => {
  journal.loadDocuments();
  assert.equal(requests[0].payload.limit, 2000, 'first package must prioritize visible rows');
  answer(requests.at(-1), ['A', 'B']);
  await flush();
  elements.ujSearchInput.value = 'A';
  journal.onSearchInput();
  assert.equal(journal._searchDebounceTimer, null, 'cached search must not wait for debounce');
  assert.equal(requests.length, 1, 'complete list search must stay local');
  assert.equal(journal.filteredItems.length, 1);
  elements.ujSearchInput.value = '';
  journal.executeSearchOrFilter();
  assert.equal(requests.length, 1, 'clearing search must restore list without fetching');
  assert.equal(journal.items.length, 2);
  journal.loadDocuments();
  assert.equal(requests.length, 1, 'reopening must reuse cache');
  const originalKey = journal.getListKey();
  journal.startDateStr = '01.09.2026';
  assert.notEqual(journal.getListKey(), originalKey, 'period must isolate cache');
  journal.startDateStr = '';
  const originalCredentials = context.SessionManager.getCredentials;
  context.SessionManager.getCredentials = () => ({ server: 'Other', ref: 'Other', user: 'test' });
  assert.notEqual(journal.getListKey(), originalKey, 'connection must isolate cache');
  context.SessionManager.getCredentials = originalCredentials;
  journal.refresh();
  assert.equal(elements.ujLoadingState.style.display, 'none', 'refresh must keep the current table visible');
  assert.equal(journal.items.length, 2, 'current rows must remain until refreshed data arrives');
  assert.equal(requests.length, 2, 'explicit refresh must fetch');
  answer(requests.at(-1), ['C']);
  await flush();

  journal.activeDocType = 'Other';
  journal.loadDocuments();
  assert.equal(requests.length, 3, 'another section needs its own list');
  const stale = requests.at(-1);
  journal.activeDocType = 'РеализацияТоваровУслуг';
  journal.loadDocuments();
  assert.equal(journal.items[0].number, 'C');
  answer(stale, ['STALE']);
  await flush();
  assert.equal(journal.items[0].number, 'C', 'late response must not overwrite active section');

  journal.refresh();
  answer(requests.at(-1), ['P'], true);
  await flush();
  journal.pauseLoading();
  elements.ujSearchInput.value = 'Z';
  const beforeTyping = requests.length;
  journal.onSearchInput();
  assert.equal(journal.filteredItems.length, 0, 'partial-list preview must update synchronously');
  assert.equal(requests.length, beforeTyping, 'typing must not issue an immediate server request');
  journal.activeSearchColKey = 'number';
  journal.loadDocuments({ search: 'Z', filters: [], background: true });
  const filtered = requests.at(-1);
  assert.equal(filtered.payload.limit, 2000, 'server filters must not block on 5000 rows');
  assert.equal(filtered.payload.search_field, 'number', 'server query must honor selected search column');
  assert.equal(elements.ujLoadingState.style.display, 'none', 'local preview must remain visible');
  answer(filtered, ['Z'], true);
  await flush();
  journal.fetchNextChunk(journal.currentLoadSessionId);
  const continuation = requests.at(-1);
  assert.equal(continuation.payload.search, 'Z', 'later pages must preserve search');
  assert.equal(continuation.payload.search_field, 'number');
  assert.equal(continuation.payload.offset, 1);
  assert.equal(continuation.payload.last_date, '', 'filtered pages must use offset pagination');
  const beforeHeaderClick = requests.length;
  journal.onHeaderClick('kontragent');
  assert.equal(requests.length, beforeHeaderClick, 'sorting another column must not issue a different search');
  assert.equal(journal.activeSearchColKey, 'number', 'header clicks must preserve Find column');
  journal.activeSearchColKey = journal.selectedColKey = 'number';
  journal.pauseLoading();
  elements.ujSearchInput.value = '';
  const count = requests.length;
  journal.executeSearchOrFilter();
  assert.equal(requests.length, count, 'partial base must survive a server filter');
  assert.equal(journal.items[0].number, 'P');
  assert.equal(journal.hasMoreDocs, true);
  journal.pauseLoading();
  context.MdiManager.activeWindowId = 'other';
  journal.fetchNextChunk(journal.currentLoadSessionId);
  assert.equal(requests.length, count, 'inactive journal must not load pages');
  context.MdiManager.activeWindowId = 'universalJournalWindow';
  journal.onWindowActivityChange('universalJournalWindow');
  assert.equal(journal.items[0].number, 'P');
  journal.pauseLoading();
  assert.equal(filtered.signal.aborted, true);
  assert.equal(continuation.signal.aborted, true, 'clearing search must cancel old result pages');
  // An incomplete base must never publish a partial filter result.
  let filterRenders = 0;
  const apply = journal.applyFiltersAndSearch;
  journal.applyFiltersAndSearch = () => { filterRenders++; apply(); };
  journal.activeFilters = [{ fieldKey: 'posted', comparison: 'Равно', value: true, enabled: true }];
  journal.executeSearchOrFilter();
  const firstFilterPage = requests.at(-1);
  assert.equal(elements.ujLoadingState.style.display, 'flex');
  answer(firstFilterPage, ['F1'], true);
  await flush();
  assert.equal(filterRenders, 0, 'first filter page must stay unpublished');
  assert.equal(journal.items[0].number, 'P', 'current list stays intact until full result is ready');
  const finalFilterPage = requests.at(-1);
  assert.equal(finalFilterPage.payload.offset, 1);
  assert.equal(finalFilterPage.payload.filters[0].fieldKey, 'posted');
  answer(finalFilterPage, ['F2']);
  await flush();
  assert.equal(filterRenders, 1, 'complete filter result must render exactly once');
  assert.equal(journal.items.length, 2);
  assert.equal(journal.hasMoreDocs, false);
  assert.equal(elements.ujLoadingState.style.display, 'none');
  journal.activeFilters = [];
  journal.executeSearchOrFilter();
  assert.equal(journal.items[0].number, 'P', 'clearing filter must restore the base cache');
  journal.pauseLoading();
  const idleRequests = requests.length;
  journal.scheduleBackgroundChunk(journal.currentLoadSessionId);
  await new Promise(resolve => setTimeout(resolve, 160));
  assert.equal(requests.length, idleRequests, 'an idle journal must not automatically download the remaining list');
  journal.requestMoreDocuments(true);
  assert.equal(cursorClasses.has('uj-loading-all'), true, 'explicit full loading must show wait cursor');
  await new Promise(resolve => setTimeout(resolve, 160));
  const allPage = requests.at(-1);
  assert.equal(allPage.payload.limit, 0, 'End must remove the server row limit');
  assert.equal(allPage.payload.offset, 0, 'End must fetch the entire period in one request');
  const duringRequestCount = requests.length;
  journal.requestMoreDocuments(true);
  assert.equal(requests.length, duringRequestCount, 'only one list request may run at a time');
  answer(allPage, Array.from({ length: 87000 }, (_, i) => 'FULL' + i));
  await flush();
  assert.equal(journal.items.length, 87000, 'all 87000 results must become available together');
  assert.equal(requests.length, duringRequestCount, 'full result must not trigger additional page requests');
  assert.equal(journal._loadAllRemaining, false);
  assert.equal(cursorClasses.has('uj-loading-all'), false, 'wait cursor must reset after the final page');
  // A deep scroll from a large section must still render rows in a smaller list.
  elements.ujTableWrapper = { scrollTop: 220000, clientHeight: 500 };
  elements.ujTableBody = { innerHTML: '' };
  journal.filteredItems = Array.from({ length: 150 }, (_, i) => ({ number: String(i) }));
  journal.getVisibleColumns = () => [];
  journal.renderRowHtml = row => `<tr>${row.number}</tr>`;
  journal.lastRenderedStart = -1;
  journal.updateVirtualRows();
  assert.ok(journal.lastRenderedStart < 150, 'visible range must stay within the smaller list');
  assert.ok(elements.ujTableBody.innerHTML.includes('<tr>'), 'smaller section must display document rows');
  elements.ujSearchInput.value = '';
  journal.activeSearchColKey = 'number';
  journal.sortBy = () => {};
  journal.onHeaderClick('kontragent');
  assert.equal(journal.activeSearchColKey, 'number', 'column selection must not alter stored Find mode');
  journal.selectRow = (idx, key) => { journal.selectedColKey = key; };
  journal.selectCell(0, 'warehouse');
  assert.equal(journal.activeSearchColKey, 'number', 'cell selection must preserve Find mode');
  journal.activeSearchColKey = 'kontragent';
  elements.ujSearchInput.value = 'TEST 12B';
  const beforeCellRequests = requests.length;
  const beforeCellResults = journal.filteredItems.length;
  journal.selectCell(0, 'amount');
  assert.equal(journal.activeSearchColKey, 'kontragent', 'clicking amount must not search customer name in amount');
  assert.equal(journal.filteredItems.length, beforeCellResults);
  assert.equal(requests.length, beforeCellRequests, 'cell selection must not issue another search');
  elements.ujSearchInput.value = '';
  journal.searchMatchMode = 'starts';
  assert.equal(journal.matchesSearchText('TEST 12B', 'test'), true);
  assert.equal(journal.matchesSearchText('A TEST 12B', 'test'), false);
  journal.searchMatchMode = 'exact';
  assert.equal(journal.matchesSearchText('TEST 12B', 'test 12b'), true);
  assert.equal(journal.matchesSearchText('TEST 12B extra', 'test 12b'), false);
  journal.renderTable = journal.applySort = () => {};
  journal.activeDocType = 'Sales';
  originalSortBy.call(journal, 'amount');
  originalSortBy.call(journal, 'amount');
  journal.currentSortCol = 'date';
  journal.currentSortAsc = true;
  journal.loadSortPreference();
  assert.equal(journal.currentSortCol, 'amount');
  assert.equal(journal.currentSortAsc, false, 'descending preference must survive reopen');
  journal.activeDocType = 'Other';
  journal.loadSortPreference();
  assert.equal(journal.currentSortCol, 'date', 'sort preferences must be separate per section');
  elements.ujFindModal = { style: {}, querySelectorAll: () => [] };
  elements.ujFindColumn = {};
  elements.ujFindText = { focus() {}, select() {} };
  journal.columns = [{ key: 'kontragent', label: 'Контрагент' }];
  journal.selectedColKey = 'kontragent';
  journal.selectedRow = { kontragent: 'BAZA MARKET' };
  elements.ujSearchInput.value = 'old search';
  journal.openFindModal();
  assert.equal(elements.ujFindText.value, 'BAZA MARKET', 'Ctrl+F must seed the selected cell text');
  journal.openFindModal('b');
  assert.equal(elements.ujFindText.value, 'b', 'typing must retain the first typed character');
  const originalExecute = journal.executeSearchOrFilter;
  journal.executeSearchOrFilter = () => {};
  journal.activeFilters = [];
  journal.commitColumnFilter({ fieldKey: 'kontragent', fieldLabel: 'Контрагент', comparison: 'Равно', operator: 'Равно', value: 'BAZA MARKET', enabled: true });
  journal.commitColumnFilter({ fieldKey: 'warehouse', fieldLabel: 'Склад', comparison: 'Равно', operator: 'Равно', value: 'Warehouse A', enabled: true });
  assert.equal(journal.activeFilters.length, 2, 'Ctrl+F filters must stack across columns');
  journal.commitColumnFilter({ fieldKey: 'warehouse', fieldLabel: 'Склад', comparison: 'Равно', operator: 'Равно', value: 'Warehouse B', enabled: true });
  assert.equal(journal.activeFilters.length, 2, 'editing the same column must update its condition');
  assert.equal(journal.activeFilters[0].value, 'BAZA MARKET', 'adding a warehouse must preserve the customer');
  journal.executeSearchOrFilter = originalExecute;
  journal.selectedRow = { number: 'SELECTED' };
  journal.selectedColKey = 'kontragent';
  const rowHtml = originalRenderRow.call(journal, { number: 'SELECTED', kontragent: 'BAZA MARKET' }, 0,
    [{ key: 'number', width: 100 }, { key: 'kontragent', width: 100 }]);
  assert.equal((rowHtml.match(/class="c1-cell-active"/g) || []).length, 1, 'redrawing must mark exactly one active cell');
  assert.ok(rowHtml.includes('background: #dceaf7'), 'selected row must keep the light background');
  journal.closeFindModal();
  let endLoadsAll = false;
  journal.requestMoreDocuments = all => { endLoadsAll = all; };
  elements.ujTableWrapper.scrollHeight = 44000;
  keydownHandlers[0]({ key: 'End', ctrlKey: false, metaKey: false, altKey: false,
    target: { closest: () => null }, preventDefault() {}, stopPropagation() {} });
  assert.equal(endLoadsAll, true, 'plain End must request the complete remaining list');
  assert.equal(elements.ujTableWrapper.scrollTop, 44000);
  console.log('Journal cache checks passed (mock requests; no database connection).');
})().catch(error => { journal.pauseLoading(); console.error(error); process.exitCode = 1; });
