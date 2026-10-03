'use strict';
// Terminating the worker makes Stop interrupt computation as well as pacing.
(() => {
  const workerURL=new URL('./bombe-worker.js',document.currentScript.src);
  let worker=null;
  globalThis.BombeSearch={
    search(request,signal){
      if(signal?.aborted)return Promise.reject(new DOMException('Search stopped','AbortError'));
      return new Promise((resolve,reject)=>{
        try{worker??=new Worker(workerURL);}catch(error){reject(error);return;}
        const active=worker;
        const cleanup=()=>{active.removeEventListener('message',message);active.removeEventListener('error',failed);signal?.removeEventListener('abort',abort);};
        const message=({data})=>{cleanup();if(data.error)reject(new Error(data.error));else resolve(data.result);};
        const failed=()=>{cleanup();active.terminate();worker=null;reject(new Error('The browser could not run the Bombe worker.'));};
        const abort=()=>{cleanup();active.terminate();worker=null;reject(new DOMException('Search stopped','AbortError'));};
        active.addEventListener('message',message);active.addEventListener('error',failed);signal?.addEventListener('abort',abort,{once:true});
        active.postMessage(request);
      });
    },
  };
})();
