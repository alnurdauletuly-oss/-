const focusSounds = [
  {id:'rain', title:'Дождь', scene:'Капли за окном', file:'focus-rain.mp3', author:'Snoopy20111', source:'Snoopy20111/sounds/399072'},
  {id:'relax', title:'Релаксация', scene:'Спокойный эмбиент', author:'freelncr', source:'freelncr/sounds/553417'},
  {id:'space-1', title:'Космос 1', scene:'Туманность', author:'Erokia', source:'Erokia/sounds/386468', license:'by/4.0'},
  {id:'space-2', title:'Космос 2', scene:'На орбите', author:'wi-photos', source:'wi-photos/sounds/521061'},
  {id:'birds', title:'Птицы', scene:'Утренний хор', author:'Simon Spiers', source:'Simon%20Spiers/sounds/516876'},
  {id:'waves', title:'Волны', scene:'Океанский берег', author:'SamsterBirdies', source:'SamsterBirdies/sounds/578524'},
  {id:'wind', title:'Ветер', scene:'Ветер в кронах деревьев', author:'willstepp', source:'willstepp/sounds/188288'},
  {id:'thunder', title:'Гроза', scene:'Дождь и раскаты грома', author:'Arctura', source:'Arctura/sounds/39828', license:'by/3.0'},
  {id:'crickets', title:'Сверчки', scene:'Ночной луг', author:'Nox_Sound', source:'Nox_Sound/sounds/637083'}
];
const legacyFocusSounds = {quiet:'relax', noise:'relax', space:'space-1', ambient:'space-1'};
const focusTrack = new Audio();
focusTrack.loop = true;
focusTrack.preload = 'none';
let loadedFocusSound = '';
let focusPlayback = 'paused';
let focusPlaybackRevision = 0;
let focusAudioContext, focusAudioGain;

function findFocusSound(id) {
  return focusSounds.find(sound => sound.id === id);
}

function normalizeFocusSound(id) {
  if (Object.hasOwn(legacyFocusSounds,id)) return legacyFocusSounds[id];
  return findFocusSound(id)?.id || 'rain';
}

function validFocusSound(id) {
  return typeof id === 'string' && (Boolean(findFocusSound(id)) || Object.hasOwn(legacyFocusSounds,id));
}

function focusArt(sound) {
  return `audio/art/${sound.id}.webp`;
}

function focusAmbienceScreen() {
  return `<section class="panel ambience-panel" aria-labelledby="ambience-title">
    <h2 id="ambience-title">Фоновые звуки</h2>
    <div class="ambience-scene">
      <img id="ambience-art" alt="" width="418" height="418">
      <div class="ambience-now">
        <p id="ambience-track-title"></p>
        <p id="ambience-track-scene"></p>
        <button type="button" class="primary" id="ambience-play"></button>
        <p id="ambience-status" role="status"></p>
      </div>
    </div>
    <div class="ambience-library" role="group" aria-label="Выбор фонового звука">
      ${focusSounds.map(sound=>`<button class="ambience-choice" type="button" data-focus-sound="${sound.id}">
        <img src="${focusArt(sound)}" alt="" width="418" height="418" loading="lazy">
        <span>${sound.title}</span>
      </button>`).join('')}
    </div>
    <div class="ambience-tools">
      <p><a id="ambience-credit" target="_blank" rel="noopener"></a> · <a id="ambience-license" target="_blank" rel="noopener"></a></p>
      <label class="ambience-volume">Громкость<input id="focus-volume" type="range" min="0" max="100"></label>
    </div>
  </section>`;
}

