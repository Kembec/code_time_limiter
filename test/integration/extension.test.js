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
			update: (key, value) => {
				store.set(key, value);

				return Promise.resolve();
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

	test("the limit is set in one step from the input box", async () => {
		let options;
		sandbox.stub(vscode.window, "showInputBox").callsFake((opts) => {
			options = opts;

			return Promise.resolve("45m");
		});
		await vscode.commands.executeCommand("codeTimeLimiter.setLimit");

		assert.match(bar.text, /^\$\(watch\) 4[45]:\d{2}$/);
		const preview = options.validateInput("1h30");
		assert.strictEqual(preview.severity, vscode.InputBoxValidationSeverity.Info);
		assert.match(preview.message, /\d{2}:\d{2}/);
		const wrong = options.validateInput("soon");
		assert.strictEqual(wrong.severity, vscode.InputBoxValidationSeverity.Error);
		assert.match(bar.accessibilityInformation.label, /^4[45]:\d{2} /);
	});

	test("«5 more minutes» in the notice starts a new countdown", async () => {
		sandbox
			.stub(vscode.window, "showInformationMessage")
			.callsFake((_message, ...actions) => Promise.resolve(actions[0]));
		await vscode.commands.executeCommand("codeTimeLimiter.addFive");
		const realNow = Date.now.bind(Date);
		sandbox.stub(Date, "now").callsFake(() => realNow() + 6 * 60 * 1000);
		await wait(1200);

		// Five minutes counted from the moment time ran out, not from the old end.
		assert.match(bar.text, /^\$\(watch\) (5:00|4:5\d)$/);
	});

	test("an older notice closing late keeps the current «Time's up»", async () => {
		const closers = [];
		sandbox.stub(vscode.window, "showInformationMessage").callsFake(
			() =>
				new Promise((resolve) => {
					closers.push(resolve);
				}),
		);
		const realNow = Date.now.bind(Date);
		let offset = 0;
		sandbox.stub(Date, "now").callsFake(() => realNow() + offset);

		await vscode.commands.executeCommand("codeTimeLimiter.addFive");
		offset = 6 * 60 * 1000;
		await wait(1200);
		await vscode.commands.executeCommand("codeTimeLimiter.addFive");
		offset = 12 * 60 * 1000;
		await wait(1200);
		assert.strictEqual(closers.length, 2);

		// VS Code resolves the first, identical notice with undefined when it opens the second.
		closers[0](undefined);
		await wait(50);
		assert.match(bar.text, /^\$\(bell\) /);

		closers[1](undefined);
		await wait(50);
		assert.match(bar.text, /^\$\(watch\)$/);
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
