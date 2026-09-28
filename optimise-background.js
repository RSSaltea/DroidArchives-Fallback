// Own one cancellable worker generation. A result can only belong to the
// snapshot that started it; stale messages are ignored even after termination.
export function createOptimiseBackground({ createWorker, onPrepared, onResult, onStatus, delay = 250, budget = 45000 }) {
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
          const armDeadline=()=>{
            clearTimeout(deadline);
            deadline=setTimeout(()=>{if(id===generation){stop();status('budget');}},budget);
          };
          let prepared=false;
          worker = createWorker(); status('searching');
          worker.onmessage = ({ data }) => {
            if (id !== generation || data.id !== id || !worker) return;
            if (data.type === 'prepared'&&!prepared) {
              prepared=true;onPrepared?.(data, stamp);
              // Layout used to happen before this worker's time budget began.
              // Keep the full route budget after moving layout off the UI thread.
              armDeadline();
            }
            if (data.type === 'result') onResult(data, stamp);
            if (data.type === 'done' || data.type === 'error') { stop(); status(data.type === 'done' ? 'ready' : 'error'); }
          };
          worker.onerror = () => { if (id === generation) { stop(); status('error'); } };
          armDeadline();
          worker.postMessage({ id, snapshot });
        } catch { stop(); status('error'); }
      }, delay);
    },
    cancel() { stop(); stamp = null; generation++; status('idle'); }
  };
}
