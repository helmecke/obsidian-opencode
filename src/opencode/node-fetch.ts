import { request } from 'node:http';
import { setTimeout, clearTimeout } from 'node:timers';
import { ConnectionError } from './errors';

export function localOrigin(value: string): string {
	// Check the spelling as well as URL normalization (which accepts integer,
	// octal and abbreviated IPv4 forms). Only literal loopback is supported.
	if (!/^http:\/\/(127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/.test(value)) {
		throw new ConnectionError('registration');
	}
	let url: URL;
	try { url = new URL(value); } catch { throw new ConnectionError('registration'); }
	if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
		|| url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
		throw new ConnectionError('registration');
	}
	return url.origin;
}

export const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

/** No browser fetch, redirects, DNS names, or cross-origin credential forwarding. */
export function createNodeFetch(origin: string, maxResponseBytes = Infinity, lifetime?: AbortSignal,
	maxRequestBytes = MAX_REQUEST_BYTES): typeof fetch {
	const boundOrigin = localOrigin(origin);
	return async (input, init) => {
		try {
			const inputRequest = new Request(input, init);
			const req = lifetime
				? new Request(inputRequest, { signal: AbortSignal.any([inputRequest.signal, lifetime]) })
				: inputRequest;
			req.signal.throwIfAborted();
			const url = new URL(req.url);
			if (url.origin !== boundOrigin || url.username || url.password) throw new ConnectionError('transport');
			const body = ['GET', 'HEAD'].includes(req.method) ? undefined
				: await readRequestBody(req, maxRequestBytes);
			return await new Promise<Response>((resolve, reject) => {
				const fail = () => reject(new ConnectionError('transport'));
				const outgoing = request(url, {
					method: req.method, headers: Object.fromEntries(req.headers), signal: req.signal,
				}, (incoming) => {
					clearTimeout(timer);
					const status = incoming.statusCode ?? 500;
					if (status >= 300 && status < 400) {
						incoming.destroy(); outgoing.destroy(); fail(); return;
					}
					const iterator = incoming[Symbol.asyncIterator]();
					let bytes = 0;
					const stream = new ReadableStream<Uint8Array>({
						async pull(controller) {
							try {
								const chunk = await iterator.next();
								if (chunk.done) { controller.close(); return; }
								const data = chunk.value as Buffer;
								bytes += data.byteLength;
								if (bytes > maxResponseBytes) throw new ConnectionError('transport');
								controller.enqueue(new Uint8Array(data));
							} catch {
								incoming.destroy(); outgoing.destroy();
								controller.error(new ConnectionError('transport'));
							}
						},
						cancel() { incoming.destroy(); outgoing.destroy(); },
					});
					const headers = new Headers();
					for (const [name, value] of Object.entries(incoming.headers)) {
						if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
					}
					const noBody = req.method === 'HEAD' || [204, 205, 304].includes(status);
					if (noBody) incoming.resume();
					resolve(new Response(noBody ? null : stream, { status, headers }));
				});
				const timer = setTimeout(() => { outgoing.destroy(); fail(); }, 10_000);
				outgoing.on('error', () => { clearTimeout(timer); fail(); });
				outgoing.end(body);
			});
		} catch { throw new ConnectionError('transport'); }
	};
}

/** Buffer a request body under a hard limit instead of reading it unbounded. */
async function readRequestBody(request: Request, limit: number): Promise<Buffer> {
	const declared = request.headers.get('content-length');
	if (declared !== null && Number(declared) > limit) throw new ConnectionError('transport');
	if (!request.body) return Buffer.alloc(0);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > limit) throw new ConnectionError('transport');
			chunks.push(value);
		}
	} catch (error) {
		await reader.cancel().catch(() => undefined);
		throw error;
	}
	return Buffer.concat(chunks);
}
