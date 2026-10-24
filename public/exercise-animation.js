import { EXERCISE_ANIMATIONS } from './exercise-poses.js';
import { exercisePosterHTML } from './exercise-poster.js';

const animations = new Map(EXERCISE_ANIMATIONS.map(animation => [animation.id, animation]));
const JOINTS = ['head','neck','ls','rs','le','re','lw','rw','lh','rh','lk','rk','la','ra'];
const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const number = value => Math.round(value * 100) / 100;
const point = ([x,y]) => `${number(x)},${number(y)}`;
const middle = (a,b) => [(a[0]+b[0])/2,(a[1]+b[1])/2];
const line = (a,b,width,color,extra='') => `<path d="M${point(a)} L${point(b)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
const circle = (p,r,color) => `<circle cx="${number(p[0])}" cy="${number(p[1])}" r="${r}" fill="${color}"/>`;
const colors = { shirt:'#3085D4', shirtDark:'#246BAF', trousers:'#354B67', trousersFar:'#64778E', skin:'#EAC1A5', skinFar:'#D4AD95', shoes:'#263C56' };

export function getExerciseAnimation(id) { return animations.get(id) || null; }

function dumbbell(hand, angle = 0) {
  return `<g transform="translate(${number(hand[0])} ${number(hand[1])}) rotate(${angle})" aria-hidden="true"><path d="M-12 0H12" stroke="#687A91" stroke-width="5" stroke-linecap="round"/><rect x="-16" y="-9" width="7" height="18" rx="2.5" fill="#263C56"/><rect x="9" y="-9" width="7" height="18" rx="2.5" fill="#263C56"/><path d="M-13-5V5M12-5V5" stroke="#8CA2BC" stroke-width="1.5" stroke-linecap="round"/></g>`;
}

function figure(spec, pose, phase = 0) {
  const p = pose;
  const isTop = spec.view === 'top';
  const isFront = spec.view === 'front' || isTop;
  const shoulder = middle(p.ls,p.rs), hip = middle(p.lh,p.rh);
  const limb = (side, far) => {
    const [s,e,w,h,k,a] = ['s','e','w','h','k','a'].map(suffix => p[side+suffix]);
    const arm = line(s,e,13,far?colors.shirtDark:colors.shirt) + line(e,w,9,far?colors.skinFar:colors.skin) + circle(w,5.2,far?colors.skinFar:colors.skin);
    const toeContact = spec.toes === true || spec.toes === side;
    const shoeEnd = toeContact ? [a[0]+9,254] : [a[0]+(isTop?0:8),a[1]+4];
    const leg = line(h,k,18,far?colors.trousersFar:colors.trousers) + line(k,a,13,far?colors.trousersFar:colors.trousers) + line(a,shoeEnd,9,colors.shoes);
    return {arm,leg};
  };
  const far = limb('r',true), near = limb('l',false);
  let trunk;
  if (spec.spine) {
    const arch = -4 - 12 * Math.cos(Math.PI * phase);
    trunk = `<path d="M${point(shoulder)} Q${number((shoulder[0]+hip[0])/2)} ${number((shoulder[1]+hip[1])/2+arch)} ${point(hip)}" fill="none" stroke="${colors.shirt}" stroke-width="28" stroke-linecap="round"/>`;
  } else if (isFront) {
    trunk = `<path d="M${point(p.ls)} Q${point(p.neck)} ${point(p.rs)} L${point(p.rh)} Q${number(hip[0])} ${number(hip[1]+7)} ${point(p.lh)}Z" fill="${colors.shirt}" stroke="${colors.shirt}" stroke-width="9" stroke-linejoin="round"/>`;
  } else {
    trunk = line(shoulder,hip,29,colors.shirt);
  }
  const head = circle(p.head,13,colors.skin);
  // A short hair cap gives the schematic figure a consistent, recognisable silhouette.
  const hair = `<path d="M${number(p.head[0]-12)},${number(p.head[1]-3)} Q${number(p.head[0]-10)},${number(p.head[1]-16)} ${number(p.head[0]+2)},${number(p.head[1]-13)} Q${number(p.head[0]+12)},${number(p.head[1]-12)} ${number(p.head[0]+12)},${number(p.head[1]-3)} Q${number(p.head[0]+1)},${number(p.head[1]-8)} ${number(p.head[0]-12)},${number(p.head[1]-3)}Z" fill="#354B67"/>`;
  const weights = spec.equipment !== 'dumbbells' ? '' : ['goblet','single-center','hip'].includes(spec.weights)
    ? dumbbell(middle(p.lw,p.rw),spec.weights==='hip'?0:90)
    : (spec.weights==='right' ? '' : dumbbell(p.lw,spec.grip==='neutral'?90:0)) + dumbbell(p.rw,spec.grip==='neutral'?90:0);
  const gripMarks = spec.equipment !== 'dumbbells' ? '' : (spec.weights==='right' ? '' : circle(p.lw,3.8,colors.skin)) + circle(p.rw,3.8,colors.skinFar);
  return `<g class="exercise-figure">${far.leg}${near.leg}${far.arm}${line(p.neck,shoulder,11,colors.skin)}${trunk}${line(middle(p.lh,p.rh),hip,20,colors.trousers)}${near.arm}${head}${hair}${weights}${gripMarks}</g>`;
}

function svg(spec, pose, label, phase = 0) {
  const orientation = spec.view === 'top' ? '俯视示意' : spec.view === 'oblique' ? '斜侧示意' : spec.view === 'front' ? '正面示意' : '侧面示意';
  const ground = spec.view === 'top' ? '<rect x="73" y="14" width="214" height="253" rx="20" fill="#EAF0F8" stroke="#DBE5F1"/><path d="M88 250H272" stroke="#DCE6F2" stroke-width="2"/>' : '<ellipse cx="180" cy="260" rx="126" ry="4" fill="#E9EEF5"/><path d="M29 260H331" stroke="#D9E2EC" stroke-width="1.5"/>';
  const wall = spec.wall ? `<path d="M${spec.wall} 44V260" stroke="#D9E2EC" stroke-width="8" stroke-linecap="round"/><path d="M${spec.wall+5} 60l13-13m-13 40 13-13m-13 40 13-13m-13 40 13-13m-13 40 13-13m-13 40 13-13m-13 40 13-13" stroke="#E5EBF1" stroke-width="2"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${spec.viewBox}" role="img" aria-label="${escape(label||spec.phases[0].label)}" focusable="false" class="exercise-animation-svg"><title>${escape(label||spec.phases[0].label)}</title><rect width="360" height="280" rx="18" fill="#F8FAFD"/>${ground}${wall}<text x="18" y="23" fill="#718195" font-size="10" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${orientation}${spec.hold?' · 静态保持':''}</text>${figure(spec,pose,phase)}${spec.lift?'<text x="180" y="276" text-anchor="middle" fill="#718195" font-size="10">手臂只需轻离地，幅度较小</text>':''}</svg>`;
}

