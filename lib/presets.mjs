import { findPresetPlan } from '../public/preset-plans.js';
import { AppError, labels, validatePlan } from './plan.mjs';

const measurements = [
  ['age', 18, 80, true],
  ['height', 100, 230, false],
  ['weight', 30, 250, false],
];

// The client chooses a template; neither the plan nor its prescriptions come
// from the request. Unlike AI setup, a preset does not require measurements.
export function preparePreset(input, previousProfile = null) {
  const fields = ['presetId', 'experience', 'eligibilityConfirmed'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || fields.some((key) => !Object.hasOwn(input, key))
      || Object.keys(input).some((key) => !fields.includes(key))) {
    throw new AppError('请选择预设方案、训练经验并确认使用条件。');
  }
  const preset = typeof input.presetId === 'string' ? findPresetPlan(input.presetId) : null;
  if (!preset) throw new AppError('未找到这套预设方案，请重新选择。', 400, 'INVALID_PRESET');
  if (typeof input.experience !== 'string' || !Object.hasOwn(labels.experience, input.experience)) {
    throw new AppError('请选择你目前的训练经验。');
  }
  if (input.eligibilityConfirmed !== true) {
    throw new AppError('请先确认你在 18–80 岁之间，且没有已知运动限制。', 400, 'PRESET_CONFIRMATION_REQUIRED');
  }
  if (previousProfile?.health === 'needs_review') {
    throw new AppError('你之前填写了需要确认的运动限制。请先获得适当的专业评估，预设方案暂不适用。', 409, 'PRESET_NEEDS_REVIEW');
  }
  const profile = {
    age: null, height: null, weight: null, sex: 'unspecified',
    goal: preset.goal, equipment: preset.equipment, days: preset.days,
    minutes: preset.minutes, experience: input.experience,
    health: 'none', notes: '', adultConfirmed: true,
  };
  for (const [key, min, max, integer] of measurements) {
    const value = previousProfile?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))) {
      profile[key] = value;
    }
  }
  if (typeof previousProfile?.sex === 'string' && Object.hasOwn(labels.sex, previousProfile.sex)) profile.sex = previousProfile.sex;
  if (typeof previousProfile?.notes === 'string') profile.notes = previousProfile.notes;
  const plan = validatePlan(structuredClone(preset.plan), profile);
  return { presetId: preset.id, title: preset.title, profile, plan };
}
