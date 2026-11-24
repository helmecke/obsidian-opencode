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
		registerEvent(eventRef) { this.register(() => eventRef.e.offref(eventRef)); }
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
	const modals = [];
	class Component {
		events = [];
		cleanups = [];
		children = new Set();
		register(callback) { this.cleanups.push(callback); }
		registerEvent(eventRef) { this.register(() => eventRef.e.offref(eventRef)); }
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
		constructor(leaf) {
			super();
			this.leaf = leaf;
			this.app = app;
			this.containerEl = document.createElement('div');
			this.contentEl = document.createElement('div');
			this.containerEl.appendChild(this.contentEl);
		}
	}
	class Modal {
		constructor(modalApp) {
			this.app = modalApp;
			this.containerEl = document.createElement('div');
			this.modalEl = document.createElement('div');
			this.titleEl = document.createElement('div');
			this.contentEl = document.createElement('div');
			this.modalEl.appendChild(this.titleEl);
			this.modalEl.appendChild(this.contentEl);
			this.containerEl.appendChild(this.modalEl);
			this.isOpen = false;
			modals.push(this);
		}
		open() { this.isOpen = true; this.onOpen(); }
		close() { this.isOpen = false; this.onClose(); }
		onOpen() {}
		onClose() {}
	}
	class FuzzySuggestModal extends Modal {
		constructor(modalApp) {
			super(modalApp);
			this.limit = 100;
			this.inputEl = document.createElement('input');
			this.contentEl.appendChild(this.inputEl);
		}
		setPlaceholder(placeholder) { this.inputEl.placeholder = placeholder; }
		getSuggestions(query) {
			const needle = query.toLowerCase();
			return (this.getItems?.() ?? [])
				.filter((item) => this.getItemText(item).toLowerCase().includes(needle))
				.map((item) => ({ item, match: { score: 0, matches: [] } }));
		}
	}
	class Menu {
		constructor() { this.items = []; }
		addItem(callback) {
			const item = {
				title: '', icon: undefined, disabled: false, click: undefined,
				setTitle(value) { item.title = value; return item; },
				setIcon(value) { item.icon = value; return item; },
				setDisabled(value) { item.disabled = value; return item; },
				onClick(callback2) { item.click = callback2; return item; },
			};
			callback(item);
			this.items.push(item);
			return this;
		}
		addSeparator() { return this; }
	}
	class AbstractInputSuggest {
		constructor(suggestApp, textInputEl) {
			this.app = suggestApp;
			this.textInputEl = textInputEl;
			this.limit = 100;
			this.suggestions = [];
			this.isOpen = false;
			this.onSelectCallback = undefined;
			this.scope = {
				handlers: [],
				register(modifiers, key, callback) {
					const handler = { modifiers, key, callback };
					this.handlers.push(handler);
					return handler;
				},
				unregister(handler) {
					const index = this.handlers.indexOf(handler);
					if (index >= 0) this.handlers.splice(index, 1);
				},
			};
			textInputEl.__suggest = this;
			textInputEl.addEventListener('input', () => this.refresh());
		}
		getValue() { return this.textInputEl.value; }
		setValue(value) { this.textInputEl.value = value; }
		refresh() {
			const results = this.getSuggestions(this.textInputEl.value);
			if (Array.isArray(results)) {
				this.suggestions = results;
				this.isOpen = results.length > 0;
				return;
			}
			// A skill query loads the catalog asynchronously; keep the last rows until it resolves.
			Promise.resolve(results).then((entries) => {
				this.suggestions = Array.isArray(entries) ? entries : [];
				this.isOpen = this.suggestions.length > 0;
			}).catch(() => {
				this.suggestions = [];
				this.isOpen = false;
			});
		}
		onSelect(callback) { this.onSelectCallback = callback; return this; }
		open() { this.isOpen = true; }
		close() { this.isOpen = false; }
	}
	return {
		modals,
		Component,
		ItemView,
		Modal,
		FuzzySuggestModal,
		Menu,
		AbstractInputSuggest,
		prepareFuzzySearch(query) {
			const needle = query.toLowerCase();
			return (text) => {
				const haystack = text.toLowerCase();
				const index = haystack.indexOf(needle);
				return index < 0 ? null : { score: 100 - index, matches: [] };
			};
		},
		sortSearchResults(results) {
			results.sort((left, right) => right.match.score - left.match.score);
		},
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
		setTooltip(element, tooltip, options = {}) {
			element.setAttribute('aria-label', tooltip);
			if (options.placement) element.setAttribute('data-tooltip-position', options.placement);
			if (options.classes) element.addClass(...options.classes);
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
