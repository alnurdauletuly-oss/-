let plannerDate = new Date();
const taskOrders = [['priority','По важности'], ['added','По добавлению'], ['name','По названию'], ['manual','Вручную']];
const taskPriorities = ['Обычный', 'Важный', 'Срочный'];

function dayDistance(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function plannerDayLabel(date) {
  const delta = dayDistance(key(new Date()), key(date));
  return ({'-2':'Позавчера', '-1':'Вчера', 0:'Сегодня', 1:'Завтра', 2:'Послезавтра'})[delta] || short(date);
}

function sortedTasks(tasks) {
  const taskOrder = state.taskOrder;
  return [...tasks].sort((a, b) => {
    if (taskOrder === 'manual') return (a.manualOrder ?? Number.MAX_SAFE_INTEGER) - (b.manualOrder ?? Number.MAX_SAFE_INTEGER);
    if (taskOrder === 'name') return a.name.localeCompare(b.name, 'ru');
    if (taskOrder === 'added') return 0;
    return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (b.priority || 0) - (a.priority || 0);
  });
}

let taskDraft = '';
let taskEditId = '';
let calendarTaskDraft = '';

function taskComposer(date, parentId = '') {
  return `<form class="quick-task" data-quick-task="${safe(date)}" data-parent-id="${safe(parentId)}">
    <input name="name" maxlength="120" required placeholder="${parentId ? 'Название подзадачи' : 'Что нужно сделать?'}" aria-label="${parentId ? 'Название подзадачи' : 'Название новой задачи'}">
    <button type="submit" class="primary">Добавить</button>
    <button type="button" data-task-cancel aria-label="Отменить">×</button>
  </form>`;
}

function plannerTask(task, children = [], overdue = false) {
  const id = safe(task.id);
  const name = safe(task.name);
  const age = dayDistance(task.date, key(new Date()));
  const urgency = age >= 7 ? 'red' : age >= 3 ? 'yellow' : 'green';
  const priority = Number(task.priority) || 0;
  return `<li class="plan-task ${task.done ? 'task-done' : ''} ${overdue ? `is-late late-${urgency}` : ''}">
    <div class="plan-task-row" ${!overdue ? `data-task-drop="${id}" ${!task.parentId ? 'data-task-parent' : ''}` : ''}>
      <input class="check" aria-label="Выполнено: ${name}" type="checkbox" data-task="${id}" ${task.done ? 'checked' : ''}>
      ${taskEditId === task.id ? `<form class="quick-task task-inline-edit" data-quick-edit="${id}">
        <input name="name" value="${name}" maxlength="120" aria-label="Изменить название задачи" placeholder="Пустое название удалит задачу">
        <button type="submit">Готово</button><button type="button" data-task-cancel aria-label="Отменить">×</button></form>` :
        `<button class="task-text" type="button" data-task-name="${id}">${task.time ? `<time class="task-time">${safe(task.time)}</time>` : ''}<span class="task-name">${name}</span>${task.project ? `<small>${safe(task.project)}</small>` : ''}</button>`}
      ${priority ? `<span class="task-priority priority-${priority}">${taskPriorities[priority]}</span>` : ''}
      ${overdue ? `<small class="late-label">${task.done ? 'Выполнено' : age + ' дн. просрочки'}</small><button type="button" class="reorder-handle" data-task-drag="${id}" aria-label="Перенести ${name}">⠿</button>` : ''}
      <button class="task-star" type="button" data-task-feature="${id}" aria-pressed="${Boolean(task.featured)}" aria-label="Главная задача дня: ${name}">${task.featured ? '★' : '☆'}</button>
      <span class="row-actions"><button type="button" data-task-menu="${id}" aria-label="Действия с задачей: ${name}">⋯</button></span>
      ${!task.parentId ? `<button type="button" data-add-subtask="${id}" aria-label="Добавить подзадачу к ${name}">＋</button>` : ''}
    </div>
    ${children.length ? `<ul class="plan-subtasks">${children.map(child => plannerTask(child)).join('')}</ul>` : ''}
    ${taskDraft === task.id ? taskComposer(task.date, task.id) : ''}
  </li>`;
}

function openQuickTask(parent = 'root') {
  taskDraft = parent;
  taskEditId = '';
  render();
  $('view').querySelector('[data-quick-task] input')?.focus();
}

function plannerSubmit(event) {
  const form = event.target;
  if (!form.dataset.quickTask && !form.dataset.quickEdit) return;
  event.preventDefault();
  const name = form.elements.name.value.trim();
  if (form.dataset.quickEdit) {
    const task = state.tasks.find(item => item.id === form.dataset.quickEdit);
    if (!task) return;
    if (!name) { deletePlannerTask(task.id); return; }
    task.name = name;
    taskEditId = '';
  } else {
    if (!name) return;
    const parent = state.tasks.find(item => item.id === form.dataset.parentId);
    if (form.dataset.parentId && !parent) return;
    state.tasks.push({id:crypto.randomUUID(), name, date:parent?.date || form.dataset.quickTask, done:false,
      ...(parent ? {parentId:parent.id} : {})});
  }
  if (!save()) return;
  render();
  $('view').querySelector('[data-quick-task] input')?.focus({preventScroll:true});
  feedback(form.dataset.quickEdit ? 'Задача обновлена' : 'Задача добавлена');
}

function deletePlannerTask(id) {
  const tasks = state.tasks.filter(task => task.id !== id)
    .map(task => task.parentId === id ? {...task, parentId:undefined, manualOrder:undefined} : task);
  if (!save({...state, tasks})) return;
  state.tasks = tasks;
  taskEditId = '';
  if (taskDraft === id) taskDraft = '';
  render();
  feedback('Задача удалена');
}

function movePlannerTask(id, parentId, selectedDay = key(plannerDate), placement) {
  const task = state.tasks.find(item => item.id === id);
  const parent = state.tasks.find(item => item.id === parentId);
  if (!task || (parentId && (!parent || parent.id === id || parent.parentId))) return;
  const date = parent?.date || selectedDay;
  const sameGroup = task.date === date && (task.parentId || '') === (parentId || '');
  if (sameGroup && !placement) return;
  const children = state.tasks.filter(item => item.parentId === id);
  let positions = null;
  if (placement) {
    const siblings = sortedTasks(state.tasks.filter(item => item.date === date &&
      (item.parentId || '') === (parentId || '') && item !== task && !children.includes(item)));
    const index = siblings.findIndex(item => item.id === placement.id);
    if (index < 0) return;
    siblings.splice(index + Number(placement.after), 0, task);
    positions = new Map(siblings.map((item, order) => [item.id, order]));
  }
  const updated = state.tasks.map(item => {
    if (item === task) return {...item, date, parentId:parent?.id,
      featured:sameGroup ? item.featured : false, doneLate:date === item.date ? item.doneLate : false,
      manualOrder:positions?.get(id)};
    if (children.includes(item) && !sameGroup) return {...item, date, parentId:parent?.id || id,
      featured:false, doneLate:date === item.date ? item.doneLate : false,
      manualOrder:parent ? undefined : item.manualOrder};
    if (positions?.has(item.id)) return {...item, manualOrder:positions.get(item.id)};
    return item;
  });
  const taskOrder = placement ? 'manual' : state.taskOrder;
  if (!save({...state, tasks:updated, taskOrder})) return;
  Object.assign(state, {tasks:updated, taskOrder});
  render();
  feedback(sameGroup ? 'Порядок задач изменён' : parent ? 'Перенесено в подзадачи' : 'Задача перенесена');
}

function copyTodayPlan() {
  const now = new Date();
  const today = key(now);
  if (key(plannerDate) !== today) return;
  const tomorrow = shift(now, 1);
  const date = key(tomorrow);
  const tomorrowTasks = state.tasks.filter(task => task.date === date);
  const existingCopies = new Map(tomorrowTasks.filter(task => task.copiedFromTaskId)
    .map(task => [task.copiedFromTaskId, task]));
  const sourceTasks = state.tasks.filter(task => task.date === today && !existingCopies.has(task.id));
  const copyIds = new Map(sourceTasks.map(task => [task.id, crypto.randomUUID()]));
  const keepFeatured = !tomorrowTasks.some(task => task.featured);
  const copies = sourceTasks.map(task => {
    const existingParent = existingCopies.get(task.parentId);
    return {
      ...task,
      id:copyIds.get(task.id),
      copiedFromTaskId:task.id,
      parentId:existingParent ? existingParent.parentId || existingParent.id : copyIds.get(task.parentId),
      date,
      done:false,
      doneLate:false,
      featured:keepFeatured && Boolean(task.featured)
    };
  });
  if (copies.length) {
    const tasks = [...state.tasks, ...copies];
    if (!save({...state, tasks})) return;
    state.tasks = tasks;
  }
  plannerDate = tomorrow;
  render();
  $('view').querySelector(`[data-plan-jump="${date}"]`)?.focus();
  feedback(copies.length ? `Скопировано на завтра: ${copies.length}` : 'Задачи уже скопированы на завтра');
}

function plannerScreen() {
  const date = key(plannerDate);
  const now = new Date();
  const todayKey = key(now);
  const tasks = state.tasks.filter(task => task.date === date);
  const parents = new Set(tasks.filter(task => !task.parentId).map(task => task.id));
  const roots = sortedTasks(tasks.filter(task => !parents.has(task.parentId)));
  const overdue = sortedTasks(state.tasks.filter(task => task.date < todayKey && task.date !== date && (!task.done || task.doneLate)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const completed = tasks.filter(task => task.done).length;
  return `<section class="panel daily-plan" aria-labelledby="plan-title" data-plan-drop="${date}">
    <div class="plan-top"><div><h2 id="plan-title">${plannerDayLabel(plannerDate)}</h2><p>${fmt(plannerDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div>
      <div class="plan-days" aria-label="Выбрать день"><button type="button" data-plan-move="-1" aria-label="Предыдущий день">‹</button><button type="button" data-plan-today>Сегодня</button><button type="button" data-plan-move="1" aria-label="Следующий день">›</button><input type="date" id="planner-date" value="${date}" min="1000-01-01" max="9999-12-31" aria-label="Дата плана"></div>
    </div>
    <div class="plan-tabs" aria-label="Ближайшие дни">${[0,1,2].map(offset => {
      const day = shift(now, offset);
      return `<button type="button" data-plan-jump="${key(day)}" aria-pressed="${date === key(day)}">${plannerDayLabel(day)}</button>`;
    }).join('')}</div>
    <div class="plan-list-head"><span>${completed} из ${tasks.length} выполнено</span><label>Порядок <select id="task-order" aria-label="Сортировка задач">${taskOrders.map(([value,label]) => `<option value="${value}" ${(state.taskOrder || 'priority') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
    ${roots.length ? `<ul class="plan-list">${roots.map(task => plannerTask(task, sortedTasks(tasks.filter(child => child.parentId === task.id)))).join('')}</ul>` : '<p class="plan-empty">На этот день задач пока нет.</p>'}
    ${taskDraft === 'root' ? taskComposer(date) : `<div class="plan-actions">
      <button type="button" class="primary" data-quick-start>＋ Задача</button>
      ${date === todayKey && tasks.length && !taskDraft && !taskEditId ? '<button type="button" data-copy-today-plan>Копировать на завтра</button>' : ''}
    </div>`}
  </section>
  ${overdue.length ? `<section class="panel daily-plan overdue-panel"><div class="plan-top"><div><h2>Просроченные</h2><p>Срок этих задач уже прошёл</p></div><span>${overdue.filter(task => !task.done).length}</span></div><ul class="plan-list">${overdue.map(task => plannerTask(task, [], true)).join('')}</ul></section>` : ''}`;
}

function tasksWithFeatured(task, featured, tasks = state.tasks) {
  return tasks.map(item => item.date === task.date ? {...item, featured:item.id === task.id && featured} : item);
}

function plannerClick(button) {
  const {taskName, taskMenu, taskDrag} = button.dataset;
  if (button.hasAttribute('data-copy-today-plan')) { copyTodayPlan(); return true; }
  if (button.hasAttribute('data-quick-start')) { openQuickTask(); return true; }
  if (button.hasAttribute('data-task-cancel')) { calendarTaskDraft = taskDraft = taskEditId = ''; render(); return true; }
  if (taskName) {
    taskEditId = taskName;
    taskDraft = '';
    render();
    const input = $('view').querySelector('[data-quick-edit] input');
    input?.focus({preventScroll:true});
    input?.select();
    return true;
  }
  if (taskDrag || taskMenu) {
    const item = state.tasks.find(task => task.id === (taskDrag || taskMenu));
    if (!item) return true;
    const actions = [
      ...(taskMenu ? [['Дата, проект и важность', () => openEditor('task', item.date, {task:item})]] : []),
      ...(item.date !== key(plannerDate) || item.parentId ? [['Перенести на выбранный день', () => movePlannerTask(item.id)]] : []),
      ...state.tasks.filter(task => !task.parentId && task.id !== item.id && task.date === key(plannerDate))
        .map(task => [`В подзадачи · ${task.name}`, () => movePlannerTask(item.id, task.id)]),
      ['Удалить', () => {
        if (confirm(`Удалить задачу «${item.name}»?`)) deletePlannerTask(item.id);
      }]
    ];
    showActionMenu(button, actions);
    return true;
  }
  const {planMove, planJump, taskFeature, taskEdit, addSubtask} = button.dataset;
  if (planMove || planJump || button.hasAttribute('data-plan-today')) {
    taskDraft = taskEditId = '';
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
  else if (addSubtask) openQuickTask(task.id);
  else {
    state.tasks = tasksWithFeatured(task, !task.featured);
    save();
    render();
    $('view').querySelector(`[data-task-feature="${CSS.escape(task.id)}"]`)?.focus({preventScroll:true});
  }
  return true;
}

function plannerChange(field) {
  if (field.id === 'planner-date' && field.value && field.validity.valid) {
    plannerDate = new Date(`${field.value}T12:00:00`);
    taskDraft = taskEditId = '';
  }
  else if (field.id === 'task-order') {
    if (!save({...state, taskOrder:field.value})) {
      field.value = state.taskOrder || 'priority';
      return true;
    }
    state.taskOrder = field.value;
  }
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
  moved.forEach(item => { if (item.date !== date) item.doneLate = false; item.date = date; });
  Object.assign(task, {name, priority, project, time});
}
