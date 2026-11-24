const habitColors = ['#bbf029','#4edac8','#a59bff','#ff9b77','#f581b4','#79bfff'];
let habitOrder = 'added';
let habitRange = 'week';
let lastHabitMark = null;

function habitColor(habit, index) {
  return /^#[\da-f]{6}$/i.test(habit.color || '') ? habit.color : habitColors[index % habitColors.length];
}

function habitDates() {
  if (habitRange === 'week') return week(focusDate);
  const year = focusDate.getFullYear(), month = focusDate.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({length:count}, (_, index) => new Date(year, month, index + 1, 12));
}

function habitScheduled(habit, date) {
  const day = key(date);
  return habit.done.includes(day) || ((!habit.created || day >= habit.created) && habit.days.includes(weekday(date)));
}

function habitStreak(habit) {
  let cursor = new Date(today);
  if (!habit.done.includes(key(cursor))) cursor = shift(cursor, -1);
  let count = 0;
  const completed = new Set(habit.done);
  if (!habit.days.length) return 0;
  while (!habitScheduled(habit, cursor) && (!habit.created || key(cursor) >= habit.created)) cursor = shift(cursor, -1);
  while (habitScheduled(habit, cursor)) {
    if (!completed.has(key(cursor))) return count;
    count++;
    cursor = shift(cursor, -1);
    while (!habitScheduled(habit, cursor) && (!habit.created || key(cursor) >= habit.created)) cursor = shift(cursor, -1);
  }
  return count;
}

function habitSummary(habit, days) {
  const elapsed = days.filter(date => date <= today && habitScheduled(habit, date));
  const done = elapsed.filter(date => habit.done.includes(key(date))).length;
  const percent = elapsed.length ? Math.round(done / elapsed.length * 100) : null;
  return {done, count:elapsed.length, percent, streak:habitStreak(habit)};
}

function habitRow({habit, color, percent, streak}, dates) {
  const completed = dates.map(date => habit.done.includes(key(date)));
  const cells = dates.map((date, index) => {
    const day = key(date);
    const checked = completed[index];
    if (!habitScheduled(habit, date)) return '<td class="habit-day habit-rest" aria-label="Свободный день">·</td>';
    const classes = [checked && completed[index - 1] && 'join-left', checked && completed[index + 1] && 'join-right'];
    if (lastHabitMark?.id === habit.id && lastHabitMark.date === day) classes.push('just-marked');
    return `<td class="habit-day ${classes.filter(Boolean).join(' ')}"><label class="habit-orbit">
      <input type="checkbox" data-habit="${safe(habit.id)}" data-date="${day}" aria-label="${safe(habit.name)}, ${short(date)}" ${checked ? 'checked' : ''}>
      <span aria-hidden="true"></span>
    </label></td>`;
  }).join('');
  return `<tr style="--habit-color:${color}">
    <th scope="row" class="habit-name"><button type="button" data-habit-edit="${safe(habit.id)}" aria-label="Изменить привычку: ${safe(habit.name)}"><i aria-hidden="true"></i><span>${safe(habit.name)}${habit.description ? `<small>${safe(habit.description)}</small>` : ''}</span></button></th>
    ${cells}<td class="habit-score"><span class="habit-streak ${streak ? 'is-lit' : ''}" aria-label="Серия: ${streak}"><span aria-hidden="true">🔥</span> ${streak}</span><strong>${percent === null ? '—' : percent+'%'}</strong></td>
  </tr>`;
}

