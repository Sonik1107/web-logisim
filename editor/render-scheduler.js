// Coalesce pointer moves into one paint, but finish gestures synchronously.
export function createRenderScheduler(render, request = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let frame = null;
  function clear() {
    if (frame === null) {
      return;
    }
    cancel(frame);
    frame = null;
  }
  return {
    schedule() {
      if (frame !== null) {
        return;
      }
      frame = request(() => {
        frame = null;
        render();
      });
    },
    flush() {
      if (frame === null) {
        return;
      }
      clear();
      render();
    },
    cancel: clear,
  };
}
