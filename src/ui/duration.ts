/** Compact elapsed time: `0.4s`, `13.4s`, or `1m 12s`. */
export function formatDuration(milliseconds: number): string {
	const seconds = milliseconds / 1000;
	if (!Number.isFinite(seconds) || seconds < 0) return '';
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const total = Math.round(seconds);
	const minutes = Math.floor(total / 60);
	return `${minutes}m ${total % 60}s`;
}

/** Elapsed time between two recorded timestamps, or an empty string when unavailable. */
export function durationBetween(start: number | undefined, end: number | undefined): string {
	if (start === undefined || end === undefined) return '';
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '';
	return formatDuration(end - start);
}
