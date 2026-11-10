const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '../../jotsum.html'), 'utf8');
const header = html.match(/<header\b[\s\S]*?<\/header>/)[0];
const visible = header.slice(0, header.indexOf('<ul id="more-actions"'));
assert.deepStrictEqual([...visible.matchAll(/<button[^>]*id="([^"]+)"/g)].map(m => m[1]),
    ['drawer-toggle', 'new-sheet', 'share-sheet', 'more-toggle']);
assert.doesNotMatch(visible, /class="brand"|class="action-label"/);
assert.doesNotMatch(visible, /Add line/);
for (const entry of ['Import .txt…', 'Export .txt', 'Quick help', 'Keyboard shortcuts', 'About / GitHub']) assert.ok(header.includes(entry));
assert.doesNotMatch(header, /Add line|id="add-line"/);
assert.match(html, /<title>jotsum · B2<\/title>/);
assert.strictEqual([...html.matchAll(/id="total"/g)].length, 1);
assert.match(html, /class="total-bar"[\s\S]*id="total"/);
assert.doesNotMatch(header, /Open shared link/);
assert.match(header, /href="https:\/\/github.com\/jerik\/jotsum"/);
for (const button of visible.matchAll(/<button[^>]*>/g)) {
    assert.match(button[0], /class="header-button"/);
    assert.match(button[0], /title="[^"]+"/);
}

const api = require('../../jotsum.js');
let wide = true;
let resize;
window.matchMedia = () => ({ matches: wide, addEventListener: (_type, fn) => { resize = fn; } });
window.location = new URL('https://example.test/');
window.history = { replaceState: (_a, _b, url) => { window.location = new URL(url); } };
const ids = ['sidebar', 'drawer-toggle', 'shortsave-list', 'shortsave-empty', 'sidebar-title', 'new-sheet',
    'content', 'header-actions', 'drawer-backdrop', 'more-actions', 'more-toggle', 'add-line',
    'quick-help', 'quick-help-dialog', 'shortcuts-dialog', 'pin-sidebar', 'sheet-count', 'keyboard-shortcuts', 'shortcut-list', 'current-sheet-name', 'total', 'decimals-toggle', 'messages'];
