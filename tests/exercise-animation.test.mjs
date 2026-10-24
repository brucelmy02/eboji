import test from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { EXERCISE_ANIMATIONS } from '../public/exercise-poses.js';
import { getExerciseAnimation, exercisePosterSVG, mountExerciseAnimation } from '../public/exercise-animation.js';
import { exerciseCatalog } from '../public/exercise-catalog.js';

const joints = ['head','neck','ls','rs','le','re','lw','rw','lh','rh','lk','rk','la','ra'];
test('all 80 catalogue movements have explicit, distinct multi-phase animations', () => {
  assert.equal(EXERCISE_ANIMATIONS.length,80);
  assert.deepEqual(EXERCISE_ANIMATIONS.map(item=>item.id).sort(),exerciseCatalog.map(item=>item.id).sort());
  const signatures = new Set();
  for (const item of EXERCISE_ANIMATIONS) {
    assert.equal(getExerciseAnimation(item.id),item);
    assert.ok(item.phases.length>=2,item.id);
    assert.ok(item.phases.every(phase=>phase.label.trim()),item.id);
    assert.ok(item.phases.some(phase=>JSON.stringify(phase.pose)!==JSON.stringify(item.phases[0].pose)),item.id);
    const signature = JSON.stringify({poses:item.phases.map(phase=>phase.pose),equipment:item.equipment,weights:item.weights,grip:item.grip});
    assert.ok(!signatures.has(signature),`movement and equipment combination duplicated: ${item.id}`);
    signatures.add(signature);
  }
  assert.equal(getExerciseAnimation('unknown-exercise'),null);
});

test('every pose fits the viewBox including head, feet and hand-held dumbbells', () => {
  for (const item of EXERCISE_ANIMATIONS) for (const [index,phase] of item.phases.entries()) {
    const label = `${item.id} phase ${index}`;
    assert.deepEqual(Object.keys(phase.pose).sort(),joints.slice().sort(),label);
    for (const [joint,position] of Object.entries(phase.pose)) {
      assert.equal(position.length,2,label);
      assert.ok(position.every(Number.isFinite),`${label} ${joint}`);
      const radius = joint==='head' ? 16 : joint.endsWith('w') && item.equipment==='dumbbells' ? 16 : 10;
      assert.ok(position[0]-radius>=0 && position[0]+radius<=360,`${label} ${joint} x`);
      assert.ok(position[1]-radius>=0 && position[1]+radius<=280,`${label} ${joint} y`);
    }
    const svg = exercisePosterSVG(item.id,{phase:index});
    assert.ok(svg.startsWith('<svg '));
    assert.ok(svg.endsWith('</svg>'));
    assert.doesNotMatch(svg,/NaN|Infinity|undefined|<script|<animate|\sid=|href=/);
  }
});

test('posters escape labels, clamp requested phases and never load external content', () => {
  assert.equal(exercisePosterSVG('missing'), '');
  const svg=exercisePosterSVG('push-up',{label:'<img src=x onerror="alert(1)"> & test',phase:999});
  assert.match(svg,/&lt;img/);
  assert.doesNotMatch(svg,/<img/);
  assert.match(svg,/&quot;/);
  assert.equal(exercisePosterSVG('push-up',{phase:-2}),exercisePosterSVG('push-up',{phase:0}));
});

test('lunge contact foot, single-leg equipment and heel-tap semantics stay aligned', () => {
  for (const id of ['reverse-lunge','dumbbell-reverse-lunge']) {
    const poses=getExerciseAnimation(id).phases.map(phase=>phase.pose);
    assert.deepEqual(poses[0].la,poses[1].la,`${id} front foot must stay planted`);
  }
  const forward=getExerciseAnimation('forward-lunge').phases;
  assert.deepEqual(forward[0].pose.ra,forward[1].pose.ra,'forward lunge rear foot must stay planted');
  assert.equal(getExerciseAnimation('dumbbell-single-leg-rdl').weights,'right');
  const heel=getExerciseAnimation('heel-tap').phases;
  assert.ok(heel[1].pose.ra[1]>heel[0].pose.ra[1]+50,'heel lowers toward floor');
  assert.ok(heel[3].pose.la[1]>heel[0].pose.la[1]+50,'other heel lowers toward floor');
  assert.deepEqual(heel[1].pose.head,heel[0].pose.head,'not a side crunch');
  for (const id of ['forearm-plank','high-plank','knee-plank','side-plank','knee-side-plank','bear-hold','child-pose','prone-cobra']) {
    assert.equal(getExerciseAnimation(id).hold,true,id);
  }
});