function updateFocusAmbience() {
  const scene = $('ambience-art');
  if (!scene) return;
  const options = focusOptions();
  const sound = findFocusSound(options.sound);
  const art = focusArt(sound);
  if (scene.getAttribute('src') !== art) scene.src = art;
  $('ambience-track-title').textContent = sound.title;
  $('ambience-track-scene').textContent = sound.scene;
  const busy = focusPlayback === 'loading';
  $('ambience-play').textContent = busy ? 'Отменить загрузку' : focusPlayback === 'playing' ? 'Пауза' : 'Включить звук';
  $('ambience-status').textContent = busy ? 'Загружаем звук…' : focusPlayback === 'error' ? 'Не удалось включить звук. Попробуй ещё раз.' : '';
  const credit = $('ambience-credit');
  credit.href = `https://freesound.org/people/${sound.source}/`;
  credit.textContent = `${sound.author} · Freesound`;
  const license = $('ambience-license');
  license.href = `https://creativecommons.org/${sound.license ? 'licenses/' + sound.license : 'publicdomain/zero/1.0'}/`;
  license.textContent = sound.license ? 'CC BY ' + sound.license.split('/')[1] : 'CC0';
  $('focus-volume').value = options.volume;
  for (const button of $('view').querySelectorAll('[data-focus-sound]')) {
    button.setAttribute('aria-pressed',button.dataset.focusSound === sound.id);
  }
}

function applyFocusVolume(value, gesture = false) {
  const volume = value / 100;
  focusTrack.volume = volume;
  if (gesture && focusTrack.volume !== volume && !focusAudioGain) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      focusAudioContext = new AudioContext();
      focusAudioGain = focusAudioContext.createGain();
      focusAudioContext.createMediaElementSource(focusTrack).connect(focusAudioGain).connect(focusAudioContext.destination);
    } catch {
      focusAudioGain = null;
    }
  }
  if (focusAudioGain) {
    focusAudioGain.gain.value = volume;
    if (gesture) void focusAudioContext.resume().catch(()=>{});
  }
}

function pauseFocusAmbience() {
  focusPlaybackRevision++;
  focusTrack.pause();
  focusPlayback = 'paused';
  updateFocusAmbience();
}

async function toggleFocusAmbience(id) {
  if (loadedFocusSound === id && (focusPlayback === 'playing' || focusPlayback === 'loading')) {
    pauseFocusAmbience();
    return;
  }
  const sound = findFocusSound(id);
  const revision = ++focusPlaybackRevision;
  if (loadedFocusSound !== id || focusPlayback === 'error') {
    focusTrack.src = `audio/${sound.file || id + '.mp3'}`;
    loadedFocusSound = id;
  }
  applyFocusVolume(focusOptions().volume,true);
  focusPlayback = 'loading';
  updateFocusAmbience();
  try {
    await focusTrack.play();
    if (revision !== focusPlaybackRevision) return;
    focusPlayback = 'playing';
  } catch {
    if (revision !== focusPlaybackRevision) return;
    focusPlayback = 'error';
  }
  updateFocusAmbience();
}

function saveFocusAmbience(change) {
  const options = {...focusOptions(),...change};
  if (!save({...state,focusOptions:options})) return false;
  state.focusOptions = options;
  return true;
}

function syncFocusAmbienceSettings() {
  const {sound,volume} = focusOptions();
  if (loadedFocusSound && loadedFocusSound !== sound) pauseFocusAmbience();
  applyFocusVolume(volume);
  updateFocusAmbience();
}

function startFocusAmbience() {
  const view = $('view');
  view.addEventListener('click',event=>{
    const choice = event.target.closest('[data-focus-sound]');
    if (choice) {
      const id = choice.dataset.focusSound;
      if (!saveFocusAmbience({sound:id})) return;
      void toggleFocusAmbience(id);
      const scene = $('ambience-art').parentElement;
      if (event.detail && scene.getBoundingClientRect().bottom < 64) scene.scrollIntoView({block:'nearest'});
    } else if (event.target.closest('#ambience-play')) {
      void toggleFocusAmbience(focusOptions().sound);
    }
  });
  view.addEventListener('input',event=>{
    if (event.target.id === 'focus-volume') applyFocusVolume(event.target.valueAsNumber,true);
  });
  view.addEventListener('change',event=>{
    if (event.target.id !== 'focus-volume') return;
    if (!saveFocusAmbience({volume:event.target.valueAsNumber})) syncFocusAmbienceSettings();
  });
  focusTrack.addEventListener('pause',()=>{
    if (focusTrack.paused && focusPlayback === 'playing') {
      focusPlayback = 'paused';
      updateFocusAmbience();
    }
  });
  focusTrack.addEventListener('error',()=>{
    if (!focusTrack.error || focusPlayback !== 'playing') return;
    focusPlayback = 'error';
    updateFocusAmbience();
  });
}
