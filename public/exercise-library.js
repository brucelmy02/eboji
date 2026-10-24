// A deliberately small, curated illustration library. Match known names exactly:
// an image for a different variation is less useful than the original text alone.
const credit = Object.freeze({
  name: 'eboji 动作示意',
  url: '/exercises/ATTRIBUTION.md',
});

export const exerciseIllustrations = [
  {
    id: 'bodyweight-squat', name: '徒手深蹲',
    aliases: ['徒手深蹲', '自重深蹲', 'bodyweight squat', 'bodyweight squats', 'air squat'],
    frames: [
      { src: '/exercises/bodyweight-squat-start.svg', label: '准备姿势', alt: '徒手深蹲：站立准备姿势' },
      { src: '/exercises/bodyweight-squat-end.svg', label: '下蹲姿势', alt: '徒手深蹲：屈髋屈膝下蹲姿势' },
    ], credit,
  },
  {
    id: 'knee-push-up', name: '跪姿俯卧撑',
    aliases: ['跪姿俯卧撑', '跪式俯卧撑', 'knee push-up', 'knee push-ups', 'kneeling push-up', 'kneeling push-ups'],
    frames: [
      { src: '/exercises/knee-push-up-start.svg', label: '支撑姿势', alt: '跪姿俯卧撑：双膝支撑、手臂伸直的姿势' },
      { src: '/exercises/knee-push-up-end.svg', label: '下降姿势', alt: '跪姿俯卧撑：双膝支撑、屈肘下降的姿势' },
    ], credit,
  },
  {
    id: 'glute-bridge', name: '臀桥',
    aliases: ['臀桥', '仰卧臀桥', '双腿臀桥', '徒手臀桥', 'glute bridge', 'glute bridges'],
    frames: [
      { src: '/exercises/glute-bridge-start.svg', label: '准备姿势', alt: '臀桥：仰卧屈膝、双脚着地的准备姿势' },
      { src: '/exercises/glute-bridge-end.svg', label: '抬臀姿势', alt: '臀桥：双脚支撑、臀部抬起的姿势' },
    ], credit,
  },
];

const normalizeName = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');
const byName = new Map(exerciseIllustrations.flatMap((exercise) => exercise.aliases.map((name) => [normalizeName(name), exercise])));

export function findExerciseIllustration(name) {
  return typeof name === 'string' ? byName.get(normalizeName(name)) || null : null;
}
