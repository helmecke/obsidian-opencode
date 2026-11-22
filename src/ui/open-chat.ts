import { App, Notice } from 'obsidian';
import { CHAT_VIEW_TYPE } from './chat-view';

export async function openChat(app: App): Promise<void> {
	try {
		const existing = app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
		const leaf = existing ?? app.workspace.getLeaf('tab');
		if (!existing) {
			await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		}
		await app.workspace.revealLeaf(leaf);
	} catch {
		new Notice('Unable to open chat. Try opening it again.');
	}
}
