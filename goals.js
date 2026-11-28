const goalModes = ['finish', 'stages', 'number'];
const goalTemplates = {
  product:{title:'Запустить продукт', criterion:'Первый пользователь попробовал рабочую версию',
    steps:['Описать проблему пользователя','Собрать прототип','Показать рабочую версию первому пользователю']},
  exam:{title:'Подготовиться к экзамену', criterion:'Пробный экзамен решён на нужный балл',
    steps:['Составить список тем','Закрыть слабые темы','Решить пробный вариант']},
  reading:{title:'Прочитать 12 книг', criterion:'В журнале чтения 12 прочитанных книг', target:12, unit:'книг',
    steps:['Составить список книг','Выбрать первую книгу']}
};
let editGoalId = null;
let editStepId = null;
let editMeasureId = null;
let goalAnalyticsDays = 7;
const goalReviewWeeks = new Map();

function goalMode(goal) { return goal.mode || 'stages'; }
function goalHref(id) { return id ? `#goals?goal=${encodeURIComponent(id)}` : '#goals'; }
function goalsInCreationOrder() { return [...state.goals].reverse(); }
function closeGoalEditors() { editGoalId = editStepId = editMeasureId = null; }

function goalSteps() {
  return state.goals.flatMap(goal => goal.steps.map(step => ({goal, step})));
}

function goalStepCheckbox(goal, step) {
  return `<input class="check" type="checkbox" aria-label="Выполнено: ${safe(step.text)}" data-goal-step="${safe(goal.id)}" data-step-id="${safe(step.id)}" ${step.done ? 'checked' : ''}>`;
}

function goalMeasures(goal) {
  return [...(goal.measurements || [])].sort((a,b) => a.date.localeCompare(b.date));
}

function milestone(step) { return step.milestone !== false; }

function goalResult(goal) {
  const mode = goalMode(goal);
  if (goal.completedAt) return 'Цель достигнута';
  if (mode === 'number') {
    const latest = goalMeasures(goal).at(-1);
    const label = goal.unit ? ` ${goal.unit}` : '';
    return latest ? `${latest.value} из ${goal.target}${label}` : `Цель · ${goal.target}${label}`;
  }
  const stages = mode === 'stages' ? goal.steps.filter(milestone) : [];
  const steps = stages.length ? stages : goal.steps;
  return steps.length ? `${steps.filter(step => step.done).length} из ${steps.length} ${stages.length ? 'этапов' : 'шагов'}` : 'В работе';
}

function goalPace(goal) {
  if (goalMode(goal) !== 'number') return '';
  if (!goal.date) return '<p class="muted">Добавь срок, чтобы увидеть темп.</p>';
  const measures = goalMeasures(goal).filter(item => item.date <= key(today));
  const first = measures[0], latest = measures.at(-1);
  const start = goal.startDate || first?.date;
  const baseline = goal.startValue ?? (goal.startDate ? 0 : first?.value);
  if (!start || !Number.isFinite(baseline)) return '<p class="muted">Укажи начало или добавь первый замер, чтобы рассчитать темп.</p>';
  const duration = dayDistance(start, goal.date);
  if (duration <= 0) return '<p class="muted">Для расчёта темпа срок должен быть позже начала.</p>';
  const fraction = Math.min(1, Math.max(0, dayDistance(start, key(today)) / duration));
  const expected = baseline + (goal.target - baseline) * fraction;
  const direction = goal.target >= baseline ? 1 : -1;
  const round = value => Number(value.toFixed(2));
  const amount = value => safe(round(value).toLocaleString('ru-RU'));
  const behind = latest && direction * (round(latest.value) - round(expected)) < 0;
  const status = latest && (direction * (latest.value - goal.target) >= 0 ? 'Целевое значение достигнуто' :
    behind ? 'Есть отставание' : 'По плану');
  const unit = goal.unit ? ` ${safe(goal.unit)}` : '';
  return `<div class="goal-pace"><h4>Темп к сроку</h4>
    <p>${latest ? `Последний замер · ${amount(latest.value)}${unit} · ${showGoalDate(latest.date)}` : 'Замеров пока нет'}</p>
    <p>По плану к сегодня · ${amount(expected)}${unit}</p>
    ${status ? `<span class="goal-pace-status ${behind ? 'behind' : ''}">${status}</span>` : ''}</div>`;
}

function goalHabitIds(goal) {
  return Array.isArray(goal.habitIds) ? goal.habitIds : goal.habitId ? [goal.habitId] : [];
}

function goalHabitLink(ids) {
  return {habitIds:[...new Set(ids)], habitId:undefined};
}

function goalHabits(goal) {
  const ids = new Set(goalHabitIds(goal));
  return state.habits.filter(habit => ids.has(habit.id));
}

function focusGoalHabit(goalId, habitId) {
  const section = $('view').querySelector(`[data-goal-habits="${CSS.escape(goalId)}"]`);
  const edit = habitId && section?.querySelector(`[data-goal-edit-habit][data-habit-id="${CSS.escape(habitId)}"]`);
  (edit || section?.querySelector('[data-goal-habit], [data-goal-add-habit]'))?.focus({preventScroll:true});
}

