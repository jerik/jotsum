global.HTMLElement = class HTMLElement {
    constructor() {
        this.attributes = {};
        this.children = [];
        this.handlers = {};
    }
    setAttribute(name, value) {
        this.attributes[name] = value;
    }
    addEventListener(type, run) { this.handlers[type] = run; }
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
};
global.customElements = {
    define: () => {}
};
global.document = {
    getElementById: () => new global.HTMLElement(),
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

// Opt-in DOM fixture for UI behavior tests; existing minimal globals stay unchanged.
global.mockUiElement = function (tagName = 'DIV') {
    const node = new HTMLElement();
    const classes = new Set();
    node.tagName = tagName.toUpperCase();
    node.children = [];
    node.textContent = '';
    node.hidden = false;
    node.listeners = {};
    node.addEventListener = (type, listener) => (node.listeners[type] ||= []).push(listener);
    node.emit = (type, event = {}) => (node.listeners[type] || []).forEach(fn => fn(event));
    node.classList = {
        contains: name => classes.has(name),
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); }
    };
    node.getAttribute = name => node.attributes[name] ?? null;
    node.removeAttribute = name => delete node.attributes[name];
    node.appendChild = child => { node.children.push(child); child.parentElement = node; return child; };
    node.removeChild = child => node.children.splice(node.children.indexOf(child), 1);
    Object.defineProperty(node, 'firstChild', { get: () => node.children[0] });
    node.contains = target => target === node || node.children.some(child => child.contains(target));
    node.closest = selectors => {
        const tags = selectors.split(',').map(tag => tag.trim().toUpperCase());
        for (let element = node; element; element = element.parentElement) {
            if (tags.includes(element.tagName)) return element;
        }
        return null;
    };
    node.querySelector = () => null;
    node.querySelectorAll = () => [];
    node.focus = () => { document.activeElement = node; };
    return node;
};
