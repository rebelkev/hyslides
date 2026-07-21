export function resizeBounds(bounds, handle, dx, dy, lockAspect = false) {
  const next = { ...bounds };
  if (handle.includes("e")) next.w = Math.max(20, bounds.w + dx);
  if (handle.includes("s")) next.h = Math.max(20, bounds.h + dy);
  if (handle.includes("w")) {
    next.x = bounds.x + dx;
    next.w = Math.max(20, bounds.w - dx);
  }
  if (handle.includes("n")) {
    next.y = bounds.y + dy;
    next.h = Math.max(20, bounds.h - dy);
  }
  if (!lockAspect || !bounds.w || !bounds.h) return next;

  const ratio = bounds.w / bounds.h;
  const horizontal = handle.includes("e") || handle.includes("w");
  const vertical = handle.includes("n") || handle.includes("s");
  if (horizontal && vertical) {
    const widthChange = Math.abs(next.w / bounds.w - 1);
    const heightChange = Math.abs(next.h / bounds.h - 1);
    if (widthChange >= heightChange) next.h = Math.max(20, next.w / ratio);
    else next.w = Math.max(20, next.h * ratio);
  } else if (horizontal) {
    next.h = Math.max(20, next.w / ratio);
    next.y = bounds.y + (bounds.h - next.h) / 2;
  } else if (vertical) {
    next.w = Math.max(20, next.h * ratio);
    next.x = bounds.x + (bounds.w - next.w) / 2;
  }

  if (handle.includes("w")) next.x = bounds.x + bounds.w - next.w;
  if (handle.includes("n")) next.y = bounds.y + bounds.h - next.h;
  return next;
}
