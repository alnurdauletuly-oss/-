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
let state = { habits: [], tasks: [], events: [] };

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
  if (saved && Array.isArray(saved.habits) && Array.isArray(saved.tasks)) state={...saved, events:Array.isArray(saved.events)?saved.events:[]};
  else { seed(); save(); }
} catch { seed(); $('status').textContent='Открыт пример недели.'; }

function habitTable(days) {
  let scheduled=0, completed=0;
  const rows=state.habits.map(h => {
    let habitScheduled=0, habitDone=0;
    const cells=days.map(day => {
      if (!h.days.includes(weekday(day))) return '<td class="dash" aria-label="Свободный день">—</td>';
      scheduled++;
      habitScheduled++;
      const date=key(day), checked=h.done.includes(date);
      if (checked) completed++;
      if (checked) habitDone++;
      return `<td><input class="check" type="checkbox" data-habit="${safe(h.id)}" data-date="${date}" aria-label="${safe(h.name)}, ${short(day)}" ${checked?'checked':''}></td>`;
    });
    const percent=habitScheduled?Math.round(habitDone/habitScheduled*100):0;
    const stars=Math.round(percent/20);
    return `<tr><td>${safe(h.name)}</td>${cells.join('')}<td class="habit-progress"><span aria-label="${stars} из 5 звёзд" class="stars">${'★'.repeat(stars)}<i>${'☆'.repeat(5-stars)}</i></span><b>${percent}%</b></td></tr>`;
  });
  const headings=days.map(d => `<th class="${key(d)===key(today)?'is-today':''}">${weekdays[weekday(d)]}<time>${short(d)}</time></th>`);
  return `<div class="panel tracker-panel"><div class="panel-head"><h2>Трекер привычек</h2><small>${state.habits.length} привычек</small></div>
    <div class="scroll"><table aria-label="Привычки по дням недели"><thead><tr><th>Привычка</th>${headings.join('')}<th>Прогресс</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <form id="quick-habit" class="quick-habit"><input id="quick-name" name="habit" maxlength="90" required autocomplete="off" placeholder="Название новой привычки" aria-label="Название новой привычки"><button type="submit" class="primary">＋ Добавить привычку</button><button type="button" data-advanced-habit>Настроить дни</button></form>
    <div class="summary"><span>Отмечено <b>${completed} из ${scheduled}</b></span><progress aria-label="Прогресс привычек" value="${completed}" max="${scheduled||1}"></progress></div></div>
    ${candleChart(days)}
    <section class="templates"><h2>Добавить одним нажатием</h2><div class="template-grid">${templates.map((name,i)=>`<button class="template" data-template="${i}">${name}<b aria-hidden="true">＋</b></button>`).join('')}</div></section>`;
}
function candleChart(days) {
  const rates=days.map(date=>{
    if(date>today) return null;
    const due=state.habits.filter(h=>h.days.includes(weekday(date)));
    return due.length?Math.round(due.filter(h=>h.done.includes(key(date))).length/due.length*100):null;
  });
  let previous=null;
  const candles=rates.map((rate,i)=>{
    if(rate===null) return `<div class="candle-day"><div class="candle-area"><span class="candle-empty">·</span></div><small>${weekdays[i]}</small></div>`;
    const open=previous===null?0:previous, up=rate>=open;
    const low=Math.min(open,rate), high=Math.max(open,rate);
    const body=Math.max(4,high-low);
    previous=rate;
    return `<div class="candle-day"><div class="candle-area" role="img" aria-label="${weekdays[i]}: ${rate}%, ${up?'рост':'снижение'}"><span class="candle-wick ${up?'up':'down'}" style="bottom:${low}%;height:${Math.max(4,high-low)}%"></span><span class="candle-body ${up?'up':'down'}" style="bottom:${low}%;height:${body}%"></span></div><b>${rate}%</b><small>${weekdays[i]}</small></div>`;
  }).join('');
  return `<section class="panel candle-panel"><div class="panel-head"><div><h2>Динамика выполнения</h2><small>Зелёная свеча — рост к предыдущему дню, красная — снижение</small></div></div><div class="candle-chart"><div class="chart-axis"><span>100%</span><span>50%</span><span>0%</span></div><div class="candle-grid">${candles}</div></div></section>`;
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
  for (let i=0;i<weekday(first);i++) cells.push('<div class="calendar-blank"></div>');
  for (let n=1;n<=last.getDate();n++) {
    const date=shift(first,n-1), day=key(date);
    const events=state.events.filter(event=>event.date===day).sort((a,b)=>a.time.localeCompare(b.time));
    const tasks=state.tasks.filter(task=>task.date===day);
    cells.push(`<button class="${day===key(focusDate)?'chosen':''} ${day===key(today)?'is-today':''}" data-day="${day}" aria-label="${short(date)}, событий: ${events.length}"><span class="calendar-date">${n}</span>${events.slice(0,3).map(event=>`<span class="event-chip">${safe(event.time)} ${safe(event.name)}</span>`).join('')}${events.length>3?`<small>Ещё ${events.length-3}</small>`:''}${tasks.length?`<small>Задачи: ${tasks.length}</small>`:''}</button>`);
  }
  const selected=key(focusDate);
  const events=state.events.filter(event=>event.date===selected).sort((a,b)=>a.time.localeCompare(b.time));
  return `<div class="calendar">${cells.join('')}</div><section class="panel calendar-detail"><div class="panel-head"><div><h2>${fmt(focusDate,{weekday:'long',day:'numeric',month:'long'})}</h2><small>Важные события и задачи этого дня</small></div><button class="primary" data-add-event="${selected}">＋ Событие</button></div><div class="event-list">${events.length?events.map(event=>`<div class="event-row"><time>${safe(event.time)}</time><span>${safe(event.name)}</span><button data-delete-event="${safe(event.id)}" aria-label="Удалить событие ${safe(event.name)}">×</button></div>`).join(''):'<p class="muted">Пока нет событий. Добавь важное на этот день.</p>'}</div>${state.tasks.filter(task=>task.date===selected).map(task=>`<label class="calendar-task"><input class="check" type="checkbox" data-task="${safe(task.id)}" ${task.done?'checked':''}>${safe(task.name)}</label>`).join('')}</section>`;
}
function render() {
  const route = location.hash.slice(1);
  if(route==='weekly'){location.replace('#habits');return;}
  const module = modules.find(item => item.id === route);
  screen = Object.hasOwn(screens, route) || module ? route : 'home';
  const isCore = Object.hasOwn(screens, screen);
  const isHome = screen === 'home';
  document.body.classList.toggle('home-page', isHome);
  $('back').hidden=isHome;
  document.querySelector('.home-link').hidden=isHome;
  $('today').hidden=isHome;
  $('title').textContent = isHome ? 'Место для твоего роста.' : screens[screen] || module.title;
  $('section-label').textContent = isHome ? '' : isCore ? 'ОСНОВА · КАЖДЫЙ ДЕНЬ' : 'JOSPAT · ' + module.title.toUpperCase();
  $('section-label').hidden=isHome;
  $('primary').hidden = !isCore;
  document.querySelector('.tabs').hidden = !isCore;
  document.querySelector('.toolbar').hidden = !isCore && screen !== 'analytics';
  $('primary').textContent = screen === 'habits' ? '＋ Привычка' : '＋ Событие';
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
  $('dialog-title').textContent=habit?'Новая привычка':type==='event'?'Новое событие':'Новая задача';
  $('template-fields').hidden=!habit;
  $('schedule-fields').hidden=!habit;
  $('task-fields').hidden=habit;
  $('date').required=!habit;
  $('date').value=date;
  $('event-time-fields').hidden=type!=='event';
  $('event-time').required=type==='event';
  $('template').value=template;
  $('name').value=template===''?'':templates[Number(template)];
  $('editor').showModal();
  $('name').focus();
}
$('template').onchange=()=>{$('name').value=templates[$('template').value]||'';};
$('name').oninput=()=>$('name').setCustomValidity('');
$('schedule').onchange=()=>$('schedule').querySelector('input').setCustomValidity('');
$('primary').onclick=()=>{if(screen==='habits')$('quick-name')?.focus();else openEditor('event');};
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
  }else if(editorType==='event'){
    state.events.push({id,name,date:$('date').value,time:$('event-time').value});
    focusDate=new Date($('date').value+'T12:00:00');
  }else{
    state.tasks.push({id,name,date:$('date').value,done:false});
    focusDate=new Date($('date').value+'T12:00:00');
  }
  save();$('editor').close();render();
};
$('view').onclick=e=>{
  const button=e.target.closest('button');
  if(!button)return;
  if(button.hasAttribute('data-template')){
    const name=templates[Number(button.dataset.template)];
    state.habits.push({id:crypto.randomUUID(),name,days:[0,1,2,3,4,5,6],done:[]});
    save();render();
  }
  if(button.hasAttribute('data-advanced-habit'))openEditor('habit');
  if(button.dataset.addTask)openEditor('task',button.dataset.addTask);
  if(button.dataset.addEvent)openEditor('event',button.dataset.addEvent);
  if(button.dataset.deleteEvent){state.events=state.events.filter(event=>event.id!==button.dataset.deleteEvent);save();render();}
  if(button.dataset.day){focusDate=new Date(button.dataset.day+'T12:00:00');render();}
};
$('view').addEventListener('submit',e=>{
  if(e.target.id!=='quick-habit')return;
  e.preventDefault();
  const name=$('quick-name').value.trim();
  if(!name)return;
  state.habits.push({id:crypto.randomUUID(),name,days:[0,1,2,3,4,5,6],done:[]});
  save();render();$('quick-name')?.focus();
});
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
