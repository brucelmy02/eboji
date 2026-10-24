import { catalogById } from './exercise-catalog.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

/** A local still rendered from the same 3D scene as the player, at phase 1. */
export function exercisePosterHTML(id, { label = '', loading = 'lazy' } = {}) {
  const exercise = catalogById.get(id);
  if (!exercise) return '';
  return `<img class="exercise-poster-image" src="/exercise-posters/${exercise.id}.webp" alt="${escape(label || `${exercise.name}：3D 姿势预览`)}" width="720" height="560" loading="${loading === 'eager' ? 'eager' : 'lazy'}" decoding="async" draggable="false">`;
}
