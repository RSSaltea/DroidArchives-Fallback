// Own one cancellable worker generation. A result can only belong to the
// snapshot that started it; stale messages are ignored even after termination.
export function createOptimiseBackground({ createWorker, onPrepared, onResult, onProgress, onStatus, delay = 250, budget = 45000, layoutBudget = 300000 }) {
  let stamp = null, generation = 0, worker = null, debounce = null, deadline = null, layoutDeadline = null;
  const stop = () => { clearTimeout(debounce); clearTimeout(deadline); clearTimeout(layoutDeadline); worker?.terminate(); worker = null; };
  const status = value => onStatus?.(value, stamp);
  return {
    update(nextStamp, snapshot, options = {}) {
      if (nextStamp === stamp) return;
      stop(); stamp = nextStamp; const id = ++generation;
      status('queued');
      debounce = setTimeout(() => {
        if (id !== generation) return;
        try {
          const routeBudget=Math.max(budget,Math.min(180000,Number(options.budget)||budget));
          const armDeadline=()=>{
            clearTimeout(deadline);
            deadline=setTimeout(()=>{if(id===generation){stop();status('budget');}},routeBudget);
          };
          let prepared=false,comparisons=0;
          worker = createWorker(); status('searching');
          worker.onmessage = ({ data }) => {
            if (id !== generation || data.id !== id || !worker) return;
            if (data.type === 'prepared'&&!prepared) {
              prepared=true;clearTimeout(layoutDeadline);onPrepared?.(data, stamp);
              // Layout used to happen before this worker's time budget began.
              // Keep the full route budget after moving layout off the UI thread.
              armDeadline();
            }
            if(data.type==='progress'&&!prepared&&data.progress?.phase==='layout'&&Number.isInteger(data.progress.comparisons)&&data.progress.comparisons>comparisons){
              comparisons=data.progress.comparisons;onProgress?.(data,stamp);
              // Each completed comparison proves useful progress. A slower PC
              // gets time to compare the remaining Iconics, with a hard limit
              // as well as this per-comparison watchdog.
              armDeadline();
            }
            if (data.type === 'result') onResult(data, stamp);
            if (data.type === 'diagnostic') onProgress?.(data,stamp);
            if (data.type === 'done' || data.type === 'error') { stop(); status(data.type === 'done' ? 'ready' : 'error'); }
          };
          worker.onerror = () => { if (id === generation) { stop(); status('error'); } };
          armDeadline();
          if(snapshot.layout)layoutDeadline=setTimeout(()=>{if(id===generation){stop();status('budget');}},layoutBudget);
          worker.postMessage({ id, snapshot });
        } catch { stop(); status('error'); }
      }, delay);
    },
    cancel() { stop(); stamp = null; generation++; status('idle'); }
  };
}
