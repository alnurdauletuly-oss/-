const $ = id => document.getElementById(id);
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const templates = ['Подъём в 07:00', 'Стакан воды', 'Зарядка 10 минут', 'Чтение 20 минут', 'Прогулка', 'Изучение языка', 'Медитация', 'Планирование дня', 'Сон до 23:00'];
const storageKey = 'jospat.core.v1';
const screens = { habits: 'Трекер привычек', weekly: 'План недели', calendar: 'Календарь' };
const today = new Date();
today.setHours(12, 0, 0, 0);
let focusDate = new Date(today);
let screen;
let editorType;
let state = { habits: [], tasks: [] };

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
function save() {
  try { localStorage.setItem(storageKey,JSON.stringify(state)); }
  catch { $('status').textContent='Браузер не смог сохранить изменения на устройстве.'; }
}
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.habits) && Array.isArray(saved.tasks)) state=saved;
  else { seed(); save(); }
} catch { seed(); $('status').textContent='Открыт пример недели.'; }

function habitTable(days) {
  let scheduled=0, completed=0;
  const rows=state.habits.map(h => {
    const cells=days.map(day => {
      if (!h.days.includes(weekday(day))) return '<td class="dash" aria-label="Свободный день">—</td>';
      scheduled++;
      const date=key(day), checked=h.done.includes(date);
      if (checked) completed++;
      return `<td><input class="check" type="checkbox" data-habit="${safe(h.id)}" data-date="${date}" aria-label="${safe(h.name)}, ${short(day)}" ${checked?'checked':''}></td>`;
    });
    return `<tr><td>${safe(h.name)}</td>${cells.join('')}</tr>`;
  });
  const headings=days.map(d => `<th class="${key(d)===key(today)?'is-today':''}">${weekdays[weekday(d)]}<time>${short(d)}</time></th>`);
  return `<div class="panel"><div class="panel-head"><h2>Привычки на неделю</h2><small>${state.habits.length} в трекере</small></div>
    <div class="scroll"><table aria-label="Привычки по дням недели"><thead><tr><th>Привычка</th>${headings.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <div class="summary"><span>Выполнено <b>${completed} из ${scheduled}</b></span><progress aria-label="Прогресс недели" value="${completed}" max="${scheduled||1}"></progress></div></div>
    <section class="templates"><h2>Шаблоны привычек</h2><div class="template-grid">${templates.map((name,i)=>`<button class="template" data-template="${i}">${name}<b aria-hidden="true">＋</b></button>`).join('')}</div></section>`;
}
function dayCard(date, includeHabits=false) {
  const day=key(date);
  const tasks=state.tasks.filter(t=>t.date===day);
  const tasksHtml=tasks.map(t=>`<label><input class="check" type="checkbox" data-task="${safe(t.id)}" ${t.done?'checked':''}>${safe(t.name)}</label>`).join('');
  const habits=includeHabits?state.habits.filter(h=>h.days.includes(weekday(date))):[];
  const habitsHtml=habits.map(h=>`<label><input class="check" type="checkbox" data-habit="${safe(h.id)}" data-date="${day}" ${h.done.includes(day)?'checked':''}>${safe(h.name)}</label>`).join('');
  return `<article class="day"><h3>${fmt(date,{weekday:'long',day:'numeric',month:'long'})}</h3>
    ${habitsHtml?'<small>Привычки</small>'+habitsHtml:''}<small>Задачи</small>${tasksHtml||'<span class="muted">Свободный день</span>'}
    <button class="plain" data-add-task="${day}">＋ Добавить задачу</button>
    <small>Выполнено ${tasks.filter(t=>t.done).length} · Осталось ${tasks.filter(t=>!t.done).length}</small></article>`;
}
function calendar() {
  const first=new Date(focusDate.getFullYear(),focusDate.getMonth(),1,12);
  const last=new Date(first.getFullYear(),first.getMonth()+1,0,12);
  const cells=weekdays.map(d=>`<div class="weekday">${d}</div>`);
  for (let i=0;i<weekday(first);i++) cells.push('<div></div>');
  for (let n=1;n<=last.getDate();n++) {
    const date=shift(first,n-1), day=key(date);
    const count=state.tasks.filter(t=>t.date===day).length;
    cells.push(`<button class="${day===key(focusDate)?'chosen':''} ${day===key(today)?'is-today':''}" data-day="${day}" aria-label="${short(date)}, задач: ${count}">${n}${count?`<small>Задач: ${count}</small>`:''}</button>`);
  }
  return `<div class="calendar">${cells.join('')}</div><div class="detail">${dayCard(focusDate,true)}</div>`;
}
function render() {
  const route = location.hash.slice(1);
  const module = modules.find(item => item.id === route);
  screen = Object.hasOwn(screens, route) || module ? route : 'home';
  const isCore = Object.hasOwn(screens, screen);
  const isHome = screen === 'home';
  document.body.classList.toggle('home-page', isHome);
  $('title').textContent = isHome ? 'Место для твоего роста.' : screens[screen] || module.title;
  $('section-label').textContent = isHome ? 'ТВОЁ ПРОСТРАНСТВО' : isCore ? 'CORE · КАЖДЫЙ ДЕНЬ' : 'JOSPAT · ' + module.title.toUpperCase();
  $('primary').hidden = !isCore;
  document.querySelector('.tabs').hidden = !isCore;
  document.querySelector('.toolbar').hidden = !isCore && screen !== 'analytics';
  $('primary').textContent = screen === 'habits' ? '＋ Привычка' : '＋ Задача';
  $('today').textContent = fmt(today, { weekday: 'long', day: 'numeric', month: 'long' });
  document.querySelectorAll('.tabs a').forEach(link => {
    const active = link.hash === '#' + screen;
    link.classList.toggle('active-link', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const days = week(focusDate);
  $('period').textContent = screen === 'calendar'
    ? fmt(focusDate, { month: 'long', year: 'numeric' })
    : short(days[0]) + ' — ' + short(days[6]) + ' ' + days[6].getFullYear();
  const views = {
    home: homeScreen,
    habits: () => habitTable(days),
    weekly: () => '<div class="days">' + days.map(day => dayCard(day)).join('') + '</div>',
    calendar,
    analytics: () => analyticsScreen(days),
    progress: progressScreen
  };
  $('view').innerHTML = views[screen] ? views[screen]() : plannedScreen(module);
  document.title = $('title').textContent + ' · JOSPAT';
}
function move(direction) {
  if(screen==='calendar') focusDate=new Date(focusDate.getFullYear(),focusDate.getMonth()+direction,1,12);
  else focusDate=shift(focusDate,7*direction);
  render();
}
$('prev').onclick=()=>move(-1);
$('next').onclick=()=>move(1);
$('current').onclick=()=>{focusDate=new Date(today);render();};
$('template').innerHTML='<option value="">Своя привычка</option>'+templates.map((name,i)=>`<option value="${i}">${name}</option>`).join('');
$('schedule').innerHTML=weekdays.map((day,i)=>`<label><input type="checkbox" value="${i}" checked>${day}</label>`).join('');
function openEditor(type, date=key(focusDate), template='') {
  editorType=type;
  $('entry').reset();
  $('schedule').querySelector('input').setCustomValidity('');
  $('name').setCustomValidity('');
  const habit=type==='habit';
  $('dialog-title').textContent=habit?'Новая привычка':'Новая задача';
  $('template-fields').hidden=!habit;
  $('schedule-fields').hidden=!habit;
  $('task-fields').hidden=habit;
  $('date').required=!habit;
  $('date').value=date;
  $('template').value=template;
  $('name').value=template===''?'':templates[Number(template)];
  $('editor').showModal();
  $('name').focus();
}
$('template').onchange=()=>{$('name').value=templates[$('template').value]||'';};
$('name').oninput=()=>$('name').setCustomValidity('');
$('schedule').onchange=()=>$('schedule').querySelector('input').setCustomValidity('');
$('primary').onclick=()=>openEditor(screen==='habits'?'habit':'task');
$('close').onclick=()=>$('editor').close();
$('entry').onsubmit=e=>{
  e.preventDefault();
  const name=$('name').value.trim();
  if(!name){$('name').setCustomValidity('Введите название');$('name').reportValidity();return;}
  const id=crypto.randomUUID();
  if(editorType==='habit'){
    const days=Array.from($('schedule').querySelectorAll(':checked'),box=>Number(box.value));
    if(!days.length){const first=$('schedule').querySelector('input');first.setCustomValidity('Выберите день');first.reportValidity();return;}
    state.habits.push({id,name,days,done:[]});
  }else{
    state.tasks.push({id,name,date:$('date').value,done:false});
    focusDate=new Date($('date').value+'T12:00:00');
  }
  save();$('editor').close();render();
};
$('view').onclick=e=>{
  const button=e.target.closest('button');
  if(!button)return;
  if(button.hasAttribute('data-template'))openEditor('habit',key(focusDate),button.dataset.template);
  if(button.dataset.addTask)openEditor('task',button.dataset.addTask);
  if(button.dataset.day){focusDate=new Date(button.dataset.day+'T12:00:00');render();}
};
$('view').onchange=e=>{
  const box=e.target;
  if(box.dataset.habit){
    const habit=state.habits.find(h=>h.id===box.dataset.habit);
    const date=box.dataset.date;
    habit.done=habit.done.filter(d=>d!==date);
    if(box.checked)habit.done.push(date);
  }else if(box.dataset.task){
    state.tasks.find(t=>t.id===box.dataset.task).done=box.checked;
  }else return;
  const selector=box.dataset.habit?`[data-habit="${CSS.escape(box.dataset.habit)}"][data-date="${box.dataset.date}"]`:`[data-task="${CSS.escape(box.dataset.task)}"]`;
  save();render();$('view').querySelector(selector)?.focus({preventScroll:true});
};
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
render();
