import { setIcon } from 'obsidian';

/**
 * Leading icon for a fold summary. Hovering or focusing the summary swaps it
 * for a chevron, and an open fold keeps the chevron turned downward.
 */
export function createDisclosureIcon(summary: HTMLElement, icon: string, className = 'opencode-disclosure-icon'): HTMLElement {
	const root = summary.createSpan({ cls: className, attr: { 'aria-hidden': 'true' } });
	const glyph = root.createSpan({ cls: 'opencode-disclosure-glyph' });
	setIcon(glyph, icon);
	const chevron = root.createSpan({ cls: 'opencode-disclosure-chevron' });
	setIcon(chevron, 'chevron-right');
	return root;
}
