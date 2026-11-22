import { execFile } from 'node:child_process';
import { isSupportedOpenCodeVersion } from './compatibility';
import { ConnectionError } from './errors';

export type VersionQuery = (executable: string) => Promise<string>;

function queryVersion(executable: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(executable, ['--version'], {
			shell: false, windowsHide: true, timeout: 10_000, maxBuffer: 4_096, encoding: 'utf8',
		}, (error, stdout) => {
			if (error) reject(error instanceof Error ? error : new Error('Version query failed'));
			else resolve(String(stdout));
		});
	});
}

/** Accept only the documented `opencode vX.Y.Z` line; never interpolate the raw output. */
export function parseOpenCodeVersion(output: string): string | undefined {
	const line = output.trim();
	const match = /^opencode v([0-9]+\.[0-9]+\.[0-9]+(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/.exec(line);
	return match?.[1];
}

/** Query and validate before launch; 1.x and malformed output are rejected identically. */
export async function validateExecutableVersion(executable: string, query: VersionQuery = queryVersion): Promise<string> {
	let output: string;
	try {
		output = await query(executable);
	} catch {
		throw new ConnectionError('version');
	}
	const version = parseOpenCodeVersion(output);
	if (!version || !isSupportedOpenCodeVersion(version)) throw new ConnectionError('version');
	return version;
}
