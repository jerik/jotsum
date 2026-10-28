const assert = require('assert');
const listeners = {};
window.addEventListener = (name, listener) => { listeners[name] = listener; };
const { JoLine, JoSheet, SHEET_STORAGE_KEY, load_store, save_store,
    new_sheet, list_shortsaves } = require('../../jotsum.js');
const storage = window.localStorage;
const key = 'jotsum.sheets';
const backups = () => Object.entries(storage.data).filter(([name]) => name.startsWith(key + '.broken'));
function remote(entries) {
    const oldValue = storage.getItem(key);
    const newValue = entries === null ? null : JSON.stringify(entries);
    if (newValue === null) storage.removeItem(key);
    else storage.setItem(key, newValue);
    listeners.storage({ key, oldValue, newValue, storageArea: storage });
}

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
    window.localStorage.reset();
    try {
        run();
        console.log(`${name} passed!`);
    } finally {
        global.document = originalDocument;
        window.localStorage.reset();
    }
}


function edit(page, text) {
    page.sheet.querySelectorAll()[0].textContent = text;
    page.sheet.update_total();
}


test('malformed entries survive saves while readable sheets remain available', () => {
    // Reproduction in T-104: A, B, C plus one invalid entry, then edit C.
    const invalid = [null, 42, { id: 'future', lines: { text: 'Unknown format' } }];
    storage.setItem(key, JSON.stringify([
        { id: 'A', lines: ['A 10'] }, { id: 'B', lines: ['B 20'] },
        { id: 'C', lines: ['C 30'] }, ...invalid
    ]));
    storage.setItem('jotsum.active', 'C');
    storage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['C 30']));
    const page = fixture();
    window.onload();
    edit(page, 'C 31');
    assert.deepStrictEqual(load_store().map(entry => entry.id), ['A', 'B', 'C']);
    assert.deepStrictEqual(JSON.parse(storage.getItem(key)).slice(3), invalid);
});

test('each unreadable store gets a separate backup and new work is saved', () => {
    const page = fixture();
    const warn = console.warn;
    let warnings = 0;
    console.warn = () => warnings++;
    try {
        storage.setItem(key, '{broken');
        window.onload();
        edit(page, 'New 10');
        storage.setItem(key, '{"not":"an array"}');
        edit(page, 'New 20');
        assert.deepStrictEqual(backups().map(([, raw]) => raw).sort(),
            ['{broken', '{"not":"an array"}'].sort());
        assert.ok(warnings >= 2);
        assert.strictEqual(page.total.textContent, 20);
        assert.deepStrictEqual(load_store()[0].lines, ['New 20']);
    } finally { console.warn = warn; }
});

test('failed reads and writes keep stable in-memory ids and retry saves', () => {
    const page = fixture();
    window.onload();
    const get = storage.getItem;
    const set = storage.setItem;
    try {
        storage.getItem = () => { throw new Error('Blocked'); };
        storage.setItem = () => { throw new Error('Full'); };
        edit(page, 'Cost 10');
        const id = list_shortsaves()[0].id;
        edit(page, 'Cost 20');
        assert.strictEqual(list_shortsaves().length, 1);
        assert.strictEqual(list_shortsaves()[0].id, id);
        assert.strictEqual(page.total.textContent, 20);
        storage.getItem = get;
        storage.setItem = set;
        edit(page, 'Cost 30');
        assert.strictEqual(load_store()[0].id, id);
        assert.deepStrictEqual(JSON.parse(storage.getItem(key))[0].lines, ['Cost 30']);
    } finally { storage.getItem = get; storage.setItem = set; }
});

test('failed migration retains its own id and never migrates on later reads', () => {
    storage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Legacy 10']));
    const set = storage.setItem;
    const page = fixture();
    try {
        storage.setItem = () => { throw new Error('Full'); };
        window.onload();
        const migrated = load_store()[0].id;
        edit(page, 'Legacy 20');
        assert.strictEqual(load_store().length, 1);
        assert.strictEqual(list_shortsaves().find(entry => entry.active).id, migrated);
        storage.setItem = set;
        edit(page, 'Legacy 30');
        assert.strictEqual(load_store()[0].id, migrated);
        remote(null);
        assert.deepStrictEqual(load_store(), []);
    } finally { storage.setItem = set; }
});

