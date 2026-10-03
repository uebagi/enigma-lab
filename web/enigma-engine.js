'use strict';
// The browser engine is independent of HTTP and the DOM. Positions run left to right.
(() => {
  const definitions = [
    ['I','EKMFLGDQVZNTOWYHXUSPAIBRCJ','Q',false],
    ['II','AJDKSIRUXBLHWTMCQGZNPYFVOE','E',false],
    ['III','BDFHJLCPRTXVZNYEIWGAKMUSQO','V',false],
    ['IV','ESOVPZJAYQUIRHXLNFTGKDCMWB','J',false],
    ['V','VZBRGITYUPSDNHLXAWMJQOFECK','Z',false],
    ['VI','JPGVOUMFYQBENHZRDKASXLICTW','ZM',false],
    ['VII','NZJHGRCXMYSWBOUFAIVLPEKQDT','ZM',false],
    ['VIII','FKQHTLXOCBJSPDZRAMEWNIUYGV','ZM',false],
    ['Beta','LEYJVCNIXWPBQMDRTAKZGFUHOS','',true],
    ['Gamma','FSOKANUERHMBTIYCWLQPZXVGJD','',true],
  ].map(([name,wiring,notches,stationary]) => {
    const forward = Array.from(wiring,c=>c.charCodeAt(0)-65), reverse = Array(26);
    forward.forEach((n,i)=>reverse[n]=i);
    return {name,wiring,notches,stationary,forward,reverse};
  });
  const reflectors = {A:'EJMZALYXVBWFCRQUONTSPIKHGD',B:'YRUHQSLDPXNGOKMIEBFZCWVJAT',C:'FVPJIAOYEDRZXWGCTKUQSBNMHL','B-thin':'ENKQAUYWJICOPBLMDXZVFTHRGS','C-thin':'RDOBJNTKVEHMLFCWZAXGYIPSUQ'};
  const copy = value => structuredClone(value);
  const mod = n => (n%26+26)%26;
  const letter = n => String.fromCharCode(65+n);
  function catalog() {
    const M3={rotors:['I','II','III'].map(name=>({name,position:'A',ring:1})),reflector:'B',plugboard:[]};
    const M4=copy(M3);M4.rotors.unshift({name:'Beta',position:'A',ring:1});M4.reflector='B-thin';
    return {rotors:definitions.map(({name,wiring,notches,stationary})=>({name,wiring,notches,stationary})),reflectors:copy(reflectors),presets:{M3,M4}};
  }
  class Machine {
    constructor(config) {
      if (!config || !Array.isArray(config.rotors) || !config.rotors.length) throw new Error('At least one rotor is required.');
      if (!Object.hasOwn(reflectors,config.reflector)) throw new Error('Unknown reflector.');
      this.settings={rotors:copy(config.rotors),reflector:config.reflector,plugboard:copy(config.plugboard??[])};
      this.firstMoving=config.rotors.length;
      this.rotors=config.rotors.map((r,i)=>{
        const definition=definitions.find(d=>d.name===r.name);
        if(!definition)throw new Error(`Rotor ${i+1}: unknown type.`);
        if(typeof r.position!=='string'||!/^[A-Z]$/.test(r.position)||!Number.isInteger(r.ring)||r.ring<1||r.ring>26)throw new Error(`Rotor ${i+1}: position must be A-Z and ring must be 1-26.`);
        if(definition.stationary&&this.firstMoving<i)throw new Error('Stationary rotors must be left of all moving rotors.');
        if(!definition.stationary&&this.firstMoving===config.rotors.length)this.firstMoving=i;
        return {definition,position:r.position.charCodeAt(0)-65,ring:r.ring-1};
      });
      if(this.firstMoving===this.rotors.length)throw new Error('At least one moving rotor is required.');
      this.reflector=Array.from(reflectors[config.reflector],c=>c.charCodeAt(0)-65);
      this.plugs=Array.from({length:26},(_,i)=>i);
      const used=new Set();
      if(!Array.isArray(this.settings.plugboard))throw new Error('Plugboard must contain letter pairs.');
      for(const pair of this.settings.plugboard){
        if(typeof pair!=='string'||!/^[A-Z]{2}$/.test(pair)||pair[0]===pair[1])throw new Error('Plugboard pairs must contain two different letters A-Z.');
        const a=pair.charCodeAt(0)-65,b=pair.charCodeAt(1)-65;
        if(used.has(a)||used.has(b))throw new Error('Plugboard letter may be used only once.');
        used.add(a);used.add(b);this.plugs[a]=b;this.plugs[b]=a;
      }
    }
    step() {
      const steps=Array(this.rotors.length).fill(false);steps[steps.length-1]=true;
      for(let i=this.firstMoving+1;i<this.rotors.length;i++)if(this.rotors[i].definition.notches.includes(letter(this.rotors[i].position))){steps[i]=true;steps[i-1]=true;}
      this.rotors.forEach((r,i)=>{if(steps[i])r.position=mod(r.position+1)});
    }
    map(r,n,reverse=false){const offset=r.position-r.ring;return mod(r.definition[reverse?'reverse':'forward'][mod(n+offset)]-offset)}
    scramble(n){
      for(let i=this.rotors.length-1;i>=0;i--)n=this.map(this.rotors[i],n);
      n=this.reflector[n];for(const r of this.rotors)n=this.map(r,n,true);return n;
    }
    stepScrambler(){this.step();return Array.from({length:26},(_,i)=>this.scramble(i))}
    press(key){
      if(typeof key!=='string'||!/^[A-Z]$/.test(key))throw new Error('Key must be A-Z.');
      this.step();let n=key.charCodeAt(0)-65;const trace=[];
      const stage=(name,next)=>{trace.push({name,input:letter(n),output:letter(next)});n=next;};
      stage('Plugboard in',this.plugs[n]);
      for(let i=this.rotors.length-1;i>=0;i--)stage(`Rotor ${i+1} (${this.rotors[i].definition.name}) forward`,this.map(this.rotors[i],n));
      stage(`Reflector ${this.settings.reflector}`,this.reflector[n]);
      this.rotors.forEach((r,i)=>stage(`Rotor ${i+1} (${r.definition.name}) return`,this.map(r,n,true)));
      stage('Plugboard out',this.plugs[n]);return {output:letter(n),trace};
    }
    config(){const c=copy(this.settings);c.rotors.forEach((r,i)=>r.position=letter(this.rotors[i].position));return c}
    encode(text){
      if(typeof text!=='string'||!/^[A-Z]*$/.test(text))throw new Error('Text must contain only A-Z.');
      let output='',trace=null;for(const key of text){const result=this.press(key);output+=result.output;trace=result.trace;}
      return {output,config:this.config(),trace};
    }
  }
  const engine={Machine,catalog,encode:({config,text})=>new Machine(config).encode(text)};
  globalThis.EnigmaJS=engine;
  if(typeof module!=='undefined'&&module.exports)module.exports=engine;
})();
