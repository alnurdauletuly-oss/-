const modules = [
  { id: 'habits', title: 'Основа', subtitle: 'Ритм твоего дня', description: 'Отмечай привычки и сохраняй важные события.', color: 'mint', art: 'checks', features: ['Привычки', 'Календарь'] },
  { id: 'analytics', title: 'Аналитика', subtitle: 'Замечай закономерности', description: 'Посмотри, как прошла неделя и какие привычки даются легче.', color: 'blue', art: 'bars', features: ['Обзор недели', 'По привычкам'] },
  { id: 'progress', title: 'Прогресс', subtitle: 'Маленькие шаги видны', description: 'Твои выполненные действия складываются в историю роста.', color: 'peach', art: 'rings', features: ['Выполнения', 'Личный результат'] },
  { id: 'streak', title: 'Streak', subtitle: 'Продолжай в своём темпе', description: 'Серии и возвращение к привычкам после перерыва.', color: 'lavender', art: 'streak', planned: true },
  { id: 'goals', title: 'Цели', subtitle: 'Держи важное в фокусе', description: 'Соедини большую цель с ежедневными действиями и своей причиной.', color: 'rose', art: 'goal', planned: true },
  { id: 'notes', title: 'Заметки', subtitle: 'Сохрани то, что важно', description: 'Открытия, мысли и маленькие победы — рядом с привычками.', color: 'sand', art: 'note', planned: true },
  { id: 'systems', title: 'Мой путь', subtitle: 'Собери свою историю', description: 'Хронология, напоминания и оформление твоего пространства.', color: 'aqua', art: 'journey', planned: true },
  { id: 'future', title: 'Future Self', subtitle: 'Представь себя завтра', description: 'Образ себя, к которому ты идёшь. Выбери, что хочешь развивать.', color: 'sky', art: 'future', planned: true }
];

function illustration(type) {
  const pictures = {
    checks: '<div class="mini-tracker"><div class="mini-title">Моя неделя <span>ПН · ВС</span></div>' +
      ['Чтение', 'Движение', 'Новые знания'].map((name,row) =>
        '<div class="mini-row"><span>'+name+'</span>'+Array.from({length:5},(_,i)=>'<i class="'+(i<4-row?'filled':'')+'">'+(i<4-row?'✓':'')+'</i>').join('')+'</div>').join('')+'</div>',
    bars: '<div class="mini-chart"><div class="mini-title">Твой ритм</div><div class="bars">'+[42,70,52,86,65,100,78].map((n,i)=>'<div><i style="--height:'+n+'%"></i><span>'+weekdays[i]+'</span></div>').join('')+'</div></div>',
    rings: '<div class="orbit"><div class="orbit-inner"><span>Каждый шаг</span><strong>имеет вес</strong><span class="spark">✧</span></div></div>',
    streak: '<div class="mini-streak"><span class="streak-sun">☀</span><strong>Снова в ритме</strong><div>'+['✓','✓','✓','·','✓','✓',''].map(c=>'<i>'+c+'</i>').join('')+'</div></div>',
    goal: '<div class="goal-art"><div class="target"><div><div></div></div></div><span>Моя цель</span></div>',
    note: '<div class="paper"><span>Сегодня получилось…</span><i></i><i></i><i></i><b>✧</b></div>',
    journey: '<div class="journey-art"><div><i></i><span>Первый шаг</span></div><div><i></i><span>Новая привычка</span></div><div><i></i><span>Моя маленькая победа</span></div></div>',
    future: '<div class="future-art"><div class="sun"></div><div class="hill one"></div><div class="hill two"></div><span>Всё начинается с тебя</span></div>'
  };
  return pictures[type];
}

function homeScreen() {
  return '<div class="module-grid">'+modules.map(module=>
    '<a class="module-card '+module.color+'" href="#'+module.id+'"><div class="card-art" aria-hidden="true">'+illustration(module.art)+'</div><div class="card-copy"><p class="card-subtitle">'+module.subtitle+'</p><h2>'+module.title+'</h2><p>'+module.description+'</p><div class="card-foot"><span>'+(module.planned?'Посмотреть идею':'Открыть раздел')+'</span>'+(module.planned?'<small>В планах</small>':'<span class="open-circle" aria-hidden="true">＋</span>')+'</div></div></a>').join('')+'</div>';
}

function analyticsScreen(days) {
  const totals = days.map(date => {
    const habits = state.habits.filter(habit => habit.days.includes(weekday(date)));
    return { planned: habits.length, done: habits.filter(habit => habit.done.includes(key(date))).length };
  });
  const planned = totals.reduce((sum, day) => sum + day.planned, 0);
  const done = totals.reduce((sum, day) => sum + day.done, 0);
  const percent = planned ? Math.round(done / planned * 100) : 0;
  return '<div class="analytics-layout"><div class="stat-panel"><span>Привычки за выбранную неделю</span><strong>'+done+'<small> / '+planned+'</small></strong><p>'+percent+'% недельного плана выполнено</p><progress max="100" value="'+percent+'" aria-label="Доля выполненного недельного плана"></progress></div><div class="panel chart-panel"><h2>Выполнение по дням</h2><div class="real-chart">'+totals.map((day,index)=>'<div><span>'+day.done+'/'+day.planned+'</span><div class="bar-track"><i style="height:'+(day.planned?day.done/day.planned*100:0)+'%"></i></div><small>'+weekdays[index]+'</small></div>').join('')+'</div></div></div><div class="panel breakdown"><h2>Каждая привычка</h2>'+state.habits.map(habit=>{
    const target=days.filter(d=>habit.days.includes(weekday(d)));
    const count=target.filter(d=>habit.done.includes(key(d))).length;
    return '<div class="breakdown-row"><span>'+safe(habit.name)+'</span><progress max="'+(target.length||1)+'" value="'+count+'"></progress><b>'+count+' / '+target.length+'</b></div>';
  }).join('')+'</div>';
}

function progressScreen() {
  return '<p class="section-intro">Каждая отметка — действие, которое ты уже сделал.</p><div class="progress-grid">'+state.habits.map(habit=>{
    const count=habit.done.length;
    return '<article class="result-card"><span class="result-symbol">✧</span><h2>'+safe(habit.name)+'</h2><strong>'+count+'</strong><span>выполнений за всё время</span><p>'+(count?'Последняя отметка · '+short(new Date([...habit.done].sort().at(-1)+'T12:00:00')):'Первый шаг ещё впереди')+'</p></article>';
  }).join('')+'</div>';
}

function plannedScreen(module) {
  return '<div class="concept '+module.color+'"><div class="card-art" aria-hidden="true">'+illustration(module.art)+'</div><div><span class="planned-label">Раздел в планах</span><h2>'+module.subtitle+'</h2><p>'+module.description+'</p><p class="muted">Сейчас можно начать с привычек и календаря в разделе «Основа».</p><a class="primary inline-button" href="#habits">Открыть основу</a></div></div>';
}
