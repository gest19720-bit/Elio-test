// Shared modal behavior for the mobile experience: backdrop click and
// Escape close, plus a body scroll lock while open. Keep `wrap.remove()`
// as the single close path everywhere — openModal() only wires the extras.
//
// The scroll lock is reference-counted so chained modals (customer details
// → edit) each restore exactly once: the next modal opens before the
// previous one's cleanup runs, and a naive snapshot would save `hidden`
// as the "original" state and leave the page unscrollable on close.
//
// Setting `wrap.dataset.locked` makes a modal resist Escape, backdrop
// clicks, and its own [data-close] buttons. The MCP token flows lock
// while creation is pending and while the one-time token is on screen —
// closing then would discard the only displayed copy of a secret that
// cannot be shown again.

let openCount = 0;

export function openModal(wrap) {
  if (!wrap) return wrap;
  const dismiss = () => { if (!wrap.dataset.locked) wrap.remove(); };
  const onKeydown = e => { if (e.key === 'Escape') dismiss(); };
  const release = () => {
    openCount = Math.max(0, openCount - 1);
    if (!openCount) document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
    observer.disconnect();
  };
  const observer = new MutationObserver(() => { if (!wrap.isConnected) release(); });
  openCount += 1;
  document.body.style.overflow = 'hidden';
  wrap.addEventListener('click', e => {
    if (e.target === wrap) dismiss();
    else if (e.target.closest?.('[data-close]')) dismiss();
  });
  document.addEventListener('keydown', onKeydown);
  observer.observe(document.body, { childList: true, subtree: true });
  document.body.append(wrap);
  return wrap;
}
