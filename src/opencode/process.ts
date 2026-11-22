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
