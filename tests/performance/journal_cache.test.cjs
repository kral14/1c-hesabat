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
  window: { SessionManager: true, MdiManager: true, addEventListener() {} },
  SessionManager: { getCredentials: () => ({ server: 'Test1C', ref: 'Aztrade_test3', user: 'test' }) },
  MdiManager: { activeWindowId: 'universalJournalWindow' },
  document: { documentElement: { classList: { toggle: (key, enabled) => enabled ? cursorClasses.add(key) : cursorClasses.delete(key) } }, getElementById: id => elements[id] || null, addEventListener(type, handler) { if (type === 'keydown') keydownHandlers.push(handler); } },
  localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
  fetch: (url, options) => new Promise(resolve => requests.push({
    payload: JSON.parse(options.body), signal: options.signal,
    reply: data => resolve({ json: async () => data })
  }))
});
vm.runInContext(fs.readFileSync('static/js/c1_dates.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('static/js/universal_journal.js', 'utf8') + '\nthis.journal = UniversalJournal;', context);
const journal = context.journal;
const originalSortBy = journal.sortBy;
const originalRenderRow = journal.renderRowHtml;
const originalSelectRow = journal.selectRow;
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
  assert.equal(journal.normalizeFindCustomerQuery('ROYAL-Sagan - Р РЋ000024890 - Р РЋ000024890'),'ROYAL-Sagan');
  assert.equal(journal.normalizeFindCustomerQuery('ROYAL-Sagan'),'ROYAL-Sagan');
  assert.equal(journal.normalizeFindCustomerQuery('Р РЋ000024890'),'Р РЋ000024890');
  journal.loadDocuments();
  assert.equal(requests[0].payload.server, 'Test1C', 'initial request must include the active connection server');
  assert.equal(requests[0].payload.ref, 'Aztrade_test3', 'initial request must include the active database');
  assert.equal(requests[0].payload.user, 'test', 'initial request must include the active user');
  assert.equal(requests[0].payload.limit, 200, 'first package must prioritize visible rows');
  answer(requests.at(-1), ['A', 'B']);
  await flush();
  elements.ujSearchInput.value = 'B';
  stored.set('uj_navigation_mode', 'edge');
  journal.loadDocuments({force:true});
  assert.equal(requests.at(-1).payload.search, 'B', 'switching to a bounded edge page must retain visible search on the server');
  answer(requests.at(-1), ['B']);
  await flush();
  assert.equal(journal.filteredItems.length, 1, 'a matching document must remain visible after changing navigation mode');
  journal.startDateStr = '01.10.2026';
  journal.endDateStr = '31.10.2026';
  journal.loadDocuments({force:true});
  requests.at(-1).reply({success:true, columns:[], items:[{number:'B',date:'30.09.2026 21:00:00'}],
    debug_info:{parameters:{DateFrom:'2026-10-01 00:00:00',DateTo:'2026-10-31 23:59:59'}}});
  await flush();
  assert.equal(journal.filteredItems.length, 0, 'out-of-period edge rows must remain hidden even when the server claims the requested scope');
  journal.loadDocuments({force:true});
  requests.at(-1).reply({success:true, columns:[], items:[{number:'B',date:'30.09.2026 21:00:00'}],
    debug_info:{parameters:{DateFrom:'2026-09-01 00:00:00',DateTo:'2026-09-30 23:59:59'}}});
  await flush();
  assert.equal(journal.filteredItems.length, 0, 'a response scoped to a different period must retain the client guard');
  journal.startDateStr = '';
  journal.endDateStr = '';
  stored.delete('uj_navigation_mode');
  elements.ujSearchInput.value = '';
  journal.loadDocuments({force:true});
  answer(requests.at(-1), ['A', 'B']);
  await flush();
  requests.splice(1);
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
  journal.activeDocType = 'Р В Р ВµР В°Р В»Р С‘Р В·Р В°РЎвЂ Р С‘РЎРЏР СћР С•Р Р†Р В°РЎР‚Р С•Р Р†Р Р€РЎРѓР В»РЎС“Р С–';
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
  assert.equal(filtered.payload.limit, 200, 'server filters must not block on 5000 rows');
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
  journal.activeFilters = [{ fieldKey: 'posted', comparison: 'Р В Р В°Р Р†Р Р…Р С•', value: true, enabled: true }];
  journal.executeSearchOrFilter();
  const firstFilterPage = requests.at(-1);
  assert.equal(elements.ujLoadingState.style.display, 'flex');
  answer(firstFilterPage, ['F1'], true);
  await flush();
  assert.equal(filterRenders, 1, 'first filter page must be published instantly to screen');
  assert.equal(journal.items[0].number, 'F1', 'first page documents appear immediately');
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
  assert.equal(allPage.payload.limit, 10000, 'End/Home must use 10000-row batches');
  const alreadyLoaded = journal.items.length;
  assert.equal(allPage.payload.offset, alreadyLoaded, 'bulk loading must continue from the existing list');
  const duringRequestCount = requests.length;
  journal.requestMoreDocuments(true);
  assert.equal(requests.length, duringRequestCount, 'only one list request may run at a time');
  answer(allPage, Array.from({ length: 10000 }, (_, i) => 'FULL' + i), true);
  await flush();
  assert.equal(journal.items.length, alreadyLoaded + 10000, 'bulk result must append to existing rows');
  await new Promise(resolve => setTimeout(resolve, 160));
  const finalPage = requests.at(-1);
  assert.equal(requests.length, duringRequestCount + 1, 'bulk mode must continue until the period is complete');
  assert.equal(finalPage.payload.limit, 10000, 'each continuation must retain the larger batch size');
  assert.equal(finalPage.payload.offset, alreadyLoaded + 10000);
  answer(finalPage, ['FULL_FINAL']);
  await flush();
  assert.equal(journal.items.length, alreadyLoaded + 10001);
  assert.equal(journal._loadAllRemaining, false);
  assert.equal(cursorClasses.has('uj-loading-all'), false, 'wait cursor must reset after the final page');
  journal.hasMoreDocs = true;
  vm.runInContext('JournalLoadSettings.change({value:"25000",setCustomValidity(){}})', context);
  journal.requestMoreDocuments(true);
  const repeatedPage = requests.at(-1);
  assert.equal(repeatedPage.payload.limit, 25000, 'bulk request must use the user setting');
  vm.runInContext('JournalLoadSettings.change({value:"-2",setCustomValidity(){}})', context);
  assert.equal(stored.get('uj_bulk_chunk_size'), '25000', 'invalid edits must preserve the saved setting');
  const repeatedCount = journal.items.length;
  const requestsBeforeRepeat = requests.length;
  answer(repeatedPage, ['FULL_FINAL'], true);
  await flush();
  await new Promise(resolve => setTimeout(resolve, 160));
  assert.equal(journal.items.length, repeatedCount, 'a repeated page must not inflate the count');
  assert.equal(requests.length, requestsBeforeRepeat, 'a repeated cursor must stop automatic loading');
  assert.equal(journal._loadAllRemaining, false);
  assert.equal(cursorClasses.has('uj-loading-all'), false);
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
  journal.columns = [{ key: 'kontragent', label: 'Р С™Р С•Р Р…РЎвЂљРЎР‚Р В°Р С–Р ВµР Р…РЎвЂљ' }];
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
  journal.commitColumnFilter({ fieldKey: 'kontragent', fieldLabel: 'Р С™Р С•Р Р…РЎвЂљРЎР‚Р В°Р С–Р ВµР Р…РЎвЂљ', comparison: 'Р В Р В°Р Р†Р Р…Р С•', operator: 'Р В Р В°Р Р†Р Р…Р С•', value: 'BAZA MARKET', enabled: true });
  journal.commitColumnFilter({ fieldKey: 'warehouse', fieldLabel: 'Р РЋР С”Р В»Р В°Р Т‘', comparison: 'Р В Р В°Р Р†Р Р…Р С•', operator: 'Р В Р В°Р Р†Р Р…Р С•', value: 'Warehouse A', enabled: true });
  assert.equal(journal.activeFilters.length, 2, 'Ctrl+F filters must stack across columns');
  journal.commitColumnFilter({ fieldKey: 'warehouse', fieldLabel: 'Р РЋР С”Р В»Р В°Р Т‘', comparison: 'Р В Р В°Р Р†Р Р…Р С•', operator: 'Р В Р В°Р Р†Р Р…Р С•', value: 'Warehouse B', enabled: true });
  assert.equal(journal.activeFilters.length, 2, 'editing the same column must update its condition');
  assert.equal(journal.activeFilters[0].value, 'BAZA MARKET', 'adding a warehouse must preserve the customer');
  journal.executeSearchOrFilter = originalExecute;
  journal.selectedRow = { number: 'SELECTED' };
  journal.selectedColKey = 'kontragent';
  const rowHtml = originalRenderRow.call(journal, { number: 'SELECTED', kontragent: 'BAZA MARKET' }, 0,
    [{ key: 'number', width: 100 }, { key: 'kontragent', width: 100 }]);
  assert.equal((rowHtml.match(/class="c1-cell-active"/g) || []).length, 1, 'redrawing must mark exactly one active cell');
  assert.ok(rowHtml.includes('background: #dceaf7'), 'selected row must keep the light background');
  const loadingCols = [{key:'pogruzka_marshrut',width:100}];
  const normalLoading = originalRenderRow.call(journal,{number:'MIXED',pogruzka_marshrut:'R',
    pogruzka_total_count:2,active_pogruzka_count:1,pogruzka_duplicate:false},0,loadingCols);
  const redLoading = originalRenderRow.call(journal,{number:'ACTIVE',pogruzka_marshrut:'R',
    pogruzka_total_count:2,active_pogruzka_count:2,pogruzka_duplicate:true},0,loadingCols);
  assert.ok(!normalLoading.includes('color:#c00000'),'one active plus deleted must stay normal');
  assert.ok(redLoading.includes('color:#c00000'),'two active loadings must be red');
  journal.closeFindModal();
  let endLoadsAll = false;
  journal.requestMoreDocuments = all => { endLoadsAll = all; };
  elements.ujTableWrapper.scrollHeight = 44000;
  keydownHandlers[0]({ key: 'End', ctrlKey: false, metaKey: false, altKey: false,
    target: { closest: () => null }, preventDefault() {}, stopPropagation() {} });
  assert.equal(endLoadsAll, true, 'plain End must request the complete remaining list');
  assert.equal(elements.ujTableWrapper.scrollTop, 44000);
  endLoadsAll = false;
  journal.hasMoreDocs = true;
  journal.updateEditButtonState = () => {};
  journal.selectRow = originalSelectRow;
  elements.ujTableBody.querySelectorAll = () => [];
  keydownHandlers[0]({ key: 'Home', ctrlKey: false, metaKey: false, altKey: false,
    target: { closest: () => null }, preventDefault() {}, stopPropagation() {} });
  assert.equal(endLoadsAll, true, 'Home must also request bulk loading');
  assert.equal(elements.ujTableWrapper.scrollTop, 0, 'Home must stay at the first row');
  assert.equal(journal.selectedRow, journal.filteredItems[0], 'Home must select the actual first visible row');
  journal.hasMoreDocs = false;
  // Verify the real selection method used by edge navigation without a mock alias.
  journal.selectRow(journal.filteredItems.length - 1);
  assert.equal(journal.selectedRow, journal.filteredItems.at(-1));
  const makeCell = key => ({style:{}, getAttribute:()=>key,
    classList:{add(){},remove(){}}});
  const redCell = makeCell('pogruzka_marshrut');
  const normalCell = makeCell('pogruzka_marshrut');
  const tableRows = [redCell,normalCell].map((cell,index)=>({style:{},
    getAttribute:()=>String(index),querySelectorAll:()=>[cell]}));
  journal.filteredItems = [{number:'RED',active_pogruzka_count:2,pogruzka_duplicate:true},
    {number:'NORMAL',active_pogruzka_count:1,pogruzka_duplicate:false,pogruzka_total_count:2}];
  elements.ujTableBody.querySelectorAll = () => tableRows;
  journal.selectedColKey = 'number';
  journal.selectRow(1);
  assert.equal(redCell.style.color,'#c00000','selecting another filtered row must preserve duplicate red');
  assert.equal(normalCell.style.color,'#111111','mixed active/deleted must remain normal');
  journal.selectRow(0,'number');
  assert.equal(redCell.style.color,'#c00000','selecting a duplicate row must preserve red in other cells');
  elements.ujTableBody.querySelectorAll = () => [];
  // Opening a window must initialize state, not merely reuse a copied period label.
  context.window.PeriodPicker = true;
  context.PeriodPicker = { getRememberedPeriod: () => ({startDate:'01.04.2026',endDate:'30.04.2026'}) };
  context.MdiManager.registerWindow = () => {};
  context.MdiManager.activateWindow = id => { context.MdiManager.activeWindowId = id; };
  elements.universalJournalWindow.classList = { remove() {} };
  journal.startDateStr = '';
  journal.endDateStr = '';
  journal.loadActiveFiltersFromStorage = () => {};
  let openingPeriod;
  journal.loadDocuments = function() { openingPeriod = [this.startDateStr, this.endDateStr]; };
  journal.openDirect('Р В Р ВµР В°Р В»Р С‘Р В·Р В°РЎвЂ Р С‘РЎРЏР СћР С•Р Р†Р В°РЎР‚Р С•Р Р†Р Р€РЎРѓР В»РЎС“Р С–', {forceNew:true,windowId:'universalJournalWindow'});
  assert.deepEqual(openingPeriod, ['01.04.2026','30.04.2026'], 'first load must receive the remembered period');
  stored.set('uj_navigation_mode','edge');
  let navigationOptions;
  journal.loadDocuments = options => { navigationOptions = options; };
  keydownHandlers[0]({key:'End',target:{closest:()=>null},preventDefault(){},stopPropagation(){}});
  assert.equal(navigationOptions.edge,'end','edge mode End must request one last page');
  keydownHandlers[0]({key:'Home',target:{closest:()=>null},preventDefault(){},stopPropagation(){}});
  assert.equal(navigationOptions.edge,'home','edge mode Home must request one first page');
  console.log('Journal cache checks passed (mock requests; no database connection).');
})().catch(error => { journal.pauseLoading(); console.error(error); process.exitCode = 1; });
