const avoidanceDays = new Map();
const avoidanceLabels = {kept:'День без привычки', off:'Привычка была'};
const avoidanceDayCount = new Intl.NumberFormat('ru-RU', {style:'unit', unit:'day', unitDisplay:'long'});

function avoidanceSummary(track, current) {
  const keptDays = Object.entries(track.entries).filter(([day,mark]) => mark === 'kept' && day >= track.start && day <= current)
    .map(([day]) => day).sort();
  let record = 0, streak = 0, previous = '';
  for (const day of keptDays) {
    streak = previous && dayDistance(previous,day) === 1 ? streak + 1 : 1;
    record = Math.max(record,streak);
    previous = day;
  }
  const todayUnmarked = !track.entries[current];
  const ongoing = previous && dayDistance(previous,current) <= Number(todayUnmarked) ? streak : 0;
  const offDays = Object.entries(track.entries).filter(([day,mark]) => mark === 'off' && day >= track.start && day <= current).length;
  return {ongoing,record,offDays};
}

function avoidanceForm(track) {
  const current = key(new Date());
  const target = `<label>Цель в днях подряд<input type="number" name="target" min="1" max="3650" required value="${track?.target || 30}"></label>`;
  return `<form class="avoidance-form" data-avoidance-form="${safe(track?.id || '')}">
    <label>${track ? 'Название счётчика' : 'Без чего хочешь провести день?'}
      <input name="name" required maxlength="80" placeholder="Например, без телефона перед сном" value="${safe(track?.name || '')}">
    </label>
    ${track ? target : `<details class="avoidance-options"><summary>Настроить дату начала и цель</summary>
      <div class="avoidance-options-fields">
        <label>С какого дня начать?<input type="date" name="start" required min="1000-01-01" max="${current}" value="${current}"></label>
        ${target}
      </div>
    </details>`}
    <button type="submit" class="primary">${track ? 'Сохранить' : 'Начать'}</button>
  </form>`;
}

function avoidanceSelectedDay(track, current) {
  const selected = avoidanceDays.get(track.id);
  return selected && selected >= track.start && selected <= current ? selected : current;
}

function avoidanceMarkButtons(track, day, context) {
  const id = safe(track.id);
  const mark = track.entries[day];
  const isToday = context === 'today';
  return `<div class="avoidance-marks" role="group" aria-label="${isToday ? 'Отметить сегодня' : 'Отметить выбранный день'}">
    ${Object.entries(avoidanceLabels).map(([value,label]) => `<button type="button"
      class="${value === 'kept' && (!mark || mark === value) ? 'primary' : ''}" data-avoidance-mark="${value}"
      data-track="${id}" data-avoidance-context="${context}" aria-pressed="${value === mark}">${isToday && value === 'kept' ? 'Сегодня без привычки' : label}</button>`).join('')}
    ${mark ? `<button type="button" class="avoidance-clear" data-avoidance-clear="${id}" data-avoidance-context="${context}">Убрать отметку</button>` : ''}
  </div>`;
}

function avoidanceWeek(track, current, selected) {
  const id = safe(track.id);
  const days = Array.from({length:7},(_,index) => shift(new Date(current + 'T12:00:00'),index - 6));
  return `<section class="avoidance-week"><h4>Последние 7 дней</h4>
    <div class="avoidance-days" role="group" aria-label="Отметки за последние 7 дней">${days.map(date => {
        const dayKey = key(date);
        const value = track.entries[dayKey];
        const beforeStart = dayKey < track.start;
        return `<button type="button" class="${value || ''}${dayKey === current ? ' is-today' : ''}" data-avoidance-day="${dayKey}" data-track="${id}"
          ${beforeStart ? 'disabled' : ''} ${dayKey === current ? 'aria-current="date"' : ''}
          aria-pressed="${dayKey === selected}" aria-label="${short(date)} · ${beforeStart ? 'До начала' : avoidanceLabels[value] || 'Без отметки'}">
          <small>${weekdays[weekday(date)]}</small><b aria-hidden="true">${value === 'kept' ? '✓' : value === 'off' ? '—' : '·'}</b><span>${date.getDate()}</span>
        </button>`;
    }).join('')}</div>
    ${selected !== current ? `<div class="avoidance-day-editor">
      <p>${fmt(new Date(selected + 'T12:00:00'), {day:'numeric', month:'long'})} <strong>${avoidanceLabels[track.entries[selected]] || 'Без отметки'}</strong></p>
      ${avoidanceMarkButtons(track,selected,'history')}
    </div>` : ''}
    <details class="avoidance-history"><summary>Выбрать другую дату</summary>
      <label class="avoidance-date">Дата отметки<input type="date" data-avoidance-date="${id}" min="${safe(track.start)}" max="${current}" value="${selected}"></label>
    </details>
  </section>`;
}

