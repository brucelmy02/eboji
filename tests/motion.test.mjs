import test from 'node:test';
import assert from 'node:assert/strict';

// This harness controls completion/cancellation, not layout or interpolation.
// Actual rendering, native focus, and disclosure sizing are browser checks.
class Animation {
  constructor() { this.active = true; }
  finish() { if (this.active) this.onfinish?.(); }
  cancel() { this.active = false; this.oncancel?.(); }
}

class Element extends EventTarget {
  constructor(children = []) {
    super();
    this.children = children;
    this.style = {};
    this.dataset = {};
    this.isConnected = true;
    this.animations = [];
  }
  contains(node) { return this.children.some(child => child === node || child.contains(node)); }
  animate() { const animation = new Animation(); this.animations.push(animation); return animation; }
  finishAnimation() { this.animations.at(-1)?.finish(); }
  activeAnimations() { return this.animations.filter(animation => animation.active); }
}

class Dialog extends Element {
  open = false;
  closeCount = 0;
  showModal() { this.open = true; }
  close() {
    this.open = false;
    this.closeCount++;
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  }
}

let moduleId = 0;
async function harness(t) {
  const media = new EventTarget();
  media.matches = false;
  const body = { style: { overflow: 'auto', paddingRight: '5px' } };
  const html = { style: { overflow: 'scroll' }, clientWidth: 1265 };
  const globals = {
    window: { innerWidth: 1280, matchMedia: () => media },
    document: { body, documentElement: html },
    getComputedStyle: node => ({ opacity: '1', transform: 'none', paddingRight: '5px', scrollbarGutter: 'auto', ...node.style }),
  };
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const motion = await import(`../public/motion.js?lifecycle-test=${++moduleId}`);
  return {
    ...motion,
    reduceMotion() { media.matches = true; media.dispatchEvent(new Event('change')); },
    assertLocked() { assert.equal(body.style.overflow, 'hidden'); assert.equal(html.style.overflow, 'hidden'); },
    assertRestored() {
      assert.equal(body.style.overflow, 'auto');
      assert.equal(body.style.paddingRight, '5px');
      assert.equal(html.style.overflow, 'scroll');
    },
  };
}

test('reopening a closing sheet supersedes its old promise without closing the new sheet', async (t) => {
  const motion = await harness(t);
  const dialog = new Dialog();
  const opening = motion.openSheet(dialog);
  dialog.finishAnimation();
  assert.equal(await opening, true);

  const closing = motion.closeSheet(dialog);
  assert.equal(motion.closeSheet(dialog), closing, 'repeated close reuses the in-flight operation');
  const oldAnimation = dialog.animations.at(-1);
  const reopening = motion.openSheet(dialog);
  assert.equal(await closing, false);
  oldAnimation.finish();
  dialog.finishAnimation();
  assert.equal(await reopening, true);
  assert.equal(dialog.open, true);
  assert.equal(dialog.closeCount, 0);
  assert.equal(dialog.activeAnimations().length, 0);
  motion.assertLocked();
  motion.cancelMotion(dialog);
  motion.assertRestored();
});

test('enabling reduced motion completes a pending close and restores original scroll styles', async (t) => {
  const motion = await harness(t);
  const dialog = new Dialog();
  const opening = motion.openSheet(dialog);
  dialog.finishAnimation();
  await opening;
  const closing = motion.closeSheet(dialog);
  motion.assertLocked();
  motion.reduceMotion();
  assert.equal(await closing, true);
  assert.equal(dialog.open, false);
  assert.equal(dialog.activeAnimations().length, 0);
  motion.assertRestored();

  const animationCount = dialog.animations.length;
  assert.equal(await motion.openSheet(dialog), true);
  assert.equal(dialog.open, true);
  assert.equal(await motion.closeSheet(dialog), true);
  assert.equal(dialog.animations.length, animationCount, 'reduced motion needs no animation completion event');
  motion.assertRestored();
});

test('route cleanup closes settled and animating sheets, releasing the shared scroll lock', async (t) => {
  const motion = await harness(t);
  const settled = new Dialog();
  const pending = new Dialog();
  const page = new Element([settled, pending]);
  const firstOpening = motion.openSheet(settled);
  settled.finishAnimation();
  await firstOpening;
  const secondOpening = motion.openSheet(pending);
  motion.cancelMotion(page);
  assert.equal(await secondOpening, false);
  for (const dialog of [settled, pending]) {
    assert.equal(dialog.open, false);
    assert.equal(dialog.dataset.motionState, undefined);
    assert.equal(dialog.activeAnimations().length, 0);
  }
  motion.assertRestored();
  motion.cancelMotion(page);
  motion.assertRestored();
});

test('a fresh notification cancels the previous dismissal so it cannot hide the new content', async (t) => {
  const motion = await harness(t);
  const toast = new Element();
  const dismissal = motion.dismiss(toast);
  const entrance = motion.reveal(toast, { distance: 0 });
  assert.equal(await dismissal, false);
  toast.finishAnimation();
  assert.equal(await entrance, true);
  assert.equal(toast.activeAnimations().length, 0);
});
