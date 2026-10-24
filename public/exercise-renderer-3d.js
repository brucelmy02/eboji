import * as THREE from './vendor/three.module.js';
import { interpolateExercise3DPose } from './exercise-poses-3d.js';

// A single, local WebGL scene. Animation time belongs to the player: this module
// renders only when a pose, camera, or viewport changes, and owns no RAF loop.
const Y = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const viewNames = { 'three-quarter': '斜侧', front: '正面', side: '侧面', top: '俯视' };
const midpoint = (a, b) => new THREE.Vector3().addVectors(a, b).multiplyScalar(.5);
const vector = value => new THREE.Vector3(...value);
const motionBounds = new WeakMap();

function torsoGeometry() {
  // Rounded shoulders, a narrower waist, and an elliptical rib cage give the
  // mannequin a continuous silhouette instead of a collection of joint balls.
  const rings = [[0,.34],[.08,.40],[.28,.40],[.53,.45],[.76,.50],[.91,.50],[1,.43],[1.075,.20]];
  const positions = [], indices = [], count = 28;
  rings.forEach(([height, radius]) => {
    for (let index = 0; index < count; index++) {
      const angle = index / count * TAU;
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius * .56);
    }
  });
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let index = 0; index < count; index++) {
      const a = ring * count + index, b = ring * count + (index + 1) % count;
      indices.push(a,a+count,b,b,a+count,b+count);
    }
  }
  positions.push(0,0,0,0,rings.at(-1)[0],0);
  const bottom = rings.length * count, top = bottom + 1;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count, lastRing = (rings.length - 1) * count;
    indices.push(bottom,index,next,top,lastRing+next,lastRing+index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedMat(width, length) {
  const x = -width / 2, y = -length / 2, r = .13;
  const shape = new THREE.Shape();
  shape.moveTo(x+r,y);
  shape.lineTo(x+width-r,y); shape.quadraticCurveTo(x+width,y,x+width,y+r);
  shape.lineTo(x+width,y+length-r); shape.quadraticCurveTo(x+width,y+length,x+width-r,y+length);
  shape.lineTo(x+r,y+length); shape.quadraticCurveTo(x,y+length,x,y+length-r);
  shape.lineTo(x,y+r); shape.quadraticCurveTo(x,y,x+r,y);
  return new THREE.ShapeGeometry(shape,12);
}

/**
 * Poses are in metres: X across the body, Y up, Z forward. Floor poses have
 * their head towards +Z. bodyOrientation disambiguates the face of floor poses.
 * zoom: negative = closer; rotate: radians. Camera fitting includes every phase.
 */
export function createExercise3DScene(container, spec, {onViewChange, onUnavailable} = {}) {
  if (!container || !spec?.phases?.length) throw new Error('缺少 3D 动作数据');
  const document = container.ownerDocument, window = document.defaultView;
  const geometries = new Set(), materials = new Set();
  const floorPose = ['supine','prone','side'].includes(spec.bodyOrientation);
  let destroyed = false, unavailable = false, pointer = null, resizeObserver = null, shadowLight = null;
  let azimuth = floorPose ? 1.0 : .64, elevation = floorPose ? .50 : .27, zoomFactor = 1, currentView = 'three-quarter';
  const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  const canvas = renderer.domElement;
  const abort = new window.AbortController();
  const listen = (target, type, handler, options = {}) => target.addEventListener(type,handler,{...options,signal:abort.signal});
  try {
  const ownGeometry = geometry => { geometries.add(geometry); return geometry; };
  const material = options => {
    const result = new THREE.MeshStandardMaterial({roughness:.76,metalness:0,...options});
    materials.add(result); return result;
  };
  const palette = {
    shirt:material({color:0x428bea}), collar:material({color:0x2e6dbd}),
    trousers:material({color:0x485c77}), seam:material({color:0x536a88}),
    skin:material({color:0xe4b897,roughness:.87}), hair:material({color:0x34425a}),
    shoe:material({color:0x263b56}), sole:material({color:0xe4eaf3}),
    weight:material({color:0x3a4a61,roughness:.48,metalness:.34}),
    steel:material({color:0xa8b7c7,roughness:.28,metalness:.65}),
  };
  const sphere = ownGeometry(new THREE.SphereGeometry(1,24,16));
  const cylinder = ownGeometry(new THREE.CylinderGeometry(1,1,1,24));
  const torsoGeo = ownGeometry(torsoGeometry());
  const torsoOriginalPositions = new Float32Array(torsoGeo.attributes.position.array);
  const curvesSpine = spec.phases.some(phase => Number.isFinite(phase.spineCurve));
  let lastSpineCurve = NaN;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f9fd);
  scene.fog = new THREE.Fog(0xf6f9fd,8,22);
  const model = new THREE.Group(); scene.add(model);
  const camera = new THREE.PerspectiveCamera(35,1,.01,60);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.className = 'exercise-3d-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','三维动作示意。拖动旋转，方向键切换观察角度，加减键缩放。');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline-offset:-4px;';
  container.append(canvas);

  function mesh(geometry, mat, parent = model) {
    const result = new THREE.Mesh(geometry,mat);
    result.castShadow = true; result.receiveShadow = true;
    parent.add(result); return result;
  }
  function ball(mat, size, parent = model) {
    const result = mesh(sphere,mat,parent); result.scale.set(...size); return result;
  }
  function limb(radius, mat, taper = .84) {
    const body = mesh(ownGeometry(new THREE.CylinderGeometry(taper,1,1,20)),mat);
    const start = ball(mat,[radius,radius,radius]);
    const end = ball(mat,[radius*taper,radius*taper,radius*taper]);
    const result = {
      set(a,b) {
        const length = a.distanceTo(b);
        body.position.copy(a).lerp(b,.5);
        body.scale.set(radius,Math.max(.001,length),radius);
        body.quaternion.setFromUnitVectors(Y,new THREE.Vector3().subVectors(b,a).normalize());
        start.position.copy(a); end.position.copy(b);
      },
    };
    return result;
  }
  const torso = mesh(torsoGeo,palette.shirt);
  const pelvis = ball(palette.trousers,[.17,.105,.105]);
  const collar = ball(palette.collar,[.084,.024,.074]);
  const neck = limb(.047,palette.skin,.94);
  const head = new THREE.Group(); model.add(head);
  ball(palette.skin,[.094,.122,.092],head);
  const hair = mesh(ownGeometry(new THREE.SphereGeometry(1,24,12,0,TAU,0,Math.PI*.47)),palette.hair,head);
  hair.scale.set(.096,.124,.094); hair.position.y = .002;
  const nose = ball(palette.skin,[.018,.022,.027],head); nose.position.set(0,-.012,.088);
  for (const side of [-1,1]) {
    const ear = ball(palette.skin,[.014,.027,.018],head); ear.position.set(side*.092,-.007,0);
    const eye = ball(palette.hair,[.005,.006,.003],head); eye.position.set(side*.031,.018,.086);
  }
  const arms = {}, legs = {}, shoes = {};
  for (const side of ['l','r']) {
    arms[side] = {upper:limb(.049,palette.skin,.88),sleeve:limb(.064,palette.shirt,.88),lower:limb(.044,palette.skin,.77),hand:ball(palette.skin,[.036,.061,.031])};
    legs[side] = {upper:limb(.083,palette.trousers,.79),lower:limb(.062,palette.trousers,.72),knee:ball(palette.seam,[.063,.066,.062])};
    const foot = new THREE.Group(); model.add(foot); shoes[side] = foot;
    const sole = ball(palette.sole,[.061,.019,.116],foot); sole.position.set(0,-.035,.041);
    const upper = ball(palette.shoe,[.058,.041,.112],foot); upper.position.set(0,-.005,.041);
    const tongue = ball(palette.seam,[.034,.014,.05],foot); tongue.position.set(0,.031,.025);
  }
  function dumbbell() {
    const group = new THREE.Group(); model.add(group);
    const handle = mesh(cylinder,palette.steel,group); handle.scale.set(.016,.24,.016);
    for (const end of [-1,1]) {
      const plate = mesh(ownGeometry(new THREE.CylinderGeometry(.065,.065,.047,8)),palette.weight,group);
      plate.position.y = end*.112;
      const rim = mesh(cylinder,palette.steel,group); rim.scale.set(.029,.006,.029); rim.position.y = end*.138;
    }
    return group;
  }
  const weights = spec.equipment === 'dumbbells' ? [dumbbell(),dumbbell()] : [];
  const singleWeight = ['goblet','single-center','hip'].includes(spec.weights);
  if (singleWeight || spec.weights === 'right') weights[1] && (weights[1].visible = false);

  scene.add(new THREE.HemisphereLight(0xffffff,0xc5d0df,2.6));
  const keyLight = new THREE.DirectionalLight(0xffffff,3.1);
  shadowLight = keyLight;
  keyLight.position.set(-3,5,4); keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024,1024);
  keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -3;
  keyLight.shadow.camera.right = keyLight.shadow.camera.top = 3;
  keyLight.shadow.camera.near = .1; keyLight.shadow.camera.far = 15;
  keyLight.shadow.bias = -.00025; keyLight.shadow.normalBias = .018;
  keyLight.shadow.radius = 3;
  scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0xd6e7ff,1.3); fill.position.set(4,2,-3); scene.add(fill);

  const cachedBounds = motionBounds.get(spec);
  const bounds = cachedBounds ? cachedBounds.clone() : new THREE.Box3();
  const includePose = pose => {
    for (const values of Object.values(pose)) {
      if (Array.isArray(values) && values.length === 3 && values.every(Number.isFinite)) bounds.expandByPoint(vector(values));
    }
  };
  for (let index = 0; !cachedBounds && index < spec.phases.length; index++) {
    includePose(spec.phases[index].pose);
    // The player's inverse-kinematic interpolation can arc an elbow or knee
    // outside the keyframes. Include that travel, including the return segment,
    // so rotating or playing never changes framing or clips a moving joint.
    const next = (index+1) % spec.phases.length;
    // Dense samples also cover short IK bend-plane turns between quarter
    // points. This runs once when opening a player, never in the render loop.
    for (let sample = 1; sample < 100; sample++) includePose(interpolateExercise3DPose(spec,index,next,sample/100));
  }
  if (bounds.isEmpty()) { destroy(); throw new Error('3D 动作坐标无效'); }
  // Covers head/feet volumes and the full span of a dumbbell, including overhead.
  if (!cachedBounds) {
    bounds.expandByScalar(spec.equipment === 'dumbbells' ? .22 : .17);
    bounds.min.y = Math.max(-.07,bounds.min.y);
    motionBounds.set(spec,bounds.clone());
  }
  const target = bounds.getCenter(new THREE.Vector3());
  const span = bounds.getSize(new THREE.Vector3());
  const corners = [];
  for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) corners.push(new THREE.Vector3(x,y,z).sub(target));
  const ground = mesh(ownGeometry(new THREE.PlaneGeometry(200,200)),material({color:0xf6f9fd}),scene);
  ground.rotation.x = -Math.PI/2; ground.position.y = -.025; ground.castShadow = false;
  const matWidth = Math.max(1.22,span.x+.12), matLength = Math.max(floorPose ? 2.05 : 1.22,span.z+.12);
  const mat = mesh(ownGeometry(roundedMat(matWidth,matLength)),material({color:0xe1ebf7,roughness:.96}),scene);
  mat.rotation.x = -Math.PI/2; mat.position.set(target.x,-.016,target.z); mat.castShadow = false;
  // A discreet alignment stripe makes forward/backward travel easier to read.
  const stripe = mesh(ownGeometry(new THREE.PlaneGeometry(.012,matLength-.3)),material({color:0xcbdcf1}),scene);
  stripe.rotation.x = -Math.PI/2; stripe.position.set(target.x,-.014,target.z); stripe.castShadow = false;
  const wallSpec = spec.wall3D || (spec.wallPosition && {axis:spec.wallPosition.axis,position:spec.wallPosition.value});
  if (spec.wall && wallSpec) {
    const wallMat = material({color:0xd7e3f1,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
    const wall = mesh(ownGeometry(new THREE.PlaneGeometry(1.45,2)),wallMat,scene);
    wall.position.set(target.x,1,wallSpec.position);
    if (wallSpec.axis === 'x') { wall.rotation.y = Math.PI/2; wall.position.set(wallSpec.position,1,target.z); }
    wall.castShadow = false; wall.receiveShadow = false;
    const edges = new THREE.LineSegments(ownGeometry(new THREE.EdgesGeometry(wall.geometry)),new THREE.LineBasicMaterial({color:0xbacbe0,transparent:true,opacity:.62}));
    materials.add(edges.material); wall.add(edges);
  }

  function render() {
    if (!destroyed && !unavailable) renderer.render(scene,camera);
  }
  // Render and read in the same task: no persistent drawing buffer or extra
  // render loop is needed for the offline poster export.
  function capture({ type = 'image/webp', quality = .9 } = {}) {
    if (destroyed || unavailable) throw new Error('3D 场景不可用，无法导出预览');
    render();
    return canvas.toDataURL(type, quality);
  }
  function placeCamera() {
    const direction = new THREE.Vector3(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));
    const right = new THREE.Vector3().crossVectors(Y,direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction,right).normalize();
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)), tanX = tanY*camera.aspect;
    const distance = Math.max(...corners.map(p => p.dot(direction)+Math.max(Math.abs(p.dot(right))/tanX,Math.abs(p.dot(up))/tanY))) * 1.055;
    camera.position.copy(target).addScaledVector(direction,distance*zoomFactor);
    camera.up.copy(Y); camera.lookAt(target); camera.updateMatrixWorld();
    render();
  }
  function resize() {
    if (destroyed || unavailable) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1,Math.round(rect.width || 360));
    const height = Math.max(1,Math.round(rect.height || width*.86));
    renderer.setSize(width,height,false);
    camera.aspect = width/height; camera.updateProjectionMatrix(); placeCamera();
  }
  function notifyView() { onViewChange?.(currentView); }
  function setView(name) {
    if (destroyed || !Object.hasOwn(viewNames,name)) return;
    currentView = name; zoomFactor = 1;
    const views = {'three-quarter':floorPose ? [1.0,.50] : [.64,.27],front:[0,.08],side:[Math.PI/2,.10],top:[Math.PI,Math.PI/2-.012]};
    [azimuth,elevation] = views[name]; placeCamera(); notifyView();
  }
  function rotate(deltaAzimuth, deltaElevation = 0) {
    if (destroyed || !Number.isFinite(deltaAzimuth) || !Number.isFinite(deltaElevation)) return;
    azimuth = (azimuth+deltaAzimuth)%TAU;
    elevation = clamp(elevation+deltaElevation,.015,Math.PI/2-.025);
    currentView = 'custom'; placeCamera(); notifyView();
  }
  function zoom(delta) {
    if (destroyed || !Number.isFinite(delta)) return;
    zoomFactor = clamp(zoomFactor*Math.exp(delta*.15),.72,2.1); placeCamera();
  }
  function frame(right, up, forward) {
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
  }
  function draw(pose, phaseIndex = 0) {
    if (destroyed || unavailable || !pose) return;
    const p = Object.fromEntries(Object.entries(pose).map(([key,values]) => [key,vector(values)]));
    const shoulder = midpoint(p.ls,p.rs), hip = midpoint(p.lh,p.rh);
    const bodyUp = new THREE.Vector3().subVectors(shoulder,hip).normalize();
    const across = new THREE.Vector3().subVectors(p.rs,p.ls).normalize();
    const orientation = spec.phases[Math.floor(phaseIndex)]?.bodyOrientation || spec.bodyOrientation || 'standing';
    let forward = new THREE.Vector3().crossVectors(across,bodyUp).normalize();
    if (orientation === 'supine' && forward.y < 0) forward.negate();
    if (orientation === 'prone' && forward.y > 0) forward.negate();
    if (orientation === 'side' && forward.x < 0) forward.negate();
    const bodyRight = new THREE.Vector3().crossVectors(bodyUp,forward).normalize();
    const bodyFrame = frame(bodyRight,bodyUp,forward);
    const bodyWidth = Math.max(.28,p.ls.distanceTo(p.rs));
    torso.position.copy(hip); torso.quaternion.copy(bodyFrame);
    torso.scale.set(bodyWidth,hip.distanceTo(shoulder),bodyWidth);
    if (curvesSpine) {
      const index = Math.floor(phaseIndex) % spec.phases.length;
      const next = (index+1) % spec.phases.length;
      const fromCurve = spec.phases[index]?.spineCurve || 0;
      const toCurve = spec.phases[next]?.spineCurve || 0;
      const curve = fromCurve+(toCurve-fromCurve)*(phaseIndex-Math.floor(phaseIndex));
      if (Math.abs(curve-lastSpineCurve) > .00001 || !Number.isFinite(lastSpineCurve)) {
        const positions = torsoGeo.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const y = torsoOriginalPositions[i*3+1];
          positions.setZ(i,torsoOriginalPositions[i*3+2]-curve/bodyWidth*Math.sin(Math.PI*y/1.075));
        }
        positions.needsUpdate = true; torsoGeo.computeVertexNormals(); lastSpineCurve = curve;
      }
    }
    pelvis.position.copy(hip).addScaledVector(bodyUp,-.012); pelvis.quaternion.copy(bodyFrame);
    pelvis.scale.set(Math.max(.135,p.lh.distanceTo(p.rh)*.6),.105,.105);
    collar.position.copy(shoulder).addScaledVector(bodyUp,.025); collar.quaternion.copy(bodyFrame);
    neck.set(p.neck.clone().addScaledVector(bodyUp,-.04),p.head.clone().addScaledVector(bodyUp,-.10));
    const headUp = new THREE.Vector3().subVectors(p.head,p.neck).normalize();
    let headForward = forward.clone().addScaledVector(headUp,-forward.dot(headUp)).normalize();
    if (headForward.lengthSq() < .1) headForward = forward.clone();
    const headRight = new THREE.Vector3().crossVectors(headUp,headForward).normalize();
    head.position.copy(p.head); head.quaternion.copy(frame(headRight,headUp,headForward));
    for (const side of ['l','r']) {
      const [s,e,w,h,k,a] = ['s','e','w','h','k','a'].map(suffix => p[side+suffix]);
      arms[side].upper.set(s,e);
      arms[side].sleeve.set(s,s.clone().lerp(e,.56));
      arms[side].lower.set(e,w);
      const armDirection = new THREE.Vector3().subVectors(w,e).normalize();
      arms[side].hand.position.copy(w).addScaledVector(armDirection,.022);
      arms[side].hand.quaternion.setFromUnitVectors(Y,armDirection);
      legs[side].upper.set(h,k); legs[side].lower.set(k,a); legs[side].knee.position.copy(k);
      let toeDirection = new THREE.Vector3(0,0,1), shoeUp = Y.clone();
      const shin = new THREE.Vector3().subVectors(a,k).normalize();
      if (orientation !== 'standing') {
        // With bent knees the foot rests flat; with straight supine legs it
        // points up. Prone toes extend along the lower leg, without penetrating
        // the floor. This is a foot orientation, not an extra animation phase.
        if (orientation === 'supine' && Math.abs(shin.y)<.5) { toeDirection.set(0,1,0); shoeUp.set(0,0,1); }
        else if (orientation === 'side') { toeDirection.set(1,0,0); shoeUp.set(0,1,0); }
        else { toeDirection.set(0,0,-1); shoeUp.set(0,1,0); }
      } else if (/sumo|squat/.test(spec.id)) {
        toeDirection.set(side === 'l' ? -.22 : .22,0,1).normalize();
      }
      const toeContact = spec.toes === true || spec.toes === side;
      if (toeContact && orientation === 'standing') {
        const angle = clamp((a.y-.09)*4,0,.65);
        toeDirection.applyAxisAngle(new THREE.Vector3(1,0,0),angle);
        shoeUp = new THREE.Vector3().crossVectors(toeDirection,new THREE.Vector3(1,0,0)).normalize();
      }
      const footRight = new THREE.Vector3().crossVectors(shoeUp,toeDirection).normalize();
      shoes[side].position.copy(a);
      if (shoeUp.y > .8) shoes[side].position.y = Math.max(.055,a.y);
      shoes[side].quaternion.copy(frame(footRight,shoeUp,toeDirection));
    }
    if (weights.length) {
      const alignWeight = (weight, point, direction) => {
        weight.position.copy(point);
        weight.quaternion.setFromUnitVectors(Y,direction.clone().normalize());
      };
      if (singleWeight) {
        alignWeight(weights[0],midpoint(p.lw,p.rw),spec.weights === 'hip' ? bodyRight : bodyUp);
      } else if (spec.weights === 'right') {
        alignWeight(weights[0],p.rw,spec.grip === 'neutral' ? forward : bodyRight);
      } else {
        alignWeight(weights[0],p.lw,spec.grip === 'neutral' ? forward : bodyRight);
        alignWeight(weights[1],p.rw,spec.grip === 'neutral' ? forward : bodyRight);
      }
    }
    render();
  }
  listen(canvas,'pointerdown',event => {
    if (event.button !== 0 || pointer) return;
    pointer = {id:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture?.(event.pointerId); canvas.style.cursor = 'grabbing';
  });
  listen(canvas,'pointermove',event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX-pointer.x, dy = event.clientY-pointer.y;
    pointer.x = event.clientX; pointer.y = event.clientY;
    // On touch screens, horizontal gestures orbit; vertical gestures retain
    // native page scrolling and the browser cancels this pointer when needed.
    rotate(-dx*.008,event.pointerType === 'touch' ? 0 : dy*.007);
  });
  const releasePointer = event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    pointer = null; canvas.style.cursor = 'grab';
  };
  listen(canvas,'pointerup',releasePointer); listen(canvas,'pointercancel',releasePointer); listen(canvas,'lostpointercapture',releasePointer);
  // Ordinary page scrolling remains ordinary. Only a deliberate Ctrl/Meta
  // wheel gesture over the model zooms it (buttons and +/- work without this).
  listen(canvas,'wheel',event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault(); zoom(clamp(event.deltaY*.012,-1,1));
  },{passive:false});
  listen(canvas,'keydown',event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const commands = {ArrowLeft:()=>rotate(-.15),ArrowRight:()=>rotate(.15),ArrowUp:()=>rotate(0,.12),ArrowDown:()=>rotate(0,-.12),'+':()=>zoom(-1),'=':()=>zoom(-1),'-':()=>zoom(1),'0':()=>setView('three-quarter')};
    if (commands[event.key]) { event.preventDefault(); commands[event.key](); }
  });
  listen(canvas,'webglcontextlost',event => {
    event.preventDefault();
    if (destroyed || unavailable) return;
    unavailable = true; onUnavailable?.();
  });
  if (window.ResizeObserver) { resizeObserver = new window.ResizeObserver(resize); resizeObserver.observe(container); }
  else listen(window,'resize',resize);
  function destroy() {
    if (destroyed) return;
    destroyed = true; abort.abort(); resizeObserver?.disconnect(); pointer = null;
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    keyLight.shadow?.map?.dispose();
    renderer.renderLists?.dispose(); renderer.dispose();
    // Remove the loss handler before releasing the context so a normal route
    // change never presents the user with a false fallback/error state.
    renderer.forceContextLoss(); canvas.remove(); scene.clear();
  }
  resize(); draw(spec.phases[0].pose);
  return {draw,setView,rotate,zoom,resize,capture,destroy};
  } catch (error) {
    // Initialization can fail after the WebGL context exists (for example a
    // bad pose or unsupported rendering feature). Release partial scenes too.
    destroyed = true; abort.abort(); resizeObserver?.disconnect();
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    shadowLight?.shadow?.map?.dispose();
    renderer.renderLists?.dispose(); renderer.dispose();
    renderer.forceContextLoss(); canvas.remove();
    throw error;
  }
}
