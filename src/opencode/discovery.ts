import { open } from 'node:fs/promises';
import { OpenCode } from '@opencode/client';
import { Service, fallback } from '@opencode/client/service';
import type { Info } from '@opencode/client/service';
import { assertSupportedOpenCodeVersion } from './compatibility';
import { withApiValidation } from './api-contract';
import { ConnectionError } from './errors';
import { createNodeFetch, localOrigin } from './node-fetch';

const MAX_REGISTRATION_BYTES = 16_384;

/** Read at most the limit plus one byte; never modify shared service state. */
export async function readRegistration(file: string): Promise<string | undefined> {
	try {
		const handle = await open(file, 'r');
		try {
			if (!(await handle.stat()).isFile()) throw new ConnectionError('registration');
			const buffer = Buffer.alloc(MAX_REGISTRATION_BYTES + 1);
			let bytesRead = 0;
			while (bytesRead < buffer.length) {
				const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
				if (!chunk.bytesRead) break;
				bytesRead += chunk.bytesRead;
			}
			if (bytesRead > MAX_REGISTRATION_BYTES) throw new ConnectionError('registration');
			return buffer.subarray(0, bytesRead).toString('utf8');
		} finally { await handle.close(); }
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
		throw new ConnectionError('registration');
	}
}

function parseRegistration(text: string): Info & { password: string } {
	try {
		if (Buffer.byteLength(text) > MAX_REGISTRATION_BYTES) throw new Error();
		const value: unknown = JSON.parse(text);
		if (!value || typeof value !== 'object') throw new Error();
		const info = value as Record<string, unknown>;
		if (typeof info.url !== 'string' || !Number.isSafeInteger(info.pid) || (info.pid as number) <= 0
			|| typeof info.password !== 'string' || !info.password
			|| (info.version !== undefined && typeof info.version !== 'string')
			|| (info.id !== undefined && typeof info.id !== 'string')) throw new Error();
		localOrigin(info.url);
		return info as unknown as Info & { password: string };
	} catch { throw new ConnectionError('registration'); }
}

export async function discoverConnection(read = () => readRegistration(fallback()), signal?: AbortSignal) {
	signal?.throwIfAborted();
	let text: string | undefined;
	try { text = await read(); } catch { throw new ConnectionError('registration'); }
	signal?.throwIfAborted();
	if (text === undefined) throw new ConnectionError('absent');
	const info = parseRegistration(text);
	assertSupportedOpenCodeVersion(info.version);
	const origin = localOrigin(info.url);
	const headers = Service.headers({ url: origin, auth: { type: 'basic', username: 'opencode', password: info.password } });
	const probe = OpenCode.make({ baseUrl: origin, headers, fetch: createNodeFetch(origin, 65_536, signal) });
	let health: { pid: number; version: string };
	try {
		health = await probe.server.info({ signal: AbortSignal.timeout(10_000) });
	} catch (error) {
		const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
		throw new ConnectionError(status === 401 || status === 403 ? 'authentication' : 'transport');
	}
	if (!health || typeof health !== 'object' || health.pid !== info.pid || health.version !== info.version) {
		throw new ConnectionError('identity');
	}
	let after: Info;
	try {
		const current = await read();
		if (current === undefined) throw new Error();
		after = parseRegistration(current);
	} catch { throw new ConnectionError('identity'); }
	if (after.url !== info.url || after.pid !== info.pid || after.version !== info.version
		|| after.password !== info.password || after.id !== info.id) throw new ConnectionError('identity');
	signal?.throwIfAborted();
	return withApiValidation(OpenCode.make({ baseUrl: origin, headers, fetch: createNodeFetch(origin, Infinity, signal) }));
}
