import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkoutProgress, clearWorkoutProgress } from '../public/workout-progress.js';
import { readWorkoutActivity } from '../public/workout-activity.js';

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

const exercises = [
  { name: '徒手深蹲', sets: 3, reps: '8 次', restSeconds: 60 },
  { name: '墙壁俯卧撑', sets: 1, reps: '6 次', restSeconds: 45 },
];

function setup(overrides = {}) {
  let timestamp = 1_000_000;
  const storage = memoryStorage();
  const config = { planId: 'plan-one', day: 1, exercises, storage, now: () => timestamp, ...overrides };
  return {
    config, storage: config.storage, progress: createWorkoutProgress(config),
    advance(milliseconds) { timestamp += milliseconds; },
    reload() { return createWorkoutProgress(config); },
  };
}

test('begins with independent snapshots, without mutating the prescription', () => {
  const source = structuredClone(exercises);
  const { progress, storage } = setup({ exercises: source });
  assert.deepEqual(progress.getState(), {
    selected: 0,
    exercises: [
      { completed: 0, sets: 3, restUntil: 0, remainingSeconds: 0 },
      { completed: 0, sets: 1, restUntil: 0, remainingSeconds: 0 },
    ],
    completedSets: 0, totalSets: 4, completedExercises: 0,
    allComplete: false, storageAvailable: true, canUndoReset: false,
  });
  const snapshot = progress.getState();
  snapshot.exercises[0].completed = 99;
  snapshot.exercises.push({ completed: 99 });
  snapshot.selected = 4;
  source[0].sets = 99;
  assert.equal(progress.getState().exercises[0].completed, 0);
  assert.equal(progress.getState().exercises[0].sets, 3);
  assert.equal(progress.getState().exercises.length, 2);
  assert.equal(progress.getState().selected, 0);
  assert.equal(storage.length, 0, 'reading an untouched workout does not create a storage record');
});

test('rest blocks duplicate completion, uses real deadlines, and survives refresh', () => {
  const fixture = setup();
  const completed = fixture.progress.completeSet(0);
  assert.equal(completed.exercises[0].completed, 1);
  assert.equal(completed.exercises[0].remainingSeconds, 60);
  assert.equal(completed.exercises[0].restUntil, 1_060_000);
  assert.equal(fixture.progress.completeSet(0).completedSets, 1);
  fixture.advance(1_001);
  assert.equal(fixture.progress.getState().exercises[0].remainingSeconds, 59);
  assert.equal(fixture.reload().getState().exercises[0].remainingSeconds, 59);
  fixture.advance(58_998);
  assert.equal(fixture.progress.getState().exercises[0].remainingSeconds, 1);
  assert.equal(fixture.progress.completeSet(0).completedSets, 1);
  fixture.advance(1);
  assert.equal(fixture.reload().getState().exercises[0].restUntil, 0);
  const next = fixture.progress.completeSet(0);
  assert.equal(next.exercises[0].completed, 2);
  assert.equal(next.exercises[0].remainingSeconds, 60);
  fixture.advance(1_000_000);
  assert.equal(fixture.reload().getState().exercises[0].remainingSeconds, 0);
});

test('one-set and last-set completion never starts another rest or exceeds the prescription', () => {
  const { progress } = setup();
  let state = progress.completeSet(1);
  assert.equal(state.completedExercises, 1);
  assert.equal(state.exercises[1].restUntil, 0);
  assert.equal(progress.completeSet(1).completedSets, 1);
  progress.completeSet(0);
  progress.skipRest(0);
  progress.completeSet(0);
  progress.skipRest(0);
  state = progress.completeSet(0);
  assert.equal(state.exercises[0].completed, 3);
  assert.equal(state.exercises[0].restUntil, 0);
  assert.equal(state.completedSets, 4);
  assert.equal(state.completedExercises, 2);
  assert.equal(state.allComplete, true);
  assert.deepEqual(progress.completeSet(0), state);
});

test('a system-clock rollback cannot create an excessively long rest', () => {
  const fixture = setup();
  fixture.progress.completeSet(0);
  fixture.advance(-120_000);
  const state = fixture.progress.getState();
  assert.equal(state.exercises[0].completed, 1);
  assert.equal(state.exercises[0].remainingSeconds, 0);
  assert.equal(state.exercises[0].restUntil, 0);
});

test('skip rest affects only its card and undo removes one set and its rest', () => {
  const { progress, reload } = setup();
  progress.completeSet(0);
  progress.skipRest(1);
  assert.equal(progress.getState().exercises[0].remainingSeconds, 60);
  progress.skipRest(0);
  assert.equal(reload().getState().exercises[0].restUntil, 0);
  progress.completeSet(0);
  let state = progress.undoSet(0);
  assert.equal(state.exercises[0].completed, 1);
  assert.equal(state.exercises[0].restUntil, 0);
  assert.equal(state.completedSets, 1);
  state = progress.undoSet(0);
  assert.equal(state.completedSets, 0);
  assert.deepEqual(progress.undoSet(0), state, 'undo at zero is a no-op');
  assert.equal(reload().getState().completedSets, 0);
});

