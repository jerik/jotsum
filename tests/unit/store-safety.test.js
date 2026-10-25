const assert = require('assert');
let api, JoLine, JoSheet;
const STORE = 'jotsum.sheets';
const LEGACY = 'jotsum.sheet';

// Supply only the DOM operations used by the real sheet and loading methods.
// Calculations, adding lines, saving and restoring all run production code.
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

function fixture(search = '') {
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
    window.location = new URL('https://example.test/jotsum.html' + search);
    window.history = {
        replaceState: (_state, _title, url) => { window.location = new URL(url); }
    };
    return { sheet, total, texts: () => sheet.querySelectorAll().map(line => line.textContent) };
}

function test(name, run) {
    const originalDocument = global.document;
    const storage = window.localStorage;
    const get = storage.getItem;
    const set = storage.setItem;
    const warn = console.warn;
    storage.reset();
    const listeners = {};
    window.addEventListener = (name, handler) => { listeners[name] = handler; };
    delete require.cache[require.resolve('../../jotsum.js')];
    api = require('../../jotsum.js');
    ({ JoLine, JoSheet } = api);
    try {
        run(listeners);
        console.log(`${name} passed!`);
    } finally {
        global.document = originalDocument;
        storage.getItem = get;
        storage.setItem = set;
        console.warn = warn;
        storage.reset();
        delete window.addEventListener;
    }
}


function edit(page, text) {
    page.sheet.querySelectorAll()[0].textContent = text;
    page.sheet.update_total();
}


test('malformed entries are hidden on read and retained unchanged on save', () => {
    // T-104 reproduction: A, B, C plus one foreign-format entry, then edit C.
    const invalid = [null, ['foreign format'], { id: 'future', lines: [42], version: 2 }];
    const entries = ['A', 'B', 'C'].map(id => ({ id, lines: [id + ' 30'] }));
    const raw = [entries[0], invalid[0], entries[1], invalid[1], invalid[2], entries[2]];
    window.localStorage.setItem(STORE, JSON.stringify(raw));
    window.localStorage.setItem(LEGACY, JSON.stringify(['C 30']));
    window.localStorage.setItem('jotsum.active', 'C');
    const page = fixture();
    window.onload();
    assert.deepStrictEqual(api.load_store().map(entry => entry.id), ['A', 'B', 'C']);
    edit(page, 'C 31');
    const expected = JSON.parse(JSON.stringify(raw));
    expected[5].lines = ['C 31'];
    assert.deepStrictEqual(JSON.parse(window.localStorage.getItem(STORE)), expected);
});

test('broken JSON and nonarrays are backed up once and never overwritten by edits', () => {
    let warnings = 0;
    const set = window.localStorage.setItem;
    console.warn = () => warnings++;
    for (const raw of ['{broken', '{"future":true}', 'null']) {
        for (const backup of [null, 'previous broken data']) {
            window.localStorage.reset();
            window.localStorage.setItem(STORE, raw);
            if (backup !== null) window.localStorage.setItem(STORE + '.broken', backup);
            let writes = 0;
            window.localStorage.setItem = function (key, value) {
                if (key === STORE) writes++;
                return set.call(this, key, value);
            };
            const page = fixture();
            window.onload();
            edit(page, 'Cost 15');
            edit(page, 'Cost 16');
            assert.strictEqual(page.total.textContent, 16);
            assert.strictEqual(window.localStorage.getItem(STORE), raw);
            assert.strictEqual(window.localStorage.getItem(STORE + '.broken'), backup ?? raw);
            assert.strictEqual(api.load_store().length, 1);
            assert.strictEqual(writes, 0);
            window.localStorage.setItem = set;
        }
    }
    assert.strictEqual(warnings, 6);
});

test('blocked reads and full writes keep edits and migration IDs stable in memory', () => {
    const storage = window.localStorage;
    const get = storage.getItem;
    const set = storage.setItem;
    for (const blockedRead of [false, true]) {
        storage.getItem = get;
        storage.setItem = set;
        storage.reset();
        storage.setItem(LEGACY, JSON.stringify(['Legacy 10']));
        if (blockedRead) storage.getItem = () => { throw new Error('Blocked'); };
        storage.setItem = () => { throw new Error('Full'); };
        const page = fixture();
        window.onload();
        const migrated = api.load_store()[0]?.id;
        if (!blockedRead) {
            assert.ok(migrated);
            assert.strictEqual(api.load_store()[0].id, migrated);
        }
        edit(page, 'Cost 20');
        const id = api.list_shortsaves().find(entry => entry.active).id;
        edit(page, 'Cost 21');
        assert.strictEqual(api.load_store().length, 1);
        assert.strictEqual(api.list_shortsaves().find(entry => entry.active).id, id);
        if (migrated) assert.strictEqual(id, migrated);
        assert.deepStrictEqual(api.load_store()[0].lines, ['Cost 21']);
        assert.strictEqual(page.total.textContent, 21);
    }
});

test('a storage event for an externally deleted active entry clears its sheet', listeners => {
    const page = fixture();
    window.onload();
    edit(page, 'A 10');
    const deleted = api.load_store()[0].id;
    api.new_sheet();
    edit(page, 'B 20');
    const other = api.load_store().find(entry => entry.id !== deleted);
    api.open_shortsave(deleted);
    window.localStorage.setItem(STORE, JSON.stringify([other]));
    // The shared mock has no event system; invoke the registered browser listener directly.
    assert.strictEqual(typeof listeners.storage, 'function');
    listeners.storage({ key: STORE, newValue: JSON.stringify([other]), storageArea: window.localStorage });
    assert.deepStrictEqual(page.texts(), ['']);
    assert.ok(api.list_shortsaves().every(entry => !entry.active));
    page.sheet.update_total();
    assert.deepStrictEqual(api.load_store(), [other]);
    edit(page, 'New 30');
    assert.ok(api.load_store().every(entry => entry.id !== deleted));
    assert.deepStrictEqual(api.load_store().find(entry => entry.id === other.id), other);
});

test('legacy content belongs only to the migration entry, never an equal existing sheet', () => {
    const lines = ['Legacy 10'];
    window.localStorage.setItem(LEGACY, JSON.stringify(lines));
    let page = fixture();
    window.onload();
    const migrated = api.list_shortsaves().find(entry => entry.active).id;
    edit(page, 'Legacy 11');
    assert.strictEqual(api.load_store()[0].id, migrated);
    // Existing array means migration already happened; equal text is no association.
    const existing = { id: 'unrelated', lines };
    window.localStorage.setItem(STORE, JSON.stringify([existing]));
    window.localStorage.setItem(LEGACY, JSON.stringify(lines));
    window.localStorage.removeItem('jotsum.active');
    page = fixture();
    window.onload();
    edit(page, 'Legacy 12');
    assert.deepStrictEqual(api.load_store().find(entry => entry.id === existing.id), existing);
    assert.notStrictEqual(api.list_shortsaves().find(entry => entry.active).id, existing.id);
});
