let journalDate = new Date();
journalDate.setHours(12,0,0,0);

const journalMoods = [
  ['😞','Тяжело'], ['😕','Не очень'], ['😐','Ровно'], ['🙂','Хорошо'], ['🤩','Отлично']
];

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
    <div class="journal-save">Сохраняется автоматически в этом браузере</div></section><aside class="journal-side"><div class="journal-side-title"><span>✨</span><h2>Твой ритм</h2></div><p>Последние семь дней. Нажми на день, чтобы открыть запись.</p><div class="journal-week">${lastDays.map(date=>{const item=state.journal[key(date)]||{};return `<button data-journal-day="${key(date)}" class="${key(date)===dateKey?'selected':''}"><span>${weekdays[weekday(date)]}</span><b>${safe(item.mood||'·')}</b><small>${date.getDate()}</small></button>`;}).join('')}</div><div class="journal-hint"><strong>💡 Идея для вечера</strong><p>Запиши одну вещь, которая получилась сегодня. Даже маленький шаг имеет значение.</p></div></aside></div>`;
}

function journalUpdate(field,value) {
  const day=key(journalDate);
  state.journal[day]={...(state.journal[day]||{}),[field]:value};
  save();
}

function journalClick(button) {
  if(button.dataset.journalMove){journalDate=shift(journalDate,Number(button.dataset.journalMove));render();return true;}
  if(button.dataset.journalDay){journalDate=new Date(button.dataset.journalDay+'T12:00:00');render();return true;}
  if(button.dataset.energy){journalUpdate('energy',Number(button.dataset.energy));render();return true;}
  if(button.dataset.mood){journalUpdate('mood',button.dataset.mood);render();return true;}
  return false;
}
