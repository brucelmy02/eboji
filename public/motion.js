// Small, interruptible transitions. Layout and native controls remain usable
// when motion is reduced, unavailable, or cancelled during a route change.
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const ease = 'cubic-bezier(.22, 1, .36, 1)';
const jobs = new Set();
const disclosures = new WeakMap();
const sheets = new WeakMap();
const observedSheets = new WeakSet();
const lockedSheets = new Set();
let savedScrollStyles;
let disclosureListener;

function animate(node, frames, options, { kind = 'reveal', finish = () => {}, cancel = () => {} } = {}) {
  let resolve;
  let animation;
  let settled = false;
  const promise = new Promise((done) => { resolve = done; });
  const settle = (completed) => {
    if (settled) return;
    settled = true;
    jobs.delete(job);
    if (animation) { animation.onfinish = null; animation.oncancel = null; animation.cancel(); }
    if (completed) finish(); else cancel();
    resolve(completed);
  };
  const job = { node, kind, promise, finish: () => settle(true), cancel: () => settle(false) };
  if (preference.matches || !node.isConnected || typeof node.animate !== 'function') {
    // Schedule no timers: an absent animation already has its final state.
    job.finish();
    return job;
  }
  try {
    animation = node.animate(frames, { fill: 'both', easing: ease, ...options });
    jobs.add(job);
    animation.onfinish = job.finish;
    animation.oncancel = job.cancel;
  } catch {
    job.finish();
  }
  return job;
}

function cancelReveals(node) {
  for (const job of [...jobs]) if (job.node === node && job.kind === 'reveal') job.cancel();
}

export function reveal(node, { direction = 1, distance = 12, duration = 260 } = {}) {
  if (!node) return Promise.resolve(false);
  cancelReveals(node);
  const style = getComputedStyle(node);
  const transform = style.transform === 'none' ? '' : style.transform;
  return animate(node, [
    { opacity: 0, transform: `translateY(${distance * direction}px) ${transform}`.trim() },
    { opacity: style.opacity, transform: transform || 'none' },
  ], { duration }).promise;
}

export function revealGroup(root, selector) {
  if (!root) return Promise.resolve([]);
  return Promise.all([...root.querySelectorAll(selector)].map((node, index) => {
    cancelReveals(node);
    const style = getComputedStyle(node);
    const transform = style.transform === 'none' ? '' : style.transform;
    return animate(node, [
      { opacity: 0, transform: `translateY(9px) ${transform}`.trim() },
      { opacity: style.opacity, transform: transform || 'none' },
    ], { duration: 280, delay: Math.min(index, 5) * 36 }).promise;
  }));
}

// Only opacity changes, so a toast can retain its own centering transform.
// A false result means a newer notification replaced this dismissal.
export function dismiss(node) {
  if (!node) return Promise.resolve(false);
  const opacity = getComputedStyle(node).opacity;
  cancelReveals(node);
  return animate(node, [{ opacity }, { opacity: 0 }], { duration: 150 }).promise;
}

