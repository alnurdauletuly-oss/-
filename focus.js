const focusDefaults = {work:25, rest:5, sound:'quiet', volume:35};
let focusMessage = '';
let focusAudio;
let focusSoundSource;
let focusSoundGain;
let focusPlaying = 'quiet';
let focusAudioEnabled = false;

function focusOptions() {
  return {...focusDefaults,...state.focusOptions};
}

function focusTaskTime(taskId) {
  const minutes = (state.focusSessions || []).reduce((sum,session)=>sum + (session.taskId === taskId ? session.minutes : 0),0);
  return minutes ? `${minutes} мин фокуса` : '';
}

function focusButton(task) {
  return `<button type="button" class="focus-launch" data-open-focus="${safe(task?.id || '')}" aria-label="${task ? 'Начать фокус: ' + safe(task.name) : 'Открыть фокус'}">Фокус</button>`;
}

function focusRemaining(run, now = Date.now()) {
  return Math.max(0, run.endsAt ? run.endsAt - now : run.remaining);
}

function focusClock(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
}

function saveFocus(changes) {
  if (!save({...state,...changes})) {
    $('focus-status').textContent = 'Не удалось сохранить таймер в этом браузере.';
    return false;
  }
  Object.assign(state,changes);
  return true;
}

function focusTick() {
  const run = state.focusRun;
  if (!run?.endsAt || focusRemaining(run) > 0) { showFocusClock(); return; }
  if (run.phase === 'work') {
    const sessions = state.focusSessions || [];
    const session = {id:run.id, taskId:run.taskId, taskName:run.taskName, minutes:run.work, date:new Date(run.endsAt).toISOString()};
    const rest = {...run, phase:'rest', endsAt:0, remaining:run.rest * 60000};
    if (!saveFocus({focusRun:rest, focusSessions:sessions.some(item=>item.id === run.id) ? sessions : [...sessions,session]})) return;
    focusMessage = 'Фокус завершён. Можно начать перерыв.';
    if (screen === 'tasks' || screen === 'home') refreshFocusProgress(run.taskId);
  } else {
    if (!saveFocus({focusRun:null})) return;
    focusMessage = 'Перерыв завершён.';
  }
  syncFocusSound();
  updateFocusPanel();
  feedback(focusMessage);
}

function refreshFocusProgress(taskId) {
  const total = focusTaskTime(taskId);
  for (const element of $('view').querySelectorAll('[data-focus-task-time]')) {
    if (element.dataset.focusTaskTime !== taskId) continue;
    element.textContent = total;
    element.hidden = !total;
  }
  const section = $('constellation');
  if (section) section.outerHTML = constellationScreen();
}

function showFocusClock() {
  const run = state.focusRun;
  const field = $('focus-work');
  const work = field.validity.valid ? field.valueAsNumber : focusOptions().work;
  const time = focusClock(run ? focusRemaining(run) : work * 60000);
  const clock = $('focus-clock');
  const badge = $('focus-badge');
  if (clock.textContent !== time) clock.textContent = time;
  badge.hidden = !run;
  const label = run ? `${run.phase === 'rest' ? 'Перерыв' : 'Фокус'} · ${time}` : '';
  if (badge.textContent !== label) badge.textContent = label;
}

function updateFocusPanel() {
  const run = state.focusRun;
  const options = focusOptions();
  $('focus-setup').hidden = Boolean(run);
  $('focus-reset').hidden = !run;
  $('focus-task-detail').textContent = run?.taskName || '';
  $('focus-task-detail').hidden = !run?.taskName;
  $('focus-phase').textContent = run?.phase === 'rest' ? 'Перерыв' : 'Фокус';
  $('focus-start').textContent = run?.endsAt ? 'Пауза' : run?.phase === 'rest' ? 'Начать перерыв' : run ? 'Продолжить' : 'Начать фокус';
  $('focus-status').textContent = focusMessage;
  if (!run) {
    $('focus-work').value = options.work;
    $('focus-rest').value = options.rest;
  }
  $('focus-sound').value = options.sound;
  $('focus-volume').value = options.volume;
  showFocusClock();
}

function makeFocusSound(context, kind) {
  const rate = 22050;
  const duration = kind === 'ambient' ? 24 : 8;
  const buffer = context.createBuffer(1, rate * duration, rate);
  const channel = buffer.getChannelData(0);
  if (kind === 'ambient') {
    const chords = [[50,57,64,65],[46,53,60,62],[53,60,65,69],[48,55,62,64]];
    for (const [index,chord] of chords.entries()) {
      const frequencies = chord.map(note=>440 * 2 ** ((note - 69) / 12));
      for (let i = 0; i < rate * 8; i++) {
        const time = i / rate;
        const envelope = Math.min(1,time / 2, (8 - time) / 2) ** 2;
        let sample = 0;
        for (const frequency of frequencies) {
          sample += Math.sin(2 * Math.PI * time * frequency) * .085;
          sample += Math.sin(4 * Math.PI * time * frequency) * .012;
        }
        channel[(index * rate * 6 + i) % channel.length] += sample * envelope;
      }
    }
  } else {
    let smoothed = 0;
    for (let i = 0; i < channel.length; i++) {
      const noise = Math.random() * 2 - 1;
      smoothed = .96 * smoothed + .04 * noise;
      channel[i] = kind === 'rain' ? (.45 * noise + .55 * smoothed) *
        (.7 + .12 * Math.sin(2 * Math.PI * i / channel.length)) : smoothed * 2;
    }
  }
  return buffer;
}

