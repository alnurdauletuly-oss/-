function goalsScreen() {
  const goals=state.goals;
  const cards=goals.map(goal=>{
    const steps=Array.isArray(goal.steps)?goal.steps:[];
    const done=steps.filter(step=>step.done).length;
    const percent=steps.length?Math.round(done/steps.length*100):0;
    return `<article class="goal-card"><div class="goal-card-head"><div><span class="goal-kicker">МОЯ ЦЕЛЬ</span><h2>${safe(goal.title)}</h2></div><button data-goal-delete="${safe(goal.id)}" aria-label="Удалить цель">×</button></div><p class="goal-why">${goal.why?'«'+safe(goal.why)+'»':'Добавь причину, которая поможет не забыть о цели.'}</p><div class="goal-meter"><div><b>${percent}%</b><span>${done} из ${steps.length} шагов</span></div><progress max="100" value="${percent}"></progress></div>${goal.date?`<p class="goal-deadline">◷ До ${safe(fmt(new Date(goal.date+'T12:00:00'),{day:'numeric',month:'long',year:'numeric'}))}</p>`:''}<div class="goal-steps">${steps.map(step=>`<label class="goal-step ${step.done?'done':''}"><input type="checkbox" data-goal-step="${safe(goal.id)}" data-step-id="${safe(step.id)}" ${step.done?'checked':''}><span>${safe(step.text)}</span><button data-step-delete="${safe(goal.id)}" data-step-id="${safe(step.id)}" type="button" aria-label="Удалить шаг">×</button></label>`).join('')||'<p class="muted">Начни с одного небольшого шага.</p>'}</div><form class="goal-add-step" data-goal-form="${safe(goal.id)}"><input name="step" maxlength="100" required placeholder="Следующий маленький шаг" aria-label="Новый шаг"><button type="submit">＋</button></form></article>`;
  }).join('');
  return `<section class="goals-page"><div class="goals-intro"><div><span class="goal-kicker">ДВИЖЕНИЕ К ВАЖНОМУ</span><h2>Большая цель начинается с маленького шага.</h2><p>Запиши, зачем она тебе нужна. Отмечай шаги и смотри, как растёт результат.</p></div><div class="goals-symbol">✦</div></div><form id="new-goal-form" class="goal-new"><input name="title" maxlength="100" required placeholder="Чего хочешь достичь?" aria-label="Название цели"><input name="why" maxlength="180" placeholder="Почему это важно для тебя?" aria-label="Почему цель важна"><label>Срок <input type="date" name="date" aria-label="Срок достижения цели"></label><button type="submit" class="primary">＋ Создать цель</button></form><div class="goals-list">${cards||'<div class="goals-empty">🎯<h3>Выбери то, к чему хочешь прийти</h3><p>Например: прочитать 12 книг, подготовить проект или пробежать 5 км.</p></div>'}</div></section>`;
}
function goalsSubmit(event){
  if(event.target.id==='new-goal-form'){
    event.preventDefault();const form=event.target;
    const title=form.elements.title.value.trim();if(!title)return true;
    state.goals.unshift({id:crypto.randomUUID(),title,why:form.elements.why.value.trim(),date:form.elements.date.value,steps:[]});save();render();return true;
  }
  if(event.target.dataset.goalForm){
    event.preventDefault();const goal=state.goals.find(item=>item.id===event.target.dataset.goalForm);
    const text=event.target.elements.step.value.trim();
    if(goal&&text){goal.steps.push({id:crypto.randomUUID(),text,done:false});save();render();}
    return true;
  }
  return false;
}
function goalsClick(button){
  if(button.dataset.goalDelete){
    if(!confirm('Удалить эту цель и её шаги?'))return true;
    state.goals=state.goals.filter(item=>item.id!==button.dataset.goalDelete);save();render();return true;
  }
  if(button.dataset.stepDelete){
    const goal=state.goals.find(item=>item.id===button.dataset.stepDelete);
    if(goal){goal.steps=goal.steps.filter(step=>step.id!==button.dataset.stepId);save();render();}return true;
  }
  return false;
}
function goalsInput(){return false;}
function goalsChange(target){
  if(!target.dataset.goalStep)return false;
  const goal=state.goals.find(item=>item.id===target.dataset.goalStep);
  const step=goal?.steps.find(item=>item.id===target.dataset.stepId);
  if(step){step.done=target.checked;save();render();}
  return true;
}