function goalHabitWeek(goal, habit, dates) {
  const id = safe(goal.id), habitId = safe(habit.id);
  const scheduled = dates.filter(date => habitScheduled(habit,date));
  const done = scheduled.filter(date => habit.done.includes(key(date))).length;
  const color = habitColor(habit,state.habits.indexOf(habit));
  const cue = habit.trigger || (habit.days.length === 7 ? 'Каждый день' : weekdays.filter((_,day) => habit.days.includes(day)).join(', ') || 'По плану');
  return `<article class="goal-habit" style="--habit-color:${color}">
    <div class="goal-habit-sequence">
      <div><small>Когда начать</small><p>${safe(cue)}</p></div>
      <span class="goal-habit-arrow" aria-hidden="true">→</span>
      <div><small>Что делать</small><h4>${safe(habit.name)}</h4>${habit.description ? `<p class="goal-habit-description">${safe(habit.description)}</p>` : ''}</div>
    </div>
    <div class="goal-habit-week-head">
      <span>Эта неделя</span><strong>${scheduled.length ? `${done} из ${scheduled.length} выполнено` : 'Нет запланированных дней'}</strong>
    </div>
    <div class="goal-habit-week" role="group" aria-label="Отметки за неделю">
      ${dates.map(date => {
        const day = key(date);
        const paused = habitPaused(habit,day);
        const planned = habitScheduled(habit,date);
        const status = paused ? 'Пауза' : 'Свободный день';
        return `<div class="goal-habit-day ${day === key(today) ? 'is-today' : ''} ${lastHabitMark?.id === habit.id && lastHabitMark.date === day ? 'just-marked' : ''}">
          <small aria-hidden="true">${weekdays[weekday(date)]}</small>
          ${planned ? habitCheck(habit,date) : `<span class="goal-habit-day-rest" role="img" aria-label="${short(date)} · ${status}" title="${status}">${paused ? 'Ⅱ' : '·'}</span>`}
        </div>`;
      }).join('')}
    </div>
    <div class="goal-habit-actions">
      <button type="button" data-goal-edit-habit="${id}" data-habit-id="${habitId}" aria-label="Изменить привычку ${safe(habit.name)}">Изменить</button>
      <button type="button" data-goal-unlink-habit="${id}" data-habit-id="${habitId}" aria-label="Отвязать привычку ${safe(habit.name)} от этой цели">Отвязать</button>
    </div>
  </article>`;
}

function goalHabitCard(goal) {
  const habits = goalHabits(goal), dates = week(today);
  const linked = new Set(goalHabitIds(goal));
  const available = state.habits.filter(habit => !linked.has(habit.id));
  const id = safe(goal.id);
  return `<section class="goal-habit-card" data-goal-habits="${id}" aria-labelledby="goal-habits-${id}">
    <h3 id="goal-habits-${id}">Привычки для цели</h3>
    ${habits.length ? habits.map(habit => goalHabitWeek(goal,habit,dates)).join('') :
      '<p class="muted">Например, после завтрака читать 10 минут.</p>'}
    <div class="goal-habit-setup">
      ${available.length ? `<label>Связать из трекера
        <select data-goal-habit="${id}"><option value="" selected disabled>Выбери привычку</option>
          ${available.map(habit => `<option value="${safe(habit.id)}">${safe(habit.name)}</option>`).join('')}
        </select></label>` : ''}
      <button type="button" data-goal-add-habit="${id}">＋ Новая привычка</button>
    </div>
  </section>`;
}

function goalHabitActivity(habits, dates) {
  const daily = dates.filter(date => date <= today).map(date => dailyProductivity(date,habits));
  const done = daily.reduce((sum,day) => sum + day.done,0);
  const planned = daily.reduce((sum,day) => sum + day.planned,0);
  return {daily,done,planned};
}

function goalHabitAnalytics(goal, dates) {
  const habits = goalHabits(goal);
  if (!habits.length) return '<section class="goal-habit-analysis"><h3>Привычки для цели</h3><p class="muted">Свяжи привычку с целью, чтобы увидеть её выполнение.</p></section>';
  const {daily,done,planned} = goalHabitActivity(habits,dates);
  return `<section class="goal-habit-analysis">
    <h3>Привычки для цели</h3>
    <p>${planned ? `<strong>${done} из ${planned}</strong> запланированных отметок · ${Math.round(done / planned * 100)}%` :
      '<span class="muted">За этот период не было запланированных дней.</span>'}</p>
    ${planned ? `<ol class="goal-habit-chart" aria-label="Выполнение привычек по дням">${daily.map(day => {
      const label = `${short(day.date)} · ${day.planned ? `${day.done} из ${day.planned}` : 'Свободный день'}`;
      return `<li aria-label="${label}" title="${label}"><div><span style="--habit-progress:${day.percent ?? 0}%"></span></div></li>`;
    }).join('')}</ol><div class="goal-habit-chart-dates" aria-hidden="true"><span>${short(dates[0])}</span><span>${short(dates.at(-1))}</span></div>` : ''}
    <ul class="goal-habit-analysis-list">${habits.map(habit => {
      const summary = habitSummary(habit,dates);
      return `<li><span>${safe(habit.name)}</span><strong>${summary.count ? `${summary.done} из ${summary.count}` : 'Без плана'}</strong></li>`;
    }).join('')}</ul>
  </section>`;
}

