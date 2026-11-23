function goalSteps() {
  return state.goals.flatMap(goal => goal.steps.map(step => ({goal, step})));
}

function goalStepCheckbox(goal, step) {
  return `<input class="check" type="checkbox" data-goal-step="${safe(goal.id)}" data-step-id="${safe(step.id)}" ${step.done ? 'checked' : ''}>`;
}

function goalCard(goal) {
  const done = goal.steps.filter(step => step.done).length;
  const percent = goal.steps.length ? Math.round(done / goal.steps.length * 100) : 0;
  const deadline = goal.date ? fmt(new Date(`${goal.date}T12:00:00`), {day:'numeric', month:'long', year:'numeric'}) : '';
  const steps = goal.steps.map(step => `<div class="goal-step ${step.done ? 'done' : ''}">
    <label>${goalStepCheckbox(goal, step)}<span>${safe(step.text)}</span></label>
    <label class="goal-schedule">${step.date ? 'В календаре' : 'Запланировать'}
      <input type="date" min="1000-01-01" max="9999-12-31" value="${safe(step.date || '')}" data-goal-schedule="${safe(goal.id)}" data-step-id="${safe(step.id)}" aria-label="Дата шага: ${safe(step.text)}">
    </label>
    <button data-step-delete="${safe(goal.id)}" data-step-id="${safe(step.id)}" type="button" aria-label="Удалить шаг">×</button>
  </div>`).join('');
  return `<article class="goal-card">
    <div class="goal-card-head"><h2>${safe(goal.title)}</h2><button data-goal-delete="${safe(goal.id)}" aria-label="Удалить цель">×</button></div>
    ${goal.why ? `<p class="goal-why">${safe(goal.why)}</p>` : ''}
    ${deadline ? `<p class="goal-deadline">До ${deadline}</p>` : ''}
    <div class="goal-meter"><div><b>${percent}%</b><span>${done} из ${goal.steps.length} шагов</span></div><progress aria-label="Прогресс цели" max="100" value="${percent}"></progress></div>
    <div class="goal-steps">${steps || '<p class="muted">Добавь первый шаг.</p>'}</div>
    <form class="goal-add-step" data-goal-form="${safe(goal.id)}"><input name="step" maxlength="100" required placeholder="Следующий шаг" aria-label="Новый шаг"><button type="submit" aria-label="Добавить шаг">＋</button></form>
  </article>`;
}

function goalsScreen() {
  return `<section class="goals-page">
    <form id="new-goal-form" class="goal-new">
      <input name="title" maxlength="100" required placeholder="Чего хочешь достичь?" aria-label="Название цели">
      <input name="why" maxlength="180" placeholder="Почему это важно?" aria-label="Почему цель важна">
      <label>Срок <input type="date" name="date" aria-label="Срок достижения цели"></label>
      <button type="submit" class="primary">＋ Создать цель</button>
    </form>
    <div class="goals-list">${state.goals.map(goalCard).join('') || '<div class="goals-empty">🎯<h2>Создай первую цель</h2><p>Например, подготовить проект или прочитать 12 книг.</p></div>'}</div>
  </section>`;
}

function goalsSubmit(event) {
  const form = event.target;
  if (form.id === 'new-goal-form') {
    event.preventDefault();
    const title = form.elements.title.value.trim();
    if (!title) return true;
    state.goals.unshift({id:crypto.randomUUID(), title, why:form.elements.why.value.trim(), date:form.elements.date.value, steps:[]});
    save();
    render();
    return true;
  }
  if (!form.dataset.goalForm) return false;
  event.preventDefault();
  const goal = state.goals.find(item => item.id === form.dataset.goalForm);
  const text = form.elements.step.value.trim();
  if (goal && text) {
    goal.steps.push({id:crypto.randomUUID(), text, done:false});
    save();
    render();
    $('view').querySelector(`[data-goal-form="${CSS.escape(goal.id)}"] input`)?.focus();
  }
  return true;
}

function goalsClick(button) {
  if (button.dataset.goalDelete) {
    if (!confirm('Удалить эту цель и её шаги?')) return true;
    state.goals = state.goals.filter(item => item.id !== button.dataset.goalDelete);
  } else if (button.dataset.stepDelete) {
    const goal = state.goals.find(item => item.id === button.dataset.stepDelete);
    if (!goal) return true;
    goal.steps = goal.steps.filter(step => step.id !== button.dataset.stepId);
  } else return false;
  save();
  render();
  return true;
}

function goalsChange(target) {
  const {goalStep, goalSchedule, stepId} = target.dataset;
  if (!goalStep && !goalSchedule) return false;
  const goal = state.goals.find(item => item.id === (goalStep || goalSchedule));
  const step = goal?.steps.find(item => item.id === stepId);
  if (!step || !target.validity.valid) return true;
  if (goalSchedule) step.date = target.value;
  else step.done = target.checked;
  save();
  render();
  const attribute = goalSchedule ? 'data-goal-schedule' : 'data-goal-step';
  const replacement = $('view').querySelector(`[${attribute}][data-step-id="${CSS.escape(stepId)}"]`);
  const next = replacement || $('view').querySelector('.today-step input, .today-card a[href="#goals"]');
  next?.focus({preventScroll:true});
  return true;
}
