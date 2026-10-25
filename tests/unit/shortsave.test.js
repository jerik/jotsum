const assert = require('assert');
const { JoLine, JoSheet, handle_url_params, reset_sheet, SHEET_STORAGE_KEY,
    sheet_name, new_sheet_id, load_store, save_store, new_sheet, open_shortsave, delete_shortsave, list_shortsaves } = require('../../jotsum.js');

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

test('automatic saves keep separate sheets, stable IDs and restored edits', () => {
    const page = fixture();
    window.onload();
    assert.strictEqual(load_store().length, 0);
    edit(page, 'A 10');
    const first = load_store()[0].id;
    edit(page, 'A 20');
    assert.strictEqual(load_store()[0].id, first);
    new_sheet();
    assert.strictEqual(load_store().length, 1);
    edit(page, 'B 30');
    assert.strictEqual(load_store().length, 2);
    open_shortsave(first);
    assert.deepStrictEqual(page.texts(), ['A 20']);
    edit(page, 'A 40');
    const reloaded = fixture();
    window.onload();
    assert.deepStrictEqual(reloaded.texts(), ['A 40']);
    assert.strictEqual(list_shortsaves().find(entry => entry.active).id, first);
    edit(reloaded, 'A 50');
    assert.strictEqual(load_store().length, 2);
    assert.deepStrictEqual(load_store().find(entry => entry.id === first).lines, ['A 50']);
});

test('legacy migration keeps its association across reloads', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Legacy 10']));
    fixture();
    window.onload();
    const id = load_store()[0].id;
    const page = fixture();
    window.onload();
    edit(page, 'Legacy 20');
    assert.strictEqual(load_store().length, 1);
    assert.strictEqual(load_store()[0].id, id);
});

test('shared URL reloads preserve edits and never duplicate or overwrite the previous sheet', () => {
    // Regression probe from PR #22: Shared 50 grew the store on every reload.
    const previous = fixture();
    window.onload();
    edit(previous, 'Previous 100');
    const old = load_store()[0];
    let page = fixture('?keep=yes&text=Shared%2050#notes');
    window.onload();
    const shared = list_shortsaves().find(entry => entry.active).id;
    assert.strictEqual(window.location.search, '?keep=yes');
    assert.strictEqual(window.location.hash, '#notes');
    edit(page, 'Shared 75');
    for (let reload = 0; reload < 2; reload++) {
        page = fixture(window.location.search + window.location.hash);
        window.onload();
        assert.deepStrictEqual(page.texts(), ['Shared 75']);
        assert.strictEqual(list_shortsaves().find(entry => entry.active).id, shared);
    }
    assert.strictEqual(load_store().length, 2);
    assert.deepStrictEqual(load_store().find(entry => entry.id === old.id), old);
});

test('deletion confirms, removes only the selected sheet and clears an active sheet permanently', () => {
    const page = fixture();
    window.onload();
    edit(page, 'A 10');
    const first = load_store()[0].id;
    new_sheet();
    edit(page, 'B 20');
    const second = list_shortsaves().find(entry => entry.active).id;
    window.confirm = () => false;
    delete_shortsave(first);
    assert.strictEqual(load_store().length, 2);
    window.confirm = () => true;
    delete_shortsave(first);
    assert.deepStrictEqual(load_store().map(entry => entry.id), [second]);
    assert.deepStrictEqual(page.texts(), ['B 20']);
    delete_shortsave(second);
    assert.deepStrictEqual(page.texts(), ['']);
    page.sheet.update_total();
    assert.deepStrictEqual(load_store(), []);
    assert.strictEqual(window.localStorage.getItem(SHEET_STORAGE_KEY), null);
    fixture();
    window.onload();
    assert.deepStrictEqual(load_store(), []);
});

test('storage read and write failures do not interrupt calculations', () => {
    const page = fixture();
    window.onload();
    const get = window.localStorage.getItem;
    const set = window.localStorage.setItem;
    try {
        window.localStorage.getItem = () => { throw new Error('Unavailable'); };
        window.localStorage.setItem = () => { throw new Error('Full'); };
        edit(page, 'Cost 2 * 5');
        assert.strictEqual(page.total.textContent, 10);
    } finally {
        window.localStorage.getItem = get;
        window.localStorage.setItem = set;
    }
});

test('invalid store JSON does not interrupt calculations', () => {
    window.localStorage.setItem('jotsum.sheets', '{broken');
    const page = fixture();
    window.onload();
    edit(page, 'Cost 15');
    assert.strictEqual(page.total.textContent, 15);
});

const { sheet_total } = require('../../jotsum.js');

// Seeds the store with several sheets, then opens each one so the real
// render/update_total writes #total, the reference for the sidebar total.
function shown_totals(sheets) {
    const page = fixture();
    window.onload();
    save_store(sheets.map((lines, i) => ({ id: 'sheet-' + i, lines })));
    return sheets.map((_lines, i) => {
        open_shortsave('sheet-' + i);
        return String(page.total.textContent);
    });
}