function goalReviewCard(goal) {
  const weekStart = week(today)[0];
  const previous = shift(weekStart,-7);
  const selectedWeek = goalReviewWeeks.get(goal.id) === key(previous) ? previous : weekStart;
  const start = key(selectedWeek), end = key(shift(selectedWeek,6));
  const entry = goal.reviews?.find(review=>review.week === start);
  const completed = goal.steps.filter(step=>step.done && step.doneAt >= start && step.doneAt <= end);
  const upcoming = entry?.stepId && goal.steps.find(step => step.id === entry.stepId);
  const habits = goalHabitActivity(goalHabits(goal),week(selectedWeek));
  return `<details class="goal-week-review" ${goalReviewWeeks.has(goal.id) ? 'open' : ''}><summary>Обзор недели</summary>
    <form data-goal-review="${safe(goal.id)}">
      <label>Неделя <select data-goal-review-week="${safe(goal.id)}" name="week">${[weekStart,previous].map(date=>`<option value="${key(date)}" ${key(date) === start ? 'selected' : ''}>${short(date)} — ${short(shift(date,6))}</option>`).join('')}</select></label>
      ${completed.length ? `<div><strong>Выполненные шаги</strong><ul>${completed.map(step=>`<li>${safe(step.text)}</li>`).join('')}</ul></div>` : '<p class="muted">За эту неделю пока нет завершённых шагов.</p>'}
      ${habits.planned ? `<p>Привычки · <strong>${habits.done} из ${habits.planned}</strong> отметок за неделю</p>` : ''}
      <label>Что помогло или помешало?<textarea name="reflection" maxlength="500" rows="2">${safe(entry?.reflection || '')}</textarea></label>
      <label>Какой один шаг беру дальше?<input name="next" maxlength="100" value="${safe(entry?.next || '')}"></label>
      <label>Запланировать шаг <small>· необязательно</small><input name="date" type="date" value="${safe(upcoming?.date || '')}" min="1000-01-01" max="9999-12-31"></label>
      <button type="submit">${entry ? 'Обновить обзор' : 'Сохранить обзор'}</button>
    </form></details>`;
}

function goalReviewHistory(goal, since = '') {
  const entries = (goal.reviews || []).filter(review=>!since || dayDistance(review.week,since) <= 6)
    .sort((a,b)=>b.week.localeCompare(a.week));
  return entries.length ? `<div class="goal-review-history"><h4>Обзоры недели</h4>${entries.map(review=>`<details>
    <summary>${showGoalDate(review.week)} — ${short(shift(new Date(review.week + 'T12:00:00'),6))}</summary>
    ${review.reflection ? `<p>${safe(review.reflection)}</p>` : ''}
    ${review.next ? `<p>Следующий шаг · ${safe(review.next)}</p>` : ''}</details>`).join('')}</div>` : '';
}

function goalFields(goal) {
  const number = goal && goalMode(goal) === 'number';
  return `<label>Чего хочешь достичь?<input name="title" maxlength="100" required value="${safe(goal?.title || '')}" placeholder="Например, сдать домашку"></label>
    <label>Как поймёшь, что получилось?<input name="criterion" maxlength="180" ${goal ? '' : 'required'} value="${safe(goal?.criterion || '')}" placeholder="Работа отправлена"></label>
    <label>Почему это важно <small>· необязательно</small><input name="why" maxlength="180" value="${safe(goal?.why || '')}"></label>
    <label>Срок <small>· необязательно</small><input type="date" name="date" min="1000-01-01" max="9999-12-31" value="${safe(goal?.date || '')}"></label>
    ${!goal || number ? `<fieldset class="goal-number-fields" ${number ? '' : 'hidden disabled'}>
      <label>Целевое значение<input name="target" type="number" step="any" required value="${safe(goal?.target ?? '')}"></label>
      <label>Единица измерения<input name="unit" maxlength="32" placeholder="книг, км, страниц" value="${safe(goal?.unit || '')}"></label>
      <label>Дата начала<input name="startDate" type="date" min="1000-01-01" max="9999-12-31" value="${safe(goal ? goal.startDate || '' : key(today))}"></label>
      <label>Значение на старте<input name="startValue" type="number" step="any" value="${safe(goal?.startValue ?? '')}" placeholder="0"></label>
    </fieldset>` : ''}`;
}

