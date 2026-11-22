/** Eligibility is not a claim that every release has been individually tested. */
export const SUPPORTED_OPENCODE_VERSION = '>=2.2.2 <3.0.0';

export function isSupportedOpenCodeVersion(version: unknown): version is string {
	if (typeof version !== 'string') return false;
	// Stable SemVer only. Build metadata does not change release eligibility;
	// prereleases, prefixes, whitespace, and leading-zero release numbers fail.
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
	if (!match || match[0] !== version) return false;
	const major = Number(match[1]), minor = Number(match[2]), patch = Number(match[3]);
	return [major, minor, patch].every(Number.isSafeInteger)
		&& major === 2 && (minor > 2 || (minor === 2 && patch >= 2));
}

export class OpenCodeCompatibilityError extends Error {
	constructor() {
		// Never interpolate an untrusted version, registration, or credential.
		super(`Unsupported OpenCode version. This integration requires a stable release in ${SUPPORTED_OPENCODE_VERSION}. No automatic restart or replacement will be attempted. Use a compatible OpenCode installation or update the plugin, then retry.`);
		this.name = 'OpenCodeCompatibilityError';
	}
}

export class OpenCodeApiCompatibilityError extends Error {
	constructor() {
		super('Incompatible OpenCode API. A required endpoint, response, or event is unsupported. Sends and decisions are disabled. Update OpenCode or the plugin, then retry discovery. The shared service will not be restarted or replaced.');
		this.name = 'OpenCodeApiCompatibilityError';
	}
}

export function assertSupportedOpenCodeVersion(version: unknown): asserts version is string {
	if (!isSupportedOpenCodeVersion(version)) {
		throw new OpenCodeCompatibilityError();
	}
}
