import { exerciseCatalog } from '/exercise-catalog.js';
import { getExercise3DSpec } from '/exercise-poses-3d.js';
import { createExercise3DScene } from '/exercise-renderer-3d.js';

const button = document.querySelector('#generate');
const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const gallery = document.querySelector('#gallery');
const token = document.querySelector('[name="export-token"]').content;
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

button.addEventListener('click', async () => {
  button.disabled = true; gallery.replaceChildren();
  document.querySelector('#error').textContent = '';
  progress.value = 0;
  try {
    for (const [index, exercise] of exerciseCatalog.entries()) {
      status.textContent = `正在生成 ${index + 1} / ${exerciseCatalog.length}：${exercise.name}`;
      const spec = getExercise3DSpec(exercise.id);
      let scene;
      try {
        scene = createExercise3DScene(stage, spec);
        scene.setView('three-quarter');
        scene.draw(spec.phases[1].pose, 1);
        await nextPaint();
        const dataURL = scene.capture();
        if (!dataURL.startsWith('data:image/webp;base64,')) throw new Error('浏览器不支持 WebP 导出');
        // Resize backing pixels to the standard asset size, regardless of DPR.
        const image = new Image(); image.src = dataURL; await image.decode();
        const output = document.createElement('canvas'); output.width = 720; output.height = 560;
        output.getContext('2d').drawImage(image, 0, 0, 720, 560);
        const blob = await new Promise(resolve => output.toBlob(resolve, 'image/webp', .9));
        if (!blob) throw new Error('导出图片失败');
        const response = await fetch(`/export/${exercise.id}`, { method: 'POST', headers: { 'Content-Type': 'image/webp', 'X-Export-Token': token }, body: blob });
        if (!response.ok) throw new Error(await response.text());
        const figure = document.createElement('figure');
        const preview = document.createElement('img'); preview.src = `/exercise-posters/${exercise.id}.webp`; preview.alt = exercise.name; preview.width = 720; preview.height = 560;
        const caption = document.createElement('figcaption'); caption.textContent = exercise.name;
        figure.append(preview, caption); gallery.append(figure);
        progress.value = index + 1;
      } finally { scene?.destroy(); }
    }
    status.textContent = `已生成 ${exerciseCatalog.length} / ${exerciseCatalog.length} 张 3D 预览图。`;
  } catch (error) { document.querySelector('#error').textContent = error.message; }
  finally { button.disabled = false; }
});
