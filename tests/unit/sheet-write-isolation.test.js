const assert = require('assert');

// Each tab gets its own sessionStorage; all tabs share one localStorage.
// Every access is logged so tests can check which keys were touched.
const accesses = [];
function storage(area) {
    return {
        data: {},
        getItem(key) { accesses.push([area, 'get', key]); return this.data[key] ?? null; },
        setItem(key, value) { accesses.push([area, 'set', key]); this.data[key] = String(value); },
        removeItem(key) { accesses.push([area, 'remove', key]); delete this.data[key]; }
    };
}
const listeners = {};
window.addEventListener = (name, listener) => { listeners[name] = listener; };
window.confirm = () => true;

// Same minimal DOM as shortsave.test.js: only what the sheet and page load use.
function element(node, tagName) {
    node.tagName = tagName;
    node.textContent = '';
    const classes = new Set();
    node.classList = {
        contains: name => classes.has(name),
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name))
    };
    node.getAttribute = name => node.attributes[name] ?? null;
    node.removeAttribute = name => delete node.attributes[name];
    node.focus = () => {};
    return node;
}

// A page load in a tab: a fresh module instance, as after a browser reload.
function load(tab) {
    window.sessionStorage = tab;
    window.location = new URL('https://example.test/jotsum.html');
    delete require.cache[require.resolve('../../jotsum.js')];
    const api = require('../../jotsum.js');
    const sheet = element(new api.JoSheet(), 'JO-SHEET');
    sheet.children = [];
    sheet.querySelectorAll = () => sheet.children.filter(node => node.tagName === 'JO-LINE');
    sheet.appendChild = node => {
        const previous = sheet.children[sheet.children.length - 1];
        if (previous) previous.nextElementSibling = node;
        sheet.children.push(node);
    };
    sheet.removeChild = node => sheet.children.splice(sheet.children.indexOf(node), 1);
    Object.defineProperty(sheet, 'firstChild', { get: () => sheet.children[0] });
    const total = element(new HTMLElement(), 'SPAN');
    global.document = {
        getElementById: id => id === 'sheet' ? sheet : total,
        createElement: tag => element(tag === 'jo-line' ? new api.JoLine() : new HTMLElement(), tag.toUpperCase()),
        addEventListener: () => {}
    };
    window.history = { replaceState: (_state, _title, url) => { window.location = new URL(url); } };
    window.onload();
    return {
        api, sheet, total,
        texts: () => sheet.querySelectorAll().map(line => line.textContent),
        active: () => (api.list_shortsaves().find(entry => entry.active) || {}).id ?? null,
        edit(text) {
            sheet.querySelectorAll()[0].textContent = text;
            sheet.update_total();
        }
    };
}

function test(name, run) {
    window.localStorage = storage('local');
    accesses.length = 0;
    run();
    for (const [area, op, key] of accesses) {
        assert.ok(!(area === 'local' && op !== 'get' && key === 'jotsum.active'), `${name}: wrote jotsum.active`);
    }
    console.log(`${name} passed!`);
}

function two_sheets(tab) {
    const page = load(tab);
    page.edit('A 10');
    const a = page.active();
    page.api.new_sheet();
    page.edit('B 20');
    return { page, a, b: page.active() };
}


// Store entry shapes are those emitted by update_total in persistence.test.js.
const key = 'jotsum.sheets';
const entries = () => JSON.parse(window.localStorage.getItem(key));
const put = value => window.localStorage.setItem(key, JSON.stringify(value));
function seeded() {
    window.localStorage.setItem('jotsum.migrated', '1');
    put([{ id: 'A', lines: ['A 10'] }, { id: 'B', lines: ['B 20'] }, { id: 'C', lines: ['C 30'] }]);
    const tab = storage('session');
    tab.setItem('jotsum.selected', 'A');
    return { tab, page: load(tab) };
}
test('saving preserves foreign additions, edits and deletions without an event', () => {
    const { page } = seeded();
    put([{ id: 'A', lines: ['Remote A 99'] }, { id: 'B', lines: ['Remote B 88'], future: true }, { id: 'D', lines: ['New 40'] }]);
    page.edit('Local A 11');
    assert.deepStrictEqual(entries(), [{ id: 'A', lines: ['Local A 11'] }, { id: 'B', lines: ['Remote B 88'], future: true }, { id: 'D', lines: ['New 40'] }]);
});
test('delayed delete confirmation uses the store after the foreign write', () => {
    const { page } = seeded();
    window.confirm = () => {
        put([{ id: 'A', lines: ['Foreign A 77'] }, { id: 'B', lines: ['B 20'] }, { id: 'D', lines: ['New 40'] }]);
        return true;
    };
    page.api.delete_shortsave('B');
    assert.deepStrictEqual(entries(), [{ id: 'A', lines: ['Foreign A 77'] }, { id: 'D', lines: ['New 40'] }]);
    assert.deepStrictEqual(page.texts(), ['A 10']);
});
test('editing a remotely deleted open sheet retains its association', () => {
    const { tab, page } = seeded();
    put([{ id: 'D', lines: ['New 40'] }]);
    page.edit('Local A 12');
    assert.strictEqual(tab.getItem('jotsum.selected'), 'A');
    assert.deepStrictEqual(entries(), [{ id: 'D', lines: ['New 40'] }, { id: 'A', lines: ['Local A 12'] }]);
});

