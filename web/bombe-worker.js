'use strict';
importScripts('./enigma-engine.js','./bombe-engine.js');
self.onmessage=({data})=>{
  try{self.postMessage({result:BombeJS.searchChunk(data)});}
  catch(error){self.postMessage({error:error.message});}
};
