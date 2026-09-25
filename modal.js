// Shared modal behavior for the mobile experience: backdrop click and
// Escape close, plus a body scroll lock while open. Keep `wrap.remove()`
// as the single close path everywhere — openModal() only wires the extras.
export function openModal(wrap) {
  if (!wrap) return wrap;
  const previousOverflow = document.body.style.overflow;
  const onKeydown = e => { if (e.key === 'Escape') wrap.remove(); };
  const release = () => {
    document.body.style.overflow = previousOverflow;
    document.removeEventListener('keydown', onKeydown);
    observer.disconnect();
  };
  const observer = new MutationObserver(() => { if (!wrap.isConnected) release(); });
  document.body.style.overflow = 'hidden';
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.addEventListener('keydown', onKeydown);
  observer.observe(document.body, { childList: true, subtree: true });
  document.body.append(wrap);
  return wrap;
}
