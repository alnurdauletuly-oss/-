const modules = [
  { id: 'habits', title: 'Привычки', subtitle: 'Ритм твоего дня', description: 'Отметки и прогресс за неделю или месяц.', color: 'mint', art: 'checks' },
  { id: 'tasks', title: 'Задачи', description: 'План на день и подзадачи.', color: 'blue', art: 'tasks' },
  { id: 'analytics', title: 'Аналитика', subtitle: 'Замечай закономерности', description: 'Динамика по дням и привычки, которые идут легче.', color: 'blue', art: 'bars', features: ['Обзор недели', 'По привычкам'] },
  { id: 'notes', title: 'Заметки', subtitle: 'Сохрани свои мысли', description: 'Запиши идею, план или маленькую победу.', color: 'sand', art: 'note' },
  { id: 'goals', title: 'Цели', subtitle: 'Держи важное в фокусе', description: 'Соедини большую цель с конкретными шагами.', color: 'rose', art: 'goal' },
  { id: 'journal', title: 'Дневник', subtitle: 'Пойми свой день', description: 'Сон, настроение, энергия и мысли — в одной записи.', color: 'peach', art: 'journal' },
  { id: 'mind', title: 'Карта мыслей', subtitle: 'Идеи по веткам', description: 'Преврати идею в понятные ветки и следующие шаги.', color: 'lavender', art: 'mind' },
  { id: 'calendar', title: 'Календарь', description: 'Важные события, задачи и шаги к целям по датам.', color: 'mint', art: 'calendar' }
];

function illustration(type) {
  const pictures = {
    checks: '<div class="mini-tracker"><div class="mini-title">Мои привычки <span>ПН · ВС</span></div>' +
      ['Чтение', 'Движение', 'Новые знания'].map((name,row) =>
        '<div class="mini-row"><span>'+name+'</span>'+Array.from({length:5},(_,i)=>'<i class="'+(i<4-row?'filled':'')+'">'+(i<4-row?'✓':'')+'</i>').join('')+'</div>').join('')+'</div>',
    calendar: '<div class="mini-tracker"><div class="mini-title">Календарь</div><div class="mini-row">' +
      Array.from({length:7}, (_, i) => '<i class="' + (i === 2 ? 'filled' : '') + '">' + (i + 12) + '</i>').join('') +
      '</div><div class="mini-row"><span>18:30 · Встреча</span></div></div>',
    tasks: '<div class="mini-tracker"><div class="mini-title">План дня</div><div class="mini-row"><span>Главная задача</span><i class="filled">★</i></div><div class="mini-row"><span>Подзадача</span><i></i></div></div>',
    bars: '<div class="mini-chart"><div class="mini-title">Твой ритм</div><div class="bars">'+[42,70,52,86,65,100,78].map((n,i)=>'<div><i style="--height:'+n+'%"></i><span>'+weekdays[i]+'</span></div>').join('')+'</div></div>',
    goal: '<div class="goal-art"><div class="target"><div><div></div></div></div><span>Моя цель</span></div>',
    note: '<div class="paper"><span>Сегодня получилось…</span><i></i><i></i><i></i><b>✧</b></div>',
    journal: '<div class="journal-art"><span>Пятница, 20 ноября</span><div>😴 <b>8 ч сна</b></div><div>⚡ <b>Энергия 4/5</b></div><div>🙂 <b>Настроение</b></div><small>Сегодня я благодарен за…</small></div>',
    mind: '<div class="mind-art"><span>💡 Моя идея</span><i></i><div><b>🎯 Цель</b><b>🚀 Первый шаг</b><b>✨ Результат</b></div></div>'
  };
  return pictures[type];
}

function homeScreen() {
  return todayScreen() + `<section class="today-library" id="sections" tabindex="-1" aria-labelledby="sections-title"><h2 id="sections-title">Все разделы</h2><div class="module-grid">${modules.map(module => `
    <a class="module-card ${module.color}" href="#${module.id}">
      <div class="card-art" aria-hidden="true">${illustration(module.art)}</div>
      <div class="card-copy"><h3>${module.title}</h3><p>${module.description}</p></div>
    </a>`).join('')}</div></section>`;
}

function analyticsScreen(days) {
  const elapsed=days.filter(date=>date<=today);
  const daily=elapsed.map(date=>dailyProductivity(date));
  const planned=daily.reduce((sum,day)=>sum+day.planned,0);
  const done=daily.reduce((sum,day)=>sum+day.done,0);
  const paused=daily.reduce((sum,day)=>sum+day.paused,0);
  const percent=planned?Math.round(done/planned*100):0;
  const active=daily.filter(day=>day.planned);
  const best=active.length?active.reduce((best,day)=>day.percent>best.percent?day:best):null;
  return `<div class="insight-grid"><article class="insight-card"><span>Выполнено</span><strong>${done}<small> / ${planned}</small></strong><p>Отметок за выбранную неделю</p></article><article class="insight-card"><span>Общий результат</span><strong>${percent}%</strong><p>Выполнено из запланированного</p></article><article class="insight-card"><span>Лучший день</span><strong>${best?best.percent+'%':'—'}</strong><p>${best?fmt(best.date,{weekday:'long',day:'numeric',month:'long'}):'Появится после первой отметки'}</p></article></div>${lineChart(days)}<section class="panel breakdown"><h2>Привычки по отдельности</h2><p class="muted">Считаются только дни, которые уже наступили. ${paused ? `Отметок «Пауза» — ${paused}. Они исключены из расчёта.` : ''}</p>${state.habits.length?state.habits.map(habit=>{
    const target=elapsed.filter(date=>habitScheduled(habit,date));
    const count=target.filter(date=>habit.done.includes(key(date))).length;
    const share=target.length?Math.round(count/target.length*100):null;
    return `<div class="breakdown-row"><span>${safe(habit.name)}</span><progress max="100" value="${share ?? 0}"></progress><b>${share === null ? '—' : share + '%'}</b></div>`;
  }).join(''):'<p class="muted">Добавь первую привычку в разделе «Привычки».</p>'}</section>`;
}
