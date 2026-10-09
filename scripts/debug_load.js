const fs = require('fs');
const vm = require('vm');

const elements = {
  universalJournalWindow: { style: { display: 'flex' } },
  ujSearchInput: { value: '' },
  ujLoadingState: { style: { display: 'none' } }
};
const requests = [];
const stored = new Map();
const context = vm.createContext({
  console, AbortController, setTimeout, clearTimeout,
  window: { SessionManager: true, MdiManager: true },
  SessionManager: { getCredentials: () => ({ server: 'Test1C', ref: 'Aztrade_test3', user: 'test' }) },
  MdiManager: { activeWindowId: 'universalJournalWindow' },
  document: {
    documentElement: { classList: { toggle: () => {} } },
    getElementById: id => elements[id] || null,
    addEventListener: () => {}
  },
  localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
  fetch: (url, options) => new Promise(resolve => requests.push({
    payload: JSON.parse(options.body), signal: options.signal,
    reply: data => resolve({ json: async () => data })
  }))
});

vm.runInContext(fs.readFileSync('static/js/universal_journal_test.js', 'utf8') + '\nthis.journal = UniversalJournal;', context);
const journal = context.journal;

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
  console.log('requests length:', requests.length);
  answer(requests.at(-1), ['A', 'B']);
  await flush();
  console.log('inst._listReady:', journal.getActiveInstance()._listReady);
  console.log('journal._listReady:', journal._listReady);
  console.log('inst.items:', journal.getActiveInstance().items);
  console.log('journal.items:', journal.items);

  elements.ujSearchInput.value = 'A';
  journal.onSearchInput();
  console.log('journal.filteredItems:', journal.filteredItems);
})();