const nodes = Object.fromEntries(ids.map(id => [id, mockUiElement(id.endsWith('-dialog') ? 'dialog' : 'div')]));
for (const [id, node] of Object.entries(nodes)) node.id = id;
nodes['more-actions'].hidden = true;
nodes['shortcut-list'].hidden = true;
nodes.sidebar.appendChild(nodes['sidebar-title']);
nodes['add-line'].tagName = 'BUTTON';
nodes['more-actions'].appendChild(nodes['add-line']);
const addLineLabel = mockUiElement('span');
nodes['add-line'].appendChild(addLineLabel);
assert.strictEqual(addLineLabel.closest('button, a'), nodes['add-line']);
const sheet = new api.JoSheet();
Object.assign(sheet, mockUiElement('jo-sheet'));
Object.defineProperty(sheet, 'firstChild', { get: () => sheet.children[0] });
sheet.querySelectorAll = () => sheet.children.filter(node => node.tagName === 'JO-LINE');
const listeners = {};
global.document = {
    body: mockUiElement('body'),
    getElementById: id => id === 'sheet' ? sheet : nodes[id],
    querySelector: () => sheet,
    createElement: tag => {
        const node = tag === 'jo-line' ? Object.assign(new api.JoLine(), mockUiElement(tag)) : mockUiElement(tag);
        node.focus = () => { document.activeElement = node; };
        return node;
    },
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn)
};
const windowListeners = {};
window.addEventListener = (type, fn) => (windowListeners[type] ||= []).push(fn);
window.dispatchEvent = event => (windowListeners[event.type] || []).forEach(fn => fn(event));
window.localStorage.reset();
api.new_sheet();
api.init_sidebar();
const key = (key, options = {}) => {
    const event = { key, preventDefault() { this.prevented = true; }, ...options };
    (listeners.keydown || []).forEach(fn => fn(event));
    return event;
};
assert.strictEqual(nodes['drawer-toggle'].getAttribute('aria-expanded'), 'false');
assert.strictEqual(nodes.sidebar.inert, true);
const before = JSON.stringify(window.localStorage.data);
for (const width of [true, false]) {
    wide = width; resize();
    assert.ok(!document.body.classList.contains('drawer-open'));
    assert.ok(key('b', { ctrlKey: true, target: { isContentEditable: true } }).prevented);
    assert.strictEqual(nodes['drawer-toggle'].getAttribute('aria-expanded'), 'true');
    assert.strictEqual(nodes.content.inert, true);
    nodes['sidebar-title'].focus();
    key('Escape');
    assert.strictEqual(nodes.sidebar.inert, true);
    assert.strictEqual(document.activeElement, sheet.querySelectorAll()[0]);
    assert.strictEqual(nodes.content.inert, false);
    nodes['drawer-toggle'].emit('click');
    assert.ok(document.body.classList.contains('drawer-open'));
    nodes['drawer-toggle'].emit('click');
}
assert.strictEqual(JSON.stringify(window.localStorage.data), before);
// Only the two specified modifier combinations are intercepted.
for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true, shiftKey: true }, { altKey: true, ctrlKey: true }]) {
    assert.ok(!api.handle_header_keys({ key: 'n', ...options, preventDefault() { throw Error('intercepted'); } }));
}
api.import_sheet_text('# Budget\n10');
assert.strictEqual(nodes['current-sheet-name'].textContent, 'Budget');
const saved = api.load_store();
assert.ok(key('n', { altKey: true }).prevented);
assert.strictEqual(sheet.querySelectorAll()[0].textContent, '');
assert.deepStrictEqual(api.load_store(), saved);
assert.strictEqual(nodes['current-sheet-name'].textContent, 'Untitled');
nodes['more-toggle'].emit('click');
assert.strictEqual(nodes['more-actions'].hidden, false);
assert.strictEqual(nodes['more-toggle'].getAttribute('aria-expanded'), 'true');
key('Escape');
assert.strictEqual(nodes['more-actions'].hidden, true);
assert.strictEqual(document.activeElement, nodes['more-toggle']);
nodes['more-toggle'].emit('click');
nodes['more-toggle'].emit('click');
nodes.content.focus();
listeners.click.forEach(fn => fn({ target: nodes.content }));
assert.strictEqual(nodes['more-actions'].hidden, true);
assert.strictEqual(document.activeElement, nodes.content);
nodes['more-toggle'].emit('click');
nodes.content.focus();
nodes['more-toggle'].emit('click');
assert.strictEqual(nodes['more-actions'].hidden, true);
assert.strictEqual(document.activeElement, nodes['more-toggle']);
nodes['keyboard-shortcuts'].emit('click');
assert.strictEqual(nodes['shortcuts-dialog'].open, true);
nodes['shortcuts-dialog'].close();
// The display toggle keeps the menu open and redraws lines, subtotals,
// the grand total and every saved sheet's sidebar total without editing text.
api.import_sheet_text('1/3\n---');
for (const line of sheet.querySelectorAll()) {
    line.nextElementSibling = mockUiElement('jo-sum');
    line.nextElementSibling.classList.add('sum');
}
api.save_store([{ id: 'a', lines: ['1/3'] }, { id: 'b', lines: ['2/3'] }]);
const decimals_store_before = JSON.stringify(api.load_store());
api.set_more_open(true);
nodes['decimals-toggle'].tagName = 'BUTTON';
nodes['more-actions'].appendChild(nodes['decimals-toggle']);
nodes['decimals-toggle'].emit('click');
nodes['more-actions'].emit('click', { target: nodes['decimals-toggle'] });
assert.strictEqual(nodes['more-actions'].hidden, false);
assert.strictEqual(nodes['decimals-toggle'].textContent, 'Decimals: 6');
assert.strictEqual(nodes['decimals-toggle'].getAttribute('aria-pressed'), 'true');
assert.strictEqual(String(nodes.total.textContent), '0.333333');
for (const line of sheet.querySelectorAll()) {
    assert.strictEqual(String(line.nextElementSibling.textContent), '0.333333');
}
assert.deepStrictEqual(nodes['shortsave-list'].children.map(item => item.children[0].children[1].textContent),
    ['0.333333', '0.666667']);
