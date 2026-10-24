import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseCatalog } from '../public/exercise-catalog.js';
import { createCatalogContext, getEligibleExercises } from '../lib/exercise-catalog.mjs';
import { createPrompt, validatePlan } from '../lib/plan.mjs';
import { createFeedbackPrompt, validateAnalysis } from '../lib/feedback.mjs';
import { makeProfile, makePlan, makeFeedback, makeAdjustment } from './fixtures.mjs';

function candidatesIn(prompt) {
  return JSON.parse(prompt.split('适用动作候选（JSON 数据）：\n')[1].split('\n\n用户资料')[0]);
}

test('home bodyweight beginners receive only beginner bodyweight candidates', () => {
  const profile = makeProfile();
  const candidates = getEligibleExercises(profile);
  assert.ok(candidates.length > 10);
  assert.ok(candidates.every((exercise) => exercise.equipment === 'bodyweight' && exercise.level === 'beginner'));
  assert.ok(candidates.every((exercise) => ['none', 'wall'].includes(exercise.support)));
  assert.equal(candidates.some((exercise) => exercise.equipment === 'dumbbells'), false);
  assert.equal(candidates.some((exercise) => exercise.level === 'intermediate'), false);
  assert.deepEqual(candidatesIn(createPrompt(profile)), createCatalogContext(profile));
});

test('dumbbell and gym profiles also retain bodyweight choices, and experience opens intermediate movements', () => {
  for (const equipment of ['dumbbells', 'gym']) {
    const beginner = getEligibleExercises(makeProfile({ equipment }));
    const experienced = getEligibleExercises(makeProfile({ equipment, experience: 'regular' }));
    assert.ok(beginner.some((exercise) => exercise.equipment === 'bodyweight'));
    assert.ok(beginner.some((exercise) => exercise.equipment === 'dumbbells'));
    assert.ok(beginner.every((exercise) => exercise.level === 'beginner'));
    assert.ok(experienced.some((exercise) => exercise.level === 'intermediate'));
    assert.ok(beginner.every((exercise) => experienced.includes(exercise)));
  }
  const returning = getEligibleExercises(makeProfile({ experience: 'returning' }));
  assert.ok(returning.some((exercise) => exercise.level === 'intermediate'));
  assert.ok(returning.every((exercise) => exercise.equipment === 'bodyweight'));
});

test('review-only profiles receive no executable candidates and unrecognized old preferences default conservatively', () => {
  assert.deepEqual(getEligibleExercises(makeProfile({ health: 'needs_review', equipment: 'gym', experience: 'regular' })), []);
  assert.deepEqual(candidatesIn(createPrompt(makeProfile({ health: 'needs_review' }))), []);
  const candidates = getEligibleExercises(makeProfile({ equipment: undefined, experience: undefined }));
  assert.ok(candidates.every((exercise) => exercise.equipment === 'bodyweight' && exercise.level === 'beginner'));
});

test('catalog context contains canonical identities and compact constraints without mutating records', () => {
  const before = structuredClone(exerciseCatalog);
  const context = createCatalogContext(makeProfile({ equipment: 'dumbbells', experience: 'regular' }));
  for (const record of context) {
    assert.deepEqual(Object.keys(record), ['id', 'name', 'bodyPart', 'equipment', 'level', 'support', 'purpose', 'unilateral']);
    assert.equal(exerciseCatalog.find((exercise) => exercise.id === record.id)?.name, record.name);
  }
  assert.deepEqual(exerciseCatalog, before);
  const prompt = createPrompt(makeProfile());
  assert.match(prompt, /输出候选的完整标准 name/);
  assert.match(prompt, /不是一份训练计划/);
  assert.match(prompt, /库外动作只有文字指导/);
});

test('feedback receives the same eligible catalog while preserving actual old exercise names and pain restrictions', () => {
  const profile = makeProfile();
  const plan = makePlan();
  plan.days[0].exercises[0].name = '原计划中未收录的动作';
  const feedback = makeFeedback('plan-one', { discomfort: 'pain' });
  const prompt = createFeedbackPrompt({ profile, plan, feedback });
  assert.deepEqual(candidatesIn(prompt), createCatalogContext(profile));
  const data = JSON.parse(prompt.split('用户资料与训练上下文（仅数据）：\n')[1]);
  assert.equal(data.selectedExercise.name, '原计划中未收录的动作');
  assert.match(prompt, /若 discomfort=pain，status 必须为 clarify 或 needs_review，proposedDay=null/);
  assert.match(prompt, /保留原本已合适的动作/);
  assert.throws(() => validateAnalysis(makeAdjustment(plan), profile, plan, feedback), { code: 'INVALID_ANALYSIS' });
  const before = structuredClone(plan);
  assert.equal(validatePlan(plan, profile), plan);
  assert.deepEqual(plan, before, 'loading old plans does not rename or replace exercises');
});
