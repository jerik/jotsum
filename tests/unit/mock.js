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
    onload: () => {},
    localStorage: {
        data: {},
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
        },
        setItem(key, value) {
            this.data[key] = String(value);
        },
        removeItem(key) {
            delete this.data[key];
        },
        reset() {
            this.data = {};
        }
    }
};
global.add_calc_line = () => {};

// Browser storage and URL globals for fragment-sharing tests.
window.sessionStorage = {
    ...window.localStorage,
    data: {}
};
window.navigator = { clipboard: { writeText: async () => {} } };
