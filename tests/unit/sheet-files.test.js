const assert = require('assert');
const { JoLine, JoSheet, load_store, save_store, list_shortsaves, sheet_export, init_sheet_files, import_sheet_text, import_sheet_file, STORE_STORAGE_KEY } = require('../../jotsum.js');

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


test('export preserves sheet text and derives safe display filenames', () => {
    const lines = ['# Urlaub ä', '', ' Food 30 ', ''];
    assert.deepStrictEqual(sheet_export(lines), {
        text: '# Urlaub ä\n\n Food 30 \n', filename: 'Urlaub ä.txt'
    });
    assert.strictEqual(sheet_export(['## A/B\\C:D*E?F"G<H>I|J']).filename, 'A_B_C_D_E_F_G_H_I_J.txt');
    assert.strictEqual(sheet_export([]).filename, 'Untitled.txt');
    assert.strictEqual(sheet_export(['', '  ']).filename, 'Untitled.txt');
    assert.strictEqual(sheet_export(['#']).filename, 'Untitled.txt');
    assert.strictEqual(sheet_export(['CON']).filename, '_CON.txt');
    assert.strictEqual(sheet_export(['...']).filename, 'Untitled.txt');
});

test('CRLF import creates one new open shortsave and preserves every existing entry', () => {
    const page = fixture();
    window.onload();
    const originals = [{ id: 'a', lines: ['Old 10'] }, { id: 'b', lines: ['Other 20'] }];
    save_store(originals);
    assert.strictEqual(import_sheet_text('# Budget\r\n\r\n Rent 1200 \r\n'), true);
    const entries = load_store();
    assert.strictEqual(entries.length, 3);
    assert.deepStrictEqual(entries.slice(0, 2), originals);
    const imported = entries[2];
    assert.deepStrictEqual(imported.lines, ['# Budget', '', ' Rent 1200 ', '']);
    assert.deepStrictEqual(page.texts(), imported.lines);
    assert.strictEqual(list_shortsaves().find(entry => entry.active).id, imported.id);
    page.sheet.update_total();
    assert.strictEqual(load_store().length, 3);
});

test('oversized UTF-8 input and too many lines change neither storage nor editor nor selection', () => {
    const page = fixture('?text=Keep%2010');
    window.onload();
    const before = JSON.stringify(window.localStorage.data);
    const selected = list_shortsaves().find(entry => entry.active).id;
    for (const text of ['a'.repeat(262145), 'ä'.repeat(131073), '\n'.repeat(2000)]) {
        assert.strictEqual(import_sheet_text(text), false);
        assert.strictEqual(JSON.stringify(window.localStorage.data), before);
        assert.deepStrictEqual(page.texts(), ['Keep 10']);
        assert.strictEqual(list_shortsaves().find(entry => entry.active).id, selected);
    }
});

test('limits are inclusive and an empty file still creates a shortsave', () => {
    fixture();
    window.onload();
    assert.strictEqual(import_sheet_text('a'.repeat(262144)), true);
    assert.strictEqual(import_sheet_text('\n'.repeat(1999)), true);
    assert.strictEqual(import_sheet_text(''), true);
    assert.strictEqual(load_store().length, 3);
    assert.deepStrictEqual(load_store()[2].lines, ['']);
});

test('header picker and sheet drop share the file import path', () => {
    const page = fixture();
    window.onload();
    const events = {};
    const controls = {};
    for (const id of ['import-file', 'import-sheet', 'export-sheet']) {
        controls[id] = { addEventListener: (type, fn) => { events[id + ':' + type] = fn; } };
    }
    const get = document.getElementById;
    document.getElementById = id => controls[id] || get(id);
    page.sheet.addEventListener = (type, fn) => { events['sheet:' + type] = fn; };
    let clicked = false;
    controls['import-file'].click = () => { clicked = true; };
    init_sheet_files();
    events['import-sheet:click']();
    assert.strictEqual(clicked, true);
    assert.strictEqual(typeof events['export-sheet:click'], 'function');
    let prevented = false;
    events['sheet:dragover']({ dataTransfer: { types: ['Files'] },
        preventDefault: () => { prevented = true; } });
    assert.strictEqual(prevented, true);
    // Oversize files are rejected synchronously, before any asynchronous read.
    const file = { name: 'large.txt', size: 262145 };
    controls['import-file'].files = [file];
    controls['import-file'].value = 'large.txt';
    const before = JSON.stringify(window.localStorage.data);
    events['import-file:change']();
    assert.strictEqual(controls['import-file'].value, '');
    prevented = false;
    events['sheet:drop']({ dataTransfer: { files: [file] },
        preventDefault: () => { prevented = true; } });
    assert.strictEqual(prevented, true);
    assert.strictEqual(JSON.stringify(window.localStorage.data), before);
});

(async () => {
    const page = fixture('?text=Keep%2010');
    window.onload();
    const before = JSON.stringify(window.localStorage.data);
    assert.strictEqual(await import_sheet_file({ name: 'large.txt', size: 262145,
        text: () => { throw new Error('Must reject before reading'); } }), false);
    assert.strictEqual(await import_sheet_file({ name: 'image.png', type: 'image/png', size: 1 }), false);
    assert.strictEqual(await import_sheet_file({ name: 'broken.txt', size: 1,
        text: async () => { throw new Error('Read failed'); } }), false);
    assert.strictEqual(JSON.stringify(window.localStorage.data), before);
    assert.deepStrictEqual(page.texts(), ['Keep 10']);
    assert.strictEqual(await import_sheet_file({ name: 'notes.txt', size: 8,
        text: async () => 'A 1\r\nB 2' }), true);
    assert.deepStrictEqual(page.texts(), ['A 1', 'B 2']);
    console.log('file validation and reading passed!');
})().catch(error => { console.error(error); process.exitCode = 1; });
