const modules = [
  { id: 'habits', title: 'Основа', subtitle: 'Ритм твоего дня', description: 'Отмечай привычки и сохраняй важные события.', color: 'mint', art: 'checks', features: ['Привычки', 'Календарь'] },
  { id: 'analytics', title: 'Аналитика', subtitle: 'Замечай закономерности', description: 'Динамика по дням и привычки, которые идут легче.', color: 'blue', art: 'bars', features: ['Обзор недели', 'По привычкам'] },
  { id: 'notes', title: 'Заметки', subtitle: 'Сохрани свои мысли', description: 'Запиши идею, план или маленькую победу.', color: 'sand', art: 'note' },
  { id: 'goals', title: 'Цели', subtitle: 'Держи важное в фокусе', description: 'Соедини большую цель с ежедневными действиями.', color: 'rose', art: 'goal', planned: true }
];

function illustration(type) {
  const pictures = {
    checks: '<div class="mini-tracker"><div class="mini-title">Мои привычки <span>ПН · ВС</span></div>' +
      ['Чтение', 'Движение', 'Новые знания'].map((name,row) =>
        '<div class="mini-row"><span>'+name+'</span>'+Array.from({length:5},(_,i)=>'<i class="'+(i<4-row?'filled':'')+'">'+(i<4-row?'✓':'')+'</i>').join('')+'</div>').join('')+'</div>',
    bars: '<div class="mini-chart"><div class="mini-title">Твой ритм</div><div class="bars">'+[42,70,52,86,65,100,78].map((n,i)=>'<div><i style="--height:'+n+'%"></i><span>'+weekdays[i]+'</span></div>').join('')+'</div></div>',
    goal: '<div class="goal-art"><div class="target"><div><div></div></div></div><span>Моя цель</span></div>',
    note: '<div class="paper"><span>Сегодня получилось…</span><i></i><i></i><i></i><b>✧</b></div>'
  };
  return pictures[type];
}

function homeScreen() {
  return '<div class="module-grid">'+modules.map(module=>
    '<a class="module-card '+module.color+'" href="#'+module.id+'"><div class="card-art" aria-hidden="true">'+illustration(module.art)+'</div><div class="card-copy"><p class="card-subtitle">'+module.subtitle+'</p><h2>'+module.title+'</h2><p>'+module.description+'</p><div class="card-foot"><span>'+(module.planned?'Посмотреть идею':'Открыть раздел')+'</span>'+(module.planned?'<small>В планах</small>':'<span class="open-circle" aria-hidden="true">＋</span>')+'</div></div></a>').join('')+'</div>';
}

function analyticsScreen(days) {
  const elapsed=days.filter(date=>date<=today);
  const daily=elapsed.map(date=>dailyProductivity(date));
  const planned=daily.reduce((sum,day)=>sum+day.planned,0);
  const done=daily.reduce((sum,day)=>sum+day.done,0);
  const percent=planned?Math.round(done/planned*100):0;
  const active=daily.filter(day=>day.planned);
  const best=active.length?active.reduce((best,day)=>day.percent>best.percent?day:best):null;
  return `<div class="insight-grid"><article class="insight-card"><span>Выполнено</span><strong>${done}<small> / ${planned}</small></strong><p>Отметок за выбранную неделю</p></article><article class="insight-card"><span>Общий результат</span><strong>${percent}%</strong><p>Выполнено из запланированного</p></article><article class="insight-card"><span>Лучший день</span><strong>${best?best.percent+'%':'—'}</strong><p>${best?fmt(best.date,{weekday:'long',day:'numeric',month:'long'}):'Появится после первой отметки'}</p></article></div>${lineChart(days)}<section class="panel breakdown"><h2>Привычки по отдельности</h2><p class="muted">Считаются только дни, которые уже наступили.</p>${state.habits.length?state.habits.map(habit=>{
    const target=elapsed.filter(date=>habit.days.includes(weekday(date)));
    const count=target.filter(date=>habit.done.includes(key(date))).length;
    const share=target.length?Math.round(count/target.length*100):0;
    return `<div class="breakdown-row"><span>${safe(habit.name)}</span><progress max="100" value="${share}"></progress><b>${share}%</b></div>`;
  }).join(''):'<p class="muted">Добавь первую привычку в «Основе».</p>'}</section>`;
}

function plannedScreen(module) {
  return '<div class="concept '+module.color+'"><div class="card-art" aria-hidden="true">'+illustration(module.art)+'</div><div><span class="planned-label">Раздел в планах</span><h2>'+module.subtitle+'</h2><p>'+module.description+'</p><p class="muted">Сейчас можно начать с привычек и календаря в разделе «Основа».</p><a class="primary inline-button" href="#habits">Открыть основу</a></div></div>';
}
