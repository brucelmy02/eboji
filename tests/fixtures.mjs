export const makeProfile = (overrides = {}) => ({
  sex: 'unspecified',
  age: 28, height: 172, weight: 68, days: 3, minutes: 30,
  goal: 'definition', experience: 'beginner', equipment: 'bodyweight',
  health: 'none', notes: '', ...overrides,
});

export function makePlan() {
  return {
    status: 'ready', title: '从规律全身训练开始',
    summary: '根据徒手条件和每周三次安排，以容易掌握的动作建立训练习惯。',
    days: Array.from({ length: 7 }, (_, index) => {
      const training = [0, 2, 4].includes(index);
      return {
        day: index + 1, type: training ? 'training' : 'recovery',
        title: training ? '全身基础训练' : '恢复与休息',
        focus: training ? '全身力量与动作练习' : '恢复', minutes: training ? 30 : 0,
        warmup: training ? ['原地轻步行与轻柔活动关节，共 5 分钟'] : [],
        exercises: training ? [
          { name: '墙壁俯卧撑', sets: 3, reps: '8 次', restSeconds: 60, cue: '身体保持一条直线，在可控范围完成。' },
          { name: '徒手浅蹲', sets: 2, reps: '8 次', restSeconds: 60, cue: '缓慢下蹲到舒适范围。' },
        ] : [],
        cooldown: training ? ['轻走并舒缓呼吸，共 3 分钟'] : [],
        note: training ? '以动作稳定为先，保留余力。' : '可按舒适程度轻松散步，也可以完全休息。',
      };
    }),
    tips: ['记录实际完成量与训练感受。'], caution: '出现明显不适时暂停，并根据情况寻求专业指导。',
  };
}

export const makeFeedback = (planId, overrides = {}) => ({
  planId, day: 1, exerciseIndex: 0, completedSets: 2, actualReps: '每组 6 次',
  load: '徒手', effort: 'hard', discomfort: 'none', notes: '没有疼痛，但第三组做不完。', ...overrides,
});

export const makeAnalysis = (overrides = {}) => ({
  status: 'advice', summary: '本次完成了两组。', reasoning: '实际完成量低于原安排，需要观察难度。',
  actions: ['记录每组可控制完成的次数。'], questions: [], proposedDay: null, changeReason: '',
  followUp: '下次记录每组实际完成次数及主观难度。', ...overrides,
});

export function makeAdjustment(plan = makePlan(), day = 1) {
  const proposedDay = structuredClone(plan.days[day - 1]);
  proposedDay.exercises[0].sets = 2;
  proposedDay.exercises[0].reps = '6 次';
  proposedDay.minutes = 25;
  return makeAnalysis({ status: 'adjustment', proposedDay, changeReason: '把俯卧撑从 3 组降为 2 组，并减少每组次数。' });
}