test('selection persists and clamps integer boundaries; malformed indexes are no-ops', () => {
  const { progress, reload } = setup();
  assert.equal(progress.select(50).selected, 1);
  assert.equal(reload().getState().selected, 1);
  assert.equal(progress.select(-50).selected, 0);
  for (const invalid of [NaN, Infinity, undefined, null, '1', 0.5]) {
    const before = progress.getState();
    assert.deepEqual(progress.select(invalid), before);
  }
  for (const invalid of [-1, 2, 30, NaN, Infinity, undefined, null, '0', 0.5]) {
    const before = progress.getState();
    assert.deepEqual(progress.completeSet(invalid), before);
    assert.deepEqual(progress.undoSet(invalid), before);
    assert.deepEqual(progress.skipRest(invalid), before);
  }
});

test('plan versions, days, and encoded plan IDs have independent records', () => {
  const fixture = setup({ planId: 'plan:one/1' });
  fixture.progress.completeSet(0);
  for (const config of [
    { planId: 'plan:one/2', day: 1 },
    { planId: 'plan:one/1', day: 2 },
    { planId: 'plan%3Aone%2F1', day: 1 },
  ]) {
    const other = createWorkoutProgress({ ...fixture.config, ...config });
    assert.equal(other.getState().completedSets, 0);
    other.completeSet(1);
  }
  assert.equal(fixture.storage.length, 5, 'four progress records and one shared activity history');
  assert.equal(fixture.reload().getState().exercises[0].completed, 1);
  assert.equal(fixture.reload().getState().exercises[1].completed, 0);
  assert.notEqual(fixture.storage.getItem('eboji:workout:v1:plan%3Aone%2F1:1'), null);
});

test('name, set count, repetitions, rest, and exercise order changes invalidate existing progress', () => {
  const variants = [
    list => { list[0].name = '高脚杯深蹲'; },
    list => { list[0].sets = 4; },
    list => { list[0].reps = '10 次'; },
    list => { list[0].restSeconds = 90; },
    list => { list.reverse(); },
    list => { list.pop(); },
  ];
  for (const modify of variants) {
    const fixture = setup();
    fixture.progress.completeSet(0);
    const changed = structuredClone(exercises);
    modify(changed);
    const fresh = createWorkoutProgress({ ...fixture.config, exercises: changed });
    assert.equal(fresh.getState().completedSets, 0);
    assert.equal(fixture.storage.length, 1, 'invalidated progress is removed while actual training history stays');
    assert.equal(readWorkoutActivity({ storage: fixture.storage }).events.length, 1);
    assert.equal(fixture.reload().getState().completedSets, 0);
  }
});

test('reset keeps a single persistent undo snapshot; repeated reset does not erase it', () => {
  const fixture = setup();
  fixture.progress.completeSet(0);
  fixture.progress.select(1);
  const before = fixture.progress.getState();
  const reset = fixture.progress.reset();
  assert.equal(reset.selected, 0);
  assert.equal(reset.completedSets, 0);
  assert.equal(reset.canUndoReset, true);
  assert.equal(fixture.progress.reset().canUndoReset, true);
  assert.equal(fixture.reload().getState().canUndoReset, true);
  fixture.advance(10_000);
  const restored = fixture.reload().undoReset();
  assert.equal(restored.completedSets, before.completedSets);
  assert.equal(restored.selected, 1);
  assert.equal(restored.exercises[0].remainingSeconds, 50, 'undo does not restart a rest timer');
  assert.equal(restored.canUndoReset, false);
  assert.deepEqual(fixture.reload().undoReset(), restored);
});

test('undo reset drops expired rests and new set activity replaces the old undo opportunity', () => {
  const fixture = setup();
  fixture.progress.completeSet(0);
  fixture.progress.reset();
  fixture.advance(120_000);
  assert.equal(fixture.progress.undoReset().exercises[0].restUntil, 0);
  fixture.progress.reset();
  fixture.progress.select(1);
  assert.equal(fixture.progress.getState().canUndoReset, true, 'browsing other cards keeps the undo available');
  fixture.progress.completeSet(1);
  assert.equal(fixture.progress.getState().canUndoReset, false);
  assert.equal(fixture.progress.undoReset().exercises[1].completed, 1);
  fixture.progress.reset();
  const state = fixture.progress.undoReset();
  assert.equal(state.exercises[0].completed, 0, 'only the most recent reset is available');
  assert.equal(state.exercises[1].completed, 1);
});

