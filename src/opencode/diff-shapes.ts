import type { FileDiffInfo } from '@opencode/client';
import {
	asArray, asNonEmptyString, asRecord, asSafeCount, asString, invalid, oneOf,
} from './api-primitives';

/** Per-file diff payloads read by the read-only change review. */
export function validateFileDiffs(value: unknown): FileDiffInfo[] {
	return asArray(value).map((entry) => {
		const diff = asRecord(entry);
		asNonEmptyString(diff.file);
		asString(diff.patch);
		asSafeCount(diff.additions);
		asSafeCount(diff.deletions);
		oneOf(diff.status, ['added', 'deleted', 'modified'] as const);
		if (diff.more !== undefined && diff.more !== true) return invalid();
		return entry as FileDiffInfo;
	});
}
