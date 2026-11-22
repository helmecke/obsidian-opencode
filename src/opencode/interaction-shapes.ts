import type { FormField, FormInfo, PermissionRequest } from '@opencode/client';
import {
	asArray, asNonEmptyString, asRecord, asSafeCount, asString, invalid, oneOf, optionalBoolean,
	optionalRecord, optionalString,
} from './api-primitives';

/** Pending permission and form shapes, including session scoping and safe answers. */

export function validatePermissionRequest(value: unknown): PermissionRequest {
	const request = asRecord(value);
	asNonEmptyString(request.id);
	asNonEmptyString(request.sessionID);
	asString(request.action);
	for (const resource of asArray(request.resources)) asString(resource);
	if (request.save !== undefined) for (const entry of asArray(request.save)) asString(entry);
	if (request.message !== undefined) asString(request.message);
	if (request.metadata !== undefined) asRecord(request.metadata);
	if (request.source !== undefined) {
		const source = asRecord(request.source);
		asString(source.type);
		asString(source.messageID);
		asString(source.id);
	}
	return value as PermissionRequest;
}

export function validatePermissionList(value: unknown, sessionID: string): PermissionRequest[] {
	const requests = asArray(value).map(validatePermissionRequest);
	if (requests.some((request) => request.sessionID !== sessionID)) return invalid();
	return requests;
}

const supportedFieldTypes = new Set(['string', 'number', 'integer', 'boolean', 'multiselect', 'external']);
const supportedStringFormats = ['email', 'uri', 'date', 'date-time'] as const;

function validateOptions(value: unknown): void {
	for (const entry of asArray(value)) {
		const option = asRecord(entry);
		asString(option.value);
		asString(option.label);
		optionalString(option.description);
	}
}

function validateWhen(value: unknown): void {
	for (const entry of asArray(value)) {
		const condition = asRecord(entry);
		asNonEmptyString(condition.key);
		oneOf(condition.op, ['eq', 'neq'] as const);
		const expected = condition.value;
		if (!(typeof expected === 'string' || typeof expected === 'boolean'
			|| (typeof expected === 'number' && Number.isFinite(expected)))) return invalid();
	}
}

function optionalBound(value: unknown): void {
	if (value === undefined) return;
	if (typeof value === 'number' && Number.isFinite(value)) return;
	if (value === 'Infinity' || value === '-Infinity' || value === 'NaN') return;
	return invalid();
}

function validateFormField(value: unknown): FormField {
	const field = asRecord(value);
	asNonEmptyString(field.key);
	optionalString(field.title);
	optionalString(field.description);
	optionalBoolean(field.required);
	optionalBoolean(field.hidden);
	optionalBoolean(field.custom);
	if (field.when !== undefined) validateWhen(field.when);
	const type = asString(field.type);
	// Unknown field types are preserved so the form card can name the
	// incompatibility and block submission; they must not become partial answers.
	if (!supportedFieldTypes.has(type)) return value as FormField;
	switch (type) {
		case 'string':
			// Unknown formats would bypass the UI's format checks, so fail closed.
			if (field.format !== undefined) oneOf(field.format, supportedStringFormats);
			optionalString(field.placeholder);
			optionalString(field.pattern);
			optionalString(field.default);
			if (field.minLength !== undefined) asSafeCount(field.minLength);
			if (field.maxLength !== undefined) asSafeCount(field.maxLength);
			if (field.options !== undefined) validateOptions(field.options);
			break;
		case 'number':
		case 'integer':
			optionalBound(field.minimum);
			optionalBound(field.maximum);
			optionalBound(field.default);
			break;
		case 'boolean':
			if (field.default !== undefined && typeof field.default !== 'boolean') return invalid();
			break;
		case 'multiselect':
			validateOptions(field.options);
			if (field.minItems !== undefined) asSafeCount(field.minItems);
			if (field.maxItems !== undefined) asSafeCount(field.maxItems);
			if (field.default !== undefined) for (const item of asArray(field.default)) asString(item);
			break;
		case 'external': asNonEmptyString(field.url); break;
	}
	return value as FormField;
}

export function validateFormInfo(value: unknown): FormInfo {
	const form = asRecord(value);
	asNonEmptyString(form.id);
	asNonEmptyString(form.sessionID);
	asString(form.title);
	optionalRecord(form.metadata);
	const keys = new Set<string>();
	for (const entry of asArray(form.fields)) {
		const field = validateFormField(entry);
		if (keys.has(field.key)) return invalid();
		keys.add(field.key);
	}
	return value as FormInfo;
}

export function validateFormList(value: unknown, sessionID: string): FormInfo[] {
	const forms = asArray(value).map(validateFormInfo);
	if (forms.some((form) => form.sessionID !== sessionID)) return invalid();
	return forms;
}
