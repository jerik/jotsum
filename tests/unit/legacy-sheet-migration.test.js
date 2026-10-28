const assert = require('assert');

// Legacy shapes: jotsum.sheet is the JSON array of raw line texts that
// update_total writes (asserted in persistence.test.js); jotsum.active is the
// plain id string the previous release wrote next to the jotsum.sheets store.
const accesses = [];
function storage(area) {
    return {
        data: {},
        getItem(key) { accesses.push([area, 'get', key]); return this.data[key] ?? null; },
        setItem(key, value) { accesses.push([area, 'set', key]); this.data[key] = String(value); },
        removeItem(key) { accesses.push([area, 'remove', key]); delete this.data[key]; }
    };
}
window.addEventListener = () => {};
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
function load(tab = storage('session'), path = '/jotsum.html') {
    window.sessionStorage = tab;
    window.location = new URL('https://example.test' + path);
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
    accesses.length = 0;
    window.onload();
    return {
        api, sheet,
        texts: () => sheet.querySelectorAll().map(line => line.textContent),
        active: () => (api.list_shortsaves().find(entry => entry.active) || {}).id ?? null,
        lines: () => api.load_store().map(entry => entry.lines),
        edit(text) {
            sheet.querySelectorAll()[0].textContent = text;
            sheet.update_total();
        }
    };
}

const touched = (key, ops = ['get', 'set', 'remove']) =>
    accesses.filter(([area, op, name]) => area === 'local' && name === key && ops.includes(op)).length;

function test(name, run) {
    window.localStorage = storage('local');
    run(window.localStorage.data);
    console.log(`${name} passed!`);
}

test('text missing from an existing store is copied once and opened', (data) => {
    data['jotsum.sheets'] = JSON.stringify([{ id: 'A', lines: ['A 10'] }, { id: 'B', lines: ['B 20'] }]);
    data['jotsum.active'] = 'B';
    data['jotsum.sheet'] = JSON.stringify(['B 20', 'Unsaved 5']);
    const tab = storage('session');
    const page = load(tab);
    assert.deepStrictEqual(page.lines(), [['A 10'], ['B 20'], ['B 20', 'Unsaved 5']]);
    assert.deepStrictEqual(page.texts(), ['B 20', 'Unsaved 5']);
    assert.strictEqual(touched('jotsum.active', ['set', 'remove']), 0);
    // Later loads, in this tab or another, read neither legacy key again.
    for (const next of [load(tab), load(storage('session')), load(storage('session'))]) {
        assert.strictEqual(touched('jotsum.active'), 0);
        assert.strictEqual(touched('jotsum.sheet', ['get']), 0);
        assert.strictEqual(next.lines().length, 3);
    }
});

test('a tab without a selection starts empty after the migration', () => {
    window.localStorage.data['jotsum.sheet'] = JSON.stringify(['Legacy 10']);
    const first = load();
    assert.deepStrictEqual(first.texts(), ['Legacy 10']);
    const second = load(storage('session'));
    assert.deepStrictEqual(second.texts(), ['']);
    assert.strictEqual(second.active(), null);
    assert.deepStrictEqual(second.lines(), [['Legacy 10']]);
});

test('text already in the store opens that sheet; without text jotsum.active picks it', (data) => {
    data['jotsum.sheets'] = JSON.stringify([{ id: 'A', lines: ['A 10'] }, { id: 'B', lines: ['B 20'] }]);
    data['jotsum.sheet'] = JSON.stringify(['A 10']);
    data['jotsum.active'] = 'B';
    const page = load();
    assert.deepStrictEqual(page.lines(), [['A 10'], ['B 20']]);
    assert.strictEqual(page.active(), 'A');

    window.localStorage = storage('local');
    window.localStorage.data['jotsum.sheets'] = JSON.stringify([{ id: 'A', lines: ['A 10'] }, { id: 'B', lines: ['B 20'] }]);
    window.localStorage.data['jotsum.active'] = 'B';
    // A missing jotsum.sheet must not empty the stored sheet.
    const without = load();
    assert.deepStrictEqual(without.texts(), ['B 20']);
    without.sheet.update_total();
    assert.deepStrictEqual(without.lines(), [['A 10'], ['B 20']]);
    assert.strictEqual(window.localStorage.data['jotsum.active'], 'B');
});

test('legacy data cannot restore a deleted sheet or copy again', (data) => {
    data['jotsum.sheet'] = JSON.stringify(['Legacy 10']);
    data['jotsum.active'] = 'gone';
    const tab = storage('session');
    const page = load(tab);
    const id = page.active();
    page.api.delete_shortsave(id);
    assert.deepStrictEqual(page.lines(), []);
    // A stale copy of the old release writes its legacy keys again.
    data['jotsum.sheet'] = JSON.stringify(['Legacy 10']);
    data['jotsum.active'] = id;
    for (const next of [load(tab), load(storage('session'))]) {
        assert.deepStrictEqual(next.texts(), ['']);
        assert.deepStrictEqual(next.lines(), []);
    }
});

test('jotsum.sheet keeps the open content', (data) => {
    data['jotsum.sheet'] = JSON.stringify(['Legacy 10']);
    const page = load();
    page.edit('Legacy 20');
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['Legacy 20']);
    assert.deepStrictEqual(page.lines(), [['Legacy 20']]);
    page.api.new_sheet();
    page.edit('Second 30');
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['Second 30']);
    assert.strictEqual(data['jotsum.active'], undefined);
});

