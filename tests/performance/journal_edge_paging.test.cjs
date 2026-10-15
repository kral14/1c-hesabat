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
  // Edge pages must continue past 200, prepending earlier rows after End.
  journal._edgeNavigation = 'end';
  journal._paused = false;
  journal.hasMoreDocs = true;
  journal.isLoadingBackground = false;
  journal._listQuery = {search:'',filters:[]};
  journal.startDateStr = '';
  journal.endDateStr = '';
  journal.items = Array.from({length:200},(_,i)=>({number:String(i+400),date:'15.10.2026 09:00:00'}));
  journal._listAbortController = new AbortController();
  journal.applyFiltersAndSearch = function(){this.filteredItems=this.items;};
  journal.updateVirtualRows = () => {};
  journal.rowHeight = 24;
  elements.ujTableWrapper = {scrollTop:10,scrollHeight:4800,clientHeight:500};
  journal.fetchEdgeMore();
  const previousPage = requests.at(-1);
  assert.equal(previousPage.payload.offset,200);
  assert.equal(previousPage.payload.navigation_edge,'end');
  previousPage.reply({success:true,has_more:true,items:Array.from({length:200},(_,i)=>({number:String(i+200)}))});
  await flush(); await flush();
  assert.equal(journal.items.length,400,'End must allow more than 200 documents');
  assert.equal(journal.items[0].number,'200','previous page must prepend');
  assert.equal(journal.hasMoreDocs,true);
  journal.fetchEdgeMore();
  assert.equal(requests.at(-1).payload.offset,400);
  requests.at(-1).reply({success:true,has_more:false,items:[{number:'199'}]});
  await flush(); await flush();
  assert.equal(journal.items.length,401);
  assert.equal(journal.hasMoreDocs,false);
  const events = {};
  journal.hasMoreDocs = true;
  const wrapper = elements.ujTableWrapper;
  wrapper.scrollTop = 0;
  wrapper.addEventListener = (type,handler) => {events[type]=handler;};
  journal.attachVirtualScrollListener();
  const beforeWheel = requests.length;
  events.wheel({deltaY:-120});
  assert.equal(requests.length,beforeWheel+1,'wheel at the top must fetch even without a scroll event');
  events.wheel({deltaY:-120});
  assert.equal(requests.length,beforeWheel+1,'repeated wheel must not overlap requests');
  requests.at(-1).reply({success:true,has_more:false,items:[]});
  await flush(); await flush();
  console.log('Edge paging: 200 -> 400 -> 401 passed; no database connection.');
})().catch(error => { console.error(error); process.exitCode=1; });
