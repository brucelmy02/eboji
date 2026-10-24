import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const emptyState = () => ({ schemaVersion: 1, profile: null, activePlanId: null, plans: [], feedback: [] });

// The HTTP server serializes mutations. Atomic replacement preserves the previous
// saved version if the process is interrupted during a write.
export function createStore(file) {
  return {
    async read() {
      try {
        const state = JSON.parse(await readFile(file, 'utf8'));
        if (state.schemaVersion !== 1 || !Array.isArray(state.plans) || !Array.isArray(state.feedback)) throw new Error('Unsupported local data');
        return state;
      } catch (error) {
        if (error.code === 'ENOENT') return emptyState();
        throw error;
      }
    },
    async save(state) {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
        await rename(temp, file);
      } finally {
        await rm(temp, { force: true });
      }
      return state;
    },
  };
}
