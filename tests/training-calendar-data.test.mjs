import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { localDateKey, buildTrainingCalendar } from '../public/training-calendar-data.js';

const now = new Date(2026, 9, 23, 12, 0, 0);
const plans = [{ id: 'plan-one', plan: { title: '居家全身计划', days: [
  { day: 1, title: '全身基础', exercises: [{ name: '徒手深蹲' }, { name: '跪姿俯卧撑' }] },
] } }];
const iso = (year, month, day, hour = 8, minute = 0) => new Date(year, month - 1, day, hour, minute).toISOString();
const setEvent = (overrides = {}) => ({ id: 'set-one', date: '2026-10-23', createdAt: iso(2026, 10, 23), planId: 'plan-one', day: 1, exerciseIndex: 0, exerciseName: '徒手深蹲', ...overrides });
const feedbackEntry = (overrides = {}, input = {}) => ({ id: 'feedback-one', planId: 'plan-one', createdAt: iso(2026, 10, 23, 9), input: { day: 1, exerciseIndex: 0, completedSets: 2, ...input }, ...overrides });
const calendar = (overrides = {}) => buildTrainingCalendar({ now, plans, ...overrides });
const dayAt = (result, date) => result.days.find(day => day.date === date);

test('local date keys use local midnight and do not normalize invalid dates', () => {
  assert.equal(localDateKey(new Date(2026, 9, 23, 0, 1)), '2026-10-23');
  assert.equal(localDateKey(new Date(2026, 9, 23, 23, 59)), '2026-10-23');
  assert.equal(localDateKey(iso(2026, 10, 23, 0)), '2026-10-23');
  assert.equal(localDateKey('2024-02-29'), '2024-02-29');
  for (const value of [null, false, {}, NaN, Infinity, new Date('invalid'), '', '2026-02-29', '2026-02-30T00:00:00Z', '2026-13-01', '2026-01-00', '2026-01-01Tbad', '2026-1-1']) {
    assert.equal(localDateKey(value), null, `rejects ${String(value)}`);
  }
});

test('date-only keys remain local in western and eastern timezones across DST', () => {
  const moduleURL = new URL('../public/training-calendar-data.js', import.meta.url).href;
  const source = `import { localDateKey, buildTrainingCalendar } from ${JSON.stringify(moduleURL)};
    const midnight = new Date(2026, 9, 23, 0, 1);
    const calendar = buildTrainingCalendar({ now: new Date(2026, 11, 31, 23), year: 2026 });
    console.log(JSON.stringify({ dateOnly: localDateKey('2026-10-23'), midnight: localDateKey(midnight.toISOString()), unique: new Set(calendar.days.map(day => day.date)).size, total: calendar.days.length, inYear: calendar.days.filter(day => day.inYear).length }));`;
  for (const TZ of ['America/Los_Angeles', 'Asia/Shanghai']) {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ }, encoding: 'utf8' }));
    assert.equal(result.dateOnly, '2026-10-23', TZ);
    assert.equal(result.midnight, '2026-10-23', TZ);
    assert.equal(result.inYear, 365, TZ);
    assert.equal(result.unique, result.total, TZ);
  }
});

test('complete Monday-to-Sunday weeks include leap days and month column positions', () => {
  const result = calendar({ year: 2024 });
  assert.equal(result.days[0].date, '2024-01-01');
  assert.equal(result.days.at(-1).date, '2025-01-05');
  assert.equal(result.days[0].dayOfWeek, 0);
  assert.equal(result.days.at(-1).dayOfWeek, 6);
  assert.equal(result.days.filter(day => day.inYear).length, 366);
  assert.equal(result.weeks, 53);
  assert.equal(result.days.length, result.weeks * 7);
  assert.equal(dayAt(result, '2024-02-29').inYear, true);
  assert.deepEqual(result.months.slice(0, 3), [{ label: '1月', column: 1 }, { label: '2月', column: 5 }, { label: '3月', column: 9 }]);
  for (const [index, day] of result.days.entries()) assert.equal(day.dayOfWeek, index % 7);
});

test('Sunday-start leap years correctly produce 54 weeks', () => {
  const result = calendar({ year: 2012 });
  assert.equal(result.days[0].date, '2011-12-26');
  assert.equal(result.days.at(-1).date, '2013-01-06');
  assert.equal(result.days.filter(day => day.inYear).length, 366);
  assert.equal(result.weeks, 54);
});

test('one or many set and feedback records make exactly one active day', () => {
  const event = setEvent();
  const result = calendar({ events: [event, event, setEvent({ id: 'set-two' })], feedback: [feedbackEntry(), feedbackEntry()] });
  const day = dayAt(result, '2026-10-23');
  assert.equal(result.activeDays, 1);
  assert.equal(result.activeMonths, 1);
  assert.equal(day.active, true);
  assert.equal(day.isToday, true);
  assert.equal(day.entries.length, 3);
  assert.equal(day.entries.filter(entry => entry.type === 'set').length, 2);
  assert.equal(day.entries.filter(entry => entry.type === 'feedback').length, 1);
  assert.equal(Object.hasOwn(day, 'completedSets'), false, 'no double-counted set total');
});

test('feedback without a positive integer completed set count does not create activity', () => {
  const feedback = [0, -1, 0.5, '2', null, undefined, NaN].map((completedSets, index) => feedbackEntry({ id: `invalid-${index}` }, { completedSets }));
  assert.equal(calendar({ feedback }).activeDays, 0);
  assert.equal(calendar({ feedback: [...feedback, feedbackEntry({}, { completedSets: 1 })] }).activeDays, 1);
});