function habitsScreen() {
  const dates = habitDates();
  const rows = state.habits.map((habit,index) => ({habit, color:habitColor(habit,index), ...habitSummary(habit,dates)}));
  if (habitOrder === 'name') rows.sort((a,b) => a.habit.name.localeCompare(b.habit.name, 'ru'));
  if (habitOrder === 'progress') rows.sort((a,b) => (b.percent ?? -1) - (a.percent ?? -1));
  if (habitOrder === 'streak') rows.sort((a,b) => b.streak - a.streak);
  const measured = rows.filter(row => row.percent !== null).sort((a,b) => b.percent - a.percent);
  const average = measured.length ? Math.round(measured.reduce((sum,row) => sum + row.done / row.count,0) / measured.length * 100) : null;
  const marks = state.habits.reduce((sum,habit) => sum + habit.done.filter(day => day <= key(today)).length, 0);
  const level = 1 + Math.floor(marks / 10);
  const metric = (label, row) => `<article class="panel orbit-stat"><span>${label}</span><strong>${row ? row.percent+'%' : '—'}</strong>${row ? `<p style="--habit-color:${row.color}">${safe(row.habit.name)}</p>` : ''}</article>`;
  return `<section class="panel orbit-panel">
    <div class="orbit-tools"><div class="orbit-range" aria-label="Период">${[['week','Неделя'],['month','Месяц']].map(([range,label]) => `<button type="button" data-habit-range="${range}" aria-pressed="${habitRange === range}">${label}</button>`).join('')}</div>
    <label>Порядок <select id="habit-order" aria-label="Сортировка привычек">${[['added','По добавлению'],['name','По названию'],['progress','По выполнению'],['streak','По серии']].map(([value,label]) => `<option value="${value}" ${habitOrder === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
    ${rows.length ? `<div class="orbit-scroll" id="orbit-scroll"><table class="orbit-table" aria-label="Отметки привычек по дням">
      <thead><tr><th scope="col" class="habit-name">Привычка</th>${dates.map(date => `<th scope="col" class="habit-day ${key(date)===key(today) ? 'is-today' : ''}">${date.getDate()}<small>${weekdays[weekday(date)]}</small></th>`).join('')}<th scope="col" class="habit-score">Серия и итог</th></tr></thead>
      <tbody>${rows.map(row => habitRow(row,dates)).join('')}</tbody>
      <tfoot><tr><th scope="row" class="habit-name">Выполнено</th>${dates.map(date => `<td class="habit-day">${dailyProductivity(date).done || '·'}</td>`).join('')}<td class="habit-score">${rows.reduce((sum,row) => sum + row.done,0)} отметок</td></tr></tfoot>
    </table></div>` : '<p class="orbit-empty">Добавь первую привычку, чтобы начать.</p>'}
    <button type="button" class="orbit-add" data-advanced-habit>＋ Добавить привычку</button>
  </section>
  <div class="orbit-stats" aria-label="Статистика за выбранный период">
    ${metric('Лучше всего получается', measured[0])}
    ${metric('Требует внимания', measured.length > 1 ? measured.at(-1) : null)}
    <article class="panel orbit-stat"><span>Среднее по привычкам</span><strong>${average === null ? '—' : average+'%'}</strong><p>${measured.length} в расчёте</p></article>
    <article class="panel orbit-stat"><span>Общий уровень</span><strong>${level}</strong><progress aria-label="Отметки до следующего уровня" value="${marks % 10}" max="10"></progress><p>${10 - marks % 10} до следующего</p></article>
  </div>${victorySeries()}${lineChart(dates)}`;
}

function habitsClick(button) {
  const {habitRange:range, habitEdit:id} = button.dataset;
  if (range) {
    habitRange = range;
    render();
    $('view').querySelector(`[data-habit-range="${range}"]`)?.focus({preventScroll:true});
    return true;
  }
  const habit = state.habits.find(item => item.id === id);
  if (!habit) return false;
  openEditor('habit', key(focusDate), {habit});
  return true;
}

function saveHabit(name, habit) {
  const days = Array.from($('schedule').querySelectorAll(':checked'), box => Number(box.value));
  if (!days.length) {
    const first = $('schedule').querySelector('input');
    first.setCustomValidity('Выберите день');
    first.reportValidity();
    return false;
  }
  const fields = {name, days, description:$('habit-description').value.trim(), color:$('habit-color').value};
  if (habit) Object.assign(habit, fields);
  else state.habits.push({id:crypto.randomUUID(), created:key(today), done:[], ...fields});
  return true;
}
