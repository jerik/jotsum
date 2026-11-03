const assert = require('assert');
const api = require('../../jotsum.js');
const { JoLine, JoSheet } = api;
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


(async () => {
const values = [0.1 + 0.2, 1/3, 1.005, 2.675, -1.005, 64.20, 850, 379.80, 1e21, 1e-7, 1e-8, -0, 0.004, -0.004];
const expected = {
    '2': ['0.30', '0.33', '1.01', '2.68', '-1.01', '64.20', '850', '379.80', '1e+21', '0', '0', '0', '0', '0']
};
window.localStorage.reset();
let page = fixture('?text=%3Ax%20%3D%201%2F3%0A%3Ax%20*%203');
window.onload();
for (const [value, expected] of [
    [100000000000000.25, '100000000000000.25'],
    [2000000000000000.5, '2000000000000000.50'],
    [-2000000000000000.5, '-2000000000000000.50']
]) {
    assert.strictEqual(api.round_for_display(value), expected);
}
for (const mode of ['2', '6']) {
    if (mode === '6') api.toggle_decimals();
    if (mode === '2') assert.deepStrictEqual(values.map(value => String(api.round_for_display(value))), expected[mode]);
    else {
        const cases = [
            [1/3, '0.333333'], [64.20, '64.2'], [1.759, '1.759'],
            [0.5, '0.5'], [850, '850'], [0.1 + 0.2, '0.3'], [1e-7, '0'],
            [1.0000005, '1.000001'], [-1.0000005, '-1.000001'],
            [-1e-7, '0'], [-0, '0'], [1e21, '1e+21'],
            [2000000000000000.5, '2000000000000000.5'],
            [-2000000000000000.5, '-2000000000000000.5']
        ];
        for (const [value, display] of cases) assert.strictEqual(String(api.round_for_display(value)), display);
    }
    const result = api.evaluate_sheet([':x = 1/3', ':x * 3', '---', ':SUBTOTAL_1 * 3']);
    const fractional_subtotal = api.evaluate_sheet(['1/3', '---', ':SUBTOTAL_1 * 3']);
    assert.strictEqual(fractional_subtotal.vars.get('SUBTOTAL_1'), 1/3);
    assert.strictEqual(fractional_subtotal.sums[2], 1);
    assert.strictEqual(result.vars.get('x'), 1/3);
    assert.strictEqual(result.sums[1], 1);
    assert.strictEqual(result.vars.get('SUBTOTAL_1'), 1);
    assert.strictEqual(String(api.round_for_display(result.sums[1])), '1');
    console.log(mode + ': ' + values.map(value => String(api.round_for_display(value))).join(' | '));
}
assert.strictEqual(window.localStorage.getItem(api.DECIMALS_STORAGE_KEY), '6');
// Reload the module as well as the page: no in-memory preference can survive.
delete require.cache[require.resolve('../../jotsum.js')];
const reloaded = require('../../jotsum.js');
window.onload();
assert.strictEqual(String(reloaded.round_for_display(1/3)), '0.333333');
// A legacy preference migrates silently and is persisted as 6.
window.localStorage.setItem(api.DECIMALS_STORAGE_KEY, 'all');
const messagesBeforeMigration = page.total.children.length;
reloaded.load_decimals();
assert.strictEqual(page.total.children.length, messagesBeforeMigration);
assert.strictEqual(window.localStorage.getItem(api.DECIMALS_STORAGE_KEY), '6');
assert.strictEqual(String(reloaded.round_for_display(1/3)), '0.333333');
reloaded.save_store([{ id: 'a', lines: ['1/3'] }, { id: 'b', lines: ['2/3'] }]);
assert.deepStrictEqual(reloaded.list_shortsaves().map(entry => entry.total), ['0.333333', '0.666667']);
assert.deepStrictEqual(reloaded.load_store().map(entry => entry.lines), [['1/3'], ['2/3']]);
const lines = [':x = 1/3', ':x * 3'];
const shared = await reloaded.encode_shared_sheet(lines);
assert.deepStrictEqual(await reloaded.decode_shared_sheet(shared), lines);
assert.strictEqual(reloaded.sheet_export(lines).text, lines.join('\n'));
page = fixture('?text=1%2F3%0A%0A2%2F3&decimals=2');
window.onload();
assert.deepStrictEqual(page.texts(), ['1/3', '', '2/3']);
assert.strictEqual(String(reloaded.round_for_display(1/3)), '0.333333');
reloaded.toggle_decimals();
assert.strictEqual(await reloaded.encode_shared_sheet(lines), shared);
assert.strictEqual(reloaded.sheet_export(lines).text, lines.join('\n'));
assert.deepStrictEqual(page.texts(), ['1/3', '', '2/3']);
// Storage failures are visible, and the preference remains usable in memory.
const notices = [];
const create = document.createElement;
document.createElement = tag => {
    const node = create(tag);
    if (tag === 'section') notices.push(node);
    return node;
};
const get = window.localStorage.getItem;
window.localStorage.getItem = () => { throw new Error('blocked'); };
reloaded.load_decimals();
window.localStorage.getItem = get;
assert.strictEqual(String(reloaded.round_for_display(1/3)), '0.33');
assert.ok(notices.some(node => node.children[1].textContent === "Couldn't read decimals setting in this browser."));
const set = window.localStorage.setItem;
window.localStorage.setItem = () => { throw new Error('quota'); };
reloaded.toggle_decimals();
assert.strictEqual(String(reloaded.round_for_display(1/3)), '0.333333');
window.localStorage.setItem = set;
assert.ok(notices.some(node => node.children[1].textContent === "Couldn't save in this browser. Export to keep a copy."));
console.log('Decimals formatting, persistence, precision and content isolation passed!');

})().catch(error => { console.error(error); process.exitCode = 1; });