function syncFocusSound(gesture = false) {
  const options = focusOptions();
  const run = state.focusRun;
  const desired = run?.phase === 'work' && run.endsAt ? options.sound : 'quiet';
  if (desired !== 'quiet' && gesture) {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      focusAudio ??= new Audio();
      focusAudioEnabled = true;
      focusAudio.resume().catch(()=>{});
    } catch {
      $('focus-status').textContent = 'Фоновый звук недоступен в этом браузере.';
      return;
    }
  }
  if (focusPlaying !== desired) {
    if (focusSoundSource) {
      focusSoundSource.stop();
      focusSoundSource.disconnect();
      focusSoundSource = null;
      focusSoundGain = null;
    }
    focusPlaying = 'quiet';
    if (desired !== 'quiet' && focusAudioEnabled && focusAudio) {
      focusSoundSource = focusAudio.createBufferSource();
      focusSoundGain = focusAudio.createGain();
      focusSoundSource.buffer = makeFocusSound(focusAudio, desired);
      focusSoundSource.loop = true;
      focusSoundSource.connect(focusSoundGain).connect(focusAudio.destination);
      focusSoundGain.gain.value = options.volume / 100 * .42;
      focusSoundSource.start();
      focusPlaying = desired;
    }
  }
  if (focusSoundGain) focusSoundGain.gain.setTargetAtTime(options.volume / 100 * .42, focusAudio.currentTime,.04);
}

function openFocus(taskId = '') {
  focusTick();
  const dialog = $('focus-dialog');
  const select = $('focus-task');
  select.replaceChildren(new Option('Без задачи',''));
  const run = state.focusRun;
  for (const task of state.tasks) {
    if (!task.done || task.id === taskId || task.id === run?.taskId) select.add(new Option(task.name,task.id));
  }
  if (taskId) select.value = taskId;
  updateFocusPanel();
  if (!dialog.open) dialog.showModal();
  syncFocusSound(true);
}

function startFocus() {
  $('focus-work').addEventListener('input',showFocusClock);
  $('focus-form').addEventListener('submit', event => {
    event.preventDefault();
    focusTick();
    const run = state.focusRun;
    const now = Date.now();
    let next;
    if (run?.endsAt) next = {...run,endsAt:0,remaining:focusRemaining(run,now)};
    else if (run) next = {...run,endsAt:now + run.remaining};
    else {
      const work = $('focus-work').valueAsNumber, rest = $('focus-rest').valueAsNumber;
      const task = state.tasks.find(item=>item.id === $('focus-task').value);
      next = {id:crypto.randomUUID(),phase:'work', taskId:task?.id || '', taskName:task?.name || '',
        work,rest,remaining:work * 60000,endsAt:now + work * 60000};
    }
    const options = {...focusOptions(),work:next.work,rest:next.rest};
    if (!saveFocus({focusRun:next,focusOptions:options})) return;
    focusMessage = '';
    updateFocusPanel();
    syncFocusSound(true);
  });
  $('focus-reset').addEventListener('click',()=>{
    if (!saveFocus({focusRun:null})) return;
    focusMessage = 'Таймер сброшен.';
    syncFocusSound();
    updateFocusPanel();
  });
  $('focus-sound').addEventListener('change',event=>{
    if (saveFocus({focusOptions:{...focusOptions(),sound:event.target.value}})) syncFocusSound(true);
  });
  $('focus-volume').addEventListener('input',event=>{
    if (focusSoundGain) focusSoundGain.gain.setTargetAtTime(Number(event.target.value) / 100 * .42, focusAudio.currentTime,.04);
  });
  $('focus-volume').addEventListener('change',event=>{
    if (saveFocus({focusOptions:{...focusOptions(),volume:Number(event.target.value)}})) syncFocusSound(true);
  });
  $('focus-close').addEventListener('click',()=>$('focus-dialog').close());
  $('focus-badge').addEventListener('click',()=>openFocus());
  window.addEventListener('storage',event=>{
    if (event.key !== storageKey || !event.newValue) return;
    let data;
    try { data = JSON.parse(event.newValue); } catch { return; }
    if (!data) return;
    const {focusRun,focusSessions,focusOptions} = data;
    if (JSON.stringify(state.focusRun) === JSON.stringify(focusRun) && JSON.stringify(state.focusOptions) === JSON.stringify(focusOptions) &&
      (state.focusSessions || []).length === (focusSessions || []).length) return;
    const taskIds = new Set([state.focusRun?.taskId,focusRun?.taskId]);
    Object.assign(state,{focusRun,focusSessions,focusOptions});
    for (const id of taskIds) refreshFocusProgress(id);
    syncFocusSound();
    updateFocusPanel();
  });
  document.addEventListener('visibilitychange',focusTick);
  window.addEventListener('pageshow',focusTick);
  setInterval(focusTick,500);
  updateFocusPanel();
  focusTick();
}
