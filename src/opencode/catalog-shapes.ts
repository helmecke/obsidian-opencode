import type {
	AgentInfo, AgentListOutput, CommandInfo, CommandListOutput, ModelInfo, ModelListOutput,
	SkillInfo, SkillListOutput,
} from '@opencode/client';
import {
	asArray, asNonEmptyString, asRecord, asString, invalid, optionalBoolean, optionalString,
	validateLocation, validateModelRef,
} from './api-primitives';

/** Location-scoped agent, model, skill, and command catalog lists used by the chat view. */

export function validateAgentList(value: unknown): AgentListOutput {
	const output = asRecord(value);
	validateLocation(output.location);
	const data = asArray(output.data).map((entry) => {
		const agent = asRecord(entry);
		asNonEmptyString(agent.id);
		asString(agent.name);
		if (typeof agent.hidden !== 'boolean') return invalid();
		asString(agent.mode);
		if (agent.model !== undefined) validateModelRef(agent.model);
		return entry as AgentInfo;
	});
	return { location: output.location as AgentListOutput['location'], data };
}

export function validateModelList(value: unknown): ModelListOutput {
	const output = asRecord(value);
	validateLocation(output.location);
	const data = asArray(output.data).map((entry) => {
		const model = asRecord(entry);
		asNonEmptyString(model.id);
		asNonEmptyString(model.modelID);
		asNonEmptyString(model.providerID);
		asString(model.name);
		if (typeof model.enabled !== 'boolean') return invalid();
		optionalString(model.variant);
		return entry as ModelInfo;
	});
	return { location: output.location as ModelListOutput['location'], data };
}

export function validateCommandList(value: unknown): CommandListOutput {
	const output = asRecord(value);
	validateLocation(output.location);
	const data = asArray(output.data).map((entry) => {
		const command = asRecord(entry);
		asNonEmptyString(command.name);
		optionalString(command.description);
		return entry as CommandInfo;
	});
	return { location: output.location as CommandListOutput['location'], data };
}

export function validateSkillList(value: unknown): SkillListOutput {
	const output = asRecord(value);
	validateLocation(output.location);
	const data = asArray(output.data).map((entry) => {
		const skill = asRecord(entry);
		asNonEmptyString(skill.id);
		asNonEmptyString(skill.name);
		asNonEmptyString(skill.path);
		asString(skill.content);
		optionalString(skill.description);
		optionalBoolean(skill.autoinvoke);
		return entry as SkillInfo;
	});
	return { location: output.location as SkillListOutput['location'], data };
}
