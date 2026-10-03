// Run with: node --test tests/browser-engines.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const Enigma=require('../web/enigma-engine.js');
const Bombe=require('../web/bombe-engine.js');
const M3=()=>Enigma.catalog().presets.M3;
const windows=m=>m.config().rotors.map(r=>r.position).join('');

test('known vectors, reciprocity, and owned configurations',()=>{
 for(const [plain,cipher]of [['AAAAA','BDZGO'],['HELLOWORLD','ILBDAAMTAZ']]){
  const config=M3();const m=new Enigma.Machine(config);config.rotors[0].name='invalid';
  assert.equal(m.encode(plain).output,cipher);assert.equal(new Enigma.Machine(M3()).encode(cipher).output,plain);
  const snapshot=m.config();snapshot.rotors[0].position='Z';assert.notEqual(m.config().rotors[0].position,'Z');
 }
});
test('double step, ring-independent turnover, naval notches and M4',()=>{
 const c=M3();c.rotors=[{name:'III',position:'A',ring:1},{name:'II',position:'D',ring:1},{name:'I',position:'O',ring:1}];
 const m=new Enigma.Machine(c);for(const want of ['ADP','ADQ','AER','BFS','BFT']){m.press('A');assert.equal(windows(m),want)}
 for(const name of ['VI','VII','VIII'])for(const position of ['M','Z']){
  const c=M3();c.rotors[2]={name,position,ring:7};const m=new Enigma.Machine(c);m.press('A');assert.equal(m.config().rotors[1].position,'B');
 }
 const m4=new Enigma.Machine(Enigma.catalog().presets.M4);const plain='HELLOWORLD'.repeat(2000);
 assert.equal(m4.encode(plain).output,new Enigma.Machine(M3()).encode(plain).output);assert.equal(m4.config().rotors[0].position,'A');
});
test('arbitrary counts and invalid input',()=>{
 for(const count of [1,2,3,4,12,64]){
  const c=M3();c.plugboard=['AZ','BY','CX'];c.rotors=Array.from({length:count},(_,i)=>({name:'I',position:String.fromCharCode(65+i%26),ring:i%26+1}));
  const plain='THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG';const cipher=new Enigma.Machine(c).encode(plain).output;
  assert.equal(new Enigma.Machine(c).encode(cipher).output,plain);assert.ok([...plain].every((c,i)=>c!==cipher[i]));
 }
 const m=new Enigma.Machine(M3());assert.throws(()=>m.encode('AB C'));assert.throws(()=>m.press('!'));assert.equal(windows(m),'AAA');
 for(const change of [c=>c.rotors=[],c=>c.rotors[0].ring=0,c=>c.rotors[1].name='Beta',c=>c.plugboard=['AB','AC']]){const c=M3();change(c);assert.throws(()=>new Enigma.Machine(c))}
});
function fixture(){
 const c=M3();c.rotors[2].position='F';c.plugboard=['AZ','BY','CX','DI','EJ','FK','GL','HM','NO','PQ'];
 const plain='WETTERBERICHTFUERDENNORDATLANTIKWINDWESTSTAERKEVIERSICHTGUT';
 return {ciphertext:new Enigma.Machine(c).encode(plain).output,crib:plain.slice(0,30),offset:0,rotors:['I','II','III'],rings:[1,1,1],reflector:'B',permute:false,known_plugboard:false,plugboard:[],max_pairs:10,cursor:0,limit:16};
}
test('Bombe infers unknown cables and rejects impossible alignments',()=>{
 const r=fixture(),result=Bombe.searchChunk(r),candidate=result.candidates.find(c=>c.config.rotors[2].position==='F');
 assert.ok(candidate);assert.equal(candidate.config.plugboard.length,10);assert.equal(candidate.plaintext.slice(0,r.crib.length),r.crib);
 assert.equal(result.tested,16);assert.equal(result.rejected+result.unresolved+result.candidates.length,result.tested);
 const impossible=Bombe.searchChunk({...r,crib:r.ciphertext.slice(0,10)});assert.equal(impossible.done,true);assert.equal(impossible.tested,0);
 assert.throws(()=>Bombe.searchChunk({...r,rotors:['I','I','II']}));assert.throws(()=>Bombe.searchChunk({...r,offset:-1}));
});
test('Bombe offset, rings and double stepping',()=>{
 const c=M3();c.rotors[1].position='D';c.rotors[2].position='U';c.rotors[0].ring=7;c.rotors[1].ring=12;c.plugboard=['AZ','BY'];
 const plain='AAAAAWETTERBERICHTFUERDENNORDATLANTIK';const r={...fixture(),ciphertext:new Enigma.Machine(c).encode(plain).output,crib:plain.slice(5),offset:5,rings:[7,12,1],known_plugboard:true,plugboard:c.plugboard,cursor:3*26+20,limit:1};
 assert.equal(Bombe.searchChunk(r).candidates[0].plaintext,plain);
});
test('JavaScript agrees with the Go API', {skip:!process.env.ENIGMA_GO_URL},async()=>{
 const api=async(path,body)=>{const response=await fetch(process.env.ENIGMA_GO_URL+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json()};
 for(let i=0;i<24;i++){
  const c=i%2?Enigma.catalog().presets.M4:M3();c.plugboard=['AZ','BY','CX'];
  c.rotors.forEach((r,j)=>{r.position=String.fromCharCode(65+(i*7+j*3)%26);r.ring=(i*11+j*2)%26+1});
  const body={config:c,text:'THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG'.repeat(2)};
  assert.deepEqual(Enigma.encode(body),await api('/api/encode',body));
 }
 for(const request of [fixture(),{...fixture(),permute:true,cursor:17576+50},{...fixture(),known_plugboard:true,plugboard:['AZ','BY','CX']}])assert.deepEqual(Bombe.searchChunk(request),await api('/api/bombe/search',request));
});
