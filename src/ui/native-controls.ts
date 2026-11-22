import { setIcon, setTooltip } from 'obsidian';
import type { TooltipPlacement } from 'obsidian';

export interface IconButtonOptions {
	readonly icon: string;
	readonly label: string;
	readonly className?: string;
	readonly placement?: TooltipPlacement;
}

const ICON_BUTTON_CLASS = 'clickable-icon opencode-composer-icon';

/**
 * Native Obsidian icon button: a real `<button>` with the host's
 * `clickable-icon` states, an icon, and a host tooltip that also supplies the
 * accessible name.
 */
export function createIconButton(container: HTMLElement, options: IconButtonOptions): HTMLButtonElement {
	const cls = options.className ? `${ICON_BUTTON_CLASS} ${options.className}` : ICON_BUTTON_CLASS;
	const button = container.createEl('button', { cls });
	setIcon(button, options.icon);
	setTooltip(button, options.label, options.placement ? { placement: options.placement } : undefined);
	setNativeDisabled(button, false);
	return button;
}

/**
 * `clickable-icon` reads its disabled appearance from `aria-disabled`, while a
 * real button prevents clicks through `disabled`; keep both in sync.
 */
export function setNativeDisabled(button: HTMLButtonElement, disabled: boolean): void {
	button.disabled = disabled;
	button.setAttribute('aria-disabled', String(disabled));
}
