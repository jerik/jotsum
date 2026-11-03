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
    for (const name of ['background', 'surface', 'text', 'muted', 'border', 'hover', 'active', 'accent', 'danger', 'warning', 'info', 'success']) {
        assert.match(palette, new RegExp(`--${name}:`));
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
