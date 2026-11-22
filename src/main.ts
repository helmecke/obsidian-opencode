import { FileSystemAdapter, Plugin } from 'obsidian';
import { ChatView, CHAT_VIEW_TYPE } from './ui/chat-view';
import { openChat } from './ui/open-chat';
import { ConnectionCoordinator } from './opencode/connection';
import { loadSettings, OpenCodeSettingTab } from './settings';
import { SessionCoordinator } from './opencode/sessions';
import { SynchronizationCoordinator } from './state/synchronization';

export default class OpenCodePlugin extends Plugin {
	async onload(): Promise<void> {
		const settings = loadSettings(await this.loadData());
		const connection = new ConnectionCoordinator();
		let saving = Promise.resolve();
		const save = () => {
			const data = loadSettings(settings);
			saving = saving.catch(() => undefined).then(() => this.saveData(data));
			return saving;
		};
		const sessions = new SessionCoordinator(connection, () => {
			const adapter = this.app.vault.adapter;
			if (!(adapter instanceof FileSystemAdapter)) throw new Error('Desktop vault required');
			return adapter.getBasePath();
		}, settings, save);
		const synchronization = new SynchronizationCoordinator(connection, sessions);
		this.register(() => connection.dispose());
		this.addSettingTab(new OpenCodeSettingTab(this.app, this, settings, save));
		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, connection, sessions, synchronization));
		this.addRibbonIcon('message-square', 'Open chat', () => openChat(this.app));
		this.addCommand({
			id: 'open-chat',
			name: 'Open chat',
			callback: () => openChat(this.app),
		});
	}
}
