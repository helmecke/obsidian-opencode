import { PluginSettingTab, Setting } from 'obsidian';
import type { App, Plugin } from 'obsidian';

export interface SessionSelection { id: string; directory: string }
export interface OpenCodeSettings { executablePath: string; selectedSession?: SessionSelection }

export function loadSettings(value: unknown): OpenCodeSettings {
	const path = value && typeof value === 'object' && 'executablePath' in value ? value.executablePath : '';
	const settings: OpenCodeSettings = { executablePath: typeof path === 'string' && !/[\0\r\n]/.test(path) ? path : '' };
	const selected = value && typeof value === 'object' && 'selectedSession' in value ? value.selectedSession : undefined;
	if (selected && typeof selected === 'object' && 'id' in selected && 'directory' in selected
		&& typeof selected.id === 'string' && selected.id.length > 0 && !/[\0\r\n]/.test(selected.id)
		&& typeof selected.directory === 'string' && selected.directory.length > 0 && !/[\0\r\n]/.test(selected.directory)) {
		settings.selectedSession = { id: selected.id, directory: selected.directory };
	}
	return settings;
}

export class OpenCodeSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly settings: OpenCodeSettings,
		private readonly save: () => Promise<void>) { super(app, plugin); }

	display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName('OpenCode executable path')
			.setDesc('Saved for future use only; no executable lookup, validation, or launch is performed. Enter a path without surrounding quotes. Start OpenCode externally, then retry discovery in chat.')
			.addText((text) => text.setPlaceholder('OpenCode executable').setValue(this.settings.executablePath)
				.onChange(async (value) => {
					if (/[\0\r\n]/.test(value)) return;
					this.settings.executablePath = value;
					await this.save();
				}));
	}
}
