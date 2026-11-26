import { FileSystemAdapter, Plugin } from 'obsidian';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatView, CHAT_VIEW_TYPE } from './ui/chat-view';
import { openChat } from './ui/open-chat';
import { ConnectionCoordinator } from './opencode/connection';
import { ManagedRuntime } from './opencode/managed-runtime';
import { loadSettings, OpenCodeSettingTab } from './settings';
import { SessionCoordinator } from './opencode/sessions';
import { SynchronizationCoordinator } from './state/synchronization';

export default class OpenCodePlugin extends Plugin {
	async onload(): Promise<void> {
		const settings = loadSettings(await this.loadData());
		let saving = Promise.resolve();
		const save = () => {
			const data = loadSettings(settings);
			saving = saving.catch(() => undefined).then(() => this.saveData(data));
			return saving;
		};
		const adapter = this.app.vault.adapter;
		const vaultRoot = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
		const configDir = this.app.vault.configDir;
		const pluginID = this.manifest?.id ?? 'opencode-chat';
		const pluginDir = this.manifest?.dir ?? (configDir ? join(configDir, 'plugins', pluginID) : pluginID);
		const stateDir = vaultRoot
			? join(vaultRoot, pluginDir, '.state')
			: join(tmpdir(), 'opencode-obsidian', pluginID);
		const runtime = new ManagedRuntime({
			executablePath: () => settings.executablePath,
			enabled: () => settings.autoStart,
			stateDir: () => stateDir,
			readOrphan: () => settings.managedOrphan,
			writeOrphan: (record) => {
				if (record) settings.managedOrphan = record;
				else delete settings.managedOrphan;
				return save();
			},
		});
		const connection = new ConnectionCoordinator(undefined, runtime);
		const sessions = new SessionCoordinator(connection, () => {
			const current = this.app.vault.adapter;
			if (!(current instanceof FileSystemAdapter)) throw new Error('Desktop vault required');
			return current.getBasePath();
		});
		const synchronization = new SynchronizationCoordinator(connection, sessions);
		synchronization.useDraftPreferences({
			lastModel: () => settings.lastModel,
			rememberModel: (model) => {
				settings.lastModel = model;
				void save();
			},
		});
		this.register(() => connection.dispose());
		this.register(() => { void runtime.dispose(); });
		this.addSettingTab(new OpenCodeSettingTab(this.app, this, settings, save,
			() => this.refreshChatViews()));
		this.registerView(CHAT_VIEW_TYPE, (leaf) =>
			new ChatView(leaf, connection, sessions, synchronization, () => settings.showReasoning,
				() => settings.attachActiveNote));
		this.addRibbonIcon('message-square', 'Open chat', () => openChat(this.app));
		this.addCommand({
			id: 'open-chat',
			name: 'Open chat',
			callback: () => openChat(this.app),
		});
	}

	/** Settings changes apply to already open chats without network I/O. */
	private refreshChatViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
			if (leaf.view instanceof ChatView) leaf.view.refreshFromSettings();
		}
	}
}
