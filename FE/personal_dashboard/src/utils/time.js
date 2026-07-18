// Timezone-aware helpers for calendar/event display.
//
// The backend emits each event occurrence as an ISO-8601 string. Events
// created with a known timezone carry an explicit UTC offset (e.g.
// "2026-07-09T09:00:00-04:00") and represent an absolute instant; legacy
// events have no offset ("2026-07-09T09:00:00") and are treated as "floating"
// wall-clock time shown verbatim. These helpers render either kind in a
// chosen viewer timezone.

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/;

// The browser's detected IANA timezone, used as the default when the account
// has not explicitly chosen one.
export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// True when an ISO string carries an explicit offset (an absolute instant),
// false for a floating/offset-less wall-clock string.
function hasOffset(iso) {
  return OFFSET_RE.test(iso);
}

function parseFloating(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return {
    year: m[1],
    month: m[2],
    day: m[3],
    hour: Number(m[4]),
    minute: Number(m[5])
  };
}

// The YYYY-MM-DD day that an event instant falls on, as seen in `tz`.
// Floating strings return their literal date regardless of `tz`.
export function dayKeyInTz(iso, tz) {
  if (!iso) return null;
  if (!hasOffset(iso)) {
    const f = parseFloating(iso);
    return f ? `${f.year}-${f.month}-${f.day}` : String(iso).slice(0, 10);
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date(iso));
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return String(iso).slice(0, 10);
  }
}

// A short time-of-day label (e.g. "9:00 AM") for an event instant, in `tz`.
export function formatTimeInTz(iso, tz) {
  if (!iso) return "";
  if (!hasOffset(iso)) {
    const f = parseFloating(iso);
    if (!f) return "";
    const d = new Date(f.year, Number(f.month) - 1, f.day, f.hour, f.minute);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz
  });
}

// A "YYYY-MM-DDTHH:mm" value for a <input type="datetime-local">, rendering an
// event instant as its wall-clock time in `tz`. Floating (offset-less) strings
// are returned verbatim so they round-trip unchanged.
export function toDatetimeLocalInTz(iso, tz) {
  if (!iso) return "";
  if (!hasOffset(iso)) {
    const f = parseFloating(iso);
    if (!f) return String(iso).slice(0, 16);
    const pad = (n) => String(n).padStart(2, "0");
    return `${f.year}-${f.month}-${f.day}T${pad(f.hour)}:${pad(f.minute)}`;
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(iso));
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return String(iso).slice(0, 16);
  }
}

// A short zone abbreviation (e.g. "EDT") for `tz` on `date`, for labelling.
export function tzAbbrev(tz, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short"
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || tz;
  } catch {
    return tz;
  }
}

// The full list of IANA zones the browser knows, with a curated fallback for
// older engines that lack Intl.supportedValuesOf.
export function allTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone");
    }
  } catch {
    // fall through
  }
  return [
    "Pacific/Honolulu",
    "America/Anchorage",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Halifax",
    "America/Sao_Paulo",
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Moscow",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland"
  ];
}