test('squat feet, bridge supporting feet and wall hands do not slide between phases', () => {
  for (const id of ['bodyweight-squat','sumo-squat','goblet-squat','dumbbell-squat','dumbbell-sumo-squat','glute-bridge','dumbbell-glute-bridge','frog-pump']) {
    const phases=getExerciseAnimation(id).phases;
    for (const phase of phases) for (const foot of ['la','ra']) {
      assert.deepEqual(phase.pose[foot],phases[0].pose[foot],`${id} ${foot} remains planted`);
    }
  }
  const singleBridge=getExerciseAnimation('single-leg-glute-bridge').phases;
  assert.deepEqual(singleBridge[0].pose.la,singleBridge[1].pose.la);
  for (const id of ['wall-push-up','standing-calf-stretch']) {
    const phases=getExerciseAnimation(id).phases;
    for (const hand of ['lw','rw']) assert.deepEqual(phases[0].pose[hand],phases[1].pose[hand],`${id} ${hand} remains on wall`);
  }
  const calf=getExerciseAnimation('single-leg-calf-raise').phases;
  assert.deepEqual(calf[0].pose.rw,calf[1].pose.rw,'supporting hand stays on the wall');
  assert.equal(getExerciseAnimation('single-leg-calf-raise').toes,'l','only the supporting foot points to the floor');
  const calfSVG=exercisePosterSVG('single-leg-calf-raise',{phase:1});
  assert.match(calfSVG,/M228,210 L236,214/,'the raised foot is a short shoe above the floor');
  assert.doesNotMatch(calfSVG,/M228,210 L237,254/,'the raised foot does not stretch to the ground');
  assert.equal(getExerciseAnimation('calf-raise').toes,true);
  assert.equal(getExerciseAnimation('dumbbell-calf-raise').toes,true);
});


test('supine support rests on the ground and bridge top follows the shoulder-hip-knee line', () => {
  for (const id of ['glute-bridge','single-leg-glute-bridge','frog-pump','dumbbell-glute-bridge','dumbbell-floor-press','dumbbell-floor-squeeze-press','dumbbell-floor-triceps-extension','dead-bug','heel-tap','supine-hamstring-stretch']) {
    for (const {pose} of getExerciseAnimation(id).phases) {
      assert.ok(pose.head[1]+13>=252 && pose.head[1]+13<=260,`${id} head rests near the floor`);
      const shoulderY=(pose.ls[1]+pose.rs[1])/2;
      assert.ok(shoulderY+14.5>=256 && shoulderY+14.5<=261,`${id} upper back is grounded`);
    }
  }
  for (const id of ['glute-bridge','dumbbell-glute-bridge']) {
    const {pose}=getExerciseAnimation(id).phases[1];
    for (const side of ['l','r']) {
      const [shoulder,hip,knee]=['s','h','k'].map(joint=>pose[side+joint]);
      const expectedY=shoulder[1]+(knee[1]-shoulder[1])*(hip[0]-shoulder[0])/(knee[0]-shoulder[0]);
      assert.ok(Math.abs(hip[1]-expectedY)<3,`${id} ${side} shoulder-hip-knee alignment`);
    }
  }
  const top=exercisePosterSVG('prone-y-raise');
  assert.doesNotMatch(top,/<ellipse/,'top view must not look like a standing figure on a horizon');
  assert.match(top,/width="214" height="253"/,'top view has a mat as the floor reference');
});

