// ============================================================
//  SPRECHANLAGE — Konfiguration
//  Hier kannst du Audiodateien direkt im Code hinterlegen.
//  Trage den relativen Pfad zur Datei ein (z. B. 'audio/gong.mp3')
//  oder lasse den Wert leer (''), dann muss die Datei hochgeladen werden.
// ============================================================
const AUDIO_CONFIG = {
  schulgong:  { path: '', label: 'Schulgong',  icon: '🏫' },
  gong2:      { path: '', label: 'Gong 2',     icon: '🔔' },
  gong3:      { path: '', label: 'Gong 3',     icon: '🔔' },
  gong4:      { path: '', label: 'Gong 4',     icon: '🔔' },
  gong5:      { path: '', label: 'Gong 5',     icon: '🔔' },
  durchsage:  { path: '', label: 'Durchsage',  icon: '📢' },
  alarm:      { path: '', label: 'Alarm',      icon: '🚨', isAlarm: true },
};
// ============================================================

const state = {
  audioObjects: {},
  active: new Set(),
  inputDeviceId: null,
  outputDeviceId: null,
  micStream: null,
  micAudioCtx: null,
  micAnalyser: null,
  micMeterAnim: null,
  locked: true,
  customButtons: [],
};

function $(id){ return document.getElementById(id); }