test('list totals match the total under each sheet', () => {
    const sheets = [
        ['Rent 1200', 'Food 300', 'Bus 45'],
        ['Coffee 3.5', 'Cake 2.25', '1/3'],
        [':rate = 2.5', 'Hours 4 * :rate', 'Extra :rate'],
        ['A 10', 'B 20', '---', 'C 5', '---', 'Both :SUBTOTAL_1 + :SUBTOTAL_2'],
        ['Valid 7', 'Broken 5 +', 'Unknown :nope', 'Glued 10 20', 'Valid 1.5'],
        ['# Budget', 'Notes without numbers', 'Item 40']
    ];
    const expected = shown_totals(sheets);
    assert.deepStrictEqual(expected, ['1545', '6.08', '12.50', '70', '8.50', '40']);
    const listed = list_shortsaves();
    assert.deepStrictEqual(listed.map(entry => entry.total), expected);
    sheets.forEach((lines, i) => assert.strictEqual(sheet_total(lines), expected[i]));
});

test('sheets without a valid number have no total, numbers cancelling out total 0', () => {
    const sheets = [
        [],
        [''],
        ['Just some notes', 'nothing to add'],
        ['# Heading', '## Subheading'],
        ['Broken 5 +', 'Unknown :nope', '10 20'],
        ['Plus 5', 'Minus -5']
    ];
    const listed = (() => {
        fixture();
        window.onload();
        save_store(sheets.map((lines, i) => ({ id: 'sheet-' + i, lines })));
        return list_shortsaves();
    })();
    assert.deepStrictEqual(listed.map(entry => entry.total), [null, null, null, null, null, '0']);
    // The sheet itself still shows 0 for these, so 0 alone cannot be the signal.
    assert.deepStrictEqual(shown_totals(sheets.slice(1)), ['0', '0', '0', '0', '0']);
});

test('list totals are never written to the store', () => {
    fixture();
    window.onload();
    save_store([{ id: 'a', lines: ['A 10'] }, { id: 'b', lines: ['B 2.5'] }]);
    const before = window.localStorage.getItem('jotsum.sheets');
    assert.deepStrictEqual(list_shortsaves().map(entry => entry.total), ['10', '2.50']);
    const after = window.localStorage.getItem('jotsum.sheets');
    assert.strictEqual(after, before);
    assert.ok(JSON.parse(after).every(entry => !('total' in entry)));
    assert.ok(load_store().every(entry => !('total' in entry)));
});

const { render_shortsave_list } = require('../../jotsum.js');

// Adds just enough DOM for the sidebar list: a #shortsave-list that holds
// children, and created elements that can hold children too. The store
// event is wired to the list exactly as init_sidebar does in the browser.
function with_list(page) {
    const container = node => {
        node.children = [];
        node.appendChild = child => { node.children.push(child); return child; };
        node.removeChild = child => node.children.splice(node.children.indexOf(child), 1);
        node.contains = () => false;
        node.querySelector = () => null;
        Object.defineProperty(node, 'firstChild', { get: () => node.children[0] });
        return node;
    };
    const list = container(element(new HTMLElement(), 'UL'));
    const { getElementById, createElement } = global.document;
    global.document.getElementById = id => id === 'shortsave-list' ? list : getElementById(id);
    global.document.createElement = tag => container(createElement(tag));
    window.dispatchEvent = event => {
        if (event.type === 'shortsaves-changed') render_shortsave_list();
    };
    return { ...page, list };
}

function shown_entry(list, id) {
    const item = list.children.find(item => item.children[0].getAttribute('data-id') === id);
    const span = name => item.children[0].children.find(child => child.className === name);
    return {
        name: span('shortsave-name')?.textContent,
        total: span('shortsave-total')?.textContent ?? null,
        label: item.children[0].getAttribute('aria-label')
    };
}

test('the open sheet\'s list total follows a changed line while its name stays', () => {
    const page = with_list(fixture());
    try {
        window.onload();
        save_store([{ id: 'notes', lines: ['Just notes'] }, { id: 'budget', lines: ['Budget', 'Rent 1200'] }]);
        assert.deepStrictEqual(shown_entry(page.list, 'notes'), { name: 'Just notes', total: null, label: null });
        open_shortsave('budget');
        assert.deepStrictEqual(page.texts(), ['Budget', 'Rent 1200']);
        assert.deepStrictEqual(shown_entry(page.list, 'budget'),
            { name: 'Budget', total: '1200', label: 'Budget, total 1200' });

        // Type into the second line only: name and active entry stay the same,
        // the save on update_total() fires the store event that redraws the list.
        page.sheet.querySelectorAll()[1].textContent = 'Rent 1200.5';
        page.sheet.update_total();
        assert.deepStrictEqual(load_store().find(entry => entry.id === 'budget').lines, ['Budget', 'Rent 1200.5']);
        assert.strictEqual(String(page.total.textContent), '1200.50');
        assert.deepStrictEqual(shown_entry(page.list, 'budget'),
            { name: 'Budget', total: '1200.50', label: 'Budget, total 1200.50' });
    } finally {
        delete window.dispatchEvent;
    }
});
