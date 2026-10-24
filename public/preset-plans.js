import { findCatalogExercise } from './exercise-catalog.js';

// Original first-week examples, not individualized prescriptions or a claim to
// satisfy the complete adult activity guidelines. References inform general
// progression, technique and recovery principles; they did not author these plans.
export const presetReferenceUrls = Object.freeze([
  'https://www.cdc.gov/physical-activity-basics/adding-adults/',
  'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/weight-training/art-20045842',
]);

function movement(id, sets, reps, cue) {
  const exercise = findCatalogExercise(id);
  if (!exercise) throw new Error(`Unknown preset exercise: ${id}`);
  return { name: exercise.name, sets, reps, restSeconds: 60, cue };
}

function training(day, title, focus, minutes, exercises) {
  return {
    day, type: 'training', title, focus, minutes,
    warmup: [
      '先轻松原地踏步，再逐渐加快到舒适节奏，共 5 分钟。',
      '正式开始前，先无负重、小幅度试做当天动作各 2–3 次。',
    ],
    exercises,
    cooldown: ['慢走并放松手臂约 3 分钟，让呼吸逐渐平稳。'],
    note: '时长含热身、试做、休息和放松；换动作也可休息 1 分钟，不必练满时间。',
  };
}

function week(trainingDays) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = index + 1;
    return trainingDays.find(item => item.day === day) || {
      day, type: 'recovery', title: '休息与恢复', focus: '恢复', minutes: 0,
      warmup: [], exercises: [], cooldown: [],
      note: '今天可以完全休息；愿意活动时，按舒适节奏散步即可。',
    };
  });
}

const caution = '这是未按个人身体状况定制的第一周通用安排，适用于无运动限制的成年人。出现疼痛或明显不适请停止；有伤病或运动限制时先获得专业建议。';
const commonTips = [
  '以动作稳定和自然呼吸为先，每组保留余力，不做到力竭；吃力时减少次数或组数。',
  '需要额外休息就延长间隔；时间不足时少做一组，不赶动作，也不补做漏掉的训练。',
  '先记录这一周的实际完成量和感受，再决定后续安排；本计划不代表完整的每周活动量。',
];

