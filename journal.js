let journalDate = new Date();
journalDate.setHours(12,0,0,0);
let journalAnalyticsDays = 7;

const journalMoods = [
  ['😞','Тяжело'], ['😕','Не очень'], ['😐','Ровно'], ['🙂','Хорошо'], ['🤩','Отлично']
];

function journalChart(days, {title, read, ticks, tickLabel, valueLabel, color}) {
  const values = days.map(date => read(state.journal[key(date)] || {}));
  const observed = values.filter(value => value !== null);
  const latest = observed.at(-1);
  const top = ticks.at(-1), bottom = ticks[0];
  const x = index => 42 + index * 334 / (days.length - 1);
  const y = value => 114 - (value - bottom) * 94 / (top - bottom);
  let path = '';
  const dots = values.map((value, index) => {
    if (value === null) return '';
    path += `${index && values[index - 1] !== null ? ' L' : ' M'} ${x(index)} ${y(value)}`;
    return `<circle class="journal-chart-point" cx="${x(index)}" cy="${y(value)}" r="3.5"><title>${short(days[index])} · ${safe(valueLabel(value))}</title></circle>`;
  }).join('');
  const labels = days.length === 7 ? [0,2,4,6] : [0,7,14,21,29];
  const description = values.map((value,index) => value === null ? '' : `${short(days[index])}: ${valueLabel(value)}`).filter(Boolean).join(', ');
  return `<article class="panel journal-chart" style="--chart-color:${color}">
    <div class="journal-chart-head"><h3>${title}</h3>${observed.length ? `<strong>${safe(valueLabel(latest))}</strong>` : ''}</div>
    ${observed.length ? `<svg viewBox="0 0 402 143" role="img" aria-label="${safe(title + '. ' + description)}">
      ${ticks.map(value => `<line x1="42" y1="${y(value)}" x2="376" y2="${y(value)}"/><text x="33" y="${y(value)+4}" text-anchor="end">${tickLabel(value)}</text>`).join('')}
      <path d="${path.trim()}" fill="none"/>${dots}
      ${labels.map(index => `<text x="${x(index)}" y="137" text-anchor="middle">${short(days[index])}</text>`).join('')}
    </svg>` : '<p class="muted">За этот период пока нет записей.</p>'}
  </article>`;
}

function journalAnalytics() {
  const days = Array.from({length:journalAnalyticsDays}, (_,index) => shift(journalDate, index - journalAnalyticsDays + 1));
  const sleep = entry => typeof entry.sleep === 'number' && Number.isFinite(entry.sleep) ? entry.sleep : null;
  const longSleep = days.some(date => sleep(state.journal[key(date)] || {}) > 12);
  const charts = [
    {title:'Сон', read:sleep, ticks:longSleep ? [0,6,12,18,24] : [0,3,6,9,12], tickLabel:v=>v,
      valueLabel:v=>`${v.toLocaleString('ru-RU')} ч`, color:'#91c8ff'},
    {title:'Энергия', read:entry=>[1,2,3,4,5].includes(entry.energy) ? entry.energy : null, ticks:[1,2,3,4,5],
      tickLabel:v=>v, valueLabel:v=>`${v} из 5`, color:'#bbf029'},
    {title:'Настроение', read:entry=> {
      const index = journalMoods.findIndex(([emoji]) => emoji === entry.mood);
      return index < 0 ? null : index + 1;
    }, ticks:[1,2,3,4,5], tickLabel:v=>journalMoods[v-1][0],
      valueLabel:v=>journalMoods[v-1].join(' '), color:'#f6a8cf'}
  ];
  return `<div class="journal-analytics-head">
    <div><h2 id="journal-analytics-title">Аналитика дневника</h2><p class="muted">${short(days[0])} — ${short(journalDate)}</p></div>
    <div class="orbit-range" role="group" aria-label="Период аналитики">${[7,30].map(days=>`<button type="button" data-journal-period="${days}" aria-pressed="${days === journalAnalyticsDays}">${days} дней</button>`).join('')}</div></div>
    <div class="journal-charts">${charts.map(chart => journalChart(days, chart)).join('')}</div>`;
}

