import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_ANIMATIONS } from '../public/exercise-poses.js';
import { EXERCISE_3D_SPECS, JOINTS_3D, getExercise3DSpec, interpolateExercise3DPose } from '../public/exercise-poses-3d.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const near=(a,b,epsilon=.005)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} is not close to ${b}`);
const pose=(id,index=0)=>getExercise3DSpec(id).phases[index].pose;
const bones=[['s','e',.29],['e','w',.28],['h','k',.43],['k','a',.40]];

test('all 80 library animations have deliberate 3D sequences and preserve editorial phases',()=>{
  assert.equal(EXERCISE_3D_SPECS.length,80);
  assert.equal(new Set(EXERCISE_3D_SPECS.map(s=>s.id)).size,80);
  for(const source of EXERCISE_ANIMATIONS){
    const spec=getExercise3DSpec(source.id);
    assert.ok(spec,source.id);
    assert.deepEqual(spec.phases.map(p=>p.label),source.phases.map(p=>p.label));
    for(const key of ['hold','duration','equipment','weights','grip']) assert.equal(spec[key],source[key]);
    assert.ok(['standing','supine','prone','side'].includes(spec.bodyOrientation));
    for(const phase of spec.phases){
      assert.deepEqual(Object.keys(phase.pose).sort(),[...JOINTS_3D].sort());
      for(const point of Object.values(phase.pose)){
        assert.equal(point.length,3);
        assert.ok(point.every(Number.isFinite));
        assert.ok(point[1]>=.05,`${spec.id}: joint below the mat`);
      }
    }
  }
  assert.equal(getExercise3DSpec('missing'),null);
});

test('articulated bones retain physical lengths in authored phases and in-between frames',()=>{
  for(const spec of EXERCISE_3D_SPECS)for(let phase=0;phase<spec.phases.length;phase++){
    const next=(phase+1)%spec.phases.length;
    for(const t of [0,.25,.5,.75,1]){
      const p=interpolateExercise3DPose(spec,phase,next,t);
      for(const side of ['l','r'])for(const [a,b,expected]of bones){
        near(distance(p[side+a],p[side+b]),expected);
      }
      for(const point of Object.values(p))assert.ok(point[1]>=.049,`${spec.id} / ${phase} / ${t}: floor penetration`);
    }
  }
});

test('squats move through depth with planted feet, and wall push-ups keep hands on the wall',()=>{
  for(const id of ['bodyweight-squat','goblet-squat','sumo-squat','dumbbell-squat']){
    const a=pose(id),b=pose(id,1);
    assert.ok(b.lh[1]<a.lh[1]-.2);
    assert.ok(b.lh[2]<a.lh[2]-.15);
    assert.ok(b.lk[2]>b.la[2]+.10);
    for(const foot of ['la','ra'])assert.ok(distance(a[foot],b[foot])<.005);
  }
  const wall=getExercise3DSpec('wall-push-up');
  for(const p of wall.phases.map(f=>f.pose))for(const hand of ['lw','rw']) near(p[hand][2],wall.wall3D.position,.0001);
  for(const foot of ['la','ra'])assert.ok(distance(pose('wall-push-up')[foot],pose('wall-push-up',1)[foot])<.001);
});

test('bridge, floor press and prone W have distinct correct floor orientations and supports',()=>{
  const a=pose('glute-bridge'),b=pose('glute-bridge',1);
  assert.equal(getExercise3DSpec('glute-bridge').bodyOrientation,'supine');
  assert.ok(b.lh[1]>a.lh[1]+.15);
  for(const key of ['head','ls','rs','la','ra'])assert.ok(distance(a[key],b[key])<.005);
  // The bridge's shoulder–hip and hip–knee slopes agree in the sagittal plane.
  near((b.lh[1]-b.ls[1])/(b.lh[2]-b.ls[2]),(b.lk[1]-b.lh[1])/(b.lk[2]-b.lh[2]),.02);
  const press=pose('dumbbell-floor-press');
  for(const side of ['l','r']){
    near(press[side+'e'][1],.07);
    near(press[side+'e'][0],press[side+'w'][0]);
    near(press[side+'e'][2],press[side+'w'][2]);
    assert.ok(pose('dumbbell-floor-press',1)[side+'w'][1]>press[side+'w'][1]+.3);
  }
  assert.equal(getExercise3DSpec('prone-w-raise').bodyOrientation,'prone');
  assert.ok(pose('prone-w-raise',1).lw[1]>pose('prone-w-raise').lw[1]+.1);
  assert.ok(pose('prone-w-raise').lw[2]>pose('prone-w-raise').le[2]);
});

test('contralateral floor movements and side supports do not collapse into flat poses',()=>{
  const bird=pose('bird-dog',1);
  assert.ok(bird.lw[2]>bird.ls[2]+.5);
  assert.ok(bird.ra[2]<bird.rh[2]-.8);
  assert.ok(bird.ra[1]>.4);
  near(bird.rw[1],.07);near(bird.lk[1],.07);
  const swapped=pose('bird-dog',3);
  assert.ok(swapped.rw[2]>swapped.rs[2]+.5);
  assert.ok(swapped.la[1]>.4);
  const side=pose('side-plank',1);
  assert.equal(getExercise3DSpec('side-plank').bodyOrientation,'side');
  assert.ok(side.rs[1]>side.ls[1]+.35);
  near(side.le[1],.07);near(side.lw[1],.07);
  const dead=pose('dead-bug',1);
  assert.ok(dead.lw[2]>dead.ls[2]+.5);
  assert.ok(dead.ra[2]<dead.rh[2]-.8);
  assert.ok(dead.la[1]>.5);
});

test('authored poses are immutable and interpolation returns independent data',()=>{
  const spec=getExercise3DSpec('bodyweight-squat');
  const before=JSON.stringify(spec);
  const p=interpolateExercise3DPose(spec,0,1,.5);
  p.lw[0]=99;
  assert.equal(JSON.stringify(spec),before);
  assert.ok(Object.isFrozen(spec.phases[0].pose.lw));
  assert.throws(()=>interpolateExercise3DPose(spec,0,99,.5),RangeError);
});

test('dense transitions do not flip the elbow/knee bend plane or cross the mat',()=>{
  for(const spec of EXERCISE_3D_SPECS)for(let a=0;a<spec.phases.length;a++){
    const b=(a+1)%spec.phases.length;
    let previous=interpolateExercise3DPose(spec,a,b,0);
    for(let step=1;step<=1000;step++){
      const p=interpolateExercise3DPose(spec,a,b,step/1000);
      for(const key of JOINTS_3D){
        assert.ok(distance(p[key],previous[key])<.03,`${spec.id}, ${a} → ${b}, ${step}/1000: ${key} jumped`);
        assert.ok(p[key][1]>=.049,`${spec.id}: ${key} crossed the mat`);
      }
      previous=p;
    }
  }
});

test('supine resting heads reach the mat and side-plank hold keeps both knees straight',()=>{
  for(const id of ['glute-bridge','dumbbell-floor-press','dead-bug','heel-tap']){
    for(const {pose:p}of getExercise3DSpec(id).phases){near(p.head[1],.09,.001);near(p.neck[1],.09,.001);}
  }
  assert.ok(pose('crunch',1).head[1]>.25);
  const p=pose('side-plank',1);
  for(const side of ['l','r'])near(distance(p[side+'h'],p[side+'a']),.83,.00001);
  near(p.la[1],.08);near(p.ra[1],.18);
});
