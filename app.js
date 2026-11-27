const $ = id => document.getElementById(id);
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const templates = ['Подъём в 07:00', 'Стакан воды', 'Зарядка 10 минут', 'Чтение 20 минут', 'Прогулка', 'Изучение языка', 'Медитация', 'Планирование дня', 'Сон до 23:00'];
const storageKey = 'jospat.core.v1';
const screens = { habits: 'Трекер привычек', calendar: 'Календарь' };
const today = new Date();
today.setHours(12, 0, 0, 0);
let focusDate = new Date(today);
let screen;
let editorType;
let editorOptions = {};
let state = { habits: [], tasks: [], events: [], notes: [], journal: {}, maps: [], goals: [] };
let activeNoteId = null;
let noteQuery = '';
let mountPlanet;

function key(date) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
function shift(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate()+days);
  return next;
}
function weekday(date) { return (date.getDay()+6)%7; }
function week(date) {
  const monday = shift(date, -weekday(date));
  return weekdays.map((_, i) => shift(monday, i));
}
function fmt(date, options) { return date.toLocaleDateString('ru-RU', options); }
function short(date) { return fmt(date,{day:'numeric',month:'short'}); }
function safe(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function seed() {
  const days = week(today);
  state.habits = [0,1,2,3,7].map((index,i) => ({
    id:'sample-'+i, name:templates[index], days:i===2?[0,2,4]:[0,1,2,3,4,5,6],
    done:days.filter((d,j) => d < today && (j+i)%4!==0).map(key)
  }));
  state.tasks = ['Подготовить конспект','Разобрать задания на неделю'].map((name,i) => ({
    id:'task-'+i, name, date:key(today), done:i===0
  }));
}
function save(data = state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
    return true;
  } catch {
    $('status').textContent = 'Браузер не смог сохранить изменения на устройстве.';
    return false;
  }
}
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.habits) && Array.isArray(saved.tasks)) state={...saved, events:Array.isArray(saved.events)?saved.events:[], notes:Array.isArray(saved.notes)?saved.notes:[], journal:saved.journal&&typeof saved.journal==='object'?saved.journal:{}, maps:Array.isArray(saved.maps)?saved.maps:[], goals:Array.isArray(saved.goals)?saved.goals:[]};
  else { seed(); save(); }
} catch { seed(); $('status').textContent='Открыт пример недели.'; }

