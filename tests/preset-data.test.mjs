import test from 'node:test';
import assert from 'node:assert/strict';
import { presetPlans, findPresetPlan, presetReferenceUrls } from '../public/preset-plans.js';
import { findCatalogExercise } from '../public/exercise-catalog.js';
import { getExerciseAnimation } from '../public/exercise-animation.js';
import { validatePlan, validateProfile } from '../lib/plan.mjs';

test('three distinct presets have complete, valid first-week plans for their published limits', () => {
  assert.deepEqual(presetPlans.map(preset => preset.id), ['gentle-bodyweight', 'bodyweight-foundation', 'dumbbell-foundation']);
  assert.equal(new Set(presetPlans.map(preset => preset.title)).size, 3);
  for (const preset of presetPlans) {
    assert.equal(preset.level, '入门');
    assert.equal(preset.highlights.length, 3);
    assert.ok(preset.description.trim());
    const profile = validateProfile({
      age: 28, height: 170, weight: 65, sex: 'unspecified',
      goal: preset.goal, equipment: preset.equipment,
      days: preset.days, minutes: preset.minutes,
      experience: 'beginner', health: 'none', notes: '',
    });
    assert.equal(validatePlan(preset.plan, profile), preset.plan);
    // Preset adoption does not need invented measurements to validate its plan.
    assert.equal(validatePlan(preset.plan, { days: preset.days, minutes: preset.minutes, health: 'none' }), preset.plan);
    assert.match(preset.plan.summary, /第一周/);
    assert.match(preset.plan.summary, /未按个人资料定制/);
    assert.throws(() => validatePlan(preset.plan, { ...profile, health: 'needs_review' }), { code: 'INVALID_PLAN' });
  }
});

test('preset exercises resolve to exact beginner catalog entries and animations without extra equipment', () => {
  for (const preset of presetPlans) {
    const movements = preset.plan.days.flatMap(day => day.exercises);
    for (const movement of movements) {
      const exercise = findCatalogExercise(movement.name);
      assert.ok(exercise, movement.name);
      assert.equal(movement.name, exercise.name, 'prescriptions use canonical names rather than aliases');
      assert.equal(exercise.level, 'beginner', movement.name);
      assert.ok(['none', 'wall'].includes(exercise.support), movement.name);
      assert.ok(getExerciseAnimation(exercise.id), movement.name);
      if (preset.equipment === 'bodyweight') assert.equal(exercise.equipment, 'bodyweight', movement.name);
      else assert.ok(['bodyweight', 'dumbbells'].includes(exercise.equipment), movement.name);
      if (exercise.unilateral) assert.match(movement.reps, /每侧/, movement.name);
    }
    if (preset.equipment === 'dumbbells') {
      assert.ok(preset.plan.days.filter(day => day.type === 'training').every(day => day.exercises.some(movement => findCatalogExercise(movement.name).equipment === 'dumbbells')));
    }
  }
});

test('training has recovery gaps, modest dosage and room for preparation within the session window', () => {
  for (const preset of presetPlans) {
    const training = preset.plan.days.filter(day => day.type === 'training');
    assert.equal(training.length, preset.days);
    for (let index = 0; index < training.length; index += 1) {
      const day = training[index];
      assert.ok(day.exercises.length >= 4 && day.exercises.length <= 5);
      if (index) assert.ok(day.day - training[index - 1].day >= 2, 'whole-body sessions are separated by recovery');
      let budget = 8 * 60 + day.exercises.length * 30; // Warmup/cooldown plus setup/rehearsal allowance.
      day.exercises.forEach((movement, movementIndex) => {
        assert.ok(movement.sets >= 1 && movement.sets <= 2, movement.name);
        assert.ok(movement.restSeconds >= 45 && movement.restSeconds <= 90);
        const dose = Number(movement.reps.match(/\d+/)?.[0]);
        assert.ok(Number.isFinite(dose) && dose > 0);
        if (movement.reps.includes('秒')) assert.ok(dose <= 20, movement.name);
        else assert.ok(dose <= 10, movement.name);
        const eachSide = /每侧/.test(movement.reps) ? 2 : 1;
        const work = dose * eachSide * (movement.reps.includes('秒') ? 1 : 4);
        budget += work * movement.sets + (movement.sets - 1) * movement.restSeconds;
        if (movementIndex) budget += 60; // The published optional rest between movements.
      });
      assert.ok(budget <= day.minutes * 60, `${preset.id}, day ${day.day}: basic timing budget exceeds the window`);
    }
    assert.ok(7 + training[0].day - training.at(-1).day >= 2, 'the final session also leaves recovery before a repeated week');
    for (const recovery of preset.plan.days.filter(day => day.type === 'recovery')) {
      assert.equal(recovery.minutes, 0);
      assert.deepEqual(recovery.exercises, []);
    }
  }
});

test('templates remain immutable and cloned plans can change without contaminating later selections', () => {
  for (const preset of presetPlans) {
    assert.equal(findPresetPlan(preset.id), preset);
    const snapshot = JSON.stringify(preset);
    assert.throws(() => { preset.plan.days[0].exercises[0].sets = 99; }, TypeError);
    assert.throws(() => { preset.highlights.push('changed'); }, TypeError);
    const copy = structuredClone(preset.plan);
    copy.days[0].exercises[0].sets = 1;
    copy.days[0].exercises[0].cue = '独立记录中的调整';
    assert.equal(JSON.stringify(findPresetPlan(preset.id)), snapshot);
  }
  for (const id of [undefined, null, '', '__proto__', 'constructor', {}, ['gentle-bodyweight'], 'GENTLE-BODYWEIGHT', ' gentle-bodyweight ']) {
    assert.equal(findPresetPlan(id), null);
  }
  assert.equal(presetReferenceUrls.length, 2);
  assert.ok(presetReferenceUrls.every(url => ['www.cdc.gov', 'www.mayoclinic.org'].includes(new URL(url).hostname)));
});
