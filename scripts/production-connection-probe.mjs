import { readFile } from 'node:fs/promises';
import * as timers from 'node:timers';
import { fallback } from '@opencode/client/service';
import { discoverConnection } from '../src/opencode/discovery';
import { createNodeFetch, localOrigin } from '../src/opencode/node-fetch';
import { vaultDirectory } from '../src/opencode/vault-directory';

/** Read-only production-adapter gate; never creates sessions or submits prompts. */
export async function run(directory) {
	vaultDirectory(directory);
	const lifetime = new AbortController();
	const timer = timers.setTimeout(() => lifetime.abort(), 15_000);
	try {
		const client = await discoverConnection(undefined, lifetime.signal);
		const info = await client.server.info({ signal: lifetime.signal });
		const registration = JSON.parse(await readFile(fallback(), 'utf8'));
		if (info.pid !== registration.pid || info.version !== registration.version) {
			throw new Error('Service changed during probe. Retry without replacing it.');
		}
		const fetch = createNodeFetch(localOrigin(registration.url), 65_536, lifetime.signal);
		const unauthorized = await fetch(new URL('/api/info', registration.url));
		await unauthorized.arrayBuffer();
		if (unauthorized.status !== 401) throw new Error('Unauthenticated probe did not receive HTTP 401.');
		let eventType;
		for await (const event of client.event.subscribe({ signal: lifetime.signal })) {
			eventType = event.type;
			break;
		}
		if (eventType !== 'server.connected') throw new Error('Missing connection marker.');
		const location = { directory };
		const [sessions, agents, models, permissions, forms] = await Promise.all([
			client.session.list({ directory }, { signal: lifetime.signal }),
			client.agent.list({ location }, { signal: lifetime.signal }),
			client.model.list({ location }, { signal: lifetime.signal }),
			client.permission.request.list({ directory }, { signal: lifetime.signal }),
			client.form.list({ directory }, { signal: lifetime.signal }),
		]);
		return {
			version: info.version, identityMatches: true, authenticated: true,
			unauthorizedStatus: unauthorized.status, eventType,
			counts: { sessions: sessions.data.length, agents: agents.data.length, models: models.data.length,
				permissions: permissions.data.length, forms: forms.data.length },
			runtime: { node: process.versions.node, electron: process.versions.electron ?? null },
			transport: 'production node:http adapter',
		};
	} finally {
		timers.clearTimeout(timer);
		lifetime.abort();
	}
}
