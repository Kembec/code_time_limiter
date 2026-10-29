const test = require("node:test");
const assert = require("node:assert/strict");
const clock = require("../../src/clock.js");

// 2026-10-27 17:10:00 local time: every case uses this injected instant, never the real clock.
const NOW = new Date(2026, 9, 27, 17, 10, 0, 0).getTime();
const MIN = clock.MINUTE;

test("durations in minutes", () => {
	for (const input of ["45m", "45", "45 min", " 45M ", "45 minutos"]) {
		const r = clock.parseLimit(input, NOW);
		assert.equal(r.ok, true, input);
		assert.equal(r.kind, "duration");
		assert.equal(r.endsAt, NOW + 45 * MIN, input);
	}
});

test("durations in hours", () => {
	assert.equal(clock.parseLimit("1h", NOW).endsAt, NOW + 60 * MIN);
	assert.equal(clock.parseLimit("1h30", NOW).endsAt, NOW + 90 * MIN);
	assert.equal(clock.parseLimit("1h 30m", NOW).endsAt, NOW + 90 * MIN);
	assert.equal(clock.parseLimit("1.5h", NOW).endsAt, NOW + 90 * MIN);
	assert.equal(clock.parseLimit("1,5h", NOW).endsAt, NOW + 90 * MIN);
});

test("hour and minute words in Spanish and English", () => {
	for (const input of ["1 hora", "1 hour", "1 hr"]) {
		assert.equal(clock.parseLimit(input, NOW).endsAt, NOW + 60 * MIN, input);
	}
	for (const input of ["2 horas", "2 hours", "2hrs"]) {
		assert.equal(clock.parseLimit(input, NOW).endsAt, NOW + 120 * MIN, input);
	}
	assert.equal(clock.parseLimit("1 hora 30 minutos", NOW).endsAt, NOW + 90 * MIN);
	assert.equal(clock.parseLimit("1 minuto", NOW).endsAt, NOW + MIN);
	assert.equal(clock.parseLimit("1 minute", NOW).endsAt, NOW + MIN);
	assert.equal(clock.parseLimit("2 horitas", NOW).reason, "unknown");
});

test("a clock later today ends today", () => {
	const r = clock.parseLimit("18:30", NOW);
	assert.equal(r.ok, true);
	assert.equal(r.kind, "clock");
	assert.equal(r.endsAt, new Date(2026, 9, 27, 18, 30).getTime());
});

test("a clock already past ends tomorrow", () => {
	const r = clock.parseLimit("9:00", NOW);
	assert.equal(r.endsAt, new Date(2026, 9, 28, 9, 0).getTime());
	assert.equal(clock.parseLimit("17:10", NOW).endsAt, new Date(2026, 9, 28, 17, 10).getTime());
});

test("rejects what it cannot read, with a reason", () => {
	assert.deepEqual(clock.parseLimit("", NOW), { ok: false, reason: "empty" });
	assert.equal(clock.parseLimit("25:00", NOW).reason, "invalidClock");
	assert.equal(clock.parseLimit("18:75", NOW).reason, "invalidClock");
	assert.equal(clock.parseLimit("0m", NOW).reason, "tooShort");
	assert.equal(clock.parseLimit("25h", NOW).reason, "tooLong");
	assert.equal(clock.parseLimit("soon", NOW).reason, "unknown");
	assert.equal(clock.parseLimit(undefined, NOW).reason, "empty");
});

test("remaining never goes below zero", () => {
	assert.equal(clock.remaining(NOW + 5000, NOW), 5000);
	assert.equal(clock.remaining(NOW - 5000, NOW), 0);
});

test("countdown format", () => {
	assert.equal(clock.formatRemaining(0), "0:00");
	assert.equal(clock.formatRemaining(999), "0:01");
	assert.equal(clock.formatRemaining(59 * 1000), "0:59");
	assert.equal(clock.formatRemaining(42 * MIN + 9000), "42:09");
	assert.equal(clock.formatRemaining(65 * MIN), "1:05:00");
	assert.equal(clock.formatRemaining(-10), "0:00");
});

test("end time as a 24-hour clock", () => {
	assert.equal(clock.formatClock(new Date(2026, 9, 27, 8, 5).getTime()), "08:05");
});

test("warning window is the last five minutes", () => {
	assert.equal(clock.isWarning(5 * MIN), true);
	assert.equal(clock.isWarning(5 * MIN + 1), false);
	assert.equal(clock.isWarning(0), false);
});

test("five more minutes counts from now once time is up", () => {
	assert.equal(clock.extend(NOW - 60 * MIN, NOW), NOW + 5 * MIN);
	assert.equal(clock.extend(NOW + 2 * MIN, NOW), NOW + 7 * MIN);
});