function ready(title, summary, trainingDays, tips = commonTips) {
  return { status: 'ready', title, summary, days: week(trainingDays), tips: [...tips], caution };
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

// Callers clone a selected plan before saving or adjusting it. A shared template
// must never acquire an individual user's feedback or updated exercise dosage.
export const presetPlans = freezeDeep([
  {
    id: 'gentle-bodyweight', title: '轻量徒手起步',
    description: '每周两次，先用少量动作熟悉训练节奏。',
    equipment: 'bodyweight', goal: 'habit', days: 2, minutes: 20, level: '入门',
    highlights: ['不用器械', '不含跳跃', '每个动作 1 组'],
    plan: ready('轻量徒手起步', '固定的第一周徒手入门安排，每周两次，每次约 20 分钟。先熟悉动作和记录感受，未按个人资料定制。', [
      training(1, '第一次全身练习', '熟悉下蹲、推撑与身体控制', 20, [
        movement('bodyweight-squat', 1, '6 次', '先浅蹲，膝盖跟随脚尖方向，脚跟保持着地。'),
        movement('wall-push-up', 1, '6 次', '站近墙面降低难度，身体保持一线，慢慢推回。'),
        movement('glute-bridge', 1, '8 次', '臀部缓慢抬起，腰部不反弓，不追求抬高。'),
        movement('prone-w-raise', 1, '6 次', '手臂呈 W 形小幅离地，肩膀放松，颈部自然。'),
        movement('bird-dog', 1, '每侧 4 次', '手脚向远处伸，不必抬高；难以稳定时缩短距离。'),
      ]),
      training(4, '再练一次基础动作', '重复熟悉的动作，保持余力', 20, [
        movement('bodyweight-squat', 1, '6 次', '只蹲到能平稳站起的深度，起身不急。'),
        movement('wall-push-up', 1, '6 次', '先保持靠近墙面的站位，每次都控制回程。'),
        movement('glute-bridge', 1, '8 次', '脚掌压稳地面，缓慢抬臀并落回。'),
        movement('prone-w-raise', 1, '6 次', '小幅抬臂，避免抬头或耸肩借力。'),
        movement('bird-dog', 1, '每侧 4 次', '收回后停稳再换边，骨盆尽量朝向地面。'),
      ]),
    ]),
  },
  {
    id: 'bodyweight-foundation', title: '徒手基础全身',
    description: '隔天练习基础动作，为规律训练留出节奏。',
    equipment: 'bodyweight', goal: 'fitness', days: 3, minutes: 30, level: '入门',
    highlights: ['不用器械', '隔天练习', '每个动作 2 组'],
    plan: ready('徒手基础全身', '固定的第一周全身动作练习，安排三个训练日及间隔恢复。每次约 30 分钟，未按个人资料定制。', [
      training(1, '全身基础 A', '下蹲、推撑与核心控制', 30, [
        movement('bodyweight-squat', 2, '8 次', '先做可控制的浅蹲，脚掌压稳，膝盖跟随脚尖。'),
        movement('wall-push-up', 2, '8 次', '站近墙面降低难度，身体成线，缓慢下降。'),
        movement('glute-bridge', 2, '10 次', '抬到肩髋膝大致成线即可，不用腰部顶高。'),
        movement('prone-w-raise', 2, '8 次', '手臂小幅抬起，颈部放松，肩膀远离耳朵。'),
        movement('heel-tap', 2, '每侧 5 次', '脚跟缓慢点地，腰背保持稳定，必要时缩小幅度。'),
      ]),
      training(3, '全身基础 B', '髋部发力与稳定支撑', 30, [
        movement('sumo-squat', 2, '8 次', '站距以髋部舒适为准，膝盖沿脚尖方向弯曲。'),
        movement('wall-push-up', 2, '8 次', '肩膀放松，每次都能平稳推回再继续。'),
        movement('bodyweight-good-morning', 2, '8 次', '膝盖微屈，臀部向后送，背部稳定时再回升。'),
        movement('prone-w-raise', 2, '8 次', '只做舒适的小幅度，不用抬头和挺腰带起手臂。'),
        movement('knee-plank', 2, '15 秒', '肩髋膝保持一线，自然呼吸，姿势变形前结束。'),
      ]),
      training(5, '全身基础复习', '保持控制，复习这一周的动作', 30, [
        movement('bodyweight-squat', 2, '8 次', '沿用前两次能控制的深度，不必增加难度。'),
        movement('wall-push-up', 2, '8 次', '双手稳稳推墙，站近一些也可以。'),
        movement('glute-bridge', 2, '10 次', '缓慢起落，感觉失去控制就提前结束这一组。'),
        movement('prone-w-raise', 2, '8 次', '肩胛轻轻向后靠拢，保持颈部自然。'),
        movement('bird-dog', 2, '每侧 5 次', '向远处伸展对侧手脚，稳住后收回换边。'),
      ]),
    ]),
  },
  {
    id: 'dumbbell-foundation', title: '哑铃基础入门',
    description: '用轻哑铃搭配徒手动作，熟悉基础负重练习。',
    equipment: 'dumbbells', goal: 'definition', days: 3, minutes: 30, level: '入门',
    highlights: ['一对哑铃', '无需训练凳', '轻重量起步'],
    plan: ready('哑铃基础入门', '固定的第一周哑铃与徒手组合，三个训练日之间留出恢复。每次约 30 分钟，未按个人资料定制，也不预设哑铃重量。', [
      training(1, '轻哑铃全身 A', '熟悉握持、下蹲与地板推举', 30, [
        movement('goblet-squat', 2, '8 次', '双手稳握轻哑铃于胸前；控制不住时先放下哑铃。'),
        movement('dumbbell-floor-press', 2, '8 次', '选能稳握的轻重量，上臂轻触地面后再推起。'),
        movement('glute-bridge', 2, '10 次', '这个动作不加哑铃，缓慢抬臀，腰部不反弓。'),
        movement('prone-w-raise', 2, '8 次', '徒手小幅抬臂，肩膀不耸起，颈部保持自然。'),
        movement('heel-tap', 2, '每侧 5 次', '脚跟轻点地面，不为点到地面而让腰部拱起。'),
      ]),
      training(3, '轻哑铃全身 B', '稳定动作与手臂控制', 30, [
        movement('bodyweight-squat', 2, '8 次', '徒手慢慢下蹲，优先保持平衡，不追求蹲深。'),
        movement('wall-push-up', 2, '8 次', '身体保持一线，靠近墙面一些可降低难度。'),
        movement('glute-bridge', 2, '10 次', '脚掌压地，缓慢抬起和放下臀部。'),
        movement('dumbbell-hammer-curl', 2, '8 次', '掌心相对，上臂贴近体侧；若需晃身就减轻重量。'),
        movement('bird-dog', 2, '每侧 5 次', '对侧手脚小幅伸展，身体稳住后再换边。'),
      ]),
      training(5, '轻哑铃全身复习', '复习负重动作与核心稳定', 30, [
        movement('goblet-squat', 2, '8 次', '沿用能稳定握住的轻重量，这周不必加重。'),
        movement('dumbbell-floor-press', 2, '8 次', '手腕保持稳定，肘部不外张过多，缓慢推起。'),
        movement('prone-w-raise', 2, '8 次', '徒手小幅抬臂，避免为了抬高而挺腰。'),
        movement('dumbbell-hammer-curl', 2, '8 次', '保持对握，慢慢放下，身体不前后摇晃。'),
        movement('knee-plank', 2, '15 秒', '双膝着地，自然呼吸；腰部下塌前就结束。'),
      ]),
    ], [
      '选择能轻松控制且仍有余力的重量；无法稳定完成时减轻重量或减少次数，不做到力竭。',
      ...commonTips.slice(1),
    ]),
  },
]);

export function findPresetPlan(id) {
  return presetPlans.find(preset => preset.id === id) || null;
}