test('malformed, out-of-range, incompatible, and oversized stored records safely start fresh', () => {
  const corruptions = [
    () => '{broken json',
    () => 'null',
    () => '[]',
    () => 'x'.repeat(1_000_001),
    record => { record.version = 2; },
    record => { record.state.selected = 99; },
    record => { record.state.exercises.pop(); },
    record => { record.state.exercises[0].completed = 4; },
    record => { record.state.exercises[0].completed = 1.5; },
    record => { record.state.exercises[0].completed = -1; },
    record => { record.state.exercises[0].restUntil = -1; },
    record => { record.state.exercises[0].restUntil = '1060000'; },
    record => { record.state.exercises[0].restUntil = 1_060_001; },
    record => { record.state.exercises[1].restUntil = 1_030_000; },
    record => { record.savedAt = 1_000_001; },
    record => { record.savedAt = -1; },
    record => { record.undo = { selected: 0, exercises: [] }; },
  ];
  for (const corrupt of corruptions) {
    const fixture = setup();
    fixture.progress.completeSet(0);
    const key = 'eboji:workout:v1:plan-one:1';
    const record = JSON.parse(fixture.storage.getItem(key));
    const raw = corrupt(record);
    fixture.storage.setItem(key, typeof raw === 'string' ? raw : JSON.stringify(record));
    const state = fixture.reload().getState();
    assert.equal(state.completedSets, 0);
    assert.equal(state.canUndoReset, false);
    assert.equal(state.storageAvailable, true);
    assert.equal(fixture.storage.getItem(key), null);
    assert.equal(readWorkoutActivity({ storage: fixture.storage }).events.length, 1);
  }
});

test('storage read, write, and removal failures do not interrupt in-memory training', () => {
  const unavailable = {
    getItem() { throw new Error('disabled'); },
    setItem() { throw new Error('disabled'); },
    removeItem() { throw new Error('disabled'); },
  };
  const progress = setup({ storage: unavailable }).progress;
  assert.equal(progress.getState().storageAvailable, false);
  assert.equal(progress.completeSet(0).completedSets, 1);
  assert.equal(progress.reset().canUndoReset, true);
  assert.equal(progress.undoReset().completedSets, 1);

  const full = memoryStorage();
  full.setItem = () => { throw new Error('quota exceeded'); };
  const writeFailure = setup({ storage: full }).progress;
  assert.equal(writeFailure.getState().storageAvailable, true);
  assert.equal(writeFailure.completeSet(1).storageAvailable, false);
  assert.equal(writeFailure.getState().completedSets, 1);

  const damaged = memoryStorage();
  damaged.setItem('eboji:workout:v1:plan-one:1', '{invalid');
  damaged.removeItem = () => { throw new Error('disabled'); };
  const removalFailure = setup({ storage: damaged }).progress;
  assert.equal(removalFailure.getState().storageAvailable, false);
  assert.equal(removalFailure.completeSet(1).completedSets, 1);
  assert.equal(setup({ storage: null }).progress.getState().storageAvailable, false);
});

test('a blocked global localStorage getter is caught before accessing its methods', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const progress = createWorkoutProgress({ planId: 'default', day: 1, exercises });
    assert.equal(progress.getState().storageAvailable, false);
    assert.equal(progress.completeSet(1).completedSets, 1);
    assert.equal(clearWorkoutProgress(), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('clearing workout records preserves unrelated app/browser storage', () => {
  const fixture = setup();
  fixture.progress.completeSet(0);
  createWorkoutProgress({ ...fixture.config, day: 2 }).completeSet(1);
  createWorkoutProgress({ ...fixture.config, planId: 'version-two' }).select(1);
  fixture.storage.setItem('another-app:workout', 'keep');
  fixture.storage.setItem('eboji:profile', 'keep');
  assert.equal(clearWorkoutProgress(fixture.storage), true);
  assert.equal(fixture.storage.length, 2);
  assert.equal(fixture.storage.getItem('another-app:workout'), 'keep');
  assert.equal(fixture.storage.getItem('eboji:profile'), 'keep');
  assert.equal(fixture.reload().getState().completedSets, 0);
  assert.equal(clearWorkoutProgress(null), false);
});

test('empty exercise lists remain usable without falsely claiming a completed workout', () => {
  const { progress } = setup({ exercises: [] });
  const state = progress.getState();
  assert.equal(state.totalSets, 0);
  assert.equal(state.allComplete, false);
  assert.deepEqual(state.exercises, []);
  assert.deepEqual(progress.select(5), state);
  assert.deepEqual(progress.completeSet(0), state);
  assert.deepEqual(progress.reset(), state);
  assert.deepEqual(progress.undoReset(), state);
});

test('zero rest is supported, while invalid configuration is rejected before use', () => {
  const fixture = setup({ exercises: [{ ...exercises[0], sets: 2, restSeconds: 0 }] });
  assert.equal(fixture.progress.completeSet(0).exercises[0].remainingSeconds, 0);
  assert.equal(fixture.progress.completeSet(0).allComplete, true);
  for (const overrides of [
    { planId: '' }, { day: 0 }, { day: 8 }, { exercises: null }, { now: null },
    { exercises: [{ ...exercises[0], sets: 0 }] },
    { exercises: [{ ...exercises[0], sets: Infinity }] },
    { exercises: [{ ...exercises[0], restSeconds: -1 }] },
    { exercises: [{ ...exercises[0], restSeconds: 3_601 }] },
  ]) assert.throws(() => setup(overrides), TypeError);
});
