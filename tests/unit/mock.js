global.HTMLElement = class HTMLElement {
    constructor() {
        this.attributes = {};
    }
    setAttribute(name, value) {
        this.attributes[name] = value;
    }
    addEventListener() {}
};
global.customElements = {
    define: () => {}
};
global.document = {
    getElementById: () => ({}),
    createElement: () => new global.HTMLElement(),
    querySelector: () => ({
        children: []
    }),
    body: {
        addEventListener: () => {}
    }
};
global.window = {
    onload: () => {}
};
global.add_calc_line = () => {};