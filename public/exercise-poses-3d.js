/** Original, articulated 3D movement studies. Metres, Y up, standing front +Z.
 * These are schematic demonstrations, not motion capture or a form assessment.
 * The 2D library supplies editorial labels only: no projected coordinates are reused.
 * Floor poses run head-to-foot along Z. Supine front is +Y; prone front is -Y.
 */
import { EXERCISE_ANIMATIONS } from './exercise-poses.js';

const add = (a,b) => a.map((v,i) => v+b[i]);
const sub = (a,b) => a.map((v,i) => v-b[i]);
const mul = (a,n) => a.map(v => v*n);
const dot = (a,b) => a.reduce((n,v,i) => n+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length = a => Math.hypot(...a);
const norm = a => mul(a,1/(length(a)||1));
const copy = p => Object.fromEntries(Object.entries(p).map(([k,v]) => [k,[...v]]));
const SIDES = [['l',-1],['r',1]];
export const JOINTS_3D = Object.freeze(['head','neck','ls','rs','le','re','lw','rw','lh','rh','lk','rk','la','ra']);

// Two-bone inverse kinematics keeps limbs the same length in every keyframe.
// A bend hint selects the anatomical elbow/knee side of the solution circle.
function solve(origin,target,upper,lower,hint) {
  const vector = sub(target,origin);
  const d = Math.max(Math.abs(upper-lower)+.0001,Math.min(upper+lower-.0001,length(vector)));
  const direction = norm(vector);
  let bend = sub(hint,mul(direction,dot(hint,direction)));
  if(length(bend)<.001) bend = sub([1,0,0],mul(direction,direction[0]));
  if(length(bend)<.001) bend = [0,0,1];
  const along = (upper*upper-lower*lower+d*d)/(2*d);
  const across = Math.sqrt(Math.max(0,upper*upper-along*along));
  return [add(add(origin,mul(direction,along)),mul(norm(bend),across)),add(origin,mul(direction,d))];
}
function arm(p,s,target,hint=[0,0,1]) {
  [p[s+'e'],p[s+'w']] = solve(p[s+'s'],target,.29,.28,hint); return p;
}
function leg(p,s,target,hint=[0,0,1]) {
  [p[s+'k'],p[s+'a']] = solve(p[s+'h'],target,.43,.40,hint); return p;
}
function torso(hip,up=[0,1,0],right=[1,0,0]) {
  up=norm(up); right=norm(right);
  const shoulder=add(hip,mul(up,.50));
  const p={head:add(shoulder,mul(up,.23)),neck:add(shoulder,mul(up,.10))};
  for(const [s,sign] of SIDES){
    p[s+'h']=add(hip,mul(right,sign*.135)); p[s+'s']=add(shoulder,mul(right,sign*.21));
    arm(p,s,add(p[s+'s'],mul(up,-.565)));
    leg(p,s,add(p[s+'h'],mul(up,-.829)));
  }
  return p;
}
function bothArms(p,targets,hints) {
  for(const [s,sign] of SIDES) arm(p,s,targets(s,sign),hints?hints(s,sign):[sign*.15,0,1]);
  return p;
}
function shift(p,delta) { return Object.fromEntries(Object.entries(p).map(([k,v]) => [k,add(v,delta)])); }
function reach(p,kind='forward') {
  return bothArms(p,(s,sign)=>{
    const a=p[s+'s'];
    if(kind==='goblet') return [sign*.045,a[1]-.14,a[2]+.20];
    if(kind==='center') return [sign*.045,a[1]-.53,a[2]+.08];
    if(kind==='down') return [a[0]+sign*.055,a[1]-.56,a[2]+.015];
    if(kind==='chest') return [sign*.04,a[1]-.09,a[2]+.17];
    return [sign*.18,a[1]-.10,a[2]+.49];
  },(s,sign)=>[sign*.4,-.3,.2]);
}

function standing({width=.17,hipY=.908,hipZ=0,lean=0,arms='down'}={}) {
  const p=torso([0,hipY,hipZ],[0,Math.cos(lean),Math.sin(lean)]);
  for(const [s,sign] of SIDES) leg(p,s,[sign*width,.08,0],[sign*.10,0,1]);
  return reach(p,arms);
}
function squat(low=false,width=.23,arms='forward') {
  return standing({width,hipY:low?.55:(width>.3?.85:.90),hipZ:low?-.24:0,lean:low?.36:0,arms});
}
function split(low=false,shiftZ=0,arms='down') {
  const p=torso([0,low?.56:.79,shiftZ]);
  leg(p,'l',[-.14,.08,.43+shiftZ],[0,0,1]);
  leg(p,'r',[.14,.12,-.48+shiftZ],[0,-1,1]);
  return reach(p,arms);
}
function sideLunge(low=false,arms='forward') {
  if(!low)return squat(false,.45,arms);
  const p=torso([-.30,.64,-.12],[0,.96,.28]);
  leg(p,'l',[-.53,.08,0],[-.3,0,1]); leg(p,'r',[.53,.08,0],[0,0,1]);
  return reach(p,arms);
}
function hinge(low=true,arms='down',deeper=false) {
  return standing({hipY:low?(deeper?.64:.83):.90,hipZ:low?-.22:0,lean:low?1.05:0,arms});
}
function calf(raised=false,single=false) {
  let p=standing();
  if(single){ leg(p,'r',[.26,.30,-.16],[0,0,1]); arm(p,'r',[.76,1.36,0],[0,-1,0]); }
  if(raised){p=shift(p,[0,.10,0]);if(single) arm(p,'r',[.76,1.36,0],[0,-1,0]);}
  return p;
}
function supine({hipY=.14,raised=false,straight=false}={}) {
  const p=torso([0,hipY,-.12],[0,raised?-.38:0,raised?.925:1]);
  p.head[1]=.09;p.neck[1]=.09;
  for(const [s,sign] of SIDES){
    leg(p,s,straight?[sign*.14,.10,-.945]:[sign*.18,.08,-.67],[0,1,0]);
    arm(p,s,[sign*.29,.075,-.17],[sign,0,0]);
  }
  return p;
}
function bridge(raised=false,single=false,weighted=false) {
  let p=supine();
  if(raised){
    const shoulder=[0,.14,.38];
    const [knee]=solve(shoulder,[0,.08,-.67],.93,.40,[0,1,0]);
    const up=norm(sub(shoulder,knee));
    const hip=add(shoulder,mul(up,-.50));
    p=torso(hip,up);
    p.head=[0,.09,.61];p.neck=[0,.09,.48];
    for(const[s,sign]of SIDES){leg(p,s,[sign*.18,.08,-.67],[0,1,0]);arm(p,s,[sign*.29,.075,-.17],[sign,0,0]);}
  }
  if(single)leg(p,'r',[.16,.69,-.72],[0,1,0]);
  if(weighted) bothArms(p,(s,sign)=>[sign*.13,p[s+'h'][1]+.09,p[s+'h'][2]],(s,sign)=>[sign,0,0]);
  return p;
}
function frog(raised=false){
  const p=bridge(raised);
  for(const [s,sign] of SIDES) leg(p,s,[sign*.045,.085,-.61],[sign,1,0]);
  return p;
}
function quad(){
  const p=torso([0,.50,-.30],[0,.27,.963]);
  for(const [s,sign] of SIDES){
    arm(p,s,[sign*.23,.07,.20],[sign,0,-1]);
    // Deliberately bend the knee down and tuck the lower leg behind.
    leg(p,s,[sign*.14,.075,-.70],[0,-1,0]);
  }
  return p;
}
function quadrupedLift(kind){
  const p=quad();
  if(kind==='extension') leg(p,'r',[.14,.88,-.66],[0,0,-1]);
  if(kind==='hydrant') leg(p,'r',[.53,.42,-.62],[1,0,.5]);
  return p;
}
function sideLie(raised=false,clamshell=false){
  // Anatomical right is up; the underside arm supports the head.
  const p=torso([0,.30,-.10],[0,0,1],[0,1,0]);
  arm(p,'l',[0,.095,.80],[1,0,0]);arm(p,'r',[.28,.075,.31],[1,0,0]);
  if(clamshell){
    leg(p,'l',[0,.09,-.68],[.7,0,1]);
    leg(p,'r',[0,.105,-.68],raised?[0,1,0]:[1,0,0]);
  }else{
    leg(p,'l',[0,.075,-.929],[1,0,0]);
    leg(p,'r',[0,raised?.88:.34,raised?-.72:-.929],[1,0,0]);
  }
  return p;
}
function wallPush(low=false){
  const up=norm([0,1,low?.49:.23]);
  const p=torso(add([0,.08,-.23],mul(up,.829)),up);
  for(const[s,sign]of SIDES){leg(p,s,[sign*.15,.08,-.23],[0,0,1]);arm(p,s,[sign*.23,1.29,.62],[sign*.6,-.8,-.1]);}
  return p;
}
function push(low=false,knee=false,narrow=false,elbows=false){
  const u=norm([0,elbows?(knee?.31:.21):(low?.10:.35),1]);
  const anchor=[0,.075,knee?-.40:-.95];
  const p=torso(add(anchor,mul(u,knee?.43:.829)),u);
  for(const[s,sign]of SIDES){
    if(knee){p[s+'k']=[sign*.135,...anchor.slice(1)];p[s+'a']=[sign*.135,.23,-.769];}
    else leg(p,s,[sign*.135,...anchor.slice(1)],[0,1,0]);
    if(elbows){
      // Elbow anchors define a real forearm support with hands farther forward.
      const shoulder=p[s+'s']; const dy=shoulder[1]-.07;
      const dz=Math.sqrt(Math.max(0,.29*.29-dy*dy));
      p[s+'e']=[shoulder[0],.07,shoulder[2]+dz]; p[s+'w']=add(p[s+'e'],[0,0,.28]);
    }else arm(p,s,[sign*(narrow?.12:.245),.07,p[s+'s'][2]+.025],[sign*(narrow?.10:.6),0,-1]);
  }
  return p;
}
function floorPress(high=false,squeeze=false){
  const p=supine();
  if(!high&&!squeeze){
    for(const[s,sign]of SIDES){
      p[s+'e']=add(p[s+'s'],[sign*Math.sqrt(.29*.29-.07*.07-.12*.12),-.07,-.12]);
      p[s+'w']=add(p[s+'e'],[0,.28,0]);
    }
    return p;
  }
  return bothArms(p,(s,sign)=>[sign*(squeeze?.055:.21),high?.705:.35,.38],(s,sign)=>[sign,0,-.45]);
}
function prone(){
  const p=torso([0,.15,-.12],[0,0,1]);
  for(const[s,sign]of SIDES){leg(p,s,[sign*.14,.10,-.947],[0,-1,0]); arm(p,s,[sign*.28,.085,-.16],[sign,-1,0]);}
  return p;
}
function proneArms(kind,lift=false){
  const p=prone(),y=lift?.24:.09;
  if(lift){p.head[1]+=.025;p.neck[1]+=.015;}
  return bothArms(p,(s,sign)=>{
    if(kind==='w')return[sign*.46,y,.60];
    if(kind==='y')return[sign*.47,y,.86];
    if(kind==='t')return[sign*.765,y,.38];
    if(kind==='overhead')return[sign*.25,y,.94];
    return[sign*.29,y,-.16];
  },(s,sign)=>[sign,0,-1]);
}
function cobra(lift=false){
  const p=prone();
  if(lift){p.ls[1]+=.08;p.rs[1]+=.08;p.neck[1]+=.10;p.head[1]+=.12;}
  return bothArms(p,(s,sign)=>[sign*.29,lift?.22:.085,-.15],(s,sign)=>[sign,0,0]);
}
function row(high=false,single=false){
  const p=hinge();
  if(single){leg(p,'l',[-.16,.08,.28],[0,0,1]);leg(p,'r',[.16,.08,-.36],[0,0,1]);arm(p,'l',add(p.lk,[0,.07,.02]),[-1,0,0]);}
  for(const[s,sign]of SIDES)if(!single||s==='r'){
    if(high)arm(p,s,[sign*.24,p[s+'h'][1]-.02,p[s+'h'][2]+.10],[sign*.1,.6,-1]);
  }
  return p;
}
function pike(low=false){
  const hip=[0,low?.81:.99,-.16],u=norm([0,-.72,.70]);
  const p=torso(hip,u);
  for(const[s,sign]of SIDES){leg(p,s,[sign*.17,.08,-.76],[0,0,1]);arm(p,s,[sign*.25,.07,.55],[sign*.6,0,-1]);}
  return p;
}
function press(high=false,arnold=false){
  const p=standing();
  return bothArms(p,(s,sign)=>high?[sign*.24,1.97,.015]:arnold?[sign*.12,1.51,.25]:[sign*.43,1.57,0],(s,sign)=>[sign,-1,0]);
}
function raise(kind,high=false){
  const p=kind==='fly'?hinge():standing();
  if(!high)return p;
  return bothArms(p,(s,sign)=>{
    const sh=p[s+'s'];
    return kind==='front'?add(sh,[0,-.025,.56]):add(sh,[sign*.55,kind==='fly'?.02:-.025,.035]);
  },(s,sign)=>[0,-1,.3]);
}
function curl(sides='lr',cross=false){
  const p=standing();
  for(const[s,sign]of SIDES)if(sides.includes(s))arm(p,s,[cross?-sign*.12:sign*.24,1.31,.24],[sign,-1,0]);
  return p;
}
function triceps(high=false){
  const p=standing();
  return bothArms(p,(s,sign)=>[sign*.045,high?1.97:1.55,high?.02:-.17],(s,sign)=>[sign*.3,1,0]);
}
function kickback(extended=false){
  const p=hinge();
  for(const[s,sign]of SIDES){
    const e=add(p[s+'s'],[sign*.025,-.04,-Math.sqrt(.29*.29-.025*.025-.04*.04)]);
    p[s+'e']=e;p[s+'w']=add(e,extended?[0,.015,-Math.sqrt(.28*.28-.015*.015)]:[0,-.28,0]);
  }
  return p;
}
function floorTriceps(bent=false){
  const p=floorPress(true);
  if(bent)for(const[s]of SIDES)p[s+'w']=add(p[s+'e'],[0,-.08,Math.sqrt(.28*.28-.08*.08)]);
  return p;
}
function tableTop(armsUp=true){
  const p=supine();
  for(const[s,sign]of SIDES){p[s+'k']=[sign*.135,.57,-.12];p[s+'a']=[sign*.135,.57,-.52];}
  if(armsUp)bothArms(p,(s,sign)=>[sign*.21,.705,.38],()=>[0,0,1]);
  return p;
}
function deadBug(side=null){
  const p=tableTop();
  if(side){const opposite=side==='l'?'r':'l';arm(p,side,[p[side+'s'][0],.15,.94],[0,1,0]);leg(p,opposite,[p[opposite+'h'][0],.16,-.947],[0,1,0]);}
  return p;
}
function birdDog(side=null){
  const p=quad();
  if(side){const other=side==='l'?'r':'l';arm(p,side,add(p[side+'s'],[0,0,.569]),[0,-1,0]);leg(p,other,add(p[other+'h'],[0,.02,-.828]),[0,-1,0]);}
  return p;
}
function heelTap(side=null){
  const p=tableTop(false);if(side)leg(p,side,[p[side+'h'][0],.08,-.69],[0,1,0]);return p;
}
function reverseCrunch(){
  const p=tableTop(false);
  for(const[s,sign]of SIDES){
    p[s+'h']=add(p[s+'h'],[0,.085,.045]);
    leg(p,s,[sign*.135,.61,-.31],[0,1,1]);
  }
  return p;
}
function crunch(up=false){
  const p=supine();
  if(up){p.ls[1]+=.12;p.rs[1]+=.12;p.neck[1]+=.16;p.head[1]+=.21;p.neck[2]-=.025;p.head[2]-=.055;}
  bothArms(p,(s,sign)=>[sign*.12,p.head[1],p.head[2]-.035],(s,sign)=>[sign,0,0]);
  return p;
}
function bicycle(side='l'){
  const p=crunch(true),other=side==='l'?'r':'l';
  leg(p,side,[p[side+'h'][0],.50,-.40],[0,1,1]);leg(p,other,[p[other+'h'][0],.20,-.94],[0,1,0]);
  const angle=side==='l'?.22:-.22;
  for(const key of ['ls','rs','neck','head','le','re','lw','rw']){
    const [x,y,z]=p[key];p[key]=[x*Math.cos(angle)-(y-.14)*Math.sin(angle),.14+x*Math.sin(angle)+(y-.14)*Math.cos(angle),z];
  }
  return p;
}
function twist(angle=0){
  const p=torso([0,.16,0],[0,.90,-.436]);
  for(const[s,sign]of SIDES)leg(p,s,[sign*.18,.08,.64],[0,1,0]);
  reach(p,'chest');
  for(const key of ['ls','rs','neck','head','le','re','lw','rw']){
    const[x,y,z]=p[key];p[key]=[x*Math.cos(angle)+z*Math.sin(angle),y,-x*Math.sin(angle)+z*Math.cos(angle)];
  }
  return p;
}
function legRaise(high=true){
  const p=supine();
  for(const[s,sign]of SIDES)leg(p,s,[sign*.135,high?.958:.36,high?-.16:-.92],[0,1,0]);
  return p;
}
function shoulderTap(side=null){
  const p=push();for(const[s,sign]of SIDES)leg(p,s,[sign*.25,.075,-.95],[0,1,0]);
  if(side){const other=side==='l'?'r':'l';arm(p,side,add(p[other+'s'],[0,.015,0]),[0,-1,-1]);}
  return p;
}
function bear(raised=false){
  let p=quad();if(raised){p=shift(p,[0,.04,0]);for(const[s,sign]of SIDES){leg(p,s,[sign*.14,.09,-.69],[0,-1,0]);arm(p,s,[sign*.23,.07,.20],[sign,0,-1]);}}
  return p;
}
function march(side=null,high=false,arms=true){
  const p=standing();
  if(side){const other=side==='l'?'r':'l',x=p[side+'h'][0];leg(p,side,[x,high?.47:.30,.36],[0,0,1]);
    if(arms){arm(p,other,add(p[other+'s'],[0,-.29,.31]),[0,-1,0]);arm(p,side,add(p[side+'s'],[0,-.51,-.18]),[0,-1,0]);}}
  return p;
}
function jack(side=null,jump=false){
  const p=standing({width:side?.32:.10,hipY:side?.85:.905});
  if(side){
    if(!jump){leg(p,side,[side==='l'?-.47:.47,.08,0],[0,0,1]);leg(p,side==='l'?'r':'l',[side==='l'?.10:-.10,.08,0],[0,0,1]);}
    bothArms(p,(s,sign)=>[sign*.26,1.90,0],(s,sign)=>[sign,0,0]);
  }
  return jump&&side?shift(p,[0,.08,0]):p;
}
function mountain(side=null){
  const p=push();
  if(side){p[side+'k']=add(p[side+'h'],mul(norm([0,-.10,.42]),.43));p[side+'a']=add(p[side+'k'],[0,-.15,-Math.sqrt(.40*.40-.15*.15)]);}
  return p;
}
function kneeElbow(side=null){
  const p=march(side,true,false);
  bothArms(p,(s,sign)=>[sign*.13,1.59,.08],(s,sign)=>[sign,0,0]);
  if(side){const other=side==='l'?'r':'l';arm(p,other,[p[side+'s'][0]*.4,1.37,.20],[0,-1,1]);}
  return p;
}
function catCow(cat=true){
  const p=quad();
  p.head=add(p.head,[0,cat?-.12:.07,cat?-.055:.01]);
  p.neck=add(p.neck,[0,cat?-.015:.035,0]);
  return p;
}
function child(){
  const p=torso([0,.25,-.41],[0,-.16,.987]);
  for(const[s,sign]of SIDES){leg(p,s,[sign*.14,.07,-.42],[0,0,1]);arm(p,s,[sign*.23,.07,.64],[0,1,0]);}
  return p;
}
function thoracic(open=false){
  const p=quad();
  if(open){
    const center=mul(add(p.ls,p.rs),.5);
    p.ls=add(center,[-.13,-.165,0]);p.rs=add(center,[.13,.165,0]);
    arm(p,'l',[-.23,.07,.20],[-1,0,0]);
  }
  arm(p,'r',add(p.head,[.07,-.02,-.05]),open?[1,1,0]:[0,-1,-1]);
  return p;
}
function halfKneel(forward=false){
  const hipY=forward?.485:.50,hipZ=forward?.08:0;
  const p=torso([0,hipY,hipZ]);
  leg(p,'l',[-.14,.08,.43],[0,0,1]);
  const kneeZ=hipZ-Math.sqrt(.43*.43-(hipY-.075)**2);
  p.rk=[.135,.075,kneeZ];p.ra=[.135,.075,kneeZ-.40];
  bothArms(p,()=>add(p.lk,[0,.075,0]),(s,sign)=>[sign,0,0]);
  return p;
}
function calfStretch(final=false){
  const p=torso([0,.82,-.12],[0,.94,.34]);
  leg(p,'l',[-.14,.08,.30],[0,0,1]);leg(p,'r',[.14,final?.08:.14,-.48],[0,0,1]);
  bothArms(p,(s,sign)=>[sign*.23,1.29,.62],(s,sign)=>[sign,-1,0]);return p;
}
function hamstring(final=false){
  const p=supine({straight:true});
  leg(p,'l',[-.135,final?.94:.51,final?-.23:-.43],[0,1,1]);
  bothArms(p,()=>add(p.lk,[0,-.07,.05]),(s,sign)=>[sign,0,0]);return p;
}
function sidePlank(high=false,knee=false){
  const hip=[0,high?.399:.30,-.159],u=norm([0,.30,.954]);
  const p=torso(hip,u,[0,.954,-.30]);
  for(const[s]of SIDES){
    if(knee){
      const kneeY=s==='l'?.08:.23;
      const kneeZ=p[s+'h'][2]-Math.sqrt(.43*.43-(p[s+'h'][1]-kneeY)**2);
      p[s+'k']=[0,kneeY,kneeZ];p[s+'a']=[.40,kneeY,kneeZ];
    }
    else if(high){
      // Both knees extend fully; the top leg gently adducts to stack its ankle
      // above the supporting one instead of floating a pelvis-width higher.
      const dy=(s==='l'?.08:.18)-p[s+'h'][1];
      const down=[0,dy/.83,-Math.sqrt(.83*.83-dy*dy)/.83];
      p[s+'k']=add(p[s+'h'],mul(down,.43));p[s+'a']=add(p[s+'k'],mul(down,.40));
    }
    else leg(p,s,[0,s==='l'?.075:.24,-.92],[1,0,0]);
  }
  // The support elbow remains on the floor; shoulder rises through elbow extension
  // during entry, while the final position has a vertical upper arm.
  const dy=p.ls[1]-.07;
  const dx=Math.sqrt(Math.max(0,.29*.29-dy*dy));
  p.le=[dx,.07,p.ls[2]];p.lw=add(p.le,[.28,0,0]);
  arm(p,'r',add(p.rs,[0,.565,0]),[1,0,0]);return p;
}

// Every entry is deliberate: related movements share a rig, never a default fallback.
const sequences={
  'bodyweight-squat':[squat(),squat(true),squat()],
  'sumo-squat':[squat(false,.40),squat(true,.40),squat(false,.40)],
  'split-squat':[split(),split(true),split()],
  'reverse-lunge':[standing(),split(true,-.43),standing()],
  'forward-lunge':[standing(),split(true,.48),standing()],
  'lateral-lunge':[sideLunge(),sideLunge(true),sideLunge()],
  'calf-raise':[calf(),calf(true),calf()],
  'single-leg-calf-raise':[calf(false,true),calf(true,true)],
  'goblet-squat':[squat(false,.23,'goblet'),squat(true,.23,'goblet'),squat(false,.23,'goblet')],
  'dumbbell-squat':[squat(false,.23,'down'),squat(true,.23,'down'),squat(false,.23,'down')],
  'dumbbell-sumo-squat':[squat(false,.40,'center'),squat(true,.40,'center')],
  'dumbbell-split-squat':[split(),split(true),split()],
  'dumbbell-reverse-lunge':[standing(),split(true,-.43),standing()],
  'dumbbell-lateral-lunge':[sideLunge(false,'down'),sideLunge(true,'down'),sideLunge(false,'down')],
  'dumbbell-calf-raise':[calf(),calf(true)],
  'glute-bridge':[bridge(),bridge(true),bridge()],
  'single-leg-glute-bridge':[bridge(false,true),bridge(true,true),bridge(false,true)],
  'frog-pump':[frog(),frog(true)],
  'quadruped-hip-extension':[quad(),quadrupedLift('extension'),quad()],
  'fire-hydrant':[quad(),quadrupedLift('hydrant'),quad()],
  'side-lying-leg-raise':[sideLie(),sideLie(true),sideLie()],
  'clamshell':[sideLie(false,true),sideLie(true,true)],
  'bodyweight-good-morning':[hinge(false,'chest'),hinge(true,'chest'),hinge(false,'chest')],
  'dumbbell-rdl':[hinge(false),hinge(),hinge(false)],
  'dumbbell-deadlift':[hinge(false),hinge(true,'down',true),hinge(false)],
  'dumbbell-single-leg-rdl':[leg(standing(),'r',[.14,.18,-.25]),leg(hinge(),'r',[.14,.88,-1.04],[0,0,1]),leg(standing(),'r',[.14,.18,-.25])],
  'dumbbell-glute-bridge':[bridge(false,false,true),bridge(true,false,true)],
  'wall-push-up':[wallPush(),wallPush(true)],
  'knee-push-up':[push(false,true),push(true,true),push(false,true)],
  'push-up':[push(),push(true),push()],
  'close-grip-push-up':[push(false,false,true),push(true,false,true),push(false,false,true)],
  'dumbbell-floor-press':[floorPress(),floorPress(true),floorPress()],
  'dumbbell-floor-squeeze-press':[floorPress(false,true),floorPress(true,true)],
  'prone-w-raise':[proneArms('w'),proneArms('w',true)],
  'prone-y-raise':[proneArms('y'),proneArms('y',true)],
  'reverse-snow-angel':[proneArms('down',true),proneArms('t',true),proneArms('overhead',true)],
  'prone-cobra':[cobra(),cobra(true)],
  'dumbbell-bent-over-row':[row(),row(true),row()],
  'dumbbell-single-arm-row':[row(false,true),row(true,true)],
  'pike-push-up':[pike(),pike(true)],
  'dumbbell-overhead-press':[press(),press(true),press()],
  'dumbbell-arnold-press':[press(false,true),press(),press(true)],
  'dumbbell-lateral-raise':[raise('side'),raise('side',true),raise('side')],
  'dumbbell-front-raise':[raise('front'),raise('front',true),raise('front')],
  'dumbbell-reverse-fly':[raise('fly'),raise('fly',true)],
  'dumbbell-biceps-curl':[standing(),curl(),standing()],
  'dumbbell-hammer-curl':[standing(),curl(),standing()],
  'dumbbell-alternating-curl':[standing(),curl('l'),standing(),curl('r')],
  'dumbbell-cross-body-hammer-curl':[standing(),curl('l',true),curl('r',true)],
  'dumbbell-overhead-triceps-extension':[triceps(),triceps(true),triceps()],
  'dumbbell-triceps-kickback':[kickback(),kickback(true)],
  'dumbbell-floor-triceps-extension':[floorTriceps(),floorTriceps(true),floorTriceps()],
  'forearm-plank':[push(false,true,false,true),push(false,false,false,true)],
  'high-plank':[quad(),push()],
  'knee-plank':[quad(),push(false,true,false,true)],
  'side-plank':[sidePlank(),sidePlank(true)],
  'knee-side-plank':[sidePlank(false,true),sidePlank(true,true)],
  'dead-bug':[deadBug(),deadBug('l'),deadBug(),deadBug('r')],
  'bird-dog':[birdDog(),birdDog('l'),birdDog(),birdDog('r')],
  'heel-tap':[heelTap(),heelTap('r'),heelTap(),heelTap('l')],
  'reverse-crunch':[tableTop(false),reverseCrunch(),tableTop(false)],
  'crunch':[crunch(),crunch(true),crunch()],
  'bicycle-crunch':[bicycle('l'),bicycle('r')],
  'seated-russian-twist':[twist(),twist(-.4),twist(.4)],
  'lying-leg-raise':[legRaise(),legRaise(false),legRaise()],
  'plank-shoulder-tap':[shoulderTap(),shoulderTap('r'),shoulderTap(),shoulderTap('l')],
  'bear-hold':[bear(),bear(true)],
  'dumbbell-suitcase-march':[march(),march('l',false,false),march(),march('r',false,false)],
  'march-in-place':[march(),march('l'),march('r')],
  'step-jack':[jack(),jack('r'),jack(),jack('l')],
  'jumping-jack':[jack(),jack('both',true),jack()],
  'high-knees':[march('l',true),march('r',true)],
  'mountain-climber':[mountain(),mountain('r'),mountain(),mountain('l')],
  'standing-knee-to-elbow':[kneeElbow(),kneeElbow('l'),kneeElbow('r')],
  'cat-cow':[catCow(),catCow(false)],
  'child-pose':[quad(),child()],
  'thoracic-rotation':[thoracic(),thoracic(true),thoracic()],
  'half-kneeling-hip-flexor-stretch':[halfKneel(),halfKneel(true)],
  'standing-calf-stretch':[calfStretch(),calfStretch(true)],
  'supine-hamstring-stretch':[hamstring(),hamstring(true)]
};

const supineIds = new Set(['glute-bridge','single-leg-glute-bridge','frog-pump','dumbbell-glute-bridge','dumbbell-floor-press','dumbbell-floor-squeeze-press','dumbbell-floor-triceps-extension','dead-bug','heel-tap','reverse-crunch','crunch','bicycle-crunch','lying-leg-raise','supine-hamstring-stretch']);
const proneIds = new Set(['quadruped-hip-extension','fire-hydrant','knee-push-up','push-up','close-grip-push-up','prone-w-raise','prone-y-raise','reverse-snow-angel','prone-cobra','pike-push-up','forearm-plank','high-plank','knee-plank','bird-dog','plank-shoulder-tap','bear-hold','mountain-climber','cat-cow','child-pose','thoracic-rotation']);
const sideIds = new Set(['side-lying-leg-raise','clamshell','side-plank','knee-side-plank']);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const EXERCISE_3D_SPECS = freeze(EXERCISE_ANIMATIONS.map(source=>{
  const poses=sequences[source.id];
  if(!poses || poses.length!==source.phases.length)throw new Error(`Missing explicit 3D sequence: ${source.id}`);
  const orientation=supineIds.has(source.id)?'supine':proneIds.has(source.id)?'prone':sideIds.has(source.id)?'side':'standing';
  const result={id:source.id,duration:source.duration,hold:source.hold,equipment:source.equipment,weights:source.weights,grip:source.grip,toes:source.toes,bodyOrientation:orientation,phases:source.phases.map((p,i)=>({label:p.label,pose:poses[i]}))};
  if(source.wall){result.wall=true;result.wall3D=source.id==='single-leg-calf-raise'?{axis:'x',position:.76}:{axis:'z',position:.62};}
  if(source.id==='cat-cow')result.phases.forEach((p,i)=>{p.spineCurve=i===0?.10:-.045;});
  return result;
}));
const byId=new Map(EXERCISE_3D_SPECS.map(s=>[s.id,s]));
export function getExercise3DSpec(id){return byId.get(id)||null;}

function floorAwareSolve(origin,target,upper,lower,hint){
  const first=solve(origin,target,upper,lower,hint);
  if(first[0][1]>=.055)return first;
  // Rotate only the bend plane to keep the intermediate knee/elbow above the
  // mat; anchors stay put and bone lengths are still exact.
  const direction=norm(sub(target,origin));
  const projected=norm(sub(hint,mul(direction,dot(hint,direction))));
  const up=norm(sub([0,1,0],mul(direction,direction[1])));
  let lo=0,hi=1,result=solve(origin,target,upper,lower,up);
  if(result[0][1]<.055)return result;
  for(let i=0;i<24;i++){
    const t=(lo+hi)/2;
    const candidate=solve(origin,target,upper,lower,add(mul(projected,1-t),mul(up,t)));
    if(candidate[0][1]<.055)lo=t;else{hi=t;result=candidate;}
  }
  return result;
}

function rotate(v,axis,angle){
  return add(add(mul(v,Math.cos(angle)),mul(cross(axis,v),Math.sin(angle))),mul(axis,dot(axis,v)*(1-Math.cos(angle))));
}
function perpendicular(v,axis){return sub(v,mul(axis,dot(v,axis)));}
function transport(v,from,to,guide){
  const axis=cross(from,to),sine=length(axis),cosine=Math.max(-1,Math.min(1,dot(from,to)));
  if(sine>.000001)return rotate(v,mul(axis,1/sine),Math.atan2(sine,cosine));
  if(cosine>0)return v;
  return rotate(v,norm(cross(from,guide)),Math.PI);
}
function directionArc(from,to,t,guide){
  const cosine=Math.max(-1,Math.min(1,dot(from,to)));
  if(cosine>.9999)return norm(add(mul(from,1-t),mul(to,t)));
  if(cosine<-.8){
    const middle=norm(perpendicular(guide,from));
    return t<.5?directionArc(from,middle,t*2,guide):directionArc(middle,to,(t-.5)*2,guide);
  }
  const angle=Math.acos(cosine),sine=Math.sin(angle);
  return add(mul(from,Math.sin((1-t)*angle)/sine),mul(to,Math.sin(t*angle)/sine));
}
function bendPole(start,end,root,mid,tip,direction,t,guide){
  const a=norm(sub(start[tip],start[root])),b=norm(sub(end[tip],end[root]));
  const poleA=norm(perpendicular(sub(start[mid],start[root]),a));
  const poleB=norm(perpendicular(sub(end[mid],end[root]),b));
  const from=norm(perpendicular(transport(poleA,a,direction,guide),direction));
  const to=norm(perpendicular(transport(poleB,b,direction,guide),direction));
  let angle=Math.atan2(dot(direction,cross(from,to)),Math.max(-1,Math.min(1,dot(from,to))));
  if(Math.abs(Math.abs(angle)-Math.PI)<.00001)angle=Math.PI;
  return rotate(from,direction,angle*t);
}

/** Interpolate anchors and torso, then solve joints to avoid shrinking limbs in a
 * squat/press transition. Arguments a/b are phase indices, t is already eased.
 * Returns new data; frozen authored keyframes never change. */
export function interpolateExercise3DPose(spec,a,b,t){
  const start=spec?.phases[a]?.pose,end=spec?.phases[b]?.pose;
  if(!start||!end)throw new RangeError('Unknown 3D phase');
  t=Math.max(0,Math.min(1,Number.isFinite(t)?t:0));
  if(t===0)return copy(start);if(t===1)return copy(end);
  const p=Object.fromEntries(JOINTS_3D.map(k=>[k,add(mul(start[k],1-t),mul(end[k],t))]));
  for(const[s,sign]of SIDES){
    const wristA=sub(start[s+'w'],start[s+'s']),wristB=sub(end[s+'w'],end[s+'s']);
    const armGuide=[sign,0,.2];
    const groundedHands=start[s+'w'][1]<.12 && end[s+'w'][1]<.12;
    const wallHand=spec.wall3D && Math.abs(start[s+'w'][spec.wall3D.axis==='x'?0:2]-end[s+'w'][spec.wall3D.axis==='x'?0:2])<.001;
    if(!groundedHands&&!wallHand){
      // Free hands travel around the shoulder rather than cutting through it.
      // Planted hands remain anchored to the floor/wall in world coordinates.
      p[s+'w']=add(p[s+'s'],mul(directionArc(norm(wristA),norm(wristB),t,armGuide),length(wristA)*(1-t)+length(wristB)*t));
    }
    const elbowHint=bendPole(start,end,s+'s',s+'e',s+'w',norm(sub(p[s+'w'],p[s+'s'])),t,armGuide);
    const kneeHint=bendPole(start,end,s+'h',s+'k',s+'a',norm(sub(p[s+'a'],p[s+'h'])),t,[sign,0,1]);
    [p[s+'e'],p[s+'w']]=floorAwareSolve(p[s+'s'],p[s+'w'],.29,.28,elbowHint);
    [p[s+'k'],p[s+'a']]=floorAwareSolve(p[s+'h'],p[s+'a'],.43,.40,kneeHint);
  }
  if(spec.id==='side-plank'||spec.id==='knee-side-plank'){
    // Entry pivots on the supporting forearm. Solve its planted elbow directly
    // instead of choosing between the two sides of an IK circle at mat height.
    const dy=p.ls[1]-.07;
    p.le=[Math.sqrt(Math.max(0,.29*.29-dy*dy)),.07,p.ls[2]];
    p.lw=add(p.le,[.28,0,0]);
  }
  if(spec.id==='knee-plank')for(const[s]of SIDES){
    // Both knees stay on the mat while the hips move from quadruped to plank.
    const knee=add(mul(start[s+'k'],1-t),mul(end[s+'k'],t));
    const dy=p[s+'h'][1]-knee[1],dx=p[s+'h'][0]-knee[0];
    knee[2]=p[s+'h'][2]-Math.sqrt(Math.max(0,.43*.43-dy*dy-dx*dx));
    const shin=directionArc(norm(sub(start[s+'a'],start[s+'k'])),norm(sub(end[s+'a'],end[s+'k'])),t,[0,1,0]);
    p[s+'k']=knee;p[s+'a']=add(knee,mul(shin,.40));
  }
  return p;
}