function avoidanceCard(track) {
  const id = safe(track.id);
  const current = key(new Date());
  const stats = avoidanceSummary(track,current);
  const progress = Math.min(stats.ongoing / track.target, 1);
  const dayUnit = avoidanceDayCount.formatToParts(stats.ongoing).find(part => part.type === 'unit').value;
  const selected = avoidanceSelectedDay(track,current);
  return `<article class="avoidance-card" data-avoidance-card="${id}">
    <div class="avoidance-hero">
      <h3>${safe(track.name)}</h3>
      <div class="avoidance-orbit" style="--orbit-progress:${progress * 100}%" role="img"
        aria-label="${avoidanceDayCount.format(stats.ongoing)} подряд без привычки. Цель — ${avoidanceDayCount.format(track.target)}.">
        <div class="avoidance-orbit-core" aria-hidden="true"><strong>${stats.ongoing}</strong> <span>${dayUnit} подряд</span></div>
        ${progress ? `<i style="--orbit-angle:${progress * 360}deg" aria-hidden="true"></i>` : ''}
      </div>
      <p class="avoidance-target">${progress === 1 ? 'Цель выполнена · ' : 'Цель · '}${avoidanceDayCount.format(track.target)} подряд</p>
    </div>
    <dl class="avoidance-totals">
      <div><dt>Лучшая серия</dt><dd>${avoidanceDayCount.format(stats.record)}</dd></div>
      <div><dt>Дней с привычкой</dt><dd>${stats.offDays}</dd></div>
    </dl>
    ${track.start <= current ? `<div class="avoidance-today">
      <p class="avoidance-status">Сегодня <strong>${avoidanceLabels[track.entries[current]] || 'Ещё не отмечено'}</strong></p>
      ${avoidanceMarkButtons(track,current,'today')}
    </div>${avoidanceWeek(track,current,selected)}` : `<p class="muted">Начнёшь ${fmt(new Date(track.start + 'T12:00:00'), {day:'numeric',month:'long'})}</p>`}
    <details class="avoidance-settings">
      <summary>Настройки привычки</summary>
      <div class="avoidance-details">
        ${avoidanceForm(track)}
        <button type="button" data-avoidance-delete="${id}">Удалить привычку</button>
      </div>
    </details>
  </article>`;
}

function avoidanceScreen() {
  const tracks = state.avoidanceTracks || [];
  return `<section class="panel avoidance-panel" id="avoidance" aria-labelledby="avoidance-title">
    <h2 id="avoidance-title">Дни без вредных привычек</h2>
    <details class="avoidance-create" ${tracks.length ? '' : 'open'}><summary>＋ Новый счётчик</summary>${avoidanceForm()}</details>
    <div class="avoidance-grid">${tracks.map(avoidanceCard).join('')}</div>
  </section>`;
}

function updateAvoidanceCard(track, selector, closeSettings = false) {
  const cardSelector = `[data-avoidance-card="${CSS.escape(track.id)}"]`;
  const old = $('avoidance').querySelector(cardSelector);
  const historyOpen = old.querySelector('.avoidance-history')?.open;
  const settings = old.querySelector('.avoidance-settings');
  old.outerHTML = avoidanceCard(track);
  const card = $('avoidance').querySelector(cardSelector);
  const history = card.querySelector('.avoidance-history');
  if (history) history.open = Boolean(historyOpen);
  if (settings.open && !closeSettings) card.querySelector('.avoidance-settings').replaceWith(settings);
  card.querySelector(selector)?.focus({preventScroll:true});
}

