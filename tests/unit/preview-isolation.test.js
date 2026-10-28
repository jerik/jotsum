const assert = require('assert');

// Record actual storage operations, including forbidden reads that leave no data changes.
const accesses = [];
function storage(area) {
    return {
        data: {},
        getItem(key) { accesses.push([area, key]); return this.data[key] ?? null; },
        setItem(key, value) { accesses.push([area, key]); this.data[key] = String(value); },
        removeItem(key) { accesses.push([area, key]); delete this.data[key]; }
    };
}
window.localStorage = storage('local');
window.sessionStorage = storage('session');
const listeners = {};
window.addEventListener = (name, listener) => { listeners[name] = listener; };
function page(path) {
    window.location = new URL('https://example.test' + path);
    delete require.cache[require.resolve('../../jotsum.js')];
    const api = require('../../jotsum.js');
    return { api, ...fixture(api) };
}
function isolated(objective, run) {
    const foreign = Object.fromEntries(Object.entries(window.localStorage.data)
        .filter(([key]) => !key.startsWith(`jotsum.preview.${objective}.`)));
    accesses.length = 0;
    run();
    for (const [key, value] of Object.entries(foreign)) {
        assert.strictEqual(window.localStorage.data[key], value);
    }
    assert.ok(accesses.length > 0);
    for (const [area, key] of accesses) {
        assert.ok(key.startsWith(`jotsum.preview.${objective}.`), `${area}: forbidden access to ${key}`);
    }
}
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

function fixture(api) {
    const { JoSheet, JoLine } = api;
    const sheet = element(new JoSheet(), 'JO-SHEET');
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
        createElement: tag => element(tag === 'jo-line' ? new JoLine() : new HTMLElement(), tag.toUpperCase()),
        addEventListener: () => {}
    };
    window.history = {
        replaceState: (_state, _title, url) => { window.location = new URL(url); }
    };
    return { sheet, total, texts: () => sheet.querySelectorAll().map(line => line.textContent) };
}


const data = window.localStorage.data;
// App data and another Objective must survive even when they are unreadable.
Object.assign(data, {
    'jotsum.sheets': '{broken app',
    'jotsum.sheet': '["App 10"]',
    'jotsum.active': 'app',
    'jotsum.preview.OBJ-6.sheets': '{broken other',
    'jotsum.preview.OBJ-6.sheet': '["Other 20"]',
    'jotsum.preview.OBJ-6.active': 'other'
});
const protectedData = { ...data };
let first;
isolated('OBJ-5', () => {
    first = page('/jotsum/preview/OBJ-5/');
    window.onload();
    assert.deepStrictEqual(first.api.load_store(), []);
    first.sheet.querySelectorAll()[0].textContent = 'Preview 30';
    first.sheet.update_total();
    assert.deepStrictEqual(first.api.load_store()[0].lines, ['Preview 30']);
    assert.ok(data['jotsum.preview.OBJ-5.active']);
    assert.deepStrictEqual(JSON.parse(data['jotsum.preview.OBJ-5.sheet']), ['Preview 30']);
    const before = accesses.length;
    listeners.storage({ key: 'jotsum.sheets', oldValue: '{broken app', storageArea: window.localStorage });
    listeners.storage({ key: 'jotsum.preview.OBJ-6.sheets', oldValue: '{broken other', storageArea: window.localStorage });
    assert.strictEqual(accesses.length, before);
});
isolated('OBJ-5', () => {
    const reload = page('/jotsum/preview/OBJ-5/index.html');
    window.onload();
    assert.deepStrictEqual(reload.texts(), ['Preview 30']);
    assert.ok(reload.api.list_shortsaves()[0].active);
    reload.api.new_sheet();
    assert.strictEqual(data['jotsum.preview.OBJ-5.active'], undefined);
});
isolated('OBJ-6', () => {
    const other = page('/jotsum/preview/OBJ-6/');
    window.onload();
    // An unreadable store retains existing recovery semantics, within this Objective.
    other.sheet.querySelectorAll()[0].textContent = 'Other 40';
    other.sheet.update_total();
    assert.ok(Object.entries(data).some(([key, value]) =>
        key.startsWith('jotsum.preview.OBJ-6.sheets.broken.') && value === '{broken other'));
    assert.deepStrictEqual(other.api.load_store()[0].lines, ['Other 40']);
});
for (const [key, value] of Object.entries(protectedData)) {
    if (!key.startsWith('jotsum.preview.OBJ-6.')) assert.strictEqual(data[key], value);
}
isolated('OBJ-7', () => {
    data['jotsum.preview.OBJ-7.sheet'] = '["Legacy 50"]';
    const legacy = page('/jotsum/preview/OBJ-7/');
    window.onload();
    assert.deepStrictEqual(legacy.api.load_store().map(entry => entry.lines), [['Legacy 50']]);
    assert.ok(legacy.api.list_shortsaves()[0].active);
    assert.deepStrictEqual(legacy.texts(), ['Legacy 50']);
});
isolated('OBJ-8', () => {
    data['jotsum.preview.OBJ-8.sheets'] = '{unreadable';
    data['jotsum.preview.OBJ-8.sheet'] = '{unreadable legacy';
    const broken = page('/jotsum/preview/OBJ-8/');
    window.onload();
    broken.sheet.querySelectorAll()[0].textContent = 'New 60';
    broken.sheet.update_total();
    assert.deepStrictEqual(broken.api.load_store()[0].lines, ['New 60']);
    assert.ok(Object.entries(data).some(([key, value]) =>
        key.startsWith('jotsum.preview.OBJ-8.sheets.broken.') && value === '{unreadable'));
});
for (const path of ['/jotsum/', '/jotsum/preview/OBJ-5x/', '/elsewhere/preview/OBJ-5/']) {
    const app = page(path);
    assert.strictEqual(app.api.STORE_STORAGE_KEY, 'jotsum.sheets');
    assert.strictEqual(app.api.SHEET_STORAGE_KEY, 'jotsum.sheet');
    assert.strictEqual(app.api.ACTIVE_STORAGE_KEY, 'jotsum.active');
}
console.log('Objective preview storage isolation passed!');
