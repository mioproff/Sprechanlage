// ============================================================
//  KONFIGURATION — Audiodateien
//  Trage den relativen Pfad zur Datei ein, z.B. 'audio/gong.mp3'
//  Leer lassen ('') = Datei noch nicht hinterlegt
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
//  KONFIGURATION — Code-Aktionen
//  Jeder Code löst beim Eingeben im Numpad-Widget eine Aktion aus.
//  audioKey muss ein Schlüssel aus AUDIO_CONFIG sein (oder ein
//  Schlüssel eines eigenen Buttons: 'custom_0', 'custom_1', …)
//
//  UNLOCK_CODE  →  entsperrt das Panel (bleibt immer aktiv)
//  Weitere Codes können hier eingetragen oder im Einstellungs-
//  Dialog (Tab "Codes") hinzugefügt werden.
// ============================================================
const UNLOCK_CODE = '2013';

const CODE_ACTIONS = [
  { code: '1111', label: 'Test-Alarm',    icon: '🚨', audioKey: 'alarm'     },
  { code: '2222', label: 'Schulgong',     icon: '🏫', audioKey: 'schulgong' },
  { code: '3333', label: 'Durchsage',     icon: '📢', audioKey: 'durchsage' },
  // Weitere Einträge hier hinzufügen:
  // { code: '4444', label: 'Gong 4', icon: '🔔', audioKey: 'gong4' },
];
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
  extraCodes: [], // Codes aus localStorage
};

function $(id){ return document.getElementById(id); }

// ── DateTime ──────────────────────────────────────────────
function updateDateTime(){
  const now = new Date();
  const t = $('dt-time'); const d = $('dt-date');
  if(t) t.textContent = now.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if(d) d.textContent = now.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
setInterval(updateDateTime,1000);
updateDateTime();

// ── Active list ───────────────────────────────────────────
function addActive(name){ state.active.add(name); renderActive(); }
function removeActive(name){ state.active.delete(name); renderActive(); }
function renderActive(){
  const ul = $('active-list'); if(!ul) return; ul.innerHTML='';
  state.active.forEach(a=>{
    const li=document.createElement('li');
    li.innerHTML=`<span class="active-name">${a}</span>`;
    const btn=document.createElement('button'); btn.className='stop-btn';
    btn.innerHTML=`<span class="stop-icon">⏹</span><span>Stop</span>`;
    btn.onclick=()=>stopByName(a); li.appendChild(btn); ul.appendChild(li);
  });
}
function stopByName(name){
  const ao=state.audioObjects[name];
  if(ao&&ao.audio){ao.audio.pause();ao.audio.currentTime=0;}
  removeActive(name);
}

// ── Audio playback ────────────────────────────────────────
async function playFile(key){
  let obj=state.audioObjects[key];
  if(!obj){ showWidgetFeedback('⚠️ Keine Datei für: '+key,'error'); return; }
  if(!obj.url){ showWidgetFeedback('⚠️ Keine Datei für: '+key,'error'); return; }
  if(!obj.audio){
    obj.audio=new Audio(); obj.audio.src=obj.url;
    obj.audio.onended=()=>removeActive(key);
  } else if(obj.audio.src!==obj.url){ obj.audio.src=obj.url; }
  try{
    if(state.outputDeviceId&&typeof obj.audio.setSinkId==='function')
      await obj.audio.setSinkId(state.outputDeviceId);
  }catch(e){}
  obj.audio.currentTime=0; obj.audio.play(); addActive(key);
}

function dataURLToBlob(dataURL){
  const parts=dataURL.split(','); const mime=parts[0].match(/:(.*?);/)[1];
  const binary=atob(parts[1]); const buffer=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) buffer[i]=binary.charCodeAt(i);
  return new Blob([buffer],{type:mime});
}

// ── Load audio (path-first, no upload) ────────────────────
function loadAudioForKey(key){
  const cfg=AUDIO_CONFIG[key];
  if(cfg&&cfg.path){
    state.audioObjects[key]={file:null,url:cfg.path,name:cfg.label};
    setStatusLabel(key, cfg.label);
    if(cfg.isAlarm) enableEmergencyBtn();
  }
}

function setStatusLabel(key,text){
  const s1=$('status-'+key); if(s1) s1.textContent=text;
}
function enableEmergencyBtn(){
  const b=$('emergency-btn'); if(b){b.disabled=false;b.title='Notfall';}
}

function restoreAudio(){
  Object.keys(AUDIO_CONFIG).forEach(k=>loadAudioForKey(k));
}

