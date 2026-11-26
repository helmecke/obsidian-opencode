import { execFile, execFileSync, spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { clearTimeout as clearNodeTimeout, setTimeout as setNodeTimeout } from 'node:timers';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import { OpenCode } from '@opencode/client';
import { Service } from '@opencode/client/service';
import { withApiValidation } from './api-contract';
import { ConnectionError } from './errors';
import { resolveExecutable } from './executable';
import { createNodeFetch } from './node-fetch';
import { selectLoopbackPort } from './port';
import { isProcessAlive, processStartedAt } from './process';
import { validateExecutableVersion } from './version';
import type { VersionQuery } from './version';

type Client = ReturnType<typeof OpenCode.make>;

export interface ManagedOrphanRecord { pid: number; startedAt: number }

/** Spawn and record time differ by milliseconds; a wide window still rules out PID reuse. */
const ORPHAN_START_TOLERANCE_MS = 120_000;
const STOP_CONFIRM_ATTEMPTS = 10;
const STOP_CONFIRM_INTERVAL_MS = 100;
export type ManagedRuntimePhase = 'idle' | 'starting' | 'running' | 'restarting' | 'failed';
export interface ManagedRuntimeStatus {
	readonly mode: 'managed';
	readonly phase: ManagedRuntimePhase;
	readonly error?: string;
}

export interface ManagedRuntimeOptions {
	/** Empty means PATH and common install locations. */
	executablePath: () => string;
	enabled: () => boolean;
	/** Plugin-private directory used as XDG_STATE_HOME. */
	stateDir: () => string;
	readOrphan?: () => ManagedOrphanRecord | undefined | Promise<ManagedOrphanRecord | undefined>;
	writeOrphan?: (record: ManagedOrphanRecord | undefined) => void | Promise<void>;
	spawn?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
	killTree?: (pid: number) => Promise<void>;
	findPort?: () => Promise<number>;
	createClient?: typeof OpenCode.make;
	versionQuery?: VersionQuery;
	readyTimeout?: number;
	pollInterval?: number;
	restartAttempts?: number;
	restartBaseDelay?: number;
	isAlive?: (pid: number) => boolean;
	delay?: (milliseconds: number) => Promise<void>;
	randomPassword?: () => string;
	/** Start time of a recorded PID, used to prove it is the child this plugin spawned. */
	processStartedAt?: (pid: number) => Promise<number | undefined>;
}

/** Windows needs the whole tree; POSIX children are started in their own group. */
async function killProcessTree(pid: number): Promise<void> {
	if (process.platform === 'win32') {
		await new Promise<void>((resolve) => {
			execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
		});
		return;
	}
	try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
	await setTimeoutPromise(200, undefined, { ref: false }).catch(() => undefined);
	try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
}

/**
 * Owns one private OpenCode 2 `serve` process. It never reads or writes the
 * shared registration and never addresses another service by URL.
 */
export class ManagedRuntime {
	private statusValue: ManagedRuntimeStatus = { mode: 'managed', phase: 'idle' };
	private readonly listeners = new Set<() => void>();
	private readonly lifetime = new AbortController();
	private child?: ChildProcess;
	private client?: Client;
	private startPromise?: Promise<Client>;
	private port?: number;
	private password?: string;
	private disposing = false;
	private restarts = 0;
	private restartTimer?: ReturnType<typeof setTimeout>;

	constructor(private readonly options: ManagedRuntimeOptions) {}

	get enabled(): boolean { return this.options.enabled(); }
	get status(): ManagedRuntimeStatus { return this.statusValue; }

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	/** Lazy, deduplicated start. A running process is reused until disposed. */
	async acquire(signal?: AbortSignal): Promise<Client> {
		signal?.throwIfAborted();
		if (this.disposing || this.lifetime.signal.aborted) throw new ConnectionError('startup');
		if (!this.enabled) throw new ConnectionError('absent');
		if (this.client) return this.client;
		if (!this.startPromise) {
			this.cancelRestart();
			const pending = this.start().finally(() => {
				if (this.startPromise === pending) this.startPromise = undefined;
			});
			this.startPromise = pending;
		}
		return this.startPromise;
	}

	async dispose(): Promise<void> {
		if (this.disposing) return;
		this.disposing = true;
		this.lifetime.abort();
		this.cancelRestart();
		const child = this.child;
		this.child = undefined;
		this.client = undefined;
		// A kill that cannot be confirmed keeps the orphan record for the next start.
		if (!child || await this.stop(child)) await this.clearOrphan().catch(() => undefined);
		this.publish({ mode: 'managed', phase: 'idle' });
		this.listeners.clear();
	}

	/** Best-effort synchronous signal while the plugin unloads; dispose() still finishes the job. */
	terminate(): void {
		const child = this.child;
		if (!child?.pid) return;
		if (process.platform === 'win32') {
			// Windows needs taskkill to reach the tree, and unload cannot await it.
			try {
				execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'],
					{ windowsHide: true, stdio: 'ignore', timeout: 3_000 });
				return;
			} catch { /* fall through to the direct kill */ }
			try { child.kill(); } catch { /* already gone */ }
			return;
		}
		try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
	}

	private async start(): Promise<Client> {
		this.setStatus({ mode: 'managed', phase: 'starting' });
		let child: ChildProcess | undefined;
		try {
			await this.reapOrphan();
			const executable = await resolveExecutable({ configuredPath: this.options.executablePath() });
			await validateExecutableVersion(executable, this.options.versionQuery);
			const stateDir = this.options.stateDir();
			const port = this.port ?? await (this.options.findPort ?? selectLoopbackPort)();
			const password = this.password ?? (this.options.randomPassword ?? randomPassword)();
			this.port = port;
			this.password = password;
			child = (this.options.spawn ?? nodeSpawn)(executable, [
				'serve', '--hostname', '127.0.0.1', '--port', String(port),
			], {
				shell: false,
				windowsHide: true,
				detached: process.platform !== 'win32',
				stdio: ['ignore', 'pipe', 'pipe'],
				env: {
					...process.env,
					OPENCODE_SERVER_PASSWORD: password,
					...(stateDir ? { XDG_STATE_HOME: stateDir } : {}),
				},
			});
			this.child = child;
			this.observe(child);
			if (!child.pid) throw new ConnectionError('startup');
			await this.writeOrphan({ pid: child.pid, startedAt: Date.now() });
			const client = await this.waitForReady(child, port);
			if (this.disposing || this.child !== child) throw new ConnectionError('startup');
			this.client = client;
			this.restarts = 0;
			this.setStatus({ mode: 'managed', phase: 'running' });
			return client;
		} catch (error) {
			if (!child || await this.stop(child)) await this.clearOrphan().catch(() => undefined);
			if (this.child === child) this.child = undefined;
			this.client = undefined;
			const mapped = error instanceof ConnectionError ? error : new ConnectionError('startup');
			if (!this.disposing) this.setStatus({ mode: 'managed', phase: 'failed', error: mapped.message });
			throw mapped;
		}
	}

	private observe(child: ChildProcess): void {
		child.stdout?.resume();
		child.stderr?.resume();
		child.once('error', () => this.handleExit(child));
		child.once('exit', () => this.handleExit(child));
	}

	private handleExit(child: ChildProcess): void {
		if (this.disposing || this.child !== child) return;
		this.child = undefined;
		this.client = undefined;
		void this.clearOrphan().catch(() => undefined);
		if (this.statusValue.phase !== 'running') return;
		this.scheduleRestart();
	}

	private scheduleRestart(): void {
		if (this.disposing || this.restartTimer) return;
		const attempts = this.options.restartAttempts ?? 3;
		if (this.restarts >= attempts) {
			this.setStatus({ mode: 'managed', phase: 'failed', error: new ConnectionError('startup').message });
			return;
		}
		this.restarts++;
		const delay = (this.options.restartBaseDelay ?? 500) * 2 ** (this.restarts - 1);
		this.setStatus({ mode: 'managed', phase: 'restarting', error: new ConnectionError('startup').message });
		this.restartTimer = setNodeTimeout(() => {
			this.restartTimer = undefined;
			void this.restart();
		}, delay);
	}

	private async restart(): Promise<void> {
		try {
			await this.start();
		} catch {
			if (!this.disposing) this.scheduleRestart();
		}
	}

	private cancelRestart(): void {
		if (this.restartTimer !== undefined) clearNodeTimeout(this.restartTimer);
		this.restartTimer = undefined;
	}

	private async waitForReady(child: ChildProcess, port: number): Promise<Client> {
		const origin = `http://127.0.0.1:${port}`;
		const headers = Service.headers({
			url: origin, auth: { type: 'basic', username: 'opencode', password: this.password! },
		});
		const make = this.options.createClient ?? OpenCode.make;
		const probe = make({ baseUrl: origin, headers, fetch: createNodeFetch(origin, 65_536, this.lifetime.signal) });
		const timeout = this.options.readyTimeout ?? 30_000;
		const interval = this.options.pollInterval ?? 100;
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline && !this.disposing) {
			if (child.exitCode !== null || child.signalCode !== null) throw new ConnectionError('startup');
			try {
				const info = await probe.server.info({
					signal: AbortSignal.timeout(Math.max(1, Math.min(2_000, deadline - Date.now()))),
				});
				if (!info || typeof info !== 'object' || info.pid !== child.pid) throw new Error('Identity');
				return withApiValidation(make({
					baseUrl: origin, headers, fetch: createNodeFetch(origin, Infinity, this.lifetime.signal),
				}));
			} catch {
				// Not ready yet; a refused connection, timeout, or different PID is retried.
			}
			if (this.options.delay) await this.options.delay(interval);
			else await setTimeoutPromise(interval, undefined, { ref: false }).catch(() => undefined);
		}
		throw new ConnectionError('timeout');
	}

	private async reapOrphan(): Promise<void> {
		const record = await this.options.readOrphan?.();
		if (!record) return;
		const alive = this.options.isAlive ?? isProcessAlive;
		if (!alive(record.pid) || record.pid === process.pid) { await this.clearOrphan(); return; }
		// A live PID alone can belong to an unrelated process after a crash and
		// reboot; only a matching start time proves it is the child we spawned.
		const startedAt = await (this.options.processStartedAt ?? processStartedAt)(record.pid);
		if (startedAt === undefined || Math.abs(startedAt - record.startedAt) > ORPHAN_START_TOLERANCE_MS) return;
		await (this.options.killTree ?? killProcessTree)(record.pid);
		if (await this.stopped(record.pid)) await this.clearOrphan();
	}

	/** Kill the child tree and report whether the process is confirmed gone. */
	private async stop(child: ChildProcess): Promise<boolean> {
		if (!child.pid || child.exitCode !== null) return true;
		try { await (this.options.killTree ?? killProcessTree)(child.pid); } catch { /* already gone */ }
		return this.stopped(child.pid);
	}

	private async stopped(pid: number): Promise<boolean> {
		const alive = this.options.isAlive ?? isProcessAlive;
		for (let attempt = 0; attempt < STOP_CONFIRM_ATTEMPTS; attempt++) {
			if (!alive(pid)) return true;
			if (attempt < STOP_CONFIRM_ATTEMPTS - 1) await this.wait(STOP_CONFIRM_INTERVAL_MS);
		}
		return false;
	}

	private wait(milliseconds: number): Promise<void> {
		if (this.options.delay) return this.options.delay(milliseconds);
		return setTimeoutPromise(milliseconds, undefined, { ref: false }).then(() => undefined);
	}

	private async writeOrphan(record: ManagedOrphanRecord): Promise<void> {
		await this.options.writeOrphan?.(record);
	}

	private async clearOrphan(): Promise<void> {
		await this.options.writeOrphan?.(undefined);
	}

	private setStatus(status: ManagedRuntimeStatus): void { this.publish(status); }

	private publish(status: ManagedRuntimeStatus): void {
		this.statusValue = status;
		for (const listener of this.listeners) listener();
	}
}

function randomPassword(): string { return randomBytes(32).toString('base64url'); }