function lockScroll(dialog) {
  if (lockedSheets.has(dialog)) return;
  if (!lockedSheets.size) {
    const body = document.body;
    const html = document.documentElement;
    savedScrollStyles = { body: body.style.overflow, html: html.style.overflow, padding: body.style.paddingRight };
    const gutter = window.innerWidth - html.clientWidth;
    // A reserved scrollbar gutter already compensates for the scrollbar.
    if (gutter > 0 && !getComputedStyle(html).scrollbarGutter?.includes('stable')) {
      body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`;
    }
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
  }
  lockedSheets.add(dialog);
}

function unlockScroll(dialog) {
  lockedSheets.delete(dialog);
  if (lockedSheets.size || !savedScrollStyles) return;
  document.body.style.overflow = savedScrollStyles.body;
  document.body.style.paddingRight = savedScrollStyles.padding;
  document.documentElement.style.overflow = savedScrollStyles.html;
  savedScrollStyles = null;
}

function observeSheet(dialog) {
  if (observedSheets.has(dialog)) return;
  observedSheets.add(dialog);
  dialog.addEventListener('close', () => {
    // Native close events can arrive after a rapid close/reopen.
    if (dialog.open) return;
    sheets.get(dialog)?.job?.cancel();
    sheets.delete(dialog);
    delete dialog.dataset.motionState;
    unlockScroll(dialog);
  });
}

function sheetMotion(dialog, opening) {
  if (!dialog) return Promise.resolve(false);
  observeSheet(dialog);
  const previous = sheets.get(dialog);
  if (!opening && !dialog.open) {
    previous?.job?.cancel();
    unlockScroll(dialog);
    return Promise.resolve(true);
  }
  if (opening && !dialog.isConnected) return Promise.resolve(false);
  if (previous?.opening === opening) return previous.job.promise;
  if (!previous && opening === dialog.open) {
    if (opening) lockScroll(dialog); else unlockScroll(dialog);
    return Promise.resolve(true);
  }
  const current = previous ? getComputedStyle(dialog) : null;
  // Snapshot animated styles before cancelling the interrupted effect.
  const start = current ? { opacity: current.opacity, transform: current.transform } : null;
  previous?.job.cancel();
  if (opening && !dialog.open) dialog.showModal();
  lockScroll(dialog);
  dialog.dataset.motionState = opening ? 'opening' : 'closing';
  const state = { opening, job: null };
  sheets.set(dialog, state);
  const clear = () => {
    if (sheets.get(dialog) === state) {
      sheets.delete(dialog);
      delete dialog.dataset.motionState;
    }
  };
  state.job = animate(dialog, [
    start || (opening ? { opacity: 0, transform: 'translateY(18px) scale(.98)' } : { opacity: 1, transform: 'none' }),
    opening ? { opacity: 1, transform: 'none' } : { opacity: 0, transform: 'translateY(10px) scale(.985)' },
  ], { duration: opening ? 300 : 180 }, {
    kind: 'sheet',
    finish: () => {
      clear();
      if (!opening) { if (dialog.open) dialog.close(); unlockScroll(dialog); }
    },
    cancel: clear,
  });
  return state.job.promise;
}

export function openSheet(dialog) { return sheetMotion(dialog, true); }
export function closeSheet(dialog) { return sheetMotion(dialog, false); }

function disclosureContent(details, summary) {
  const existing = [...details.children].find((node) => node.classList.contains('motion-details-content'));
  if (existing) return existing;
  const content = document.createElement('div');
  content.className = 'motion-details-content';
  // Contain children’s margins so their full natural height can be measured.
  content.style.display = 'flow-root';
  for (const node of [...details.childNodes]) if (node !== summary) content.append(node);
  details.append(content);
  return content;
}

function disclosureHeights(details, summary, content) {
  const style = getComputedStyle(details);
  const summaryStyle = getComputedStyle(summary);
  const number = (value) => parseFloat(value) || 0;
  const closed = summary.getBoundingClientRect().height
    + number(summaryStyle.marginTop) + number(summaryStyle.marginBottom)
    + number(style.paddingTop) + number(style.paddingBottom)
    + number(style.borderTopWidth) + number(style.borderBottomWidth);
  return { closed, open: closed + content.getBoundingClientRect().height };
}

function toggleDisclosure(details, summary) {
  const previous = disclosures.get(details);
  const opening = previous ? !previous.opening : !details.open;
  const currentHeight = details.getBoundingClientRect().height;
  const original = previous?.original || { height: details.style.height, overflow: details.style.overflow };
  previous?.job?.cancel();
  const content = disclosureContent(details, summary);
  details.open = true;
  details.style.overflow = 'hidden';
  details.style.height = `${currentHeight}px`;
  details.dataset.motionState = opening ? 'opening' : 'closing';
  const state = { opening, original, job: null, observer: null };
  disclosures.set(details, state);
  const clear = () => {
    state.observer?.disconnect();
    if (disclosures.get(details) !== state) return;
    disclosures.delete(details);
    details.style.height = original.height;
    details.style.overflow = original.overflow;
    delete details.dataset.motionState;
  };
  let targetHeight;
  const run = (from) => {
    const heights = disclosureHeights(details, summary, content);
    targetHeight = opening ? heights.open : heights.closed;
    state.job = animate(details, [{ height: `${from}px` }, { height: `${targetHeight}px` }], { duration: opening ? 280 : 210 }, {
      kind: 'disclosure',
      finish: () => { details.open = opening; clear(); },
      cancel: clear,
    });
  };
  run(currentHeight);
  if (disclosures.get(details) !== state || typeof ResizeObserver === 'undefined') return;
  state.observer = new ResizeObserver(() => {
    const heights = disclosureHeights(details, summary, content);
    const nextTarget = opening ? heights.open : heights.closed;
    if (Math.abs(nextTarget - targetHeight) < .5) return;
    // Images, nested disclosures and width changes may change the target.
    // Continue from the current on-screen height, never a guessed max-height.
    const from = details.getBoundingClientRect().height;
    state.job?.cancel();
    disclosures.set(details, state);
    details.style.overflow = 'hidden';
    details.style.height = `${from}px`;
    details.dataset.motionState = opening ? 'opening' : 'closing';
    run(from);
    if (disclosures.get(details) === state) {
      state.observer.observe(summary);
      state.observer.observe(content);
    }
  });
  state.observer.observe(summary);
  state.observer.observe(content);
}

export function initDisclosures() {
  if (disclosureListener) return;
  disclosureListener = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const summary = event.target instanceof Element ? event.target.closest('summary') : null;
    if (!summary || summary.parentElement?.tagName !== 'DETAILS') return;
    if (event.target.closest('a, button, input, select, textarea, [contenteditable="true"]')) return;
    if (preference.matches || typeof summary.animate !== 'function') return;
    event.preventDefault();
    toggleDisclosure(summary.parentElement, summary);
  };
  // Keyboard activation of a summary dispatches a click too. No keyboard
  // handler is needed, preserving native Enter/Space and Escape behavior.
  document.addEventListener('click', disclosureListener);
}

export function cancelMotion(root) {
  if (!root) return;
  const contains = (node) => root === node || root.contains(node);
  for (const job of [...jobs]) if (contains(job.node)) {
    if (job.kind === 'sheet') job.cancel(); else job.finish();
  }
  for (const dialog of [...lockedSheets]) if (contains(dialog)) {
    sheets.get(dialog)?.job?.cancel();
    sheets.delete(dialog);
    delete dialog.dataset.motionState;
    if (dialog.open) dialog.close();
    unlockScroll(dialog);
  }
}

preference.addEventListener('change', () => {
  if (preference.matches) for (const job of [...jobs]) job.finish();
});
