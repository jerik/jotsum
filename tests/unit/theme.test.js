const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('jotsum.html');
const js = read('jotsum.js');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
assert.match(css, /color-scheme:\s*light dark\s*;/);
assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{/);
const palettes = [...css.matchAll(/:root\s*{([^{}]*)}/g)];
assert.strictEqual(palettes.length, 2);
for (const [, palette] of palettes) {
    for (const name of ['background', 'surface', 'text', 'muted', 'border', 'hover', 'active', 'selection', 'accent', 'danger', 'warning', 'info', 'success']) {
        assert.match(palette, new RegExp(`--${name}:`));
    }
}
// Selection must remain visible even inside the focused line.
const selections = [...css.matchAll(/::selection\s*{([^{}]*)}/g)];
assert.ok(selections.length > 0);
for (const [, selection] of selections) {
    assert.match(selection, /background:\s*var\(--selection\)\s*;/);
    assert.match(selection, /color:\s*var\(--text\)\s*;/);
    assert.doesNotMatch(selection, /var\(--(?:active|line|surface|bg|background)\)/);
}
function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
    const values = [luminance(a), luminance(b)];
    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}
for (const [index, [, palette]] of palettes.entries()) {
    const colour = name => {
        const match = palette.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i'));
        assert.ok(match, `Palette ${index}: --${name} must be a hex colour`);
        return match[1];
    };
    for (const name of ['active', 'line', 'surface', 'background', 'text']) {
        const ratio = contrast(colour('selection'), colour(name));
        const minimum = name === 'text' ? 4.5 : 1.5;
        assert.ok(ratio >= minimum, `Palette ${index}: selection/${name} contrast ${ratio} < ${minimum}`);
    }
}
const names = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
function noColours(source) {
    source = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/var\(--[\w-]+\)/g, '');
    assert.doesNotMatch(source, /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\s*\(/i);
    for (const word of source.match(/[a-z]+/gi) || []) assert.ok(!names.has(word.toLowerCase()), `Literal colour: ${word}`);
}
// Theme-color metadata and the encoded icon necessarily carry literal colours;
// every CSS declaration outside the two palettes must use tokens.
const outside = css.replace(/:root\s*{[^{}]*}/g, '');
for (const [, value] of outside.matchAll(/[\w-]+\s*:\s*([^;{}]+)[;}]/g)) noColours(value);
for (const [, value] of html.matchAll(/\bstyle=["']([^"']*)["']/g)) noColours(value);
for (const [, value] of js.matchAll(/(?:\.style(?:\.\w+)?|\.cssText)\s*=\s*["'`]([^"'`]*)["'`]/g)) noColours(value);
for (const [, value] of js.matchAll(/setAttribute\(\s*["']style["']\s*,\s*["'`]([^"'`]*)["'`]/g)) noColours(value);
assert.doesNotMatch(css, /--side-(?:bg|text|muted|border|hover|active-bg|accent|danger)\b/);
const favicon = html.match(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="data:image\/svg\+xml,([^"]+)"/);
assert.ok(favicon);
assert.strictEqual(decodeURIComponent(favicon[1]), read('icon.svg').trim());
assert.match(html, /<link\s+rel="apple-touch-icon"\s+href="https:\/\/jerik.github.io\/jotsum\/apple-touch-icon.png"/);
const png = fs.readFileSync(path.join(root, 'apple-touch-icon.png'));
assert.strictEqual(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.strictEqual(png.toString('ascii', 12, 16), 'IHDR');
assert.strictEqual(png.readUInt32BE(16), 256);
assert.strictEqual(png.readUInt32BE(20), 256);
for (const [mode, palette] of [['light', palettes[0][1]], ['dark', palettes[1][1]]]) {
    const surface = palette.match(/--surface:\s*([^;]+);/)[1];
    assert.ok(html.includes(`<meta name="theme-color" media="(prefers-color-scheme: ${mode})" content="${surface}"`));
}
assert.doesNotMatch(html + js, /JotSum/);
console.log('Theme and icon checks passed!');
