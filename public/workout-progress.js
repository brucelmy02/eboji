import { recordWorkoutActivity, removeWorkoutActivity, clearWorkoutActivity } from './workout-activity.js';

const STORAGE_PREFIX = 'eboji:workout:v1:';
const RECORD_VERSION = 1;
const MAX_RECORD_LENGTH = 1_000_000;
const MAX_FINGERPRINT_LENGTH = 50_000;
const MAX_EXERCISES = 100;
const MAX_REST_SECONDS = 3_600;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveStorage(provided) {
  try {
    const storage = provided === undefined ? globalThis.localStorage : provided;
    return storage && ['getItem', 'setItem', 'removeItem'].every(method => typeof storage[method] === 'function')
      ? storage : null;
  } catch {
    // Some browsers throw even when the localStorage property is accessed.
    return null;
  }
}

function cloneSnapshot(snapshot) {
  return { selected: snapshot.selected, exercises: snapshot.exercises.map(exercise => ({ ...exercise, eventIds: [...exercise.eventIds] })) };
}

/**
 * Local, per-plan/day set tracking. Every operation returns an isolated snapshot.
 * No timer is owned here: the UI decides when to read the remaining rest time.
 */
export function createWorkoutProgress({ planId, day, exercises, storage: providedStorage, now = () => Date.now() }) {
  if (typeof planId !== 'string' || !planId.trim() || planId.length > 512) {
    throw new TypeError('Workout progress requires a plan ID.');
  }
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    throw new TypeError('Workout progress requires a day from 1 to 7.');
  }
  if (!Array.isArray(exercises) || exercises.length > MAX_EXERCISES || typeof now !== 'function') {
    throw new TypeError('Workout progress requires an exercise list and clock.');
  }
  const prescription = exercises.map(exercise => {
    if (!isRecord(exercise) || typeof exercise.name !== 'string' || exercise.name.length > 2_000 ||
      typeof exercise.reps !== 'string' || exercise.reps.length > 2_000 ||
      !Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 100 ||
      !Number.isInteger(exercise.restSeconds) || exercise.restSeconds < 0 || exercise.restSeconds > MAX_REST_SECONDS) {
      throw new TypeError('Invalid workout exercise.');
    }
    return { name: exercise.name, sets: exercise.sets, reps: exercise.reps, restSeconds: exercise.restSeconds };
  });
  // Exact serialization avoids hash collisions; order and dosage both matter.
  const fingerprint = JSON.stringify(prescription);
  if (JSON.stringify(fingerprint).length > MAX_FINGERPRINT_LENGTH) {
    throw new TypeError('Workout prescription is too large to store.');
  }
  const key = `${STORAGE_PREFIX}${encodeURIComponent(planId)}:${day}`;
  const storage = resolveStorage(providedStorage);
  let storageAvailable = Boolean(storage);
  let activityStorageAvailable = true;
  let undo = null;
  const emptySnapshot = () => ({
    selected: 0,
    exercises: prescription.map(() => ({ completed: 0, restUntil: 0, eventIds: [] })),
  });
  let state = emptySnapshot();

  function currentTime() {
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > Number.MAX_SAFE_INTEGER - MAX_REST_SECONDS * 1000) {
      throw new TypeError('Workout clock must return a valid timestamp.');
    }
    return timestamp;
  }

  function validSnapshot(snapshot, savedAt, timestamp) {
    if (!isRecord(snapshot) || !Number.isInteger(snapshot.selected) || snapshot.selected < 0 ||
      snapshot.selected > Math.max(0, prescription.length - 1) ||
      !Array.isArray(snapshot.exercises) || snapshot.exercises.length !== prescription.length) return false;
    return snapshot.exercises.every((exercise, index) => {
      const { sets, restSeconds } = prescription[index];
      if (!isRecord(exercise) || !Number.isInteger(exercise.completed) || exercise.completed < 0 || exercise.completed > sets ||
        !Number.isSafeInteger(exercise.restUntil) || exercise.restUntil < 0) return false;
      if (exercise.restUntil === 0) return true;
      return exercise.completed > 0 && exercise.completed < sets && restSeconds > 0 &&
        exercise.restUntil <= savedAt + restSeconds * 1000 &&
        exercise.restUntil <= timestamp + restSeconds * 1000;
    });
  }

  function cleanSnapshot(snapshot, timestamp) {
    // Copy only supported fields, never arbitrary fields from stored objects.
    return {
      selected: snapshot.selected,
      exercises: snapshot.exercises.map(({ completed, restUntil, eventIds }) => ({
        completed, restUntil: restUntil > timestamp ? restUntil : 0,
        // v1 progress predates dated activity. Keep those sets without inventing dates.
        eventIds: Array.from({ length: completed }, (_, index) =>
          Array.isArray(eventIds) && typeof eventIds[index] === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(eventIds[index])
            ? eventIds[index] : null),
      })),
    };
  }

  function discardStored() {
    try { storage.removeItem(key); } catch { storageAvailable = false; }
  }

  if (storageAvailable) {
    try {
      const raw = storage.getItem(key);
      if (raw !== null) {
        const timestamp = currentTime();
        const record = typeof raw === 'string' && raw.length <= MAX_RECORD_LENGTH ? JSON.parse(raw) : null;
        if (isRecord(record) && record.version === RECORD_VERSION && record.fingerprint === fingerprint &&
          Number.isSafeInteger(record.savedAt) && record.savedAt >= 0 && record.savedAt <= timestamp &&
          validSnapshot(record.state, record.savedAt, timestamp) &&
          (record.undo === null || validSnapshot(record.undo, record.savedAt, timestamp))) {
          state = cleanSnapshot(record.state, timestamp);
          undo = record.undo === null ? null : cleanSnapshot(record.undo, timestamp);
        } else {
          discardStored();
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError) discardStored();
      else storageAvailable = false;
    }
  }

  function expireRest(timestamp) {
    state.exercises.forEach((exercise, index) => {
      // A system-clock rollback must not turn a short rest into hours or days.
      if (exercise.restUntil <= timestamp || exercise.restUntil > timestamp + prescription[index].restSeconds * 1000) {
        exercise.restUntil = 0;
      }
    });
  }

  function save(timestamp) {
    if (!storageAvailable) return;
    try {
      const raw = JSON.stringify({ version: RECORD_VERSION, fingerprint, savedAt: timestamp, state, undo });
      if (raw.length > MAX_RECORD_LENGTH) { storageAvailable = false; return; }
      storage.setItem(key, raw);
    } catch {
      storageAvailable = false;
    }
  }

  function getState() {
    const timestamp = currentTime();
    expireRest(timestamp);
    let completedSets = 0;
    let totalSets = 0;
    let completedExercises = 0;
    const snapshot = state.exercises.map((exercise, index) => {
      const sets = prescription[index].sets;
      completedSets += exercise.completed;
      totalSets += sets;
      if (exercise.completed === sets) completedExercises += 1;
      return { completed: exercise.completed, restUntil: exercise.restUntil, sets, remainingSeconds: Math.ceil(Math.max(0, exercise.restUntil - timestamp) / 1000) };
    });
    return {
      selected: state.selected, exercises: snapshot, completedSets, totalSets, completedExercises,
      allComplete: totalSets > 0 && completedSets === totalSets,
      storageAvailable: storageAvailable && activityStorageAvailable, canUndoReset: undo !== null,
    };
  }

  function hasIndex(index) {
    return Number.isInteger(index) && index >= 0 && index < prescription.length;
  }

  function select(index) {
    if (!Number.isInteger(index) || prescription.length === 0) return getState();
    const selected = Math.max(0, Math.min(index, prescription.length - 1));
    if (selected !== state.selected) {
      state.selected = selected;
      save(currentTime());
    }
    return getState();
  }

  function completeSet(index) {
    const timestamp = currentTime();
    expireRest(timestamp);
    if (!hasIndex(index)) return getState();
    const exercise = state.exercises[index];
    const { sets, restSeconds } = prescription[index];
    if (exercise.completed >= sets || exercise.restUntil > timestamp) return getState();
    exercise.completed += 1;
    const activity = recordWorkoutActivity({
      planId, day, exerciseIndex: index, exerciseName: prescription[index].name,
      storage, now: () => timestamp,
    });
    exercise.eventIds.push(activity.event?.id ?? null);
    activityStorageAvailable = activity.storageAvailable;
    exercise.restUntil = exercise.completed < sets && restSeconds > 0 ? timestamp + restSeconds * 1000 : 0;
    undo = null;
    save(timestamp);
    return getState();
  }

  function undoSet(index) {
    if (!hasIndex(index) || state.exercises[index].completed === 0) return getState();
    state.exercises[index].completed -= 1;
    const id = state.exercises[index].eventIds.pop();
    if (id !== null && id !== undefined) {
      activityStorageAvailable = removeWorkoutActivity(id, { storage, planId, day, exerciseIndex: index });
    }
    state.exercises[index].restUntil = 0;
    undo = null;
    save(currentTime());
    return getState();
  }

  function skipRest(index) {
    const timestamp = currentTime();
    expireRest(timestamp);
    if (!hasIndex(index) || state.exercises[index].restUntil === 0) return getState();
    state.exercises[index].restUntil = 0;
    undo = null;
    save(timestamp);
    return getState();
  }

  function reset() {
    const timestamp = currentTime();
    expireRest(timestamp);
    // Repeated resets must not erase the previous session's undo snapshot.
    if (state.exercises.some(exercise => exercise.completed > 0)) undo = cloneSnapshot(state);
    state = emptySnapshot();
    save(timestamp);
    return getState();
  }

  function undoReset() {
    if (undo === null) return getState();
    const timestamp = currentTime();
    state = cleanSnapshot(undo, timestamp);
    undo = null;
    save(timestamp);
    return getState();
  }

  return { getState, select, completeSet, undoSet, skipRest, reset, undoReset };
}

/** Remove only this feature's records; return false when browser storage is unavailable. */
export function clearWorkoutProgress(providedStorage) {
  const storage = resolveStorage(providedStorage);
  if (!storage) return false;
  const activityCleared = clearWorkoutActivity(storage);
  try {
    if (typeof storage.key !== 'function' || !Number.isSafeInteger(storage.length) || storage.length < 0) return false;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return activityCleared;
  } catch {
    return false;
  }
}