function saveAvoidance(tracks) {
  if (!save({...state,avoidanceTracks:tracks})) return false;
  state.avoidanceTracks = tracks;
  return true;
}

function submitAvoidance(event) {
  const form = event.target;
  if (!form.hasAttribute('data-avoidance-form')) return;
  event.preventDefault();
  const fields = form.elements;
  const name = fields.name.value.trim(), target = fields.target.valueAsNumber;
  if (!name) {
    feedback('Введи название привычки');
    fields.name.focus();
    return;
  }
  if (!Number.isInteger(target) || target < 1 || target > 3650) return;
  const tracks = state.avoidanceTracks || [];
  const existing = tracks.find(track => track.id === form.dataset.avoidanceForm);
  if (!existing && (!fields.start?.value || fields.start.value > key(new Date()))) return;
  const track = existing ? {...existing,name,target} : {id:crypto.randomUUID(),name,target,start:fields.start.value,entries:{}};
  if (!saveAvoidance(existing ? tracks.map(item => item === existing ? track : item) : [...tracks,track])) return;
  if (existing) {
    updateAvoidanceCard(track,'.avoidance-settings summary',true);
  } else {
    form.reset();
    form.querySelector('.avoidance-options').open = false;
    form.closest('.avoidance-create').open = false;
    const grid = $('avoidance').querySelector('.avoidance-grid');
    grid.insertAdjacentHTML('beforeend',avoidanceCard(track));
    grid.lastElementChild.querySelector('[data-avoidance-mark]')?.focus();
  }
  feedback(existing ? 'Настройки сохранены' : 'Привычка добавлена');
}

function changeAvoidanceDate(field) {
  if (!field.dataset.avoidanceDate || !field.value || !field.validity.valid) return;
  const track = state.avoidanceTracks?.find(item => item.id === field.dataset.avoidanceDate);
  if (!track) return;
  avoidanceDays.set(track.id,field.value);
  updateAvoidanceCard(track,'[data-avoidance-date]');
}

function avoidanceClick(button) {
  const data = button.dataset;
  if (!data.avoidanceDay && !data.avoidanceMark && !data.avoidanceClear && !data.avoidanceDelete) return false;
  const id = data.track || data.avoidanceDelete || data.avoidanceClear;
  const tracks = state.avoidanceTracks || [];
  const track = tracks.find(item => item.id === id);
  if (!track) return false;
  if (data.avoidanceDay) {
    avoidanceDays.set(id,data.avoidanceDay);
    updateAvoidanceCard(track,`[data-avoidance-day="${data.avoidanceDay}"]`);
    return true;
  }
  if (data.avoidanceDelete) {
    if (confirm(`Удалить «${track.name}» и все отметки?`) && saveAvoidance(tracks.filter(item => item !== track))) {
      avoidanceDays.delete(id);
      button.closest('.avoidance-card').remove();
      const create = $('avoidance').querySelector('.avoidance-create');
      if (tracks.length === 1) create.open = true;
      create.querySelector('summary').focus();
    }
    return true;
  }
  const current = key(new Date());
  const context = data.avoidanceContext === 'today' ? 'today' : 'history';
  const day = context === 'today' ? current : avoidanceSelectedDay(track,current);
  if (day < track.start || day > current || (!data.avoidanceClear && !Object.hasOwn(avoidanceLabels,data.avoidanceMark))) return true;
  const entries = {...track.entries};
  if (data.avoidanceClear) delete entries[day];
  else entries[day] = data.avoidanceMark;
  const updated = {...track,entries};
  if (saveAvoidance(tracks.map(item => item === track ? updated : item))) {
    updateAvoidanceCard(updated,`[data-avoidance-context="${context}"][data-avoidance-mark="${data.avoidanceMark || 'kept'}"]`);
    feedback(data.avoidanceClear ? 'Отметка убрана' : 'День отмечен');
  }
  return true;
}