class Element extends EventTarget {
  constructor(document) {
    super(); this.ownerDocument=document; this.isConnected=true; this.children=[]; this.attributes={}; this.textContent=''; this.disabled=false; this.hidden=false; this.html='';
    const classes=new Set();
    this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};
  }
  set innerHTML(value) {
    this.html=value;
    if (value.includes('class="exercise-stage"')) {
      this.nodes = new Map([
        '.exercise-stage','.animation-phase','.animation-status','.animation-mode','.animation-views','.animation-drag-hint',
        ...['previous','play','next','speed'].map(name=>`[data-animation="${name}"]`),
        ...['three-quarter','front','side','top'].map(name=>`[data-view="${name}"]`),
        ...['in','out'].map(name=>`[data-zoom="${name}"]`),
      ].map(selector=>[selector,new Element(this.ownerDocument)]));
      this.nodes.get('.animation-views').hidden=this.nodes.get('.animation-drag-hint').hidden=true;
    }
  }
  get innerHTML() { return this.html; }
  querySelector(selector) { return this.nodes.get(selector); }
  setAttribute(key,value) { this.attributes[key]=value; }
  append(child) { this.children.push(child); child.parent=this; }
  remove() { this.isConnected=false; this.parent.children=this.parent.children.filter(child=>child!==this); }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
function sceneModule(id='bodyweight-squat') {
  const original=getExerciseAnimation(id);
  const spec={...original,phases:original.phases.map(phase=>({...phase,pose:Object.fromEntries(Object.entries(phase.pose).map(([joint,[x,y]])=>[joint,[x,y,0]]))}))};
  const instances=[];
  return {
    spec,instances,
    createScene(stage,spec,callbacks) {
      const instance={stage,spec,callbacks,draws:[],views:[],zooms:[],destroyed:0,
        draw(pose,phase){this.draws.push({pose,phase});},
        setView(name){this.views.push(name);callbacks.onViewChange(name);},
        zoom(amount){this.zooms.push(amount);},
        destroy(){this.destroyed+=1;},
      };
      instances.push(instance);
      return instance;
    },
  };
}

function deferred() {
  let resolve,reject;
  const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});
  return {promise,resolve,reject};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function harness(id='bodyweight-squat',reduce=false,options={}) {
  const frames=new Map(); let frameId=0;
  const media=new EventTarget(); media.matches=reduce;
  const intersections=[],mutations=[];
  class IntersectionObserver {
    constructor(callback) { this.callback=callback; this.connected=true; intersections.push(this); }
    observe() {} disconnect() { this.connected=false; }
  }
  class MutationObserver {
    constructor(callback) { this.callback=callback; this.connected=true; mutations.push(this); }
    observe() {} disconnect() { this.connected=false; }
  }
  const document=new EventTarget(); document.hidden=false;
  document.createElement=()=>new Element(document);
  document.body=new Element(document);
  class PlayerAbortController extends AbortController {
    constructor(){super();setMaxListeners(0,this.signal);}
  }
  document.defaultView={AbortController:PlayerAbortController,IntersectionObserver,MutationObserver,matchMedia:()=>media,requestAnimationFrame(callback){ frames.set(++frameId,callback);return frameId;},cancelAnimationFrame(id){frames.delete(id);}};
  if(options.withoutIntersection) delete document.defaultView.IntersectionObserver;
  const container=new Element(document);
  const player=mountExerciseAnimation(container,id,{load3D:options.load3D||(()=>Promise.resolve(sceneModule(id)))});
  const root=container.children[0];
  return {
    container,root,player,document,frames,media,intersections,mutations,
    button(name){return root.querySelector(`[data-animation="${name}"]`);},
    view(name){return root.querySelector(`[data-view="${name}"]`);},
    zoom(name){return root.querySelector(`[data-zoom="${name}"]`);},
    phase(){return root.querySelector('.animation-phase').textContent;},
    tick(timestamp){for(const [id,callback] of [...frames]){frames.delete(id);callback(timestamp);}},
    reduce(value=true){media.matches=value;media.dispatchEvent(new Event('change'));},
    hidden(value=true){document.hidden=value;document.dispatchEvent(new Event('visibilitychange'));},
    offscreen(){intersections[0].callback([{isIntersecting:false}]);},
    onscreen(){intersections[0].callback([{isIntersecting:true}]);},
  };
}