// ── Custom buttons ────────────────────────────────────────
function loadCustomButtons(){
  try{ const s=localStorage.getItem('spa_custom_buttons'); if(s) state.customButtons=JSON.parse(s); }catch(e){}
}
function saveCustomButtons(){
  try{ localStorage.setItem('spa_custom_buttons',JSON.stringify(state.customButtons)); }catch(e){}
}
function deleteCustomButton(idx){
  if(!confirm('Button "'+state.customButtons[idx].label+'" wirklich löschen?')) return;
  // clean up audio object
  delete state.audioObjects['custom_'+idx];
  localStorage.removeItem('spa_audio_custom_'+idx);
  state.customButtons.splice(idx,1);
  // re-key remaining
  state.customButtons.forEach((_,i)=>{
    const oldKey='custom_'+(i+1<state.customButtons.length?i+1:i);
    // rebuild from scratch on next render
  });
  saveCustomButtons();
  renderCustomButtons();
  renderManageButtons();
}

function renderCustomButtons(){
  const container=$('custom-buttons-grid'); if(!container) return;
  container.innerHTML='';
  state.customButtons.forEach((btn,idx)=>{
    const customKey='custom_'+idx;
    // load audio path if set
    if(btn.audioPath && !state.audioObjects[customKey]){
      state.audioObjects[customKey]={file:null,url:btn.audioPath,name:btn.label};
    }
    const tile=document.createElement('div'); tile.className='gong-tile custom-tile';
    tile.innerHTML=`
      <button class="icon-btn ${btn.isAlarm?'alarm':''}" id="custom-btn-${idx}">
        <span class="icon">${btn.icon||'🔊'}</span>
        <span class="label">${btn.label}</span>
      </button>
      <div class="status" id="custom-status-${idx}">${btn.audioPath||state.audioObjects[customKey]?btn.label:'Keine Datei'}</div>`;
    container.appendChild(tile);
    const pb=$('custom-btn-'+idx);
    if(pb) pb.addEventListener('click',()=>playFile(customKey));
  });
  const sec=$('custom-buttons-section');
  if(sec) sec.style.display=state.customButtons.length>0?'block':'none';
}

function renderManageButtons(){
  const list=$('custom-buttons-manage-list'); if(!list) return;
  if(state.customButtons.length===0){
    list.innerHTML='<p style="color:var(--muted);font-size:13px">Noch keine eigenen Buttons erstellt.</p>'; return;
  }
  list.innerHTML='';
  state.customButtons.forEach((btn,idx)=>{
    const row=document.createElement('div'); row.className='manage-btn-row';
    row.innerHTML=`
      <span class="manage-icon">${btn.icon||'🔊'}</span>
      <span class="manage-label">${btn.label}</span>
      <span class="manage-path">${btn.audioPath||'—'}</span>
      <button class="mini danger" data-idx="${idx}">🗑 Löschen</button>`;
    list.appendChild(row);
    row.querySelector('button').addEventListener('click',()=>{
      deleteCustomButton(idx);
    });
  });
}

function openCreateButtonModal(){
  const m=$('create-btn-modal'); if(!m) return;
  $('cb-label').value=''; $('cb-icon').value='🔊'; $('cb-path').value=''; $('cb-is-alarm').checked=false;
  m.classList.remove('hidden');
}
function closeCreateButtonModal(){ $('create-btn-modal').classList.add('hidden'); }
function saveNewCustomButton(){
  const label=$('cb-label').value.trim();
  const icon=$('cb-icon').value.trim()||'🔊';
  const path=$('cb-path').value.trim();
  const isAlarm=$('cb-is-alarm').checked;
  if(!label){alert('Bitte einen Namen eingeben.');return;}
  if(!path){alert('Bitte einen Dateipfad eingeben.');return;}
  state.customButtons.push({label,icon,audioPath:path,isAlarm});
  saveCustomButtons(); renderCustomButtons(); renderManageButtons();
  closeCreateButtonModal();
}

