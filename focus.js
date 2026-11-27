const focusDefaults = {work:25, rest:5, sound:'quiet', volume:35};
const focusSoundChoices = {rain:'Дождь', quiet:'Тишина', space:'Космос'};
let focusPhase = 'work';
let focusMessage = '';
let focusAudio;
let focusSoundSource;
let focusSoundGain;
let focusSoundRequest;
let focusRainBuffer;
let focusSpaceBuffer;

function focusOptions() {
  const options = {...focusDefaults,...state.focusOptions};
  if (options.sound === 'ambient') options.sound = 'space';
  if (!Object.hasOwn(focusSoundChoices,options.sound)) options.sound = 'quiet';
  return options;
}

function focusScreen(taskId) {
  const options = focusOptions();
  const tasks = state.tasks.filter(task => !task.done);
  const pick = tasks.find(task => task.id === taskId);
  return `<section class="panel focus-panel" aria-label="Таймер фокуса">
    <form id="focus-form">
      <div class="focus-timer-top">
        <div class="focus-phases" role="group" aria-label="Режим таймера">
          <button type="button" data-focus-phase="work">Работа</button>
          <button type="button" data-focus-phase="rest">Перерыв</button>
        </div>
        <details class="focus-settings">
          <summary><span id="focus-length-label"></span><span aria-hidden="true">⌄</span></summary>
          <div class="focus-lengths">
            <label>Работа, мин<input id="focus-work" type="number" min="1" max="180" value="${options.work}" inputmode="numeric" required></label>
            <label>Перерыв, мин<input id="focus-rest" type="number" min="1" max="60" value="${options.rest}" inputmode="numeric" required></label>
          </div>
        </details>
      </div>
      <div class="focus-main">
        <div class="focus-dial">
          <svg viewBox="0 0 320 104" preserveAspectRatio="none" aria-hidden="true">
            <path class="focus-arc-track" d="M 4 100 C 40 -24 280 -24 316 100"/>
            <path id="focus-arc" d="M 4 100 C 40 -24 280 -24 316 100" pathLength="100"/>
          </svg>
          <p id="focus-clock" class="focus-clock" role="timer"></p>
        </div>
        <div id="focus-setup"><select id="focus-task" aria-label="Задача для фокуса">
          <option value="">Без задачи</option>
          ${tasks.map(task=>`<option value="${safe(task.id)}" ${task === pick ? 'selected' : ''}>${safe(task.name)}</option>`).join('')}
        </select></div>
        <p id="focus-task-detail" hidden></p>
        <div class="focus-controls">
          <button type="submit" class="primary" id="focus-start"></button>
          <button type="button" id="focus-reset" hidden>Сбросить</button>
        </div>
        <p id="focus-status" role="status"></p>
      </div>
      <div class="focus-sound-options">
        <div class="focus-sounds" role="group" aria-label="Фоновый звук">
          ${Object.entries(focusSoundChoices).map(([value,label])=>`<button type="button" data-focus-sound="${value}">${label}</button>`).join('')}
        </div>
        <label class="focus-volume"><span aria-hidden="true">♪</span>
          <input id="focus-volume" type="range" min="0" max="100" value="${options.volume}" aria-label="Громкость фона">
        </label>
      </div>
    </form>
  </section>${constellationScreen()}`;
}

function focusTaskTime(taskId) {
  const minutes = (state.focusSessions || []).reduce((sum,session)=>sum + (session.taskId === taskId ? session.minutes : 0),0);
  return minutes ? `${minutes} мин фокуса` : '';
}

function focusRemaining(run, now = Date.now()) {
  return Math.max(0, run.endsAt ? run.endsAt - now : run.remaining);
}

function focusClock(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
}

function setFocusStatus(message) {
  focusMessage = message;
  const status = $('focus-status');
  if (status) status.textContent = message;
}

function saveFocus(changes) {
  if (!save({...state,...changes})) {
    setFocusStatus('Не удалось сохранить таймер в этом браузере.');
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
    setFocusStatus('Фокус завершён. Можно начать перерыв.');
    refreshFocusProgress(run.taskId, session.id);
  } else {
    if (!saveFocus({focusRun:null})) return;
    focusPhase = 'work';
    setFocusStatus('Перерыв завершён.');
  }
  syncFocusSound();
  updateFocusPanel();
  feedback(focusMessage);
}

