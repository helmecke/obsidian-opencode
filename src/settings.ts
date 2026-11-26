import { PluginSettingTab } from 'obsidian';
import type { App, Plugin, SettingDefinitionItem } from 'obsidian';
import type { ModelRef } from '@opencode/client';

export interface ManagedOrphan { pid: number; startedAt: number }
export interface OpenCodeSettings {
	executablePath: string;
	autoStart: boolean;
	showReasoning: boolean;
	attachActiveNote: boolean;
	lastModel?: ModelRef;
	managedOrphan?: ManagedOrphan;
}

const unsafeText = /[\0\r\n]/;

export function loadSettings(value: unknown): OpenCodeSettings {
	const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	const path = record.executablePath;
	const settings: OpenCodeSettings = {
		executablePath: typeof path === 'string' && !unsafeText.test(path) ? path : '',
		autoStart: record.autoStart !== false,
		showReasoning: record.showReasoning === true,
		attachActiveNote: record.attachActiveNote === true,
	};
	const orphan = record.managedOrphan;
	const lastModel = record.lastModel;
	if (lastModel && typeof lastModel === 'object' && 'providerID' in lastModel && 'id' in lastModel
		&& typeof lastModel.providerID === 'string' && lastModel.providerID.length > 0 && !unsafeText.test(lastModel.providerID)
		&& typeof lastModel.id === 'string' && lastModel.id.length > 0 && !unsafeText.test(lastModel.id)
		&& (!('variant' in lastModel) || lastModel.variant === undefined
			|| (typeof lastModel.variant === 'string' && !unsafeText.test(lastModel.variant)))) {
		const variant = 'variant' in lastModel && typeof lastModel.variant === 'string' ? lastModel.variant : undefined;
		settings.lastModel = { providerID: lastModel.providerID, id: lastModel.id,
			...(variant ? { variant } : {}) };
	}
	if (orphan && typeof orphan === 'object' && 'pid' in orphan && 'startedAt' in orphan
		&& typeof orphan.pid === 'number' && Number.isSafeInteger(orphan.pid) && orphan.pid > 0
		&& typeof orphan.startedAt === 'number' && Number.isSafeInteger(orphan.startedAt) && orphan.startedAt > 0) {
		settings.managedOrphan = { pid: orphan.pid, startedAt: orphan.startedAt };
	}
	return settings;
}

export class OpenCodeSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly settings: OpenCodeSettings,
		private readonly save: () => Promise<void>, private readonly onChange?: () => void) { super(app, plugin); }

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'OpenCode 2 executable path',
				desc: 'Full path to the OpenCode 2 executable, without surrounding quotes or arguments. Leave empty to use `opencode` from PATH or a common install location. Spaces are preserved as path data; the value is never run through a shell.',
				control: {
					type: 'text', key: 'executablePath', placeholder: 'opencode',
					validate: (value) => unsafeText.test(value)
						? 'The path cannot contain line breaks or null characters.' : undefined,
				},
			},
			{
				name: 'Start OpenCode automatically',
				desc: 'When no healthy OpenCode service is already running, start a plugin-owned OpenCode 2 process and stop it when the plugin is disabled. A healthy shared service is always reused instead.',
				control: { type: 'toggle', key: 'autoStart' },
			},
			{
				name: 'Show reasoning',
				desc: 'Show model reasoning in the transcript as a collapsed row with a one-line preview. Hidden by default, and changes apply to open chats immediately.',
				control: { type: 'toggle', key: 'showReasoning' },
			},
			{
				name: 'Attach active note automatically',
				desc: 'Send the note open in the editor as a file reference with every message sent from a draft, without an explicit attach action. Off by default; the note is never attached while this is off.',
				control: { type: 'toggle', key: 'attachActiveNote' },
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.settings[key as keyof OpenCodeSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'executablePath') {
			if (typeof value !== 'string' || unsafeText.test(value)) return;
			this.settings.executablePath = value;
		} else if (key === 'autoStart' || key === 'showReasoning' || key === 'attachActiveNote') {
			if (typeof value !== 'boolean') return;
			this.settings[key] = value;
		} else return;
		await this.save();
		if (key === 'showReasoning' || key === 'attachActiveNote') this.onChange?.();
	}
}
