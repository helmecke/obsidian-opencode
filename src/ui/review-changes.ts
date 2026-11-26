import type { App } from 'obsidian';
import { ChatView, CHAT_VIEW_TYPE } from './chat-view';
import { openChat } from './open-chat';

/** Open the review for the current conversation, opening chat first when it is closed. */
export async function reviewConversationChanges(app: App): Promise<void> {
	const existing = app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
	if (existing) {
		await existing.loadIfDeferred?.();
		if (existing.view instanceof ChatView) {
			existing.view.reviewChanges();
			return;
		}
	}
	await openChat(app);
	const opened = app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
	if (!opened) return;
	await opened.loadIfDeferred?.();
	if (opened.view instanceof ChatView) opened.view.reviewChanges();
}