// ── Extra codes (localStorage) ────────────────────────────
function loadExtraCodes(){
  try{ const s=localStorage.getItem('spa_extra_codes'); if(s) state.extraCodes=JSON.parse(s); }catch(e){}
}
function saveExtraCodes(){
  try{ localStorage.setItem('spa_extra_codes',JSON.stringify(state.extraCodes)); }catch(e){}
}
function renderCodesList(){
  const list=$('codes-list'); if(!list) return;
  const all=[...CODE_ACTIONS,...state.extraCodes];
  if(all.length===0){ list.innerHTML='<p style="color:var(--muted);font-size:13px">Keine Codes konfiguriert.</p>'; return; }
  list.innerHTML='';
  all.forEach((c,idx)=>{
    const isBuiltin=idx<CODE_ACTIONS.length;
    const row=document.createElement('div'); row.className='manage-btn-row';
    row.innerHTML=`
      <span class="manage-icon">${c.icon||'🔔'}</span>
      <span class="manage-label"><strong>${c.code}</strong> — ${c.label}</span>
      <span class="manage-path">${c.audioKey}</span>
      ${isBuiltin
        ? '<span class="mini" style="color:var(--muted);background:none;border:none">im Code</span>'
        : `<button class="mini danger" data-extra="${idx-CODE_ACTIONS.length}">🗑</button>`}`;
    list.appendChild(row);
    if(!isBuiltin){
      row.querySelector('button').addEventListener('click',e=>{
        const ei=parseInt(e.target.getAttribute('data-extra'));
        state.extraCodes.splice(ei,1); saveExtraCodes(); renderCodesList();
      });
    }
  });
}

// ── Numpad Widget (immer sichtbar nach Unlock) ────────────
let widgetBuffer='';
let feedbackTimer=null;

function showWidgetFeedback(msg, type='ok'){
  const el=$('widget-feedback'); if(!el) return;
  el.textContent=msg;
  el.className='numpad-widget-feedback '+(type==='error'?'feedback-error':'feedback-ok');
  clearTimeout(feedbackTimer);
  feedbackTimer=setTimeout(()=>{ el.textContent=''; el.className='numpad-widget-feedback'; },2500);
}

function updateWidgetMask(){
  const el=$('widget-mask');
  if(el) el.textContent=widgetBuffer?'•'.repeat(widgetBuffer.length):'----';
}

function handleWidgetCode(code){
  widgetBuffer=''; updateWidgetMask();
  // Check unlock code
  if(code===UNLOCK_CODE){ return; } // already unlocked if widget visible
  // Check all actions (builtin + extra)
  const all=[...CODE_ACTIONS,...state.extraCodes];
  const found=all.find(a=>a.code===code);
  if(found){
    showWidgetFeedback('✓','ok');
    playFile(found.audioKey);
  } else {
    showWidgetFeedback('❌ Unbekannter Code','error');
  }
}

function initWidget(){
  document.querySelectorAll('.wnum').forEach(b=>{
    b.addEventListener('click',()=>{
      widgetBuffer+=b.textContent.trim();
      if(widgetBuffer.length>8) widgetBuffer=widgetBuffer.slice(-8);
      updateWidgetMask();
    });
  });
  const wc=$('widget-clear'); if(wc) wc.addEventListener('click',()=>{widgetBuffer='';updateWidgetMask();});
  const we=$('widget-enter'); if(we) we.addEventListener('click',()=>{ if(widgetBuffer) handleWidgetCode(widgetBuffer); });
  updateWidgetMask();
}

// ── TTS ───────────────────────────────────────────────────
function speakText(text){
  if(!text) return;
  const utter=new SpeechSynthesisUtterance(text);
  speechSynthesis.cancel(); speechSynthesis.speak(utter);
  addActive('TTS'); utter.onend=()=>removeActive('TTS');
}

// ── Push to Talk ──────────────────────────────────────────
async function startMic(){
  if(state.micStream) return;
  try{
    const constraints={audio:{}};
    if(state.inputDeviceId) constraints.audio.deviceId={exact:state.inputDeviceId};
    const stream=await navigator.mediaDevices.getUserMedia(constraints);
    state.micStream=stream;
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    const audioCtx=new AudioCtx();
    const source=audioCtx.createMediaStreamSource(stream);
    const analyser=audioCtx.createAnalyser(); analyser.fftSize=256;
    source.connect(analyser);
    state.micAudioCtx=audioCtx; state.micAnalyser=analyser;
    state.micMeterAnim=requestAnimationFrame(updateMicMeter);
    const v=$('mic-visualizer'); if(v) v.classList.add('active');
    addActive('Live-Mic');
  }catch(e){ alert('Mikrofonzugriff verweigert oder Gerät fehlt'); }
}
function stopMic(){
  if(state.micStream){state.micStream.getTracks().forEach(t=>t.stop());state.micStream=null;}
  if(state.micMeterAnim){cancelAnimationFrame(state.micMeterAnim);state.micMeterAnim=null;}
  if(state.micAudioCtx){state.micAudioCtx.close().catch(()=>{});state.micAudioCtx=null;}
  state.micAnalyser=null;
  const v=$('mic-visualizer'); if(v) v.classList.remove('active');
  document.querySelectorAll('.mic-bar').forEach(b=>{b.style.height='14px';});
  removeActive('Live-Mic');
}
function updateMicMeter(){
  if(!state.micAnalyser) return;
  const dataArray=new Uint8Array(state.micAnalyser.fftSize);
  state.micAnalyser.getByteTimeDomainData(dataArray);
  const barEls=document.querySelectorAll('.mic-bar'); const barCount=barEls.length;
  const segment=Math.floor(dataArray.length/barCount);
  barEls.forEach((bar,index)=>{
    let sum=0; const start=index*segment; const end=Math.min(dataArray.length,start+segment);
    for(let i=start;i<end;i++) sum+=Math.abs(dataArray[i]-128);
    const level=Math.min(1,(sum/(end-start||1))/64);
    bar.style.height=(14+level*68)+'px';
  });
  state.micMeterAnim=requestAnimationFrame(updateMicMeter);
}

