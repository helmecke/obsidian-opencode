import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ConnectionError } from './errors';

export interface ResolveExecutableOptions {
	configuredPath?: string;
	platform?: NodeJS.Platform;
	env?: NodeJS.ProcessEnv;
	isFile?: (path: string) => Promise<boolean>;
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch { return false; }
}

const windows = (platform: NodeJS.Platform) => platform === 'win32';
const pathSeparator = (platform: NodeJS.Platform) => windows(platform) ? ';' : ':';

function executableName(platform: NodeJS.Platform): string {
	return windows(platform) ? 'opencode.exe' : 'opencode';
}

/** PATH entries are data, never a command line; only a native executable is accepted. */
function pathCandidates(options: Required<Pick<ResolveExecutableOptions, 'platform' | 'env'>>): string[] {
	const env = options.env;
	const entries = (windows(options.platform) ? env.PATH ?? env.Path : env.PATH) ?? '';
	return entries.split(pathSeparator(options.platform))
		.filter((entry) => entry.length > 0)
		.map((entry) => join(entry, executableName(options.platform)));
}

function commonCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
	const home = env.USERPROFILE ?? env.HOME;
	const candidates: string[] = [];
	if (windows(platform)) {
		if (home) candidates.push(join(home, '.opencode', 'bin', 'opencode.exe'));
		if (env.LOCALAPPDATA) {
			candidates.push(join(env.LOCALAPPDATA, 'Programs', 'opencode', 'opencode.exe'));
			candidates.push(join(env.LOCALAPPDATA, 'opencode', 'bin', 'opencode.exe'));
		}
		if (env.APPDATA) {
			candidates.push(join(env.APPDATA, 'opencode', 'bin', 'opencode.exe'));
			// The npm shim on PATH is a `.cmd`; use the native binary it points to.
			candidates.push(join(env.APPDATA, 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe'));
		}
	} else {
		if (home) {
			candidates.push(join(home, '.opencode', 'bin', 'opencode'));
			candidates.push(join(home, '.local', 'bin', 'opencode'));
		}
		candidates.push('/usr/local/bin/opencode', '/usr/bin/opencode', '/opt/homebrew/bin/opencode');
	}
	return candidates;
}

/** Configured path is an override: a missing configured file is an error, not a fallback. */
function configuredCandidates(configuredPath: string, platform: NodeJS.Platform): string[] {
	if (!configuredPath) return [];
	if (windows(platform)) {
		if (/\.exe$/i.test(configuredPath)) return [configuredPath];
		if (/\.[^\\/]+$/.test(configuredPath)) return [];
		return [`${configuredPath}.exe`];
	}
	return [configuredPath];
}

/**
 * Resolve the OpenCode 2 executable without a shell. Windows accepts only the
 * native `.exe`, never the `.cmd`/`.bat` shim that would require `cmd.exe`.
 */
export async function resolveExecutable(options: ResolveExecutableOptions = {}): Promise<string> {
	const platform = options.platform ?? process.platform;
	const env = options.env ?? process.env;
	const configured = (options.configuredPath ?? '').trim();
	const exists = options.isFile ?? isFile;
	const candidates = configured
		? configuredCandidates(configured, platform)
		: [...pathCandidates({ platform, env }), ...commonCandidates(platform, env)];
	for (const candidate of [...new Set(candidates)]) {
		if (await exists(candidate)) return candidate;
	}
	throw new ConnectionError('executable');
}
