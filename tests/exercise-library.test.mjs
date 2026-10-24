import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exerciseIllustrations, findExerciseIllustration } from '../public/exercise-library.js';
import { createApp } from '../server.mjs';

test('illustrations distinguish supported movements from other variations', () => {
  assert.equal(findExerciseIllustration('徒手深蹲').id, 'bodyweight-squat');
  assert.equal(findExerciseIllustration('  KNEE   PUSH-UP  ').id, 'knee-push-up');
  assert.equal(findExerciseIllustration('仰卧臀桥').id, 'glute-bridge');
  for (const name of ['深蹲', '徒手浅蹲', '哑铃深蹲', '靠墙俯卧撑', '标准俯卧撑', '跪姿窄距俯卧撑', '单腿臀桥', '杠铃臀桥', '俯卧W形抬臂', '臀桥或深蹲', '__proto__', '', null, {}]) {
    assert.equal(findExerciseIllustration(name), null, String(name));
  }
});

test('every illustration has local static frames and attribution', async () => {
  const ids = new Set();
  const aliases = new Set();
  for (const item of exerciseIllustrations) {
    assert.ok(!ids.has(item.id));
    ids.add(item.id);
    assert.equal(item.frames.length, 2);
    for (const alias of item.aliases) {
      assert.ok(!aliases.has(alias));
      aliases.add(alias);
    }
    assert.equal(item.credit.name, 'eboji 动作示意');
    assert.equal(item.credit.url, '/exercises/ATTRIBUTION.md');
    for (const frame of item.frames) {
      assert.match(frame.src, /^\/exercises\/[a-z-]+\.svg$/);
      assert.ok(frame.label && frame.alt);
      const svg = await readFile(new URL(`../public${frame.src}`, import.meta.url), 'utf8');
      assert.match(svg, /<svg\b/);
      assert.match(svg, /viewBox=/);
      assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|\son\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i);
    }
  }
  const attribution = await readFile(new URL('../public/exercises/ATTRIBUTION.md', import.meta.url), 'utf8');
  assert.match(attribution, /原创/);
  for (const id of ids) assert.ok(attribution.includes(id));
});

test('only catalog assets are served, with SVG and module content types', async (t) => {
  const server = createApp({
    generate: async () => { throw new Error('AI must not run for images'); },
    analyze: async () => { throw new Error('AI must not run for images'); },
  });
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const item of exerciseIllustrations) {
    for (const frame of item.frames) {
      const response = await fetch(origin + frame.src);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^image\/svg\+xml/);
      assert.match(await response.text(), /<svg\b/);
    }
  }
  for (const path of ['/exercise-library.js', '/exercise-catalog.js', '/exercise-poster.js', '/exercise-poses.js', '/exercise-animation.js', '/exercise-poses-3d.js', '/exercise-renderer-3d.js', '/vendor/three.module.js', '/vendor/three.core.js']) {
    const module = await fetch(origin + path);
    assert.equal(module.status, 200, path);
    assert.match(module.headers.get('content-type'), /^text\/javascript/);
  }
  const stylesheet = await fetch(origin + '/exercise-catalog.css');
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /^text\/css/);
  assert.equal((await fetch(origin + '/exercises/ATTRIBUTION.md')).status, 200);
  const poster = await fetch(origin + '/exercise-posters/bodyweight-squat.webp');
  assert.equal(poster.status, 200);
  assert.equal(poster.headers.get('content-type'), 'image/webp');
  assert.equal(Buffer.from(await poster.arrayBuffer()).toString('ascii', 8, 12), 'WEBP');
  for (const path of ['/exercise-posters/unknown.webp', '/exercise-posters/manifest.json', '/exercise-posters/%2e%2e%2fserver.mjs', '/export/bodyweight-squat', '/export.js']) assert.equal((await fetch(origin + path)).status, 404, path);
  for (const path of ['/exercises/unknown.svg', '/exercises/%2e%2e%2f.eboji%2fstate.json', '/exercises/%2e%2e%2fserver.mjs']) {
    assert.equal((await fetch(origin + path)).status, 404);
  }
});
