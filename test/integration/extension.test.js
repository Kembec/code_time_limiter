const assert = require("assert");
const vscode = require("vscode");
const sinon = require("sinon");

// Same module instance the host activated: its registered commands act on the state set below.
const extension = require("../../src/extension");

const EXTENSION_ID = "kembec.code-time-limiter";
const COMMANDS = [
	"codeTimeLimiter.setLimit",
	"codeTimeLimiter.addFive",
	"codeTimeLimiter.stop",
	"codeTimeLimiter.toggleActivate",
];

const wait = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

function fakeStatusBar() {
	return { text: "", tooltip: "", backgroundColor: undefined, show() {}, hide() {}, dispose() {} };
}

function fakeContext() {
	const store = new Map();

	return {
		subscriptions: [],
		globalState: {
			get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
			update: async (key, value) => {
				store.set(key, value);
			},
		},
	};
}

suite("Code Time Limiter in VS Code", () => {
	let sandbox;
	let bar;

	suiteSetup(async () => {
		await vscode.extensions.getExtension(EXTENSION_ID).activate();
	});

	setup(() => {
		sandbox = sinon.createSandbox();
		bar = fakeStatusBar();
		// Re-activate against a status bar the test can read; the real commands stay registered.
		sandbox.stub(vscode.window, "createStatusBarItem").returns(bar);
		sandbox.stub(vscode.commands, "registerCommand").returns({ dispose() {} });
		extension.activate(fakeContext());
	});

	teardown(async () => {
		await vscode.commands.executeCommand("codeTimeLimiter.stop");
		sandbox.restore();
	});

	test("activates and registers its commands", async () => {
		assert.strictEqual(vscode.extensions.getExtension(EXTENSION_ID).isActive, true);
		const commands = await vscode.commands.getCommands(true);
		for (const command of COMMANDS) {
			assert.ok(commands.includes(command), command);
		}
	});

	test("with a limit set, the status bar counts down", async () => {
		assert.strictEqual(bar.text, "$(watch)");
		await vscode.commands.executeCommand("codeTimeLimiter.addFive");
		assert.match(bar.text, /^\$\(watch\) [45]:\d{2}$/);
		const first = bar.text;
		await wait(2100);
		assert.notStrictEqual(bar.text, first);
		assert.match(bar.text, /^\$\(watch\) 4:5\d$/);
	});

	test("at zero: one notice and no diagnostics", async () => {
		const notice = sandbox.stub(vscode.window, "showInformationMessage").resolves(undefined);
		const document = await vscode.workspace.openTextDocument({
			content: "let x = 1;\n",
			language: "javascript",
		});
		await vscode.window.showTextDocument(document);

		await vscode.commands.executeCommand("codeTimeLimiter.addFive");
		const realNow = Date.now.bind(Date);
		sandbox.stub(Date, "now").callsFake(() => realNow() + 6 * 60 * 1000);
		await wait(3200);

		assert.strictEqual(notice.callCount, 1);
		assert.deepStrictEqual(vscode.languages.getDiagnostics(document.uri), []);
		assert.strictEqual(
			vscode.languages.getDiagnostics().filter(([, list]) => list.length > 0).length,
			0,
		);
		assert.match(bar.text, /^\$\(watch\)$/);
	});
});
