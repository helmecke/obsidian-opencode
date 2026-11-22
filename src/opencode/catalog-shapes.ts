import type { AgentInfo, AgentListOutput, ModelInfo, ModelListOutput } from '@opencode/client';
import {
	asArray, asNonEmptyString, asRecord, asString, invalid, optionalString, validateLocation,
	validateModelRef,
} from './api-primitives';

/** Location-scoped agent and model selector lists used by the chat view. */

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
