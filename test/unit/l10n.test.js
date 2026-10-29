const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const readJson = (file) => JSON.parse(read(file));

// Every string the code passes to vscode.l10n.t, read from the source so a new message cannot ship untranslated.
function messagesInSource() {
	const source = read("src/extension.js");
	const found = new Set();
	for (const match of source.matchAll(/l10n\.t\(\s*"((?:[^"\\]|\\.)*)"/g)) {
		found.add(JSON.parse(`"${match[1]}"`));
	}

	return found;
}

test("every runtime message has a Spanish translation", () => {
	const spanish = readJson("l10n/bundle.l10n.es.json");
	const messages = messagesInSource();
	assert.ok(messages.size >= 15, `found only ${messages.size} messages`);
	for (const message of messages) {
		assert.ok(spanish[message], `missing in Spanish: ${message}`);
	}
	for (const key of Object.keys(spanish)) {
		assert.ok(messages.has(key), `Spanish entry no longer used: ${key}`);
	}
});

test("the Spanish bundle keeps every placeholder", () => {
	const spanish = readJson("l10n/bundle.l10n.es.json");
	const placeholders = (text) => (text.match(/\{\d\}/g) ?? []).sort().join();
	for (const [english, translated] of Object.entries(spanish)) {
		assert.equal(placeholders(translated), placeholders(english), english);
	}
});

test("manifest strings exist in English and Spanish", () => {
	const english = readJson("package.nls.json");
	const spanish = readJson("package.nls.es.json");
	assert.deepEqual(Object.keys(spanish).sort(), Object.keys(english).sort());
	const manifest = read("package.json");
	for (const match of manifest.matchAll(/"%([\w.]+)%"/g)) {
		assert.ok(english[match[1]], `package.json uses %${match[1]}% without a string`);
	}
});
