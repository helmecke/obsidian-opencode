import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { OpenCode } from '@opencode/client';
import { Service, fallback } from '@opencode/client/service';

// Disposable-vault experiment, not a production discovery implementation.
// Only loopback HTTP is accepted; redirects are not followed.
async function localFetch(input, init) {
	const req = new Request(input, init);
	const url = new URL(req.url);
	if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
		throw new Error('Probe requires loopback HTTP');
	}
	const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.from(await req.arrayBuffer());
	return new Promise((resolve, reject) => {
		const outgoing = request(url, {
			method: req.method,
			headers: Object.fromEntries(req.headers),
			signal: req.signal,
		}, (incoming) => {
			const iterator = incoming[Symbol.asyncIterator]();
			const stream = new ReadableStream({
				async pull(controller) {
					try {
						const chunk = await iterator.next();
						if (chunk.done) controller.close();
						else controller.enqueue(new Uint8Array(chunk.value));
					} catch (error) {
						controller.error(error);
					}
				},
				cancel() { incoming.destroy(); outgoing.destroy(); },
			});
			const headers = new Headers();
			for (const [name, value] of Object.entries(incoming.headers)) {
				if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
			}
			resolve(new Response(req.method === 'HEAD' || [204, 205, 304].includes(incoming.statusCode) ? null : stream, {
				status: incoming.statusCode,
				headers,
			}));
		});
		outgoing.on('error', reject);
		outgoing.end(body);
	});
}

export async function run() {
	const registration = JSON.parse(await readFile(fallback(), 'utf8'));
	if (!registration.password) throw new Error('Probe requires an authenticated service');
	const endpoint = {
		url: registration.url,
		auth: { type: 'basic', username: 'opencode', password: registration.password },
	};
	const client = OpenCode.make({
		baseUrl: endpoint.url,
		headers: Service.headers(endpoint),
		fetch: localFetch,
	});
	const info = await client.server.info({ signal: AbortSignal.timeout(10_000) });
	if (info.version !== '2.2.2' || info.pid !== registration.pid) {
		throw new Error('Service identity or version did not match');
	}
	const unauthorized = await localFetch(new URL('/api/info', endpoint.url), {
		signal: AbortSignal.timeout(10_000),
	});
	await unauthorized.text();
	let eventType;
	for await (const event of client.event.subscribe({ signal: AbortSignal.timeout(10_000) })) {
		eventType = event.type;
		break;
	}
	return { authenticated: true, unauthorizedStatus: unauthorized.status, version: info.version,
		identityMatches: true, eventType, transport: 'node:http with Web ReadableStream' };
}
