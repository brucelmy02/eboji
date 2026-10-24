import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseCatalog, findCatalogExercise, normalizeExerciseName, bodyPartLabels, equipmentLabels, levelLabels } from '../public/exercise-catalog.js';

const expectedIds = `bodyweight-squat,sumo-squat,split-squat,reverse-lunge,forward-lunge,lateral-lunge,calf-raise,single-leg-calf-raise,goblet-squat,dumbbell-squat,dumbbell-sumo-squat,dumbbell-split-squat,dumbbell-reverse-lunge,dumbbell-lateral-lunge,dumbbell-calf-raise,glute-bridge,single-leg-glute-bridge,frog-pump,quadruped-hip-extension,fire-hydrant,side-lying-leg-raise,clamshell,bodyweight-good-morning,dumbbell-rdl,dumbbell-deadlift,dumbbell-single-leg-rdl,dumbbell-glute-bridge,wall-push-up,knee-push-up,push-up,close-grip-push-up,dumbbell-floor-press,dumbbell-floor-squeeze-press,prone-w-raise,prone-y-raise,reverse-snow-angel,prone-cobra,dumbbell-bent-over-row,dumbbell-single-arm-row,pike-push-up,dumbbell-overhead-press,dumbbell-arnold-press,dumbbell-lateral-raise,dumbbell-front-raise,dumbbell-reverse-fly,dumbbell-biceps-curl,dumbbell-hammer-curl,dumbbell-alternating-curl,dumbbell-cross-body-hammer-curl,dumbbell-overhead-triceps-extension,dumbbell-triceps-kickback,dumbbell-floor-triceps-extension,forearm-plank,high-plank,knee-plank,side-plank,knee-side-plank,dead-bug,bird-dog,heel-tap,reverse-crunch,crunch,bicycle-crunch,seated-russian-twist,lying-leg-raise,plank-shoulder-tap,bear-hold,dumbbell-suitcase-march,march-in-place,step-jack,jumping-jack,high-knees,mountain-climber,standing-knee-to-elbow,cat-cow,child-pose,thoracic-rotation,half-kneeling-hip-flexor-stretch,standing-calf-stretch,supine-hamstring-stretch`.split(',');

test('catalog covers exactly 80 distinct home exercises and every body region', () => {
  assert.equal(exerciseCatalog.length, 80);
  assert.deepEqual(exerciseCatalog.map(x => x.id).sort(), expectedIds.sort());
  assert.equal(new Set(exerciseCatalog.map(x => x.name)).size, 80);
  assert.deepEqual(new Set(exerciseCatalog.map(x => x.bodyPart)), new Set(Object.keys(bodyPartLabels)));
  for (const item of exerciseCatalog) {
    assert.ok(equipmentLabels[item.equipment], item.id);
    assert.ok(levelLabels[item.level], item.id);
    assert.ok(['none', 'wall'].includes(item.support), item.id);
    assert.ok(['strength', 'cardio', 'mobility'].includes(item.purpose), item.id);
    assert.equal(typeof item.unilateral, 'boolean', item.id);
    assert.equal(item.instructions.length, 3, item.id);
    assert.equal(item.cues.length, 2, item.id);
    assert.ok(item.muscles.length >= 2 && item.muscles.length <= 3, item.id);
    assert.ok(item.pitfalls.length >= 1 && item.pitfalls.length <= 2, item.id);
    assert.ok(item.aliases.some(alias => /[a-z]/i.test(alias)), item.id);
    for (const text of [...item.instructions, ...item.cues, ...item.pitfalls]) assert.ok(text.trim().length > 0, item.id);
    assert.ok(item.sourceUrls.length > 0, item.id);
    for (const url of item.sourceUrls) {
      assert.match(url, /^https:\/\/(www\.)?(acefitness\.org|nasm\.org|blog\.nasm\.org|mayoclinic\.org|mayoclinichealthsystem\.org)\//, item.id);
    }
    if (item.unilateral) assert.ok(item.instructions.some(text => text.includes('每侧')), item.id);
  }
});

test('every canonical id, name and alias resolves without collisions', () => {
  const resolved = new Map();
  for (const item of exerciseCatalog) {
    for (const label of [item.id, item.name, ...item.aliases]) {
      const key = normalizeExerciseName(label);
      assert.ok(!resolved.has(key) || resolved.get(key) === item.id, `${item.id}: ${label}`);
      resolved.set(key, item.id);
      assert.equal(findCatalogExercise(label)?.id, item.id, label);
    }
  }
  assert.equal(findCatalogExercise('  KNEE  PUSH—UP  ')?.id, 'knee-push-up');
  assert.equal(findCatalogExercise('哑铃ＲＤＬ')?.id, 'dumbbell-rdl');
});

test('generic terms and unmatched variants never resolve to the wrong animation', () => {
  for (const unknown of [null, undefined, {}, [], 1, '', '深蹲', '划船', '推举', '拉伸', '哑铃卧推', '哑铃上斜卧推', '保加利亚分腿蹲', '跳跃深蹲', '负重跪姿俯卧撑', '臀桥保持30秒', 'squat jump', 'incline push-up']) {
    assert.equal(findCatalogExercise(unknown), null, String(unknown));
  }
});

test('catalog marks wall support and technically demanding exercises conservatively', () => {
  for (const id of ['wall-push-up', 'standing-calf-stretch', 'single-leg-calf-raise']) assert.equal(findCatalogExercise(id).support, 'wall');
  for (const id of ['pike-push-up', 'close-grip-push-up', 'dumbbell-single-leg-rdl', 'jumping-jack', 'high-knees', 'dumbbell-arnold-press']) assert.equal(findCatalogExercise(id).level, 'intermediate');
  for (const id of ['march-in-place', 'step-jack', 'standing-knee-to-elbow']) assert.equal(findCatalogExercise(id).level, 'beginner');
});
