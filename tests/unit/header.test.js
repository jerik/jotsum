const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '../../jotsum.html'), 'utf8');
const header = html.match(/<header\b[\s\S]*?<\/header>/)[0];
const visible = header.slice(0, header.indexOf('<ul id="more-actions"'));
assert.deepStrictEqual([...visible.matchAll(/<button[^>]*id="([^"]+)"/g)].map(m => m[1]),
    ['drawer-toggle', 'new-sheet', 'share-sheet', 'more-toggle']);
assert.match(visible, /class="brand">jotsum/);
assert.match(visible, /class="action-label">New/);
assert.match(visible, /class="action-label">Share/);
assert.doesNotMatch(visible, /Add line/);
for (const entry of ['Import .txt…', 'Export .txt', 'Add line', 'Keyboard shortcuts', 'About / GitHub']) assert.ok(header.includes(entry));
assert.match(header, /class="touch-action"><button[^>]*id="add-line"/);
assert.match(html, /@media \(pointer: coarse\)/);
assert.match(html, /max-width: 519\.98px/);
assert.doesNotMatch(header, /decimals|Open shared link/);
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
    'keyboard-shortcuts', 'shortcut-list', 'current-sheet-name', 'total'];
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
assert.strictEqual(nodes['drawer-toggle'].getAttribute('aria-expanded'), 'true');
assert.ok(key('b', { ctrlKey: true, target: { isContentEditable: true } }).prevented);
assert.ok(document.body.classList.contains('sidebar-collapsed'));
assert.strictEqual(window.localStorage.getItem(api.SIDEBAR_STORAGE_KEY), 'true');
wide = false; resize();
assert.ok(!document.body.classList.contains('drawer-open'));
const before = JSON.stringify(window.localStorage.data);
api.handle_header_keys({ key: 'b', ctrlKey: true, preventDefault() {} });
assert.ok(document.body.classList.contains('drawer-open'));
assert.strictEqual(JSON.stringify(window.localStorage.data), before);
assert.strictEqual(nodes.content.inert, true);
key('Escape');
assert.ok(!document.body.classList.contains('drawer-open'));
assert.strictEqual(document.activeElement, nodes['drawer-toggle']);
assert.strictEqual(nodes.content.inert, false);
wide = true; resize();
assert.ok(document.body.classList.contains('sidebar-collapsed'));
api.toggle_sidebar();
assert.strictEqual(window.localStorage.getItem(api.SIDEBAR_STORAGE_KEY), 'false');
wide = false; resize();
assert.ok(!document.body.classList.contains('drawer-open'));
wide = true; resize();
assert.strictEqual(nodes['drawer-toggle'].getAttribute('aria-expanded'), 'true');
for (const collapse of [() => key('b', { ctrlKey: true }), () => nodes['drawer-toggle'].emit('click')]) {
    nodes['sidebar-title'].focus();
    collapse();
    assert.strictEqual(nodes.sidebar.inert, true);
    assert.strictEqual(document.activeElement, nodes['drawer-toggle']);
    api.toggle_sidebar();
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
// Initialization restores the wide preference but never opens a narrow drawer.
window.localStorage.setItem(api.SIDEBAR_STORAGE_KEY, 'true');
api.init_sidebar();
assert.ok(document.body.classList.contains('sidebar-collapsed'));
wide = false;
api.init_sidebar();
assert.ok(!document.body.classList.contains('drawer-open'));
assert.strictEqual(nodes['drawer-toggle'].getAttribute('aria-expanded'), 'false');
wide = true;
window.localStorage.setItem(api.SIDEBAR_STORAGE_KEY, 'false');
api.init_sidebar();
assert.ok(!document.body.classList.contains('sidebar-collapsed'));
// Optional persistence must never block the toggle.
window.localStorage.setItem = () => { throw Error('blocked'); };
api.toggle_sidebar();
assert.ok(document.body.classList.contains('sidebar-collapsed'));
window.localStorage.getItem = () => { throw Error('blocked'); };
assert.doesNotThrow(() => api.init_sidebar());
console.log('Header markup, shortcuts, disclosure, sidebar and persistence checks passed!');
