const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');

const domElements = {};
function createElement(id, tag = 'div') {
  return {
    id,
    tagName: tag.toUpperCase(),
    style: { display: 'flex' },
    classList: {
      _classes: new Set(['mdi-window']),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    dataset: {},
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    querySelector(sel) {
      if (sel.includes('.mdi-win-title-text')) return this.titleEl || { textContent: '' };
      if (sel.includes('.mdi-win-icon')) return this.iconEl || { textContent: '' };
      return null;
    },
    querySelectorAll() { return []; },
    cloneNode(deep) {
      const clone = createElement(this.id + '_clone');
      clone.titleEl = { textContent: '' };
      clone.iconEl = { textContent: '' };
      return clone;
    },
    setAttribute() {},
    removeAttribute() {},
    remove() {}
  };
}

domElements['universalJournalWindow'] = createElement('universalJournalWindow');
domElements['universalJournalWindow'].style.display = 'none';
domElements['mdiWorkspace'] = createElement('mdiWorkspace');

const requests = [];
const context = vm.createContext({
  console, AbortController, setTimeout, clearTimeout,
  window: { SessionManager: true, MdiManager: true },
  SessionManager: { getCredentials: () => ({ server: 'Test1C', ref: 'Aztrade_test3', user: 'test' }) },
  MdiManager: {
    activeWindowId: null,
    windows: {},
    registerWindow(id, cfg) { this.windows[id] = cfg; },
    activateWindow(id) { this.activeWindowId = id; },
    closeWindow(id) { delete this.windows[id]; }
  },
  document: {
    documentElement: { classList: { toggle: () => {} } },
    getElementById: id => domElements[id] || null,
    createElement: tag => createElement('temp_' + tag, tag),
    addEventListener: () => {}
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  fetch: (url, options) => new Promise(resolve => requests.push({
    payload: JSON.parse(options.body),
    reply: data => resolve({ json: async () => data })
  }))
});

vm.runInContext(fs.readFileSync('static/js/universal_journal.js', 'utf8'), context);
const UJ = context.window.UniversalJournal;
const MDI = context.MdiManager;

console.log('Testing Multi-Window Universal Journal...');

// 1. Open Realization
const win1 = UJ.openDirect('РеализацияТоваровУслуг');
assert.equal(win1, 'ujWin_РеализацияТоваровУслуг');
assert.ok(UJ.instances['ujWin_РеализацияТоваровУслуг'], 'Realization instance created');
assert.equal(UJ.instances['ujWin_РеализацияТоваровУслуг'].activeDocType, 'РеализацияТоваровУслуг');
assert.equal(MDI.activeWindowId, 'ujWin_РеализацияТоваровУслуг');

// 2. Open Vozvrat
const win2 = UJ.openDirect('ВозвратТоваровОтПокупателя');
assert.equal(win2, 'ujWin_ВозвратТоваровОтПокупателя');
assert.ok(UJ.instances['ujWin_ВозвратТоваровОтПокупателя'], 'Vozvrat instance created');
assert.equal(UJ.instances['ujWin_ВозвратТоваровОтПокупателя'].activeDocType, 'ВозвратТоваровОтПокупателя');
assert.equal(MDI.activeWindowId, 'ujWin_ВозвратТоваровОтПокупателя');

// 3. Confirm BOTH windows exist side-by-side
assert.ok(UJ.instances['ujWin_РеализацияТоваровУслуг']);
assert.ok(UJ.instances['ujWin_ВозвратТоваровОтПокупателя']);
assert.equal(Object.keys(UJ.instances).length, 3); // universalJournalWindow (default) + Realization + Vozvrat

// 4. Duplicate Realization window (➕)
const win3 = UJ.duplicateWindow('ujWin_РеализацияТоваровУслуг');
assert.ok(win3.startsWith('ujWin_РеализацияТоваровУслуг_'), 'Duplicate realization window created');
assert.ok(UJ.instances[win3]);
assert.equal(UJ.instances[win3].activeDocType, 'РеализацияТоваровУслуг');

// 5. Test data isolation
UJ.instances['ujWin_РеализацияТоваровУслуг'].items = [{ number: 'R1' }, { number: 'R2' }];
UJ.instances['ujWin_ВозвратТоваровОтПокупателя'].items = [{ number: 'V1' }];
UJ.instances[win3].items = [{ number: 'R_copy_1' }, { number: 'R_copy_2' }, { number: 'R_copy_3' }];

assert.equal(UJ.instances['ujWin_РеализацияТоваровУслуг'].items.length, 2);
assert.equal(UJ.instances['ujWin_ВозвратТоваровОтПокупателя'].items.length, 1);
assert.equal(UJ.instances[win3].items.length, 3);

// 6. Test active instance switching
MDI.activeWindowId = 'ujWin_ВозвратТоваровОтПокупателя';
assert.equal(UJ.activeDocType, 'ВозвратТоваровОтПокупателя');
assert.equal(UJ.items.length, 1);

MDI.activeWindowId = 'ujWin_РеализацияТоваровУслуг';
assert.equal(UJ.activeDocType, 'РеализацияТоваровУслуг');
assert.equal(UJ.items.length, 2);

MDI.activeWindowId = win3;
assert.equal(UJ.activeDocType, 'РеализацияТоваровУслуг');
assert.equal(UJ.items.length, 3);

// 7. Test closing one window
UJ.close(win3);
assert.equal(UJ.instances[win3], undefined, 'Closed window removed from instances');
assert.ok(UJ.instances['ujWin_РеализацияТоваровУслуг'], 'First realization still intact');
assert.ok(UJ.instances['ujWin_ВозвратТоваровОтПокупателя'], 'Vozvrat still intact');

console.log('✅ ALL MULTI-WINDOW TESTS PASSED 100%!');