test('players start still, step accessibly and cancel their animation on pause', () => {
  const h=harness();
  assert.equal(h.frames.size,0,'no automatic playback');
  assert.match(h.phase(),/^1 \/ 3/);
  h.button('next').click();
  assert.match(h.phase(),/^2 \/ 3/);
  assert.equal(h.frames.size,0);
  h.button('play').click();
  h.tick(100);
  assert.equal(h.frames.size,1);
  assert.equal(h.root.querySelector('.animation-phase').attributes['aria-live'],'off');
  h.button('play').click();
  assert.equal(h.frames.size,0);
  assert.equal(h.root.querySelector('.animation-phase').attributes['aria-live'],'polite');
  h.player.destroy();
});

test('hold demonstrations enter the posture once and stop without a repeated hold loop', () => {
  const h=harness('forearm-plank');
  h.button('play').click();
  h.tick(0);h.tick(4000);
  assert.equal(h.frames.size,0);
  assert.match(h.phase(),/^2 \/ 2/);
  assert.equal(h.button('play').textContent,'重新演示');
  h.button('play').click();h.tick(5000);
  assert.equal(h.frames.size,1);
  assert.match(h.phase(),/^1 \/ 2/);
  h.player.destroy();
});

test('reduced motion disables continuous playback while keeping phase controls', () => {
  const h=harness('push-up',true);
  assert.equal(h.button('play').disabled,true);
  h.button('play').click();assert.equal(h.frames.size,0);
  h.button('next').click();assert.match(h.phase(),/^2 \/ 3/);
  h.reduce(false);h.button('play').click();h.tick(100);
  assert.equal(h.frames.size,1);
  h.reduce();assert.equal(h.frames.size,0);
  h.player.destroy();
});

test('hidden/offscreen playback pauses and removing a player releases observers and listeners', () => {
  const h=harness();
  h.button('play').click();h.tick(0);h.hidden();
  assert.equal(h.frames.size,0);
  h.hidden(false);assert.equal(h.frames.size,0,'visibility does not autoplay');
  h.button('play').click();h.tick(200);h.offscreen();assert.equal(h.frames.size,0);
  h.intersections[0].callback([{isIntersecting:true}]);
  h.button('play').click();assert.equal(h.frames.size,1);
  h.container.isConnected=false;h.mutations[0].callback();
  assert.equal(h.frames.size,0);
  assert.equal(h.container.children.length,0);
  assert.ok(h.intersections.every(observer=>!observer.connected));
  assert.ok(h.mutations.every(observer=>!observer.connected));
  h.button('play').click();h.reduce();h.hidden();
  assert.equal(h.frames.size,0);
  h.player.destroy();
});

test('3D loads on first visibility and late loading uses the latest selected phase', async t => {
  const pending=deferred(),module=sceneModule();
  const requests=[];
  const h=harness('bodyweight-squat',false,{load3D:id=>{requests.push(id);return pending.promise;}});
  t.after(()=>h.player.destroy());
  await settle();
  assert.deepEqual(requests,[],'mounting an unopened/offscreen player does not load 3D');
  assert.match(h.root.querySelector('.exercise-stage').innerHTML, /src="\/exercise-posters\/bodyweight-squat\.webp"/, 'loading uses the rendered 3D still');
  assert.doesNotMatch(h.root.querySelector('.exercise-stage').innerHTML, /<svg/);
  h.offscreen();await settle();
  assert.equal(requests.length,0);
  h.onscreen();h.onscreen();await settle();
  assert.deepEqual(requests,['bodyweight-squat'],'one pending load per player');
  assert.equal(module.instances.length,0,'no GPU allocation before loading completes');
  h.button('next').click();
  pending.resolve(module);await settle();
  assert.equal(module.instances.length,1);
  assert.deepEqual(module.instances[0].draws.at(-1).pose,module.spec.phases[1].pose);
  assert.match(h.phase(),/^2 \/ 3/);
  assert.equal(h.frames.size,0,'loading a model does not start animation');
  assert.equal(h.root.querySelector('.animation-views').hidden,false);
  assert.equal(h.root.querySelector('.exercise-stage').classList.contains('is-3d'),true);
});