test('orphan records disappear when their plan is absent, including after a data reset', () => {
  assert.equal(calendar({ events: [setEvent({ planId: 'deleted' })], feedback: [feedbackEntry({ planId: 'deleted' })] }).activeDays, 0);
  const result = calendar({ plans: [], events: [setEvent()], feedback: [feedbackEntry()] });
  assert.equal(result.activeDays, 0);
  assert.equal(result.minYear, 2025);
});

test('future dates and future timestamps are never active, including later today', () => {
  const result = calendar({
    events: [setEvent({ date: '2026-10-24' }), setEvent({ id: 'later', createdAt: iso(2026, 10, 23, 13) })],
    feedback: [feedbackEntry({ createdAt: iso(2026, 10, 23, 13) }), feedbackEntry({ id: 'tomorrow', createdAt: iso(2026, 10, 24) })],
  });
  assert.equal(result.activeDays, 0);
  assert.equal(dayAt(result, '2026-10-24').isFuture, true);
  assert.deepEqual(dayAt(result, '2026-10-24').entries, []);
  assert.equal(dayAt(result, '2026-10-23').isFuture, false);
});

test('neighboring-year padding never displays activity from that year', () => {
  const result = calendar({ year: 2025, events: [setEvent({ date: '2024-12-30', createdAt: iso(2024, 12, 30) }), setEvent({ id: 'next-year', date: '2026-01-02', createdAt: iso(2026, 1, 2) })] });
  for (const date of ['2024-12-30', '2026-01-02']) {
    assert.equal(dayAt(result, date).inYear, false);
    assert.equal(dayAt(result, date).active, false);
    assert.deepEqual(dayAt(result, date).entries, []);
  }
  assert.equal(result.activeDays, 0);
  assert.equal(result.minYear, 2024);
});

test('earliest qualifying year includes old training but always leaves the last year accessible', () => {
  assert.equal(calendar().minYear, 2025);
  assert.equal(calendar({ events: [setEvent()] }).minYear, 2025);
  const result = calendar({ events: [setEvent({ date: '2020-06-02', createdAt: iso(2020, 6, 2) })], feedback: [feedbackEntry({ createdAt: iso(2018, 7, 3) })] });
  assert.equal(result.minYear, 2018);
  assert.equal(calendar({ events: [setEvent({ date: '1999-06-02', createdAt: iso(1999, 6, 2) })] }).minYear, 2025);
  assert.equal(buildTrainingCalendar({ now: new Date(2000, 0, 2) }).minYear, 2000);
});

test('selected year and distinct active months never inflate the day count', () => {
  const events = [setEvent(), setEvent({ id: 'october-2', date: '2026-10-20', createdAt: iso(2026, 10, 20) }), setEvent({ id: 'september', date: '2026-09-01', createdAt: iso(2026, 9, 1) }), setEvent({ id: 'past-year', date: '2025-10-01', createdAt: iso(2025, 10, 1) })];
  assert.equal(calendar({ events }).activeDays, 3);
  assert.equal(calendar({ events }).activeMonths, 2);
  assert.equal(calendar({ events, year: 2025 }).activeDays, 1);
  for (const year of [undefined, null, '2025', 1999, 2027, NaN, 2025.5]) assert.equal(calendar({ year }).year, 2026);
  assert.equal(calendar({ year: 2000 }).year, 2000);
});

test('preserved action dates do not shift after changing timezone; feedback uses local submission date', () => {
  const result = calendar({ events: [setEvent({ date: '2026-10-22', createdAt: iso(2026, 10, 23, 0) })], feedback: [feedbackEntry({ createdAt: iso(2026, 10, 23, 0) })] });
  assert.equal(dayAt(result, '2026-10-22').entries[0].type, 'set');
  assert.equal(dayAt(result, '2026-10-23').entries[0].type, 'feedback');
  assert.equal(result.activeDays, 2);
});

test('entries contain readable labels and sort chronologically without mutating inputs', () => {
  const events = [setEvent({ createdAt: iso(2026, 10, 23, 10) })];
  const feedback = [feedbackEntry({ id: 'whole-session', createdAt: iso(2026, 10, 23, 9) }, { exerciseIndex: null }), feedbackEntry({ id: 'exercise', createdAt: iso(2026, 10, 23, 8) }, { exerciseIndex: 1 }), feedbackEntry({ id: 'unknown-exercise', createdAt: iso(2026, 10, 23, 11) }, { exerciseIndex: 99 })];
  const original = structuredClone({ events, feedback, plans });
  const entries = dayAt(calendar({ events, feedback }), '2026-10-23').entries;
  assert.deepEqual(entries.map(entry => entry.id), ['exercise', 'whole-session', 'set-one', 'unknown-exercise']);
  assert.equal(entries[0].label, '跪姿俯卧撑');
  assert.equal(entries[1].label, '居家全身计划 · 第 1 天');
  assert.equal(entries[3].label, '居家全身计划 · 第 1 天');
  entries[2].label = 'changed output';
  assert.deepEqual({ events, feedback, plans }, original);
});

test('malformed records and collections cannot fabricate activity', () => {
  const invalidEvents = [null, [], {}, setEvent({ date: '2026-02-30' }), setEvent({ id: '' }), setEvent({ day: 0 }), setEvent({ exerciseIndex: -1 }), setEvent({ exerciseName: '' }), setEvent({ createdAt: 'not-a-date' })];
  const invalidFeedback = [null, {}, feedbackEntry({ createdAt: '2026-02-30T00:00:00Z' }), feedbackEntry({ id: '' }), feedbackEntry({}, { day: 8 })];
  assert.equal(calendar({ events: invalidEvents, feedback: invalidFeedback }).activeDays, 0);
  assert.equal(calendar({ events: {}, feedback: null, plans: false }).activeDays, 0);
  assert.throws(() => calendar({ now: new Date('invalid') }), TypeError);
});