/** Compact static poster; no SVG IDs, timers, remote images, or animation. */
export function exercisePosterSVG(id, { label = '', phase = 0 } = {}) {
  const spec = getExerciseAnimation(id);
  if (!spec) return '';
  const index = Math.max(0,Math.min(spec.phases.length-1,Math.trunc(Number(phase)||0)));
  return svg(spec,spec.phases[index].pose,label||spec.phases[index].label,index);
}

function interpolate(a,b,amount) {
  return Object.fromEntries(JOINTS.map(key => [key,a[key].map((value,index) => value+(b[key][index]-value)*amount)]));
}

// Load the local 3D engine only when an exercise is opened, never on the library grid.
async function loadExercise3D(id) {
  const [{ createExercise3DScene }, { getExercise3DSpec, interpolateExercise3DPose }] = await Promise.all([
    import('./exercise-renderer-3d.js'), import('./exercise-poses-3d.js'),
  ]);
  return { createScene: createExercise3DScene, spec: getExercise3DSpec(id), interpolate: interpolateExercise3DPose };
}

/** Mount one on-demand player. The returned controller must be destroyed on route replacement. */
export function mountExerciseAnimation(container,id,{load3D=loadExercise3D}={}) {
  const originalSpec = getExerciseAnimation(id);
  let spec = originalSpec;
  if (!container || !spec) return { destroy() {} };
  const document = container.ownerDocument;
  const window = document.defaultView;
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const abort = new window.AbortController();
  const root = document.createElement('div');
  root.className = 'exercise-player';
  root.innerHTML = `<div class="animation-toolbar"><span class="animation-mode" role="status">正在准备 3D 示意…</span><span class="animation-drag-hint" hidden>横向拖动旋转</span></div><div class="exercise-stage">${exercisePosterHTML(id, { loading: 'eager' })}</div><div class="animation-views" role="group" aria-label="观察视角" hidden><div class="animation-view-options">${[['three-quarter','立体'],['front','正面'],['side','侧面'],['top','俯视']].map(([view,label]) => `<button type="button" data-view="${view}" aria-pressed="${view === 'three-quarter'}">${label}</button>`).join('')}</div><div class="animation-zoom"><button type="button" data-zoom="in" aria-label="放大模型">＋</button><button type="button" data-zoom="out" aria-label="缩小模型">−</button></div></div><div class="animation-controls" role="group" aria-label="动作示意播放控制"><button type="button" data-animation="previous" aria-label="上一步">← 上一步</button><button type="button" data-animation="play" aria-label="播放动作示意">播放示意</button><button type="button" data-animation="next" aria-label="下一步">下一步 →</button><button type="button" data-animation="speed" aria-label="切换为半速播放">1×</button></div><p class="animation-phase" aria-live="polite" aria-atomic="true"></p><p class="animation-status"></p>`;
  container.append(root);
  const stage = root.querySelector('.exercise-stage');
  const previous = root.querySelector('[data-animation="previous"]');
  const play = root.querySelector('[data-animation="play"]');
  const next = root.querySelector('[data-animation="next"]');
  const phaseText = root.querySelector('.animation-phase');
  const status = root.querySelector('.animation-status');
  const mode = root.querySelector('.animation-mode');
  const views = root.querySelector('.animation-views');
  const dragHint = root.querySelector('.animation-drag-hint');
  const speedButton = root.querySelector('[data-animation="speed"]');
  let scene = null, speed = 1, renderMode = 'loading', loaded3D = null, loading3D = false;
  let phase = 0, playing = false, frame = 0, start = null, lastAnnounced = -1, destroyed = false, onScreen = true;
  const transitionCount = spec.phases.length === 1 ? 0 : spec.phases.length - 1;
  // The return segment closes sequences whose final pose differs from their starting pose.
  const closed = spec.phases.length > 1 && JOINTS.every(key => spec.phases[0].pose[key].every((value,index) => value === spec.phases.at(-1).pose[key][index]));
  const segments = transitionCount + (closed || spec.hold ? 0 : 1);
  const segmentDuration = () => spec.duration / speed / Math.max(1,segments);
  const announce = () => {
    if (lastAnnounced !== phase) {
      phaseText.textContent = `${phase+1} / ${spec.phases.length} · ${spec.phases[phase].label}`;
      lastAnnounced = phase;
    }
  };
  const controls = () => {
    const reduced = Boolean(media?.matches);
    play.disabled = reduced;
    previous.disabled = next.disabled = spec.phases.length === 1;
    play.textContent = reduced ? '逐步查看' : playing ? '暂停示意' : spec.hold && phase === spec.phases.length-1 ? '重新演示' : '播放示意';
    play.setAttribute('aria-label',playing?'暂停动作示意':reduced?'减少动态效果已启用':'播放动作示意');
    play.setAttribute('aria-pressed',String(playing));
    phaseText.setAttribute('aria-live',playing?'off':'polite');
    status.textContent = renderMode === '2d' ? '当前设备未能显示 3D，已切换为 2D 示意。仍可逐步查看。' : reduced ? '已遵循“减少动态效果”，用上一步、下一步查看动作。' : spec.hold ? '仅演示进入保持姿势，不是训练计时器。保持时正常呼吸。' : '示意帮助理解动作路径；速度与幅度请根据自身能力调整。';
  };
  const draw = (pose=spec.phases[phase].pose,progress=phase) => {
    if (scene) scene.draw(pose,progress);
    else if (renderMode === '2d') stage.innerHTML = svg(originalSpec,pose,originalSpec.phases[phase].label,progress);
    else stage.innerHTML = exercisePosterHTML(id, { loading: 'eager' });
    announce();
  };
  const pause = () => {
    playing = false;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    start = null;
    controls();
  };
  const tick = timestamp => {
    if (destroyed) return;
    if (!container.isConnected || !root.isConnected) { destroy(); return; }
    if (document.hidden || !onScreen || media?.matches) { pause(); return; }
    if (start === null) start = timestamp-phase*segmentDuration();
    if (spec.hold && timestamp-start >= spec.duration/speed) {
      phase = spec.phases.length-1;
      pause();
      draw();
      return;
    }
    const position = ((timestamp-start)%(spec.duration/speed))/segmentDuration();
    phase = Math.min(Math.floor(position),segments-1);
    const nextPhase = (phase+1)%spec.phases.length;
    const local = position-Math.floor(position);
    // A short pause at each key pose makes the path legible; smoothstep avoids sudden reversals.
    const travel = Math.max(0,Math.min(1,(local-.16)/.72));
    const eased = travel*travel*(3-2*travel);
    const pose = scene && loaded3D?.interpolate
      ? loaded3D.interpolate(spec,phase,nextPhase,eased)
      : interpolate(spec.phases[phase].pose,spec.phases[nextPhase].pose,eased);
    draw(pose,phase+eased);
    frame = window.requestAnimationFrame(tick);
  };
  const step = direction => {
    pause();
    phase = (phase+direction+spec.phases.length)%spec.phases.length;
    draw();
  };
  speedButton.addEventListener('click',() => {
    const wasPlaying = playing;
    pause();
    speed = speed === 1 ? .5 : 1;
    speedButton.textContent = speed === 1 ? '1×' : '0.5×';
    speedButton.setAttribute('aria-label',speed === 1 ? '切换为半速播放' : '切换为正常速度');
    if (wasPlaying) { playing = true; controls(); frame = window.requestAnimationFrame(tick); }
  },{signal:abort.signal});
  for (const name of ['three-quarter','front','side','top']) {
    root.querySelector(`[data-view="${name}"]`).addEventListener('click',() => scene?.setView(name),{signal:abort.signal});
  }
  for (const [name,amount] of [['in',-1],['out',1]]) {
    root.querySelector(`[data-zoom="${name}"]`).addEventListener('click',() => scene?.zoom(amount),{signal:abort.signal});
  }
  previous.addEventListener('click',() => step(-1),{signal:abort.signal});
  next.addEventListener('click',() => step(1),{signal:abort.signal});
  play.addEventListener('click',() => {
    if (playing) { pause(); return; }
    if (media?.matches || document.hidden || !onScreen || destroyed) return;
    if (spec.hold && phase === spec.phases.length-1) phase = 0;
    playing = true;
    controls();
    frame = window.requestAnimationFrame(tick);
  },{signal:abort.signal});
  const visibility = () => { if (document.hidden) { pause(); releaseScene(); } else if (onScreen) prepareScene(); };
  const preference = () => { if (media.matches) { pause(); draw(); } else controls(); };
  document.addEventListener('visibilitychange',visibility,{signal:abort.signal});
  media?.addEventListener?.('change',preference);
  const intersection = window.IntersectionObserver ? new window.IntersectionObserver(entries => {
    if (destroyed) return;
    onScreen = entries.some(entry => entry.isIntersecting);
    if (!onScreen) { pause(); releaseScene(); }
    else prepareScene();
  },{threshold:0.05}) : null;
  intersection?.observe(root);
  const removal = window.MutationObserver ? new window.MutationObserver(() => {
    if (!container.isConnected || !root.isConnected) destroy();
  }) : null;
  removal?.observe(document.body,{childList:true,subtree:true});
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    pause();
    scene?.destroy();
    scene = null;
    abort.abort();
    media?.removeEventListener?.('change',preference);
    intersection?.disconnect();
    removal?.disconnect();
    root.remove();
  }
  draw();
  controls();
  const viewChanged = name => {
    for (const view of ['three-quarter','front','side','top']) root.querySelector(`[data-view="${view}"]`).setAttribute('aria-pressed',String(view === name));
  };
  const fallback = () => {
    if (destroyed) return;
    pause();
    scene?.destroy();
    scene = null;
    spec = originalSpec;
    renderMode = '2d';
    mode.textContent = '2D 示意';
    views.hidden = dragHint.hidden = true;
    stage.classList?.remove('is-3d');
    draw();
    status.textContent = '当前设备未能显示 3D，已切换为 2D 示意。仍可播放和逐步查看。';
  };
  function releaseScene() {
    if (!scene) return;
    scene.destroy();
    scene = null;
    spec = originalSpec;
    stage.classList?.remove('is-3d');
    views.hidden = dragHint.hidden = true;
    draw();
  }
  function prepareScene() {
    if (destroyed || scene || loading3D || document.hidden || renderMode === '2d') return;
    loading3D = true;
    // Offscreen cards never allocate GPU contexts. A late import cannot resurrect a removed card.
    Promise.resolve().then(() => loaded3D || load3D(id)).then(loaded => {
      loaded3D = loaded;
      if (destroyed || !onScreen || document.hidden || !container.isConnected || !root.isConnected) return;
      if (!loaded.spec || loaded.spec.phases.length !== originalSpec.phases.length) throw new Error('Missing 3D motion');
      const resume = playing;
      pause();
      stage.innerHTML = '';
      stage.classList?.add('is-3d');
      scene = loaded.createScene(stage,loaded.spec,{onViewChange:viewChanged,onUnavailable:fallback});
      spec = loaded.spec;
      renderMode = '3d';
      mode.textContent = '3D 动作示意';
      views.hidden = dragHint.hidden = false;
      viewChanged('three-quarter');
      draw();
      if (resume && !media?.matches) { playing = true; frame = window.requestAnimationFrame(tick); }
      controls();
    }).catch(fallback).finally(() => { loading3D = false; });
  }
  if (!intersection) prepareScene();
  return {destroy};
}
