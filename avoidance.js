const avoidanceDays = new Map();
const avoidanceLabels = {kept:'По плану', off:'Не по плану'};
let editingAvoidanceId = '';

function avoidanceSummary(track, current) {
  const keptDays = Object.entries(track.entries).filter(([day,mark])=>mark === 'kept' && day >= track.start && day <= current)
    .map(([day])=>day).sort();
  let record = 0, streak = 0, previous = '';
  for (const day of keptDays) {
    streak = previous && dayDistance(previous,day) === 1 ? streak + 1 : 1;
    record = Math.max(record,streak);
    previous = day;
  }
  const todayUnmarked = !track.entries[current];
  const ongoing = previous && dayDistance(previous,current) <= Number(todayUnmarked) ? streak : 0;
  const periodStart = key(shift(new Date(current + 'T12:00:00'),-29));
  const periodDays = Math.max(0, Math.min(30, dayDistance(track.start,current) + 1));
  return {ongoing,record,periodDays,recent:keptDays.filter(day=>day >= periodStart).length,total:keptDays.length};
}

function avoidanceForm(track) {
  const current = key(new Date());
  return `<form class="avoidance-form" data-avoidance-form="${safe(track?.id || '')}">
    <label>Название<input name="name" required maxlength="80" placeholder="Без соцсетей после 22:00" value="${safe(track?.name || '')}"></label>
    ${track ? '' : `<label>Дата начала<input type="date" name="start" required min="1000-01-01" max="${current}" value="${current}"></label>`}
    <label>Цель, дней<input type="number" name="target" min="1" max="3650" required value="${track?.target || 30}"></label>
    <button type="submit" class="primary">${track ? 'Сохранить' : 'Добавить'}</button>
    ${track ? '<button type="button" data-avoidance-cancel>Отмена</button>' : ''}
  </form>`;
}

function avoidanceCard(track) {
  const id = safe(track.id);
  if (editingAvoidanceId === track.id) return `<article class="avoidance-card">${avoidanceForm(track)}</article>`;
  const current = key(new Date());
  const day = avoidanceDays.get(track.id) || current;
  const mark = track.entries[day];
  const {ongoing,record,recent,periodDays,total} = avoidanceSummary(track,current);
  const progress = Math.min(ongoing / track.target * 100,100);
  const days = Array.from({length:7},(_,index)=>shift(new Date(day + 'T12:00:00'),index - 6))
    .filter(date=> key(date) >= track.start);
  return `<article class="avoidance-card">
    <div class="avoidance-head"><h3>${safe(track.name)}</h3><button type="button" data-avoidance-edit="${id}">Изменить</button>
      <button type="button" data-avoidance-delete="${id}" aria-label="Удалить: ${safe(track.name)}">×</button></div>
    <div class="avoidance-stats"><div class="avoidance-ring" style="--series-progress:${progress}%" aria-label="Текущая серия ${ongoing} из ${track.target} дней">
      <div><small>Серия</small><strong>${ongoing}</strong><small>из ${track.target} дн.</small></div></div>
      <dl class="avoidance-totals">
        <div><dt>Лучшая серия</dt><dd>${record} дн.</dd></div>
        <div><dt>За 30 дней</dt><dd>${recent} из ${periodDays}</dd></div>
        <div><dt>Всего дней без привычки</dt><dd>${total}</dd></div>
      </dl></div>
    <div class="avoidance-days" role="group" aria-label="Отметки за семь дней">${days.map(date=>{
      const dayKey = key(date);
      const value = track.entries[dayKey];
      return `<button type="button" class="${value || ''}" data-avoidance-day="${dayKey}" data-track="${id}"
        aria-pressed="${dayKey === day}" aria-label="${short(date)} · ${avoidanceLabels[value] || 'Без отметки'}"><span>${date.getDate()}</span><b aria-hidden="true">${value === 'kept' ? '✓' : value === 'off' ? '–' : '·'}</b></button>`;
    }).join('')}</div>
    <label class="avoidance-date">Дата отметки<input type="date" data-avoidance-date="${id}" min="${safe(track.start)}" max="${current}" value="${safe(day)}"></label>
    <div class="avoidance-marks" role="group" aria-label="Как прошёл день">
      ${Object.entries(avoidanceLabels).map(([value,label])=>`<button type="button" data-avoidance-mark="${value}" data-track="${id}" aria-pressed="${value === mark}">${label}</button>`).join('')}
      ${mark ? `<button type="button" data-avoidance-clear="${id}">Снять отметку</button>` : ''}
    </div>
  </article>`;
}