test('the final mutation read preserves a write after the initial read', () => {
    const { page } = seeded();
    const get = window.localStorage.getItem;
    let reads = 0;
    window.localStorage.getItem = function(name) {
        if (name === key && ++reads === 2) {
            put([{ id: 'A', lines: ['A 10'] }, { id: 'D', lines: ['Late 55'] }]);
        }
        return get.call(this, name);
    };
    try {
        page.edit('A 12');
    } finally {
        window.localStorage.getItem = get;
    }
    assert.deepStrictEqual(entries(), [{ id: 'A', lines: ['A 12'] }, { id: 'D', lines: ['Late 55'] }]);
});

test('failed mutations on multiple sheets retry without reviving foreign deletions', () => {
    const { page } = seeded();
    const set = window.localStorage.setItem;
    window.localStorage.setItem = function(name, value) {
        if (name === key) throw new Error('Full');
        return set.call(this, name, value);
    };
    page.api.save_store([{ id: 'A', lines: ['Pending A 11'] }], 'A');
    page.api.save_store([], 'B');
    assert.deepStrictEqual(page.api.load_store(), [
        { id: 'A', lines: ['Pending A 11'] }, { id: 'C', lines: ['C 30'] }
    ]);
    window.localStorage.setItem = set;
    put([{ id: 'A', lines: ['A 10'] }, { id: 'B', lines: ['B 20'] }, { id: 'D', lines: ['Remote 40'] }]);
    page.api.save_store([{ id: 'E', lines: ['New 50'] }], 'E');
    assert.deepStrictEqual(entries(), [
        { id: 'A', lines: ['Pending A 11'] }, { id: 'D', lines: ['Remote 40'] },
        { id: 'E', lines: ['New 50'] }
    ]);
    assert.deepStrictEqual(page.api.load_store(), entries());
});

test('corrupt store preserves known sheets through reads and the next write', () => {
    const { page } = seeded();
    window.localStorage.setItem(key, '{broken');
    assert.deepStrictEqual(page.api.load_store().map(entry => entry.id), ['A', 'B', 'C']);
    page.edit('A 12');
    assert.deepStrictEqual(entries(), [
        { id: 'A', lines: ['A 12'] }, { id: 'B', lines: ['B 20'] }, { id: 'C', lines: ['C 30'] }
    ]);
    assert.ok(Object.entries(window.localStorage.data).some(([name, value]) =>
        name.startsWith(key + '.broken.') && value === '{broken'));
});

test('migration from a corrupt store retains its pending sheet until a successful write', () => {
    window.localStorage.setItem(key, '{broken');
    window.localStorage.setItem('jotsum.sheet', JSON.stringify(['Legacy 10']));
    const set = window.localStorage.setItem;
    window.localStorage.setItem = function(name, value) {
        if (name === key) throw new Error('Full');
        return set.call(this, name, value);
    };
    const page = load(storage('session'));
    window.localStorage.setItem = set;
    const migrated = page.api.load_store().find(entry => entry.lines[0] === 'Legacy 10');
    assert.ok(migrated);
    assert.strictEqual(window.localStorage.getItem('jotsum.migrated'), null);
    // A readable foreign store arriving before retry must keep both sheets.
    put([{ id: 'remote', lines: ['Remote 20'] }]);
    page.api.save_store([{ id: 'new', lines: ['New 30'] }], 'new');
    assert.deepStrictEqual(entries(), [
        { id: 'remote', lines: ['Remote 20'] }, migrated, { id: 'new', lines: ['New 30'] }
    ]);
    assert.strictEqual(window.localStorage.getItem('jotsum.migrated'), '1');
});
