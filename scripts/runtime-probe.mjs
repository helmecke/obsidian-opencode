import { OpenCode } from '@opencode/client';
import { Service, fallback } from '@opencode/client/service';
import { readFile } from 'node:fs/promises';

// Bundle as CommonJS, then invoke from the approved disposable vault only.
// No startup, shutdown, prompts, vault reads, or credential logging.
export async function run() {
	const endpoint = await Service.discover({ version: '2.2.2' });
	if (!endpoint) {
		const registration = JSON.parse(await readFile(fallback(), 'utf8'));
		const candidate = {
			url: registration.url,
			auth: registration.password ? {
				type: 'basic', username: 'opencode', password: registration.password,
			} : undefined,
		};
		try {
			// Deliberately test the same fetch implementation used by Service.discover.
			const response = await globalThis.fetch(new URL('/api/info', candidate.url), {
				headers: Service.headers(candidate), signal: AbortSignal.timeout(10_000),
			});
			return { discovery: false, probeStatus: response.status };
		} catch (error) {
			return { discovery: false, probeError: error.name };
		}
	}
	const client = OpenCode.make({
		baseUrl: endpoint.url,
		headers: Service.headers(endpoint),
	});
	const info = await client.server.info({ signal: AbortSignal.timeout(10_000) });
	let eventType;
	for await (const event of client.event.subscribe({ signal: AbortSignal.timeout(10_000) })) {
		eventType = event.type;
		break;
	}
	return {
		discovery: true,
		authenticated: endpoint.auth?.type === 'basic',
		version: info.version,
		eventType,
		transport: process.versions.electron ? 'Electron renderer fetch' : 'Node fetch',
	};
}
