// Local, manually launched asset exporter. Never mounted by the application.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { exerciseCatalog } from '../public/exercise-catalog.js';
import { getExercise3DSpec } from '../public/exercise-poses-3d.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = join(root, 'public/exercise-posters');
const token = randomBytes(32).toString('hex');
const ids = new Set(exerciseCatalog.map(exercise => exercise.id));
const files = new Map([
  ['/export.js', ['scripts/poster-export.js', 'text/javascript']],
  ...['exercise-renderer-3d.js', 'exercise-poses-3d.js', 'exercise-poses.js', 'exercise-catalog.js', 'vendor/three.module.js', 'vendor/three.core.js'].map(file => [`/${file}`, [`public/${file}`, 'text/javascript']]),
  ...exerciseCatalog.map(({ id }) => [`/exercise-posters/${id}.webp`, [`public/exercise-posters/${id}.webp`, 'image/webp']]),
]);
const saved = new Map();
await mkdir(directory, { recursive: true });
const server = http.createServer(async (req, res) => {
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const respond = (status, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    res.end(body);
  };
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return respond(403, 'Local export only');
    const path = new URL(req.url, origin).pathname;
    if (req.method === 'GET' && path === '/') {
      const page = await readFile(join(root, 'scripts/poster-export.html'), 'utf8');
      return respond(200, page.replace('{{TOKEN}}', token), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && files.has(path)) {
      const [file, type] = files.get(path);
      return respond(200, await readFile(join(root, file)), type);
    }
    const id = path.match(/^\/export\/([a-z0-9-]+)$/)?.[1];
    if (req.method !== 'POST' || !ids.has(id)) return respond(404, 'Not found');
    if (req.headers.origin !== origin || req.headers['x-export-token'] !== token) return respond(403, 'Invalid export session');
    if (req.headers['content-type'] !== 'image/webp') return respond(415, 'WebP required');
    const chunks = []; let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 1024 * 1024) return respond(413, 'Poster too large');
      chunks.push(chunk);
    }
    const image = Buffer.concat(chunks);
    if (image.length < 1000 || image.toString('ascii', 0, 4) !== 'RIFF' || image.toString('ascii', 8, 12) !== 'WEBP') return respond(400, 'Invalid WebP image');
    await writeFile(join(directory, `${id}.webp`), image);
    const spec = getExercise3DSpec(id);
    saved.set(id, { id, phase: 1, phaseLabel: spec.phases[1].label, view: 'three-quarter', width: 720, height: 560, bytes: image.length, sha256: createHash('sha256').update(image).digest('hex') });
    if (saved.size === ids.size) {
      const sources = ['exercise-renderer-3d.js', 'exercise-poses-3d.js', 'exercise-poses.js'];
      const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async file => [file, createHash('sha256').update(await readFile(join(root, 'public', file))).digest('hex')])));
      await writeFile(join(directory, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sourceHashes, posters: exerciseCatalog.map(({ id }) => saved.get(id)) }, null, 2) + '\n');
      console.log(`Saved ${saved.size} 3D posters to public/exercise-posters/`);
    }
    respond(200, 'Saved');
  } catch (error) { respond(500, error.message); }
});
server.listen(0, '127.0.0.1', () => console.log(`Poster exporter: http://127.0.0.1:${server.address().port}`));
