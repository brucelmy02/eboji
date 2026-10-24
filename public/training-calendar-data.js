const FIRST_YEAR = 2000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDateParts(year, month, day) {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function asDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  if (typeof value === 'number') return Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null;
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(value);
  if (!parts || !validDateParts(Number(parts[1]), Number(parts[2]), Number(parts[3]))) return null;
  if (!parts[4]) {
    // Date-only strings describe a local calendar day, never UTC midnight.
    const date = new Date(0);
    date.setFullYear(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    date.setHours(12, 0, 0, 0);
    return date;
  }
  if (!/^T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(parts[4])) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Calendar key in the viewer's local timezone. Invalid values never become today. */
export function localDateKey(value = new Date()) {
  const date = asDate(value);
  if (!date || date.getFullYear() < 1 || date.getFullYear() > 9999) return null;
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validDay(value) {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function recordTime(value, now) {
  if (typeof value !== 'string' || !value.includes('T')) return null;
  const date = asDate(value);
  return date && date.getTime() <= now.getTime() ? date.toISOString() : null;
}

/**
 * Binary training calendar, with Monday-first complete weeks. A day can contain
 * both a set event and feedback about that set; these are not added into a total.
 * `weeks` is the number of columns and `days` is ordered one week at a time.
 */
export function buildTrainingCalendar({ year, now = new Date(), events = [], feedback = [], plans = [] } = {}) {
  const clock = asDate(now);
  if (!clock || clock.getFullYear() < FIRST_YEAR || clock.getFullYear() > 9999) {
    throw new TypeError('Training calendar requires a valid current date.');
  }
  const currentYear = clock.getFullYear();
  const selectedYear = Number.isInteger(year) && year >= FIRST_YEAR && year <= currentYear ? year : currentYear;
  const today = localDateKey(clock);
  const planById = new Map((Array.isArray(plans) ? plans : [])
    .filter(plan => isRecord(plan) && validId(plan.id)).map(plan => [plan.id, plan]));
  const entriesByDate = new Map();
  const seenEvents = new Set();
  const seenFeedback = new Set();
  let minYear = Math.max(FIRST_YEAR, currentYear - 1);

  function add(date, entry) {
    if (!date || date < `${FIRST_YEAR}-01-01` || date > today) return;
    minYear = Math.min(minYear, Number(date.slice(0, 4)));
    if (!entriesByDate.has(date)) entriesByDate.set(date, []);
    entriesByDate.get(date).push(entry);
  }

  for (const event of Array.isArray(events) ? events : []) {
    if (!isRecord(event) || !validId(event.id) || seenEvents.has(event.id) || !planById.has(event.planId) ||
      !validDay(event.day) || !Number.isInteger(event.exerciseIndex) || event.exerciseIndex < 0 ||
      typeof event.exerciseName !== 'string' || !event.exerciseName.trim() ||
      typeof event.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || localDateKey(event.date) !== event.date) continue;
    const createdAt = recordTime(event.createdAt, clock);
    if (!createdAt || event.date < `${FIRST_YEAR}-01-01` || event.date > today) continue;
    seenEvents.add(event.id);
    // Preserve the local date recorded at the moment of the action, even after travel.
    add(event.date, { id: event.id, type: 'set', label: event.exerciseName.trim(), planId: event.planId, day: event.day, createdAt });
  }

  for (const entry of Array.isArray(feedback) ? feedback : []) {
    if (!isRecord(entry) || !validId(entry.id) || seenFeedback.has(entry.id) || !planById.has(entry.planId) ||
      !isRecord(entry.input) || !validDay(entry.input.day) ||
      !Number.isInteger(entry.input.completedSets) || entry.input.completedSets <= 0) continue;
    const createdAt = recordTime(entry.createdAt, clock);
    const date = createdAt && localDateKey(createdAt);
    if (!date || date < `${FIRST_YEAR}-01-01` || date > today) continue;
    const plan = planById.get(entry.planId).plan;
    const day = Array.isArray(plan?.days) ? plan.days.find(item => item?.day === entry.input.day) : null;
    const exercise = Number.isInteger(entry.input.exerciseIndex) && entry.input.exerciseIndex >= 0 && Array.isArray(day?.exercises)
      ? day.exercises[entry.input.exerciseIndex] : null;
    const label = typeof exercise?.name === 'string' && exercise.name.trim()
      ? exercise.name : `${typeof plan?.title === 'string' && plan.title.trim() ? plan.title : '训练计划'} · 第 ${entry.input.day} 天`;
    seenFeedback.add(entry.id);
    add(date, { id: entry.id, type: 'feedback', label, completedSets: entry.input.completedSets, planId: entry.planId, day: entry.input.day, createdAt });
  }

  for (const entries of entriesByDate.values()) {
    entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.type.localeCompare(right.type) || left.id.localeCompare(right.id));
  }

  const start = new Date(selectedYear, 0, 1, 12);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(selectedYear, 11, 31, 12);
  end.setDate(end.getDate() + (6 - (end.getDay() + 6) % 7));
  const cursor = new Date(start);
  const days = [];
  const months = [];
  const activeMonthKeys = new Set();
  let activeDays = 0;
  while (cursor <= end) {
    const date = localDateKey(cursor);
    const inYear = cursor.getFullYear() === selectedYear;
    const isFuture = date > today;
    const entries = inYear && !isFuture ? (entriesByDate.get(date) || []) : [];
    const active = entries.length > 0;
    if (active) { activeDays += 1; activeMonthKeys.add(date.slice(0, 7)); }
    if (inYear && cursor.getDate() === 1) months.push({ label: `${cursor.getMonth() + 1}月`, column: Math.floor(days.length / 7) + 1 });
    days.push({ date, dayOfWeek: (cursor.getDay() + 6) % 7, inYear, isFuture, isToday: date === today, active, entries });
    // Calendar arithmetic keeps DST transitions from skipping or repeating a day.
    cursor.setDate(cursor.getDate() + 1);
  }
  return { year: selectedYear, today, currentYear, minYear, days, months, weeks: days.length / 7, activeDays, activeMonths: activeMonthKeys.size };
}