function dailyProductivity(date) {
  const plannedHabits=state.habits.filter(habit=>habitScheduled(habit, date));
  const paused=state.habits.filter(habit=>habitPaused(habit,key(date))).length;
  const done=plannedHabits.filter(habit=>habit.done.includes(key(date))).length;
  return {date,planned:plannedHabits.length,done,paused,percent:plannedHabits.length?Math.round(done/plannedHabits.length*100):null};
}
function lineChart(days) {
  const values=days.map(date=>date<=today?dailyProductivity(date).percent:null);
  const x=index=>55 + index * 600 / Math.max(days.length - 1, 1), y=value=>170-value*1.3;
  const dense = days.length > 10;
  const grid=[100,75,50,25,0].map(value=>`<line x1="55" y1="${y(value)}" x2="655" y2="${y(value)}" class="line-grid"/><text x="43" y="${y(value)+4}" text-anchor="end" class="axis-label">${value}%</text>`).join('');
  const segments = [];
  values.forEach((value,index) => {
    if (value === null) return;
    if (index === 0 || values[index-1] === null) segments.push([]);
    segments.at(-1).push([x(index), y(value)]);
  });
  const curves = segments.map(points => {
    const [first, ...rest] = points;
    let path = `M ${first.join(' ')}`;
    for (let i = 0; i < rest.length; i++) {
      const [a,b] = points[i], [c,d] = rest[i];
      const mid = (a+c)/2;
      path += ` C ${mid} ${b}, ${mid} ${d}, ${c} ${d}`;
    }
    const area = `${path} L ${points.at(-1)[0]} ${y(0)} L ${first[0]} ${y(0)} Z`;
    return `<path d="${area}" fill="url(#habit-area)"/><path d="${path}" class="line-path"/>`;
  }).join('');
  const latest = values.findLastIndex(value => value !== null);
  const dots = values.map((value,index) => value === null ? '' : `<circle cx="${x(index)}" cy="${y(value)}" r="${index === latest ? 5 : 3}" class="line-dot"><title>${short(days[index])} · ${value}%</title></circle>`).join('');
  const latestMark = latest < 0 ? '' : `<line x1="${x(latest)}" x2="${x(latest)}" y1="${y(values[latest])}" y2="${y(0)}" class="goal-target-line"/><text x="${x(latest)}" y="${y(values[latest])-12}" text-anchor="middle" class="point-label">${values[latest]}%</text>`;
  const dates=days.map((date,index)=>dense && index % 5 !== 0 && index !== days.length-1 ? '' : `<text x="${x(index)}" y="203" text-anchor="middle" class="axis-label">${short(date)}</text>`).join('');
  return `<section class="panel line-panel"><div class="panel-head"><div><h2>Выполнение привычек по дням</h2><small>Средний процент выполнения всех привычек, запланированных на день</small></div></div><div class="chart-scroll"><svg class="productivity-chart" viewBox="0 0 700 215" role="img" aria-label="Выполнение привычек по датам: ${values.map((value,index)=>value===null?'':short(days[index])+' — '+value+'%').filter(Boolean).join(', ')}"><defs><linearGradient id="habit-area" x2="0%" y2="100%"><stop stop-color="#bbf029" stop-opacity=".28"/><stop offset="100%" stop-color="#bbf029" stop-opacity="0"/></linearGradient></defs>${grid}${curves}${latestMark}${dots}${dates}</svg></div></section>`;
}
function noteListItems() {
  const filtered = state.notes
    .filter(note => (note.title + ' ' + note.body + ' ' + (note.checklist || []).map(item => item.text).join(' ')).toLocaleLowerCase('ru').includes(noteQuery.toLocaleLowerCase('ru')))
    .sort((a,b) => Number(b.pinned)-Number(a.pinned) || b.updated.localeCompare(a.updated));
  return filtered.length ? filtered.map(note => {
    const title = safe(note.title.trim() || 'Новая заметка');
    const preview = safe((note.body.trim() || note.checklist?.find(item => item.text.trim())?.text || '').replace(/\s+/g,' ').slice(0,90) || 'Начни писать…');
    const date = new Date(note.updated).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
    return `<button class="note-item ${note.id===activeNoteId?'selected':''}" data-note="${safe(note.id)}"><strong>${title}</strong><span>${preview}</span><small>${note.pinned?'◆ Закреплено · ':''}${date}</small></button>`;
  }).join('') : `<p class="note-empty">${noteQuery?'Ничего не найдено.':'Нажми «Новая заметка», чтобы сохранить мысль.'}</p>`;
}
function noteUpdatedLabel(note) {
  return `Изменено ${new Date(note.updated).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}`;
}
function notesScreen() {
  const current = currentNote();
  const list = `<div class="notes-list"><div class="notes-search"><span aria-hidden="true">⌕</span><input id="note-search" type="search" placeholder="Поиск заметок" aria-label="Поиск заметок" value="${safe(noteQuery)}"></div><div class="notes-list-head"><strong>Все заметки</strong><span>${state.notes.length}</span></div><div class="note-items" id="note-items">${noteListItems()}</div></div>`;
  const editor = current ? `<div class="note-actions"><button data-note-back>← К списку</button><span id="note-save-status" role="status">Сохраняется автоматически</span><button data-pin-note="${safe(current.id)}" aria-label="${current.pinned?'Открепить':'Закрепить'} заметку">${current.pinned?'◆':'◇'}</button><button data-delete-note="${safe(current.id)}" aria-label="Удалить заметку">Удалить</button></div><input id="note-title" maxlength="120" placeholder="Название" aria-label="Название заметки" value="${safe(current.title)}">${noteEditorMarkup()}<div class="note-updated" id="note-updated">${noteUpdatedLabel(current)}</div>` : `<div class="note-placeholder"><span>✎</span><h2>Место для твоих мыслей</h2><p>Выбери заметку или создай новую.</p><button class="primary" data-new-note>＋ Новая заметка</button></div>`;
  return `<div class="notes-app ${current?'note-selected':''}">${list}<div class="note-editor">${editor}</div></div>`;
}
function calendar() {
  const first=new Date(focusDate.getFullYear(),focusDate.getMonth(),1,12);
  const last=new Date(first.getFullYear(),first.getMonth()+1,0,12);
  const steps = goalSteps();
  const cells=weekdays.map(d=>`<div class="weekday">${d}</div>`);
  for (let i=0;i<weekday(first);i++) cells.push('<div class="calendar-blank"></div>');
  for (let n=1;n<=last.getDate();n++) {
    const date=shift(first,n-1), day=key(date);
    const events=state.events.filter(event=>event.date===day).sort((a,b)=>a.time.localeCompare(b.time));
    const tasks=state.tasks.filter(task=>task.date===day);
    const daySteps = steps.filter(({ step }) => step.date === day);
    cells.push(`<button aria-pressed="${day===key(focusDate)}" class="${day===key(focusDate)?'chosen':''} ${day===key(today)?'is-today':''}" data-day="${day}" aria-label="${short(date)}, событий: ${events.length}, задач: ${tasks.length}, шагов: ${daySteps.length}"><span class="calendar-date">${n}</span>${events.slice(0,3).map(event=>`<span class="event-chip">${safe(event.time)} ${safe(event.name)}</span>`).join('')}${events.length>3?`<small>Ещё ${events.length-3}</small>`:''}${tasks.length?`<small>Задачи: ${tasks.length}</small>`:''}${daySteps.length ? `<small class="calendar-goal-count">Шаги: ${daySteps.length}</small>` : ''}</button>`);
  }
  const selected=key(focusDate);
  const composing = calendarTaskDraft === selected;
  const selectedSteps = steps.filter(({step}) => step.date === selected);
  const goalRows = selectedSteps.map(({goal, step}) => `<label class="calendar-task calendar-goal">
    ${goalStepCheckbox(goal, step)}<span>${safe(step.text)}<small>${safe(goal.title)}</small></span>
  </label>`).join('');
  const events=state.events.filter(event=>event.date===selected).sort((a,b)=>a.time.localeCompare(b.time));
  return `<div class="calendar">${cells.join('')}</div><section class="panel calendar-detail" id="calendar-detail" tabindex="-1"><div class="panel-head"><div><h2>${fmt(focusDate,{weekday:'long',day:'numeric',month:'long'})}</h2><small>События, задачи и шаги к целям</small></div><div class="calendar-add">${composing ? '' : `<button data-calendar-task="${selected}">＋ Задача</button>`}<button class="primary" data-add-event="${selected}">＋ Событие</button></div></div><div class="event-list">${events.length?events.map(event=>`<div class="event-row"><time>${safe(event.time)}</time><span>${safe(event.name)}</span><button data-delete-event="${safe(event.id)}" aria-label="Удалить событие ${safe(event.name)}">×</button></div>`).join(''):'<p class="muted">Пока нет событий. Добавь важное на этот день.</p>'}</div>${composing ? taskComposer(selected) : ''}${goalRows}${state.tasks.filter(task=>task.date===selected).map(task=>`<label class="calendar-task"><input class="check" type="checkbox" data-task="${safe(task.id)}" ${task.done?'checked':''}>${safe(task.name)}</label>`).join('')}</section>`;
}
function render() {
  const now = new Date();
  if (key(now) !== key(today)) {
    if (key(focusDate) === key(today)) focusDate = new Date(now);
    if (key(plannerDate) === key(today)) plannerDate = new Date(now);
    today.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const [route, query] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  if(route==='weekly'){location.replace('#habits');return;}
  const module = modules.find(item => item.id === route);
  screen = Object.hasOwn(screens, route) || module ? route : 'home';
  const isCore = Object.hasOwn(screens, screen);
  const isHome = screen === 'home';
  const isAvoidance = screen === 'habits' && params.get('view') === 'avoidance';
  if (screen !== 'mind') mindEntrance = true;
  document.body.classList.toggle('home-page', isHome);
  document.body.classList.toggle('notes-page', screen==='notes');
  document.body.classList.toggle('note-editing', screen==='notes' && !!activeNoteId);
  $('back').hidden=isHome;
  $('back').href = screen === 'focus' ? '#sections' : '#home';
  $('back').textContent = screen === 'focus' ? '← Все разделы' : '← Сегодня';
  const current = route === 'sections' ? 'sections' : screen;
  document.querySelectorAll('.site-links a, .mobile-nav a').forEach(link => {
    if (link.hash === '#' + current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('title').closest('header').hidden = isHome;
  $('today').hidden=isHome;
  $('title').textContent = isHome ? 'Сегодня' : screens[screen] || module.title;
  $('primary').hidden = isAvoidance || (!isCore && screen !== 'notes' && screen !== 'tasks');
  document.querySelector('.toolbar').hidden = isAvoidance || (!isCore && (screen !== 'analytics' || params.has('goal')));
  $('primary').textContent = screen === 'habits' ? '＋ Привычка' : screen==='notes'?'＋ Новая заметка':screen==='tasks'?'＋ Задача':'＋ Событие';
  $('today').textContent = fmt(today, { weekday: 'long', day: 'numeric', month: 'long' });
  const days = week(focusDate);
  $('period').textContent = screen === 'calendar' || (screen === 'habits' && habitRange === 'month')
    ? fmt(focusDate, { month: 'long', year: 'numeric' })
    : short(days[0]) + ' — ' + short(days[6]) + ' ' + days[6].getFullYear();
  const views = {
    home: homeScreen,
    habits: () => habitsScreen(isAvoidance),
    focus: () => focusScreen(params.get('task')),
    tasks: plannerScreen,
    calendar,
    analytics: () => analyticsScreen(days, params),
    notes: notesScreen,
    journal: journalScreen,
    mind: mindScreen,
    goals: goalsScreen
  };
  $('view').querySelector('.mind-node-input')?.blur();
  const horizontal = $('orbit-scroll')?.scrollLeft;
  $('view').innerHTML = views[screen]();
  updateFocusPanel();
  updateFocusAmbience();
  observeProgressStar();
  void mountNoteEditor();
  mountPlanet?.($('planet-anchor'));
  if (horizontal !== undefined && $('orbit-scroll')) $('orbit-scroll').scrollLeft = horizontal;
  document.title = $('title').textContent + ' · JOSPAT';
}
function move(direction) {
  if(screen==='calendar' || (screen==='habits' && habitRange==='month')) focusDate=new Date(focusDate.getFullYear(),focusDate.getMonth()+direction,1,12);
  else focusDate=shift(focusDate,7*direction);
  render();
}
$('prev').onclick=()=>move(-1);
$('next').onclick=()=>move(1);
$('current').onclick=()=>{focusDate=new Date(today);render();};
$('template').innerHTML='<option value="">Своя привычка</option>'+templates.map((name,i)=>`<option value="${i}">${name}</option>`).join('');
$('schedule').innerHTML=weekdays.map((day,i)=>`<label><input type="checkbox" value="${i}" checked>${day}</label>`).join('');
function openEditor(type, date=key(focusDate), options={}) {
  editorType = type;
  editorOptions = options;
  const {habit, task, parentId} = options;
  const isHabit = type === 'habit';
  const isTask = type === 'task';
  const parent = state.tasks.find(item => item.id === parentId);
  $('entry').reset();
  const weekdaysInputs = Array.from($('schedule').querySelectorAll('input'));
  weekdaysInputs[0].setCustomValidity('');
  weekdaysInputs.forEach(input => { input.checked = !habit || habit.days.includes(Number(input.value)); });
  $('name').setCustomValidity('');
  $('dialog-title').textContent = isHabit ? (habit ? 'Изменить привычку' : 'Добавить привычку') : isTask ? (task ? 'Изменить задачу' : parent ? 'Новая подзадача' : 'Новая задача') : 'Новое событие';
  $('editor').classList.toggle('habit-drawer', isHabit);
  $('template-fields').hidden = !isHabit || Boolean(habit);
  $('habit-fields').hidden = !isHabit;
  $('habit-delete').hidden = !habit;
  updateHabitPauseButton(habit);
  $('schedule-fields').hidden = !isHabit;
  $('task-fields').hidden = isHabit;
  $('planner-fields').hidden = !isTask;
  $('date').required = !isHabit;
  $('date').readOnly = Boolean(parent);
  $('date').value = date;
  $('event-time-fields').hidden = type !== 'event';
  $('event-time').required = type === 'event';
  $('name').value = habit?.name || task?.name || '';
  $('habit-description').value = habit?.description || '';
  $('habit-color').value = habit ? habitColor(habit, state.habits.indexOf(habit)) : habitColors[state.habits.length % habitColors.length];
  $('task-project').value = task?.project || parent?.project || '';
  $('task-time').value = task?.time || '';
  $('task-priority').value = task?.priority || 0;
  updateHabitPalette();
  $('editor').showModal();
  $('name').focus();
}
function updateHabitPalette() {
  $('habit-palette').innerHTML = habitColors.map((color,index) => `<button type="button" style="--swatch:${color}" data-color="${color}" aria-pressed="${$('habit-color').value === color}" aria-label="Цвет ${index+1}"></button>`).join('');
}
$('habit-palette').onclick = event => {
  const color = event.target.dataset.color;
  if (!color) return;
  $('habit-color').value = color;
  updateHabitPalette();
  $('habit-palette').querySelector(`[data-color="${color}"]`)?.focus();
};
$('habit-color').oninput = updateHabitPalette;
$('habit-pause').onclick = () => {
  const habit = editorOptions.habit;
  if (toggleHabitPause(habit)) {
    updateHabitPauseButton(habit);
    render();
  }
};
$('habit-delete').onclick = () => {
  const habit = editorOptions.habit;
  if (!habit || !confirm(`Удалить привычку «${habit.name}» и её отметки?`)) return;
  state.habits = state.habits.filter(item => item.id !== habit.id);
  save();
  $('editor').close();
  render();
  $('primary').focus();
};
$('template').onchange=()=>{$('name').value=templates[$('template').value]||'';};
$('name').oninput=()=>$('name').setCustomValidity('');
$('schedule').onchange=()=>$('schedule').querySelector('input').setCustomValidity('');
function newNote() {
  const note={id:crypto.randomUUID(),title:'',body:'',pinned:false,updated:new Date().toISOString()};
  state.notes.unshift(note);activeNoteId=note.id;save();render();$('note-title')?.focus();
}
$('primary').onclick=()=>{if(screen==='habits')openEditor('habit');else if(screen==='notes')newNote();else if(screen==='tasks')openQuickTask();else openEditor('event');};
$('close').onclick=()=>$('editor').close();
$('entry').onsubmit=e=>{
  e.preventDefault();
  const name=$('name').value.trim();
  if(!name){$('name').setCustomValidity('Введите название');$('name').reportValidity();return;}
  if (editorType === 'habit') {
    if (!saveHabit(name, editorOptions.habit)) return;
  } else if (editorType === 'event') {
    state.events.push({id:crypto.randomUUID(),name,date:$('date').value,time:$('event-time').value});
    focusDate = new Date(`${$('date').value}T12:00:00`);
  } else {
    savePlannerTask(name, editorOptions);
    const selected = new Date(`${$('date').value}T12:00:00`);
    if (screen === 'calendar') focusDate = selected;
    else if (!editorOptions.task) plannerDate = selected;
  }
  save();$('editor').close();render();
};
$('view').onclick=e=>{
  if (e.target.closest('[data-today-planner]')) plannerDate = new Date();
  const button=e.target.closest('button');
  if(!button)return;
  if (button.dataset.progressStar) { selectProgressStar(button); return; }
  if (button.dataset.starPage) { changeConstellationPage(button.dataset.starPage); return; }
  if (avoidanceClick(button)) return;
  if(habitsClick(button) || plannerClick(button)) return;
  if(journalClick(button))return;
  if(mindClick(button))return;
  if(goalsClick(button) || noteToolsClick(button))return;
  if(button.hasAttribute('data-new-note'))newNote();
  if(button.hasAttribute('data-note')){activeNoteId=button.dataset.note;render();}
  if(button.hasAttribute('data-note-back')){activeNoteId=null;render();}
  if(button.hasAttribute('data-pin-note')){const note=state.notes.find(item=>item.id===button.dataset.pinNote);if(note){note.pinned=!note.pinned;save();render();}}
  if(button.hasAttribute('data-delete-note')){state.notes=state.notes.filter(item=>item.id!==button.dataset.deleteNote);activeNoteId=null;save();render();}
  if(button.hasAttribute('data-advanced-habit'))openEditor('habit');
  if (button.dataset.calendarTask) {
    calendarTaskDraft = button.dataset.calendarTask;
    render();
    $('view').querySelector('[data-quick-task] input')?.focus();
  }
  if(button.dataset.addEvent)openEditor('event',button.dataset.addEvent);
  if(button.dataset.deleteEvent){state.events=state.events.filter(event=>event.id!==button.dataset.deleteEvent);save();render();}
  if (button.dataset.day) {
    focusDate = new Date(button.dataset.day + 'T12:00:00');
    render();
    const selected = $('view').querySelector('[data-day][aria-pressed="true"]');
    selected?.focus({preventScroll:true});
    if (matchMedia('(max-width: 700px)').matches && e.detail) {
      $('calendar-detail').scrollIntoView({block:'nearest'});
    }
  }
};
$('view').addEventListener('input',e=>{
  if(e.target.id==='journal-sleep'){
    const value=e.target.value===''?'':Math.max(0,Math.min(24,Number(e.target.value)));
    journalUpdate('sleep',value);
  }
  if(e.target.dataset.journalField)journalUpdate(e.target.dataset.journalField,e.target.value);
  if(e.target.id==='note-search'){
    noteQuery=e.target.value;
    $('note-items').innerHTML = noteListItems();
  }
  if (e.target.id === 'note-title') {
    const note = currentNote();
    if (!note) return;
    note.title = e.target.value;
    touchNote(note);
  }
});
$('view').addEventListener('change',e=>{
  changeAvoidanceDate(e.target);
  if(e.target.id==='journal-date'&&e.target.value){journalDate=new Date(e.target.value+'T12:00:00');render();}
  if(e.target.id==='mind-map-select')mindChooseMap(e.target.value);
});
$('view').addEventListener('keydown',e=>{
  if (e.key === 'Escape' && e.target.closest('[data-goal-step-edit]')) {
    e.preventDefault();
    e.target.closest('[data-goal-step-edit]').querySelector('[data-goal-cancel]').click();
  } else mindKeydown(e);
});
$('view').addEventListener('dblclick',e=>{if(e.target.closest('[data-mind-node]'))mindEdit();});
$('view').addEventListener('submit', goalsSubmit);
$('view').addEventListener('submit', plannerSubmit);
$('view').addEventListener('submit', submitAvoidance);
$('view').onchange=e=>{
  const box=e.target;
  if (goalsChange(box) || plannerChange(box)) return;
  if(box.dataset.habit){
    const habit=state.habits.find(h=>h.id===box.dataset.habit);
    const date=box.dataset.date;
    if (!habit || habitPaused(habit, date)) return;
    habit.done=habit.done.filter(d=>d!==date);
    if(box.checked)habit.done.push(date);
    lastHabitMark = box.checked ? {id:habit.id,date} : null;
  }else if(box.dataset.task){
    const task = state.tasks.find(t => t.id === box.dataset.task);
    if (!task) return;
    task.done = box.checked;
    task.doneLate = box.checked && task.date < key(new Date());
    if (task.done && screen === 'tasks') feedback('Задача выполнена');
  }else return;
  const selector=box.dataset.habit?`[data-habit="${CSS.escape(box.dataset.habit)}"][data-date="${box.dataset.date}"]`:`[data-task="${CSS.escape(box.dataset.task)}"]`;
  save();
  render();
  Array.from($('view').querySelectorAll(selector)).find(input => input.getClientRects().length)?.focus({preventScroll:true});
  lastHabitMark = null;
};
const homeRoutes = new Set(['', '#home', '#sections']);
let homePosition = null;
let observedRoute = location.hash;
history.scrollRestoration = 'manual';
window.addEventListener('scroll', () => {
  if (observedRoute === location.hash && homeRoutes.has(observedRoute)) homePosition = window.scrollY;
}, {passive:true});
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  if (homeRoutes.has(location.hash) && !homeRoutes.has(link.hash)) homePosition = window.scrollY;
  if (link.hash === '#sections' && location.hash === '#sections') focusSections();
}, true);
window.addEventListener('hashchange', () => {
  const fromHome = homeRoutes.has(observedRoute);
  observedRoute = location.hash;
  calendarTaskDraft = taskDraft = taskEditId = '';
  render();
  if (homeRoutes.has(observedRoute) && !fromHome && homePosition !== null) window.scrollTo(0, homePosition);
  else if (observedRoute === '#sections') focusSections();
  else window.scrollTo(0, 0);
});
function focusSections() {
  $('sections')?.focus({preventScroll:true});
  $('sections')?.scrollIntoView();
}
const spaceReady = startStarfield();
render();
startWorkspaceInteractions();
startFocus();
startFocusAmbience();
startNoteTools();
startHomeEntrance(spaceReady);
startTodayQuoteClock();
startCloseDay();
startBackup();
startMindPan();
if (location.hash === '#sections') requestAnimationFrame(focusSections);

if (typeof createPlanet === 'function') {
  mountPlanet = createPlanet();
  mountPlanet?.($('planet-anchor'));
}
