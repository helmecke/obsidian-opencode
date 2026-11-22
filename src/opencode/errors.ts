export type ConnectionErrorCode = 'absent' | 'registration' | 'transport' | 'authentication' | 'identity';

const messages: Record<ConnectionErrorCode, string> = {
	absent: 'No registered OpenCode service is available. Start a compatible OpenCode installation outside Obsidian, then retry discovery. Automatic startup is unavailable. No process was launched.',
	registration: 'Unable to read a valid authenticated local OpenCode registration. Check OpenCode service status, then retry discovery. No service was changed.',
	transport: 'Unable to reach the registered OpenCode service safely. Check OpenCode service status, then retry discovery. No service was changed.',
	authentication: 'OpenCode rejected local authentication. Check OpenCode service status, then retry discovery.',
	identity: 'OpenCode service identity or credentials changed during discovery. Retry discovery. No service was changed.',
};

/** Fixed messages only: never retain upstream errors, response bodies, or credentials. */
export class ConnectionError extends Error {
	constructor(readonly code: ConnectionErrorCode) {
		super(messages[code]);
		this.name = 'ConnectionError';
	}
}