// ── Devices / Settings ────────────────────────────────────
async function scanDevices(){
  const devices=await navigator.mediaDevices.enumerateDevices();
  const inputs=devices.filter(d=>d.kind==='audioinput');
  const outputs=devices.filter(d=>d.kind==='audiooutput');
  const si=$('select-input'); si.innerHTML='';
  inputs.forEach(i=>{const opt=document.createElement('option');opt.value=i.deviceId;opt.textContent=i.label||('Mic '+(si.length+1));si.appendChild(opt);});
  const so=$('select-output'); so.innerHTML='';
  outputs.forEach(o=>{const opt=document.createElement('option');opt.value=o.deviceId;opt.textContent=o.label||('Speaker '+(so.length+1));so.appendChild(opt);});
  const savedIn=localStorage.getItem('spa_input'); const savedOut=localStorage.getItem('spa_output');
  if(savedIn) si.value=savedIn; if(savedOut) so.value=savedOut;
}
function openSettings(){
  $('settings-modal').classList.remove('hidden'); scanDevices();
  renderCodesList(); renderManageButtons();
}
function closeSettings(){ $('settings-modal').classList.add('hidden'); }
function saveSettings(){
  state.inputDeviceId=$('select-input').value||null;
  state.outputDeviceId=$('select-output').value||null;
  localStorage.setItem('spa_input',state.inputDeviceId||'');
  localStorage.setItem('spa_output',state.outputDeviceId||'');
  alert('Einstellungen gespeichert'); closeSettings();
}

