import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createWorkoutProgress, clearWorkoutProgress } from '../public/workout-progress.js';
import { readWorkoutActivity, recordWorkoutActivity, removeWorkoutActivity, clearWorkoutActivity } from '../public/workout-activity.js';

const ACTIVITY_KEY = 'eboji:workout-activity:v1';
const PROGRESS_KEY = 'eboji:workout:v1:plan-one:1';
const exercises = [
  { name: '徒手深蹲', sets: 3, reps: '8 次', restSeconds: 60 },
  { name: '墙壁俯卧撑', sets: 1, reps: '6 次', restSeconds: 45 },
];

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function fixture() {
  let timestamp = new Date(2026, 9, 23, 23, 59, 59).getTime();
  const storage = memoryStorage();
  const config = { planId: 'plan-one', day: 1, exercises, storage, now: () => timestamp };
  return {
    config, storage, progress: createWorkoutProgress(config),
    advance(milliseconds) { timestamp += milliseconds; },
    reload() { return createWorkoutProgress(config); },
    events() { return readWorkoutActivity({ storage }).events; },
  };
}

test('only actual set completion creates dated activity; repeated and blocked completions do not', () => {
  const f = fixture();
  assert.deepEqual(readWorkoutActivity({ storage: f.storage }), { events: [], storageAvailable: true });
  f.progress.select(1);
  f.progress.reset();
  f.progress.undoSet(0);
  f.progress.skipRest(0);
  assert.equal(f.events().length, 0);
  f.progress.completeSet(0);
  f.progress.completeSet(0);
  f.progress.completeSet(-1);
  const [event] = f.events();
  assert.equal(f.events().length, 1);
  assert.deepEqual({ ...event, id: 'ignored' }, {
    id: 'ignored', date: '2026-10-23', createdAt: new Date(2026, 9, 23, 23, 59, 59).toISOString(),
    planId: 'plan-one', day: 1, exerciseIndex: 0, exerciseName: '徒手深蹲',
  });
  f.progress.completeSet(1);
  f.progress.completeSet(1);
  assert.equal(f.events().length, 2);
  assert.notEqual(f.events()[0].id, f.events()[1].id);
  assert.equal('eventIds' in f.progress.getState().exercises[0], false, 'public progress shape remains unchanged');
});

test('midnight splits activity by local action date and undo removes the original dated event', () => {
  const f = fixture();
  f.progress.completeSet(0);
  const firstId = f.events()[0].id;
  f.advance(61_000);
  f.progress.completeSet(0);
  assert.deepEqual(f.events().map(event => event.date), ['2026-10-23', '2026-10-24']);
  const restored = f.reload();
  restored.undoSet(0);
  assert.deepEqual(f.events().map(event => event.id), [firstId]);
  restored.undoSet(0);
  assert.deepEqual(f.events(), []);
  assert.equal(f.reload().getState().completedSets, 0);
});

test('reset and repeated training preserve history; undo reset reuses event IDs without double counting', () => {
  const f = fixture();
  f.progress.completeSet(1);
  const firstId = f.events()[0].id;
  f.progress.reset();
  f.progress.reset();
  assert.equal(f.events().length, 1);
  const restored = f.reload();
  restored.undoReset();
  assert.equal(f.events().length, 1);
  assert.equal(restored.getState().completedSets, 1);
  restored.undoSet(1);
  assert.equal(f.events().length, 0);
  restored.completeSet(1);
  const secondId = f.events()[0].id;
  assert.notEqual(firstId, secondId);
  restored.reset();
  f.advance(24 * 60 * 60 * 1000);
  const repeated = f.reload();
  repeated.completeSet(1);
  assert.deepEqual(f.events().map(event => event.date), ['2026-10-23', '2026-10-24']);
  repeated.undoSet(1);
  assert.deepEqual(f.events().map(event => event.id), [secondId], 'undo the new round leaves the previous round intact');
  assert.equal(repeated.getState().canUndoReset, false);
});

