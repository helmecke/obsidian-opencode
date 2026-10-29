/** Expand only after testing the registration, API, and event contracts. */
export const SUPPORTED_OPENCODE_VERSION = '2.2.2';

export function isSupportedOpenCodeVersion(version: unknown): version is typeof SUPPORTED_OPENCODE_VERSION {
	return version === SUPPORTED_OPENCODE_VERSION;
}

export class OpenCodeCompatibilityError extends Error {
	constructor() {
		// Never interpolate an untrusted version, registration, or credential.
		super(`Unsupported OpenCode version. This integration requires exactly ${SUPPORTED_OPENCODE_VERSION}. No automatic restart or replacement will be attempted. Use a compatible OpenCode installation or update the plugin, then retry.`);
		this.name = 'OpenCodeCompatibilityError';
	}
}

export function assertSupportedOpenCodeVersion(version: unknown): asserts version is typeof SUPPORTED_OPENCODE_VERSION {
	if (!isSupportedOpenCodeVersion(version)) {
		throw new OpenCodeCompatibilityError();
	}
}
