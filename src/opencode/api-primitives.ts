import type { ModelRef } from '@opencode/client';
import { OpenCodeApiCompatibilityError } from './compatibility';

/** Shared primitive checks for the generated client's required payloads. */

export type RecordValue = Record<string, unknown>;

export function invalid(): never { throw new OpenCodeApiCompatibilityError(); }

export function asRecord(value: unknown): RecordValue {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
	return value as RecordValue;
}

export function asArray(value: unknown): unknown[] {
	if (!Array.isArray(value)) return invalid();
	return value;
}

export function asString(value: unknown): string {
	if (typeof value !== 'string') return invalid();
	return value;
}

export function asNonEmptyString(value: unknown): string {
	const text = asString(value);
	if (!text) return invalid();
	return text;
}

export function asFiniteNumber(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return invalid();
	return value;
}

export function asSafeCount(value: unknown): number {
	const count = asFiniteNumber(value);
	if (!Number.isSafeInteger(count) || count < 0) return invalid();
	return count;
}

export function optionalString(value: unknown): void {
	if (value !== undefined) asString(value);
}

export function optionalNullableString(value: unknown): void {
	if (value !== undefined && value !== null) asString(value);
}

export function optionalNumber(value: unknown): void {
	if (value !== undefined) asFiniteNumber(value);
}

export function optionalBoolean(value: unknown): void {
	if (value !== undefined && typeof value !== 'boolean') invalid();
}

export function optionalRecord(value: unknown): void {
	if (value !== undefined) asRecord(value);
}

export function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
	if (typeof value !== 'string' || !choices.includes(value as T)) return invalid();
	return value as T;
}

export function validateLocation(value: unknown): void {
	const location = asRecord(value);
	asNonEmptyString(location.directory);
}

export function validateModelRef(value: unknown): ModelRef {
	const model = asRecord(value);
	asNonEmptyString(model.id);
	asNonEmptyString(model.providerID);
	optionalString(model.variant);
	return value as ModelRef;
}

export function validateStructuredError(value: unknown): void {
	const error = asRecord(value);
	asString(error.type);
	asString(error.message);
	optionalNumber(error.status);
	optionalNumber(error.retryAfterMs);
	if (error.response !== undefined) {
		const response = asRecord(error.response);
		asString(response.body);
	}
}