function goalStepRow(goal, step) {
  const id = safe(goal.id), sid = safe(step.id);
  if (editStepId === step.id) return `<form class="goal-step goal-step-edit" data-goal-step-edit="${id}" data-step-id="${sid}"><input name="step" maxlength="100" value="${safe(step.text)}" aria-label="Название шага" placeholder="Пустое название удалит шаг"><button type="submit">Сохранить</button><button type="button" data-goal-cancel>Отмена</button></form>`;
  return `<div class="goal-step ${step.done ? 'done' : ''}">
    <div class="goal-step-main">${goalStepCheckbox(goal, step)}<button class="goal-step-name" data-goal-edit-step="${sid}" type="button" aria-label="Изменить шаг: ${safe(step.text)}"><span>${safe(step.text)}</span>${goalMode(goal) === 'stages' && milestone(step) ? ' <small class="muted">· этап</small>' : ''}</button></div>
    <label class="goal-schedule">${step.date ? 'В календаре' : 'Запланировать'}<input type="date" min="1000-01-01" max="9999-12-31" value="${safe(step.date || '')}" data-goal-schedule="${id}" data-step-id="${sid}" aria-label="Дата шага: ${safe(step.text)}"></label>
    <button data-step-delete="${id}" data-step-id="${sid}" type="button" aria-label="Удалить шаг">×</button>
  </div>`;
}

function showGoalDate(date) {
  return short(new Date(date + 'T12:00:00'));
}

function measurementForm(goal, measurement) {
  return `<form class="goal-add-step measure-form" data-goal-measure="${safe(goal.id)}" data-measure-id="${safe(measurement?.id || '')}">
    <label>Значение<input name="value" type="number" step="any" required value="${safe(measurement?.value ?? '')}"></label>
    <label>Дата замера<input name="date" type="date" min="1000-01-01" max="${key(today)}" required value="${safe(measurement?.date || key(today))}"></label>
    <button type="submit">${measurement ? 'Сохранить' : 'Записать замер'}</button>
    ${measurement ? '<button type="button" data-goal-cancel>Отмена</button>' : ''}
  </form>`;
}

function measurementHistory(goal, measurements = goalMeasures(goal), editable = false) {
  return measurements.length ? `<ul class="goal-history">${[...measurements].reverse().map(item =>
    editable && editMeasureId === item.id ? `<li>${measurementForm(goal,item)}</li>` :
    `<li><time datetime="${safe(item.date)}">${showGoalDate(item.date)}</time><strong>${safe(item.value)} ${safe(goal.unit || '')}</strong>
    ${editable ? `<button type="button" data-measure-edit="${safe(item.id)}" aria-label="Изменить замер">✎</button><button type="button" data-measure-delete="${safe(goal.id)}" data-measure-id="${safe(item.id)}" aria-label="Удалить замер">×</button>` : ''}</li>`).join('')}</ul>`
    : '<p class="muted">Запиши первый замер, чтобы увидеть динамику.</p>';
}

function goalHistory(goal, since = '', editable = false) {
  const mode = goalMode(goal);
  const completed = goal.completedAt && goal.completedAt >= since
    ? `<p>Цель достигнута · ${showGoalDate(goal.completedAt)}</p>` : '';
  if (mode === 'number') {
    const measurements = goalMeasures(goal).filter(item => item.date >= since);
    return completed + measurementHistory(goal, measurements, editable);
  }
  const steps = goal.steps.filter(step => step.doneAt && step.done && step.doneAt >= since)
    .sort((a,b) => b.doneAt.localeCompare(a.doneAt));
  return completed + (steps.length ? `<ul class="goal-history">${steps.map(step => `<li><time datetime="${safe(step.doneAt)}">${showGoalDate(step.doneAt)}</time><span>${safe(step.text)}</span></li>`).join('')}</ul>`
    : completed ? '' : '<p class="muted">Здесь будут выполненные шаги и дата достижения цели.</p>');
}

