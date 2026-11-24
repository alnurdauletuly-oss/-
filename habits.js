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

function habitPaused(habit, day) {
  return habit.paused?.includes(day) && !habit.done.includes(day);
}

function habitScheduled(habit, date) {
  const day = key(date);
  return !habitPaused(habit, day) && (habit.done.includes(day) || ((!habit.created || day >= habit.created) && habit.days.includes(weekday(date))));
}

function habitStreak(habit, elapsed) {
  const completed = new Set(habit.done);
  let count = 0;
  for (const date of elapsed.slice().reverse()) {
    const day = key(date);
    if (!completed.has(day)) {
      if (day === key(today)) continue;
      break;
    }
    count++;
  }
  return count;
}

function habitSummary(habit, days) {
  const elapsed = days.filter(date => date <= today && habitScheduled(habit, date));
  const done = elapsed.filter(date => habit.done.includes(key(date))).length;
  const percent = elapsed.length ? Math.round(done / elapsed.length * 100) : null;
  return {done, count:elapsed.length, percent, streak:habitStreak(habit, elapsed)};
}

function habitRow({habit, color, percent, streak}, dates) {
  const completed = dates.map(date => habit.done.includes(key(date)));
  const cells = dates.map((date, index) => {
    const day = key(date);
    const checked = completed[index];
    if (habitPaused(habit, day)) return '<td class="habit-day habit-paused" aria-label="Пауза" title="Пауза"><span aria-hidden="true">Ⅱ</span></td>';
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

function victorySeries(dates) {
  const todayKey = key(today);
  const days = dates.map(date => {
    const {planned, percent, paused} = dailyProductivity(date);
    const day = key(date);
    return {date, day, planned, paused:!planned && paused > 0, won: day <= todayKey && planned > 0 && percent >= 70};
  });
  let count = 0;
  for (const {day, planned, won} of days.slice().reverse()) {
    if (day > todayKey || !planned || (day === todayKey && !won)) continue;
    if (!won) break;
    count++;
  }
  const word = count % 10 === 1 && count % 100 !== 11 ? 'день' :
    count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'дня' : 'дней';
  const monthly = dates.length > 7;
  return `<section class="victory-panel ${monthly ? 'victory-month' : ''}">
    <div><span class="victory-eyebrow">СЕРИЯ ПОБЕД</span><div class="victory-count"><strong>${count}</strong><span>${word} подряд</span></div>
    <p>Победа — от 70% привычек за день. Свободные дни сохраняют серию.</p></div>
    <div class="victory-days" role="group" aria-label="Победы за выбранный период">${days.map(({date, day, won, paused}) =>
      `<div class="${won ? 'won' : ''} ${day === todayKey ? 'current' : ''}" role="group" aria-label="${short(date)}, ${won ? 'победа' : paused ? 'пауза' : 'без победы'}"><span>${monthly ? date.getDate() : weekdays[weekday(date)]}</span><b aria-hidden="true">${won ? '🔥' : paused ? 'Ⅱ' : '·'}</b></div>`
    ).join('')}</div>
  </section>`;
}

function mobileHabits(dates, rows) {
  const selected = key(focusDate);
  const current = key(today);
  const {done, planned} = dailyProductivity(focusDate);
  const days = dates.map(date => {
    const day = key(date);
    const progress = dailyProductivity(date);
    return `<button type="button" data-habit-day="${day}" aria-pressed="${day === selected}" ${day === current ? 'aria-current="date"' : ''}
      aria-label="${short(date)}, ${progress.done} из ${progress.planned} выполнено">
      <small>${weekdays[weekday(date)]}</small><strong>${date.getDate()}</strong>
      <span aria-hidden="true" class="habit-day-dot ${progress.planned && progress.done === progress.planned ? 'all-done' : progress.done ? 'some-done' : ''}"></span>
    </button>`;
  }).join('');
  const list = rows.filter(({habit}) => habitScheduled(habit, focusDate) || habitPaused(habit, selected)).map(({habit, color, streak}) => {
    const paused = habitPaused(habit, selected);
    const checked = habit.done.includes(selected);
    const name = safe(habit.name);
    const id = safe(habit.id);
    const title = `<span class="mobile-habit-title"><strong>${name}</strong>${habit.description ? `<small>${safe(habit.description)}</small>` : ''}${paused ? '<small class="habit-paused">На паузе</small>' : ''}</span>`;
    return `<li class="mobile-habit" style="--habit-color:${color}">
      ${paused ? `<div class="mobile-habit-mark"><span aria-hidden="true" class="habit-paused">Ⅱ</span>${title}</div>` :
        `<label class="mobile-habit-mark"><input class="check" type="checkbox" data-habit="${id}" data-date="${selected}" ${checked ? 'checked' : ''}>${title}</label>`}
      <div class="mobile-habit-actions">
        ${streak ? `<span class="habit-streak is-lit" aria-label="Серия: ${streak}"><span aria-hidden="true">🔥</span> ${streak}</span>` : ''}
        ${selected === current && !checked ? `<button type="button" data-habit-pause="${id}" aria-label="${paused ? 'Возобновить' : 'Пауза на сегодня'} — ${name}">${paused ? 'Возобновить' : 'Пауза'}</button>` : ''}
        <button type="button" data-habit-edit="${id}" aria-label="Изменить привычку: ${name}">⋯</button>
      </div>
    </li>`;
  }).join('');
  return `<section class="mobile-habits" aria-label="Привычки по дням">
    <div class="mobile-habit-days ${dates.length > 7 ? 'is-month' : ''}" style="--month-start:${weekday(dates[0]) + 1}" aria-label="Дни периода">${days}</div>
    <div class="mobile-habit-summary"><h2>${selected === current ? 'Сегодня' : short(focusDate)}</h2><span>${done} из ${planned}</span></div>
    ${list ? `<ul class="mobile-habit-list">${list}</ul>` : '<p class="orbit-empty">На этот день нет привычек.</p>'}
  </section>`;
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
    ${rows.length ? mobileHabits(dates, rows) : ''}
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
  </div>${victorySeries(dates)}${lineChart(dates)}`;
}

function habitsClick(button) {
  const {habitRange:range, habitEdit:id} = button.dataset;
  if (range) {
    habitRange = range;
    render();
    $('view').querySelector(`[data-habit-range="${range}"]`)?.focus({preventScroll:true});
    return true;
  }
  if (button.dataset.habitDay) {
    focusDate = new Date(button.dataset.habitDay + 'T12:00:00');
    render();
    $('view').querySelector('[data-habit-day][aria-pressed="true"]')?.focus({preventScroll:true});
    return true;
  }
  const paused = button.dataset.habitPause;
  if (paused) {
    const habit = state.habits.find(item => item.id === paused);
    if (toggleHabitPause(habit)) {
      render();
      $('view').querySelector(`[data-habit-pause="${CSS.escape(paused)}"]`)?.focus({preventScroll:true});
    }
    return true;
  }
  const habit = state.habits.find(item => item.id === id);
  if (!habit) return false;
  openEditor('habit', key(focusDate), {habit});
  return true;
}

function canToggleHabitPause(habit, date) {
  const day = key(date);
  return habit && !habit.done.includes(day) && (habitScheduled(habit, date) || habitPaused(habit, day));
}

function toggleHabitPause(habit) {
  const now = new Date();
  if (!canToggleHabitPause(habit, now)) return false;
  const day = key(now);
  const previous = habit.paused;
  habit.paused = habitPaused(habit, day) ? previous.filter(item => item !== day) : [...(previous || []), day];
  if (save()) return true;
  habit.paused = previous;
  return false;
}

function updateHabitPauseButton(habit) {
  const button = $('habit-pause');
  const now = new Date();
  button.hidden = !canToggleHabitPause(habit, now);
  button.textContent = habit && habitPaused(habit, key(now)) ? 'Возобновить сегодня' : 'Пауза на сегодня';
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
