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
let state = { habits: [], tasks: [], events: [], notes: [] };
let activeNoteId = null;
let noteQuery = '';

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
  if (saved && Array.isArray(saved.habits) && Array.isArray(saved.tasks)) state={...saved, events:Array.isArray(saved.events)?saved.events:[], notes:Array.isArray(saved.notes)?saved.notes:[]};
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
    ${victorySeries()}
    ${lineChart(days)}
    <section class="templates"><h2>Добавить одним нажатием</h2><div class="template-grid">${templates.map((name,i)=>`<button class="template" data-template="${i}">${name}<b aria-hidden="true">＋</b></button>`).join('')}</div></section>`;
}
function dailyProductivity(date) {
  const plannedHabits=state.habits.filter(habit=>habit.days.includes(weekday(date)));
  const done=plannedHabits.filter(habit=>habit.done.includes(key(date))).length;
  return {date,planned:plannedHabits.length,done,percent:plannedHabits.length?Math.round(done/plannedHabits.length*100):null};
}
function lineChart(days) {
  const values=days.map(date=>date<=today?dailyProductivity(date).percent:null);
  const x=index=>55+index*100, y=value=>170-value*1.3;
  const grid=[100,75,50,25,0].map(value=>`<line x1="55" y1="${y(value)}" x2="655" y2="${y(value)}" class="line-grid"/><text x="43" y="${y(value)+4}" text-anchor="end" class="axis-label">${value}%</text>`).join('');
  let path='';
  values.forEach((value,index)=>{if(value!==null)path+=(path?' L ':'M ')+x(index)+' '+y(value);});
  const dots=values.map((value,index)=>value===null?'':`<circle cx="${x(index)}" cy="${y(value)}" r="6" class="line-dot"><title>${short(days[index])}: ${value}%</title></circle><text x="${x(index)}" y="${y(value)-13}" text-anchor="middle" class="point-label">${value}%</text>`).join('');
  const dates=days.map((date,index)=>`<text x="${x(index)}" y="203" text-anchor="middle" class="axis-label">${short(date)}</text>`).join('');
  return `<section class="panel line-panel"><div class="panel-head"><div><h2>Продуктивность по дням</h2><small>Средний процент выполнения всех привычек, запланированных на день</small></div></div><div class="chart-scroll"><svg class="productivity-chart" viewBox="0 0 700 215" role="img" aria-label="График продуктивности по датам: ${values.map((value,index)=>value===null?'':short(days[index])+' — '+value+'%').filter(Boolean).join(', ')}">${grid}<path d="${path}" class="line-path"/>${dots}${dates}</svg></div></section>`;
}
function victorySeries() {
  const won=date=>{const day=dailyProductivity(date);return day.planned>0&&day.percent>=70;};
  let count=0;
  let cursor=won(today)?today:shift(today,-1);
  while(count<365&&won(cursor)){count++;cursor=shift(cursor,-1);}
  const days=Array.from({length:7},(_,index)=>shift(today,index-6));
  const word=count%10===1&&count%100!==11?'день':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'дня':'дней';
  return `<section class="victory-panel"><div><span class="victory-eyebrow">СЕРИЯ ПОБЕД</span><div class="victory-count"><strong>${count}</strong><span>${word} подряд</span></div><p>${count?'Твой ритм уже складывается. Продолжай в своём темпе.':'Выполни 70% привычек за день, чтобы начать серию.'}</p></div><div class="victory-days">${days.map(date=>`<div class="${won(date)?'won':''} ${key(date)===key(today)?'current':''}"><span>${weekdays[weekday(date)]}</span><b>${won(date)?'✓':'·'}</b></div>`).join('')}</div></section>`;
}
function notesScreen() {
  const filtered = state.notes
    .filter(note => (note.title + ' ' + note.body).toLocaleLowerCase('ru').includes(noteQuery.toLocaleLowerCase('ru')))
    .sort((a,b) => Number(b.pinned)-Number(a.pinned) || b.updated.localeCompare(a.updated));
  const current = state.notes.find(note => note.id === activeNoteId);
  const items = filtered.length ? filtered.map(note => {
    const title = safe(note.title.trim() || 'Новая заметка');
    const preview = safe(note.body.trim().replace(/\s+/g,' ').slice(0,90) || 'Начни писать…');
    const date = new Date(note.updated).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
    return `<button class="note-item ${note.id===activeNoteId?'selected':''}" data-note="${safe(note.id)}"><strong>${title}</strong><span>${preview}</span><small>${note.pinned?'◆ Закреплено · ':''}${date}</small></button>`;
  }).join('') : `<p class="note-empty">${noteQuery?'Ничего не найдено.':'Нажми «Новая заметка», чтобы сохранить мысль.'}</p>`;
  const list = `<div class="notes-list"><div class="notes-search"><span aria-hidden="true">⌕</span><input id="note-search" type="search" placeholder="Поиск заметок" aria-label="Поиск заметок" value="${safe(noteQuery)}"></div><div class="notes-list-head"><strong>Все заметки</strong><span>${state.notes.length}</span></div><div class="note-items">${items}</div></div>`;
  const editor = current ? `<div class="note-actions"><button data-note-back>← К списку</button><span>Сохраняется автоматически</span><button data-pin-note="${safe(current.id)}" aria-label="${current.pinned?'Открепить':'Закрепить'} заметку">${current.pinned?'◆':'◇'}</button><button data-delete-note="${safe(current.id)}" aria-label="Удалить заметку">Удалить</button></div><input id="note-title" maxlength="120" placeholder="Название" aria-label="Название заметки" value="${safe(current.title)}"><textarea id="note-body" placeholder="Начни писать…" aria-label="Текст заметки">${safe(current.body)}</textarea><div class="note-updated">Изменено ${new Date(current.updated).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</div>` : `<div class="note-placeholder"><span>✎</span><h2>Место для твоих мыслей</h2><p>Выбери заметку или создай новую.</p><button class="primary" data-new-note>＋ Новая заметка</button></div>`;
  return `<div class="notes-app ${current?'note-selected':''}">${list}<div class="note-editor">${editor}</div></div>`;
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
  document.body.classList.toggle('notes-page', screen==='notes');
  document.body.classList.toggle('note-editing', screen==='notes' && !!activeNoteId);
  $('back').hidden=isHome;
  document.querySelector('.home-link').hidden=isHome;
  $('today').hidden=isHome;
  $('title').textContent = isHome ? 'Место для твоего роста.' : screens[screen] || module.title;
  $('section-label').textContent = isHome ? '' : isCore ? 'ОСНОВА · КАЖДЫЙ ДЕНЬ' : 'JOSPAT · ' + module.title.toUpperCase();
  $('section-label').hidden=isHome;
  $('primary').hidden = !isCore && screen!=='notes';
  document.querySelector('.tabs').hidden = !isCore;
  document.querySelector('.toolbar').hidden = !isCore && screen !== 'analytics';
  $('primary').textContent = screen === 'habits' ? '＋ Привычка' : screen==='notes'?'＋ Новая заметка':'＋ Событие';
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
    notes: notesScreen
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
function newNote() {
  const note={id:crypto.randomUUID(),title:'',body:'',pinned:false,updated:new Date().toISOString()};
  state.notes.unshift(note);activeNoteId=note.id;save();render();$('note-title')?.focus();
}
$('primary').onclick=()=>{if(screen==='habits')$('quick-name')?.focus();else if(screen==='notes')newNote();else openEditor('event');};
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
  if(button.hasAttribute('data-new-note'))newNote();
  if(button.hasAttribute('data-note')){activeNoteId=button.dataset.note;render();}
  if(button.hasAttribute('data-note-back')){activeNoteId=null;render();}
  if(button.hasAttribute('data-pin-note')){const note=state.notes.find(item=>item.id===button.dataset.pinNote);if(note){note.pinned=!note.pinned;save();render();}}
  if(button.hasAttribute('data-delete-note')){state.notes=state.notes.filter(item=>item.id!==button.dataset.deleteNote);activeNoteId=null;save();render();}
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
$('view').addEventListener('input',e=>{
  if(e.target.id==='note-search'){
    noteQuery=e.target.value;
    const position=e.target.selectionStart;
    render();$('note-search')?.focus();$('note-search')?.setSelectionRange(position,position);
  }
  if(e.target.id==='note-title'||e.target.id==='note-body'){
    const note=state.notes.find(item=>item.id===activeNoteId);
    if(!note)return;
    note[e.target.id==='note-title'?'title':'body']=e.target.value;
    note.updated=new Date().toISOString();save();
  }
});
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
