'use strict';

import { exerciseCatalog, findCatalogExercise, bodyPartLabels, equipmentLabels, levelLabels } from './exercise-catalog.js';
import { mountExerciseAnimation } from './exercise-animation.js';
import { exercisePosterHTML } from './exercise-poster.js';
import { presetPlans, findPresetPlan } from './preset-plans.js';
import { mountWorkoutDeck } from './workout-deck.js';
import { clearWorkoutProgress, createWorkoutProgress } from './workout-progress.js';
import { mountTrainingCalendar } from './training-calendar.js';
import { reveal, revealGroup, dismiss, openSheet, closeSheet, initDisclosures, cancelMotion } from './motion.js';

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const list = (items = []) => items.map((item) => `<li>${esc(item)}</li>`).join('');
const form = $('#profile-form');
const dialog = $('#feedback-dialog');
const feedbackBody = $('#feedback-body');
const labels = {
  sex: { male: '男性', female: '女性', unspecified: '暂不填写' },
  goal: { definition: '力量与线条', fitness: '体能与状态', habit: '养成运动习惯' },
  experience: { beginner: '刚刚开始', returning: '有基础，最近不规律', regular: '规律训练' },
  equipment: { bodyweight: '徒手，无器械', dumbbells: '在家，有哑铃', gym: '健身房' },
  health: { none: '无已知运动限制', needs_review: '有疼痛、伤病或医生限制' },
  effort: { easy: '偏轻松', right: '刚刚好', hard: '偏吃力' },
  discomfort: { none: '无明显不适', soreness: '肌肉酸胀 / 酸痛', pain: '疼痛或其他不适' },
  analysis: { advice: 'AI 给你的建议', clarify: '再了解一点，就更清楚', adjustment: '下一次，可以这样调整', needs_review: '先确认身体状况' },
};
let state = { profile: null, activePlanId: null, plans: [], feedback: [] };
let connection = { ready: false, token: '', message: '需要 AI 时，可以检查本机 Codex 连接。' };
let loaded = false;
let pending = null;
let currentDay = 1;
let setupStep = 1;
let toastTimer;
let lastHash = '';
let renderedPlanId = null;
let toastVersion = 0;
const feedbackDrafts = new Map();
const replyDrafts = new Map();
const entryErrors = new Map();
const exerciseDemos = new Map();
let sessionDeck = null;
let trainingCalendar = null;
const libraryFilters = { query: '', bodyPart: '', equipment: '', level: '' };
// Start browsing with different body regions before the longer lists of variants.
const libraryHighlights = ['bodyweight-squat', 'knee-push-up', 'glute-bridge', 'dumbbell-bent-over-row', 'dumbbell-overhead-press', 'dead-bug', 'dumbbell-biceps-curl', 'bird-dog', 'march-in-place', 'cat-cow'];
const libraryOrder = new Map(libraryHighlights.map((id, index) => [id, index]));
const browsableExercises = [...exerciseCatalog].sort((a, b) => (libraryOrder.get(a.id) ?? libraryHighlights.length) - (libraryOrder.get(b.id) ?? libraryHighlights.length));
let libraryLimit = 24;
let libraryScroll = 0;
let dialogDraftKey = null;
let dialogEntryId = null;

