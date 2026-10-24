import { readWorkoutActivity } from './workout-activity.js';
import { buildTrainingCalendar } from './training-calendar-data.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const dateLabel = date => {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}年${month}月${day}日`;
};
const dayDescription = day => `${dateLabel(day.date)}${day.isToday ? '，今天' : ''}，${day.isFuture ? '尚未到来' : day.active ? '有训练记录' : '暂无训练记录'}`;

/** A local calendar view. Reading it never marks a training day or calls AI. */
export function mountTrainingCalendar(host, { getData, onViewFeedback, onViewTraining }) {
  const abort = new AbortController();
  let year = new Date().getFullYear();
  let selected = null;
  let model;
  let midnightTimer;
  let destroyed = false;
  let storageAvailable = true;
  host.classList.add('training-calendar');

  function revealSelection(behavior = 'instant') {
    const scroll = host.querySelector('.calendar-scroll');
    const cell = host.querySelector('.calendar-day.is-selected');
    if (!scroll || !cell) return;
    const box = scroll.getBoundingClientRect();
    const position = cell.getBoundingClientRect();
    if (position.left < box.left + 35 || position.right > box.right - 16) {
      const offset = position.left < box.left + 35 ? position.left - box.left - 35 : position.right - box.right + 16;
      scroll.scrollTo({ left: Math.max(0, scroll.scrollLeft + offset), behavior });
    }
  }

  function renderDetails() {
    const day = model.days.find(item => item.date === selected);
    if (!day) return;
    const grouped = new Map();
    const feedback = [];
    for (const entry of day.entries) {
      if (entry.type === 'feedback') { feedback.push(entry); continue; }
      const key = `${entry.planId}:${entry.day}:${entry.label}`;
      const item = grouped.get(key) || { ...entry, sets: 0 };
      item.sets += 1;
      grouped.set(key, item);
    }
    const { activePlanId } = getData();
    const rows = [
      ...[...grouped.values()].map(entry => `<li><div><strong>${escape(entry.label)}</strong><p>完成 ${entry.sets} 组 · 卡组记录${entry.planId !== activePlanId ? ' · 历史计划' : ''}</p></div>${entry.planId === activePlanId ? `<button type="button" class="text-button" data-calendar-training="${entry.day}">查看动作 <span aria-hidden="true">↗</span></button>` : ''}</li>`),
      ...feedback.map(entry => `<li><div><strong>${escape(entry.label)}</strong><p>训练反馈 · 记录完成 ${entry.completedSets} 组</p></div><button type="button" class="text-button" data-calendar-feedback="${escape(entry.id)}">查看反馈 <span aria-hidden="true">↗</span></button></li>`),
    ];
    host.querySelector('.calendar-detail').innerHTML = `<div class="calendar-detail-heading"><h3>${dateLabel(day.date)}${day.isToday ? '<span>今天</span>' : ''}</h3><span class="calendar-day-status${day.active ? ' is-active' : ''}">${day.active ? '有训练记录' : '暂无训练记录'}</span></div>${rows.length ? `<ul class="calendar-detail-list">${rows.join('')}</ul>` : `<p class="calendar-empty">${day.isToday ? '今天还没有训练记录。完成一组练习，就会点亮这个格子。' : '这一天没有训练记录。'}</p>`}`;
  }

  function selectDay(date, focus = false) {
    const day = model.days.find(item => item.date === date);
    if (!day?.inYear || day.isFuture) return;
    selected = date;
    for (const cell of host.querySelectorAll('.calendar-day[data-date]')) {
      const current = cell.dataset.date === date;
      cell.classList.toggle('is-selected', current);
      cell.setAttribute('aria-pressed', String(current));
      cell.tabIndex = current ? 0 : -1;
    }
    renderDetails();
    if (focus) host.querySelector('.calendar-day.is-selected').focus({ preventScroll: true });
    revealSelection();
    host.querySelector('.calendar-announcement').textContent = dayDescription(day);
  }

  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = setTimeout(() => refresh(true), Math.max(1000, next - now + 100));
  }

  function refresh(followToday = false) {
    if (destroyed) return;
    const data = getData();
    const history = readWorkoutActivity();
    storageAvailable = history.storageAvailable;
    const previousToday = model?.today;
    const focusedDate = host.contains(document.activeElement) ? document.activeElement?.dataset.date : null;
    if (followToday && year === model?.currentYear) year = new Date().getFullYear();
    model = buildTrainingCalendar({ year, now: new Date(), events: history.events, feedback: data.feedback, plans: data.plans });
    year = model.year;
    if (followToday && selected === previousToday) selected = model.today;
    if (!model.days.some(day => day.date === selected && day.inYear && !day.isFuture)) {
      selected = year === model.currentYear ? model.today : model.days.filter(day => day.inYear && day.active).at(-1)?.date || `${year}-12-31`;
    }
    host.innerHTML = `<div class="calendar-heading"><div><p class="eyebrow">每一次练习，都留下痕迹</p><h2>训练足迹</h2><p>有训练记录的日子，会亮起绿色。</p></div><div class="calendar-year-controls" aria-label="选择训练记录年份"><button type="button" class="icon-button" data-calendar-year="previous" aria-label="查看上一年"${year <= model.minYear ? ' disabled' : ''}>←</button><strong>${year}</strong><button type="button" class="icon-button" data-calendar-year="next" aria-label="查看下一年"${year >= model.currentYear ? ' disabled' : ''}>→</button></div></div>
      <div class="calendar-stats"><div><strong>${model.activeDays}</strong><span>天有训练记录</span></div><div><strong>${model.activeMonths}</strong><span>个月留下足迹</span></div></div>
      <div class="calendar-scroll" aria-label="全年训练网格，可横向滚动"><div class="calendar-chart"><div class="calendar-months" aria-hidden="true">${model.months.map(month => `<span data-month-column="${month.column}">${escape(month.label)}</span>`).join('')}</div><div class="calendar-body"><div class="calendar-weekdays" aria-hidden="true">${['一', '', '三', '', '五', '', '日'].map(label => `<span>${label}</span>`).join('')}</div><div class="calendar-grid" role="group" aria-label="${year} 年每日训练记录，左右键切换周，上下键切换日期">${model.days.map(day => !day.inYear ? '<span class="calendar-day is-padding" aria-hidden="true"></span>' : `<button type="button" class="calendar-day${day.active ? ' is-active' : ''}${day.isToday ? ' is-today' : ''}${day.date === selected ? ' is-selected' : ''}" data-date="${day.date}" title="${dayDescription(day)}" aria-label="${dayDescription(day)}" aria-pressed="${day.date === selected}" tabindex="${day.date === selected ? '0' : '-1'}"${day.isToday ? ' aria-current="date"' : ''}${day.isFuture ? ' disabled' : ''}></button>`).join('')}</div></div></div></div>
      <div class="calendar-legend"><span>每格一天 · 点击查看</span><div><span><i aria-hidden="true"></i>无记录</span><span><i class="is-active" aria-hidden="true"></i>有训练</span></div></div>
      <section class="calendar-detail" aria-label="所选日期的训练记录"></section>
      <p class="calendar-note">按本机日期统计。卡组完成至少 1 组，或反馈的完成组数大于 0，即点亮当天；同一天只计一次。卡组足迹保存在当前浏览器，不消耗 AI 额度。</p>${!storageAvailable ? '<p class="calendar-storage-warning">浏览器暂时无法读取或保存卡组足迹，网格仍会显示已保存的训练反馈。</p>' : ''}
      <p class="calendar-announcement sr-only" role="status" aria-live="polite"></p>`;
    host.style.setProperty('--weeks', model.weeks);
    for (const label of host.querySelectorAll('[data-month-column]')) label.style.gridColumn = label.dataset.monthColumn;
    renderDetails();
    revealSelection();
    if (focusedDate && model.days.some(day => day.date === focusedDate && day.inYear && !day.isFuture)) selectDay(focusedDate, true);
    scheduleMidnight();
  }

  host.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !host.contains(button) || button.disabled) return;
    if (button.dataset.date) selectDay(button.dataset.date);
    if (button.dataset.calendarYear) {
      year = Math.max(model.minYear, Math.min(model.currentYear, year + (button.dataset.calendarYear === 'previous' ? -1 : 1)));
      selected = null;
      refresh();
      host.querySelector('.calendar-day.is-selected')?.focus({ preventScroll: true });
    }
    if (button.dataset.calendarFeedback) onViewFeedback(button.dataset.calendarFeedback);
    if (button.dataset.calendarTraining) onViewTraining(Number(button.dataset.calendarTraining));
  }, { signal: abort.signal });
  host.addEventListener('keydown', event => {
    const cell = event.target.closest('.calendar-day[data-date]');
    if (!cell || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const offset = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
    let day;
    if (offset) day = model.days[model.days.findIndex(item => item.date === cell.dataset.date) + offset];
    else if (event.key === 'Home') day = model.days.find(item => item.inYear);
    else if (event.key === 'End') day = model.days.filter(item => item.inYear && !item.isFuture).at(-1);
    else return;
    event.preventDefault();
    if (day) selectDay(day.date, true);
  }, { signal: abort.signal });
  window.addEventListener('storage', event => { if (!event.key || event.key.startsWith('eboji:')) refresh(true); }, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); }, { signal: abort.signal });
  window.addEventListener('resize', () => revealSelection(), { signal: abort.signal });
  refresh();
  return { refresh, destroy() { destroyed = true; clearTimeout(midnightTimer); abort.abort(); } };
}