function refreshFocusProgress(taskId, sessionId) {
  if (taskId) {
    const total = focusTaskTime(taskId);
    for (const element of $('view').querySelectorAll('[data-focus-task-time]')) {
      if (element.dataset.focusTaskTime !== taskId) continue;
      element.textContent = total;
      element.hidden = !total;
    }
  }
  if (sessionId) {
    selectedStarId = `focus-${sessionId}`;
    constellationPage = 0;
  }
  const section = $('constellation');
  if (section) section.outerHTML = constellationScreen(sessionId ? selectedStarId : '');
}

function showFocusClock() {
  const run = state.focusRun;
  const phase = run?.phase || focusPhase;
  const field = $(phase === 'rest' ? 'focus-rest' : 'focus-work');
  const minutes = run ? run[phase] : field?.validity.valid ? field.valueAsNumber : focusOptions()[phase];
  const duration = minutes * 60000;
  const remaining = run ? focusRemaining(run) : duration;
  const time = focusClock(remaining);
  const clock = $('focus-clock');
  if (clock && clock.textContent !== time) clock.textContent = time;
  const arc = $('focus-arc');
  if (arc) arc.style.strokeDashoffset = 100 * (1 - remaining / duration);
  const badge = $('focus-badge');
  badge.hidden = !run || screen === 'focus';
  const label = run ? `${phase === 'rest' ? 'Перерыв' : 'Фокус'} · ${time}` : '';
  if (badge.textContent !== label) badge.textContent = label;
}

function updateFocusPanel() {
  showFocusClock();
  const form = $('focus-form');
  if (!form) return;
  const run = state.focusRun;
  const phase = run?.phase || focusPhase;
  const options = focusOptions();
  $('focus-setup').hidden = Boolean(run) || phase === 'rest';
  $('focus-reset').hidden = !run;
  $('focus-task-detail').textContent = run?.phase === 'work' ? run.taskName : '';
  $('focus-task-detail').hidden = !$('focus-task-detail').textContent;
  $('focus-start').textContent = run?.endsAt ? 'Пауза' :
    run && run.remaining < run[phase] * 60000 ? 'Продолжить' :
    phase === 'rest' ? 'Начать перерыв' : 'Начать фокус';
  $('focus-status').textContent = focusMessage;
  $('focus-work').value = options.work;
  $('focus-rest').value = options.rest;
  for (const button of form.querySelectorAll('[data-focus-phase]')) {
    button.setAttribute('aria-pressed',button.dataset.focusPhase === phase);
    button.disabled = Boolean(run);
  }
  for (const button of form.querySelectorAll('[data-focus-sound]')) {
    button.setAttribute('aria-pressed',button.dataset.focusSound === options.sound);
  }
  const settings = form.querySelector('.focus-settings');
  settings.hidden = Boolean(run);
  if (run) settings.open = false;
  $('focus-length-label').textContent = `${options.work} / ${options.rest} мин`;
  $('focus-volume').value = options.volume;
  $('focus-volume').disabled = options.sound === 'quiet';
}

function setFocusVolume(value) {
  if (focusSoundGain) focusSoundGain.gain.setTargetAtTime(value / 100 * .8,focusAudio.currentTime,.05);
}

function makeSpaceSound(context) {
  const rate = 22050;
  const buffer = context.createBuffer(2,rate * 28,rate);
  const notes = [42,49,54,61,64].map(note=>440 * 2 ** ((note - 69) / 12));
  for (let side = 0; side < 2; side++) {
    const channel = buffer.getChannelData(side);
    for (let index = 0; index < channel.length; index++) {
      const position = index / channel.length * 2 * Math.PI;
      for (const [note, frequency] of notes.entries()) {
        const phase = position * Math.round(frequency * 28);
        const swell = .62 + .38 * Math.cos(position * (1 + note % 2) + note + side * .6);
        channel[index] += (Math.sin(phase + .7 * Math.sin(position + side)) +
          .13 * Math.sin(2 * phase)) * swell * (.095 / (1 + note * .24));
      }
    }
  }
  return buffer;
}

async function getRainSound() {
  focusRainBuffer ??= (async () => {
    const response = await fetch('audio/focus-rain.mp3');
    if (!response.ok) throw new Error('Rain recording unavailable');
    return focusAudio.decodeAudioData(await response.arrayBuffer());
  })();
  try { return await focusRainBuffer; }
  catch (error) { focusRainBuffer = null; throw error; }
}