function goalCard(goal) {
  const id = safe(goal.id);
  if (editGoalId === goal.id) return `<article class="goal-card"><form class="goal-fields" data-edit-goal="${id}">${goalFields(goal)}<button class="primary">Сохранить</button><button type="button" data-goal-cancel>Отмена</button></form></article>`;
  const mode = goalMode(goal);
  const next = goal.steps.find(step => !step.done);
  const stages = mode === 'stages' ? goal.steps.filter(milestone) : [];
  const nextStage = stages.find(step => !step.done);
  const done = goal.steps.filter(step => step.done).length;
  return `<article class="goal-card">
    <div class="goal-card-head"><h2>${safe(goal.title)}</h2><button data-goal-edit="${id}" aria-label="Редактировать цель">✎</button><button data-goal-delete="${id}" aria-label="Удалить цель">×</button></div>
    ${goal.why ? `<p class="goal-why">${safe(goal.why)}</p>` : ''}
    ${goal.date ? `<p class="goal-deadline">До ${fmt(new Date(goal.date+'T12:00:00'),{day:'numeric',month:'long',year:'numeric'})}</p>` : ''}
    <div class="goal-trajectory"><h3>Траектория цели</h3>
      ${goal.criterion ? `<p>${safe(goal.criterion)}</p>` : ''}
      <strong>${safe(goalResult(goal))}</strong>
      ${stages.length ? `<ol class="goal-stage-line" aria-label="Этапы цели">${stages.map(step=>`<li class="${step.done ? 'done' : step === nextStage ? 'next' : ''}" ${step === nextStage ? 'aria-current="step"' : ''}>${safe(step.text)}</li>`).join('')}</ol>` : ''}
      ${next ? `<div class="goal-next-action">
        <div><small>Следующий шаг</small><button type="button" class="goal-step-name" data-goal-edit-step="${safe(next.id)}">${safe(next.text)}</button></div>
        <button type="button" data-goal-plan-step="${id}" data-step-id="${safe(next.id)}">${next.date ? 'Изменить дату' : 'Запланировать'}</button>
        <button type="button" data-goal-finish-step="${id}" data-step-id="${safe(next.id)}">Выполнено</button>
      </div>` : ''}
      ${goalPace(goal)}
      <button type="button" data-goal-complete="${id}">${goal.completedAt ? 'Вернуть в работу' : 'Отметить цель достигнутой'}</button>
      <a href="#analytics?goal=${safe(encodeURIComponent(goal.id))}">Посмотреть динамику</a>
    </div>
    <h3 class="goal-step-title">Шаги${stages.length || mode === 'number' ? ` · ${done} из ${goal.steps.length}` : ''}</h3>
    <div class="goal-steps">${goal.steps.map(step => goalStepRow(goal,step)).join('')}</div>
    <form class="goal-add-step" data-goal-form="${id}"><input name="step" maxlength="100" required placeholder="Следующий шаг" aria-label="Новый шаг">
      ${mode === 'stages' ? '<label><input name="milestone" type="checkbox"> Этап</label>' : ''}
      <button type="submit" aria-label="Добавить шаг">＋</button></form>
    ${goalHabitCard(goal)}
    ${goalReviewCard(goal)}
  </article><aside class="goal-card goal-history-panel"><h3>История прогресса</h3>
    ${mode === 'number' && !goal.measurements?.some(item => item.id === editMeasureId) ? measurementForm(goal) : ''}${goalHistory(goal,'',true)}
    ${goalReviewHistory(goal)}</aside>`;
}

function goalsScreen(params) {
  const goals = goalsInCreationOrder();
  const active = goals.find(goal => goal.id === params.get('goal')) || goals[0];
  return `<section class="goals-page">
    ${active ? `<nav class="goal-navigation" aria-label="Мои цели">${goals.map(goal =>
      `<a href="${safe(goalHref(goal.id))}" ${goal === active ? 'aria-current="page"' : ''}>${safe(goal.title)}</a>`).join('')}</nav>` : ''}
    <details class="goal-new goal-create" ${active ? '' : 'open'}><summary>＋ Новая цель</summary>
    <form id="new-goal-form" class="goal-fields"><label class="goal-template-field">Шаблон
      <select name="template" data-goal-template><option value="">Своя цель</option>${Object.entries(goalTemplates).map(([id,template])=>`<option value="${id}">${template.title}</option>`).join('')}</select>
    </label>${goalFields()}<div class="goal-template-steps" data-goal-template-steps hidden></div><button type="submit" class="primary">Создать цель</button></form></details>
    ${active ? `<div class="goal-pair">${goalCard(active)}</div>` : '<p class="muted">Например, сдать домашку, выпустить приложение или прочитать 12 книг.</p>'}
  </section>`;
}

function saveGoalChange(goal, updates) {
  const goals = state.goals.map(item => item === goal ? {...item, ...updates} : item);
  if (!save({...state, goals})) return false;
  state.goals = goals;
  return true;
}

function deleteGoalStep(goal, stepId) {
  const steps = goal.steps.filter(step => step.id !== stepId);
  if (steps.length === goal.steps.length || !saveGoalChange(goal,{steps})) return;
  editStepId = null;
  render();
  $('view').querySelector(`[data-goal-form="${CSS.escape(goal.id)}"] input`)?.focus({preventScroll:true});
  feedback('Шаг удалён');
}

function saveGoalReview(form) {
  const fields = form.elements;
  const goal = state.goals.find(item=>item.id === form.dataset.goalReview);
  const weekStart = week(today)[0];
  const selected = fields.week.value;
  if (!goal || ![key(weekStart),key(shift(weekStart,-7))].includes(selected)) return;
  const reflection = fields.reflection.value.trim(), next = fields.next.value.trim();
  if (!reflection && !next) { feedback('Добавь итог недели или следующий шаг'); return; }
  if (!next && fields.date.value) { feedback('Напиши, какой шаг запланировать'); fields.next.focus(); return; }
  const existing = goal.reviews?.find(review=>review.week === selected);
  const step = goal.steps.find(item => item.id === existing?.stepId);
  let steps = goal.steps;
  let stepId = step?.id;
  if (fields.date.value && !step?.done) {
    const scheduled = {...step, id:step?.id || crypto.randomUUID(), text:next, date:fields.date.value, done:false, milestone:false};
    steps = step ? steps.map(item=>item === step ? scheduled : item) : [...steps,scheduled];
    stepId = scheduled.id;
  } else if (step && !step.done) {
    steps = steps.map(item => item === step ? {...item, date:'', text:next || item.text} : item);
  }
  const review = {week:selected, reflection, next, ...(stepId ? {stepId} : {})};
  const reviews = [...(goal.reviews || []).filter(item=>item.week !== selected),review];
  if (!saveGoalChange(goal,{steps,reviews})) return;
  goalReviewWeeks.set(goal.id,selected);
  render();
  $('view').querySelector(`[data-goal-review="${CSS.escape(goal.id)}"] button[type="submit"]`)?.focus({preventScroll:true});
  feedback(fields.date.value && !step?.done ? 'Обзор сохранён, шаг добавлен в календарь' : 'Обзор сохранён');
}

