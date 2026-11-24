let plannerDate = new Date();
let taskOrder = 'priority';
const taskPriorities = ['Обычный', 'Важный', 'Срочный'];

function dayDistance(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function plannerDayLabel(date) {
  const delta = dayDistance(key(new Date()), key(date));
  return ({'-2':'Позавчера', '-1':'Вчера', 0:'Сегодня', 1:'Завтра', 2:'Послезавтра'})[delta] || short(date);
}

function sortedTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (taskOrder === 'name') return a.name.localeCompare(b.name, 'ru');
    if (taskOrder === 'added') return 0;
    return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (b.priority || 0) - (a.priority || 0);
  });
}

function plannerTask(task, children = [], overdue = false) {
  const age = dayDistance(task.date, key(new Date()));
  const urgency = age >= 7 ? 'red' : age >= 3 ? 'yellow' : 'green';
  const priority = Number(task.priority) || 0;
  return `<li class="plan-task ${overdue ? `is-late late-${urgency}` : ''}">
    <div class="plan-task-row">
      <label><input class="check" type="checkbox" data-task="${safe(task.id)}" ${task.done ? 'checked' : ''}><span>${task.time ? `<time class="task-time">${safe(task.time)}</time>` : ''}<span class="task-name">${safe(task.name)}</span>${task.project ? `<small>${safe(task.project)}</small>` : ''}</span></label>
      ${priority ? `<span class="task-priority priority-${priority}">${taskPriorities[priority]}</span>` : ''}
      ${overdue ? `<small class="late-label">${age} дн. просрочки</small>` : ''}
      <button class="task-star" type="button" data-task-feature="${safe(task.id)}" aria-pressed="${Boolean(task.featured)}" aria-label="Главная задача дня: ${safe(task.name)}" title="Главная задача дня">${task.featured ? '★' : '☆'}</button>
      <button type="button" data-task-edit="${safe(task.id)}" aria-label="Изменить задачу: ${safe(task.name)}" title="Изменить задачу">⋯</button>
      ${!overdue && !task.parentId ? `<button type="button" data-add-subtask="${safe(task.id)}" aria-label="Добавить подзадачу к ${safe(task.name)}" title="Добавить подзадачу">＋</button>` : ''}
    </div>
    ${children.length ? `<ul class="plan-subtasks">${children.map(child => plannerTask(child)).join('')}</ul>` : ''}
  </li>`;
}

function plannerScreen() {
  const date = key(plannerDate);
  const todayKey = key(new Date());
  const tasks = state.tasks.filter(task => task.date === date);
  const parents = new Set(tasks.filter(task => !task.parentId).map(task => task.id));
  const roots = sortedTasks(tasks.filter(task => !parents.has(task.parentId)));
  const overdue = sortedTasks(state.tasks.filter(task => !task.done && task.date < todayKey))
    .sort((a, b) => a.date.localeCompare(b.date));
  const completed = tasks.filter(task => task.done).length;
  return `<section class="panel daily-plan" aria-labelledby="plan-title">
    <div class="plan-top"><div><h2 id="plan-title">${plannerDayLabel(plannerDate)}</h2><p>${fmt(plannerDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div>
      <div class="plan-days" aria-label="Выбрать день"><button type="button" data-plan-move="-1" aria-label="Предыдущий день">‹</button><button type="button" data-plan-today>Сегодня</button><button type="button" data-plan-move="1" aria-label="Следующий день">›</button><input type="date" id="planner-date" value="${date}" min="1000-01-01" max="9999-12-31" aria-label="Дата плана"></div>
    </div>
    <div class="plan-tabs" aria-label="Ближайшие дни">${[0,1,2].map(offset => {
      const day = shift(new Date(), offset);
      return `<button type="button" data-plan-jump="${key(day)}" aria-pressed="${date === key(day)}">${plannerDayLabel(day)}</button>`;
    }).join('')}</div>
    <div class="plan-list-head"><span>${completed} из ${tasks.length} выполнено</span><label>Порядок <select id="task-order" aria-label="Сортировка задач">${[['priority','По важности'],['added','По добавлению'],['name','По названию']].map(([value,label]) => `<option value="${value}" ${taskOrder === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
    ${roots.length ? `<ul class="plan-list">${roots.map(task => plannerTask(task, sortedTasks(tasks.filter(child => child.parentId === task.id)))).join('')}</ul>` : '<p class="plan-empty">На этот день задач пока нет.</p>'}
    <button type="button" class="primary" data-add-task="${date}">＋ Задача</button>
  </section>
  ${overdue.length ? `<section class="panel daily-plan overdue-panel"><div class="plan-top"><div><h2>Просроченные</h2><p>Срок прошёл, задача ещё открыта</p></div><span>${overdue.length}</span></div><ul class="plan-list">${overdue.map(task => plannerTask(task, [], true)).join('')}</ul></section>` : ''}`;
}

function tasksWithFeatured(task, featured, tasks = state.tasks) {
  return tasks.map(item => item.date === task.date ? {...item, featured:item.id === task.id && featured} : item);
}

function plannerClick(button) {
  const {planMove, planJump, taskFeature, taskEdit, addSubtask} = button.dataset;
  if (planMove || planJump || button.hasAttribute('data-plan-today')) {
    if (planMove) plannerDate = shift(plannerDate, Number(planMove));
    else plannerDate = planJump ? new Date(`${planJump}T12:00:00`) : new Date();
    render();
    const selector = planMove ? `[data-plan-move="${planMove}"]` : planJump ? `[data-plan-jump="${planJump}"]` : '[data-plan-today]';
    $('view').querySelector(selector)?.focus({preventScroll:true});
    return true;
  }
  const task = state.tasks.find(item => item.id === (taskFeature || taskEdit || addSubtask));
  if (!task) return false;
  if (taskEdit) openEditor('task', task.date, {task});
  else if (addSubtask) openEditor('task', task.date, {parentId:task.id});
  else {
    state.tasks = tasksWithFeatured(task, !task.featured);
    save();
    render();
    $('view').querySelector(`[data-task-feature="${CSS.escape(task.id)}"]`)?.focus({preventScroll:true});
  }
  return true;
}

function plannerChange(field) {
  if (field.id === 'planner-date' && field.value && field.validity.valid) plannerDate = new Date(`${field.value}T12:00:00`);
  else if (field.id === 'task-order') taskOrder = field.value;
  else return false;
  render();
  $(field.id)?.focus({preventScroll:true});
  return true;
}

function savePlannerTask(name, {task, parentId}) {
  const date = $('date').value;
  const priority = Number($('task-priority').value);
  const project = $('task-project').value.trim();
  const time = $('task-time').value;
  if (!task) {
    state.tasks.push({id:crypto.randomUUID(), name, date, priority, project, time, done:false, parentId});
    return;
  }
  const moved = [task, ...state.tasks.filter(item => item.parentId === task.id)];
  if (task.date !== date && moved.some(item => item.featured)) {
    state.tasks.filter(item => item.date === date).forEach(item => { item.featured = false; });
  }
  if (task.parentId && task.date !== date) task.parentId = undefined;
  moved.forEach(item => { item.date = date; });
  Object.assign(task, {name, priority, project, time});
}
