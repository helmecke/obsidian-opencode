import type { FormField, FormWhen } from '@opencode/client';

export type FormValue = string | number | boolean | string[];
export type FormValues = Record<string, FormValue | undefined>;

const fieldTypes = new Set(['string', 'number', 'integer', 'boolean', 'multiselect', 'external']);

export function fieldType(field: FormField): string {
	return (field as { readonly type?: unknown }).type as string;
}

export function unsupportedFields(fields: readonly FormField[]): string[] {
	return fields.filter((field) => !fieldTypes.has(fieldType(field))).map((field) => field.key);
}

export function conditionMatches(condition: FormWhen, values: FormValues): boolean {
	const actual = values[condition.key];
	if (condition.op === 'eq') return actual === condition.value;
	return actual !== condition.value;
}

export function isFieldVisible(field: FormField, values: FormValues): boolean {
	const meta = field as FormField & { readonly hidden?: boolean; readonly when?: readonly FormWhen[] };
	if (meta.hidden) return false;
	return (meta.when ?? []).every((condition) => conditionMatches(condition, values));
}

export function defaultValues(fields: readonly FormField[]): FormValues {
	const values: FormValues = {};
	for (const field of fields) {
		const type = fieldType(field);
		const defaultValue = (field as { readonly default?: unknown }).default;
		if (defaultValue === undefined) continue;
		if (type === 'number' || type === 'integer') {
			if (typeof defaultValue === 'number' && Number.isFinite(defaultValue)) values[field.key] = defaultValue;
		} else if (type === 'boolean') {
			if (typeof defaultValue === 'boolean') values[field.key] = defaultValue;
		} else if (type === 'multiselect') {
			if (Array.isArray(defaultValue) && defaultValue.every((value) => typeof value === 'string')) {
				values[field.key] = [...defaultValue] as string[];
			}
		} else if (typeof defaultValue === 'string') {
			values[field.key] = defaultValue;
		}
	}
	return values;
}

function nonEmpty(value: FormValue | undefined): boolean {
	if (value === undefined) return false;
	if (typeof value === 'string') return value.trim().length > 0;
	if (typeof value === 'boolean') return value;
	if (Array.isArray(value)) return value.length > 0;
	return Number.isFinite(value);
}

function optionValues(field: FormField): Set<string> | undefined {
	const options = (field as { readonly options?: readonly { readonly value: string }[] }).options;
	return options ? new Set(options.map((option) => option.value)) : undefined;
}

function validateString(field: FormField, value: string): string | undefined {
	const string = field as FormField & {
		readonly minLength?: number; readonly maxLength?: number; readonly pattern?: string;
		readonly format?: string; readonly options?: readonly { readonly value: string }[];
		readonly custom?: boolean;
	};
	if (string.minLength !== undefined && value.length < string.minLength) return `Enter at least ${string.minLength} characters.`;
	if (string.maxLength !== undefined && value.length > string.maxLength) return `Enter at most ${string.maxLength} characters.`;
	if (string.pattern !== undefined) {
		try { if (!new RegExp(string.pattern).test(value)) return 'The value does not match the required format.'; }
		catch { return 'This field uses an unsupported validation pattern.'; }
	}
	const allowed = optionValues(field);
	if (allowed && !string.custom && !allowed.has(value)) return 'Choose one of the listed options.';
	switch (string.format) {
		case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : 'Enter a valid email address.';
		case 'uri': try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' ? undefined : 'Enter an http or https URL.'; }
			catch { return 'Enter a valid URL.'; }
		case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? undefined : 'Enter a date as YYYY-MM-DD.';
		case 'date-time': return Number.isNaN(Date.parse(value)) ? 'Enter a valid date and time.' : undefined;
		default: return undefined;
	}
}

export interface FormValidation {
	readonly answer: Record<string, FormValue>;
	readonly errors: Record<string, string>;
	readonly unsupported: readonly string[];
}

/** Validate only visible fields; hidden required fields do not block submission. */
export function validateForm(fields: readonly FormField[], values: FormValues): FormValidation {
	const errors: Record<string, string> = {};
	const answer: Record<string, FormValue> = {};
	const unsupported = unsupportedFields(fields);
	if (unsupported.length) return { answer, errors, unsupported };
	for (const field of fields) {
		const type = fieldType(field);
		if (type === 'external' || !isFieldVisible(field, values)) continue;
		const value = values[field.key];
		if (!nonEmpty(value)) {
			const fieldOptions = field as FormField & { readonly minItems?: number };
			if (type === 'multiselect' && fieldOptions.minItems) {
				errors[field.key] = `Choose at least ${fieldOptions.minItems} options.`;
			} else if ((field as { readonly required?: boolean }).required) errors[field.key] = 'This field is required.';
			continue;
		}
		if (type === 'string') {
			const error = validateString(field, String(value));
			if (error) errors[field.key] = error; else answer[field.key] = String(value);
		} else if (type === 'number' || type === 'integer') {
			const number = typeof value === 'number' ? value : Number.NaN;
			if (!Number.isFinite(number)) errors[field.key] = 'Enter a number.';
			else if (type === 'integer' && !Number.isInteger(number)) errors[field.key] = 'Enter a whole number.';
			else {
				const limits = field as FormField & { readonly minimum?: number; readonly maximum?: number };
				if (typeof limits.minimum === 'number' && number < limits.minimum) errors[field.key] = `Enter a value of at least ${limits.minimum}.`;
				else if (typeof limits.maximum === 'number' && number > limits.maximum) errors[field.key] = `Enter a value of at most ${limits.maximum}.`;
				else answer[field.key] = number;
			}
		} else if (type === 'boolean') {
			if (typeof value !== 'boolean') errors[field.key] = 'Choose yes or no.';
			else answer[field.key] = value;
		} else if (type === 'multiselect') {
			const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
			const fieldOptions = field as FormField & {
				readonly minItems?: number; readonly maxItems?: number; readonly custom?: boolean;
			};
			const allowed = optionValues(field);
			if (allowed && !fieldOptions.custom && selected.some((item) => !allowed.has(item))) {
				errors[field.key] = 'Choose only the listed options.';
			} else if (fieldOptions.minItems !== undefined && selected.length < fieldOptions.minItems) {
				errors[field.key] = `Choose at least ${fieldOptions.minItems} options.`;
			} else if (fieldOptions.maxItems !== undefined && selected.length > fieldOptions.maxItems) {
				errors[field.key] = `Choose at most ${fieldOptions.maxItems} options.`;
			} else answer[field.key] = selected;
		}
	}
	return { answer, errors, unsupported };
}

export function safeExternalUrl(value: string): string | undefined {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
	} catch { return undefined; }
}