test('legacy v1 progress and reset snapshots remain usable without fabricating training dates', () => {
  const f = fixture();
  f.progress.completeSet(0);
  f.progress.reset();
  const legacy = JSON.parse(f.storage.getItem(PROGRESS_KEY));
  for (const snapshot of [legacy.state, legacy.undo]) {
    for (const exercise of snapshot.exercises) delete exercise.eventIds;
  }
  f.storage.setItem(PROGRESS_KEY, JSON.stringify(legacy));
  clearWorkoutActivity(f.storage);
  const restored = f.reload();
  assert.equal(restored.getState().canUndoReset, true);
  assert.equal(restored.undoReset().completedSets, 1);
  assert.deepEqual(f.events(), []);
  restored.skipRest(0);
  restored.completeSet(0);
  assert.equal(f.events().length, 1, 'only the newly completed set has a date');
  const reloaded = f.reload();
  assert.equal(reloaded.getState().completedSets, 2);
  reloaded.undoSet(0);
  assert.equal(f.events().length, 0);
  assert.equal(reloaded.undoSet(0).completedSets, 0, 'undated legacy sets can still be undone');
});

test('different plans, days, and exercises keep independent dated events', () => {
  const f = fixture();
  f.progress.completeSet(0);
  const dayTwo = createWorkoutProgress({ ...f.config, day: 2 });
  const nextPlan = createWorkoutProgress({ ...f.config, planId: 'plan-two' });
  dayTwo.completeSet(0);
  nextPlan.completeSet(1);
  f.progress.undoSet(0);
  assert.deepEqual(f.events().map(({ planId, day, exerciseIndex }) => ({ planId, day, exerciseIndex })), [
    { planId: 'plan-one', day: 2, exerciseIndex: 0 },
    { planId: 'plan-two', day: 1, exerciseIndex: 1 },
  ]);
  f.storage.setItem('other-app', 'keep');
  assert.equal(clearWorkoutProgress(f.storage), true);
  assert.deepEqual(f.events(), []);
  assert.equal(f.storage.length, 1);
  assert.equal(f.storage.getItem('other-app'), 'keep');
});

test('corrupt event IDs cannot remove an event belonging to another plan or exercise', () => {
  const f = fixture();
  f.progress.completeSet(0);
  f.progress.completeSet(1);
  const secondId = f.events()[1].id;
  const progress = JSON.parse(f.storage.getItem(PROGRESS_KEY));
  progress.state.exercises[0].eventIds = [secondId];
  f.storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  f.reload().undoSet(0);
  assert.equal(f.events().length, 2);
  assert.equal(removeWorkoutActivity(secondId, { storage: f.storage, planId: 'other-plan' }), true);
  assert.equal(f.events().length, 2);
});

test('local calendar dates stay correct in positive and negative UTC offsets and after timezone changes', () => {
  const moduleUrl = new URL('../public/workout-activity.js', import.meta.url).href;
  const script = `
    import { recordWorkoutActivity, readWorkoutActivity } from ${JSON.stringify(moduleUrl)};
    const data = new Map();
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value), removeItem: key => data.delete(key) };
    const {event} = recordWorkoutActivity({ planId:'p', day:1, exerciseIndex:0, exerciseName:'深蹲', storage, now:()=>Date.parse(process.env.TEST_TIME) });
    process.env.TZ = 'UTC';
    process.stdout.write(JSON.stringify({ event, reread: readWorkoutActivity({storage}).events[0] }));
  `;
  for (const [zone, instant, expected] of [
    ['Asia/Shanghai', '2026-10-23T17:00:00.000Z', '2026-10-24'],
    ['America/Los_Angeles', '2026-10-23T03:00:00.000Z', '2026-10-22'],
    ['America/New_York', '2026-11-01T05:30:00.000Z', '2026-11-01'],
    ['America/New_York', '2026-11-01T06:30:00.000Z', '2026-11-01'],
  ]) {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: zone, TEST_TIME: instant }, encoding: 'utf8',
    }));
    assert.equal(result.event.date, expected);
    assert.deepEqual(result.event, result.reread, 'travel does not shift an existing training day');
  }
});

