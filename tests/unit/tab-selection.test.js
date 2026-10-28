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

test('the selected sheet survives a reload of the same tab', () => {
    const tab = storage('session');
    const { a } = two_sheets(tab);
    load(tab).api.open_shortsave(a);
    const reloaded = load(tab);
    assert.deepStrictEqual(reloaded.texts(), ['A 10']);
    assert.strictEqual(reloaded.active(), a);
    reloaded.edit('A 11');
    assert.strictEqual(reloaded.api.load_store().length, 2);
    assert.deepStrictEqual(reloaded.api.load_store().find(entry => entry.id === a).lines, ['A 11']);
});

test('each tab keeps its own selection and a new tab starts with an empty sheet', () => {
    const first = storage('session');
    const { a, b } = two_sheets(first);
    load(first).api.open_shortsave(a);
    const second = storage('session');
    const other = load(second);
    assert.deepStrictEqual(other.texts(), ['']);
    assert.strictEqual(other.active(), null);
    other.api.open_shortsave(b);
    assert.strictEqual(load(first).active(), a);
    assert.strictEqual(load(second).active(), b);
    assert.strictEqual(load(storage('session')).active(), null);
});

test('a reload shows the current store, not the last open content', () => {
    const tab = storage('session');
    const { a, b } = two_sheets(tab);
    load(tab).api.open_shortsave(a);
    // Another tab changes A and leaves its own content in jotsum.sheet.
    const store = JSON.parse(window.localStorage.data['jotsum.sheets']);
    store.find(entry => entry.id === a).lines = ['A 99'];
    window.localStorage.data['jotsum.sheets'] = JSON.stringify(store);
    window.localStorage.data['jotsum.sheet'] = JSON.stringify(['B 20']);
    const reloaded = load(tab);
    assert.deepStrictEqual(reloaded.texts(), ['A 99']);
    assert.strictEqual(reloaded.total.textContent, 99);
    assert.deepStrictEqual(reloaded.api.load_store().find(entry => entry.id === b).lines, ['B 20']);
    assert.deepStrictEqual(JSON.parse(window.localStorage.data['jotsum.sheet']), ['A 99']);
});

test('a missing jotsum.sheet never empties the selected sheet', () => {
    const tab = storage('session');
    const { b } = two_sheets(tab);
    delete window.localStorage.data['jotsum.sheet'];
    const reloaded = load(tab);
    assert.deepStrictEqual(reloaded.texts(), ['B 20']);
    reloaded.sheet.update_total();
    assert.deepStrictEqual(reloaded.api.load_store().find(entry => entry.id === b).lines, ['B 20']);
});

test('a selection deleted elsewhere starts a new empty sheet after reload', () => {
    const tab = storage('session');
    const { page, a, b } = two_sheets(tab);
    page.api.delete_shortsave(b);
    const reloaded = load(tab);
    assert.deepStrictEqual(reloaded.texts(), ['']);
    assert.strictEqual(reloaded.active(), null);
    assert.deepStrictEqual(reloaded.api.load_store().map(entry => entry.id), [a]);
});

test('without sessionStorage the selection is kept in memory', () => {
    for (const tab of [undefined, {
        getItem() { throw new Error('SecurityError'); },
        setItem() { throw new Error('SecurityError'); },
        removeItem() { throw new Error('SecurityError'); }
    }]) {
        window.localStorage = storage('local');
        const { page, a } = two_sheets(tab);
        page.api.open_shortsave(a);
        // A second page load within the same module instance: the memory fallback.
        window.onload();
        assert.deepStrictEqual(page.texts(), ['A 10']);
        assert.strictEqual(page.active(), a);
        page.edit('A 12');
        assert.strictEqual(page.api.load_store().length, 2);
        // A real reload loses the memory, so the tab starts with an empty sheet.
        assert.deepStrictEqual(load(tab).texts(), ['']);
    }
});