function goalsSubmit(event) {
  const form = event.target;
  const data = form.dataset;
  const creating = form.id === 'new-goal-form';
  if (!creating && !data.editGoal && !data.goalForm && !data.goalStepEdit && !data.goalMeasure && !data.goalReview) return;
  event.preventDefault();
  if (data.goalReview) { saveGoalReview(form); return; }
  const fields = form.elements;
  let message;
  let focusStep;
  if (creating || data.editGoal) {
    const title = fields.title.value.trim();
    const criterion = fields.criterion.value.trim();
    if (!title || (creating && !criterion)) {
      const field = title ? fields.criterion : fields.title;
      field.value = '';
      field.reportValidity();
      return;
    }
    const goal = state.goals.find(item => item.id === data.editGoal);
    if (!creating && !goal) return;
    const mode = creating ? (fields.target.matches(':disabled') ? 'stages' : 'number') : goalMode(goal);
    const target = fields.target?.valueAsNumber;
    if (mode === 'number' && !Number.isFinite(target)) return;
    const updates = {title, criterion, mode, why:fields.why.value.trim(), date:fields.date.value};
    if (mode === 'number') Object.assign(updates,{target,unit:fields.unit.value.trim(),
      startDate:fields.startDate.value, startValue:Number.isFinite(fields.startValue.valueAsNumber) ? fields.startValue.valueAsNumber : undefined});
    if (creating) {
      const steps = [...form.querySelectorAll('[name="templateStep"]')].map(input => input.value.trim()).filter(Boolean)
        .map(text => ({id:crypto.randomUUID(),text,done:false,milestone:mode === 'stages'}));
      const created = {id:crypto.randomUUID(),steps,...updates};
      const goals = [created, ...state.goals];
      if (!save({...state,goals})) return;
      state.goals = goals;
      location.hash = goalHref(created.id);
      feedback('Цель добавлена');
      return;
    }
    if (!saveGoalChange(goal,updates)) return;
    editGoalId = null;
    render();
    feedback('Цель обновлена');
    return;
  } else if (data.goalMeasure) {
    const goal = state.goals.find(item => item.id === data.goalMeasure);
    const value = fields.value.valueAsNumber, date = fields.date.value;
    if (!goal || !Number.isFinite(value) || !date || date > key(today)) return;
    const measurements = goal.measurements ??= [];
    const existing = measurements.find(item => item.id === data.measureId);
    if (existing) Object.assign(existing,{date,value});
    else measurements.push({id:crypto.randomUUID(),date,value});
    editMeasureId = null;
    message = 'Замер сохранён';
  } else {
    const goal = state.goals.find(item => item.id === (data.goalForm || data.goalStepEdit));
    const text = fields.step.value.trim();
    if (!goal) return;
    if (data.goalStepEdit) {
      const step = goal.steps.find(item => item.id === data.stepId);
      if (!step) return;
      if (!text) { deleteGoalStep(goal,step.id); return; }
      if (!saveGoalChange(goal,{steps:goal.steps.map(item=>item === step ? {...item,text} : item)})) return;
      editStepId = null;
      render();
      $('view').querySelector(`.goal-steps [data-goal-edit-step="${CSS.escape(step.id)}"]`)?.focus({preventScroll:true});
      feedback('Шаг обновлён');
      return;
    } else {
      if (!text) return;
      goal.steps.push({id:crypto.randomUUID(),text,done:false,milestone:Boolean(fields.milestone?.checked)});
      focusStep = goal.id;
    }
    message = 'Шаг добавлен';
  }
  if (!save()) return;
  render();
  if (focusStep) $('view').querySelector(`[data-goal-form="${CSS.escape(focusStep)}"] input`)?.focus({preventScroll:true});
  feedback(message);
}