test('destroying before an import resolves cannot allocate or resurrect a 3D scene', async () => {
  const pending=deferred(),module=sceneModule();
  const h=harness('bodyweight-squat',false,{load3D:()=>pending.promise});
  h.onscreen();await settle();
  h.player.destroy();h.player.destroy();
  pending.resolve(module);await settle();
  assert.equal(module.instances.length,0);
  assert.equal(h.container.children.length,0);
  assert.equal(h.frames.size,0);
  assert.ok(h.intersections.every(observer=>!observer.connected));
  assert.ok(h.mutations.every(observer=>!observer.connected));
});

test('playback started during loading continues when 3D arrives without creating a second clock', async t => {
  const pending=deferred(),module=sceneModule();
  const h=harness('bodyweight-squat',false,{load3D:()=>pending.promise});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();
  h.button('play').click();h.tick(0);h.tick(module.spec.duration*.6);
  assert.match(h.phase(),/^2 \/ 3/);
  pending.resolve(module);await settle();
  assert.equal(module.instances.length,1);
  assert.match(h.phase(),/^2 \/ 3/);
  assert.equal(h.button('play').attributes['aria-pressed'],'true');
  assert.equal(h.frames.size,1);
  h.tick(module.spec.duration*.7);
  assert.equal(h.frames.size,1);
  assert.ok(module.instances[0].draws.length>=2,'the model participates in the already-started playback');
});

test('an import finishing while offscreen stays cached without allocating a scene', async t => {
  const pending=deferred(),module=sceneModule();
  let loads=0;
  const h=harness('bodyweight-squat',false,{load3D:()=>{loads+=1;return pending.promise;}});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();h.offscreen();
  pending.resolve(module);await settle();
  assert.equal(module.instances.length,0);
  h.onscreen();await settle();
  assert.equal(loads,1,'reentry reuses loaded code');
  assert.equal(module.instances.length,1);
});

test('an import finishing in a hidden tab does not allocate until the tab returns', async t => {
  const pending=deferred(),module=sceneModule();
  const h=harness('bodyweight-squat',false,{load3D:()=>pending.promise});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();h.hidden();
  pending.resolve(module);await settle();
  assert.equal(module.instances.length,0);
  h.hidden(false);await settle();
  assert.equal(module.instances.length,1);
  assert.equal(h.frames.size,0);
});

test('leaving the viewport releases GPU resources and reentry preserves the selected phase', async t => {
  const module=sceneModule();let loads=0;
  const h=harness('bodyweight-squat',false,{load3D:()=>{loads+=1;return Promise.resolve(module);}});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();
  h.button('next').click();
  const first=module.instances[0];
  h.button('play').click();h.tick(0);
  h.offscreen();
  assert.equal(first.destroyed,1);
  assert.equal(h.frames.size,0);
  assert.match(h.phase(),/^2 \/ 3/);
  assert.match(h.root.querySelector('.exercise-stage').innerHTML,/^<img /);
  assert.equal(h.root.querySelector('.animation-views').hidden,true);
  h.offscreen();assert.equal(first.destroyed,1,'repeat offscreen events do not double-dispose');
  h.onscreen();await settle();
  assert.equal(module.instances.length,2);
  assert.equal(loads,1);
  assert.deepEqual(module.instances[1].draws.at(-1).pose,module.spec.phases[1].pose);
  assert.equal(h.frames.size,0,'returning onscreen never auto-plays');
  h.player.destroy();
  assert.equal(module.instances[1].destroyed,1);
});

test('hidden tabs release scenes and returning while offscreen does not recreate them', async t => {
  const module=sceneModule();
  const h=harness('bodyweight-squat',false,{load3D:()=>Promise.resolve(module)});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();
  h.hidden();
  assert.equal(module.instances[0].destroyed,1);
  h.offscreen();h.hidden(false);await settle();
  assert.equal(module.instances.length,1);
  h.onscreen();await settle();
  assert.equal(module.instances.length,2);
  assert.equal(h.frames.size,0);
});

test('players still prepare a 3D model when IntersectionObserver is unavailable', async t => {
  const module=sceneModule();
  const h=harness('bodyweight-squat',false,{withoutIntersection:true,load3D:()=>Promise.resolve(module)});
  t.after(()=>h.player.destroy());
  await settle();
  assert.equal(module.instances.length,1);
  assert.equal(h.frames.size,0);
});

