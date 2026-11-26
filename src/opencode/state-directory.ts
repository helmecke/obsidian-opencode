import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Per-vault service state kept outside the vault, so vault sync, backup, and
 * shared folders never carry OpenCode's private state. The hash keeps two
 * vaults that share a user account from sharing one state directory.
 */
export function managedStateDirectory(vaultRoot: string): string {
	const key = createHash('sha256').update(vaultRoot).digest('hex').slice(0, 16);
	return join(userStateRoot(), 'opencode-obsidian', key);
}

function userStateRoot(): string {
	if (process.platform === 'win32') {
		return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
	}
	if (process.platform === 'darwin') {
		return join(homedir(), 'Library', 'Application Support');
	}
	return process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
}
