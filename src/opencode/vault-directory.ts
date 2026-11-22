import { posix, win32 } from 'node:path';

/** Lexical comparison only: never scan the vault or resolve filesystem symlinks. */
export function vaultDirectory(value: string): string {
	if (!value || /[\0\r\n]/.test(value)) throw new Error('Invalid vault directory');
	if (/^(?:[a-z]:[\\/]|\\\\)/i.test(value)) return win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
	if (!posix.isAbsolute(value)) throw new Error('Invalid vault directory');
	return posix.normalize(value).replace(/\/+$/, '') || '/';
}

export function sameDirectory(left: string, right: string): boolean {
	try { return vaultDirectory(left) === vaultDirectory(right); } catch { return false; }
}