// ── DateTime ──────────────────────────────────────────────
function updateDateTime(){
  const now = new Date();
  const timeEl = $('dt-time');
  const dateEl = $('dt-date');
  if(timeEl) timeEl.textContent = now.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  if(dateEl) dateEl.textContent = now.toLocaleDateString('de-DE', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
setInterval(updateDateTime, 1000);
updateDateTime();

// ── Active list ───────────────────────────────────────────
function addActive(name){ state.active.add(name); renderActive(); }
function removeActive(name){ state.active.delete(name); renderActive(); }

function renderActive(){
  const ul = $('active-list'); if(!ul) return;
  ul.innerHTML = '';
  state.active.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="active-name">${a}</span>`;
    const btn = document.createElement('button');
    btn.className = 'stop-btn';
    btn.innerHTML = `<span class="stop-icon">⏹</span><span>Stop</span>`;
    btn.onclick = () => stopByName(a);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function stopByName(name){
  const ao = state.audioObjects[name];
  if(ao && ao.audio){ ao.audio.pause(); ao.audio.currentTime = 0; }
  removeActive(name);
}

// ── Audio playback ────────────────────────────────────────
async function playFile(key){
  let obj = state.audioObjects[key];
  if(!obj){
    alert('Keine Datei für ' + key);
    return;
  }
  if(!obj.url && obj.dataUrl){
    const blob = dataURLToBlob(obj.dataUrl);
    obj.url = URL.createObjectURL(blob);
    state.audioObjects[key] = obj;
  }
  if(!obj.url){
    alert('Keine Datei für ' + key);
    return;
  }
  if(!obj.audio){
    obj.audio = new Audio();
    obj.audio.src = obj.url;
    obj.audio.onended = () => removeActive(key);
  } else if(obj.audio.src !== obj.url){
    obj.audio.src = obj.url;
  }
  try{
    if(state.outputDeviceId && typeof obj.audio.setSinkId === 'function'){
      await obj.audio.setSinkId(state.outputDeviceId);
    }
  }catch(e){ console.warn('setSinkId failed', e); }
  obj.audio.currentTime = 0;
  obj.audio.play();
  addActive(key);
}

function dataURLToBlob(dataURL){
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const buffer = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return new Blob([buffer], {type: mime});
}

// ── Persist / load ────────────────────────────────────────
function saveAudioData(key, file, dataURL){
  try{
    localStorage.setItem('spa_audio_' + key, JSON.stringify({name: file.name, dataURL}));
  }catch(e){ console.warn('Audio persistieren fehlgeschlagen', e); }
}

function loadPersistedAudio(key){
  // Zuerst: hardcodierter Pfad aus AUDIO_CONFIG
  const cfg = AUDIO_CONFIG[key];
  if(cfg && cfg.path){
    state.audioObjects[key] = {file: null, url: cfg.path, name: cfg.label};
    setStatusLabel(key, cfg.label);
    if(cfg.isAlarm){ enableEmergencyBtn(); }
    return;
  }
  // Dann: localStorage
  const item = localStorage.getItem('spa_audio_' + key);
  if(!item) return;
  try{
    const parsed = JSON.parse(item);
    if(!parsed || !parsed.dataURL) return;
    const blob = dataURLToBlob(parsed.dataURL);
    const url = URL.createObjectURL(blob);
    state.audioObjects[key] = {file: null, url, dataUrl: parsed.dataURL, name: parsed.name || ''};
    setStatusLabel(key, parsed.name || 'Gespeichert');
    if(cfg && cfg.isAlarm){ enableEmergencyBtn(); }
  }catch(e){ console.warn('Audio laden fehlgeschlagen', e); }
}

function setStatusLabel(key, text){
  const s1 = $('status-' + key); if(s1) s1.textContent = text;
  const s2 = $('files-status-' + key); if(s2) s2.textContent = text;
}

function enableEmergencyBtn(){
  const b = $('emergency-btn'); if(b){ b.disabled = false; b.title = 'Notfall'; }
}

function restorePersistedAudio(){
  Object.keys(AUDIO_CONFIG).forEach(key => loadPersistedAudio(key));
}

function attachUpload(inputId, key){
  const input = $(inputId); if(!input) return;
  input.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if(!f) return;
    if(state.audioObjects[key] && state.audioObjects[key].url) URL.revokeObjectURL(state.audioObjects[key].url);
    const url = URL.createObjectURL(f);
    state.audioObjects[key] = {file: f, url};
    setStatusLabel(key, f.name);
    const cfg = AUDIO_CONFIG[key];
    if(cfg && cfg.isAlarm) enableEmergencyBtn();
    const reader = new FileReader();
    reader.onload = () => saveAudioData(key, f, reader.result);
    reader.readAsDataURL(f);
  });
}

// ── Custom buttons ────────────────────────────────────────
function loadCustomButtons(){
  try{
    const saved = localStorage.getItem('spa_custom_buttons');
    if(saved) state.customButtons = JSON.parse(saved);
  }catch(e){}
}

function saveCustomButtons(){
  try{ localStorage.setItem('spa_custom_buttons', JSON.stringify(state.customButtons)); }catch(e){}
}

function renderCustomButtons(){
  const container = $('custom-buttons-grid'); if(!container) return;
  container.innerHTML = '';
  state.customButtons.forEach((btn, idx) => {
    const tile = document.createElement('div');
    tile.className = 'gong-tile custom-tile';
    tile.innerHTML = `
      <button class="icon-btn ${btn.isAlarm ? 'alarm' : ''}" id="custom-btn-${idx}">
        <span class="icon">${btn.icon || '🔊'}</span>
        <span class="label">${btn.label}</span>
      </button>
      <div class="status" id="custom-status-${idx}">${btn.audioPath ? btn.label : 'Keine Datei'}</div>
    `;
    container.appendChild(tile);

    // Load audio for this custom button
    const customKey = 'custom_' + idx;
    if(btn.audioPath){
      state.audioObjects[customKey] = {file: null, url: btn.audioPath, name: btn.label};
    } else {
      // try localStorage
      const saved = localStorage.getItem('spa_audio_' + customKey);
      if(saved){
        try{
          const parsed = JSON.parse(saved);
          if(parsed && parsed.dataURL){
            const blob = dataURLToBlob(parsed.dataURL);
            state.audioObjects[customKey] = {file: null, url: URL.createObjectURL(blob), dataUrl: parsed.dataURL, name: parsed.name};
            const st = $('custom-status-' + idx); if(st) st.textContent = parsed.name;
          }
        }catch(e){}
      }
    }

    const playBtn = $('custom-btn-' + idx);
    if(playBtn) playBtn.addEventListener('click', () => playFile(customKey));
  });

  // show/hide section
  const section = $('custom-buttons-section');
  if(section) section.style.display = state.customButtons.length > 0 ? 'block' : 'none';
}

function openCreateButtonModal(){
  const modal = $('create-btn-modal'); if(!modal) return;
  $('cb-label').value = '';
  $('cb-icon').value = '🔊';
  $('cb-path').value = '';
  $('cb-is-alarm').checked = false;
  const uploadInput = $('cb-upload'); if(uploadInput) uploadInput.value = '';
  const preview = $('cb-upload-preview'); if(preview) preview.textContent = '';
  modal.classList.remove('hidden');
}

function closeCreateButtonModal(){
  const modal = $('create-btn-modal'); if(modal) modal.classList.add('hidden');
}

let pendingCustomUpload = null;

function saveNewCustomButton(){
  const label = $('cb-label').value.trim();
  const icon = $('cb-icon').value.trim() || '🔊';
  const path = $('cb-path').value.trim();
  const isAlarm = $('cb-is-alarm').checked;
  if(!label){ alert('Bitte einen Namen eingeben.'); return; }

  const newBtn = {label, icon, audioPath: path, isAlarm};
  const idx = state.customButtons.length;
  state.customButtons.push(newBtn);
  saveCustomButtons();
  renderCustomButtons();

  // handle uploaded file for this button
  if(pendingCustomUpload){
    const customKey = 'custom_' + idx;
    const f = pendingCustomUpload;
    const url = URL.createObjectURL(f);
    state.audioObjects[customKey] = {file: f, url};
    const st = $('custom-status-' + idx); if(st) st.textContent = f.name;
    const reader = new FileReader();
    reader.onload = () => saveAudioData(customKey, f, reader.result);
    reader.readAsDataURL(f);
    pendingCustomUpload = null;
  }
  closeCreateButtonModal();
}

// ── TTS ───────────────────────────────────────────────────
function speakText(text){
  if(!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
  addActive('TTS');
  utter.onend = () => removeActive('TTS');
}

// ── Push to Talk ──────────────────────────────────────────
async function startMic(){
  if(state.micStream) return;
  try{
    const constraints = {audio: {}};
    if(state.inputDeviceId) constraints.audio.deviceId = {exact: state.inputDeviceId};
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.micStream = stream;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    state.micAudioCtx = audioCtx;
    state.micAnalyser = analyser;
    state.micMeterAnim = requestAnimationFrame(updateMicMeter);
    const visualizer = $('mic-visualizer'); if(visualizer) visualizer.classList.add('active');
    addActive('Live-Mic');
  }catch(e){ console.error(e); alert('Mikrofonzugriff verweigert oder Gerät fehlt'); }
}

function stopMic(){
  if(state.micStream){ state.micStream.getTracks().forEach(t => t.stop()); state.micStream = null; }
  if(state.micMeterAnim){ cancelAnimationFrame(state.micMeterAnim); state.micMeterAnim = null; }
  if(state.micAudioCtx){ state.micAudioCtx.close().catch(() => {}); state.micAudioCtx = null; }
  state.micAnalyser = null;
  const visualizer = $('mic-visualizer'); if(visualizer) visualizer.classList.remove('active');
  document.querySelectorAll('.mic-bar').forEach(bar => { bar.style.height = '14px'; });
  removeActive('Live-Mic');
}

function updateMicMeter(){
  if(!state.micAnalyser) return;
  const dataArray = new Uint8Array(state.micAnalyser.fftSize);
  state.micAnalyser.getByteTimeDomainData(dataArray);
  const barEls = document.querySelectorAll('.mic-bar');
  const barCount = barEls.length;
  const segment = Math.floor(dataArray.length / barCount);
  barEls.forEach((bar, index) => {
    let sum = 0;
    const start = index * segment;
    const end = Math.min(dataArray.length, start + segment);
    for(let i = start; i < end; i++) sum += Math.abs(dataArray[i] - 128);
    const avg = sum / (end - start || 1);
    const level = Math.min(1, avg / 64);
    bar.style.height = (14 + level * 68) + 'px';
  });
  state.micMeterAnim = requestAnimationFrame(updateMicMeter);
}

// ── Devices / Settings ────────────────────────────────────
async function scanDevices(){
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(d => d.kind === 'audioinput');
  const outputs = devices.filter(d => d.kind === 'audiooutput');
  const si = $('select-input'); si.innerHTML = '';
  inputs.forEach(i => { const opt = document.createElement('option'); opt.value = i.deviceId; opt.textContent = i.label || ('Mic ' + (si.length + 1)); si.appendChild(opt); });
  const so = $('select-output'); so.innerHTML = '';
  outputs.forEach(o => { const opt = document.createElement('option'); opt.value = o.deviceId; opt.textContent = o.label || ('Speaker ' + (so.length + 1)); so.appendChild(opt); });
  const savedIn = localStorage.getItem('spa_input');
  const savedOut = localStorage.getItem('spa_output');
  if(savedIn) si.value = savedIn;
  if(savedOut) so.value = savedOut;
}

function openSettings(){ $('settings-modal').classList.remove('hidden'); scanDevices(); }
function closeSettings(){ $('settings-modal').classList.add('hidden'); }
function saveSettings(){
  state.inputDeviceId = $('select-input').value || null;
  state.outputDeviceId = $('select-output').value || null;
  localStorage.setItem('spa_input', state.inputDeviceId || '');
  localStorage.setItem('spa_output', state.outputDeviceId || '');
  alert('Einstellungen gespeichert');
  closeSettings();
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCustomButtons();
  restorePersistedAudio();
  renderCustomButtons();

  // Wire standard uploads
  Object.keys(AUDIO_CONFIG).forEach(key => attachUpload('upload-' + key, key));

  // Wire standard play buttons
  Object.keys(AUDIO_CONFIG).forEach(key => {
    const btn = $('play-' + key); if(btn) btn.addEventListener('click', () => playFile(key));
  });

  // TTS + PTT
  $('speak-tts').addEventListener('click', () => speakText($('tts-text').value));
  const ptt = $('push-to-talk');
  ptt.addEventListener('mousedown', () => startMic());
  ptt.addEventListener('touchstart', () => startMic());
  ptt.addEventListener('mouseup', () => stopMic());
  ptt.addEventListener('mouseleave', () => stopMic());
  ptt.addEventListener('touchend', () => stopMic());

  // Settings
  $('close-settings').addEventListener('click', closeSettings);
  $('save-settings').addEventListener('click', saveSettings);
  const gear = $('gear-settings'); if(gear) gear.addEventListener('click', () => {
    openSettings();
    const t = document.querySelector('.tabs .tab[data-tab="devices"]'); if(t) t.click();
  });

  // Create button modal
  const createBtn = $('create-button-btn');
  if(createBtn) createBtn.addEventListener('click', openCreateButtonModal);
  const closeCb = $('cb-close'); if(closeCb) closeCb.addEventListener('click', closeCreateButtonModal);
  const saveCb = $('cb-save'); if(saveCb) saveCb.addEventListener('click', saveNewCustomButton);

  // Custom upload in create modal
  const cbUpload = $('cb-upload');
  if(cbUpload) cbUpload.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    pendingCustomUpload = f || null;
    const preview = $('cb-upload-preview');
    if(preview) preview.textContent = f ? f.name : '';
  });

  // Close modal on backdrop click
  const createModal = $('create-btn-modal');
  if(createModal) createModal.addEventListener('click', e => { if(e.target === createModal) closeCreateButtonModal(); });

  // Emergency button
  const emergencyBtn = $('emergency-btn');
  const emergencyStatus = $('emergency-status');
  if(emergencyBtn){ emergencyBtn.disabled = true; emergencyBtn.title = 'Notfalldatei auswählen'; }
  let emergencyConfirm = false, emergencyTimeout = null, emergencyMessageTimeout = null;
  function setEmergencyStatus(text, active = false, autoClear = 3000){
    if(!emergencyStatus) return;
    emergencyStatus.textContent = text;
    emergencyStatus.classList.toggle('active', active);
    if(emergencyMessageTimeout){ clearTimeout(emergencyMessageTimeout); emergencyMessageTimeout = null; }
    if(autoClear) emergencyMessageTimeout = setTimeout(() => {
      if(emergencyStatus){ emergencyStatus.textContent = 'Datei wählen, dann drücken.'; emergencyStatus.classList.remove('active'); }
    }, autoClear);
  }
  function resetEmergencyButton(){
    emergencyConfirm = false;
    if(!emergencyBtn) return;
    emergencyBtn.classList.remove('confirm');
    emergencyBtn.textContent = 'NOTFALL';
    emergencyBtn.title = 'Notfall';
    setEmergencyStatus('Datei wählen, dann drücken.', false, 0);
  }
  if(emergencyBtn){
    emergencyBtn.addEventListener('click', () => {
      if(emergencyConfirm){
        resetEmergencyButton();
        if(state.audioObjects.alarm && state.audioObjects.alarm.url) playFile('alarm');
        setEmergencyStatus('Notfall ausgelöst', true, 2500);
        return;
      }
      emergencyConfirm = true;
      emergencyBtn.classList.add('confirm');
      emergencyBtn.textContent = 'NOCHMALS DRÜCKEN';
      setEmergencyStatus('Erneut drücken zum Bestätigen', true, 4000);
      clearTimeout(emergencyTimeout);
      emergencyTimeout = setTimeout(resetEmergencyButton, 4000);
    });
  }

  // Device tests
  async function requestMicrophonePermission(){
    try{
      const s = await navigator.mediaDevices.getUserMedia({audio: true});
      s.getTracks().forEach(t => t.stop());
      await scanDevices();
      alert('Mikrofonberechtigung erteilt.');
    }catch(e){ alert('Zugriff verweigert oder kein Mikrofon.'); }
  }
  let micTest = {stream: null, el: null};
  async function testMic(){
    const sel = $('select-input'); if(!sel) return;
    try{
      const constraints = {audio: {}};
      if(sel.value) constraints.audio.deviceId = {exact: sel.value};
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if(micTest.stream) micTest.stream.getTracks().forEach(t => t.stop());
      const audioEl = document.createElement('audio'); audioEl.autoplay = true; audioEl.controls = true; audioEl.srcObject = stream;
      const container = $('mic-audio-container'); if(container){ container.innerHTML = ''; container.appendChild(audioEl); $('mic-preview').style.display = 'block'; }
      micTest.stream = stream; micTest.el = audioEl;
    }catch(e){ alert('Mikrofon Test fehlgeschlagen: ' + (e.message || e)); }
  }
  async function testSpeaker(){
    const sel = $('select-output'); const outId = sel ? sel.value : null;
    try{
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx(); const osc = ctx.createOscillator(); const dest = ctx.createMediaStreamDestination();
      osc.type = 'sine'; osc.frequency.value = 880; osc.connect(dest); osc.start();
      const audioEl = document.createElement('audio'); audioEl.autoplay = true; audioEl.srcObject = dest.stream;
      if(outId && typeof audioEl.setSinkId === 'function') try{ await audioEl.setSinkId(outId); }catch(e){}
      document.body.appendChild(audioEl);
      setTimeout(() => { try{ osc.stop(); audioEl.remove(); ctx.close(); }catch(e){} }, 800);
    }catch(e){ alert('Lautsprecher Test fehlgeschlagen: ' + (e.message || e)); }
  }
  const btnPerm = $('btn-request-perm'); if(btnPerm) btnPerm.addEventListener('click', requestMicrophonePermission);
  const btnTestMic = $('btn-test-mic'); if(btnTestMic) btnTestMic.addEventListener('click', testMic);
  const btnTestSpeaker = $('btn-test-speaker'); if(btnTestSpeaker) btnTestSpeaker.addEventListener('click', testSpeaker);

  // Tab switching
  document.querySelectorAll('.tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
      const show = $('tab-' + t.getAttribute('data-tab')); if(show) show.classList.remove('hidden');
    });
  });

  if(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices){
    navigator.mediaDevices.addEventListener('devicechange', scanDevices);
    scanDevices().catch(() => {});
  }

  // Lock
  const panel = document.querySelector('.panel');
  const lockOverlay = $('lock-overlay');
  if(state.locked){ panel.classList.add('locked'); if(lockOverlay) lockOverlay.classList.remove('hidden'); }
  else if(lockOverlay){ lockOverlay.classList.add('hidden'); }
  const codeTarget = '2013';
  let codeBuffer = '';
  const mask = $('numpad-mask');
  function updateMask(){ if(mask) mask.textContent = '*'.repeat(codeBuffer.length) || '----'; }
  function unlockPanel(){ state.locked = false; panel.classList.remove('locked'); if(lockOverlay) lockOverlay.classList.add('hidden'); codeBuffer = ''; updateMask(); }
  document.querySelectorAll('.numpad button.num').forEach(b => {
    b.addEventListener('click', () => {
      if(!state.locked) return;
      codeBuffer += b.textContent.trim();
      if(codeBuffer.length > 8) codeBuffer = codeBuffer.slice(-8);
      updateMask();
    });
  });
  const clearBtn = $('numpad-clear'); if(clearBtn) clearBtn.addEventListener('click', () => { codeBuffer = ''; updateMask(); });
  const enterBtn = $('numpad-enter'); if(enterBtn) enterBtn.addEventListener('click', () => {
    if(!state.locked) return;
    if(codeBuffer === codeTarget){ unlockPanel(); } else { alert('Falscher Code'); codeBuffer = ''; updateMask(); }
  });
  updateMask();
});
