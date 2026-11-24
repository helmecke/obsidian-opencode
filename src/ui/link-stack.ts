import { MarkdownView } from 'obsidian';
import type { App, TFile, Workspace, WorkspaceLeaf } from 'obsidian';
import { splitInternalLink } from './markdown';

/** Obsidian reads the focus preference through this untyped vault surface. */
interface ConfigurableVault {
	getConfig?(key: string): unknown;
}

interface ContainerWithChildren {
	children?: unknown[];
}

/**
 * Append a tab to the group that holds `leaf`. The group container is a tab
 * group at runtime even though Obsidian calls that API parameter a split.
 */
export function appendTab(workspace: Workspace, leaf: WorkspaceLeaf): WorkspaceLeaf | undefined {
	const parent = leaf.parent;
	const index = (parent as ContainerWithChildren).children?.length ?? 0;
	try {
		return workspace.createLeafInParent(parent, index);
	} catch {
		return undefined;
	}
}

/**
 * Pick the note tab for a plain click. A leaf outside the chat's tab group is
 * preferred, then an existing note tab in that group; `undefined` means the
 * caller should open a split instead of replacing the conversation.
 */
export function reservedNoteLeaf(workspace: Workspace, chat?: WorkspaceLeaf): WorkspaceLeaf | undefined {
	const leaves: WorkspaceLeaf[] = [];
	collectLeaves(workspace.rootSplit, leaves);
	const note = (leaf: WorkspaceLeaf): boolean => leaf !== chat && isNoteLeaf(leaf);
	return leaves.find((leaf) => note(leaf) && (!chat || leaf.parent !== chat.parent))
		?? leaves.find(note);
}

function collectLeaves(node: unknown, leaves: WorkspaceLeaf[]): void {
	const candidate = node as { children?: unknown[]; openFile?: unknown } | null;
	if (candidate && typeof candidate.openFile === 'function') {
		leaves.push(node as WorkspaceLeaf);
		return;
	}
	for (const child of candidate?.children ?? []) collectLeaves(child, leaves);
}

function isNoteLeaf(leaf: WorkspaceLeaf): boolean {
	if (leaf.view instanceof MarkdownView) return true;
	// Background tabs may be deferred and expose their file through state.
	try {
		return leaf.getViewState().type === 'markdown';
	} catch {
		return false;
	}
}

/**
 * One note group beside one chat leaf. It is created on first use, appended to
 * afterwards, and forgotten with the chat tab; nothing is persisted.
 */
export class LinkStack {
	private leaf?: WorkspaceLeaf;

	constructor(private readonly app: App, readonly chatLeaf: WorkspaceLeaf) {}

	/** Open a link in the group, creating the group to the right of the chat first. */
	open(href: string, sourcePath: string): void {
		const file = this.resolve(href, sourcePath);
		if (!file) return;
		const { subpath } = splitInternalLink(href);
		const group = this.group();
		if (group) {
			const existing = this.find(group, file);
			if (existing) {
				void existing.openFile(file, { active: true, eState: { subpath } });
				return;
			}
			this.openIn(appendTab(this.app.workspace, group) ?? this.create(), file, subpath);
			return;
		}
		this.openIn(this.create(), file, subpath);
	}

	/** The remembered group while it is still part of the workspace. */
	private group(): WorkspaceLeaf | undefined {
		const leaf = this.leaf;
		if (!leaf) return undefined;
		if (!this.attached(leaf)) {
			this.leaf = undefined;
			return undefined;
		}
		return leaf;
	}

	private create(): WorkspaceLeaf {
		const leaf = this.app.workspace.createLeafBySplit(this.chatLeaf, 'vertical');
		this.leaf = leaf;
		return leaf;
	}

	private openIn(leaf: WorkspaceLeaf | undefined, file: TFile, subpath: string): void {
		if (!leaf) return;
		const active = this.focusNewTabs();
		void leaf.openFile(file, subpath ? { active, eState: { subpath } } : { active });
	}

	/** Find a note already open in the group so it is focused instead of duplicated. */
	private find(group: WorkspaceLeaf, file: TFile): WorkspaceLeaf | undefined {
		const leaves = (group.parent as unknown as ContainerWithChildren).children;
		if (!Array.isArray(leaves)) return undefined;
		return (leaves as WorkspaceLeaf[]).find((leaf) => this.fileOf(leaf) === file.path);
	}

	private fileOf(leaf: WorkspaceLeaf): string | undefined {
		const view = leaf.view as { file?: TFile } | undefined;
		if (view?.file) return view.file.path;
		try {
			const state = leaf.getViewState();
			return state.type === 'markdown' ? state.state?.file as string | undefined : undefined;
		} catch {
			return undefined;
		}
	}

	private attached(leaf: WorkspaceLeaf): boolean {
		const root: unknown = leaf.getRoot();
		if (root === leaf) return false;
		return this.contains(root, leaf);
	}

	private contains(node: unknown, leaf: WorkspaceLeaf): boolean {
		if (node === leaf) return true;
		const children = (node as ContainerWithChildren | null)?.children;
		return Array.isArray(children) && children.some((child) => this.contains(child, leaf));
	}

	private resolve(href: string, sourcePath: string): TFile | null {
		const { linkpath } = splitInternalLink(href);
		if (!linkpath) return null;
		try {
			return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		} catch {
			return null;
		}
	}

	/** "Always focus new tabs", with a focus fallback for a missing or throwing read. */
	private focusNewTabs(): boolean {
		const vault = this.app.vault as typeof this.app.vault & ConfigurableVault;
		if (typeof vault.getConfig !== 'function') return true;
		try {
			return vault.getConfig('focusNewTab') !== false;
		} catch {
			return true;
		}
	}
}
