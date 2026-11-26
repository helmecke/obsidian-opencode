import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'tests/*.mjs', 'scripts/*.mjs'],
					// Keep the Node fixture/probe suite type-aware as new suites are added.
					maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 48,
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			'obsidianmd/ui/sentence-case': ['warn', { brands: ['OpenCode'] }],
		},
	},
	{
		files: ['tests/*.mjs', 'scripts/*.mjs'],
		languageOptions: { globals: globals.node },
		// Node test/developer tooling is not part of a mobile plugin.
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
			// Test helpers assign jsdom globals deliberately.
			'obsidianmd/no-global-this': 'off',
		},
	},
);
