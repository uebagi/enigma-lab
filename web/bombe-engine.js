'use strict';
(() => {
  const {Machine,catalog}=globalThis.EnigmaJS;
  const POSITIONS=17576,NODE_LIMIT=2000;
  const base=(r,order)=>({rotors:order.map((name,i)=>({name,position:'A',ring:r.rings[i]})),reflector:r.reflector,plugboard:[]});
  function validate(r){
    if(typeof r.ciphertext!=='string'||!/^[A-Z]{6,500}$/.test(r.ciphertext))throw new Error('Ciphertext must contain 6–500 uppercase letters A-Z.');
    if(typeof r.crib!=='string'||!/^[A-Z]{6,64}$/.test(r.crib))throw new Error('Crib must contain 6–64 uppercase letters A-Z.');
    if(!Number.isInteger(r.offset)||r.offset<0||r.offset>r.ciphertext.length-r.crib.length)throw new Error('Crib alignment is outside the ciphertext.');
    if(!Array.isArray(r.rotors)||r.rotors.length!==3||!Array.isArray(r.rings)||r.rings.length!==3)throw new Error('This Bombe searches exactly three moving rotors.');
    const service=catalog().rotors.filter(d=>!d.stationary).map(d=>d.name);
    if(new Set(r.rotors).size!==3||r.rotors.some(name=>!service.includes(name)))throw new Error('Choose three distinct service rotors I–VIII.');
    if(!['A','B','C'].includes(r.reflector))throw new Error('Choose reflector A, B, or C.');
    if(!Number.isInteger(r.max_pairs)||r.max_pairs<0||r.max_pairs>13)throw new Error('Maximum plugboard cables must be 0–13.');
    new Machine({...base(r,r.rotors),plugboard:r.plugboard});
    if(!r.known_plugboard&&(r.plugboard??[]).length)throw new Error('Use fixed plugboard mode to supply known cables.');
    if(!Number.isInteger(r.cursor)||r.cursor<0||r.cursor>POSITIONS*(r.permute?6:1)||!Number.isInteger(r.limit)||r.limit<1||r.limit>256)throw new Error('Cursor must be within the search and chunk size must be 1–256.');
  }
  function bind(s,a,b){if((s[a]>=0&&s[a]!==b)||(s[b]>=0&&s[b]!==a))return false;s[a]=b;s[b]=a;return true}
  function pairs(s){return s.flatMap((b,a)=>b>a?[String.fromCharCode(65+a,65+b)]:[])}
  function solve(edges,maxPairs){
    let nodes=0,limited=false;const degree=Array(26).fill(0);edges.forEach(e=>{degree[e.a]++;degree[e.b]++});
    function visit(mapping){
      if(++nodes>NODE_LIMIT){limited=true;return null;}
      for(;;){
        const before=mapping.slice();
        for(const e of edges){
          if(mapping[e.a]>=0&&!bind(mapping,e.b,e.permutation[mapping[e.a]]))return null;
          if(mapping[e.b]>=0&&!bind(mapping,e.a,e.permutation[mapping[e.b]]))return null;
        }
        let count=0;mapping.forEach((b,a)=>{if(b>a)count++});if(count>maxPairs)return null;
        if(mapping.every((n,i)=>n===before[i]))break;
      }
      let letter=-1;degree.forEach((d,i)=>{if(d>0&&mapping[i]<0&&(letter<0||d>degree[letter]))letter=i});
      if(letter<0)return mapping;
      for(const partner of [letter,...Array.from({length:26},(_,i)=>i).filter(i=>i!==letter)]){
        if(mapping[partner]>=0)continue;const next=mapping.slice();if(!bind(next,letter,partner))continue;
        const answer=visit(next);if(answer)return answer;if(limited)return null;
      }
      return null;
    }
    return {mapping:visit(Array(26).fill(-1)),limited};
  }
  function searchChunk(r){
    validate(r);const [a,b,c]=r.rotors;
    const orders=r.permute?[[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]]:[r.rotors];
    const result={next:r.cursor,total:orders.length*POSITIONS,tested:0,rejected:0,unresolved:0,done:false,last_windows:'',last_order:null,candidates:[]};
    for(let i=0;i<r.crib.length;i++)if(r.crib[i]===r.ciphertext[r.offset+i]){result.next=result.total;result.rejected=result.total-r.cursor;result.done=true;return result;}
    const deadline=performance.now()+2000;
    for(let cursor=r.cursor,end=Math.min(r.cursor+r.limit,result.total);cursor<end;cursor++){
      if(result.tested&&performance.now()>deadline)break;
      const order=orders[Math.floor(cursor/POSITIONS)],position=cursor%POSITIONS;
      const windows=String.fromCharCode(65+Math.floor(position/676),65+Math.floor(position/26)%26,65+position%26);
      const config=base(r,order);config.rotors.forEach((rotor,i)=>rotor.position=windows[i]);
      const machine=new Machine(config);for(let i=0;i<r.offset;i++)machine.step();
      const edges=Array.from(r.crib,(plain,i)=>({a:plain.charCodeAt(0)-65,b:r.ciphertext.charCodeAt(r.offset+i)-65,permutation:machine.stepScrambler()}));
      let mapping=null;
      if(r.known_plugboard){
        const fixed=Array.from({length:26},(_,i)=>i);
        for(const pair of r.plugboard??[]){const a=pair.charCodeAt(0)-65,b=pair.charCodeAt(1)-65;fixed[a]=b;fixed[b]=a;}
        if(edges.every(e=>fixed[e.b]===e.permutation[fixed[e.a]]))mapping=fixed;else result.rejected++;
      }else{
        const solution=solve(edges,r.max_pairs);mapping=solution.mapping;
        if(!mapping){if(solution.limited)result.unresolved++;else result.rejected++;}
      }
      if(mapping){config.plugboard=pairs(mapping);result.candidates.push({config,plaintext:new Machine(config).encode(r.ciphertext).output});}
      result.tested++;result.next=cursor+1;result.last_windows=windows;result.last_order=order.slice();
    }
    result.done=result.next===result.total;return result;
  }
  globalThis.BombeJS={searchChunk,validate};
  if(typeof module!=='undefined'&&module.exports)module.exports=globalThis.BombeJS;
})();