test('failed imports and unsupported WebGL keep playable 2D steps instead of a blank card', async t => {
  for(const failure of ['import','renderer','missing-motion','mismatched-phases']) await t.test(failure,async t => {
    const module=sceneModule();let loads=0;
    if(failure==='renderer') module.createScene=()=>{throw new Error('WebGL unavailable');};
    if(failure==='missing-motion') module.spec=null;
    if(failure==='mismatched-phases') module.spec.phases=module.spec.phases.slice(1);
    const h=harness('bodyweight-squat',false,{load3D:()=>{
      loads+=1;
      return failure==='import'?Promise.reject(new Error('Could not load module')):Promise.resolve(module);
    }});
    t.after(()=>h.player.destroy());
    h.onscreen();await settle();
    assert.equal(h.root.querySelector('.animation-mode').textContent,'2D 示意');
    assert.equal(h.root.querySelector('.animation-views').hidden,true);
    assert.equal(h.root.querySelector('.exercise-stage').classList.contains('is-3d'),false);
    assert.match(h.root.querySelector('.exercise-stage').innerHTML,/^<svg /);
    assert.match(h.root.querySelector('.animation-status').textContent,/2D/);
    h.button('next').click();assert.match(h.phase(),/^2 \/ 3/);
    h.button('play').click();h.tick(0);assert.equal(h.frames.size,1);
    h.offscreen();h.onscreen();await settle();
    assert.equal(loads,1,'fallback does not endlessly retry an unsupported renderer');
  });
});

test('lost WebGL context disposes the scene and restores the current 2D phase', async t => {
  const module=sceneModule();
  const h=harness('bodyweight-squat',false,{load3D:()=>Promise.resolve(module)});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();
  h.button('next').click();h.button('play').click();h.tick(0);
  const scene=module.instances[0];
  scene.callbacks.onUnavailable();
  assert.equal(scene.destroyed,1);
  assert.equal(h.frames.size,0);
  assert.equal(h.root.querySelector('.animation-mode').textContent,'2D 示意');
  assert.match(h.phase(),/^2 \/ 3/);
  assert.equal(h.root.querySelector('.exercise-stage').innerHTML,exercisePosterSVG('bodyweight-squat',{phase:1}));
  h.button('previous').click();assert.match(h.phase(),/^1 \/ 3/);
  h.player.destroy();
  scene.callbacks.onUnavailable();
  assert.equal(scene.destroyed,1,'late context events cannot double-dispose a removed player');
});

test('camera presets and zoom work while paused and listeners are removed on destroy', async t => {
  const module=sceneModule();
  const h=harness('bodyweight-squat',false,{load3D:()=>Promise.resolve(module)});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();
  const scene=module.instances[0];
  for(const selected of ['front','side','top','three-quarter']) {
    h.view(selected).click();
    assert.equal(scene.views.at(-1),selected);
    for(const other of ['front','side','top','three-quarter']) assert.equal(h.view(other).attributes['aria-pressed'],String(other===selected));
  }
  scene.callbacks.onViewChange('custom');
  for(const name of ['front','side','top','three-quarter']) assert.equal(h.view(name).attributes['aria-pressed'],'false');
  h.zoom('in').click();h.zoom('out').click();
  assert.deepEqual(scene.zooms,[-1,1]);
  assert.equal(h.frames.size,0,'camera controls do not start movement playback');
  h.player.destroy();
  h.view('side').click();h.zoom('in').click();h.button('speed').click();
  assert.equal(scene.views.length,4);
  assert.deepEqual(scene.zooms,[-1,1]);
  assert.equal(h.frames.size,0);
});

test('reduced motion keeps 3D camera and phase controls without continuous animation', async t => {
  const module=sceneModule();
  const h=harness('bodyweight-squat',true,{load3D:()=>Promise.resolve(module)});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();
  h.view('side').click();h.button('next').click();
  assert.deepEqual(module.instances[0].draws.at(-1).pose,module.spec.phases[1].pose);
  assert.equal(module.instances[0].views.at(-1),'side');
  assert.equal(h.button('play').disabled,true);
  h.button('play').click();h.button('speed').click();assert.equal(h.frames.size,0);
});

