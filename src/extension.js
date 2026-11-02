const vscode = require("vscode");
const clock = require("./clock");

const STATE_KEY = "codeTimeLimiter.endsAt";
const LAST_INPUT_KEY = "codeTimeLimiter.lastInput";
const EXTEND_MS = 5 * clock.MINUTE;

let context;
let statusBar;
let ticker;
let endsAt = 0;
let warned = false;
// Which time-out is current: an older notice that closes late must not repaint the status bar.
let finishRound = 0;

function activate(ctx) {
	context = ctx;
	statusBar = vscode.window.createStatusBarItem(
		"codeTimeLimiter.countdown",
		vscode.StatusBarAlignment.Left,
		100,
	);
	statusBar.name = vscode.l10n.t("Code Time Limiter");
	statusBar.command = "codeTimeLimiter.toggleActivate";
	ctx.subscriptions.push(
		statusBar,
		vscode.commands.registerCommand("codeTimeLimiter.toggleActivate", onStatusClick),
		vscode.commands.registerCommand("codeTimeLimiter.setLimit", promptLimit),
		vscode.commands.registerCommand("codeTimeLimiter.addFive", addFive),
		vscode.commands.registerCommand("codeTimeLimiter.stop", stop),
		{ dispose: stopTicker },
	);

	// A limit survives a window reload; an expired one does not come back as a surprise.
	const saved = ctx.globalState.get(STATE_KEY, 0);
	if (saved > Date.now()) {
		start(saved);
	} else {
		render();
		if (vscode.workspace.getConfiguration().get("codeTimeLimiter.enableAtStartup")) {
			promptLimit();
		}
	}
	statusBar.show();
}

function isRunning() {
	return endsAt > 0;
}

async function onStatusClick() {
	if (!isRunning()) {
		return promptLimit();
	}
	const items = [
		{ id: "add", label: `$(add) ${vscode.l10n.t("5 more minutes")}` },
		{ id: "change", label: `$(edit) ${vscode.l10n.t("Change the limit")}` },
		{ id: "stop", label: `$(debug-stop) ${vscode.l10n.t("Stop the limit")}` },
	];
	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: vscode.l10n.t("Ends at {0} · {1} left", clock.formatClock(endsAt), countdown()),
	});
	if (pick?.id === "add") {
		addFive();
	} else if (pick?.id === "change") {
		promptLimit();
	} else if (pick?.id === "stop") {
		stop();
	}
}

function describe(result) {
	if (result.ok) {
		const left = clock.formatRemaining(clock.remaining(result.endsAt, Date.now()));

		return vscode.l10n.t("Ends at {0} · in {1}", clock.formatClock(result.endsAt), left);
	}
	const reasons = {
		invalidClock: vscode.l10n.t("That hour does not exist. Use 24-hour time, like 18:30."),
		tooShort: vscode.l10n.t("Give it at least one minute."),
		tooLong: vscode.l10n.t("Up to 24 hours."),
		unknown: vscode.l10n.t("Write a duration (45m, 1h30) or an hour (18:30)."),
	};

	return reasons[result.reason] ?? "";
}

async function promptLimit() {
	const value = await vscode.window.showInputBox({
		title: vscode.l10n.t("Stop coding at…"),
		prompt: vscode.l10n.t("A duration (45m, 1h30) or an hour (18:30)"),
		placeHolder: "45m · 1h30 · 18:30",
		value: context.globalState.get(LAST_INPUT_KEY, ""),
		validateInput: (text) => {
			if (text.trim() === "") {
				return null;
			}
			const result = clock.parseLimit(text, Date.now());
			const severity = result.ok
				? vscode.InputBoxValidationSeverity.Info
				: vscode.InputBoxValidationSeverity.Error;

			return { message: describe(result), severity };
		},
	});
	if (value === undefined) {
		return;
	}
	const result = clock.parseLimit(value, Date.now());
	if (!result.ok) {
		return;
	}
	context.globalState.update(LAST_INPUT_KEY, value.trim());
	start(result.endsAt);
}

function start(when) {
	endsAt = when;
	warned = clock.remaining(endsAt, Date.now()) <= EXTEND_MS;
	context.globalState.update(STATE_KEY, endsAt);
	stopTicker();
	ticker = setInterval(tick, 1000);
	render();
}

function addFive() {
	start(clock.extend(endsAt || Date.now(), Date.now(), EXTEND_MS));
}

function stop() {
	endsAt = 0;
	stopTicker();
	context.globalState.update(STATE_KEY, 0);
	render();
}

function stopTicker() {
	if (ticker) {
		clearInterval(ticker);
		ticker = undefined;
	}
}

function countdown() {
	return clock.formatRemaining(clock.remaining(endsAt, Date.now()));
}

function tick() {
	const left = clock.remaining(endsAt, Date.now());
	if (left === 0) {
		finish();

		return;
	}
	if (!warned && clock.isWarning(left, EXTEND_MS)) {
		warned = true;
		vscode.window.setStatusBarMessage(
			vscode.l10n.t("5 minutes left. Wrap up what you are writing."),
			8000,
		);
	}
	render();
}

// One dismissable notice and nothing else: no diagnostics, no locked editors, no lost work.
async function finish() {
	const round = ++finishRound;
	stop();
	statusBar.text = `$(bell) ${vscode.l10n.t("Time's up")}`;
	statusBar.accessibilityInformation = { label: vscode.l10n.t("Time's up") };
	statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
	const more = vscode.l10n.t("5 more minutes");
	const choice = await vscode.window.showInformationMessage(
		vscode.l10n.t("Time's up. Your work stays where you left it."),
		more,
	);
	if (choice === more) {
		addFive();

		return;
	}
	// VS Code closes an identical older notice when a new one opens, resolving it with undefined.
	if (round === finishRound && !isRunning()) {
		render();
	}
}

function render() {
	if (!isRunning()) {
		statusBar.text = "$(watch)";
		statusBar.tooltip = vscode.l10n.t("Set a time limit");
		statusBar.accessibilityInformation = { label: vscode.l10n.t("Set a time limit") };
		statusBar.backgroundColor = undefined;

		return;
	}
	const left = clock.remaining(endsAt, Date.now());
	statusBar.text = `$(watch) ${clock.formatRemaining(left)}`;
	statusBar.tooltip = vscode.l10n.t(
		"Ends at {0}. Click for 5 more minutes, change or stop.",
		clock.formatClock(endsAt),
	);
	// Without a label a screen reader announces the icon name «watch» before the digits.
	statusBar.accessibilityInformation = {
		label: vscode.l10n.t(
			"{0} left, ends at {1}",
			clock.formatRemaining(left),
			clock.formatClock(endsAt),
		),
	};
	statusBar.backgroundColor = clock.isWarning(left, EXTEND_MS)
		? new vscode.ThemeColor("statusBarItem.warningBackground")
		: undefined;
}

function deactivate() {
	stopTicker();
}

module.exports = {
	activate,
	deactivate,
};