function avoidanceScreen() {
  const tracks = state.avoidanceTracks || [];
  return `<section class="panel avoidance-panel" id="avoidance" aria-labelledby="avoidance-title">
    <h2 id="avoidance-title">Дни без вредных привычек</h2>
    <p class="muted">Отмечай дни без привычки и следи за своей серией.</p>
    <details class="avoidance-create"><summary>＋ Новый отсчёт</summary>${avoidanceForm()}</details>
    ${tracks.length ? `<div class="avoidance-grid">${tracks.map(avoidanceCard).join('')}</div>` : ''}
  </section>`;
}

function updateAvoidancePanel(selector) {
  $('avoidance').outerHTML = avoidanceScreen();
  if (selector) $('avoidance').querySelector(selector)?.focus({preventScroll:true});
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
  if (!name || !Number.isInteger(target) || target < 1 || target > 3650) return;
  const tracks = state.avoidanceTracks || [];
  const existing = tracks.find(track=>track.id === form.dataset.avoidanceForm);
  if (!existing && (!fields.start?.value || fields.start.value > key(new Date()))) return;
  const track = existing ? {...existing,name,target} : {id:crypto.randomUUID(),name,target,start:fields.start.value,entries:{}};
  if (!saveAvoidance(existing ? tracks.map(item=>item === existing ? track : item) : [...tracks,track])) return;
  editingAvoidanceId = '';
  updateAvoidancePanel(`[data-avoidance-edit="${CSS.escape(track.id)}"]`);
  feedback(existing ? 'Отсчёт обновлён' : 'Отсчёт добавлен');
}

function changeAvoidanceDate(field) {
  if (!field.dataset.avoidanceDate || !field.value || !field.validity.valid) return;
  avoidanceDays.set(field.dataset.avoidanceDate,field.value);
  updateAvoidancePanel(`[data-avoidance-date="${CSS.escape(field.dataset.avoidanceDate)}"]`);
}

function avoidanceClick(button) {
  const data = button.dataset;
  if (button.hasAttribute('data-avoidance-cancel')) {
    const id = editingAvoidanceId;
    editingAvoidanceId = '';
    updateAvoidancePanel(`[data-avoidance-edit="${CSS.escape(id)}"]`);
    return true;
  }
  const id = data.track || data.avoidanceEdit || data.avoidanceDelete || data.avoidanceClear;
  const tracks = state.avoidanceTracks || [];
  const track = tracks.find(item=>item.id === id);
  if (!track) return false;
  const selectorId = CSS.escape(id);
  if (data.avoidanceDay) {
    avoidanceDays.set(id,data.avoidanceDay);
    updateAvoidancePanel(`[data-track="${selectorId}"][data-avoidance-day="${data.avoidanceDay}"]`);
  } else if (data.avoidanceEdit) {
    editingAvoidanceId = id;
    updateAvoidancePanel(`[data-avoidance-form="${selectorId}"] input`);
  } else if (data.avoidanceDelete) {
    if (confirm(`Удалить отсчёт «${track.name}» со всеми отметками?`) && saveAvoidance(tracks.filter(item=>item !== track))) {
      avoidanceDays.delete(id);
      updateAvoidancePanel('.avoidance-create summary');
    }
  } else {
    const current = key(new Date());
    const day = avoidanceDays.get(id) || current;
    if (day < track.start || day > current) return true;
    const entries = {...track.entries};
    if (data.avoidanceClear) delete entries[day];
    else entries[day] = data.avoidanceMark;
    if (saveAvoidance(tracks.map(item=>item === track ? {...track,entries} : item))) {
      updateAvoidancePanel(`[data-track="${selectorId}"][data-avoidance-mark="${data.avoidanceMark || 'kept'}"]`);
    }
  }
  return true;
}