test('read snapshots are isolated; invalid entries and duplicate IDs cannot create extra training days', () => {
  const f = fixture();
  f.progress.completeSet(0);
  const [event] = f.events();
  f.storage.setItem(ACTIVITY_KEY, JSON.stringify({ version: 1, events: [
    event, event, { ...event, id: 'bad-date', date: '2026-02-30' },
    { ...event, id: 'unrelated-date', date: '2000-01-01' },
    { ...event, id: 'bad-timestamp', createdAt: 'nonsense' },
    { ...event, id: 'bad-day', day: 8 }, null,
  ] }));
  const read = readWorkoutActivity({ storage: f.storage });
  assert.equal(read.storageAvailable, true);
  assert.deepEqual(read.events, [event]);
  read.events[0].date = '1900-01-01';
  read.events.push({});
  assert.deepEqual(f.events(), [event]);
  f.progress.completeSet(1);
  assert.equal(f.events().length, 2, 'valid history survives a later write');
});

test('broken, future-version, oversized, or blocked storage is never overwritten and never stops training', () => {
  for (const raw of ['{broken', 'null', JSON.stringify({ version: 2, events: [] }), ' '.repeat(4_000_001),
    JSON.stringify({ version: 1, events: Array(20_001).fill(null) })]) {
    const f = fixture();
    f.storage.setItem(ACTIVITY_KEY, raw);
    assert.equal(readWorkoutActivity({ storage: f.storage }).storageAvailable, false);
    const completed = f.progress.completeSet(1);
    assert.equal(completed.completedSets, 1);
    assert.equal(completed.storageAvailable, false);
    assert.equal(f.storage.getItem(ACTIVITY_KEY), raw);
    assert.equal(f.progress.undoSet(1).completedSets, 0);
  }
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  assert.deepEqual(readWorkoutActivity({ storage: blocked }), { events: [], storageAvailable: false });
  assert.equal(clearWorkoutActivity(blocked), false);
  assert.equal(removeWorkoutActivity('missing', { storage: blocked }), false);
  assert.equal(recordWorkoutActivity({ storage: null }).storageAvailable, false);
});

test('write and undo failures keep existing history intact and report unavailable persistence', () => {
  const f = fixture();
  f.progress.completeSet(0);
  const oldRaw = f.storage.getItem(ACTIVITY_KEY);
  const write = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    if (key === ACTIVITY_KEY) throw Error('quota exceeded');
    write(key, value);
  };
  assert.equal(f.progress.completeSet(1).storageAvailable, false);
  assert.equal(f.progress.getState().completedSets, 2);
  assert.equal(f.storage.getItem(ACTIVITY_KEY), oldRaw);
  assert.equal(f.progress.undoSet(0).storageAvailable, false);
  assert.equal(f.storage.getItem(ACTIVITY_KEY), oldRaw);
});

test('history at its size limit stays intact instead of silently dropping old events', () => {
  const f = fixture();
  f.progress.completeSet(0);
  const template = f.events()[0];
  // Long but valid names fill the serialized storage budget with fewer records.
  const events = Array.from({ length: 1_750 }, (_, index) => ({ ...template, id: `set-${index}`, exerciseName: '深'.repeat(2_000) }));
  const raw = JSON.stringify({ version: 1, events });
  assert.ok(raw.length < 4_000_000);
  f.storage.setItem(ACTIVITY_KEY, raw);
  let available = true;
  for (let index = 0; index < 150 && available; index += 1) {
    available = recordWorkoutActivity({ planId: 'p', day: 1, exerciseIndex: 0,
      exerciseName: '深'.repeat(2_000), storage: f.storage, now: f.config.now }).storageAvailable;
  }
  assert.equal(available, false);
  const retained = f.events();
  assert.ok(retained.length >= events.length);
  assert.deepEqual(retained.slice(0, events.length), events);
});

test('blocked default localStorage access is caught without leaking an exception', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('SecurityError'); } });
  try {
    assert.deepEqual(readWorkoutActivity(), { events: [], storageAvailable: false });
    assert.equal(clearWorkoutActivity(), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