const activeRecord = () => state.plans.find((record) => record.id === state.activePlanId);
const presetNeedsReview = () => state.profile?.health === 'needs_review' || activeRecord()?.plan.status === 'needs_review';
function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
function toast(message) {
  const version = ++toastVersion;
  clearTimeout(toastTimer);
  const node = $('#toast');
  cancelMotion(node);
  node.textContent = message;
  node.hidden = false;
  toastTimer = setTimeout(async () => {
    const completed = await dismiss(node);
    if (completed && version === toastVersion) node.hidden = true;
  }, 5500);
}
function showError(selector, message = '') {
  const node = $(selector);
  if (node) { node.textContent = message; node.hidden = !message; }
}
function routeInfo(hash = location.hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [page = '', part = ''] = path.split('/');
  return { page, part, params: new URLSearchParams(query), base: `#${path}` };
}
function navigate(hash, { replace = false, force = false } = {}) {
  if (pending && !force) { toast(pending.scope === 'preset' ? '正在保存预设计划，请稍候。' : 'AI 正在处理中。你可以等待完成，或先取消这次请求。'); return; }
  if (replace) { history.replaceState(null, '', hash); renderRoute(); }
  else if (location.hash === hash) renderRoute();
  else location.hash = hash;
}
function updateNotesCount() { $('#notes-count').textContent = `${form.elements.notes.value.length} / 500`; }
function populateProfile(profile) {
  if (!profile) return;
  Object.entries(profile).forEach(([key, value]) => { const input = form.elements.namedItem(key); if (input) input.value = value == null ? '' : String(value); });
  form.elements.sex.value = Object.hasOwn(labels.sex, profile.sex) ? profile.sex : 'unspecified';
  updateNotesCount();
}
function readProfile() {
  const result = Object.fromEntries(new FormData(form));
  ['age', 'height', 'weight', 'days', 'minutes'].forEach((key) => { result[key] = Number(result[key]); });
  return result;
}
function validateStep(step, report = true) {
  const inputs = document.querySelectorAll(`.setup-step[data-step="${step}"] input, .setup-step[data-step="${step}"] select, .setup-step[data-step="${step}"] textarea`);
  for (const input of inputs) {
    if (!input.checkValidity()) { if (report) { input.reportValidity(); input.focus(); } return false; }
  }
  return true;
}
async function readJSON(url, options = {}) {
  let response;
  try { response = await fetch(url, { cache: 'no-store', ...options }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('无法连接本地服务。请确认 eboji 正在运行，再试一次。'); }
  let result;
  try { result = await response.json(); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('本地服务没有返回完整结果，请稍后重试。'); }
  if (!response.ok) { const error = new Error(result.error || '请求没有完成，请重试。'); error.status = response.status; error.code = result.code; throw error; }
  return result;
}
async function refreshStatus(announce = false) {
  try {
    connection = await readJSON('/api/status');
    if (announce) toast(connection.message || (connection.ready ? '本机 AI 已连接。' : '请先登录本机 Codex。'));
  } catch (error) { connection = { ...connection, ready: false, message: error.message }; if (announce) toast(error.message); }
  if (loaded && routeInfo().page === 'me') renderMe();
  updateControls();
}
async function postJSON(url, data, signal) {
  if (!connection.token) connection.token = (await readJSON('/api/session')).token;
  if (!connection.token) throw new Error(connection.message || '本机服务尚未连接，请检查连接后重试。');
  return readJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-eboji-token': connection.token }, body: JSON.stringify(data), signal });
}
function progressHTML() {
  return '<div id="feedback-error" class="error-message" role="alert" hidden></div><div id="feedback-progress" class="progress-card" role="status" hidden><span class="spinner" aria-hidden="true"></span><div><strong>AI 正在分析这次反馈</strong><p>可能需要 1–4 分钟。<span id="feedback-elapsed"></span></p></div><button type="button" class="text-button" data-action="cancel-request">取消</button></div>';
}
function updateControls() {
  const busy = Boolean(pending);
  $('#profile-fields').disabled = busy;
  $('#fill-example').disabled = busy;
  $('#setup-back').disabled = busy;
  $('#setup-next').disabled = busy;
  $('#setup-next').innerHTML = pending?.scope === 'plan' ? '正在生成计划…' : setupStep === 3 ? '生成我的计划 <span aria-hidden="true">→</span>' : '下一步 <span aria-hidden="true">→</span>';
  document.querySelectorAll('[data-lock], #feedback-form input, #feedback-form select, #feedback-form textarea, #feedback-form button[type="submit"], #reply-form textarea, #reply-form button[type="submit"]').forEach((node) => { node.disabled = busy; });
  const presetFields = $('#preset-fields');
  if (presetFields) presetFields.disabled = busy || presetNeedsReview();
  const presetSubmit = $('#preset-submit');
  if (presetSubmit) { presetSubmit.disabled = busy || presetNeedsReview(); presetSubmit.textContent = pending?.scope === 'preset' ? '正在保存…' : '使用这套计划 →'; }
  document.querySelectorAll('#main-nav a, .brand').forEach((node) => { node.setAttribute('aria-disabled', String(busy)); });
  $('#generation-progress').hidden = pending?.scope !== 'plan';
  const feedbackProgress = $('#feedback-progress');
  if (feedbackProgress) feedbackProgress.hidden = !pending || !['feedback', 'reply'].includes(pending.scope);
}
function startPending(scope) {
  if (pending) return null;
  const request = { controller: new AbortController(), scope, started: Date.now(), lockedHash: location.hash };
  pending = request;
  const tick = () => {
    const seconds = Math.floor((Date.now() - request.started) / 1000);
    const node = $(scope === 'plan' ? '#generation-elapsed' : '#feedback-elapsed');
    if (node) node.textContent = seconds < 60 ? `已等待 ${seconds} 秒` : `已等待 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  };
  tick();
  request.timer = setInterval(tick, 1000);
  updateControls();
  return request;
}
function endPending(request) { clearInterval(request.timer); if (pending === request) pending = null; updateControls(); }
function adoptState(next, firstDay = false) {
  state = next;
  if (firstDay) currentDay = activeRecord()?.plan.days.find((day) => day.type === 'training')?.day || 1;
  $('#main-nav').hidden = !activeRecord();
  $('#local-badge').hidden = Boolean(activeRecord());
}
async function requestError(error, selector) {
  const message = error.name === 'AbortError' ? '已取消。你填写的内容还在，可以修改后重试。' : error.message;
  showError(selector, message);
  if (dialogDraftKey && feedbackDrafts.has(dialogDraftKey)) feedbackDrafts.get(dialogDraftKey).error = message;
  if (dialogEntryId) entryErrors.set(dialogEntryId, message);
  if (error.status === 403) { try { connection.token = (await readJSON('/api/session')).token; } catch { /* Keep the original request error visible. */ } }
  if (error.status === 409) {
    try {
      adoptState(await readJSON('/api/state'));
      if (dialogEntryId) {
        const entry = state.feedback.find((item) => item.id === dialogEntryId);
        if (entry) renderAnalysis(entry);
      }
    } catch { /* Preserve the useful original error. */ }
  }
}

function renderRoute() {
  if (!loaded) return;
  let route = routeInfo();
  if (pending && location.hash !== pending.lockedHash) {
    history.replaceState(null, '', pending.lockedHash);
    toast(pending.scope === 'preset' ? '正在保存预设计划，请稍候。' : '分析仍在进行。请等待完成，或先取消这次请求。');
    return;
  }
  const hasPlan = Boolean(activeRecord());
  if (!route.page || !['welcome', 'presets', 'setup', 'training', 'session', 'library', 'records', 'me'].includes(route.page) || (!hasPlan && !['welcome', 'presets', 'setup', 'library'].includes(route.page))) {
    history.replaceState(null, '', hasPlan ? '#training' : '#welcome');
    route = routeInfo();
  }
  const previous = routeInfo(lastHash);
  const pageChanged = previous.page !== route.page;
  const baseChanged = previous.base !== route.base;
  const planChanged = renderedPlanId !== state.activePlanId;
  const needsContent = !lastHash || baseChanged || planChanged || (previous.params.size && !route.params.size && route.page === 'records');
  const order = ['welcome', 'presets', 'setup', 'training', 'session', 'library', 'records', 'me'];
  const direction = pageChanged ? Math.sign(order.indexOf(route.page) - order.indexOf(previous.page)) || 1 : Math.sign(Number(route.part) - Number(previous.part)) || 1;
  const page = $(`#page-${route.page}`);
  if (route.page !== 'session') { sessionDeck?.destroy(); sessionDeck = null; }
  if (route.page !== 'me') { trainingCalendar?.destroy(); trainingCalendar = null; }
  if (needsContent || route.params.has('feedback') || route.params.has('entry')) stopExerciseDemos();
  document.querySelectorAll('.page').forEach((item) => {
    if (item !== page && !item.hidden) cancelMotion(item);
    item.hidden = item !== page;
  });
  $('#main-nav').hidden = !hasPlan;
  $('#local-badge').hidden = hasPlan;
  document.querySelectorAll('#main-nav a').forEach((link) => {
    const selected = link.dataset.page === (route.page === 'session' ? 'training' : route.page);
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (needsContent) {
    if (route.page === 'setup') renderSetup(route.part);
    if (route.page === 'training') renderTraining(route.part, !pageChanged && !planChanged);
    if (route.page === 'session') renderSession(route.part);
    if (route.page === 'library') renderLibrary(route.part);
    if (route.page === 'presets') renderPresets(route.part);
    if (route.page === 'records') renderRecords(route.part, !pageChanged);
    if (route.page === 'me') renderMe();
  }
  if (route.params.has('feedback') || route.params.has('entry')) renderDialog(route, previous);
  else {
    const closingRoute = location.hash;
    closeSheet(dialog).then((closed) => {
      if (closed && pageChanged && location.hash === closingRoute) focusHeading(page.querySelector('h1'));
      if (location.hash === closingRoute) syncExerciseDemos();
    });
    dialogDraftKey = null;
    dialogEntryId = null;
  }
  updateControls();
  if (pageChanged || (baseChanged && ['setup', 'session', 'presets'].includes(route.page))) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  if (baseChanged && route.page === 'library') window.scrollTo({ top: route.part ? 0 : libraryScroll, behavior: 'instant' });
  if (needsContent && !route.params.size) {
    if (pageChanged) {
      reveal(page, { direction });
      revealGroup(page, '.exercise-item, .record-item');
    } else if (route.page === 'setup') {
      reveal(page.querySelector('.setup-step:not([hidden])'), { direction });
    } else if (route.page === 'training') {
      reveal(page.querySelector('.day-summary'), { direction, distance: 8, duration: 220 });
    } else if (route.page === 'records') {
      reveal(page.querySelector('.records-list, .empty-records'), { distance: 6, duration: 220 });
    }
    if (lastHash && (pageChanged || route.page === 'setup' || (baseChanged && ['library', 'presets'].includes(route.page)))) focusHeading(page.querySelector('.setup-step:not([hidden]) h1') || page.querySelector('h1'));
    if (route.page === 'library' && !route.part && previous.page === 'library' && findCatalogExercise(previous.part)) page.querySelector(`[data-library-id="${previous.part}"]`)?.focus({ preventScroll: true });
  }
  syncExerciseDemos();
  lastHash = location.hash;
  renderedPlanId = state.activePlanId;
}
function focusHeading(heading) {
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}
// Keep the actual selector buttons mounted so their focus and sliding indicator survive.
function renderPanel(selector, markup, keepSelector = '') {
  const page = $(selector);
  const template = document.createElement('template');
  template.innerHTML = markup;
  const before = [...page.children], after = [...template.content.children];
  if (!keepSelector || before.length !== after.length) {
    cancelMotion(page);
    page.replaceChildren(template.content);
    return;
  }
  after.forEach((node, index) => {
    const old = before[index];
    if (old.matches(keepSelector) && node.matches(keepSelector)) {
      const nextButtons = [...node.querySelectorAll('button')];
      old.querySelectorAll('button').forEach((button, i) => {
        button.className = nextButtons[i].className;
        if (nextButtons[i].hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', nextButtons[i].getAttribute('aria-pressed'));
        button.innerHTML = nextButtons[i].innerHTML;
      });
    } else {
      cancelMotion(old);
      old.replaceWith(node);
    }
  });
}

function renderSetup(part) {
  setupStep = [1, 2, 3].includes(Number(part)) ? Number(part) : 1;
  document.querySelectorAll('.setup-step').forEach((step) => { step.hidden = Number(step.dataset.step) !== setupStep; });
  document.querySelectorAll('[data-journey-step]').forEach((item) => {
    const step = Number(item.dataset.journeyStep);
    item.classList.toggle('is-current', step === setupStep);
    item.classList.toggle('is-done', step < setupStep);
    if (step === setupStep) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  });
  document.querySelectorAll('.step-marker').forEach((marker) => { const step = Number(marker.dataset.step); marker.classList.toggle('current', step === setupStep); marker.classList.toggle('done', step < setupStep); marker.textContent = step < setupStep ? '✓' : String(step); marker.setAttribute('aria-current', step === setupStep ? 'step' : 'false'); });
  $('#setup-back').hidden = setupStep === 1;
  $('#setup-generation-note').hidden = setupStep !== 3;
  $('#setup-next-hint').textContent = ['', '接下来：了解你的身体情况', '接下来：选择训练时间与器械', '准备好了，就让 AI 为你安排这一周。'][setupStep];
  updateSetupSummary();
}
function updateSetupSummary() {
  const profile = readProfile();
  $('#setup-summary-text').textContent = `每周 ${profile.days} 天 · 每次 ${profile.minutes} 分钟 · ${labels.equipment[profile.equipment]}`;
}
function selectDay(part) {
  const plan = activeRecord()?.plan;
  if (!plan || plan.status !== 'ready') return null;
  const requested = Number(part) || currentDay;
  const day = plan.days.find((item) => item.day === requested) || plan.days[0];
  currentDay = day.day;
  return day;
}
function renderTraining(part, keepSelector = false) {
  const record = activeRecord();
  if (!record) return;
  const plan = record.plan;
  if (plan.status === 'needs_review') {
    $('#page-training').innerHTML = `<div class="page-heading"><p class="eyebrow">先照顾好身体</p><h1>${esc(plan.title)}</h1></div><div class="notice review-notice"><p>${esc(plan.summary)}</p>${plan.tips.length ? `<ul class="detail-list">${list(plan.tips)}</ul>` : ''}</div>${plan.caution ? `<p class="helper">${esc(plan.caution)}</p>` : ''}<button type="button" class="secondary spaced-field" data-action="start-setup" data-lock>重新设置我的情况</button>`;
    return;
  }
  const day = selectDay(part);
  const trainingCount = plan.days.filter((item) => item.type === 'training').length;
  const recovery = day.type === 'recovery';
  const nextTraining = plan.days.find((item) => item.day > day.day && item.type === 'training') || plan.days.find((item) => item.type === 'training');
  const equipment = labels.equipment[record.profile?.equipment || state.profile?.equipment];
  const markup = `<div class="page-heading training-heading"><div class="page-topline"><h1>我的训练计划</h1><span class="version-pill">计划 V${record.version}</span></div><p class="page-description">每周 ${trainingCount} 天训练 · ${7 - trainingCount} 天恢复</p>${record.source === 'preset' ? '<p class="plan-origin"><span>预设计划 · 0 token</span>已直接采用固定方案，可以开始练习。</p>' : record.source === 'ai-adjusted' ? '<p class="plan-origin"><span>AI 调整</span>已根据你的反馈更新安排。</p>' : ''}</div>
    <div class="schedule-heading"><h2>选择训练日</h2><p>按计划顺序，选择你要查看的一天。</p></div>
    <div class="week-strip" aria-label="选择计划中的一天">${plan.days.map((item) => `<button type="button" class="day-button${item.day === day.day ? ' active' : ''}${item.type === 'recovery' ? ' recovery' : ''}" data-action="select-day" data-day="${item.day}" aria-pressed="${item.day === day.day}" aria-label="第 ${item.day} 天，${esc(item.title)}"><small>第${item.day}天</small><span>${item.type === 'training' ? '训练' : '恢复'}</span><i aria-hidden="true"></i></button>`).join('')}</div>
    <article class="day-summary${recovery ? ' recovery-summary' : ''}"><div class="day-summary-copy"><p class="day-tag">计划第 ${day.day} 天 · ${recovery ? '恢复日' : '训练日'}</p><h2>${esc(day.title)}</h2><p class="day-focus">${esc(day.focus)}</p>${recovery ? `<p class="day-note">${esc(day.note)}</p>` : `<dl class="day-facts"><div><dt>预计用时</dt><dd>${day.minutes}<span> 分钟</span></dd></div><div><dt>训练动作</dt><dd>${day.exercises.length}<span> 个</span></dd></div>${equipment ? `<div class="equipment-fact"><dt>场地与器械</dt><dd>${esc(equipment)}</dd></div>` : ''}</dl>`}</div>
    ${!recovery ? `<div class="day-preview"><p class="preview-label">本次动作</p><div class="exercise-preview-list">${day.exercises.map((exercise) => `<span>${esc(exercise.name)}</span>`).join('')}</div></div>` : ''}
    <div class="day-summary-footer">${recovery ? `<p class="helper">恢复日也属于计划，不必每天都做力量训练。</p>${nextTraining ? `<button type="button" class="secondary" data-action="view-session" data-day="${nextTraining.day}">预览第 ${nextTraining.day} 天训练 <span aria-hidden="true">→</span></button>` : ''}` : `<button type="button" class="primary" data-action="view-session" data-day="${day.day}">查看这次训练 <span aria-hidden="true">→</span></button><p class="helper">先看动作要点，练完再记录感受。</p>`}</div></article>
    <details class="subtle-details plan-reason"><summary>${record.source === 'preset' ? '这套预设怎么练？' : '了解这份计划的安排'}</summary><div class="detail-body"><h3>${esc(plan.title)}</h3><p>${esc(plan.summary)}</p>${plan.tips.length ? `<ul class="detail-list">${list(plan.tips)}</ul>` : ''}${plan.caution ? `<p class="helper">${esc(plan.caution)}</p>` : ''}</div></details>`;
  renderPanel('#page-training', markup, keepSelector ? '.week-strip' : '');
}
function stopExerciseDemos() {
  exerciseDemos.forEach((demo) => demo.destroy());
  exerciseDemos.clear();
}
function syncExerciseDemos() {
  const blocked = dialog.open || routeInfo().params.has('feedback') || routeInfo().params.has('entry');
  const visible = (host) => host.isConnected && !host.closest('[hidden]') && (!host.closest('details') || host.closest('details').open) && !blocked;
  exerciseDemos.forEach((demo, host) => {
    if (!visible(host)) { demo.destroy(); exerciseDemos.delete(host); }
  });
  if (blocked) return;
  document.querySelectorAll('.exercise-demo-host').forEach((host) => {
    if (visible(host) && !exerciseDemos.has(host)) exerciseDemos.set(host, mountExerciseAnimation(host, host.dataset.demoId));
  });
}

function catalogOptions(labels, selected) {
  return Object.entries(labels).map(([value, label]) => `<option value="${esc(value)}"${selected === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
}
function presetPoster(name) {
  const exercise = findCatalogExercise(name);
  return exercise ? exercisePosterHTML(exercise.id) : '';
}
function presetDayHTML(day, index) {
  const open = index === 0 && window.matchMedia('(min-width: 781px)').matches;
  return `<details class="preset-day subtle-details"${open ? ' open' : ''}><summary><span class="preset-day-number">第 ${day.day} 天</span><span class="preset-day-title"><strong>${esc(day.title)}</strong><small>${day.exercises.length} 个动作 · 约 ${day.minutes} 分钟</small></span></summary><div class="detail-body"><p class="helper">热身：${day.warmup.map(esc).join('；')}</p><ul class="preset-exercises">${day.exercises.map(exercise => `<li><span class="preset-exercise-poster" aria-hidden="true">${presetPoster(exercise.name)}</span><div><strong>${esc(exercise.name)}</strong><span>${exercise.sets} 组 · ${esc(exercise.reps)} · 休息 ${exercise.restSeconds} 秒</span></div></li>`).join('')}</ul><p class="helper">收尾：${day.cooldown.map(esc).join('；')}</p><p class="helper">${esc(day.note)}</p></div></details>`;
}
function renderPresets(id) {
  const preset = id ? findPresetPlan(id) : null;
  if (id && !preset) {
    $('#page-presets').innerHTML = '<div class="page-heading"><h1>没有找到这套预设</h1><p class="page-description">重新选一套适合当前器械的方案。</p></div><button type="button" class="primary spaced-field" data-action="open-presets">查看预设计划 →</button>';
    return;
  }
  if (!preset) {
    $('#page-presets').innerHTML = `<button type="button" class="text-button back-link" data-action="exit-presets">← ${activeRecord() ? '返回我的资料' : '返回首页'}</button><div class="page-heading preset-heading"><p class="eyebrow">固定方案 · 无需 AI · 0 token</p><h1>选一套，就能开始。</h1><p class="page-description">三套居家入门计划，动作、组数和恢复日都已安排好。<br>先看完整内容，再决定使用哪一套。</p></div><div class="preset-options">${presetPlans.map(item => `<button type="button" class="preset-option" data-action="preview-preset" data-preset-id="${item.id}" aria-label="预览${esc(item.title)}"><span class="preset-option-kicker">${esc(equipmentLabels[item.equipment])} · ${esc(item.level)}</span><strong class="preset-option-title">${esc(item.title)}</strong><span class="preset-option-description">${esc(item.description)}</span><span class="preset-option-posters" aria-hidden="true">${item.plan.days.find(day => day.type === 'training').exercises.slice(0,3).map(exercise => `<span>${presetPoster(exercise.name)}</span>`).join('')}</span><span class="preset-option-facts"><span>每周 <b>${item.days}</b> 次</span><span>每次约 <b>${item.minutes}</b> 分钟</span></span><span class="preset-option-link">预览整周安排 <span aria-hidden="true">→</span></span></button>`).join('')}</div><div class="preset-explainer"><p>预设是通用入门安排，浏览、采用和看动作动画都不会调用 AI。</p><p>想按个人情况制定计划？<button type="button" class="text-button" data-action="start-setup">让 AI 为我定制 →</button></p><p class="helper">后续主动获取 AI 反馈建议时，会使用已登录的 Codex 额度。</p></div>`;
    return;
  }
  const blocked = presetNeedsReview();
  const experience = Object.hasOwn(labels.experience, state.profile?.experience) ? state.profile.experience : 'beginner';
  $('#page-presets').innerHTML = `<button type="button" class="text-button back-link" data-action="open-presets">← 查看其他预设</button><div class="page-heading preset-heading"><p class="eyebrow">预设计划 · 0 token</p><h1>${esc(preset.title)}</h1><p class="page-description">${esc(preset.description)}</p><div class="preset-detail-facts"><span>${esc(equipmentLabels[preset.equipment])}</span><span>每周 ${preset.days} 次</span><span>每次约 ${preset.minutes} 分钟</span></div>${!blocked ? '<button type="button" class="secondary preset-jump" data-action="preset-start-options">准备使用这套计划 ↓</button>' : ''}</div><div class="preset-detail-layout"><section class="preset-schedule" aria-label="整周训练预览"><h2>这一周，按这个节奏来</h2><div class="preset-week" aria-label="七天训练与恢复安排">${preset.plan.days.map(day => `<div class="${day.type === 'training' ? 'is-training' : ''}"><span>第 ${day.day} 天</span><strong>${day.type === 'training' ? '训练' : '恢复'}</strong></div>`).join('')}</div>${preset.plan.days.filter(day => day.type === 'training').map(presetDayHTML).join('')}<p class="helper preset-rest-note">恢复日按状态休息或轻松活动，不额外安排力量训练。</p></section><aside class="preset-start-panel"><span class="plan-mode-label">直接采用 · 不调用 AI</span><h2>准备好，就从第一天开始。</h2><ul class="detail-list">${list(preset.highlights)}</ul><p class="helper">这是固定方案；下面的信息仅用于记录和后续反馈，不会改变这套动作安排。</p>${blocked ? '<p class="error-message">当前资料记录了疼痛、伤病或运动限制，请先确认适合的运动条件，暂不直接采用通用预设。</p>' : ''}<form id="preset-start-form" data-preset-id="${preset.id}"><fieldset id="preset-fields"${blocked ? ' disabled' : ''}><label class="field">目前的训练经验<select name="experience">${catalogOptions(labels.experience, experience)}</select></label><label class="preset-eligibility"><input type="checkbox" name="eligibilityConfirmed" required><span>我在 18–80 岁范围内，目前没有疼痛、伤病或医生规定的运动限制。</span></label></fieldset><div id="preset-error" class="error-message" role="alert" hidden></div><button type="submit" class="primary" id="preset-submit"${blocked ? ' disabled' : ''}>使用这套计划 →</button><p class="helper">${activeRecord() ? '采用后保存为新版本，原计划和记录保留。' : '计划保存在本机，刷新后也能继续查看。'}</p></form><p class="preset-ai-note">之后若点击“获取 AI 建议”，才会发送反馈给 AI 并使用 Codex 额度。</p></aside></div><p class="helper preset-scope">${esc(preset.plan.caution)}</p>`;
}
function renderLibrary(id) {
  const item = id ? exerciseCatalog.find((exercise) => exercise.id === id) : null;
  if (id && !item) {
    $('#page-library').innerHTML = '<div class="page-heading"><h1>没有找到这个动作</h1><p class="page-description">回到动作库，按名称或部位重新查找。</p></div><button type="button" class="primary spaced-field" data-action="open-library">浏览动作库 →</button>';
    return;
  }
  if (item) {
    $('#page-library').innerHTML = `<button type="button" class="text-button back-link" data-action="back-library">← 返回动作库</button><div class="page-heading library-detail-heading"><p class="eyebrow">${esc(bodyPartLabels[item.bodyPart])} · ${esc(equipmentLabels[item.equipment])} · ${esc(levelLabels[item.level])}</p><h1>${esc(item.name)}</h1><p class="page-description">主要参与：${esc(item.muscles.join('、'))}</p></div><div class="library-detail-grid"><section class="library-demo-panel" aria-label="动作动画"><div class="exercise-demo-host" data-demo-id="${item.id}"></div><p class="demo-context">${item.unilateral ? '单侧动作：图示为一侧路径，实际训练需分别完成两侧。' : '动画用于观察动作路径，次数、组数与休息以你的训练计划为准。'}</p>${item.support === 'wall' ? '<p class="demo-requirement">准备：稳固墙面与不打滑的地面。</p>' : ''}</section><div class="library-instructions"><section><h2>怎么做</h2><ol class="instruction-steps">${item.instructions.map((step, index) => `<li><span aria-hidden="true">${index + 1}</span><p>${esc(step)}</p></li>`).join('')}</ol></section><section class="catalog-cues"><h2>记住这些要点</h2><ul class="detail-list">${list(item.cues)}</ul></section><section class="catalog-pitfalls"><h2>避免这些做法</h2><ul class="detail-list">${list(item.pitfalls)}</ul></section></div></div><div class="library-bottom-note"><p>示意动画不等于现场动作评估。出现疼痛时暂停，不要跟随动画带痛完成。</p><details class="subtle-details"><summary>动作参考与素材说明</summary><div class="detail-body"><p>动作说明为中文整理，动画为 eboji 原创简化示意。</p><ul>${item.sourceUrls.map((url, i) => `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">动作参考 ${i + 1} · ${esc(new URL(url).hostname)}</a></li>`).join('')}</ul><a href="/exercises/ATTRIBUTION.md" target="_blank" rel="noopener noreferrer">查看素材说明</a></div></details></div>`;
    return;
  }
  $('#page-library').innerHTML = `${!activeRecord() ? '<button type="button" class="text-button back-link" data-action="library-home">← 返回首页</button>' : ''}<div class="page-heading library-heading"><p class="eyebrow">练习之前，先了解动作</p><h1>居家动作库<span class="catalog-count">${exerciseCatalog.length}</span></h1><p class="page-description">徒手与哑铃，覆盖全身。点开卡片，看步骤、要点和动作动画。</p></div><div id="library-filters" class="library-filters"><label class="field catalog-search">找一个动作<input type="search" id="library-query" value="${esc(libraryFilters.query)}" placeholder="搜索动作或肌群，例如深蹲、胸肌" autocomplete="off" maxlength="80"></label><div class="catalog-filter-row"><label class="field">身体部位<select id="library-bodypart"><option value="">全部部位</option>${catalogOptions(bodyPartLabels, libraryFilters.bodyPart)}</select></label><label class="field">使用器械<select id="library-equipment"><option value="">全部器械</option>${catalogOptions(equipmentLabels, libraryFilters.equipment)}</select></label><label class="field">动作难度<select id="library-level"><option value="">全部难度</option>${catalogOptions(levelLabels, libraryFilters.level)}</select></label></div></div><div class="catalog-results-heading"><p id="library-result-count" role="status" aria-live="polite"></p><button type="button" class="text-button" data-action="reset-library">清除筛选</button></div><div id="library-grid" class="catalog-grid"></div><div id="library-more" class="catalog-more"></div><p class="catalog-library-note">AI 会优先从动作库中，选择符合你器械与经验的动作。动作库用于查阅，训练量以个人计划为准。</p>`;
  updateLibraryResults();
}
function updateLibraryResults() {
  const query = libraryFilters.query.trim().toLocaleLowerCase();
  const results = browsableExercises.filter((item) => (!libraryFilters.bodyPart || item.bodyPart === libraryFilters.bodyPart) && (!libraryFilters.equipment || item.equipment === libraryFilters.equipment) && (!libraryFilters.level || item.level === libraryFilters.level) && (!query || [item.name, ...item.aliases, ...item.muscles, bodyPartLabels[item.bodyPart], equipmentLabels[item.equipment]].join(' ').toLocaleLowerCase().includes(query)));
  $('#library-result-count').textContent = `${results.length} 个动作${results.length > libraryLimit ? ` · 已显示 ${libraryLimit} 个` : ''}`;
  const filtered = Object.values(libraryFilters).some(Boolean);
  $('#library-filters').parentElement.querySelector('[data-action="reset-library"]').hidden = !filtered;
  $('#library-grid').innerHTML = results.length ? results.slice(0, libraryLimit).map((item) => `<button type="button" class="catalog-card" data-action="view-library-exercise" data-library-id="${item.id}" aria-label="${esc(item.name)}，${esc(equipmentLabels[item.equipment])}，查看步骤与 3D 动画"><span class="catalog-poster" aria-hidden="true">${exercisePosterHTML(item.id)}<span class="catalog-animation-badge">3D 动作 <span>↗</span></span></span><span class="catalog-card-copy"><span class="catalog-card-category">${esc(bodyPartLabels[item.bodyPart])} · ${esc(levelLabels[item.level])}</span><strong>${esc(item.name)}</strong><span class="catalog-card-muscles">${esc(item.muscles.join(' · '))}</span><span class="catalog-equipment">${esc(equipmentLabels[item.equipment])}${item.support === 'wall' ? ' · 墙面' : ''}</span></span></button>`).join('') : '<div class="catalog-empty"><h2>暂时没有匹配的动作</h2><p>试试更短的名称，或清除部位、器械和难度筛选。</p><button type="button" class="secondary" data-action="reset-library">查看全部动作</button></div>';
  $('#library-more').innerHTML = results.length > libraryLimit ? `<button type="button" class="secondary" data-action="library-more">再看 ${Math.min(24, results.length - libraryLimit)} 个动作 ↓</button>` : '';
}
function renderSession(part) {
  sessionDeck?.destroy();
  sessionDeck = null;
  const day = selectDay(part);
  if (!day || day.type !== 'training') { navigate('#training', { replace: true }); return; }
  $('#page-session').innerHTML = `<button type="button" class="text-button back-link" data-action="back-training">← 返回训练计划</button><div class="session-heading"><p class="eyebrow">计划第 ${day.day} 天</p><h1>${esc(day.title)}</h1><p class="page-description">${esc(day.focus)}</p><div class="session-meta"><span>约 ${day.minutes} 分钟</span><span>${day.exercises.length} 个动作</span></div></div>
    ${day.warmup.length ? `<details class="subtle-details preparation" open><summary><span class="preparation-heading"><strong>先做热身</strong><small>准备好身体，再进入动作练习</small></span></summary><div class="detail-body"><ul class="detail-list">${list(day.warmup)}</ul><button type="button" class="text-button deck-start" data-action="start-exercise-deck">热身好了，开始练习 →</button></div></details>` : ''}
    <div id="workout-deck-host"></div>
    ${day.cooldown.length ? `<details class="subtle-details preparation"><summary><span class="preparation-heading"><strong>放松与收尾</strong><small>训练后，跟着这些安排慢慢收尾</small></span></summary><div class="detail-body"><ul class="detail-list">${list(day.cooldown)}</ul></div></details>` : ''}
    ${day.note ? `<p class="helper session-note">${esc(day.note)}</p>` : ''}<div class="session-footer"><div class="finish-copy"><h2>练完了？聊聊这次感受。</h2><p>告诉 AI 哪些轻松、哪些吃力，获得下一次训练的建议。此功能会使用 Codex 额度。</p></div><button type="button" class="primary" data-action="feedback" data-day="${day.day}" data-exercise="all" data-lock>记录训练感受 <span aria-hidden="true">→</span></button></div>`;
  sessionDeck = mountWorkoutDeck($('#workout-deck-host'), {
    planId: activeRecord().id, day,
    onFeedback: (index) => openFeedback(day.day, index),
    onDemosChange: syncExerciseDemos,
  });
}
function targetFor(entry) {
  const record = state.plans.find((item) => item.id === entry.planId);
  const day = record?.plan.days.find((item) => item.day === entry.input.day);
  const exercise = Number.isInteger(entry.input.exerciseIndex) ? day?.exercises[entry.input.exerciseIndex] : null;
  return { record, day, exercise, label: exercise?.name || day?.title || `第 ${entry.input.day} 天`, scope: exercise ? '动作反馈' : '整次训练反馈' };
}
function renderRecords(part, keepSelector = false) {
  const versions = part === 'versions';
  const statusText = { advice: '已有建议', clarify: '待补充', adjustment: '待确认调整', needs_review: '需先评估' };
  const markup = `<div class="page-heading"><p class="eyebrow">每一步都算数</p><h1>你的训练记录</h1><p class="page-description">回看每一次反馈，也看见计划如何变得更适合你。</p></div><div class="record-tabs" aria-label="记录分类"><button type="button" class="${!versions ? 'active' : ''}" data-action="records-tab" data-tab="feedback">训练反馈 <span>${state.feedback.length}</span></button><button type="button" class="${versions ? 'active' : ''}" data-action="records-tab" data-tab="versions">计划版本 <span>${state.plans.length}</span></button></div>
    ${versions ? `<div class="records-list">${[...state.plans].reverse().map((record) => `<article class="record-item version-item"><div><div class="record-title"><strong>V${record.version} · ${esc(record.plan.title)}</strong><span class="status-pill${record.id === state.activePlanId ? ' current' : ''}">${record.id === state.activePlanId ? '正在使用' : '历史版本'}</span></div><p class="record-meta">${esc(dateLabel(record.createdAt))}</p><p class="version-reason">${esc(record.reason)}</p><details class="subtle-details"><summary>查看这个版本的安排</summary><div class="detail-body"><p>${esc(record.plan.summary)}</p>${record.plan.days.length ? `<ul class="version-days">${record.plan.days.map((day) => `<li><span>第 ${day.day} 天</span><strong>${esc(day.title)}</strong><span>${day.type === 'training' ? `${day.exercises.length} 个动作 · ${day.minutes} 分钟` : '恢复'}</span></li>`).join('')}</ul>` : ''}</div></details></div></article>`).join('')}</div>` : state.feedback.length ? `<div class="records-list">${[...state.feedback].reverse().map((entry) => { const target = targetFor(entry); const stale = entry.planId !== state.activePlanId && !entry.appliedPlanId; return `<button type="button" class="record-item feedback-record-button" data-action="view-feedback" data-id="${esc(entry.id)}"><span><span class="record-title"><strong>${esc(target.label)}</strong><span class="status-pill${!stale && ['clarify', 'adjustment'].includes(entry.analysis.status) && !entry.appliedPlanId ? ' attention' : ''}">${entry.appliedPlanId ? '已采用调整' : stale ? '历史反馈' : esc(statusText[entry.analysis.status])}</span></span><span class="record-meta">第 ${entry.input.day} 天 · ${target.scope} · V${target.record?.version || '—'} · ${esc(dateLabel(entry.createdAt))}</span></span><span class="record-arrow" aria-hidden="true">→</span></button>`; }).join('')}</div>` : '<div class="empty-records"><h2>从第一次反馈开始。</h2><p>训练后，打开动作卡片记录感受。<br>你的反馈和 AI 的建议会保存在这里。</p><button type="button" class="secondary" data-action="back-training">去看看我的训练 →</button></div>'}`;
  renderPanel('#page-records', markup, keepSelector ? '.record-tabs' : '');
}
function renderMe() {
  trainingCalendar?.destroy();
  trainingCalendar = null;
  const profile = state.profile;
  const measurements = profile ? [['age', '岁'], ['height', 'cm'], ['weight', 'kg']].filter(([key]) => Number.isFinite(profile[key])).map(([key, unit]) => `${profile[key]} ${unit}`).join(' · ') : '';
  const rows = profile ? [['训练目标', labels.goal[profile.goal]], ['训练经验', labels.experience[profile.experience]], ['身体资料', measurements || '暂未填写 · 使用预设无需填写'], ['生理性别', Object.hasOwn(labels.sex, profile.sex) ? labels.sex[profile.sex] : labels.sex.unspecified], ['训练安排', `每周 ${profile.days} 天 · 每次 ${profile.minutes} 分钟`], ['场地与器械', labels.equipment[profile.equipment]], ['运动条件', labels.health[profile.health]], ...(profile.notes ? [['补充说明', profile.notes]] : [])] : [];
  $('#page-me').innerHTML = `<div class="page-heading"><p class="eyebrow">每一步，都算数</p><h1>我的训练</h1><p class="page-description">看看练习的足迹，也照顾好自己的节奏。</p></div><div id="training-calendar-host"></div><div class="account-card"><h2 class="profile-card-title">我的训练资料</h2><dl class="profile-list">${rows.map(([label, value]) => `<div class="profile-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><div class="account-plan-actions"><button type="button" class="secondary" data-action="start-setup" data-lock>填写资料，让 AI 定制 →</button><button type="button" class="text-button" data-action="open-presets" data-lock>换一套预设 · 0 token →</button></div><p class="helper">新的计划会保留旧版本和训练记录。</p></div>
    <div class="account-card connection-card"><div class="setting-row"><div><h2><span class="connection-dot${connection.ready ? ' ready' : ''}"></span>${connection.ready ? '本机 AI 已连接' : '本机 AI 连接'}</h2><p>${esc(connection.message)}</p></div><button type="button" class="text-button" data-action="check-connection" data-lock>检查连接</button></div><p class="helper">只有使用 AI 生成或分析时才消耗已登录的 Codex 额度。预设计划无需连接 AI。</p></div>
    <div class="setting-row data-setting"><div><h2>本地资料与记录</h2><p>资料、训练计划和反馈保存在这台电脑上。</p></div><button type="button" class="danger-button" data-action="reset" data-lock>清空记录</button></div><div id="account-error" class="error-message" role="alert" hidden></div>`;
  trainingCalendar = mountTrainingCalendar($('#training-calendar-host'), {
    getData: () => ({ plans: state.plans, feedback: state.feedback, activePlanId: state.activePlanId }),
    onViewFeedback: id => navigate(`${routeInfo().base}?entry=${encodeURIComponent(id)}`),
    onViewTraining: day => navigate(`#session/${day}`),
  });
}

function draftFor(dayNumber, exerciseCode) {
  const record = activeRecord();
  const day = record?.plan.days.find((item) => item.day === dayNumber);
  if (!day || day.type !== 'training') return null;
  const index = exerciseCode === 'all' ? null : Number(exerciseCode);
  if (index !== null && (!Number.isInteger(index) || !day.exercises[index])) return null;
  const key = `${record.id}:${day.day}:${index === null ? 'all' : index}`;
  if (!feedbackDrafts.has(key)) feedbackDrafts.set(key, { planId: record.id, day: day.day, exerciseIndex: index, effort: 'right', discomfort: 'none', completedSets: '', completedSetsTouched: false, actualReps: '', load: '', notes: '', error: '' });
  const draft = feedbackDrafts.get(key);
  if (!draft.completedSetsTouched) {
    const workout = sessionDeck?.planId === record.id && sessionDeck.day === day.day ? sessionDeck.getProgress() : createWorkoutProgress({ planId: record.id, day: day.day, exercises: day.exercises }).getState();
    const completed = index === null ? workout.completedSets : workout.exercises[index].completed;
    draft.completedSets = completed > 0 ? String(completed) : '';
  }
  return { key, draft: feedbackDrafts.get(key), day, record, exercise: index === null ? null : day.exercises[index] };
}
function openFeedback(day, exercise) {
  if (pending) return;
  const target = draftFor(day, exercise);
  if (!target) return;
  navigate(`${routeInfo().base}?feedback=${day}:${exercise}&step=1`);
}
function feelingOption(name, value, title, description, chosen) {
  return `<label class="choice-card"><input type="radio" name="${name}" value="${value}"${chosen === value ? ' checked' : ''}><span class="choice-copy"><strong>${title}</strong>${description ? `<small>${description}</small>` : ''}</span><span class="choice-check" aria-hidden="true"></span></label>`;
}
function renderDialog(route, previous) {
  const wasOpen = dialog.open;
  cancelMotion(feedbackBody);
  if (route.params.has('entry')) {
    const entry = state.feedback.find((item) => item.id === route.params.get('entry'));
    if (!entry) { navigate(route.base, { replace: true }); return; }
    dialogDraftKey = null;
    dialogEntryId = entry.id;
    renderAnalysis(entry);
  } else {
    const [dayNumber, exerciseCode] = route.params.get('feedback').split(':');
    const target = draftFor(Number(dayNumber), exerciseCode);
    if (!target) { navigate(route.base, { replace: true }); return; }
    dialogDraftKey = target.key;
    dialogEntryId = null;
    renderFeedback(target, route.params.get('step') === '2' ? 2 : 1);
  }
  openSheet(dialog);
  if (wasOpen) {
    const direction = route.params.get('step') === '1' && previous?.params.get('step') === '2' ? -1 : 1;
    reveal(feedbackBody, { direction, distance: 10, duration: 240 });
    focusHeading($('#feedback-title'));
  }
  dialog.scrollTop = 0;
  updateControls();
}
function renderFeedback({ draft, day, record, exercise }, step) {
  feedbackBody.innerHTML = `<div class="dialog-heading"><div class="feedback-steps" aria-label="反馈进度"><span class="${step === 1 ? 'active' : 'done'}"${step === 1 ? ' aria-current="step"' : ''}>${step === 1 ? '1' : '✓'} 感受</span><span class="${step === 2 ? 'active' : ''}"${step === 2 ? ' aria-current="step"' : ''}>2 完成情况</span></div><h2 id="feedback-title">${step === 1 ? '这次练得感觉如何？' : '实际完成了多少？'}</h2><p class="dialog-description">${step === 1 ? '先选最接近你感受的选项。' : '告诉 AI 完成量，让建议更适合你。'}</p></div><div class="context-line compact-context"><strong>${esc(exercise?.name || day.title)}</strong><span>计划第 ${day.day} 天 · ${exercise ? '动作反馈' : '整次训练'}</span>${step === 2 ? `<span class="context-prescription">原计划：${exercise ? `${exercise.sets} 组 · ${esc(exercise.reps)}` : `${day.exercises.length} 个动作 · 约 ${day.minutes} 分钟`}</span>` : ''}</div>
    <form id="feedback-form" data-step="${step}" class="feedback-form" novalidate>${step === 1 ? `<p class="feeling-label" id="effort-label">训练难度</p><div class="segmented-radio" role="radiogroup" aria-labelledby="effort-label">${feelingOption('effort', 'easy', '偏轻松', '', draft.effort)}${feelingOption('effort', 'right', '刚刚好', '', draft.effort)}${feelingOption('effort', 'hard', '偏吃力', '', draft.effort)}</div><p class="feeling-label" id="discomfort-label">身体的感受</p><div class="choice-grid" role="radiogroup" aria-labelledby="discomfort-label">${feelingOption('discomfort', 'none', '没有明显不适', '', draft.discomfort)}${feelingOption('discomfort', 'soreness', '肌肉酸胀 / 酸痛', '', draft.discomfort)}${feelingOption('discomfort', 'pain', '疼痛、刺痛或其他不适', '', draft.discomfort)}</div><p id="pain-notice" class="notice compact-notice"${draft.discomfort === 'pain' ? '' : ' hidden'}>先暂停引起不适的动作，不要带痛继续训练。接下来请具体描述发生了什么。</p>` : `<fieldset class="feedback-essential"><legend>实际完成</legend><p class="helper">完成组数必填，其余可选。</p><div class="two-col"><label class="field">${exercise ? '这个动作完成了几组' : '当天总共完成了几组'}<input type="number" name="completedSets" value="${esc(draft.completedSets)}" min="0" max="30" step="1" required inputmode="numeric" placeholder="如 2"></label><label class="field">每组次数 / 时长 <span class="optional">选填</span><input type="text" name="actualReps" value="${esc(draft.actualReps)}" maxlength="100" placeholder="如 8 次，或 20 秒"></label></div></fieldset><label class="field spaced-field">哪里吃力，或哪里不舒服？ <span class="optional">选填</span><textarea name="notes" rows="3" maxlength="1000" placeholder="比如：最后一组明显吃力，或某个部位在什么动作时出现不适。">${esc(draft.notes)}</textarea></label><details class="subtle-details extra-details feedback-load"${draft.load ? ' open' : ''}><summary>补充使用的重量或器械 <span class="optional">选填</span></summary><div class="detail-body"><label class="field">实际负荷<input type="text" name="load" value="${esc(draft.load)}" maxlength="100" placeholder="如徒手，或每只哑铃 3 kg"></label></div></details><p class="helper feedback-feelings">${esc(labels.effort[draft.effort])} · ${esc(labels.discomfort[draft.discomfort])}。${draft.discomfort === 'pain' ? '先暂停引起不适的动作。' : 'AI 会结合实际完成量给你建议。'}</p>`}
    ${progressHTML()}<div class="dialog-actions">${step === 2 ? '<button type="button" class="secondary" data-action="feedback-back" data-lock>上一步</button>' : ''}<button type="submit" class="primary">${step === 1 ? '继续填写完成情况 →' : '获取 AI 建议 →'}</button></div>${step === 2 ? '<p class="helper">提交后会联网发送反馈给 AI，并使用 Codex 额度。仅凭描述不能确认动作姿势，信息不足时 AI 会先追问。</p>' : ''}</form>`;
  showError('#feedback-error', draft.error);
}
function captureFeedback(changedName) {
  const feedbackForm = $('#feedback-form');
  if (!feedbackForm || !dialogDraftKey) return;
  const draft = feedbackDrafts.get(dialogDraftKey);
  if (!draft) return;
  if (changedName === 'completedSets') draft.completedSetsTouched = true;
  for (const input of feedbackForm.elements) {
    if (!input.name || (input.type === 'radio' && !input.checked)) continue;
    draft[input.name] = input.value;
  }
  const painNotice = $('#pain-notice');
  if (painNotice) painNotice.hidden = draft.discomfort !== 'pain';
}
function comparisonHTML(day, label, after = false) {
  if (!day) return '';
  return `<div class="compare-side${after ? ' after' : ''}"><h4>${label}</h4><strong>${esc(day.title)}</strong><p>${day.minutes} 分钟 · ${esc(day.focus)}</p>${day.warmup.length ? `<p>热身：${day.warmup.map(esc).join('；')}</p>` : ''}${day.exercises.map((exercise) => `<div class="compare-exercise"><strong>${esc(exercise.name)}</strong><p>${exercise.sets} 组 · ${esc(exercise.reps)}<br>组间休息 ${exercise.restSeconds} 秒</p><p>${esc(exercise.cue)}</p></div>`).join('')}${day.cooldown.length ? `<p>放松：${day.cooldown.map(esc).join('；')}</p>` : ''}${day.note ? `<p>${esc(day.note)}</p>` : ''}</div>`;
}
function differences(before, after) {
  if (!before || !after) return [];
  const changes = [];
  if (before.minutes !== after.minutes) changes.push(`训练时长：${before.minutes} → ${after.minutes} 分钟`);
  for (let index = 0; index < Math.max(before.exercises.length, after.exercises.length); index += 1) {
    const old = before.exercises[index], next = after.exercises[index];
    if (!old) { changes.push(`新增 ${next.name}：${next.sets} 组 · ${next.reps} · 休息 ${next.restSeconds} 秒`); continue; }
    if (!next) { changes.push(`移除动作：${old.name}`); continue; }
    if (old.name !== next.name) { changes.push(`${old.name} → ${next.name}：${next.sets} 组 · ${next.reps} · 休息 ${next.restSeconds} 秒`); continue; }
    const changed = [];
    if (old.sets !== next.sets) changed.push(`${old.sets} → ${next.sets} 组`);
    if (old.reps !== next.reps) changed.push(`次数 / 时长从「${old.reps}」改为「${next.reps}」`);
    if (old.restSeconds !== next.restSeconds) changed.push(`休息 ${old.restSeconds} → ${next.restSeconds} 秒`);
    if (old.cue !== next.cue) changed.push(`动作提示：${next.cue}`);
    if (changed.length) changes.push(`${next.name}：${changed.join('；')}`);
  }
  if (JSON.stringify(before.warmup) !== JSON.stringify(after.warmup)) changes.push(`热身改为：${after.warmup.join('；') || '无单独热身安排'}`);
  if (JSON.stringify(before.cooldown) !== JSON.stringify(after.cooldown)) changes.push(`放松改为：${after.cooldown.join('；') || '无单独放松安排'}`);
  if (before.note !== after.note) changes.push(`训练提醒：${after.note || '移除原提醒'}`);
  if (before.focus !== after.focus) changes.push(`训练重点：${after.focus}`);
  return changes.length ? changes : ['动作安排保持一致，请查看 AI 给出的训练建议。'];
}
function renderAnalysis(entry) {
  const { record, day, label, scope } = targetFor(entry);
  const analysis = entry.analysis;
  const stale = entry.planId !== state.activePlanId;
  const applied = state.plans.find((item) => item.id === entry.appliedPlanId);
  const pain = entry.input.discomfort === 'pain';
  feedbackBody.innerHTML = `<div class="dialog-heading"><p class="analysis-label">AI 训练建议</p><h2 id="feedback-title">${esc(labels.analysis[analysis.status] || '这次训练的反馈')}</h2></div><p class="context-line"><strong>${esc(label)}</strong><span>第 ${entry.input.day} 天 · ${scope} · V${record?.version || '—'}</span></p>
    <div class="analysis-summary${pain || analysis.status === 'needs_review' ? ' caution-summary' : ''}"><h3>${esc(analysis.summary)}</h3></div>
    ${analysis.actions.length ? `<div class="analysis-actions"><h3>现在可以这样做</h3><ul class="detail-list${pain ? ' safety-actions' : ''}">${list(analysis.actions)}</ul></div>` : ''}
    ${analysis.questions.length ? `<div class="questions-block"><h3>再告诉 AI 一点信息</h3><ol class="detail-list">${list(analysis.questions)}</ol></div>` : ''}
    ${analysis.status === 'clarify' && !entry.appliedPlanId && !stale ? `<form id="reply-form" class="reply-form" data-id="${esc(entry.id)}"><label class="field">补充你的情况<textarea name="answer" rows="3" maxlength="1500" required placeholder="可以逐项回答上面的问题。">${esc(replyDrafts.get(entry.id) || '')}</textarea></label><button type="submit" class="primary">补充给 AI，继续分析 →</button></form>` : ''}
    ${analysis.status === 'clarify' && stale ? '<p class="stale-notice">这条反馈来自历史计划。请针对当前计划重新反馈。</p>' : ''}
    ${analysis.status === 'adjustment' && analysis.proposedDay ? `<div class="change-card"><h3>第 ${entry.input.day} 天，将有这些变化</h3><p class="change-reason">${esc(analysis.changeReason)}</p><ul class="change-list">${list(differences(day, analysis.proposedDay))}</ul><details class="subtle-details"><summary>查看完整前后方案</summary><div class="compare-grid">${comparisonHTML(day, '原来的安排')}${comparisonHTML(analysis.proposedDay, '建议的安排', true)}</div></details>${entry.appliedPlanId ? `<p class="applied-notice">✓ 已采用，保存为计划 V${applied?.version || '—'}。</p>` : stale ? '<p class="stale-notice">当前计划已更新，这份旧建议不能继续采用。请对当前计划重新反馈。</p>' : `<button type="button" class="primary" data-action="apply" data-id="${esc(entry.id)}" data-lock>采用这些调整 →</button><p class="helper">只更新这一天。确认后保存新版本，原版本保留。</p>`}</div>` : ''}
    ${progressHTML()}<details class="subtle-details"><summary>查看 AI 的分析依据</summary><div class="detail-body"><p>${esc(analysis.reasoning)}</p></div></details>
    ${analysis.followUp ? `<div class="followup-card"><strong>下一次，再留意一下</strong><p>${esc(analysis.followUp)}</p></div>` : ''}
    <details class="subtle-details feedback-record"><summary>查看我提交的反馈</summary><div class="detail-body"><p>实际 ${entry.input.completedSets} 组${entry.input.actualReps ? ` · ${esc(entry.input.actualReps)}` : ''}${entry.input.load ? ` · ${esc(entry.input.load)}` : ''}<br>${esc(labels.effort[entry.input.effort])} · ${esc(labels.discomfort[entry.input.discomfort])}</p>${entry.input.notes ? `<p>${esc(entry.input.notes)}</p>` : ''}${(entry.replies || []).map((reply, index) => `<h4>第 ${index + 1} 次补充</h4><p>${esc(reply.answer)}</p>`).join('')}</div></details><p class="helper">一般健身建议，不替代医学诊断或现场动作评估。</p><div class="dialog-actions"><button type="button" class="secondary" data-action="close-dialog">完成</button></div>`;
  showError('#feedback-error', entryErrors.get(entry.id));
}
function closeDialog() {
  captureFeedback();
  if (pending) {
    if (!window.confirm('AI 正在处理中。关闭会取消这次等待，填写的内容会保留。确定关闭吗？')) return;
    pending.closeAfter = routeInfo().base;
    pending.controller.abort();
    return;
  }
  navigate(routeInfo().base);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending) return;
  if (!validateStep(setupStep)) return;
  showError('#form-error');
  if (setupStep < 3) { navigate(`#setup/${setupStep + 1}`); return; }
  for (let step = 1; step <= 3; step += 1) {
    if (!validateStep(step, false)) { navigate(`#setup/${step}`, { replace: true }); validateStep(step); return; }
  }
  const profile = readProfile();
  const request = startPending('plan');
  let destination;
  try { const result = await postJSON('/api/plan', profile, request.controller.signal); adoptState(result.state, true); destination = '#training'; toast('你的计划准备好了。先看看第一天吧。'); }
  catch (error) { await requestError(error, '#form-error'); }
  finally { endPending(request); }
  if (destination) navigate(destination, { replace: true });
});
form.elements.notes.addEventListener('input', updateNotesCount);
form.addEventListener('change', updateSetupSummary);
document.addEventListener('submit', async (event) => {
  const targetForm = event.target;
  if (targetForm.id !== 'preset-start-form') return;
  event.preventDefault();
  if (pending || !targetForm.reportValidity()) return;
  showError('#preset-error');
  const data = { presetId: targetForm.dataset.presetId, experience: targetForm.elements.experience.value, eligibilityConfirmed: targetForm.elements.eligibilityConfirmed.checked };
  const request = startPending('preset');
  let adopted = false;
  try {
    const result = await postJSON('/api/preset', data, request.controller.signal);
    adoptState(result.state, true);
    populateProfile(state.profile);
    adopted = true;
    toast('预设计划已准备好。本次未调用 AI，0 token。');
  } catch (error) { await requestError(error, '#preset-error'); }
  finally { endPending(request); }
  if (adopted) navigate('#training');
});
$('#fill-example').addEventListener('click', () => {
  populateProfile({ age: 25, height: 175, weight: 68, sex: 'unspecified', goal: 'definition', experience: 'beginner', equipment: 'bodyweight', days: 3, minutes: 30, health: 'none', notes: '希望从基础动作开始，循序渐进地养成习惯。' });
  updateSetupSummary();
  toast('已试填示例资料。生成前，请改成你的真实情况。');
});
feedbackBody.addEventListener('input', (event) => { captureFeedback(event.target.name); if (event.target.name === 'answer' && dialogEntryId) replyDrafts.set(dialogEntryId, event.target.value); });
feedbackBody.addEventListener('change', (event) => captureFeedback(event.target.name));
feedbackBody.addEventListener('submit', async (event) => {
  const targetForm = event.target;
  if (!['feedback-form', 'reply-form'].includes(targetForm.id)) return;
  event.preventDefault();
  if (pending || !targetForm.reportValidity()) return;
  captureFeedback();
  const route = routeInfo();
  const isReply = targetForm.id === 'reply-form';
  if (!isReply && targetForm.dataset.step === '1') { route.params.set('step', '2'); navigate(`${route.base}?${route.params.toString()}`); return; }
  const draft = feedbackDrafts.get(dialogDraftKey);
  const entryId = isReply ? targetForm.dataset.id : null;
  const data = isReply ? { answer: targetForm.elements.answer.value.trim() } : { planId: draft.planId, day: draft.day, exerciseIndex: draft.exerciseIndex, completedSets: Number(draft.completedSets), actualReps: draft.actualReps, load: draft.load, effort: draft.effort, discomfort: draft.discomfort, notes: draft.notes };
  if (isReply && !data.answer) { showError('#feedback-error', '请先补充你的情况。'); return; }
  if (draft) draft.error = '';
  if (entryId) entryErrors.delete(entryId);
  showError('#feedback-error');
  const request = startPending(isReply ? 'reply' : 'feedback');
  let destination;
  try {
    const result = await postJSON(isReply ? `/api/feedback/${encodeURIComponent(entryId)}/reply` : '/api/feedback', data, request.controller.signal);
    adoptState(result.state);
    if (entryId) replyDrafts.delete(entryId);
    if (dialogDraftKey) feedbackDrafts.delete(dialogDraftKey);
    destination = `${route.base}?entry=${encodeURIComponent(result.entry.id)}`;
  } catch (error) { await requestError(error, '#feedback-error'); }
  finally { endPending(request); }
  if (request.closeAfter) { navigate(request.closeAfter); return; }
  if (destination) navigate(destination, { replace: true });
});
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
document.addEventListener('click', async (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (link?.getAttribute('href') === '#main') { event.preventDefault(); $('#main').focus(); return; }
  if (link && pending) { event.preventDefault(); toast(pending.scope === 'preset' ? '正在保存预设计划，请稍候。' : 'AI 正在处理中。请等待完成，或先取消。'); return; }
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'cancel-request') { pending?.controller.abort(); return; }
  if (action === 'close-dialog') { closeDialog(); return; }
  if (pending && action) { toast('请先等待当前请求完成，或取消这次请求。'); return; }
  if (action === 'start-exercise-deck') {
    button.closest('details').open = false;
    $('.deck-stage').focus({ preventScroll: true });
    $('.deck-workspace').scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    return;
  }
  if (action === 'preview-experience') {
    const selected = button.dataset.preview;
    if (!['plan', 'feedback', 'adjust'].includes(selected) || button.getAttribute('aria-pressed') === 'true') return;
    const content = $('#welcome-demo-content');
    cancelMotion(content);
    content.querySelectorAll('[data-demo-panel]').forEach((panel) => { panel.hidden = panel.dataset.demoPanel !== selected; });
    document.querySelectorAll('[data-action="preview-experience"]').forEach((control) => control.setAttribute('aria-pressed', String(control === button)));
    const note = {
      plan: ['每个起点，都值得被认真对待。', '目标、经验、时间，一起考虑。'],
      feedback: ['先听你说，再给建议。', '不清楚的地方，AI 会继续追问。'],
      adjust: ['计划可以变，进步慢慢来。', '保留旧版本，也看得见调整原因。'],
    }[selected];
    $('.demo-floating-note strong').textContent = note[0];
    $('.demo-floating-note p').textContent = note[1];
    reveal(content.querySelector('[data-demo-panel]:not([hidden])'), { distance: 7, duration: 260 });
    return;
  }
  if (action === 'open-presets') navigate('#presets');
  if (action === 'preview-preset') navigate(`#presets/${button.dataset.presetId}`);
  if (action === 'exit-presets') navigate(activeRecord() ? '#me' : '#welcome');
  if (action === 'preset-start-options') {
    $('.preset-start-panel').scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    $('#preset-fields select').focus({ preventScroll: true });
  }
  if (action === 'open-library') { libraryScroll = 0; navigate('#library'); }
  if (action === 'library-home') navigate(activeRecord() ? '#training' : '#welcome');
  if (action === 'back-library') navigate('#library');
  if (action === 'view-library-exercise') { libraryScroll = window.scrollY; navigate(`#library/${button.dataset.libraryId}`); }
  if (action === 'library-more') {
    const firstNewIndex = libraryLimit;
    libraryLimit += 24;
    updateLibraryResults();
    $('#library-grid').children[firstNewIndex]?.focus({ preventScroll: true });
  }
  if (action === 'reset-library') {
    Object.keys(libraryFilters).forEach((key) => { libraryFilters[key] = ''; });
    libraryLimit = 24;
    ['#library-query', '#library-bodypart', '#library-equipment', '#library-level'].forEach((selector) => { $(selector).value = ''; });
    updateLibraryResults();
    $('#library-query').focus({ preventScroll: true });
  }
  if (action === 'start-setup') { showError('#form-error'); navigate('#setup/1'); void refreshStatus(); }
  if (action === 'exit-setup') navigate(activeRecord() ? '#me' : '#welcome');
  if (action === 'setup-back') { showError('#form-error'); navigate(`#setup/${Math.max(1, setupStep - 1)}`); }
  if (action === 'select-day') navigate(`#training/${button.dataset.day}`, { replace: true });
  if (action === 'view-session') navigate(`#session/${button.dataset.day}`);
  if (action === 'back-training') navigate(`#training/${currentDay}`);
  if (action === 'records-tab') navigate(`#records/${button.dataset.tab}`, { replace: true });
  if (action === 'check-connection') await refreshStatus(true);
  if (action === 'feedback') openFeedback(Number(button.dataset.day), button.dataset.exercise);
  if (action === 'feedback-back') { captureFeedback(); const route = routeInfo(); route.params.set('step', '1'); navigate(`${route.base}?${route.params.toString()}`); }
  if (action === 'view-feedback') navigate(`${routeInfo().base}?entry=${encodeURIComponent(button.dataset.id)}`);
  if (action === 'apply') {
    const id = button.dataset.id;
    showError('#feedback-error');
    entryErrors.delete(id);
    const request = startPending('apply');
    try { const result = await postJSON(`/api/feedback/${encodeURIComponent(id)}/apply`, {}, request.controller.signal); adoptState(result.state); toast('已采用调整，新版本已保存。'); }
    catch (error) { await requestError(error, '#feedback-error'); }
    finally { endPending(request); }
    if (request.closeAfter) navigate(request.closeAfter);
    else renderRoute();
  }
  if (action === 'reset') {
    if (!window.confirm('清空这台电脑上的全部 eboji 资料、计划版本、训练反馈，以及此浏览器的卡组进度和训练足迹？此操作无法撤销。')) return;
    const request = startPending('reset');
    let cleared = false;
    try { const result = await postJSON('/api/reset', {}, request.controller.signal); adoptState(result.state); sessionDeck?.destroy(); sessionDeck = null; const progressCleared = clearWorkoutProgress(); form.reset(); updateNotesCount(); feedbackDrafts.clear(); replyDrafts.clear(); entryErrors.clear(); cleared = true; toast(progressCleared ? '本地资料、记录与训练足迹已清空。' : '资料与记录已清空；浏览器暂时无法清除卡组进度和足迹。'); }
    catch (error) { await requestError(error, '#account-error'); }
    finally { endPending(request); }
    if (cleared) navigate('#welcome', { replace: true });
  }
});
document.addEventListener('toggle', (event) => {
  if (event.target.matches?.('.exercise-item')) syncExerciseDemos();
}, true);
document.addEventListener('input', (event) => {
  if (event.target.id !== 'library-query') return;
  libraryFilters.query = event.target.value;
  libraryLimit = 24;
  updateLibraryResults();
});
document.addEventListener('change', (event) => {
  const key = { 'library-bodypart': 'bodyPart', 'library-equipment': 'equipment', 'library-level': 'level' }[event.target.id];
  if (!key) return;
  libraryFilters[key] = event.target.value;
  libraryLimit = 24;
  updateLibraryResults();
});
initDisclosures();
window.addEventListener('hashchange', renderRoute);
async function init() {
  await Promise.allSettled([
    (async () => { try { connection.token = (await readJSON('/api/session')).token; } catch { /* Saving can retry the local session without checking AI. */ } })(),
    (async () => { try { const saved = await readJSON('/api/state'); adoptState(saved, true); populateProfile(saved.profile); } catch (error) { showError('#global-error', `读取本地记录失败。${error.message}`); } })(),
  ]);
  loaded = true;
  renderRoute();
}
init();
