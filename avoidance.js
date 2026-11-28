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
  const periodStart = key(shift(new Date(current + 'T12:00:00'),-29));
  return {ongoing,record,recent:keptDays.filter(day => day >= periodStart).length,total:keptDays.length};
}

function avoidanceForm(track) {
  const current = key(new Date());
  const target = `<label>Цель в днях подряд<input type="number" name="target" min="1" max="3650" required value="${track?.target || 30}"></label>`;
  return `<form class="avoidance-form" data-avoidance-form="${safe(track?.id || '')}">
    <label>${track ? 'Название привычки' : 'От какой привычки хочешь отказаться?'}
      <input name="name" required maxlength="80" placeholder="Например, листать телефон перед сном" value="${safe(track?.name || '')}">
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
  return `<div class="avoidance-marks" role="group" aria-label="${context === 'today' ? 'Отметить сегодня' : 'Отметить выбранный день'}">
    ${Object.entries(avoidanceLabels).map(([value,label]) => `<button type="button"
      class="${value === 'kept' && (!mark || mark === value) ? 'primary' : ''}" data-avoidance-mark="${value}"
      data-track="${id}" data-avoidance-context="${context}" aria-pressed="${value === mark}">${label}</button>`).join('')}
    ${context === 'history' && mark ? `<button type="button" data-avoidance-clear="${id}">Убрать отметку</button>` : ''}
  </div>`;
}

function avoidanceHistory(track, current, {record,recent,total}) {
  const id = safe(track.id);
  const day = avoidanceSelectedDay(track,current);
  const lastDay = dayDistance(day,current) < 7 ? current : day;
  const days = Array.from({length:7},(_,index) => shift(new Date(lastDay + 'T12:00:00'),index - 6))
    .filter(date => key(date) >= track.start);
  return `<details class="avoidance-history">
    <summary>Прошлые дни и статистика</summary>
    <div class="avoidance-details">
      <div class="avoidance-days" role="group" aria-label="Дни для отметки">${days.map(date => {
        const dayKey = key(date);
        const value = track.entries[dayKey];
        return `<button type="button" class="${value || ''}" data-avoidance-day="${dayKey}" data-track="${id}"
          aria-pressed="${dayKey === day}" aria-label="${short(date)} · ${avoidanceLabels[value] || 'Без отметки'}">
          <span>${date.getDate()}</span><b aria-hidden="true">${value === 'kept' ? '✓' : value === 'off' ? '—' : '·'}</b>
        </button>`;
      }).join('')}</div>
      <label class="avoidance-date">Выбрать дату<input type="date" data-avoidance-date="${id}" min="${safe(track.start)}" max="${current}" value="${day}"></label>
      <p>${fmt(new Date(day + 'T12:00:00'), {day:'numeric', month:'long'})} <strong>${avoidanceLabels[track.entries[day]] || 'Без отметки'}</strong></p>
      ${avoidanceMarkButtons(track,day,'history')}
      <dl class="avoidance-totals">
        <div><dt>Лучший результат подряд</dt><dd>${avoidanceDayCount.format(record)}</dd></div>
        <div><dt>Дней без привычки за последние 30 дней</dt><dd>${recent}</dd></div>
        <div><dt>Всего дней без привычки</dt><dd>${total}</dd></div>
      </dl>
    </div>
  </details>`;
}

function avoidanceCard(track) {
  const id = safe(track.id);
  const current = key(new Date());
  const stats = avoidanceSummary(track,current);
  const goal = avoidanceDayCount.format(track.target);
  return `<article class="avoidance-card" data-avoidance-card="${id}">
    <h3>${safe(track.name)}</h3>
    ${track.start <= current ? `<div class="avoidance-today">
      <p class="avoidance-status">Сегодня <strong>${avoidanceLabels[track.entries[current]] || 'Без отметки'}</strong></p>
      ${avoidanceMarkButtons(track,current,'today')}
    </div>` : `<p class="muted">Начнёшь ${fmt(new Date(track.start + 'T12:00:00'), {day:'numeric',month:'long'})}</p>`}
    <div class="avoidance-stats">
      <p><strong>${avoidanceDayCount.format(stats.ongoing)}</strong> подряд без привычки</p>
      <progress aria-label="Дни подряд без привычки" value="${Math.min(stats.ongoing,track.target)}" max="${track.target}"></progress>
      <p class="muted">Цель — ${goal} подряд</p>
    </div>
    ${track.start <= current ? avoidanceHistory(track,current,stats) : ''}
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
    <p class="muted">Добавь привычку, от которой хочешь отказаться. Каждый день отмечай, как прошло.</p>
    <details class="avoidance-create"><summary>＋ Добавить привычку</summary>${avoidanceForm()}</details>
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
      $('avoidance').querySelector('.avoidance-create summary').focus();
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