// ── Lock ──────────────────────────────────────────────────
function unlockPanel(){
  state.locked=false;
  document.querySelector('.panel').classList.remove('locked');
  const lo=$('lock-overlay'); if(lo) lo.classList.add('hidden');
  const nw=$('numpad-widget'); if(nw) nw.style.display='block';
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  loadCustomButtons(); loadExtraCodes(); restoreAudio(); renderCustomButtons();

  // hide widget until unlocked
  const nw=$('numpad-widget'); if(nw) nw.style.display='none';

  // Wire standard buttons
  Object.keys(AUDIO_CONFIG).forEach(key=>{
    const btn=$('play-'+key); if(btn) btn.addEventListener('click',()=>playFile(key));
  });

  $('speak-tts').addEventListener('click',()=>speakText($('tts-text').value));
  const ptt=$('push-to-talk');
  ptt.addEventListener('mousedown',()=>startMic()); ptt.addEventListener('touchstart',()=>startMic());
  ptt.addEventListener('mouseup',()=>stopMic()); ptt.addEventListener('mouseleave',()=>stopMic());
  ptt.addEventListener('touchend',()=>stopMic());

  // Create button
  const cb=$('create-button-btn'); if(cb) cb.addEventListener('click',openCreateButtonModal);
  const cbClose=$('cb-close'); if(cbClose) cbClose.addEventListener('click',closeCreateButtonModal);
  const cbSave=$('cb-save'); if(cbSave) cbSave.addEventListener('click',saveNewCustomButton);
  const cbModal=$('create-btn-modal'); if(cbModal) cbModal.addEventListener('click',e=>{if(e.target===cbModal)closeCreateButtonModal();});

  // Settings
  $('close-settings').addEventListener('click',closeSettings);
  $('save-settings').addEventListener('click',saveSettings);
  const gear=$('gear-settings'); if(gear) gear.addEventListener('click',()=>{ openSettings(); const t=document.querySelector('.tabs .tab[data-tab="devices"]'); if(t) t.click(); });

  // Add code
  const addCodeBtn=$('add-code-btn');
  if(addCodeBtn) addCodeBtn.addEventListener('click',()=>{
    const code=$('new-code-key').value.trim();
    const label=$('new-code-label').value.trim();
    const audioKey=$('new-code-audio').value.trim();
    const icon=$('new-code-icon').value.trim()||'🔔';
    if(!code||!label||!audioKey){alert('Bitte Code, Beschreibung und Audioschlüssel ausfüllen.');return;}
    if([...CODE_ACTIONS,...state.extraCodes].find(c=>c.code===code)){alert('Dieser Code existiert bereits.');return;}
    state.extraCodes.push({code,label,audioKey,icon});
    saveExtraCodes(); renderCodesList();
    $('new-code-key').value=''; $('new-code-label').value=''; $('new-code-audio').value=''; $('new-code-icon').value='';
  });

  // Emergency
  const emergencyBtn=$('emergency-btn'); const emergencyStatus=$('emergency-status');
  if(emergencyBtn) emergencyBtn.disabled=!state.audioObjects.alarm;
  let emergencyConfirm=false,emergencyTimeout=null;
  function resetEmergency(){ emergencyConfirm=false; if(emergencyBtn){emergencyBtn.classList.remove('confirm');emergencyBtn.textContent='NOTFALL';} }
  if(emergencyBtn) emergencyBtn.addEventListener('click',()=>{
    if(emergencyConfirm){ resetEmergency(); playFile('alarm'); return; }
    emergencyConfirm=true; emergencyBtn.classList.add('confirm'); emergencyBtn.textContent='NOCHMALS DRÜCKEN';
    clearTimeout(emergencyTimeout); emergencyTimeout=setTimeout(resetEmergency,4000);
  });

  // Device tests
  async function requestMicPerm(){ try{ const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); await scanDevices(); alert('OK'); }catch(e){ alert('Verweigert'); } }
  const bp=$('btn-request-perm'); if(bp) bp.addEventListener('click',requestMicPerm);
  const btm=$('btn-test-mic'); if(btm) btm.addEventListener('click',async()=>{
    const sel=$('select-input'); if(!sel) return;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:sel.value?{deviceId:{exact:sel.value}}:true});
      const el=document.createElement('audio'); el.autoplay=true; el.controls=true; el.srcObject=stream;
      const c=$('mic-audio-container'); if(c){c.innerHTML='';c.appendChild(el);$('mic-preview').style.display='block';}
    }catch(e){alert('Fehler: '+e.message);}
  });
  const bts=$('btn-test-speaker'); if(bts) bts.addEventListener('click',async()=>{
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext; const ctx=new AudioCtx();
      const osc=ctx.createOscillator(); const dest=ctx.createMediaStreamDestination();
      osc.type='sine'; osc.frequency.value=880; osc.connect(dest); osc.start();
      const el=document.createElement('audio'); el.autoplay=true; el.srcObject=dest.stream;
      const outId=$('select-output')?.value;
      if(outId&&typeof el.setSinkId==='function') try{await el.setSinkId(outId);}catch(e){}
      document.body.appendChild(el);
      setTimeout(()=>{try{osc.stop();el.remove();ctx.close();}catch(e){}},800);
    }catch(e){alert('Fehler: '+e.message);}
  });

  // Tab switching
  document.querySelectorAll('.tabs .tab').forEach(t=>{
    t.addEventListener('click',()=>{
      document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tc=>tc.classList.add('hidden'));
      const show=$('tab-'+t.getAttribute('data-tab')); if(show) show.classList.remove('hidden');
    });
  });

  if(navigator.mediaDevices&&navigator.mediaDevices.enumerateDevices){
    navigator.mediaDevices.addEventListener('devicechange',scanDevices);
    scanDevices().catch(()=>{});
  }

  // ── Lock overlay (initial unlock) ────────────────────────
  const panel=document.querySelector('.panel');
  const lockOverlay=$('lock-overlay');
  panel.classList.add('locked');
  if(lockOverlay) lockOverlay.classList.remove('hidden');

  let lockBuffer='';
  const lockMask=$('numpad-mask');
  function updateLockMask(){ if(lockMask) lockMask.textContent=lockBuffer?'•'.repeat(lockBuffer.length):'----'; }
  document.querySelectorAll('.numpad button.num').forEach(b=>{
    b.addEventListener('click',()=>{
      lockBuffer+=b.textContent.trim();
      if(lockBuffer.length>8) lockBuffer=lockBuffer.slice(-8);
      updateLockMask();
    });
  });
  const lockClear=$('numpad-clear'); if(lockClear) lockClear.addEventListener('click',()=>{lockBuffer='';updateLockMask();});
  const lockEnter=$('numpad-enter'); if(lockEnter) lockEnter.addEventListener('click',()=>{
    if(lockBuffer===UNLOCK_CODE){ unlockPanel(); initWidget(); }
    else{ alert('Falscher Code'); lockBuffer=''; updateLockMask(); }
  });
  updateLockMask();
});
