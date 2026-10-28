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
function load(tab, path = '/jotsum.html') {
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
    const controls = {};
    for (const id of ['remote-change-notice', 'remote-change-message', 'remote-change-reload', 'remote-change-close']) {
        controls[id] = { hidden: true, handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback; } };
    }
    global.document = {
        getElementById: id => controls[id] || (id === 'sheet' ? sheet : total),
        createElement: tag => element(tag === 'jo-line' ? new api.JoLine() : new HTMLElement(), tag.toUpperCase()),
        addEventListener: () => {}
    };
    window.history = { replaceState: (_state, _title, url) => { window.location = new URL(url); } };
    window.onload();
    return {
        api, sheet, total, controls,
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

function remote(page, deleted, key = 'jotsum.sheets') {
    const oldValue = window.localStorage.getItem(key);
    const value = deleted ? [{ id: 'B', lines: ['B 20'] }] : [{ id: 'A', lines: ['Remote 99'] }, { id: 'B', lines: ['B 20'] }];
    window.localStorage.setItem(key, JSON.stringify(value));
    listeners.storage({ key, oldValue, newValue: JSON.stringify(value), storageArea: window.localStorage });
}
for (const deleted of [false, true]) {
    for (const action of ['remote-change-close', 'remote-change-reload']) {
        test(`${deleted ? 'deletion' : 'change'}: ${action}`, () => {
            const { tab, page } = seeded();
            remote(page, deleted);
            const notice = page.controls['remote-change-notice'];
            assert.strictEqual(notice.hidden, false);
            assert.match(page.controls['remote-change-message'].textContent, /Neu laden/);
            assert.match(page.controls['remote-change-message'].textContent, /weitertippst/);
            assert.deepStrictEqual(page.texts(), ['A 10']);
            assert.strictEqual(tab.getItem('jotsum.selected'), 'A');
            page.sheet.update_total();
            assert.strictEqual(entries().some(entry => entry.id === 'A'), !deleted);
            assert.deepStrictEqual(page.texts(), ['A 10']);
            // Reload must read a newer save than the one that raised the notice.
            if (action === 'remote-change-reload' && !deleted) {
                put([{ id: 'A', lines: ['Newest 100'] }, { id: 'B', lines: ['B 20'] }]);
            }
            const savedBefore = window.localStorage.getItem(key);
            page.controls[action].handlers.click();
            assert.strictEqual(notice.hidden, true);
            if (action === 'remote-change-close') {
                assert.deepStrictEqual(page.texts(), ['A 10']);
                assert.strictEqual(tab.getItem('jotsum.selected'), 'A');
                assert.strictEqual(window.localStorage.getItem(key), savedBefore);
                listeners.storage({ key, storageArea: window.localStorage });
                assert.strictEqual(notice.hidden, true);
                page.sheet.update_total();
                assert.strictEqual(window.localStorage.getItem(key), savedBefore);
                page.edit('Continued 42');
                assert.deepStrictEqual(entries().find(entry => entry.id === 'A').lines, ['Continued 42']);
                assert.strictEqual(tab.getItem('jotsum.selected'), 'A');
            } else {
                assert.deepStrictEqual(page.texts(), deleted ? [''] : ['Newest 100']);
                assert.strictEqual(tab.getItem('jotsum.selected'), deleted ? null : 'A');
                page.edit('After reload 55');
                const id = tab.getItem('jotsum.selected');
                assert.strictEqual(id === 'A', !deleted);
                assert.deepStrictEqual(entries().find(entry => entry.id === id).lines, ['After reload 55']);
            }
            assert.deepStrictEqual(entries().find(entry => entry.id === 'B').lines, ['B 20']);
        });
    }
}
test('unrelated sheets and production events leave a preview isolated', () => {
    const { page } = seeded();
    put([{ id: 'A', lines: ['A 10'] }, { id: 'B', lines: ['Other 80'] }]);
    listeners.storage({ key, storageArea: window.localStorage });
    assert.strictEqual(page.controls['remote-change-notice'].hidden, true);
    const previewKey = 'jotsum.preview.T-112.sheets';
    window.localStorage.setItem('jotsum.preview.T-112.migrated', '1');
    window.localStorage.setItem(previewKey, JSON.stringify([{ id: 'A', lines: ['Preview 5'] }]));
    const tab = storage('session');
    tab.setItem('jotsum.preview.T-112.selected', 'A');
    const preview = load(tab, '/preview/T-112/index.html');
    remote(preview, false);
    assert.strictEqual(preview.controls['remote-change-notice'].hidden, true);
    assert.deepStrictEqual(preview.texts(), ['Preview 5']);
    remote(preview, false, previewKey);
    assert.strictEqual(preview.controls['remote-change-notice'].hidden, false);
    preview.controls['remote-change-reload'].handlers.click();
    assert.deepStrictEqual(preview.texts(), ['Remote 99']);
});

for (const deleted of [false, true]) {
    test(`typing with the notice open overwrites a remote ${deleted ? 'deletion' : 'change'}`, () => {
        const { tab, page } = seeded();
        remote(page, deleted);
        page.edit('Local 66');
        assert.strictEqual(tab.getItem('jotsum.selected'), 'A');
        assert.deepStrictEqual(entries().find(entry => entry.id === 'A').lines, ['Local 66']);
        assert.strictEqual(page.controls['remote-change-notice'].hidden, true);
    });
}
