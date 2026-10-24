import { exerciseCatalog } from '../public/exercise-catalog.js';

// Share the same records with the card renderer. Filtering only produces a
// candidate set: the model still needs to choose a small, suitable session.
export function getEligibleExercises(profile) {
  if (profile.health === 'needs_review') return [];
  const allowsDumbbells = ['dumbbells', 'gym'].includes(profile.equipment);
  const allowsIntermediate = ['returning', 'regular'].includes(profile.experience);
  return exerciseCatalog.filter((exercise) => (
    (exercise.equipment === 'bodyweight' || (allowsDumbbells && exercise.equipment === 'dumbbells'))
    && (exercise.level === 'beginner' || (allowsIntermediate && exercise.level === 'intermediate'))
    && ['none', 'wall'].includes(exercise.support)
  ));
}

export function createCatalogContext(profile) {
  return getEligibleExercises(profile).map(({ id, name, bodyPart, equipment, level, support, purpose, unilateral }) => ({
    id, name, bodyPart, equipment, level, support, purpose, unilateral,
  }));
}

export function createCatalogPrompt(profile) {
  return `动作库使用规则（新计划与反馈建议共同遵守）：
- 下方候选已按用户器械和经验筛选。默认从中选择动作：先根据用户目标、可用器械、经验、时长与运动限制筛选合适候选，再组合计划；不要先随意推荐动作，最后才尝试匹配动作库。输出候选的完整标准 name，不输出 id、不创造别名，不把不同变式当成同一个动作。动作卡片和示范依据准确名称匹配。
- 候选列表是可选择范围，不是一份训练计划，不要全部安排。继续遵守每个训练日 2–6 个动作、总时长、恢复间隔、运动限制与保留余力的要求。strength 是力量、cardio 是轻体能、mobility 是活动度；不要把所有部位或所有类型硬塞进一次训练。
- unilateral=true 的动作在 reps 中注明每侧；support=wall 需要稳定墙面。只允许用户已声明的器械，居家哑铃条件不包含训练凳、单杠、弹力带或健身房器械。候选之外的新手进阶动作不应通过换名字绕过经验筛选。
- 需要新增或替换动作时，先考虑合适的库内替代，以及调整已有合适动作的组数、次数、休息或强度。只要库内动作能够满足本次需求，就使用库内动作；换口味、增加多样性、显得专业或模型更熟悉某动作，都不是使用库外动作的必要理由。不要为凑库内覆盖率而推荐不适合用户的动作。
- 只有同时满足以下条件才允许新增库外动作：库内没有适合用户条件且能满足这项具体需求的替代；该动作对本次需求确有必要；其器械、支持物、难度及运动条件已确认适合用户。必要信息不足时，反馈流程用 clarify 先澄清；新计划只按已知条件选择合适库内动作，不用假设的器械或运动能力补齐缺口，也不输出计划 Schema 之外的状态。运动风险仍按原有 needs_review 规则处理。候选被经验或器械筛掉，不等于动作库未覆盖，不能用库外名称绕过限制。
- 每个新增库外动作须在 cue 中简短说明“库外原因：具体需要什么、库内为何无法替代”，同时提供基础做法、必要支持物，并注明“仅文字指导，暂无动画”；此时 cue 可用 2–3 个短句。不要只写“更适合”或“效果更好”。库外动作只有文字指导，不要声称它有图示或动画，也不要套用相似动作的动画。反馈调整中的 changeReason 同时概括这项必要性；仅在 actions 中提出替代建议时也遵守相同规则并说明原因。
- 反馈时可保留原计划中仍合适的动作，不为提高库内占比改写无关内容；所有新增或替换动作仍须遵守以上规则。热身、放松或文字建议中的具体动作推荐同样遵守库内优先，普通步行、休息或呼吸提示不必强行匹配为动作卡。
- 动作库不能用于诊断、康复处方或解除疼痛与运动限制。需要专业评估时仍走 needs_review；疼痛反馈仍只可 clarify/needs_review，不因有候选而给出可执行调整。

适用动作候选（JSON 数据）：
${JSON.stringify(createCatalogContext(profile))}`;
}
