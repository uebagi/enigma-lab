'use strict';
const $ = id => document.getElementById(id);
const normalize = text => text.replace(/[a-z]/g,c=>c.toUpperCase()).replace(/[^A-Z]/g,'');
let running=false, controller=null, results=[], tested=0, rejected=0, unresolved=0, cursor=0, total=17576;
const fields=['ciphertext','crib','offset','permute','bombe-reflector','plug-mode','max-pairs','known-plugs','timing-mode','simulation-rate',...Array.from({length:3},(_,i)=>[`rotor-${i}`,`ring-${i}`]).flat()];
const stateKey='enigma.bombeState.v1';
let lastBank=null;
let simulatedSeconds=0;
function shareSettings(){
 return {version:1,page:'bombe',values:Object.fromEntries(fields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))};
}
function restoreSharedSettings(){
 try{
  const shared=SettingsURL.read('bombe');if(!shared)return;
  if(!shared.values || fields.some(id=>!Object.hasOwn(shared.values,id) || ($(id).type==='checkbox'?typeof shared.values[id]!=='boolean':typeof shared.values[id]!=='string')))throw new Error('Invalid search fields.');
  for(const id of fields){const el=$(id);if(el.tagName==='SELECT' && !Array.from(el.options).some(option=>option.value===shared.values[id]))throw new Error('Invalid search choice.');}
  if(JSON.stringify(shared)===JSON.stringify(shareSettings()))return;
  for(const id of fields){if($(id).type==='checkbox')$(id).checked=shared.values[id];else $(id).value=shared.values[id];}
  results=[];tested=0;rejected=0;unresolved=0;cursor=0;total=17576*($('permute').checked?6:1);lastBank=null;simulatedSeconds=0;
  $('candidates').replaceChildren();updateStats();$('elapsed').textContent='0.0 s';$('simulated-time').textContent=formatTime(0);$('current-position').textContent='— / — — —';
  document.querySelectorAll('.drum b').forEach(el=>el.textContent='A');
  $('run-state').textContent='AWAITING MENU';$('search-status').textContent='Shared settings loaded. Run the search when ready.';
 }catch{error('This settings link is invalid. Your saved setup is still available.');}
}
function formatTime(seconds){
 const ticks=Math.max(0,Math.round(seconds*10));
 return `${String(Math.floor(ticks/600)).padStart(2,'0')}:${((ticks%600)/10).toFixed(1).padStart(4,'0')}`;
}
function timingNote(){
 const rate=Number($('simulation-rate').value);
 const positions=17576*($('permute').checked?6:1);
 $('timing-note').textContent=Number.isInteger(rate)&&rate>=1&&rate<=100000
  ?`Full scan: ${formatTime(positions/rate)} simulated. ${$('timing-mode').value==='instant'?'Instant advances the clock without waiting.':'Simulated runs wait for this pace; computing may take longer.'} This is an illustrative pace.`
  :'Choose a whole-number pace from 1 to 100,000 settings per second.';
}
function waitForPace(milliseconds,signal){
 if(signal.aborted)return Promise.reject(new DOMException('Search stopped','AbortError'));
 if(milliseconds<=0)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('Search stopped','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},milliseconds);
  signal.addEventListener('abort',abort,{once:true});
 });
}
function saveState(){
 SettingsURL.write(shareSettings());
 try{
  const values=Object.fromEntries(fields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));
  sessionStorage.setItem(stateKey,JSON.stringify({values,results,tested,rejected,unresolved,cursor,total,lastBank,simulatedSeconds,elapsed:$('elapsed').textContent,status:$('search-status').textContent,runState:running?'STOPPED':$('run-state').textContent,note:$('candidate-note').textContent,interrupted:running}));
 }catch{/* Search still works when browser storage is unavailable. */}
}
function restoreState(){
 try{
  const saved=JSON.parse(sessionStorage.getItem(stateKey));if(!saved?.values)return;
  for(const id of fields){if(!Object.hasOwn(saved.values,id))continue;if($(id).type==='checkbox')$(id).checked=Boolean(saved.values[id]);else $(id).value=String(saved.values[id]);}
  results=[];
  for(const candidate of saved.results||[]){results.push(candidate);appendCandidate(candidate);}
  tested=saved.tested||0;rejected=saved.rejected||0;unresolved=saved.unresolved||0;cursor=saved.cursor||0;total=saved.total||17576;updateStats();
  if(saved.lastBank)updateBank(saved.lastBank);
  simulatedSeconds=Number(saved.simulatedSeconds)||0;$('simulated-time').textContent=formatTime(simulatedSeconds);
  $('elapsed').textContent=saved.elapsed||'0.0 s';$('run-state').textContent=saved.runState||'AWAITING MENU';
  $('search-status').textContent=saved.interrupted?`Search stopped when you left the page. Partial results retained (${cursor.toLocaleString()} positions); run again to restart.`:saved.status||'Ready.';
  $('candidate-note').textContent=saved.note||$('candidate-note').textContent;
 }catch{/* Ignore an unreadable saved state. */}
}
function error(message=''){$('bombe-error').hidden=!message;$('bombe-error').textContent=message;}
function readSetup(){
 return {ciphertext:normalize($('ciphertext').value),crib:normalize($('crib').value),offset:Number($('offset').value),rotors:Array.from({length:3},(_,i)=>$(`rotor-${i}`).value),rings:Array.from({length:3},(_,i)=>Number($(`ring-${i}`).value)),reflector:$('bombe-reflector').value,permute:$('permute').checked,known_plugboard:$('plug-mode').value==='known',plugboard:$('plug-mode').value==='known'?$('known-plugs').value.toUpperCase().split(/[\s,]+/).filter(Boolean):[],max_pairs:Number($('max-pairs').value),cursor:0,limit:64};
}
function setRunning(value){
 running=value;fields.forEach(id=>$(id).disabled=value);
 for(const id of ['demo','start-search','offset-left','offset-right'])$(id).disabled=value;
 $('cancel-search').disabled=!value;document.querySelector('.bombe-console').classList.toggle('running',value);
}
function updateStats(){
 $('tested').textContent=tested.toLocaleString();$('rejected').textContent=rejected.toLocaleString();$('stops').textContent=results.length;
 $('progress').max=total;$('progress').value=cursor;$('progress-label').textContent=`${cursor.toLocaleString()} / ${total.toLocaleString()} positions`;
}
function svgElement(name,attributes,text){
 const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value]of Object.entries(attributes))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;return el;
}
function renderMenu(crib,cipher,offset){
 const svg=$('menu');svg.replaceChildren();
 if(!crib||offset<0||offset+crib.length>cipher.length){svg.append(svgElement('text',{x:310,y:165},'Align a crib to build the menu.'));return;}
 const edges=[...crib].map((plain,i)=>({plain,cipher:cipher[offset+i],index:offset+i+1}));
 const letters=[...new Set(edges.flatMap(e=>[e.plain,e.cipher]))].sort();
 const points=new Map(letters.map((letter,i)=>{const angle=2*Math.PI*i/letters.length-Math.PI/2;return [letter,{x:310+255*Math.cos(angle),y:165+130*Math.sin(angle)}]}));
 edges.forEach(e=>{
  const a=points.get(e.plain),b=points.get(e.cipher);const line=svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y});
  line.append(svgElement('title',{},`Position ${e.index}: ${e.plain} ↔ ${e.cipher}`));svg.append(line);
  svg.append(svgElement('text',{x:(a.x+b.x)/2,y:(a.y+b.y)/2,class:'edge-label'},e.index));
 });
 for(const [letter,p]of points){svg.append(svgElement('circle',{cx:p.x,cy:p.y,r:15}));svg.append(svgElement('text',{x:p.x,y:p.y},letter));}
}
function align(){
 const r=readSetup();$('alignment').replaceChildren();
 $('offset').max=Math.max(0,r.ciphertext.length-r.crib.length);
 let conflicts=0;
 for(let i=0;i<r.ciphertext.length;i++){
  const cell=document.createElement('div');cell.className='aligned-letter';
  const top=document.createElement('span');top.textContent=r.ciphertext[i];const bottom=document.createElement('span');bottom.textContent=i>=r.offset?r.crib[i-r.offset]||'·':'·';
  if(top.textContent===bottom.textContent){conflicts++;cell.classList.add('conflict');}cell.title=`Ciphertext position ${i+1}`;cell.append(top,bottom);$('alignment').append(cell);
 }
 const valid=Number.isInteger(r.offset)&&r.offset>=0&&r.offset+r.crib.length<=r.ciphertext.length;
 $('alignment-status').textContent=!r.crib?'ENTER A CRIB':!valid?'OUT OF RANGE':conflicts?`${conflicts} SELF-MATCHES`:'NO SELF-MATCHES';
 renderMenu(r.crib,r.ciphertext,r.offset);
}
function renderBank(){
 for(let i=0;i<9;i++){
  const column=document.createElement('div');column.className='drum-column';
  const title=document.createElement('span');title.textContent=String(i+1).padStart(2,'0');column.append(title);
  for(let j=0;j<3;j++){const drum=document.createElement('div');drum.className='drum';const letter=document.createElement('b');letter.textContent='A';drum.append(letter);column.append(drum);}
  $('drum-bank').append(column);
 }
}
function updateBank(result){
 if(!result.last_windows)return;
 lastBank={last_windows:result.last_windows,last_order:result.last_order};
 $('current-position').textContent=`${result.last_order.join('–')} / ${result.last_windows}`;
 document.querySelectorAll('.drum-column').forEach(column=>column.querySelectorAll('b').forEach((el,i)=>el.textContent=result.last_windows[i]));
}
function appendCandidate(candidate){
 if(results.length===1)$('candidates').replaceChildren();
 const article=document.createElement('article');article.className='candidate';
 const heading=document.createElement('div');heading.className='candidate-heading';const title=document.createElement('h3');
 title.textContent=`STOP ${String(results.length).padStart(2,'0')} · ${candidate.config.rotors.map(r=>r.name).join('–')} / ${candidate.config.rotors.map(r=>r.position).join('')}`;
 const open=document.createElement('a');open.href='./';open.textContent='Check on Enigma →';
 open.addEventListener('click',()=>sessionStorage.setItem('enigma.pendingConfig',JSON.stringify(candidate.config)));
 heading.append(title,open);
 const cables=document.createElement('p');cables.className='candidate-cables';cables.textContent=`Rings ${candidate.config.rotors.map(r=>String(r.ring).padStart(2,'0')).join(' / ')} · Reflector ${candidate.config.reflector} · Cables ${candidate.config.plugboard.join(' ')||'none'}`;
 const plaintext=document.createElement('p');plaintext.textContent=candidate.plaintext.match(/.{1,5}/g)?.join(' ')||'';
 article.append(heading,cables,plaintext);$('candidates').append(article);
}
async function run(){
 if(running)return;error();align();const setup=readSetup();
 const rate=Number($('simulation-rate').value),paced=$('timing-mode').value==='simulated';
 if(!Number.isInteger(rate)||rate<1||rate>100000){error('Simulated pace must be a whole number from 1 to 100,000 settings per second.');return;}
 // Small paced chunks keep the windows and simulated clock moving visibly.
 if(paced)setup.limit=Math.max(1,Math.min(64,Math.floor(rate/10)));
 results=[];tested=0;rejected=0;unresolved=0;cursor=0;simulatedSeconds=0;total=17576*(setup.permute?6:1);updateStats();
 $('simulated-time').textContent=formatTime(0);$('elapsed').textContent='0.0 s';
 $('candidates').replaceChildren();$('candidate-note').textContent='One compatible wiring per surviving starting setting. Check the full plaintext; a crib match can be accidental.';
 setRunning(true);controller=new AbortController();const signal=controller.signal;const started=performance.now();$('run-state').textContent='RUNNING';
 const updateElapsed=()=>{$('elapsed').textContent=`${((performance.now()-started)/1000).toFixed(1)} s`;};
 const elapsedTimer=setInterval(updateElapsed,100);
 try{
  while(cursor<total&&results.length<100){
   const result=await BombeSearch.search({...setup,cursor},signal);
   if(paced)await waitForPace((tested+result.tested)/rate*1000-(performance.now()-started),signal);
   if(signal.aborted)throw new DOMException('Search stopped','AbortError');
   cursor=result.next;total=result.total;tested+=result.tested;rejected+=result.rejected;unresolved+=result.unresolved;
   simulatedSeconds=tested/rate;$('simulated-time').textContent=formatTime(simulatedSeconds);
   for(const candidate of result.candidates){if(results.length>=100)break;results.push(candidate);appendCandidate(candidate);}
   updateStats();updateBank(result);$('elapsed').textContent=`${((performance.now()-started)/1000).toFixed(1)} s`;
   $('search-status').textContent=`${tested.toLocaleString()} settings tested · ${unresolved.toLocaleString()} unresolved at the solver limit · ${results.length} candidate stops.`;
   saveState();
   if(result.done)break;
  }
  $('run-state').textContent=results.length>=100?'RESULT LIMIT':'SCAN FINISHED';
  const full=cursor===total&&results.length<100;
  $('search-status').textContent=`${full?'Scan finished':'Stopped at 100 candidates; results are truncated'}. ${results.length} stops. ${unresolved} settings unresolved.${!full?' Narrow the crib or search assumptions.':unresolved?' Unresolved settings mean this scan is not exhaustive.':''}${!results.length?' No compatible setting found within the resolved search; check your crib and assumptions.':''}`;
 }catch(err){
  if(err.name==='AbortError'){$('run-state').textContent='STOPPED';$('search-status').textContent=`Stopped at ${cursor.toLocaleString()} / ${total.toLocaleString()} positions. Partial results retained; ${unresolved} unresolved settings.`;}
  else{error(err.message);$('run-state').textContent='CHECK SETUP';$('search-status').textContent='Search could not finish. Check the setup and try again.';}
 }finally{clearInterval(elapsedTimer);updateElapsed();setRunning(false);controller=null;if(!results.length){const p=document.createElement('p');p.className='empty-results';p.textContent='No candidate stops to display.';$('candidates').append(p);}saveState();}
}
async function demo(){
 error();$('demo').disabled=true;
 try{
  const plain='WETTERBERICHTFUERDENNORDATLANTIK';
  const config={rotors:[{name:'I',position:'A',ring:1},{name:'II',position:'A',ring:1},{name:'III',position:'F',ring:1}],reflector:'B',plugboard:['AZ','BY','CX']};
  const result=EnigmaJS.encode({config,text:plain});
  $('ciphertext').value=result.output;$('crib').value=plain;$('offset').value=0;$('permute').checked=false;
  ['I','II','III'].forEach((name,i)=>{$(`rotor-${i}`).value=name;$(`ring-${i}`).value=1});
  $('bombe-reflector').value='B';$('plug-mode').value='unknown';$('max-pairs').value=10;plugMode();align();timingNote();
  $('search-status').textContent='Example loaded. Run the search to infer the hidden starting windows and plugboard.';
  saveState();
 }catch(err){error(err.message)}finally{$('demo').disabled=false}
}
function plugMode(){$('known-controls').hidden=$('plug-mode').value!=='known';$('unknown-controls').hidden=$('plug-mode').value==='known';}
['I','II','III','IV','V','VI','VII','VIII'].forEach(name=>{for(let i=0;i<3;i++)$(`rotor-${i}`).add(new Option(name,name))});
['I','II','III'].forEach((name,i)=>$(`rotor-${i}`).value=name);
renderBank();restoreState();restoreSharedSettings();plugMode();align();timingNote();
SettingsURL.setupCopy(shareSettings);
for(const id of fields){$(id).addEventListener('input',saveState);$(id).addEventListener('change',saveState);}
window.addEventListener('pagehide',()=>{saveState();controller?.abort();});
for(const id of ['ciphertext','crib','offset'])$(id).addEventListener('input',align);
$('offset-left').addEventListener('click',()=>{$('offset').value=Math.max(0,Number($('offset').value)-1);align();saveState()});
$('offset-right').addEventListener('click',()=>{$('offset').value=Math.min(Number($('offset').max),Number($('offset').value)+1);align();saveState()});
$('permute').addEventListener('change',()=>{if(!running){total=17576*($('permute').checked?6:1);$('progress').max=total;}});
$('plug-mode').addEventListener('change',plugMode);$('demo').addEventListener('click',demo);
$('start-search').addEventListener('click',run);$('cancel-search').addEventListener('click',()=>controller?.abort());
for(const id of ['timing-mode','simulation-rate','permute'])$(id).addEventListener('input',timingNote);