function goalsClick(button) {
  const d = button.dataset;
  const habitGoalId = d.goalAddHabit || d.goalEditHabit || d.goalUnlinkHabit;
  if (habitGoalId) {
    const goal = state.goals.find(item => item.id === habitGoalId);
    if (!goal) return true;
    if (d.goalAddHabit) {
      openEditor('habit',key(today),{goalId:goal.id});
    } else if (d.goalEditHabit) {
      const habit = goalHabits(goal).find(item => item.id === d.habitId);
      if (habit) openEditor('habit',key(today),{habit, goalContext:goal.id});
    } else if (saveGoalChange(goal,goalHabitLink(goalHabitIds(goal).filter(id => id !== d.habitId)))) {
      render();
      focusGoalHabit(goal.id);
      feedback('Привычка отвязана от цели');
    }
    return true;
  }
  if (d.goalPlanStep || d.goalFinishStep) {
    const stepId = CSS.escape(d.stepId);
    if (d.goalPlanStep) {
      const field = $('view').querySelector(`[data-goal-schedule="${CSS.escape(d.goalPlanStep)}"][data-step-id="${stepId}"]`);
      field?.focus();
      try { field?.showPicker?.(); } catch { /* The focused date field can still be edited. */ }
    } else {
      const checkbox = $('view').querySelector(`[data-goal-step="${CSS.escape(d.goalFinishStep)}"][data-step-id="${stepId}"]`);
      if (checkbox && !checkbox.checked) checkbox.click();
    }
    return true;
  }
  if (d.goalEdit || d.goalEditStep || d.measureEdit || button.hasAttribute('data-goal-cancel')) {
    const previousStep = editStepId;
    editGoalId = d.goalEdit || null;
    editStepId = d.goalEditStep || null;
    editMeasureId = d.measureEdit || null;
    render();
    if (d.goalEditStep) {
      const field = $('view').querySelector('[data-goal-step-edit] input');
      field?.focus({preventScroll:button.closest('.goal-steps') !== null});
      field?.select();
    } else if (previousStep && button.hasAttribute('data-goal-cancel')) {
      $('view').querySelector(`.goal-steps [data-goal-edit-step="${CSS.escape(previousStep)}"]`)?.focus({preventScroll:true});
    } else {
      $('view').querySelector('[data-edit-goal] input, [data-goal-measure][data-measure-id]:not([data-measure-id=""]) input')?.focus({preventScroll:true});
    }
    return true;
  }
  if (d.goalPeriod) {
    goalAnalyticsDays = Number(d.goalPeriod);
    render();
    $('view').querySelector(`[data-goal-period="${goalAnalyticsDays}"]`)?.focus({preventScroll:true});
    return true;
  }
  if (d.goalDelete) {
    if (!confirm('Удалить эту цель, её шаги и историю?')) return true;
    const index = state.goals.findIndex(goal => goal.id === d.goalDelete);
    const goals = state.goals.filter(goal => goal.id !== d.goalDelete);
    if (index < 0 || !save({...state,goals})) return true;
    state.goals = goals;
    goalReviewWeeks.delete(d.goalDelete);
    closeGoalEditors();
    const next = goalHref((goals[index - 1] || goals[index])?.id);
    if (location.hash !== next) location.replace(next);
    else {
      render();
      $('view').querySelector('.goal-create > summary')?.focus();
    }
    return true;
  } else {
    const goal = state.goals.find(item => item.id === (d.stepDelete || d.goalComplete || d.measureDelete));
    if (!goal) return false;
    if (d.stepDelete) {
      if (confirm('Удалить этот шаг?')) deleteGoalStep(goal,d.stepId);
      return true;
    } else if (d.measureDelete) {
      if (!confirm('Удалить этот замер?')) return true;
      goal.measurements = goal.measurements.filter(item => item.id !== d.measureId);
    } else {
      const completedAt = goal.completedAt ? '' : key(today);
      if (saveGoalChange(goal,{completedAt})) {
        render();
        $('view').querySelector(`[data-goal-complete="${CSS.escape(goal.id)}"]`)?.focus({preventScroll:true});
        feedback(completedAt ? 'Цель достигнута' : 'Цель снова в работе');
      }
      return true;
    }
  }
  if (save()) render();
  return true;
}