function journalScreen() {
  const dateKey=key(journalDate);
  const entry=state.journal[dateKey] || {};
  const formatted=fmt(journalDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const dateText=formatted[0].toLocaleUpperCase('ru-RU')+formatted.slice(1);
  const energy=Number(entry.energy)||0;
  const lastDays=Array.from({length:7},(_,index)=>shift(journalDate,index-6));
  return `<div class="journal-layout"><section class="journal-main"><div class="journal-datebar"><button data-journal-move="-1" aria-label="Предыдущий день">←</button><div><span>МОЙ ДЕНЬ</span><h2>${dateText}</h2></div><button data-journal-move="1" aria-label="Следующий день">→</button><input type="date" id="journal-date" aria-label="Выбрать дату" value="${dateKey}"></div>
    <div class="journal-vitals"><div class="journal-field"><label for="journal-sleep">😴 Сон</label><div class="sleep-input"><input id="journal-sleep" type="number" inputmode="decimal" min="0" max="24" step="0.5" value="${safe(entry.sleep??'')}" placeholder="8"><span>часов</span></div></div><div class="journal-field"><span class="field-label">⚡ Энергия</span><div class="energy-options" role="group" aria-label="Уровень энергии">${[1,2,3,4,5].map(value=>`<button data-energy="${value}" class="${energy===value?'active':''}" aria-label="Энергия ${value} из 5" aria-pressed="${energy===value}">${value}</button>`).join('')}</div></div></div>
    <div class="journal-field mood-field"><span class="field-label">Как ты сегодня себя чувствуешь?</span><div class="mood-options" role="group" aria-label="Настроение">${journalMoods.map(([emoji,label])=>`<button data-mood="${emoji}" class="${entry.mood===emoji?'active':''}" aria-label="${label}" aria-pressed="${entry.mood===emoji}"><span>${emoji}</span><small>${label}</small></button>`).join('')}</div></div>
    ${entry.closedAt || entry.win ? `<label class="reflection-card journal-win">✨ Что получилось<textarea data-journal-field="win" maxlength="600" placeholder="Запиши одну победу дня">${safe(entry.win || '')}</textarea></label>` : ''}
    <div class="reflection-grid"><label class="reflection-card">🌱 Урок дня<textarea data-journal-field="lesson" placeholder="Что я сегодня понял(а)?">${safe(entry.lesson||'')}</textarea></label><label class="reflection-card">💛 Благодарность<textarea data-journal-field="gratitude" placeholder="За что я благодарен(на)?">${safe(entry.gratitude||'')}</textarea></label><label class="reflection-card wide">💭 Мысли<textarea data-journal-field="thoughts" placeholder="Запиши всё, что хочется сохранить…">${safe(entry.thoughts||'')}</textarea></label></div>
    <div class="journal-save">Сохраняется автоматически в этом браузере</div></section><aside class="journal-side"><div class="journal-side-title"><span>✨</span><h2>Твой ритм</h2></div><p>Последние семь дней. Нажми на день, чтобы открыть запись.</p><div class="journal-week">${lastDays.map(date=>{const item=state.journal[key(date)]||{};return `<button data-journal-day="${key(date)}" class="${key(date)===dateKey?'selected':''}"><span>${weekdays[weekday(date)]}</span><b>${safe(item.mood||'·')}</b><small>${date.getDate()}</small></button>`;}).join('')}</div><div class="journal-hint"><strong>💡 Идея для вечера</strong><p>Запиши одну вещь, которая получилась сегодня. Даже маленький шаг имеет значение.</p></div></aside></div>
    <section class="journal-analytics" id="journal-analytics" aria-labelledby="journal-analytics-title">${journalAnalytics()}</section>`;
}

function journalUpdate(field,value) {
  const day=key(journalDate);
  state.journal[day]={...(state.journal[day]||{}),[field]:value};
  save();
  if (field === 'sleep' && $('journal-analytics')) $('journal-analytics').innerHTML = journalAnalytics();
}

function journalClick(button) {
  if (button.dataset.journalPeriod) {
    journalAnalyticsDays = Number(button.dataset.journalPeriod);
    const panel = $('journal-analytics');
    panel.innerHTML = journalAnalytics();
    panel.querySelector(`[data-journal-period="${journalAnalyticsDays}"]`)?.focus({preventScroll:true});
    return true;
  }
  if(button.dataset.journalMove){journalDate=shift(journalDate,Number(button.dataset.journalMove));render();return true;}
  if(button.dataset.journalDay){journalDate=new Date(button.dataset.journalDay+'T12:00:00');render();return true;}
  if(button.dataset.energy){journalUpdate('energy',Number(button.dataset.energy));render();return true;}
  if(button.dataset.mood){journalUpdate('mood',button.dataset.mood);render();return true;}
  return false;
}