test('a failed store write retries the migration without a second copy', (data) => {
    data['jotsum.sheets'] = JSON.stringify([{ id: 'A', lines: ['A 10'] }]);
    data['jotsum.sheet'] = JSON.stringify(['Unsaved 5']);
    const set = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error('Full'); };
    try {
        load();
    } finally {
        window.localStorage.setItem = set;
    }
    const page = load();
    assert.deepStrictEqual(page.lines(), [['A 10'], ['Unsaved 5']]);
    assert.deepStrictEqual(load().lines(), [['A 10'], ['Unsaved 5']]);
    assert.strictEqual(touched('jotsum.sheet', ['get']), 0);
});

test('a reload after a failed store write keeps the newer jotsum.sheet copy', (data) => {
    data['jotsum.sheets'] = JSON.stringify([{ id: 'A', lines: ['A 10'] }]);
    data['jotsum.migrated'] = '1';
    const tab = storage('session');
    tab.data['jotsum.selected'] = 'A';
    const page = load(tab);
    // The store hits its quota while the smaller jotsum.sheet still fits.
    const set = window.localStorage.setItem;
    window.localStorage.setItem = function (key, value) {
        if (key === 'jotsum.sheets') throw new Error('QuotaExceededError');
        return set.call(this, key, value);
    };
    try {
        page.edit('A 30');
    } finally {
        window.localStorage.setItem = set;
    }
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['A 30']);
    // The store stays authoritative for the reload, but must not overwrite
    // the only copy of the newer text, in this tab or another.
    const reloaded = load(tab);
    assert.deepStrictEqual(reloaded.texts(), ['A 10']);
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['A 30']);
    reloaded.api.new_sheet();
    load(storage('session'));
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['A 30']);
    assert.strictEqual(touched('jotsum.sheet', ['get']), 0);
    // A deliberate edit that reaches the store mirrors the open content again.
    const next = load(tab);
    next.edit('Fresh 40');
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['Fresh 40']);
    assert.strictEqual(data['jotsum.unsynced'], undefined);
});

test('a focus change after the reload backs up the newer jotsum.sheet copy first', (data) => {
    data['jotsum.sheets'] = JSON.stringify([{ id: 'A', lines: ['A 10'] }]);
    data['jotsum.migrated'] = '1';
    // State left behind by a store write that failed while jotsum.sheet took the edit.
    data['jotsum.sheet'] = JSON.stringify(['A 30']);
    data['jotsum.unsynced'] = '1';
    const tab = storage('session');
    tab.data['jotsum.selected'] = 'A';
    const backups = () => Object.keys(data).filter(key => key.startsWith('jotsum.sheet.unsynced.'));
    // While the backup cannot be written, jotsum.sheet is not replaced.
    const page = load(tab);
    const set = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
        page.sheet.update_total();
    } finally {
        window.localStorage.setItem = set;
    }
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['A 30']);
    assert.deepStrictEqual(backups(), []);
    // Blur and focus run update_total without an edit.
    page.sheet.update_total();
    assert.strictEqual(backups().length, 1);
    assert.deepStrictEqual(JSON.parse(data[backups()[0]]), ['A 30']);
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['A 10']);
    assert.strictEqual(data['jotsum.unsynced'], undefined);
    page.sheet.update_total();
    assert.strictEqual(backups().length, 1);
});

test('an unreadable jotsum.sheet leaves the migration open and the text in place', (data) => {
    data['jotsum.sheets'] = JSON.stringify([{ id: 'A', lines: ['A 10'] }]);
    data['jotsum.sheet'] = JSON.stringify(['Unsaved 5']);
    const get = window.localStorage.getItem;
    window.localStorage.getItem = function (key) {
        if (key === 'jotsum.sheet') throw new Error('SecurityError');
        return get.call(this, key);
    };
    let page;
    try {
        page = load();
        page.sheet.update_total();
    } finally {
        window.localStorage.getItem = get;
    }
    assert.strictEqual(data['jotsum.migrated'], undefined);
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['Unsaved 5']);
    // Once readable, the next write migrates the text before replacing it.
    page.edit('New 7');
    assert.deepStrictEqual(page.lines(), [['A 10'], ['New 7'], ['Unsaved 5']]);
    assert.deepStrictEqual(JSON.parse(data['jotsum.sheet']), ['New 7']);
    assert.strictEqual(data['jotsum.migrated'], '1');
    assert.deepStrictEqual(load().lines(), [['A 10'], ['New 7'], ['Unsaved 5']]);
});

test('an Objective preview migrates its own legacy keys once', (data) => {
    data['jotsum.sheet'] = JSON.stringify(['App 10']);
    data['jotsum.preview.OBJ-5.sheet'] = JSON.stringify(['Preview 20']);
    const preview = load(storage('session'), '/jotsum/preview/OBJ-5/');
    assert.deepStrictEqual(preview.texts(), ['Preview 20']);
    assert.ok(accesses.every(([, , key]) => key.startsWith('jotsum.preview.OBJ-5.')));
    const again = load(storage('session'), '/jotsum/preview/OBJ-5/');
    assert.deepStrictEqual(again.texts(), ['']);
    assert.strictEqual(touched('jotsum.preview.OBJ-5.sheet', ['get']), 0);
    assert.deepStrictEqual(again.lines(), [['Preview 20']]);
    assert.strictEqual(data['jotsum.sheets'], undefined);
});
