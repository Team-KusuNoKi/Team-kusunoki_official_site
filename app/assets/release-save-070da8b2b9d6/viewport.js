// Keyboard changes can resize only the visual viewport, leaving dvh/layout unchanged.
// https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
// https://developer.chrome.com/blog/viewport-resize-behavior
export function bindVisualViewport(win = window, doc = document) {
  let queued = false;
  const listeners = [];

  function update() {
    const viewport = win.visualViewport;
    // Pinch zoom should magnify the page rather than resize its application frame.
    if (viewport && Math.abs((viewport.scale ?? 1) - 1) > .01) return;
    const height = viewport?.height ?? win.innerHeight;
    if (!Number.isFinite(height) || height <= 0 || !doc.documentElement?.style) return;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + height;
    const style = doc.documentElement.style;
    style.setProperty('--visual-height', `${height}px`);
    style.setProperty('--visual-offset-top', `${top}px`);
    style.setProperty('--visual-bottom-inset', `${Math.max(0, (win.innerHeight ?? bottom) - bottom)}px`);

    const workspace = doc.querySelector('.workspace');
    if (workspace) {
      const gap = parseFloat(win.getComputedStyle(workspace).getPropertyValue('--workspace-bottom-gap')) || 0;
      // DOM rects and offsetTop use layout-viewport coordinates, including browser panning.
      workspace.style.setProperty('--workspace-height', `${Math.max(0, bottom - workspace.getBoundingClientRect().top - gap)}px`);
    }

    // Move only the scrollable answer surface, keeping the conversation's scroll position.
    const focused = doc.activeElement;
    const surface = focused?.closest?.('.composer-area, dialog');
    if (!surface || surface.hidden || surface.inert) return;
    const field = focused.getBoundingClientRect();
    const bounds = surface.getBoundingClientRect();
    const visibleTop = Math.max(top, bounds.top) + 12;
    const visibleBottom = Math.min(bottom, bounds.bottom) - 12;
    if (visibleBottom <= visibleTop) return;
    if (field.bottom > visibleBottom) surface.scrollTop += field.bottom - visibleBottom;
    else if (field.top < visibleTop) surface.scrollTop -= visibleTop - field.top;
  }

  function schedule() {
    if (queued) return;
    queued = true;
    const frame = win.requestAnimationFrame?.bind(win) ?? (callback => callback());
    frame(() => { queued = false; update(); });
  }

  function listen(target, name) {
    if (!target?.addEventListener) return;
    target.addEventListener(name, schedule, { passive: true });
    listeners.push([target, name]);
  }
  for (const name of ['resize', 'scroll']) listen(win.visualViewport, name);
  for (const name of ['resize', 'scroll', 'orientationchange', 'pageshow']) listen(win, name);
  for (const name of ['focusin', 'focusout']) listen(doc, name);
  update();
  return { update, schedule, dispose() { for (const [target, name] of listeners) target.removeEventListener(name, schedule); } };
}