function goalsChange(target) {
  const {goalStep, goalSchedule, stepId} = target.dataset;
  if (target.hasAttribute('data-goal-template')) {
    const template = goalTemplates[target.value];
    const previous = goalTemplates[target.dataset.previousTemplate];
    target.dataset.previousTemplate = target.value;
    const fields = target.form.elements;
    const steps = target.form.querySelector('[data-goal-template-steps]');
    steps.hidden = !template;
    steps.innerHTML = template ? `<strong>Стартовые шаги</strong>${template.steps.map((step,index)=>`<input name="templateStep" maxlength="100" aria-label="Шаг ${index + 1}" value="${safe(step)}">`).join('')}` : '';
    if (template) {
      fields.title.value = template.title;
      fields.criterion.value = template.criterion;
    } else if (previous) {
      if (fields.title.value === previous.title) fields.title.value = '';
      if (fields.criterion.value === previous.criterion) fields.criterion.value = '';
    }
    const numberFields = target.form.querySelector('.goal-number-fields');
    numberFields.hidden = numberFields.disabled = !template?.target;
    fields.target.value = template?.target ?? '';
    fields.unit.value = template?.unit ?? '';
    return true;
  }
  if (target.dataset.goalHabit) {
    const goal = state.goals.find(item=>item.id === target.dataset.goalHabit);
    const habit = state.habits.find(item => item.id === target.value);
    if (goal && habit && saveGoalChange(goal,goalHabitLink([...goalHabitIds(goal),habit.id]))) {
      render();
      focusGoalHabit(goal.id,habit.id);
      feedback('Привычка связана с целью');
    } else target.value = '';
    return true;
  }
  if (target.dataset.goalReviewWeek) {
    const id = target.dataset.goalReviewWeek;
    goalReviewWeeks.set(id,target.value);
    render();
    $('view').querySelector(`[data-goal-review-week="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
    return true;
  }
  if (target.id === 'analytics-goal') {
    location.hash = '#analytics?goal=' + encodeURIComponent(target.value);
    return true;
  }
  if (!goalStep && !goalSchedule) return false;
  const goal = state.goals.find(item => item.id === (goalStep || goalSchedule));
  const step = goal?.steps.find(item => item.id === stepId);
  if (!step || !target.validity.valid) return true;
  if (goalSchedule) step.date = target.value;
  else {
    step.done = target.checked;
    step.doneAt = step.done ? key(today) : '';
    if (step.done) feedback('Шаг выполнен');
  }
  if (!save()) return true;
  if (!goalSchedule && step.done && goalMode(goal) === 'stages' && milestone(step)) queueProgressStar(`stage-${goal.id}-${step.id}`);
  render();
  const attr = goalSchedule ? 'data-goal-schedule' : 'data-goal-step';
  $('view').querySelector(`[${attr}][data-step-id="${CSS.escape(stepId)}"]`)?.focus({preventScroll:true});
  return true;
}

function goalAnalytics(params) {
  const requested = params.get('goal');
  const goals = goalsInCreationOrder();
  const goal = goals.find(item => item.id === requested) || goals[0];
  const empty = '<p class="muted">Создай первую цель, чтобы увидеть её прогресс.</p>';
  if (!goal) return `<section class="panel goal-analysis">${empty}<a href="#goals">Перейти к целям</a></section>`;
  const dates = Array.from({length:goalAnalyticsDays},(_,index) => shift(today,1 - goalAnalyticsDays + index));
  const since = key(dates[0]);
  const measurements = goalMeasures(goal).filter(item => item.date >= since);
  const finish = goalMode(goal) === 'finish';
  const completed = goal.steps.filter(step => step.done && step.doneAt >= since).length;
  const late = goal.steps.filter(step => !step.done && step.date && step.date < key(today)).length;
  return `<section class="panel goal-analysis">
    <div class="goal-analysis-toolbar"><label>Цель <select id="analytics-goal">${goals.map(item => `<option value="${safe(item.id)}" ${item.id === goal.id ? 'selected' : ''}>${safe(item.title)}</option>`).join('')}</select></label>
      <div class="orbit-range">${[7,30].map(days => `<button type="button" data-goal-period="${days}" aria-pressed="${days === goalAnalyticsDays}">${days === 7 ? 'Неделя' : 'Месяц'}</button>`).join('')}</div></div>
    <h2>${safe(goal.title)}</h2><p class="goal-analysis-result">${safe(goalResult(goal))}</p>
    ${goal.date ? `<p>Срок · ${showGoalDate(goal.date)}</p>` : ''}
    ${!finish || goal.steps.length ? `<p>Шагов за период · ${completed} выполнено. Просрочено · ${late}.</p>` : ''}
    ${goalPace(goal)}
    ${goalMode(goal) === 'number' && measurements.length ? goalMeasureChart(goal, measurements, since) : ''}
    ${goalHabitAnalytics(goal,dates)}
    ${goalHistory(goal,since)}${goalReviewHistory(goal,since)}<a href="${safe(goalHref(goal.id))}">Открыть цель</a>
  </section>`;
}

function goalMeasureChart(goal, measurements, since) {
  const values = measurements.map(item => item.value);
  const min = Math.min(goal.target, ...values), max = Math.max(goal.target, ...values);
  const x = date => 70 + dayDistance(since,date) * 560 / (goalAnalyticsDays - 1);
  const y = value => max === min ? 92 : 155 - ((value-min)/(max-min))*120;
  const points = measurements.map(item => `${x(item.date)},${y(item.value)}`).join(' ');
  const dates = [since, key(shift(today, -Math.floor((goalAnalyticsDays - 1)/2))), key(today)];
  return `<div class="chart-scroll"><svg class="goal-measure-chart" viewBox="0 0 690 195" role="img" aria-label="Динамика замеров за ${goalAnalyticsDays} дней">
    <line x1="70" x2="630" y1="${y(goal.target)}" y2="${y(goal.target)}" class="goal-target-line"/><text x="63" y="${y(goal.target)+4}" text-anchor="end" class="axis-label">${safe(goal.target)}</text>
    <polyline fill="none" class="line-path" points="${points}"/>
    ${measurements.map(item => `<circle class="line-dot" cx="${x(item.date)}" cy="${y(item.value)}" r="4"><title>${showGoalDate(item.date)} · ${safe(item.value)}</title></circle>`).join('')}
    ${dates.map(date => `<text x="${x(date)}" y="182" text-anchor="middle" class="axis-label">${showGoalDate(date)}</text>`).join('')}
  </svg></div>`;
}