test('half speed takes twice as long to reach later phases and switching speed keeps one clock', async t => {
  const normalModule=sceneModule(),slowModule=sceneModule();
  const normal=harness('bodyweight-squat',false,{load3D:()=>Promise.resolve(normalModule)});
  const slow=harness('bodyweight-squat',false,{load3D:()=>Promise.resolve(slowModule)});
  t.after(()=>{normal.player.destroy();slow.player.destroy();});
  normal.onscreen();slow.onscreen();await settle();
  slow.button('speed').click();
  assert.equal(slow.button('speed').textContent,'0.5×');
  assert.equal(slow.button('speed').attributes['aria-label'],'切换为正常速度');
  for(const h of [normal,slow]) {h.button('play').click();h.tick(0);h.tick(normalModule.spec.duration*.6);}
  assert.match(normal.phase(),/^2 \/ 3/);
  assert.match(slow.phase(),/^1 \/ 3/);
  slow.tick(normalModule.spec.duration*1.2);
  assert.match(slow.phase(),/^2 \/ 3/);
  slow.button('speed').click();
  assert.equal(slow.button('speed').textContent,'1×');
  assert.equal(slow.button('play').attributes['aria-pressed'],'true');
  assert.equal(slow.frames.size,1,'changing speed replaces rather than duplicates the playback loop');
});

test('3D playback uses its constrained interpolator with phase indices and stops using it after fallback', async t => {
  const module=sceneModule();
  const sentinel=structuredClone(module.spec.phases[0].pose);
  sentinel.head[2]=.314;
  const calls=[];
  module.interpolate=(spec,from,to,amount)=>{calls.push({spec,from,to,amount});return sentinel;};
  const h=harness('bodyweight-squat',false,{load3D:()=>Promise.resolve(module)});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();
  const scene=module.instances[0];
  // The segment pauses for 16% then travels for 72%; its eased midpoint is at 52%.
  h.button('play').click();h.tick(0);h.tick(module.spec.duration*.26);
  assert.equal(calls.at(-1).spec,module.spec);
  assert.equal(calls.at(-1).from,0);
  assert.equal(calls.at(-1).to,1);
  assert.ok(Math.abs(calls.at(-1).amount-.5)<1e-10,'the interpolator receives eased travel after the initial pause');
  assert.equal(scene.draws.at(-1).pose,sentinel,'the renderer receives the constrained pose unchanged');
  h.tick(module.spec.duration*.76);
  assert.equal(calls.at(-1).from,1);
  assert.equal(calls.at(-1).to,2);
  assert.ok(Math.abs(calls.at(-1).amount-.5)<1e-10);
  scene.callbacks.onUnavailable();
  const count=calls.length;
  h.button('play').click();h.tick(module.spec.duration);h.tick(module.spec.duration*1.25);
  assert.equal(calls.length,count,'2D fallback cannot feed metre-based 3D coordinates into the SVG');
  assert.match(h.root.querySelector('.exercise-stage').innerHTML,/^<svg /);
  assert.doesNotMatch(h.root.querySelector('.exercise-stage').innerHTML,/NaN|Infinity|undefined/);
  assert.equal(h.frames.size,1,'2D fallback retains playable movement');
});

test('half-speed holds enter their final posture once after the doubled duration', async t => {
  const module=sceneModule('forearm-plank');
  const h=harness('forearm-plank',false,{load3D:()=>Promise.resolve(module)});
  t.after(()=>h.player.destroy());
  h.onscreen();await settle();
  h.button('speed').click();h.button('play').click();h.tick(0);h.tick(module.spec.duration);
  assert.equal(h.frames.size,1,'a half-speed entry has not finished after the normal duration');
  h.tick(module.spec.duration*2);
  assert.equal(h.frames.size,0);
  assert.match(h.phase(),/^2 \/ 2/);
  assert.deepEqual(module.instances[0].draws.at(-1).pose,module.spec.phases[1].pose);
});
