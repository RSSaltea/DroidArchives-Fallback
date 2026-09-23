// Own one cancellable worker generation. A result can only belong to the
// snapshot that started it; stale messages are ignored even after termination.
export function createOptimiseBackground({ createWorker, onResult, onStatus, delay = 250, budget = 45000 }) {
  let stamp = null, generation = 0, worker = null, debounce = null, deadline = null;
  const stop = () => { clearTimeout(debounce); clearTimeout(deadline); worker?.terminate(); worker = null; };
  const status = value => onStatus?.(value, stamp);
  return {
    update(nextStamp, snapshot) {
      if (nextStamp === stamp) return;
      stop(); stamp = nextStamp; const id = ++generation;
      status('queued');
      debounce = setTimeout(() => {
        if (id !== generation) return;
        try {
          worker = createWorker(); status('searching');
          worker.onmessage = ({ data }) => {
            if (id !== generation || data.id !== id || !worker) return;
            if (data.type === 'result') onResult(data, stamp);
            if (data.type === 'done' || data.type === 'error') { stop(); status(data.type === 'done' ? 'ready' : 'error'); }
          };
          worker.onerror = () => { if (id === generation) { stop(); status('error'); } };
          deadline = setTimeout(() => { if (id === generation) { stop(); status('budget'); } }, budget);
          worker.postMessage({ id, snapshot });
        } catch { stop(); status('error'); }
      }, delay);
    },
    cancel() { stop(); stamp = null; generation++; status('idle'); }
  };
}
