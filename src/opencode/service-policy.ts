import { assertSupportedOpenCodeVersion } from './compatibility';

export interface VersionedService {
	readonly version: unknown;
}

export type ServiceDiscovery<T extends VersionedService> =
	| { readonly kind: 'absent' }
	| { readonly kind: 'found'; readonly service: T };

export interface ServicePolicyDependencies<T extends VersionedService> {
	/** Only report absence when established; reject on all discovery errors. */
	discover: () => Promise<ServiceDiscovery<T>>;
	/** Must independently enforce race-safe, non-replacing startup (task 2.2). */
	startWhenAbsent: () => Promise<T>;
}

/** Compatibility gate for the future coordinator; does not own service lifecycle. */
export async function connectCompatibleService<T extends VersionedService>(
	dependencies: ServicePolicyDependencies<T>,
): Promise<T> {
	const discovered = await dependencies.discover();
	if (discovered.kind === 'found') {
		assertSupportedOpenCodeVersion(discovered.service.version);
		return discovered.service;
	}

	// Discovery failure or incompatibility must never fall through to startup.
	const started = await dependencies.startWhenAbsent();
	assertSupportedOpenCodeVersion(started.version);
	return started;
}
