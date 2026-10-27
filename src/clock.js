// Pure clock logic: no `vscode` here, so it runs under `node --test` with an injected `now`.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MAX_LIMIT = 24 * HOUR;

const CLOCK = /^(\d{1,2}):(\d{2})$/;
const HOURS_MINUTES = /^(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d{1,2})\s*(?:m|min)?)?$/;
const MINUTES = /^(\d+)\s*(?:m|min|mins|minutes|minutos)?$/;

function atClock(match, now) {
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) {
		return { ok: false, reason: "invalidClock" };
	}
	const end = new Date(now);
	end.setHours(hours, minutes, 0, 0);
	if (end.getTime() <= now) {
		end.setDate(end.getDate() + 1);
	}

	return { ok: true, kind: "clock", endsAt: end.getTime() };
}

function afterDuration(ms, now) {
	if (ms <= 0) {
		return { ok: false, reason: "tooShort" };
	}
	if (ms > MAX_LIMIT) {
		return { ok: false, reason: "tooLong" };
	}

	return { ok: true, kind: "duration", endsAt: now + ms };
}

// Accepts «45m», «45», «1h», «1h30», «1.5h», «90 min» or a 24-hour clock «18:30» (tomorrow if already past).
function parseLimit(input, now) {
	const text = String(input ?? "")
		.trim()
		.toLowerCase();
	if (text === "") {
		return { ok: false, reason: "empty" };
	}
	const clock = text.match(CLOCK);
	if (clock) {
		return atClock(clock, now);
	}
	const hm = text.match(HOURS_MINUTES);
	if (hm) {
		const hours = Number(hm[1].replace(",", "."));
		const minutes = hm[2] ? Number(hm[2]) : 0;

		return afterDuration(Math.round(hours * HOUR + minutes * MINUTE), now);
	}
	const m = text.match(MINUTES);
	if (m) {
		return afterDuration(Number(m[1]) * MINUTE, now);
	}

	return { ok: false, reason: "unknown" };
}

function remaining(endsAt, now) {
	return Math.max(0, endsAt - now);
}

// Status-bar countdown: «1:05:00» over an hour, «42:09» under, always to the second.
function formatRemaining(ms) {
	const total = Math.ceil(Math.max(0, ms) / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n) => String(n).padStart(2, "0");

	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// «18:30» for the end time shown in previews and tooltips.
function formatClock(epochMs) {
	const d = new Date(epochMs);

	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isWarning(ms, warnBefore = 5 * MINUTE) {
	return ms > 0 && ms <= warnBefore;
}

function extend(endsAt, now, ms = 5 * MINUTE) {
	return Math.max(endsAt, now) + ms;
}

module.exports = {
	MINUTE,
	HOUR,
	MAX_LIMIT,
	parseLimit,
	remaining,
	formatRemaining,
	formatClock,
	isWarning,
	extend,
};
