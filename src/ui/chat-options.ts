import type { AgentInfo, ModelInfo, ModelRef } from '@opencode/client';

export function modelKey(model: { readonly providerID: string; readonly id: string; readonly modelID?: string; readonly variant?: string }): string {
	return JSON.stringify([model.providerID, model.modelID ?? model.id, model.variant ?? '']);
}

export function modelValue(value: string): ModelRef | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed) || parsed.length !== 3) return undefined;
		const parts: unknown[] = parsed;
		const providerID = parts[0];
		const id = parts[1];
		const variant = parts[2];
		if (typeof providerID !== 'string' || typeof id !== 'string' || typeof variant !== 'string') return undefined;
		return { providerID, id, ...(variant ? { variant } : {}) };
	} catch { return undefined; }
}

export function fillAgentOptions(select: HTMLSelectElement, agents: readonly AgentInfo[], selected: string): void {
	select.empty();
	if (!agents.length) {
		select.createEl('option', { text: 'No agents', value: '' });
		select.disabled = true;
		return;
	}
	for (const agent of agents) select.createEl('option', { text: agent.name || agent.id, value: agent.id });
	if (selected && !agents.some((agent) => agent.id === selected)) {
		select.createEl('option', { text: selected, value: selected });
	}
	select.value = selected;
}

export function fillModelOptions(select: HTMLSelectElement, models: readonly ModelInfo[], selected?: ModelRef): void {
	select.empty();
	if (!models.length) {
		select.createEl('option', { text: 'No models', value: '' });
		select.disabled = true;
		return;
	}
	if (!selected) select.createEl('option', { text: 'Session default', value: '' });
	for (const model of models) {
		select.createEl('option', {
			text: `${model.providerID} · ${model.name}`, value: modelKey(model),
		});
	}
	const value = selected ? modelKey(selected) : '';
	if (selected && !models.some((model) => modelKey(model) === value)) {
		select.createEl('option', {
			text: `${selected.providerID} · ${selected.id}`, value,
		});
	}
	select.value = value;
}
