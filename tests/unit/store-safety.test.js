const assert = require('assert');
const listeners = {};
window.addEventListener = (name, callback) => { listeners[name] = callback; };
const { JoLine, JoSheet, load_store, new_sheet, list_shortsaves } = require('../../jotsum.js');
const SHEET_STORAGE_KEY = 'jotsum.sheet';
const KEY = 'jotsum.sheets';

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
    } catch (error) {
        console.error(`${name} failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        global.document = originalDocument;
        window.localStorage.reset();
    }
}


function edit(page, text) {
    page.sheet.querySelectorAll()[0].textContent = text;
    page.sheet.update_total();
}

test('malformed entries survive saves while readable entries remain available', () => {
    const invalid = [null, ['invalid'], { id: 'bad', lines: [4] }];
    window.localStorage.setItem(KEY, JSON.stringify([{ id: 'A', lines: ['A 10'] }, ...invalid]));
    const page = fixture();
    window.onload();
    edit(page, 'C 31');
    const raw = JSON.parse(window.localStorage.getItem(KEY));
    assert(raw.some(entry => entry && entry.id === 'A'));
    invalid.forEach(entry => assert(raw.some(value => JSON.stringify(value) === JSON.stringify(entry))));
    assert.strictEqual(load_store().length, 2);
});

test('broken JSON and non-array stores are backed up once and new work is saved', () => {
    const warn = console.warn;
    let warnings = 0;
    console.warn = () => warnings++;
    try {
        for (const raw of ['{broken', '{"not":"an array"}']) {
            window.localStorage.setItem(KEY, raw);
            const page = fixture();
            window.onload();
            edit(page, 'Cost 15');
            assert.strictEqual(page.total.textContent, 15);
            assert.strictEqual(window.localStorage.getItem(KEY + '.broken'), '{broken');
            assert(JSON.parse(window.localStorage.getItem(KEY)).some(entry => entry.lines[0] === 'Cost 15'));
        }
        assert(warnings >= 2);
    } finally { console.warn = warn; }
});

test('storage failures retain IDs and retry later saves, including migration', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Legacy 10']));
    const set = window.localStorage.setItem;
    const get = window.localStorage.getItem;
    const page = fixture();
    try {
        window.localStorage.setItem = () => { throw new Error('Full'); };
        window.onload();
        const id = load_store()[0].id;
        edit(page, 'Legacy 20');
        assert.strictEqual(load_store()[0].id, id);
        assert.strictEqual(load_store().length, 1);
        new_sheet();
        window.localStorage.getItem = () => { throw new Error('Blocked'); };
        edit(page, 'New 30');
        const next = list_shortsaves().find(entry => entry.active).id;
        edit(page, 'New 40');
        assert.strictEqual(list_shortsaves().find(entry => entry.active).id, next);
        assert.strictEqual(load_store().length, 2);
        window.localStorage.getItem = get;
        window.localStorage.setItem = set;
        edit(page, 'New 50');
        assert.strictEqual(JSON.parse(get.call(window.localStorage, KEY)).length, 2);
        assert.strictEqual(page.total.textContent, 50);
    } finally {
        window.localStorage.setItem = set;
        window.localStorage.getItem = get;
    }
});

test('deletion in another tab clears the active sheet and its association', () => {
    const page = fixture();
    window.onload();
    edit(page, 'A 10');
    const id = load_store()[0].id;
    window.localStorage.setItem(KEY, '[]');
    listeners.storage({ key: KEY, newValue: '[]', storageArea: window.localStorage });
    assert.deepStrictEqual(page.texts(), ['']);
    page.sheet.update_total();
    assert.deepStrictEqual(load_store(), []);
    edit(page, 'B 20');
    assert(load_store().every(entry => entry.id !== id));
});

test('migration assigns only its own entry and never runs from later reads', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Same 10']));
    window.localStorage.setItem(KEY, JSON.stringify([{ id: 'other', lines: ['Same 10'] }]));
    const page = fixture();
    window.onload();
    edit(page, 'Changed 20');
    assert.deepStrictEqual(load_store().find(entry => entry.id === 'other').lines, ['Same 10']);
    window.localStorage.removeItem(KEY);
    assert.deepStrictEqual(load_store(), []);
});

test('broken legacy data does not prevent two new sheets from being saved', () => {
    // Owner probe from PR #29: broken legacy JSON disabled all later saves.
    window.localStorage.setItem(SHEET_STORAGE_KEY, '{bad');
    const page = fixture();
    window.onload();
    edit(page, 'First 10');
    new_sheet();
    edit(page, 'Second 20');
    assert.strictEqual(JSON.parse(window.localStorage.getItem(KEY)).length, 2);
});
