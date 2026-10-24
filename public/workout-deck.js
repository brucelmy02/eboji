import { findCatalogExercise, bodyPartLabels } from './exercise-catalog.js';
import { exercisePosterHTML } from './exercise-poster.js';
import { createWorkoutProgress } from './workout-progress.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const items = (values) => values.map(value => `<li>${escape(value)}</li>`).join('');
const interactive = 'button, a, input, select, textarea, summary, details, .exercise-demo-host, [contenteditable]';

/** One mounted card and one player at a time; changing sets preserves both. */
export function mountWorkoutDeck(host, { planId, day, onFeedback, onDemosChange = () => {} }) {
  const progress = createWorkoutProgress({ planId, day: day.day, exercises: day.exercises });
  const abort = new AbortController();
  const signal = abort.signal;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let destroyed = false;
  let timer = null;
  let gesture = null;
  let animation = null;
  let lastRemaining = 0;
  let demoOpen = false;
  let suppressClick = false;

  host.classList.add('workout-deck');
  host.innerHTML = `<div class="deck-overview"><div><h2>今天的动作卡组</h2><p>一次专注一个动作，一组一组完成。</p></div><span class="deck-total"></span><progress class="deck-progress" value="0" max="1" aria-label="本次训练完成组数"></progress></div>
    <div class="deck-workspace"><div class="deck-rail" role="group" aria-label="选择动作卡组">${day.exercises.map((exercise, index) => `<button type="button" class="deck-choice" data-deck-action="select" data-deck-index="${index}"><span class="deck-choice-index">${String(index + 1).padStart(2, '0')}</span><strong>${escape(exercise.name)}</strong><small>0 / ${exercise.sets} 组</small></button>`).join('')}</div>
    <div class="deck-stage" tabindex="0" role="group" aria-label="动作卡组，可按左右方向键切换" aria-describedby="deck-gesture-hint"><div class="deck-stack"></div></div></div>
    <p class="deck-gesture-hint" id="deck-gesture-hint">左右拖动卡片切换动作，也可以点箭头。完成一组后再标记。</p>
    <div class="deck-utility"><p class="deck-storage-note"></p><button type="button" class="text-button deck-reset" data-deck-action="reset" hidden>重新开始这一天</button><button type="button" class="text-button deck-undo-reset" data-deck-action="undo-reset" hidden>恢复刚才的进度</button></div>
    <p class="deck-announcement sr-only" role="status" aria-live="polite" aria-atomic="true"></p>`;
  const $ = selector => host.querySelector(selector);
  const stage = $('.deck-stage');
  const stack = $('.deck-stack');
  const rail = $('.deck-rail');
  const announce = message => { if (!destroyed) $('.deck-announcement').textContent = message; };
  const indexNow = () => progress.getState().selected;

  function animateCard(frames, duration = 270) {
    animation?.cancel();
    const card = $('.deck-card');
    if (!card || reduced.matches || typeof card.animate !== 'function') return;
    animation = card.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)' });
    animation.onfinish = () => { animation = null; };
  }

  function renderCard() {
    animation?.cancel();
    const state = progress.getState();
    const index = state.selected;
    const exercise = day.exercises[index];
    const catalog = findCatalogExercise(exercise.name);
    demoOpen = false;
    stack.innerHTML = `<article class="deck-card" aria-labelledby="deck-exercise-title"><header class="deck-card-top"><p class="deck-eyebrow">动作 ${String(index + 1).padStart(2, '0')} <span>/ ${String(day.exercises.length).padStart(2, '0')}</span></p><div class="deck-nav"><button type="button" class="icon-button" data-deck-action="previous" aria-label="上一个动作"${index === 0 ? ' disabled' : ''}>←</button><button type="button" class="icon-button" data-deck-action="next" aria-label="下一个动作"${index === day.exercises.length - 1 ? ' disabled' : ''}>→</button></div></header>
      <div class="deck-card-main"><div class="deck-visual"><div class="deck-poster" aria-hidden="true">${catalog ? exercisePosterHTML(catalog.id, { loading: 'eager' }) : '<span class="deck-poster-fallback">跟随要点<br>慢慢练习</span>'}</div>${catalog ? `<button type="button" class="deck-demo-toggle text-button" data-deck-action="demo" aria-expanded="false" aria-controls="deck-demo">查看 3D 动作示范 <span aria-hidden="true">↗</span></button><div id="deck-demo" class="deck-demo exercise-demo-host" data-demo-id="${catalog.id}" hidden></div>` : '<p class="helper">这个动作暂无动画，请结合动作要点练习。</p>'}</div>
      <div class="deck-copy"><p class="deck-category">${catalog ? `${escape(bodyPartLabels[catalog.bodyPart])} · ${escape(catalog.muscles.slice(0, 2).join(' / '))}` : '按计划练习'}</p><h3 id="deck-exercise-title">${escape(exercise.name)}</h3><div class="deck-prescription"><strong>${escape(exercise.reps)}</strong><span>每组 · 共 ${exercise.sets} 组</span></div><ol class="deck-set-track" aria-label="这个动作的组数进度">${Array.from({ length: exercise.sets }, (_, set) => `<li data-set-index="${set}"><span>${set + 1}</span><small>第 ${set + 1} 组</small></li>`).join('')}</ol><p class="deck-cue">${escape(exercise.cue)}</p>${catalog?.unilateral ? '<p class="helper deck-unilateral">单侧动作，两侧分别完成后再标记这一组。</p>' : ''}
      <div class="deck-action-zone"><p class="deck-status"></p><p class="deck-timer" role="timer" aria-live="off" hidden><strong></strong><span>秒 · 组间休息</span></p><button type="button" class="deck-complete primary" data-deck-action="complete"></button><button type="button" class="deck-skip text-button" data-deck-action="skip-rest" hidden>结束休息</button><button type="button" class="deck-undo text-button" data-deck-action="undo" hidden>撤销上一组</button></div></div></div>
      ${catalog ? `<details class="deck-guide subtle-details"><summary>查看动作步骤与常见错误</summary><div class="detail-body"><ol class="detail-list">${items(catalog.instructions)}</ol><h4>留意这些要点</h4><ul class="detail-list">${items(catalog.cues)}</ul><h4>避免这些做法</h4><ul class="detail-list">${items(catalog.pitfalls)}</ul></div></details>` : ''}
      <footer class="deck-card-footer"><p>这个动作吃力，或有不舒服？</p><button type="button" class="secondary" data-deck-action="feedback">反馈这个动作 <span aria-hidden="true">↗</span></button></footer></article>`;
    lastRemaining = state.exercises[index].remainingSeconds;
    update();
    onDemosChange();
  }

  function update() {
    if (destroyed) return;
    const state = progress.getState();
    const current = state.exercises[state.selected];
    const complete = current.completed === current.sets;
    const resting = current.remainingSeconds > 0;
    $('.deck-total').textContent = `${state.completedSets} / ${state.totalSets} 组已完成`;
    $('.deck-progress').max = state.totalSets;
    $('.deck-progress').value = state.completedSets;
    $('.deck-progress').setAttribute('aria-valuetext', `已完成 ${state.completedSets} 组，共 ${state.totalSets} 组`);
    rail.querySelectorAll('.deck-choice').forEach((button, index) => {
      const item = state.exercises[index];
      button.classList.toggle('is-current', index === state.selected);
      button.classList.toggle('is-complete', item.completed === item.sets);
      button.setAttribute('aria-pressed', String(index === state.selected));
      if (index === state.selected) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      button.querySelector('small').textContent = `${item.completed} / ${item.sets} 组${item.completed === item.sets ? ' · 完成' : ''}`;
    });
    host.querySelectorAll('[data-set-index]').forEach((node, index) => {
      node.classList.toggle('is-done', index < current.completed);
      node.classList.toggle('is-next', !complete && index === current.completed);
      node.querySelector('span').textContent = index < current.completed ? '✓' : String(index + 1);
      node.setAttribute('aria-label', `第 ${index + 1} 组，${index < current.completed ? '已完成' : index === current.completed ? '待完成' : '尚未开始'}`);
    });
    const status = state.allComplete ? '今天的动作都完成了，接下来放松一下。' : complete ? '这个卡组完成了。按自己的节奏继续。' : resting ? `第 ${current.completed} 组已记录，先歇一会儿。` : `第 ${current.completed + 1} 组，准备好了再开始。`;
    if ($('.deck-status').textContent !== status) $('.deck-status').textContent = status;
    $('.deck-timer').hidden = !resting;
    $('.deck-timer strong').textContent = String(current.remainingSeconds);
    const action = $('.deck-complete');
    action.disabled = resting;
    action.textContent = state.allComplete ? '记录训练感受 →' : complete ? '继续下一个卡组 →' : resting ? '休息后继续下一组' : `完成第 ${current.completed + 1} 组 ✓`;
    $('.deck-skip').hidden = !resting;
    $('.deck-undo').hidden = current.completed === 0;
    $('.deck-reset').hidden = state.completedSets === 0;
    $('.deck-undo-reset').hidden = !state.canUndoReset;
    $('.deck-storage-note').textContent = state.storageAvailable ? '进度保存在此浏览器 · 标记组数不消耗 AI 额度' : '浏览器暂时无法保存进度；离开此训练页或刷新后可能丢失。';
    $('.deck-card').classList.toggle('is-complete', complete);
    if (lastRemaining > 0 && !resting && !complete) announce('休息结束，准备好后继续下一组。');
    lastRemaining = current.remainingSeconds;
    const hasRest = state.exercises.some(item => item.remainingSeconds > 0);
    if (hasRest && !timer) timer = window.setInterval(update, 1000);
    if (!hasRest && timer) { clearInterval(timer); timer = null; }
  }

  function revealChoice(behavior = 'instant') {
    const selected = rail.querySelector('.is-current');
    if (!selected || !rail.clientWidth) return;
    const left = selected.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
    if (left < rail.scrollLeft || left + selected.offsetWidth > rail.scrollLeft + rail.clientWidth) rail.scrollTo({ left: Math.max(0, left - 16), behavior });
  }

  function select(index, { direction = 0, focus = false, dragOffset = 0 } = {}) {
    if (destroyed) return;
    const old = indexNow();
    if (index < 0 || index >= day.exercises.length || index === old) return;
    progress.select(index);
    renderCard();
    const travel = direction || Math.sign(index - old);
    animateCard([{ opacity: .35, transform: `translateX(${travel * 32}px) scale(.985)` }, { opacity: 1, transform: 'translateX(0) scale(1)' }], dragOffset ? 320 : 250);
    revealChoice(reduced.matches ? 'instant' : 'smooth');
    if (focus) stage.focus({ preventScroll: true });
    announce(`${day.exercises[index].name}，第 ${index + 1} 个动作，共 ${day.exercises.length} 个。`);
  }

  function toggleDemo() {
    const demo = $('.deck-demo');
    if (!demo) return;
    demoOpen = !demoOpen;
    demo.hidden = !demoOpen;
    $('.deck-poster').hidden = demoOpen;
    const button = $('.deck-demo-toggle');
    button.setAttribute('aria-expanded', String(demoOpen));
    button.textContent = demoOpen ? '收起 3D 示范 ↑' : '查看 3D 动作示范 ↗';
    onDemosChange();
  }

  host.addEventListener('click', (event) => {
    if (suppressClick && event.detail > 0) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
    suppressClick = false;
    const button = event.target.closest('[data-deck-action]');
    if (!button || !host.contains(button) || button.disabled) return;
    const action = button.dataset.deckAction;
    const state = progress.getState();
    const index = state.selected;
    const current = state.exercises[index];
    if (action === 'select') select(Number(button.dataset.deckIndex));
    if (action === 'previous' || action === 'next') select(index + (action === 'next' ? 1 : -1), { focus: true });
    if (action === 'demo') toggleDemo();
    if (action === 'feedback') onFeedback(index);
    if (action === 'complete') {
      if (event.detail > 1) return;
      if (state.allComplete) { onFeedback('all'); return; }
      if (current.completed === current.sets) {
        const next = state.exercises.findIndex((item, i) => i > index && item.completed < item.sets);
        select(next >= 0 ? next : state.exercises.findIndex(item => item.completed < item.sets), { focus: true });
        return;
      }
      if (current.remainingSeconds) return;
      progress.completeSet(index);
      update();
      animateCard([{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)' }, { transform: 'translateY(0)' }], 300);
      const updated = progress.getState().exercises[index];
      announce(`${day.exercises[index].name}，第 ${updated.completed} 组已完成。${updated.completed === updated.sets ? '这个卡组完成了。' : `休息 ${updated.remainingSeconds} 秒。`}`);
      // A disabled completion control cannot retain keyboard focus reliably.
      if (updated.remainingSeconds) $('.deck-undo').focus({ preventScroll: true });
    }
    if (action === 'undo') {
      progress.undoSet(index); lastRemaining = 0; update();
      announce('已撤销上一组，可以重新标记。');
      $('.deck-complete').focus({ preventScroll: true });
    }
    if (action === 'skip-rest') {
      progress.skipRest(index); lastRemaining = 0; update();
      announce('已结束休息，按身体感受决定何时开始。');
      $('.deck-complete').focus({ preventScroll: true });
    }
    if (action === 'reset' || action === 'undo-reset') {
      if (action === 'reset') progress.reset(); else progress.undoReset();
      renderCard(); revealChoice(); stage.focus({ preventScroll: true });
      announce(action === 'reset' ? '这一天已重新开始。可以点恢复刚才的进度撤销。' : '已恢复上一轮进度。');
    }
  }, { signal });
  host.addEventListener('pointerdown', () => { suppressClick = false; }, { capture: true, signal });

  stage.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.target !== stage || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    event.preventDefault(); select(indexNow() + direction, { direction, focus: true });
  }, { signal });

  function clearGesture({ cancel = false } = {}) {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    const card = $('.deck-card');
    if (stage.hasPointerCapture?.(current.id)) stage.releasePointerCapture(current.id);
    card?.classList.remove('is-dragging');
    if (card) card.style.transform = '';
    if (!current.dragging) return;
    suppressClick = true;
    const threshold = Math.min(95, Math.max(48, stage.clientWidth * .14));
    const direction = current.dx < 0 ? 1 : -1;
    const next = indexNow() + direction;
    if (!cancel && Math.abs(current.dx) > threshold && next >= 0 && next < day.exercises.length) select(next, { direction, dragOffset: current.dx, focus: true });
    else animateCard([{ transform: `translateX(${current.visualDx}px) rotate(${current.visualDx / 42}deg)` }, { transform: 'translateX(0) rotate(0)' }], 240);
  }
  stage.addEventListener('pointerdown', event => {
    // Buttons and the 3D camera retain their own gestures and keyboard controls.
    if (gesture || !event.isPrimary || event.button !== 0 || event.target.closest(interactive)) return;
    suppressClick = false;
    animation?.cancel();
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, visualDx: 0, dragging: false };
  }, { signal });
  stage.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
      if (Math.abs(dx) < 9 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      gesture.dragging = true;
      stage.setPointerCapture(event.pointerId);
      $('.deck-card').classList.add('is-dragging');
    }
    event.preventDefault();
    const atEdge = (indexNow() === 0 && dx > 0) || (indexNow() === day.exercises.length - 1 && dx < 0);
    gesture.dx = dx;
    gesture.visualDx = Math.max(-150, Math.min(150, dx * (atEdge ? .2 : .65)));
    $('.deck-card').style.transform = `translateX(${gesture.visualDx}px) rotate(${gesture.visualDx / 42}deg)`;
  }, { signal, passive: false });
  stage.addEventListener('pointerup', event => { if (event.pointerId === gesture?.id) clearGesture(); }, { signal });
  stage.addEventListener('pointercancel', event => { if (event.pointerId === gesture?.id) clearGesture({ cancel: true }); }, { signal });
  stage.addEventListener('lostpointercapture', event => { if (event.pointerId === gesture?.id) clearGesture({ cancel: true }); }, { signal });
  document.addEventListener('visibilitychange', () => { clearGesture({ cancel: true }); update(); }, { signal });
  window.addEventListener('blur', () => clearGesture({ cancel: true }), { signal });
  window.addEventListener('resize', () => revealChoice(), { signal });
  reduced.addEventListener('change', () => { if (reduced.matches) animation?.cancel(); }, { signal });

  renderCard();
  revealChoice();
  return {
    planId, day: day.day,
    getProgress: () => progress.getState(),
    destroy() {
      destroyed = true;
      clearGesture({ cancel: true });
      animation?.cancel();
      abort.abort();
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
