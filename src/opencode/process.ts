import { execFile } from 'node:child_process';

/** PID liveness without signalling: EPERM still means the process exists. */
export function isProcessAlive(pid: number): boolean {
	if (!Number.isSafeInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EPERM');
	}
}

/**
 * Wall-clock start time of a PID, used to prove a recorded orphan is still the
 * process this plugin spawned. Returns undefined when the platform cannot be
 * queried; callers must treat that as "not proven", never as a match.
 */
export function processStartedAt(pid: number): Promise<number | undefined> {
	return new Promise((resolve) => {
		if (!Number.isSafeInteger(pid) || pid <= 0) { resolve(undefined); return; }
		const options = { windowsHide: true, timeout: 5_000, encoding: 'utf8' as const };
		if (process.platform === 'win32') {
			execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
				"(Get-Process -Id ([int]$env:OPENCODE_PID) -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')"],
			{ ...options, env: { ...process.env, OPENCODE_PID: String(pid) } },
			(error, stdout) => { resolve(error ? undefined : parseStartTime(stdout)); });
			return;
		}
		execFile('ps', ['-o', 'lstart=', '-p', String(pid)],
			{ ...options, env: { ...process.env, LC_ALL: 'C' } },
			(error, stdout) => { resolve(error ? undefined : parseStartTime(stdout)); });
	});
}

function parseStartTime(value: string): number | undefined {
	const time = Date.parse(value.trim());
	return Number.isFinite(time) ? time : undefined;
}