assert.strictEqual(JSON.stringify(api.load_store()), decimals_store_before);
assert.ok(nodes.messages.children.some(node => node.children[1].textContent === 'Showing up to 6 decimals'));
nodes['decimals-toggle'].emit('click');
assert.strictEqual(nodes['decimals-toggle'].textContent, 'Decimals: 2');
assert.strictEqual(String(nodes.total.textContent), '0.33');
assert.strictEqual(nodes['more-actions'].hidden, false);
console.log('Decimals menu redraw passed!');

// Pin preferences persist and affect wide layouts only.
wide = true;
nodes['pin-sidebar'].emit('click');
assert.strictEqual(window.localStorage.getItem(api.SIDEBAR_STORAGE_KEY), 'true');
assert.strictEqual(nodes['pin-sidebar'].getAttribute('aria-pressed'), 'true');
assert.ok(document.body.classList.contains('sidebar-pinned'));
assert.strictEqual(nodes.content.inert, false);
api.init_sidebar();
assert.strictEqual(nodes.sidebar.inert, false);
wide = false; resize();
assert.strictEqual(nodes.sidebar.inert, true);
assert.ok(key('F1').prevented);
assert.strictEqual(nodes['quick-help-dialog'].open, true);
const existing = api.load_store();
api.try_help_example(3);
assert.strictEqual(api.load_store().length, existing.length + 1);
for (const entry of existing) assert.deepStrictEqual(api.load_store().find(item => item.id === entry.id), entry);
assert.strictEqual(nodes['sheet-count'].textContent, String(existing.length + 1));
assert.strictEqual(nodes['drawer-toggle'].getAttribute('aria-label'), `Saved sheets (${existing.length + 1})`);
for (const shortcut of ['/', '?']) {
    assert.ok(key(shortcut, { ctrlKey: true, shiftKey: shortcut === '?' }).prevented);
    assert.strictEqual(nodes['shortcuts-dialog'].open, true);
    nodes['shortcuts-dialog'].close();
}
const entries = nodes['shortsave-list'].children.map(item => item.children[0]);
nodes['shortsave-list'].querySelectorAll = () => entries;
entries[0].focus();
api.handle_sheet_list_keys({ key: 'ArrowDown', target: entries[0], preventDefault() {} });
assert.strictEqual(document.activeElement, entries[1]);
api.handle_sheet_list_keys({ key: 'ArrowUp', target: entries[1], preventDefault() {} });
assert.strictEqual(document.activeElement, entries[0]);
// Opening focuses the current entry; Enter opens the focused sheet.
nodes.sidebar.querySelector = selector => selector.includes('aria-current')
    ? entries.find(entry => entry.getAttribute('aria-current')) : entries[0];
nodes['drawer-toggle'].emit('click');
assert.strictEqual(document.activeElement, entries.find(entry => entry.getAttribute('aria-current')));
api.handle_sheet_list_keys({ key: 'Enter', target: entries[0], preventDefault() {} });
assert.strictEqual(document.body.classList.contains('drawer-open'), false);
assert.deepStrictEqual(sheet.querySelectorAll().map(line => line.textContent), api.load_store().find(entry => entry.id === entries[0].getAttribute('data-id')).lines);
window.confirm = () => true;
api.delete_shortsave(entries[0].getAttribute('data-id'));
api.render_shortsave_list();
assert.strictEqual(nodes['sheet-count'].textContent, String(api.load_store().length));
window.location = new URL('https://example.test/preview/layout-b1/');
delete require.cache[require.resolve('../../jotsum.js')];
assert.strictEqual(require('../../jotsum.js').SIDEBAR_STORAGE_KEY, 'jotsum.preview.layout-b1.sidebar-pinned');
console.log('B2 header, sidebar, help and keyboard checks passed!');
