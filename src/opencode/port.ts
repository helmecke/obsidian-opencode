import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { ConnectionError } from './errors';

export type LoopbackServerFactory = () => Server;

/**
 * Bind `127.0.0.1:0`, read the assigned port, then release it for the child.
 * A single retry covers the race between release and the child's bind.
 */
export async function selectLoopbackPort(create: LoopbackServerFactory = () => createServer(), retries = 1): Promise<number> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await new Promise<number>((resolve, reject) => {
				const server = create();
				server.once('error', (error) => { server.close(); reject(error); });
				server.listen(0, '127.0.0.1', () => {
					const address = server.address();
					if (!address || typeof address === 'string') {
						server.close();
						reject(new Error('No loopback address'));
						return;
					}
					server.close((error) => error ? reject(error) : resolve(address.port));
				});
			});
		} catch (error) {
			const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
			if (code !== 'EADDRINUSE' || attempt >= retries) throw new ConnectionError('startup');
		}
	}
}