test('broken legacy JSON does not disable saving new sheets', () => {
    // Owner probe from PR #29: two new sheets after a broken legacy value.
    storage.setItem(SHEET_STORAGE_KEY, '{bad');
    const page = fixture();
    window.onload();
    edit(page, 'First 10');
    new_sheet();
    edit(page, 'Second 20');
    assert.strictEqual(JSON.parse(storage.getItem(key)).length, 2);
});

test('pending backup must succeed before replacing any unreadable value', () => {
    storage.setItem(key + '.broken.old', 'Older backup');
    storage.setItem(key, '{broken');
    const set = storage.setItem;
    const page = fixture();
    try {
        storage.setItem = function(name, value) {
            if (name.startsWith(key + '.broken.')) throw new Error('Full');
            return set.call(this, name, value);
        };
        window.onload();
        edit(page, 'Pending 10');
        assert.strictEqual(storage.getItem(key), '{broken');
        storage.setItem = set;
        edit(page, 'Pending 20');
        assert.ok(backups().some(([, raw]) => raw === '{broken'));
        assert.ok(backups().some(([, raw]) => raw === 'Older backup'));
        assert.deepStrictEqual(JSON.parse(storage.getItem(key))[0].lines, ['Pending 20']);
    } finally { storage.setItem = set; }
});

test('storage events merge remote entries with unsaved active changes', () => {
    const page = fixture();
    window.onload();
    edit(page, 'Local 10');
    const id = load_store()[0].id;
    const set = storage.setItem;
    try {
        storage.setItem = function(name, value) {
            if (name === key) throw new Error('Full');
            return set.call(this, name, value);
        };
        edit(page, 'Local 20');
        storage.setItem = set;
        remote([{ id, lines: ['Local 10'] }, { id: 'remote', lines: ['Remote 30'] }]);
        assert.deepStrictEqual(load_store().find(entry => entry.id === id).lines, ['Local 20']);
        assert.ok(load_store().some(entry => entry.id === 'remote'));
        new_sheet();
        storage.setItem = function(name, value) {
            if (name === key) throw new Error('Full');
            return set.call(this, name, value);
        };
        edit(page, 'Memory 40');
        const memoryId = list_shortsaves().find(entry => entry.active).id;
        storage.setItem = set;
        remote([{ id: 'remote', lines: ['Remote 50'] }]);
        edit(page, 'Memory 60');
        assert.deepStrictEqual(load_store().find(entry => entry.id === memoryId).lines, ['Memory 60']);
        assert.deepStrictEqual(load_store().find(entry => entry.id === 'remote').lines, ['Remote 50']);
    } finally { storage.setItem = set; }
});

test('reload without a valid active id reuses matching legacy content', () => {
    storage.setItem(key, JSON.stringify([{ id: 'existing', lines: ['Legacy 10'] }]));
    storage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Legacy 10']));
    for (const active of [null, 'missing']) {
        if (active === null) storage.removeItem('jotsum.active');
        else storage.setItem('jotsum.active', active);
        const page = fixture();
        window.onload();
        edit(page, 'Legacy 10');
        assert.strictEqual(load_store().length, 1);
        assert.strictEqual(list_shortsaves().find(entry => entry.active).id, 'existing');
    }
});

test('storage events notify the sidebar', () => {
    fixture();
    window.onload();
    const dispatch = window.dispatchEvent;
    const events = [];
    try {
        window.dispatchEvent = event => events.push(event.type);
        remote([{ id: 'other', lines: ['Other 10'] }]);
        assert.ok(events.includes('shortsaves-changed'));
    } finally { window.dispatchEvent = dispatch; }
});
