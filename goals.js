const goalModes = {finish:'По факту выполнения', stages:'По этапам', number:'По числовому показателю'};
let editGoalId = null;
let editStepId = null;
let editMeasureId = null;
let goalAnalyticsDays = 7;

function goalMode(goal) { return goal.mode || 'stages'; }
function goalSteps() {
  return state.goals.flatMap(goal => goal.steps.map(step => ({goal, step})));
}

function goalStepCheckbox(goal, step) {
  return `<input class="check" type="checkbox" data-goal-step="${safe(goal.id)}" data-step-id="${safe(step.id)}" ${step.done ? 'checked' : ''}>`;
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

function goalFields(goal) {
  const mode = goal ? goalMode(goal) : 'stages';
  return `<label>Чего хочешь достичь?<input name="title" maxlength="100" required value="${safe(goal?.title || '')}" placeholder="Например, сдать домашку"></label>
    <label>Как поймёшь, что получилось?<input name="criterion" maxlength="180" ${goal ? '' : 'required'} value="${safe(goal?.criterion || '')}" placeholder="Работа отправлена"></label>
    <label>Как отслеживать<select name="mode" data-goal-mode>${Object.entries(goalModes).map(([key,label]) => `<option value="${key}" ${key === mode ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>Почему это важно <small>· необязательно</small><input name="why" maxlength="180" value="${safe(goal?.why || '')}"></label>
    <label>Срок <small>· необязательно</small><input type="date" name="date" min="1000-01-01" max="9999-12-31" value="${safe(goal?.date || '')}"></label>
    <div class="goal-number-fields" ${mode === 'number' ? '' : 'hidden'}><label>Целевое значение<input name="target" type="number" step="any" ${mode === 'number' ? 'required' : 'disabled'} value="${safe(goal?.target ?? '')}"></label><label>Единица измерения<input name="unit" maxlength="32" placeholder="книг, км, страниц" value="${safe(goal?.unit || '')}"></label></div>`;
}

function goalStepRow(goal, step) {
  const id = safe(goal.id), sid = safe(step.id);
  if (editStepId === step.id) return `<form class="goal-add-step" data-goal-step-edit="${id}" data-step-id="${sid}"><input name="step" maxlength="100" required value="${safe(step.text)}" aria-label="Название шага"><button>Сохранить</button><button type="button" data-goal-cancel>Отмена</button></form>`;
  return `<div class="goal-step ${step.done ? 'done' : ''}">
    <label>${goalStepCheckbox(goal, step)}<span>${safe(step.text)}${goalMode(goal) === 'stages' && milestone(step) ? ' <small class="muted">· этап</small>' : ''}</span></label>
    <label class="goal-schedule">${step.date ? 'В календаре' : 'Запланировать'}<input type="date" min="1000-01-01" max="9999-12-31" value="${safe(step.date || '')}" data-goal-schedule="${id}" data-step-id="${sid}" aria-label="Дата шага: ${safe(step.text)}"></label>
    <button data-goal-edit-step="${sid}" type="button" aria-label="Изменить шаг">✎</button>
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
  const nextStage = mode === 'stages' && goal.steps.find(step => milestone(step) && !step.done);
  const done = goal.steps.filter(step => step.done).length;
  return `<article class="goal-card">
    <div class="goal-card-head"><h2>${safe(goal.title)}</h2><button data-goal-edit="${id}" aria-label="Редактировать цель">✎</button><button data-goal-delete="${id}" aria-label="Удалить цель">×</button></div>
    ${goal.why ? `<p class="goal-why">${safe(goal.why)}</p>` : ''}
    ${goal.date ? `<p class="goal-deadline">До ${fmt(new Date(goal.date+'T12:00:00'),{day:'numeric',month:'long',year:'numeric'})}</p>` : ''}
    <div class="goal-trajectory"><h3>Траектория цели</h3>
      ${goal.criterion ? `<p>${safe(goal.criterion)}</p>` : ''}
      <strong>${safe(goalResult(goal))}</strong>
      ${nextStage ? `<p>Следующий этап · ${safe(nextStage.text)}</p>` : ''}
      ${next && next !== nextStage ? `<p>Следующий шаг · ${safe(next.text)}</p>` : ''}
      ${mode === 'finish' ? `<button type="button" data-goal-complete="${id}">${goal.completedAt ? 'Вернуть в работу' : 'Отметить как достигнутую'}</button>` : ''}
      <a href="#analytics?goal=${safe(encodeURIComponent(goal.id))}">Посмотреть динамику</a>
    </div>
    <h3 class="goal-step-title">Шаги · ${done} из ${goal.steps.length}</h3>
    <div class="goal-steps">${goal.steps.map(step => goalStepRow(goal,step)).join('')}</div>
    <form class="goal-add-step" data-goal-form="${id}"><input name="step" maxlength="100" required placeholder="Следующий шаг" aria-label="Новый шаг">
      ${mode === 'stages' ? '<label><input name="milestone" type="checkbox"> Этап</label>' : ''}
      <button type="submit" aria-label="Добавить шаг">＋</button></form>
  </article><aside class="goal-card goal-history-panel"><h3>История прогресса</h3>
    ${mode === 'number' && !goal.measurements?.some(item => item.id === editMeasureId) ? measurementForm(goal) : ''}${goalHistory(goal,'',true)}</aside>`;
}

function goalsScreen() {
  return `<section class="goals-page">
    <details class="goal-new goal-create" ${state.goals.length ? '' : 'open'}><summary>＋ Новая цель</summary>
    <form id="new-goal-form" class="goal-fields">${goalFields()}<button type="submit" class="primary">Создать цель</button></form></details>
    <div class="goal-pairs">${state.goals.map(goal => `<div class="goal-pair">${goalCard(goal)}</div>`).join('') || '<p class="muted">Например, сдать домашку, выпустить приложение или прочитать 12 книг.</p>'}</div>
  </section>`;
}

function goalsSubmit(event) {
  const form = event.target;
  const data = form.dataset;
  const creating = form.id === 'new-goal-form';
  if (!creating && !data.editGoal && !data.goalForm && !data.goalStepEdit && !data.goalMeasure) return;
  event.preventDefault();
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
    if (mode === 'number') Object.assign(goal,{target,unit:fields.unit.value.trim()});
    if (creating) state.goals.unshift(goal);
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
    if (!goal || !text) return;
    if (data.goalStepEdit) {
      const step = goal.steps.find(item => item.id === data.stepId);
      if (!step) return;
      step.text = text;
      editStepId = null;
    } else {
      goal.steps.push({id:crypto.randomUUID(),text,done:false,milestone:Boolean(fields.milestone?.checked)});
      focusStep = goal.id;
    }
    message = data.goalStepEdit ? 'Шаг обновлён' : 'Шаг добавлен';
  }
  if (!save()) return;
  render();
  if (focusStep) $('view').querySelector(`[data-goal-form="${CSS.escape(focusStep)}"] input`)?.focus({preventScroll:true});
  feedback(message);
}

function goalsClick(button) {
  const d = button.dataset;
  if (d.goalEdit || d.goalEditStep || d.measureEdit || button.hasAttribute('data-goal-cancel')) {
    editGoalId = d.goalEdit || null;
    editStepId = d.goalEditStep || null;
    editMeasureId = d.measureEdit || null;
    render();
    $('view').querySelector('[data-edit-goal] input, [data-goal-step-edit] input, [data-goal-measure][data-measure-id]:not([data-measure-id=""]) input')?.focus({preventScroll:true});
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
      if (!confirm('Удалить этот шаг?')) return true;
      goal.steps = goal.steps.filter(step => step.id !== d.stepId);
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
    ${goalMode(goal) === 'number' && measurements.length ? goalMeasureChart(goal, measurements, since) : ''}
    ${goalHistory(goal,since)}<a href="#goals">Открыть цели</a>
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
