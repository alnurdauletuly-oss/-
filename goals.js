const goalModes = {finish:'По факту выполнения', stages:'По этапам', number:'По числовому показателю'};
const goalTemplates = {
  product:{title:'Запустить продукт', criterion:'Первый пользователь попробовал рабочую версию', mode:'stages',
    steps:['Описать проблему пользователя','Собрать прототип','Показать рабочую версию первому пользователю']},
  exam:{title:'Подготовиться к экзамену', criterion:'Пробный экзамен решён на нужный балл', mode:'stages',
    steps:['Составить список тем','Закрыть слабые темы','Решить пробный вариант']},
  reading:{title:'Прочитать 12 книг', criterion:'В журнале чтения 12 прочитанных книг', mode:'number', target:12, unit:'книг',
    steps:['Составить список книг','Выбрать первую книгу']}
};
let editGoalId = null;
let editStepId = null;
let editMeasureId = null;
let goalAnalyticsDays = 7;
const goalReviewWeeks = new Map();

function goalMode(goal) { return goal.mode || 'stages'; }
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
  if (mode === 'finish') return goal.completedAt ? 'Цель достигнута' : 'В работе';
  if (mode === 'number') {
    const latest = goalMeasures(goal).at(-1);
    const label = goal.unit ? ` ${goal.unit}` : '';
    return latest ? `${latest.value} из ${goal.target}${label}` : `Цель · ${goal.target}${label}`;
  }
  const stages = goal.steps.filter(milestone);
  return stages.length ? `${stages.filter(step => step.done).length} из ${stages.length} этапов` : 'Этапы пока не добавлены';
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

function goalHabitCard(goal) {
  const habit = state.habits.find(item => item.id === goal.habitId);
  const days = habit ? week(today).filter(date => habitScheduled(habit,date)) : [];
  const done = days.filter(date => date <= today && habit.done.includes(key(date))).length;
  const picker = state.habits.length ? `<label>Привычка для цели
    <select data-goal-habit="${safe(goal.id)}"><option value="">Без привязанной привычки</option>
      ${state.habits.map(item=>`<option value="${safe(item.id)}" ${item === habit ? 'selected' : ''}>${safe(item.name)}</option>`).join('')}</select>
    </label>` : '<p class="muted">Добавь привычку в трекере, чтобы связать её с целью.</p>';
  return `<div class="goal-habit-card">${picker}
    ${habit ? `<p><strong>${done} из ${days.length}</strong> за эту неделю</p>` : ''}
    <a href="#habits">Открыть трекер привычек</a></div>`;
}

