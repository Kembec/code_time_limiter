import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'test/integration/**/*.test.js',
	// The countdown tests wait 2.1 s and 3.2 s on the real clock, past mocha's 2 s default.
	mocha: { timeout: 20000 },
});
