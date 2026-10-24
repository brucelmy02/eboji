import test from 'node:test';
import assert from 'node:assert/strict';
import { exercisePosterHTML } from '../public/exercise-poster.js';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { exerciseCatalog } from '../public/exercise-catalog.js';
import { getExercise3DSpec } from '../public/exercise-poses-3d.js';

test('every catalog preview exists and was exported from the current 3D scene', async () => {
  const directory = new URL('../public/exercise-posters/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  assert.deepEqual(manifest.posters.map(p => p.id).sort(), exerciseCatalog.map(p => p.id).sort());
  assert.equal((await readdir(directory)).filter(file => file.endsWith('.webp')).length, exerciseCatalog.length);
  for (const [source, hash] of Object.entries(manifest.sourceHashes)) {
    const bytes = await readFile(new URL(`../public/${source}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `Regenerate posters after changing ${source}`);
  }
  for (const poster of manifest.posters) {
    const bytes = await readFile(new URL(`${poster.id}.webp`, directory));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', poster.id);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', poster.id);
    assert.ok(bytes.length > 1000, `${poster.id}: image cannot be empty`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), poster.sha256, poster.id);
    assert.equal(poster.phaseLabel, getExercise3DSpec(poster.id).phases[poster.phase].label);
  }
});

test('unknown IDs cannot create a broken image or request arbitrary paths', () => {
  for (const id of ['missing', '../bodyweight-squat', 'bodyweight-squat.webp', 'bodyweight-squat" onerror="alert(1)', null, undefined]) {
    assert.equal(exercisePosterHTML(id), '');
  }
  assert.match(exercisePosterHTML('bodyweight-squat'), /src="\/exercise-posters\/bodyweight-squat\.webp"/);
});

test('labels stay text and image loading cannot add HTML attributes', () => {
  const html = exercisePosterHTML('bodyweight-squat', {
    label: '深蹲 "动作" <img src=x> & 安全',
    loading: 'eager" onload="alert(1)',
  });
  assert.match(html, /alt="深蹲 &quot;动作&quot; &lt;img src=x&gt; &amp; 安全"/);
  assert.match(html, /loading="lazy"/);
  assert.doesNotMatch(html, /onload|<script|https?:/);
  assert.match(exercisePosterHTML('bodyweight-squat', { loading: 'eager' }), /loading="eager"/);
});
