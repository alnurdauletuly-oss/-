const todayQuotes = [
  'Выбери шаг, который помещается в сегодняшний день.',
  'Две страницы сегодня лучше обещания прочитать главу завтра.',
  'Пропустил день? Следующая отметка всё равно имеет значение.',
  'Поставь важное в календарь, пока день не заполнился.',
  'Отдых тоже можно поставить в календарь.',
  'Если трудно начать, выдели делу пять минут.',
  'Вечером запиши одну вещь, которая получилась.',
  'Привяжи новую привычку к тому, что уже делаешь каждый день.',
  'Когда план меняется, назначь следующему шагу новое время.',
  'Большая цель становится ближе, когда знаешь, что сделать сегодня.',
  'Если задача застряла, запиши, что именно мешает.',
  'В трудный день выбери самую простую версию привычки.',
  'Планируй день с учётом своих сил.',
  'Оставь в расписании место для неожиданного.',
  'Иногда лучшая правка плана — убрать одно лишнее дело.',
  'Сделай одно важное дело, пока мелочи не заняли весь день.',
  'Спроси себя, зачем тебе эта цель. Ответ поможет выбрать следующий шаг.',
  'Хорошая задача начинается с глагола, который подсказывает, что делать.',
  'Если дело постоянно откладывается, найди его часть, которую можно закончить сегодня.',
  'Начни с привычки, к которой легко вернуться завтра.',
  'Перечитай дневник и вспомни, что помогло тебе в сложный день.',
  'За минуту можно записать мысль, к которой захочется вернуться через год.',
  'Запиши идею, пока она свежая. Решить, что с ней делать, можно позже.',
  'Один день показывает, как было сегодня. Неделя показывает, что повторяется.',
  'Заранее реши, какой шаг сможешь сделать даже в день без сил.',
  'Прежде чем добавить привычку, найди для неё место в своём дне.',
  'Оставь себе на завтра один понятный первый шаг.',
  'Иногда прогресс заметен по тому, как быстро ты возвращаешься после паузы.',
  'Запиши, за что благодарен сегодня, пока ещё помнишь детали.',
  'Серию можно начать заново. Всё, чему ты научился, остаётся с тобой.'
];
const quoteInterval = 30 * 60 * 1000;

function todayQuote(now) {
  const slot = Math.floor((now.getTime() - (now.getTimezoneOffset() % 30) * 60000) / quoteInterval);
  return todayQuotes[slot % todayQuotes.length];
}

function startTodayQuoteClock() {
  let timeout;
  function refresh() {
    clearTimeout(timeout);
    const now = new Date();
    if (screen === 'home' && key(now) !== key(today) && !document.querySelector('dialog[open]')) render();
    const quote = $('today-quote');
    if (quote) quote.textContent = todayQuote(now);
    const elapsed = (now.getMinutes() % 30) * 60000 + now.getSeconds() * 1000 + now.getMilliseconds();
    timeout = setTimeout(refresh, quoteInterval - elapsed);
  }
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pageshow', refresh);
  refresh();
}

