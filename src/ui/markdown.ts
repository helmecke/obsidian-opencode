import { Component, Keymap, MarkdownRenderer } from 'obsidian';
import type { App, PaneType } from 'obsidian';

export interface Timer {
	set(callback: () => void, delay: number): unknown;
	clear(handle: unknown): void;
}

const clock: Timer = {
	set: (callback, delay) => window.setTimeout(callback, delay),
	clear: (handle) => window.clearTimeout(handle as number),
};

export interface MarkdownHost {
	readonly app: App;
	readonly component: Component;
	readonly sourcePath: string;
}

/** Batched Obsidian Markdown with a child lifetime per render; final rendering is immediate. */
export class MarkdownBlock {
	private readonly el: HTMLElement;
	private child?: Component;
	private rendered = '';
	private scheduled?: unknown;
	private pendingText?: string;
	private generation = 0;
	private disposed = false;
	constructor(private readonly host: MarkdownHost, container: HTMLElement,
		private readonly timer: Timer = clock) {
		this.el = container.createDiv({ cls: 'opencode-markdown markdown-rendered' });
	}

	set(text: string, final = false): void {
		if (this.disposed) return;
		if (text === this.rendered) { this.cancel(); return; }
		if (final) {
			this.cancel();
			void this.flush(text);
			return;
		}
		this.pendingText = text;
		// Throttle, not debounce: continuous token traffic must not postpone
		// painting indefinitely. Keep one timer and render its latest text.
		if (this.scheduled !== undefined) return;
		this.scheduled = this.timer.set(() => {
			this.scheduled = undefined;
			const latest = this.pendingText;
			this.pendingText = undefined;
			if (latest !== undefined) void this.flush(latest);
		}, 60);
	}

	dispose(): void {
		this.disposed = true;
		this.cancel();
		this.generation++;
		this.unloadChild();
	}

	private cancel(): void {
		if (this.scheduled !== undefined) this.timer.clear(this.scheduled);
		this.scheduled = undefined;
		this.pendingText = undefined;
	}

	private async flush(text: string): Promise<void> {
		if (this.disposed) return;
		this.rendered = text;
		const generation = ++this.generation;
		const previous = this.child;
		const child = new Component();
		this.host.component.addChild(child);
		this.child = child;
		this.el.empty();
		if (previous) this.host.component.removeChild(previous);
		try {
			await MarkdownRenderer.render(this.host.app, text, this.el, this.host.sourcePath, child);
			if (!this.disposed && this.generation === generation) this.markListBullets();
		} catch {
			if (!this.disposed && this.generation === generation) {
				this.el.setText('Unable to render this part of the answer.');
			}
		}
		if (this.disposed || this.generation !== generation) {
			this.host.component.removeChild(child);
			if (this.child === child) this.child = undefined;
		}
	}

	/**
	 * Obsidian paints a note's bullets from `has-list-bullet` plus one injected
	 * `span.list-bullet` per item, and adds both only while building a reading
	 * view. Reproduce that structure for rendered lists so the transcript's
	 * bullets match a note's colour, size, and radius. Ordered and task lists keep
	 * their own markers.
	 */
	private markListBullets(): void {
		for (const list of Array.from(this.el.querySelectorAll('ul'))) {
			if (list.classList.contains('contains-task-list')) continue;
			if (list.querySelector(':scope > li.task-list-item')) continue;
			list.classList.add('has-list-bullet');
			for (const item of Array.from(list.children)) {
				if (item.tagName !== 'LI') continue;
				if (item.firstElementChild?.classList.contains('list-bullet')) continue;
				const bullet = item.createSpan({ cls: 'list-bullet' });
				item.prepend(bullet);
			}
		}
	}

	private unloadChild(): void {
		if (this.child) {
			this.host.component.removeChild(this.child);
			this.child = undefined;
		}
		this.el.empty();
		this.rendered = '';
	}
}

export interface InternalLinkTarget {
	readonly linkpath: string;
	readonly subpath: string;
}

/** Split Obsidian's href form without interpreting aliases or Markdown. */
export function splitInternalLink(raw: string): InternalLinkTarget {
	const withoutAlias = raw.split('|', 1)[0] ?? '';
	const hash = withoutAlias.indexOf('#');
	if (hash < 0) return { linkpath: withoutAlias.trim(), subpath: '' };
	return { linkpath: withoutAlias.slice(0, hash).trim(), subpath: withoutAlias.slice(hash) };
}

export interface LinkEnvironment {
	/** Obsidian metadata resolution; never creates a file. */
	resolve(linkpath: string, sourcePath: string): { readonly path: string } | null;
	/** Non-chat-leaf navigation preserving heading/block subpaths and the pointer's pane type. */
	open(href: string, sourcePath: string, paneType: PaneType | boolean): void;
	notify(message: string): void;
}

export type LinkDecision =
	| { readonly kind: 'open'; readonly href: string }
	| { readonly kind: 'unresolved'; readonly message: string };

export const UNRESOLVED_LINK = 'Unable to open this internal link: Obsidian found no target in this vault. No file was created.';
export const CONTEXTLESS_LINK = 'Unable to open this internal link: it names only a heading or block, so it has no note target. No file was created.';

/**
 * Stable vault-root source context. Opening never falls back to the active
 * editor or the note that happens to be focused when the link is activated.
 */
export function decideInternalLink(raw: string, sourcePath: string, environment: Pick<LinkEnvironment, 'resolve'>): LinkDecision {
	const { linkpath, subpath } = splitInternalLink(raw);
	if (!linkpath) return { kind: 'unresolved', message: CONTEXTLESS_LINK };
	try {
		const target = environment.resolve(linkpath, sourcePath);
		if (!target || !target.path) return { kind: 'unresolved', message: UNRESOLVED_LINK };
	} catch { return { kind: 'unresolved', message: UNRESOLVED_LINK }; }
	return { kind: 'open', href: `${linkpath}${subpath}` };
}

export interface LinkRegistration {
	registerDomEvent(element: HTMLElement, event: 'click', callback: (event: MouseEvent) => void, options?: AddEventListenerOptions): void;
}

/** Intercept internal anchors before MarkdownRenderer's own navigation handler. */
export function attachLinkRouter(container: HTMLElement, sourcePath: string,
	environment: LinkEnvironment, register: LinkRegistration): void {
	register.registerDomEvent(container, 'click', (event) => {
		const target = event.targetNode;
		if (!target?.instanceOf(Element)) return;
		const anchor = target.closest('a.internal-link');
		if (!anchor?.instanceOf(HTMLAnchorElement)) return;
		const raw = anchor.getAttribute('data-href') ?? anchor.getAttribute('href');
		if (!raw) return;
		event.preventDefault();
		event.stopPropagation();
		const decision = decideInternalLink(raw, sourcePath, environment);
		if (decision.kind === 'unresolved') { environment.notify(decision.message); return; }
		// Never navigate the chat leaf: the destination comes from the pointer,
		// using the same modifier translation as Obsidian's own link handler.
		environment.open(decision.href, sourcePath, Keymap.isModEvent(event));
	}, { capture: true });
}

export { MarkdownRenderer };
