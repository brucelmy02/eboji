import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore, emptyState } from '../lib/store.mjs';
import { makePlan, makeProfile } from './fixtures.mjs';

async function temporaryStore(t) {
  const dir = await mkdtemp(join(tmpdir(), 'eboji-store-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'private-data', 'state.json');
  return { dir, file, store: createStore(file) };
}

test('a missing store starts empty without sharing mutable arrays', async (t) => {
  const { store } = await temporaryStore(t);
  const first = await store.read();
  assert.deepEqual(first, emptyState());
  first.plans.push({ id: 'unsaved' });
  assert.deepEqual(await store.read(), emptyState());
});

test('saved plans and feedback survive a new store instance with private file permissions', async (t) => {
  const { file, store } = await temporaryStore(t);
  const state = {
    ...emptyState(), profile: makeProfile(), activePlanId: 'saved-plan',
    plans: [{ id: 'saved-plan', version: 1, plan: makePlan() }],
    feedback: [{ id: 'saved-feedback', planId: 'saved-plan', replies: [{ answer: '第三组没有完成。' }] }],
  };
  await store.save(state);
  assert.deepEqual(await createStore(file).read(), state);
  const detached = await store.read();
  detached.plans[0].plan.title = '只修改内存';
  assert.deepEqual(await store.read(), state);
  if (process.platform !== 'win32') {
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await stat(join(file, '..'))).mode & 0o777, 0o700);
  }
});

test('failed serialization preserves the saved state and leaves no temporary file', async (t) => {
  const { file, store } = await temporaryStore(t);
  const state = { ...emptyState(), profile: makeProfile() };
  await store.save(state);
  const before = await readFile(file, 'utf8');
  await assert.rejects(store.save({ ...state, unserializable: 1n }), TypeError);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.deepEqual(await readdir(join(file, '..')), ['state.json']);
  const replacement = { ...state, activePlanId: 'new-id' };
  await store.save(replacement);
  assert.deepEqual(await store.read(), replacement);
});

test('corrupt and unsupported saved data is rejected without replacing the file', async (t) => {
  const { file, store } = await temporaryStore(t);
  await store.save(emptyState());
  for (const content of ['{broken', JSON.stringify({ ...emptyState(), schemaVersion: 2 }), JSON.stringify({ ...emptyState(), plans: {} })]) {
    await writeFile(file, content);
    await assert.rejects(store.read());
    assert.equal(await readFile(file, 'utf8'), content);
  }
});
