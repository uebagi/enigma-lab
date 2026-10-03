'use strict';
const $ = id => document.getElementById(id);
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rows = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];
const clone = value => structuredClone(value);
let catalog, config, starting, mode = 'M3', selectedPlug = null;
let input = '', output = '', busy = false, held = null;
let transcriptStart;
let lastTrace = [];
const stateKey = 'enigma.machineState.v1';
function shareSettings() { return {version:1, page:'enigma', config, starting, mode}; }
const cableColors = ['#d6ae68','#85bdb7','#ae9dd0','#e1927d','#9fbc77','#d295ba','#7babc9','#cbb985','#b7ccae','#a99577','#b5bce3','#d9c69c','#95c8ab'];

function error(message = '') { $('error').hidden = !message; $('error').textContent = message; }
function group(text) { return text.match(/.{1,5}/g)?.join(' ') || '—'; }
function paper() { $('input-paper').textContent = group(input); $('output-paper').textContent = group(output); }
function clearPaper() { input = ''; output = ''; transcriptStart = clone(config); paper(); saveState(); }
function saveState() {
  if (!config || !transcriptStart) return;
  SettingsURL.write(shareSettings());
  try {
    sessionStorage.setItem(stateKey, JSON.stringify({config, starting, transcriptStart, mode, input, output, lastTrace, selectedPlug, message:$('message').value}));
  } catch { /* Keep the machine usable when browser storage is unavailable. */ }
}
function restoreState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(stateKey));
    const validConfig = c => c && Array.isArray(c.rotors) && c.rotors.length && c.rotors.every(r => catalog.rotors.some(d => d.name === r.name) && /^[A-Z]$/.test(r.position) && Number.isInteger(r.ring) && r.ring >= 1 && r.ring <= 26) && Object.hasOwn(catalog.reflectors,c.reflector) && Array.isArray(c.plugboard);
    if (!saved || !validConfig(saved.config) || !validConfig(saved.starting) || !validConfig(saved.transcriptStart) || !['M3','M4','custom'].includes(saved.mode) || typeof saved.input !== 'string' || typeof saved.output !== 'string' || saved.input.length !== saved.output.length) return false;
    config = saved.config; starting = saved.starting; transcriptStart = saved.transcriptStart; mode = saved.mode;
    input = saved.input; output = saved.output; lastTrace = Array.isArray(saved.lastTrace) ? saved.lastTrace : [];
    selectedPlug = /^[A-Z]$/.test(saved.selectedPlug) ? saved.selectedPlug : null;
    $('message').value = typeof saved.message === 'string' ? saved.message : ''; $('preset').value = mode;
    return true;
  } catch { return false; }
}
function clearLamp() {
  document.querySelectorAll('.lamp.lit,.key.pressed').forEach(el => el.classList.remove('lit','pressed'));
  $('lamp-status').textContent = busy ? 'CURRENT FLOWING' : 'READY';
}
function release() { held = null; clearLamp(); }
function renderWindows() {
  $('windows').replaceChildren();
  config.rotors.forEach((r, i) => {
    const d = catalog.rotors.find(d => d.name === r.name);
    const card = document.createElement('div'); card.className = 'window';
    const name = document.createElement('div'); name.className = 'window-name'; name.textContent = `${i+1} · ${r.name}`;
    const letter = document.createElement('div'); letter.className = 'window-letter'; letter.textContent = r.position;
    const note = document.createElement('small'); note.textContent = d.stationary ? 'STATIONARY' : `RING ${String(r.ring).padStart(2,'0')}`;
    card.append(name,letter,note); $('windows').append(card);
  });
}
function updateWindows() {
  // Preserve the rotor nodes and horizontal scroll position while typing.
  $('windows').querySelectorAll('.window-letter').forEach((el, i) => {
    el.textContent = config.rotors[i].position;
  });
}
function renderPlugs() {
  $('plugs').replaceChildren();
  for (const letter of alphabet) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'plug'; button.textContent = letter;
    const pairIndex = config.plugboard.findIndex(pair => pair.includes(letter));
    button.setAttribute('aria-label',pairIndex < 0 ? `Connect ${letter}` : `Disconnect ${config.plugboard[pairIndex]}`);
    button.setAttribute('aria-pressed',String(selectedPlug === letter || pairIndex >= 0));
    if (pairIndex >= 0) { button.classList.add('connected'); button.style.setProperty('--cable',cableColors[pairIndex]); button.title = config.plugboard[pairIndex].split('').join(' ↔ '); }
    if (selectedPlug === letter) button.classList.add('selected');
    button.disabled = busy; button.addEventListener('click', () => connect(letter)); $('plugs').append(button);
  }
  $('cable-count').textContent = `${config.plugboard.length} CABLES CONNECTED`;
  $('plug-hint').textContent = selectedPlug ? `${selectedPlug} selected. Select another socket to connect, or select ${selectedPlug} to cancel.` : 'Select two sockets to connect a cable. Select a connected socket to remove it.';
  saveState();
}
function freshSetup() {
  starting = clone(config); clearPaper(); release(); error();
  tracePath([]);
  renderWindows(); renderPlugs(); renderSettings();
  saveState();
}
function experimental() { mode = 'custom'; $('preset').value = mode; updateMode(); }
function updateMode() {
  $('model-tag').textContent = mode === 'custom' ? `CUSTOM · ${config.rotors.length} ROTORS` : `${mode} · ${config.rotors.length === 3 ? 'THREE' : 'FOUR'} ROTORS`;
  $('preset-note').textContent = mode === 'M4' ? 'Naval configuration. Stationary Greek wheel and three moving rotors.' : mode === 'M3' ? 'Historical service configuration. Three moving rotors.' : 'Experimental stack. Stationary wheels belong on the left. Repeated rotor types are allowed.';
}
function labeledControl(label, control) { const el = document.createElement('label'); el.textContent = label; el.append(control); return el; }
function renderSettings() {
  $('reflector').value = config.reflector;
  $('rotor-settings').replaceChildren();
  starting.rotors.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'rotor-setting';
    const n = document.createElement('span'); n.textContent = String(i+1).padStart(2,'0');
    const select = document.createElement('select'); select.setAttribute('aria-label',`Rotor ${i+1} type`);
    catalog.rotors.forEach(d => {
      // Historical presets require distinct service wheels, plus a Greek wheel in M4.
      const greekSlot = mode === 'M4' && i === 0;
      if (mode !== 'custom' && d.stationary !== greekSlot) return;
      const option = new Option(d.name,d.name); option.disabled = mode !== 'custom' && starting.rotors.some((other,j) => j !== i && other.name === d.name);
      select.add(option);
    });
    select.value = r.name;
    select.addEventListener('change', () => { config.rotors = clone(starting.rotors); config.rotors[i].name = select.value; freshSetup(); renderSettings(); });
    const ring = document.createElement('input'); ring.type = 'number'; ring.min = '1'; ring.max = '26'; ring.value = r.ring; ring.setAttribute('aria-label',`Rotor ${i+1} ring`);
    ring.addEventListener('change', () => {
      const value = Number(ring.value);
      if (!Number.isInteger(value) || value < 1 || value > 26) { ring.value = r.ring; error('Ring settings must be whole numbers from 1 to 26.'); return; }
      config.rotors = clone(starting.rotors); config.rotors[i].ring = value; freshSetup();
    });
    const position = document.createElement('input'); position.maxLength = 1; position.value = r.position; position.setAttribute('aria-label',`Rotor ${i+1} starting window`);
    position.addEventListener('change', () => {
      const value = position.value.toUpperCase();
      if (!/^[A-Z]$/.test(value)) { position.value = r.position; error('Starting windows must be letters A–Z.'); return; }
      position.value = value; config.rotors = clone(starting.rotors); config.rotors[i].position = value; freshSetup();
    });
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.title = `Remove rotor ${i+1}`; remove.setAttribute('aria-label',remove.title); remove.disabled = starting.rotors.length === 1;
    remove.addEventListener('click', () => { config.rotors = clone(starting.rotors); config.rotors.splice(i,1); experimental(); freshSetup(); renderSettings(); });
    row.append(n,labeledControl('TYPE',select),labeledControl('RING',ring),labeledControl('START',position),remove); $('rotor-settings').append(row);
  });
  for (const option of $('reflector').options) option.disabled = mode === 'M3' ? option.value.endsWith('thin') : mode === 'M4' ? !option.value.endsWith('thin') : false;
  updateMode();
}
function lock(value) {
  busy = value;
  document.querySelectorAll('.settings input,.settings select,.settings button,.plug,#encode,#clear').forEach(el => el.disabled = value);
  // Unlock existing controls without replacing focused elements or scroll anchors.
  if (!value) {
    document.querySelectorAll('.remove').forEach(el => el.disabled = starting.rotors.length === 1);
    saveState();
  }
}
function tracePath(stages) {
  lastTrace = stages || [];
  $('trace').replaceChildren();
  if (!stages?.length) {
    const p = document.createElement('p'); p.textContent = 'Press a key to see its journey.'; $('trace').append(p);
  }
  for (const stage of stages || []) {
    const row = document.createElement('div'); row.className = 'trace-row';
    const name = document.createElement('span'); name.textContent = stage.name;
    const letters = document.createElement('b'); letters.textContent = `${stage.input} → ${stage.output}`;
    row.append(name,letters); $('trace').append(row);
  }
}
async function undoLast() {
  if (busy || !input) return;
  release(); lock(true); error();
  const remaining = input.slice(0, -1);
  try {
    // Replay from the transcript's starting state: stepping is not generally
    // invertible by simply decrementing the windows (notably at a double step).
    const result = EnigmaJS.encode({config:clone(transcriptStart), text:remaining});
    config = result.config; input = remaining; output = result.output;
    updateWindows(); paper(); tracePath(result.trace);
  } catch (err) { error(err.message); }
  finally { lock(false); clearLamp(); }
}
async function send(text, heldKey = null) {
  if (busy || !text) return;
  lock(true); error(); clearLamp();
  try {
    const result = EnigmaJS.encode({config:clone(config),text});
    config = result.config; input += text; output += result.output;
    updateWindows(); paper(); tracePath(result.trace);
    if (heldKey && held === heldKey) {
      $(`lamp-${result.output}`).classList.add('lit'); $(`key-${heldKey}`).classList.add('pressed');
      $('lamp-status').textContent = `${heldKey} → ${result.output}`;
    }
    if (!heldKey) $('lamp-status').textContent = `${text.length} LETTERS RECORDED`;
  } catch (err) { error(err.message); release(); }
  finally { lock(false); }
}
function press(letter) {
  if (busy || held) return;
  held = letter; send(letter,letter);
}
function connect(letter) {
  if (busy) return;
  const existing = config.plugboard.findIndex(pair => pair.includes(letter));
  if (existing >= 0) { config.rotors = clone(starting.rotors); config.plugboard.splice(existing,1); selectedPlug = null; freshSetup(); }
  else if (selectedPlug === letter) { selectedPlug = null; renderPlugs(); }
  else if (selectedPlug) { config.rotors = clone(starting.rotors); config.plugboard.push(selectedPlug+letter); selectedPlug = null; freshSetup(); }
  else { selectedPlug = letter; renderPlugs(); }
}
function createBoards() {
  for (const target of ['lamps','keyboard']) for (const letters of rows) {
    const row = document.createElement('div'); row.className = 'key-row';
    for (const letter of letters) {
      const el = document.createElement(target === 'keyboard' ? 'button' : 'span');
      el.className = target === 'keyboard' ? 'key' : 'lamp'; el.id = `${target === 'keyboard' ? 'key' : 'lamp'}-${letter}`; el.textContent = letter;
      if (target === 'keyboard') {
        el.type = 'button'; el.setAttribute('aria-label',`Press ${letter}`);
        el.addEventListener('pointerdown', event => { event.preventDefault(); el.focus({preventScroll:true}); el.setPointerCapture(event.pointerId); press(letter); });
        el.addEventListener('pointerup',release); el.addEventListener('pointercancel',release);
        el.addEventListener('keydown', event => { if (event.code === 'Enter') { event.preventDefault(); if (!event.repeat) press(letter); } });
        el.addEventListener('keyup', event => { if (event.code === 'Enter') release(); });
        el.addEventListener('click',event => { if (event.detail === 0 && !held && !busy) { press(letter); setTimeout(release,500); } });
      }
      row.append(el);
    }
    $(target).append(row);
  }
}
document.addEventListener('keydown',event => {
  if (event.code === 'Space' || event.key === ' ') {
    if (!event.target.closest('input,textarea,select,[contenteditable="true"]')) event.preventDefault();
    return;
  }
  if (!catalog || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (event.key === 'Backspace') { event.preventDefault(); if (!event.repeat) undoLast(); return; }
  if (event.repeat) return;
  if (/^[a-z]$/i.test(event.key)) { event.preventDefault(); press(event.key.toUpperCase()); }
});
document.addEventListener('keyup',event => { if (event.key.toUpperCase() === held) release(); });
window.addEventListener('blur',release);
window.addEventListener('pagehide',saveState);
document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
async function init() {
  try {
    catalog = EnigmaJS.catalog(); config = clone(catalog.presets.M3); starting = clone(config);
    let restored = restoreState();
    let linkError = '';
    try {
      const shared = SettingsURL.read('enigma');
      if (shared && JSON.stringify(shared) !== JSON.stringify(shareSettings())) {
        if (!['M3','M4','custom'].includes(shared.mode)) throw new Error('Invalid machine mode.');
        const current = EnigmaJS.encode({config:shared.config, text:''});
        const initial = EnigmaJS.encode({config:shared.starting, text:''});
        if (current.config.rotors.length !== initial.config.rotors.length) throw new Error('Mismatched rotor stacks.');
        // Custom mode supports all valid stacks, even if a link mislabels its preset.
        config = current.config; starting = initial.config; mode = shared.mode;
        if (mode !== 'custom') {
          const greek = catalog.rotors.find(d => d.name === config.rotors[0].name)?.stationary;
          if ((mode === 'M3' && (config.rotors.length !== 3 || config.rotors.some(r => catalog.rotors.find(d => d.name === r.name).stationary))) || (mode === 'M4' && (config.rotors.length !== 4 || !greek))) mode = 'custom';
        }
        transcriptStart = clone(config); input = ''; output = ''; lastTrace = []; selectedPlug = null;
        $('preset').value = mode; restored = true;
      }
    } catch { linkError = 'This settings link is invalid. Your saved setup is still available.'; }
    const pendingConfig = sessionStorage.getItem('enigma.pendingConfig');
    if (pendingConfig) {
      sessionStorage.removeItem('enigma.pendingConfig');
      try {
        const imported = JSON.parse(pendingConfig);
        const checked = EnigmaJS.encode({config:imported, text:''});
        config = checked.config; starting = clone(config); mode = 'custom'; $('preset').value = mode; restored = false;
      } catch { error('The candidate settings could not be loaded. Using the M3 preset.'); }
    }
    Object.keys(catalog.reflectors).sort().forEach(name => $('reflector').add(new Option(name,name)));
    createBoards();
    if (restored) { renderWindows(); renderPlugs(); renderSettings(); paper(); tracePath(lastTrace); }
    else { freshSetup(); }
    if (linkError) error(linkError);
    SettingsURL.setupCopy(shareSettings);
    $('message').addEventListener('input',saveState);
    $('preset').addEventListener('change', () => {
      mode = $('preset').value; if (mode !== 'custom') config = clone(catalog.presets[mode]); else config.rotors = clone(starting.rotors);
      selectedPlug = null; freshSetup(); renderSettings();
    });
    $('reflector').addEventListener('change', () => { config.rotors = clone(starting.rotors); config.reflector = $('reflector').value; freshSetup(); });
    $('add-rotor').addEventListener('click', () => { config.rotors = clone(starting.rotors); config.rotors.push({name:'I',position:'A',ring:1}); experimental(); freshSetup(); renderSettings(); });
    $('reset').addEventListener('click', () => { config = clone(starting); selectedPlug = null; freshSetup(); });
    $('clear').addEventListener('click',clearPaper);
    $('encode').addEventListener('click', () => {
      const text = $('message').value.replace(/[a-z]/g,c => c.toUpperCase()).replace(/[^A-Z]/g,'');
      if (!text) { error('Enter at least one letter A–Z.'); return; }
      release(); send(text);
    });
    $('copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(output); $('copy').textContent = 'Copied'; setTimeout(() => $('copy').textContent = 'Copy output',1500); }
      catch { error('Clipboard unavailable. Select and copy the output transcript.'); }
    });
  } catch (err) { error(`Could not load the machine: ${err.message}`); }
}
init();