function todayScreen() {
  const now = new Date();
  const date = key(now);
  const entry = state.journal[date] || {};
  const daily = dailyProductivity(now);
  const habits = state.habits.filter(habit => habitScheduled(habit, now) || habitPaused(habit, date));
  const task = state.tasks.find(item => item.date === date && item.featured);
  const event = state.events
    .filter(item => new Date(`${item.date}T${item.time}`) >= now)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0];
  const pending = goalSteps().filter(({step}) => !step.done);
  const dated = pending.filter(({step}) => step.date).sort((a, b) => a.step.date.localeCompare(b.step.date));
  const scheduledSteps = goalSteps().filter(({step}) => step.date === date);
  const next = dated.find(({step}) => step.date < date) || pending.find(({step}) => !step.date);
  const shownSteps = scheduledSteps.length ? scheduledSteps : next ? [next] : [];
  const eventDay = event && (event.date === date ? 'Сегодня' : short(new Date(`${event.date}T12:00:00`)));
  const habitRow = habit => {
    const paused = habitPaused(habit, date);
    const done = habit.done.includes(date);
    const name = safe(habit.name);
    return `<div class="today-habit-row">
      ${paused ? `<span class="today-paused-name">${name}<small>На паузе</small></span>` :
        `<label class="today-check"><input class="check" type="checkbox" data-habit="${safe(habit.id)}" data-date="${date}" ${done ? 'checked' : ''}><span>${name}</span></label>`}
      ${done ? '' : `<button type="button" class="today-pause" data-habit-pause="${safe(habit.id)}" aria-label="${paused ? 'Возобновить' : 'Пауза на сегодня'} — ${name}" title="${paused ? 'Возобновить сегодня' : 'Пауза на сегодня'}">${paused ? 'Возобновить' : '<span aria-hidden="true">Ⅱ</span>'}</button>`}
    </div>`;
  };

  return `<section class="today-stage" id="today-overview" aria-labelledby="today-title">
    <div class="today-hero">
      <div id="planet-anchor" class="planet-anchor"></div>
      <p class="today-date"><span class="today-brand-mark" aria-hidden="true"></span><time datetime="${date}">${fmt(now, {weekday:'long', day:'numeric', month:'long'})}</time></p>
      <h1 id="today-title"><span class="today-title-day">Твой день.</span> <em>Твой темп.</em></h1>
      <p class="today-lead"><q id="today-quote">${safe(todayQuote(now))}</q></p>
    </div>
    <div class="today-glow" aria-hidden="true"></div>
    <div class="today-grid">
      <article class="today-card today-focus">
        <div class="today-card-head"><h2>Главная задача</h2><a href="#tasks" data-today-planner>Задачи</a></div>
        ${task ? `<label class="today-check"><input class="check" type="checkbox" data-task="${safe(task.id)}" ${task.done ? 'checked' : ''}><span>${safe(task.name)}</span></label>` :
          '<p>Отметь задачу звёздочкой, и она появится здесь.</p>'}
      </article>
      <article class="today-card" id="today-habits">
        <div class="today-card-head"><h2>Привычки сегодня</h2><a href="#habits">Трекер</a></div>
        <div class="today-metric"><strong>${daily.done}<small> / ${daily.planned}</small></strong>${daily.planned ? `<span>${daily.percent}%</span>` : ''}</div>
        <progress aria-label="Привычки на сегодня" value="${daily.done}" max="${daily.planned || 1}"></progress>
        ${habits.length ? `<div class="today-checks">${habits.map(habitRow).join('')}</div>` : '<p>На сегодня нет привычек.</p><button class="today-inline" data-advanced-habit>Добавить привычку</button>'}
      </article>
      <article class="today-card">
        <div class="today-card-head"><h2>Ближайшее событие</h2><a href="#calendar">Календарь</a></div>
        ${event ? `<div class="today-event"><time datetime="${safe(event.date)}T${safe(event.time)}">${safe(event.time)}</time><span>${eventDay}</span></div><p class="today-event-title">${safe(event.name)}</p>` : '<p>В календаре нет предстоящих событий.</p>'}
        <button class="today-inline" data-add-event="${date}">＋ Событие</button>
      </article>
    </div>
    ${shownSteps.map(({goal, step}) => `<div class="today-goal"><p><strong>${step.date === date ? 'Шаг на сегодня' : 'Следующий шаг к цели'}</strong> <span>${safe(goal.title)}</span></p><label class="today-check today-step">${goalStepCheckbox(goal, step)}<span>${safe(step.text)}</span></label><a href="#goals">Цели</a></div>`).join('')}
    <div class="today-actions"><button class="primary" type="button" data-close-day>${entry.closedAt ? 'Итог дня · Изменить' : 'Закрыть день'}</button><a href="#journal">Открыть дневник</a></div>
  </section>`;
}

function startCloseDay() {
  const dialog = $('close-day');
  const form = $('close-day-form');
  const nextTask = $('close-day-task');
  const taskName = $('close-day-task-name');
  let day;
  let tomorrow;
  let choices = [];
  function updateTaskField() {
    const needsName = nextTask.value === 'new';
    $('close-day-new-task').hidden = !needsName;
    taskName.required = needsName;
  }
  nextTask.addEventListener('change', updateTaskField);
  taskName.addEventListener('input', () => taskName.setCustomValidity(''));

  $('view').addEventListener('click', event => {
    if (!event.target.closest('[data-close-day]')) return;
    const now = new Date();
    day = key(now);
    tomorrow = key(shift(now, 1));
    const entry = state.journal[day] || {};
    const {done, planned} = dailyProductivity(now);
    const tasks = state.tasks.filter(task => task.date === day);
    choices = state.tasks.filter(task => task.date === tomorrow);
    const featured = choices.find(task => task.featured);
    form.reset();
    taskName.setCustomValidity('');
    $('close-day-summary').textContent = `Привычки: ${done} из ${planned} · Задачи: ${tasks.filter(task => task.done).length} из ${tasks.length}`;
    $('close-day-win').value = entry.win || '';
    $('close-day-error').textContent = '';
    nextTask.replaceChildren(new Option('Выбрать позже', ''));
    for (const [index, task] of choices.entries()) nextTask.add(new Option(task.name, String(index)));
    nextTask.add(new Option('Записать новый шаг', 'new'));
    nextTask.value = featured ? String(choices.indexOf(featured)) : '';
    updateTaskField();
    dialog.showModal();
  });

  $('close-day-cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', event => {
    event.preventDefault();
    const selection = nextTask.value;
    const name = taskName.value.trim();
    if (selection === 'new' && !name) {
      taskName.setCustomValidity('Введите следующий шаг');
      taskName.reportValidity();
      return;
    }
    const task = selection === 'new'
      ? {id:crypto.randomUUID(), name, date:tomorrow, done:false}
      : choices[selection];
    const entry = {...state.journal[day], win:$('close-day-win').value.trim(), closedAt:new Date().toISOString()};
    const updated = {...state, journal:{...state.journal, [day]:entry}};
    if (selection && task) {
      updated.tasks = tasksWithFeatured(task, true, selection === 'new' ? [...state.tasks, task] : state.tasks);
    }
    if (!save(updated)) {
      $('close-day-error').textContent = 'Итог не сохранился. Попробуй ещё раз.';
      return;
    }
    state = updated;
    journalDate = new Date(`${day}T12:00:00`);
    dialog.close();
    render();
    $('view').querySelector('[data-close-day]')?.focus({preventScroll:true});
  });
}
