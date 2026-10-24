const STORAGE_KEY = 'eboji:workout-activity:v1';
const RECORD_VERSION = 1;
const MAX_RECORD_LENGTH = 4_000_000;
const MAX_EVENTS = 20_000;
const MAX_TIMESTAMP = 253_402_300_799_999; // Keep calendar labels within four-digit years.
let fallbackSequence = 0;

function resolveStorage(provided) {
  try {
    const storage = provided === undefined ? globalThis.localStorage : provided;
    return storage && ['getItem', 'setItem', 'removeItem'].every(method => typeof storage[method] === 'function')
      ? storage : null;
  } catch { return null; }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDateLabel(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validEvent(event) {
  if (!isRecord(event) || typeof event.id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(event.id) ||
    !isDateLabel(event.date) || typeof event.createdAt !== 'string' || event.createdAt.length !== 24 ||
    typeof event.planId !== 'string' || !event.planId.trim() || event.planId.length > 512 ||
    !Number.isInteger(event.day) || event.day < 1 || event.day > 7 ||
    !Number.isInteger(event.exerciseIndex) || event.exerciseIndex < 0 || event.exerciseIndex >= 100 ||
    typeof event.exerciseName !== 'string' || event.exerciseName.length > 2_000) return false;
  const timestamp = Date.parse(event.createdAt);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= MAX_TIMESTAMP &&
    new Date(timestamp).toISOString() === event.createdAt &&
    Math.abs(Date.parse(`${event.date}T12:00:00Z`) - timestamp) <= 36 * 60 * 60 * 1000;
}

function copyEvent({ id, date, createdAt, planId, day, exerciseIndex, exerciseName }) {
  return { id, date, createdAt, planId, day, exerciseIndex, exerciseName };
}

function readStorage(storage) {
  if (!storage) return { events: [], storageAvailable: false };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { events: [], storageAvailable: true };
    if (typeof raw !== 'string' || raw.length > MAX_RECORD_LENGTH) return { events: [], storageAvailable: false };
    const record = JSON.parse(raw);
    // Never overwrite an oversized, corrupt, or newer-version history file.
    if (!isRecord(record) || record.version !== RECORD_VERSION || !Array.isArray(record.events) ||
      record.events.length > MAX_EVENTS) return { events: [], storageAvailable: false };
    const seen = new Set();
    const events = [];
    for (const event of record.events) {
      if (!validEvent(event) || seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(copyEvent(event));
    }
    return { events, storageAvailable: true };
  } catch { return { events: [], storageAvailable: false }; }
}

/**
 * Calendar dates are captured in the user's local timezone when each set is done.
 * Reads never restamp old events, including after a timezone or system-clock change.
 */
export function readWorkoutActivity({ storage: providedStorage } = {}) {
  return readStorage(resolveStorage(providedStorage));
}

function saveEvents(storage, events) {
  try {
    const raw = JSON.stringify({ version: RECORD_VERSION, events });
    // A full history remains intact: do not trim old days to fit a new event.
    if (!storage || events.length > MAX_EVENTS || raw.length > MAX_RECORD_LENGTH) return false;
    storage.setItem(STORAGE_KEY, raw);
    return true;
  } catch { return false; }
}

function eventId(timestamp) {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch { /* The bounded fallback also works where crypto is restricted. */ }
  fallbackSequence += 1;
  return `${timestamp.toString(36)}-${fallbackSequence.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/** Internal set-tracker API. Returns null for event if persistence fails. */
export function recordWorkoutActivity({ planId, day, exerciseIndex, exerciseName, storage: providedStorage, now = () => Date.now() }) {
  const storage = resolveStorage(providedStorage);
  const history = readStorage(storage);
  if (!history.storageAvailable) return { event: null, storageAvailable: false };
  try {
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) {
      return { event: null, storageAvailable: false };
    }
    const date = new Date(timestamp);
    const localDate = `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const event = {
      id: eventId(timestamp), date: localDate, createdAt: date.toISOString(),
      planId, day, exerciseIndex, exerciseName,
    };
    if (!validEvent(event) || history.events.some(previous => previous.id === event.id) ||
      !saveEvents(storage, [...history.events, event])) return { event: null, storageAvailable: false };
    return { event: copyEvent(event), storageAvailable: true };
  } catch { return { event: null, storageAvailable: false }; }
}

/** Remove exactly the undone set, keeping other sets, workouts, and dates intact. */
export function removeWorkoutActivity(id, { storage: providedStorage, planId, day, exerciseIndex } = {}) {
  const storage = resolveStorage(providedStorage);
  const history = readStorage(storage);
  if (!history.storageAvailable) return false;
  const events = history.events.filter(event => event.id !== id ||
    (planId !== undefined && event.planId !== planId) ||
    (day !== undefined && event.day !== day) ||
    (exerciseIndex !== undefined && event.exerciseIndex !== exerciseIndex));
  return events.length === history.events.length || saveEvents(storage, events);
}

export function clearWorkoutActivity(providedStorage) {
  const storage = resolveStorage(providedStorage);
  if (!storage) return false;
  try { storage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}
