import { PluginSettingTab, Setting } from 'obsidian';
import type { App, Plugin } from 'obsidian';

export interface SessionSelection { id: string; directory: string }
export interface ManagedOrphan { pid: number; token: string }
export interface OpenCodeSettings {
	executablePath: string;
	autoStart: boolean;
	selectedSession?: SessionSelection;
	managedOrphan?: ManagedOrphan;
}

const unsafeText = /[\0\r\n]/;

export function loadSettings(value: unknown): OpenCodeSettings {
	const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	const path = record.executablePath;
	const settings: OpenCodeSettings = {
		executablePath: typeof path === 'string' && !unsafeText.test(path) ? path : '',
		autoStart: record.autoStart !== false,
	};
	const selected = record.selectedSession;
	if (selected && typeof selected === 'object' && 'id' in selected && 'directory' in selected
		&& typeof selected.id === 'string' && selected.id.length > 0 && !unsafeText.test(selected.id)
		&& typeof selected.directory === 'string' && selected.directory.length > 0 && !unsafeText.test(selected.directory)) {
		settings.selectedSession = { id: selected.id, directory: selected.directory };
	}
	const orphan = record.managedOrphan;
	if (orphan && typeof orphan === 'object' && 'pid' in orphan && 'token' in orphan
		&& typeof orphan.pid === 'number' && Number.isSafeInteger(orphan.pid) && orphan.pid > 0
		&& typeof orphan.token === 'string' && orphan.token.length > 0 && orphan.token.length <= 256
		&& !unsafeText.test(orphan.token)) {
		settings.managedOrphan = { pid: orphan.pid, token: orphan.token };
	}
	return settings;
}

export class OpenCodeSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly settings: OpenCodeSettings,
		private readonly save: () => Promise<void>) { super(app, plugin); }

	display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName('OpenCode 2 executable path')
			.setDesc('Full path to the OpenCode 2 executable, without surrounding quotes or arguments. Leave empty to use `opencode` from PATH or a common install location. Spaces are preserved as path data; the value is never run through a shell.')
			.addText((text) => text.setPlaceholder('opencode').setValue(this.settings.executablePath)
				.onChange(async (value) => {
					if (unsafeText.test(value)) return;
					this.settings.executablePath = value;
					await this.save();
				}));
		new Setting(this.containerEl)
			.setName('Start OpenCode automatically')
			.setDesc('When no healthy OpenCode service is already running, start a plugin-owned OpenCode 2 process and stop it when the plugin is disabled. A healthy shared service is always reused instead.')
			.addToggle((toggle) => toggle.setValue(this.settings.autoStart)
				.onChange(async (value) => {
					this.settings.autoStart = value;
					await this.save();
				}));
	}
}