async function syncFocusSound(gesture = false) {
  const run = state.focusRun;
  const options = focusOptions();
  const desired = run?.endsAt ? options.sound : 'quiet';
  if (gesture && desired !== 'quiet') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      focusAudio ??= new AudioContext();
      await focusAudio.resume();
    } catch {
      setFocusStatus('Фоновый звук недоступен в этом браузере.');
      return;
    }
    if (!state.focusRun?.endsAt || focusOptions().sound !== desired) return;
  }
  if (focusSoundRequest?.kind !== desired) {
    focusSoundRequest = null;
    if (focusSoundSource) {
      focusSoundSource.stop();
      focusSoundSource.disconnect();
      focusSoundGain.disconnect();
      focusSoundSource = null;
      focusSoundGain = null;
    }
    if (desired !== 'quiet' && focusAudio?.state === 'running') {
      const request = {kind:desired};
      focusSoundRequest = request;
      try {
        const buffer = desired === 'rain' ? await getRainSound() : focusSpaceBuffer ??= makeSpaceSound(focusAudio);
        if (focusSoundRequest !== request) return;
        focusSoundSource = focusAudio.createBufferSource();
        focusSoundGain = focusAudio.createGain();
        focusSoundSource.buffer = buffer;
        focusSoundSource.loop = true;
        focusSoundGain.gain.value = 0;
        focusSoundSource.connect(focusSoundGain).connect(focusAudio.destination);
        focusSoundSource.start();
      } catch {
        if (focusSoundRequest === request) {
          focusSoundRequest = null;
          setFocusStatus(`Не удалось включить фон «${focusSoundChoices[desired]}».`);
        }
      }
    }
  }
  setFocusVolume(focusOptions().volume);
}

function submitFocus(event) {
  if (event.target.id !== 'focus-form') return;
  event.preventDefault();
  const run = state.focusRun;
  focusTick();
  if (run !== state.focusRun) return;
  const now = Date.now();
  let next;
  if (run?.endsAt) next = {...run,endsAt:0,remaining:focusRemaining(run,now)};
  else if (run) next = {...run,endsAt:now + run.remaining};
  else {
    const work = $('focus-work').valueAsNumber, rest = $('focus-rest').valueAsNumber;
    const task = focusPhase === 'work' && state.tasks.find(item=>item.id === $('focus-task').value);
    const duration = (focusPhase === 'work' ? work : rest) * 60000;
    next = {id:crypto.randomUUID(),phase:focusPhase,taskId:task?.id || '',taskName:task?.name || '',
      work,rest,remaining:duration,endsAt:now + duration};
  }
  if (!saveFocus({focusRun:next,focusOptions:{...focusOptions(),work:next.work,rest:next.rest}})) return;
  setFocusStatus('');
  updateFocusPanel();
  void syncFocusSound(true);
}

function handleFocusClick(event) {
  const button = event.target.closest('#focus-form button');
  if (!button) return;
  if (button.dataset.focusPhase) {
    focusPhase = button.dataset.focusPhase;
    setFocusStatus('');
    updateFocusPanel();
  } else if (button.id === 'focus-reset') {
    if (!saveFocus({focusRun:null})) return;
    focusPhase = 'work';
    setFocusStatus('Таймер сброшен.');
    void syncFocusSound();
    updateFocusPanel();
    $('focus-start').focus({preventScroll:true});
  } else if (button.dataset.focusSound) {
    setFocusStatus('');
    if (!saveFocus({focusOptions:{...focusOptions(),sound:button.dataset.focusSound}})) return;
    updateFocusPanel();
    void syncFocusSound(true);
  }
}

function startFocus() {
  const view = $('view');
  view.addEventListener('submit',submitFocus);
  view.addEventListener('click',handleFocusClick);
  view.addEventListener('input',event=>{
    const field = event.target;
    if (field.id === 'focus-work' || field.id === 'focus-rest') showFocusClock();
    if (field.id === 'focus-volume') setFocusVolume(field.valueAsNumber);
  });
  view.addEventListener('change',event=>{
    const field = event.target;
    if (field.id === 'focus-volume') {
      if (saveFocus({focusOptions:{...focusOptions(),volume:field.valueAsNumber}})) void syncFocusSound(true);
    } else if ((field.id === 'focus-work' || field.id === 'focus-rest') && field.validity.valid) {
      const option = field.id === 'focus-work' ? 'work' : 'rest';
      if (saveFocus({focusOptions:{...focusOptions(),[option]:field.valueAsNumber}})) {
        const {work,rest} = focusOptions();
        $('focus-length-label').textContent = `${work} / ${rest} мин`;
      }
    }
  });
  $('focus-badge').addEventListener('click',()=>{location.hash = 'focus';});
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
    void syncFocusSound();
    updateFocusPanel();
  });
  document.addEventListener('visibilitychange',focusTick);
  window.addEventListener('pageshow',focusTick);
  setInterval(focusTick,500);
  updateFocusPanel();
  focusTick();
}
