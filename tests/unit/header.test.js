const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '../../jotsum.html'), 'utf8');
const menu = html.match(/<nav\b[\s\S]*?<\/nav>/)[0];
const visible = menu.slice(0, menu.indexOf('<ul id="more-actions"'));
assert.deepStrictEqual([...visible.matchAll(/<button[^>]*id="([^"]+)"/g)].map(m => m[1]), ['more-toggle']);
assert.doesNotMatch(html, /<header\b|<footer\b/);
assert.match(html, /<title>jotsum · A<\/title>/);
assert.match(menu, /A · Notizblock/);
for (const entry of ['New sheet', 'Share', 'Saved sheets', 'Import .txt…', 'Export .txt', 'Add line', 'Keyboard shortcuts', 'About / GitHub', 'id="version"']) assert.ok(menu.includes(entry));
assert.doesNotMatch(html, /class="touch-action"/);
assert.match(html, /max-width: none/);

const api = require('../../jotsum.js');
let wide = true;
window.matchMedia = () => ({ matches: wide });
window.location = new URL('https://example.test/');
window.history = { replaceState: (_a, _b, url) => { window.location = new URL(url); } };
const ids = ['sidebar', 'drawer-toggle', 'shortsave-list', 'shortsave-empty', 'sidebar-title', 'new-sheet',
    'content', 'header-actions', 'drawer-backdrop', 'more-actions', 'more-toggle', 'add-line',
    'keyboard-shortcuts', 'shortcut-list', 'current-sheet-name', 'total', 'decimals-toggle', 'messages'];
const nodes = Object.fromEntries(ids.map(id => [id, mockUiElement()]));
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
api.init_sidebar();
const key = (key, options = {}) => {
    const event = { key, preventDefault() { this.prevented = true; }, ...options };
    (listeners.keydown || []).forEach(fn => fn(event));
    return event;
};
assert.strictEqual(nodes['drawer-toggle'].getAttribute('aria-expanded'), 'false');
const before = JSON.stringify(window.localStorage.data);
assert.ok(key('b', { ctrlKey: true, target: { isContentEditable: true } }).prevented);
assert.ok(document.body.classList.contains('drawer-open'));
assert.strictEqual(JSON.stringify(window.localStorage.data), before);
assert.strictEqual(nodes.content.inert, true);
assert.strictEqual(nodes['header-actions'].inert, true);
key('Escape');
assert.ok(!document.body.classList.contains('drawer-open'));
assert.strictEqual(document.activeElement, nodes['more-toggle']);
assert.strictEqual(nodes.content.inert, false);
for (const width of [false, true]) {
    wide = width;
    api.set_more_open(true);
    nodes['drawer-toggle'].emit('click');
    assert.ok(document.body.classList.contains('drawer-open'));
    assert.strictEqual(nodes['more-actions'].hidden, true);
    assert.strictEqual(nodes.sidebar.inert, false);
    nodes['sidebar-title'].focus();
    nodes['drawer-backdrop'].emit('click');
    assert.strictEqual(nodes.sidebar.inert, true);
    assert.strictEqual(document.activeElement, nodes['more-toggle']);
}
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
const lineCount = sheet.querySelectorAll().length;
nodes['add-line'].emit('click', { target: addLineLabel });
// Dispatch the bubbling phase after the entry's action has focused the new line.
nodes['more-actions'].emit('click', { target: addLineLabel });
listeners.click.forEach(fn => fn({ target: addLineLabel }));
assert.strictEqual(sheet.querySelectorAll().length, lineCount + 1);
assert.strictEqual(document.activeElement, sheet.querySelectorAll().at(-1));
assert.strictEqual(nodes['more-actions'].hidden, true);
assert.strictEqual(nodes['more-toggle'].getAttribute('aria-expanded'), 'false');
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
assert.strictEqual(nodes['shortcut-list'].hidden, false);
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

// A stored preference from another layout must never pin or open the drawer.
for (const preference of ['true', 'false']) {
    window.localStorage.setItem(api.SIDEBAR_STORAGE_KEY, preference);
    api.init_sidebar();
    assert.ok(!document.body.classList.contains('drawer-open'));
    assert.strictEqual(nodes['drawer-toggle'].getAttribute('aria-expanded'), 'false');
    assert.strictEqual(nodes.sidebar.inert, true);
}
console.log('Notepad markup, shortcuts, disclosure and drawer checks passed!');
