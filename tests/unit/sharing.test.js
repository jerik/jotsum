const assert = require('assert');
const { JoLine, JoSheet, load_store, SHEET_STORAGE_KEY, STORE_STORAGE_KEY, encode_shared_sheet, decode_shared_sheet, save_shared_sheet, share_sheet } = require('../../jotsum.js');

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
    const notices = {};
    const total = element(new HTMLElement(), 'SPAN');
    global.document = {
        getElementById: id => id === 'sheet' ? sheet : id === 'total' ? total : (notices[id] ||= element(new HTMLElement(), 'DIV')),
        createElement: tag => element(tag === 'jo-line' ? new JoLine() : new HTMLElement(), tag.toUpperCase()),
        addEventListener: () => {}
    };
    window.location = new URL('https://example.test/jotsum.html' + search);
    window.history = {
        replaceState: (_state, _title, url) => { window.location = new URL(url); }
    };
    return { sheet, total, notices, texts: () => sheet.querySelectorAll().map(line => line.textContent) };
}


(async () => {
    for (const lines of [['Rent 12', 'Food 3'], ['Äpfel 🥑 4', 'Grüße'], ['', '10', '', ''], ['abc'.repeat(1024)]]) {
        assert.deepStrictEqual(await decode_shared_sheet(await encode_shared_sheet(lines)), lines);
    }
    assert.ok((await encode_shared_sheet(['x'])).startsWith('1u.'));
    assert.ok((await encode_shared_sheet(['abc'.repeat(1024)])).startsWith('1d.'));

    const lines = ['Rent 1200', '', 'Food 300', '<img src=x onerror=alert()>'];
    const encoded = await encode_shared_sheet(lines);
    window.localStorage.reset();
    window.sessionStorage.reset();
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Existing 8']));
    const before = JSON.stringify(window.localStorage.data);
    const sessionBefore = JSON.stringify(window.sessionStorage.data);
    const page = fixture('#s=' + encoded);
    await window.onload();
    assert.deepStrictEqual(page.texts(), lines);
    assert.strictEqual(page.total.textContent, 1500);
    assert.strictEqual(JSON.stringify(window.localStorage.data), before);
    assert.strictEqual(JSON.stringify(window.sessionStorage.data), sessionBefore);
    assert.strictEqual(page.notices['shared-sheet-banner'].hidden, false);
    save_shared_sheet();
    save_shared_sheet();
    assert.strictEqual(window.location.hash, '');
    assert.strictEqual(page.notices['shared-sheet-banner'].hidden, true);
    assert.strictEqual(load_store().filter(entry => JSON.stringify(entry.lines) === JSON.stringify(lines)).length, 1);
    assert.deepStrictEqual(load_store().find(entry => entry.lines[0] === 'Existing 8').lines, ['Existing 8']);
    assert.strictEqual(load_store().length, 2);

    let copied;
    window.navigator.clipboard.writeText = async text => { copied = text; };
    await share_sheet();
    assert.strictEqual(copied, 'https://example.test/jotsum.html#s=' + encoded);
    assert.ok(page.notices['sharing-notice'].textContent.includes('It is a snapshot.'));

    // Deterministic varied text keeps the compressed link above the messenger threshold.
    page.sheet.querySelectorAll()[0].textContent = Array.from({ length: 1500 }, (_, i) => Math.imul(i, 2654435761).toString(36)).join(' ');
    page.sheet.update_total();
    await share_sheet();
    assert.ok(copied.length > 2000);
    assert.ok(page.notices['sharing-notice'].textContent.includes('some messengers may cut it'));

    const invalid = [
        '2u.eA', '1u.!!!', '1u.a', '1u.eB', '1d.eA',
        '1u.' + 'a'.repeat(64 * 1024),
        await encode_shared_sheet(['x'.repeat(256 * 1024 + 1)]),
        await encode_shared_sheet(Array(2001).fill(''))
    ];
    for (const value of invalid) {
        const bad = fixture('#s=' + value);
        const local = JSON.stringify(window.localStorage.data);
        const session = JSON.stringify(window.sessionStorage.data);
        await window.onload();
        assert.deepStrictEqual(bad.texts(), []);
        assert.strictEqual(JSON.stringify(window.localStorage.data), local);
        assert.strictEqual(JSON.stringify(window.sessionStorage.data), session);
        assert.ok(bad.notices['sharing-notice'].textContent.includes('Could not open shared sheet'));
    }
    const editing = fixture('#s=' + encoded);
    await window.onload();
    editing.sheet.querySelectorAll()[0].textContent = 'Rent 1300';
    editing.sheet.update_total();
    assert.strictEqual(window.location.hash, '');
    assert.strictEqual(load_store().filter(entry => entry.lines[0] === 'Rent 1300').length, 1);
    console.log('Shared fragment codec, preview, save, editing and rejection tests passed!');
})().catch(error => { console.error(error); process.exitCode = 1; });
