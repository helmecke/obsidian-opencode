export type ConnectionErrorCode =
	| 'absent' | 'stale' | 'registration' | 'transport' | 'authentication' | 'identity'
	| 'executable' | 'version' | 'startup' | 'timeout';

const messages: Record<ConnectionErrorCode, string> = {
	absent: 'No registered OpenCode 2 service is available. Enable Start OpenCode automatically, or start a compatible OpenCode 2 installation outside Obsidian, then retry discovery.',
	stale: 'The registered OpenCode 2 service is no longer running. Enable Start OpenCode automatically, or start OpenCode outside Obsidian, then retry discovery. The stale registration was not modified.',
	registration: 'Unable to read a valid authenticated local OpenCode registration. Check OpenCode service status, then retry discovery. No service was changed.',
	transport: 'Unable to reach the registered OpenCode service safely. Check OpenCode service status, then retry discovery. No service was changed.',
	authentication: 'OpenCode rejected local authentication. Check OpenCode service status, then retry discovery.',
	identity: 'OpenCode service identity or credentials changed during discovery. Retry discovery. No service was changed.',
	executable: 'No OpenCode 2 executable was found. Set the OpenCode 2 executable path in settings, or install OpenCode 2 so opencode is on PATH, then retry. No process was launched.',
	version: 'The resolved executable is not a supported OpenCode 2 release. Select the OpenCode 2 executable in settings, then retry. No process was launched.',
	startup: 'OpenCode could not be started. Check the executable path and OpenCode diagnostics, then retry. No shared service was changed.',
	timeout: 'OpenCode did not become ready in time. Retry, or check the executable path and OpenCode diagnostics. No shared service was changed.',
};

/** Fixed messages only: never retain upstream errors, response bodies, or credentials. */
export class ConnectionError extends Error {
	constructor(readonly code: ConnectionErrorCode) {
		super(messages[code]);
		this.name = 'ConnectionError';
	}
}