function goalReviewCard(goal) {
  const weekStart = week(today)[0];
  const previous = shift(weekStart,-7);
  const selectedWeek = goalReviewWeeks.get(goal.id) === key(previous) ? previous : weekStart;
  const start = key(selectedWeek), end = key(shift(selectedWeek,6));
  const entry = goal.reviews?.find(review=>review.week === start);
  const completed = goal.steps.filter(step=>step.done && step.doneAt >= start && step.doneAt <= end);
  const upcoming = entry?.stepId && goal.steps.find(step => step.id === entry.stepId);
  return `<details class="goal-week-review" ${goalReviewWeeks.has(goal.id) ? 'open' : ''}><summary>Обзор недели</summary>
    <form data-goal-review="${safe(goal.id)}">
      <label>Неделя <select data-goal-review-week="${safe(goal.id)}" name="week">${[weekStart,previous].map(date=>`<option value="${key(date)}" ${key(date) === start ? 'selected' : ''}>${short(date)} — ${short(shift(date,6))}</option>`).join('')}</select></label>
      ${completed.length ? `<div><strong>Выполненные шаги</strong><ul>${completed.map(step=>`<li>${safe(step.text)}</li>`).join('')}</ul></div>` : '<p class="muted">За эту неделю пока нет завершённых шагов.</p>'}
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
  const mode = goal ? goalMode(goal) : 'stages';
  return `<label>Чего хочешь достичь?<input name="title" maxlength="100" required value="${safe(goal?.title || '')}" placeholder="Например, сдать домашку"></label>
    <label>Как поймёшь, что получилось?<input name="criterion" maxlength="180" ${goal ? '' : 'required'} value="${safe(goal?.criterion || '')}" placeholder="Работа отправлена"></label>
    <label>Как отслеживать<select name="mode" data-goal-mode>${Object.entries(goalModes).map(([key,label]) => `<option value="${key}" ${key === mode ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>Почему это важно <small>· необязательно</small><input name="why" maxlength="180" value="${safe(goal?.why || '')}"></label>
    <label>Срок <small>· необязательно</small><input type="date" name="date" min="1000-01-01" max="9999-12-31" value="${safe(goal?.date || '')}"></label>
    <div class="goal-number-fields" ${mode === 'number' ? '' : 'hidden'}><label>Целевое значение<input name="target" type="number" step="any" ${mode === 'number' ? 'required' : 'disabled'} value="${safe(goal?.target ?? '')}"></label><label>Единица измерения<input name="unit" maxlength="32" placeholder="книг, км, страниц" value="${safe(goal?.unit || '')}"></label>
    <label>Дата начала<input name="startDate" type="date" min="1000-01-01" max="9999-12-31" value="${safe(goal ? goal.startDate || '' : key(today))}"></label>
    <label>Значение на старте<input name="startValue" type="number" step="any" value="${safe(goal?.startValue ?? '')}" placeholder="0"></label></div>`;
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
  if (mode === 'number') {
    const measurements = goalMeasures(goal).filter(item => item.date >= since);
    return measurementHistory(goal, measurements, editable);
  }
  if (mode === 'finish') {
    return `<p>${goal.completedAt ? 'Цель достигнута · ' + showGoalDate(goal.completedAt) : 'Отметь цель как достигнутую, когда результат готов.'}</p>`;
  }
  const finished = goal.steps.filter(step => milestone(step) && step.done);
  const stages = finished.filter(step => step.doneAt && step.doneAt >= since)
    .sort((a,b) => b.doneAt.localeCompare(a.doneAt));
  return stages.length ? `<ul class="goal-history">${stages.map(step => `<li><time datetime="${safe(step.doneAt)}">${showGoalDate(step.doneAt)}</time><span>${safe(step.text)}</span></li>`).join('')}</ul>`
    : `<p class="muted">${finished.length ? 'За этот период нет этапов с известной датой завершения.' : 'Отметь этап выполненным, чтобы добавить его в историю.'}</p>`;
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
      ${mode === 'finish' ? `<button type="button" data-goal-complete="${id}">${goal.completedAt ? 'Вернуть в работу' : 'Отметить как достигнутую'}</button>` : ''}
      <a href="#analytics?goal=${safe(encodeURIComponent(goal.id))}">Посмотреть динамику</a>
    </div>
    <h3 class="goal-step-title">Шаги · ${done} из ${goal.steps.length}</h3>
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

function goalsScreen() {
  return `<section class="goals-page">
    <details class="goal-new goal-create" ${state.goals.length ? '' : 'open'}><summary>＋ Новая цель</summary>
    <form id="new-goal-form" class="goal-fields"><label class="goal-template-field">Шаблон
      <select name="template" data-goal-template><option value="">Своя цель</option>${Object.entries(goalTemplates).map(([id,template])=>`<option value="${id}">${template.title}</option>`).join('')}</select>
    </label>${goalFields()}<div class="goal-template-steps" data-goal-template-steps hidden></div><button type="submit" class="primary">Создать цель</button></form></details>
    <div class="goal-pairs">${state.goals.map(goal => `<div class="goal-pair">${goalCard(goal)}</div>`).join('') || '<p class="muted">Например, сдать домашку, выпустить приложение или прочитать 12 книг.</p>'}</div>
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
    if (!title || (creating && !criterion)) return;
    const mode = fields.mode.value;
    const goal = creating ? {id:crypto.randomUUID(),steps:[]} : state.goals.find(item => item.id === data.editGoal);
    if (!goal) return;
    const target = fields.target.valueAsNumber;
    if (mode === 'number' && !Number.isFinite(target)) return;
    Object.assign(goal,{title, criterion, mode, why:fields.why.value.trim(), date:fields.date.value});
    if (mode === 'number') Object.assign(goal,{target,unit:fields.unit.value.trim(),
      startDate:fields.startDate.value, startValue:Number.isFinite(fields.startValue.valueAsNumber) ? fields.startValue.valueAsNumber : undefined});
    if (creating) {
      goal.steps = [...form.querySelectorAll('[name="templateStep"]')].map(input => input.value.trim()).filter(Boolean)
        .map(text => ({id:crypto.randomUUID(),text,done:false,milestone:mode === 'stages'}));
      state.goals.unshift(goal);
    }
    editGoalId = null;
    message = creating ? 'Цель добавлена' : 'Цель обновлена';
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
    state.goals = state.goals.filter(goal => goal.id !== d.goalDelete);
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
      goal.completedAt = goal.completedAt ? '' : key(today);
      if (goal.completedAt) feedback('Цель достигнута');
    }
  }
  if (save()) render();
  return true;
}

function goalsChange(target) {
  const {goalStep, goalSchedule, stepId} = target.dataset;
  if (target.hasAttribute('data-goal-template')) {
    const template = goalTemplates[target.value];
    const fields = target.form.elements;
    const steps = target.form.querySelector('[data-goal-template-steps]');
    steps.hidden = !template;
    steps.innerHTML = template ? `<strong>Стартовые шаги</strong>${template.steps.map((step,index)=>`<input name="templateStep" maxlength="100" aria-label="Шаг ${index + 1}" value="${safe(step)}">`).join('')}` : '';
    if (template) {
      fields.title.value = template.title;
      fields.criterion.value = template.criterion;
      fields.mode.value = template.mode;
      fields.target.value = template.target ?? '';
      fields.unit.value = template.unit || '';
      goalsChange(fields.mode);
    }
    return true;
  }
  if (target.dataset.goalHabit) {
    const goal = state.goals.find(item=>item.id === target.dataset.goalHabit);
    if (goal && (!target.value || state.habits.some(habit=>habit.id === target.value)) &&
      saveGoalChange(goal,{habitId:target.value})) {
      render();
      $('view').querySelector(`[data-goal-habit="${CSS.escape(goal.id)}"]`)?.focus({preventScroll:true});
    }
    return true;
  }
  if (target.dataset.goalReviewWeek) {
    const id = target.dataset.goalReviewWeek;
    goalReviewWeeks.set(id,target.value);
    render();
    $('view').querySelector(`[data-goal-review-week="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
    return true;
  }
  if (target.hasAttribute('data-goal-mode')) {
    const number = target.value === 'number';
    target.form.querySelector('.goal-number-fields').hidden = !number;
    target.form.elements.target.disabled = !number;
    target.form.elements.target.required = number;
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
  render();
  const attr = goalSchedule ? 'data-goal-schedule' : 'data-goal-step';
  $('view').querySelector(`[${attr}][data-step-id="${CSS.escape(stepId)}"]`)?.focus({preventScroll:true});
  return true;
}

function goalAnalytics(params) {
  const requested = params.get('goal');
  const goal = state.goals.find(item => item.id === requested) || state.goals[0];
  const empty = '<p class="muted">Создай первую цель, чтобы увидеть её прогресс.</p>';
  if (!goal) return `<section class="panel goal-analysis">${empty}<a href="#goals">Перейти к целям</a></section>`;
  const since = key(shift(today, 1 - goalAnalyticsDays));
  const measurements = goalMeasures(goal).filter(item => item.date >= since);
  const finish = goalMode(goal) === 'finish';
  const completed = goal.steps.filter(step => step.done && step.doneAt >= since).length;
  const late = goal.steps.filter(step => !step.done && step.date && step.date < key(today)).length;
  return `<section class="panel goal-analysis">
    <div class="goal-analysis-toolbar"><label>Цель <select id="analytics-goal">${state.goals.map(item => `<option value="${safe(item.id)}" ${item.id === goal.id ? 'selected' : ''}>${safe(item.title)}</option>`).join('')}</select></label>
      <div class="orbit-range">${[7,30].map(days => `<button type="button" data-goal-period="${days}" aria-pressed="${days === goalAnalyticsDays}">${days === 7 ? 'Неделя' : 'Месяц'}</button>`).join('')}</div></div>
    <h2>${safe(goal.title)}</h2><p class="goal-analysis-result">${safe(goalResult(goal))}</p>
    ${goal.date ? `<p>Срок · ${showGoalDate(goal.date)}</p>` : ''}
    ${!finish || goal.steps.length ? `<p>Шагов за период · ${completed} выполнено. Просрочено · ${late}.</p>` : ''}
    ${goalPace(goal)}
    ${goalMode(goal) === 'number' && measurements.length ? goalMeasureChart(goal, measurements, since) : ''}
    ${goalHistory(goal,since)}${goalReviewHistory(goal,since)}<a href="#goals">Открыть цели</a>
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
