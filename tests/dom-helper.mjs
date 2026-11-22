import { JSDOM } from 'jsdom';

/** Minimal Obsidian DOM helpers on top of jsdom; tests use real elements and events. */
export function installDom() {
	const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'app://obsidian.md' });
	const { window } = dom;
	for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLAnchorElement', 'HTMLButtonElement',
		'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLInputElement', 'HTMLDetailsElement', 'HTMLOptionElement',
		'Event', 'MouseEvent', 'KeyboardEvent', 'Node']) {
		globalThis[key] = window[key];
	}
	const element = window.Element.prototype;
	element.createEl = function createEl(tag, options = {}) {
		const child = this.ownerDocument.createElement(tag);
		if (options.cls) child.className = options.cls;
		if (options.text !== undefined) child.textContent = String(options.text);
		if (options.title !== undefined) child.title = options.title;
		if (options.href !== undefined) child.setAttribute('href', options.href);
		if (options.type) child.setAttribute('type', options.type);
		if (options.value !== undefined) child.value = options.value;
		for (const [name, value] of Object.entries(options.attr ?? {})) child.setAttribute(name, String(value));
		this.appendChild(child);
		return child;
	};
	element.createDiv = function createDiv(options = {}) { return this.createEl('div', options); };
	element.createSpan = function createSpan(options = {}) { return this.createEl('span', options); };
	element.empty = function empty() { while (this.firstChild) this.removeChild(this.firstChild); };
	element.addClass = function addClass(...classes) { this.classList.add(...classes); };
	element.removeClass = function removeClass(...classes) { this.classList.remove(...classes); };
	element.toggleClass = function toggleClass(name, value) { this.classList.toggle(name, value); };
	element.setText = function setText(text) { this.textContent = String(text); };
	element.setAttr = function setAttr(name, value) { this.setAttribute(name, String(value)); };
	element.setCssProps = function setCssProps(props) {
		for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value);
	};
	const notices = [];
	class Component {
		events = [];
		cleanups = [];
		children = new Set();
		register(callback) { this.cleanups.push(callback); }
		registerDomEvent(element, event, callback, options) {
			const listener = { element, event, callback };
			this.events.push(listener);
			element.addEventListener(event, callback, options);
			this.register(() => { this.events.splice(this.events.indexOf(listener), 1); element.removeEventListener(event, callback, options); });
		}
		addChild(child) { this.children.add(child); return child; }
		removeChild(child) { child.unload(); this.children.delete(child); }
		unload() {
			for (const child of this.children) child.unload();
			this.children.clear();
			for (const cleanup of this.cleanups.splice(0)) cleanup();
		}
	}
	return { dom, window, document: window.document, notices, Component };
}

export function createObsidian(app, notices = [], extra = {}) {
	class Component {
		events = [];
		cleanups = [];
		children = new Set();
		register(callback) { this.cleanups.push(callback); }
		registerDomEvent(element, event, callback, options) {
			const listener = { element, event, callback };
			this.events.push(listener);
			element.addEventListener(event, callback, options);
			this.register(() => { this.events.splice(this.events.indexOf(listener), 1); element.removeEventListener(event, callback, options); });
		}
		addChild(child) { this.children.add(child); return child; }
		removeChild(child) { child.unload(); this.children.delete(child); }
		unload() {
			for (const child of this.children) child.unload();
			this.children.clear();
			for (const cleanup of this.cleanups.splice(0)) cleanup();
		}
	}
	class ItemView extends Component {
		constructor(leaf) { super(); this.leaf = leaf; this.app = app; this.contentEl = document.createElement('div'); }
	}
	return {
		Component,
		ItemView,
		Scope: class {
			handlers = new Set();
			constructor(parent) { this.parent = parent; }
			register(modifiers, key, callback) {
				const handler = { modifiers, key, callback };
				this.handlers.add(handler);
				return handler;
			}
			unregister(handler) { this.handlers.delete(handler); }
		},
		Notice: class { constructor(message) { notices.push(message); } },
		setIcon(element, icon) {
			element.empty();
			const svg = element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('class', `svg-icon lucide-${icon}`);
			svg.setAttribute('aria-hidden', 'true');
			element.appendChild(svg);
		},
		MarkdownRenderer: {
			async render(_app, markdown, el) {
				const text = document.createElement('p');
				text.textContent = markdown;
				el.appendChild(text);
			},
		},
		PluginSettingTab: class {},
		Setting: class {},
		FileSystemAdapter: class { getBasePath() { return app?.vault?.adapter?.getBasePath?.() ?? 'C:\\Vault'; } },
		Plugin: class extends Component {},
		...extra,
	};
}

export function click(element) {
	element.dispatchEvent(new globalThis.window.MouseEvent('click', { bubbles: true }));
}

export function keydown(element, init) {
	element.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { bubbles: true, ...init }));
}
