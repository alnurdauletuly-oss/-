function todayScreen() {
  const now = new Date();
  const date = key(now);
  const habits = state.habits.filter(habit => habit.days.includes(weekday(now)));
  const done = habits.filter(habit => habit.done.includes(date)).length;
  const percent = habits.length ? Math.round(done / habits.length * 100) : 0;
  const events = state.events.filter(event => new Date(`${event.date}T${event.time}`) >= now);
  events.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const event = events[0];
  const pending = goalSteps().filter(({ step }) => !step.done);
  const scheduled = pending.filter(({ step }) => step.date);
  scheduled.sort((a, b) => a.step.date.localeCompare(b.step.date));
  const next = scheduled.find(({ step }) => step.date <= date) || pending.find(({ step }) => !step.date) || scheduled[0];
  const stepDate = next?.step.date;
  let stepTiming = '';
  if (stepDate) {
    const day = short(new Date(`${stepDate}T12:00:00`));
    stepTiming = stepDate === date ? 'Запланировано на сегодня' :
      stepDate < date ? `Было запланировано на ${day}` : `Запланировано на ${day}`;
  }
  const eventDay = event && (event.date === date ? 'Сегодня' : short(new Date(`${event.date}T12:00:00`)));

  const habitRow = habit => `<label class="today-check">
    <input class="check" type="checkbox" data-habit="${safe(habit.id)}" data-date="${date}" ${habit.done.includes(date) ? 'checked' : ''}>
    <span>${safe(habit.name)}</span>
  </label>`;

  return `<section class="today-stage" id="today-overview" aria-labelledby="today-title">
    <div class="today-hero">
      <p class="today-date"><time datetime="${date}">${fmt(now, {weekday:'long', day:'numeric', month:'long'})}</time></p>
      <h1 id="today-title">Твой день.<br><em>Твой темп.</em></h1>
      <p class="today-lead">Отметь привычки, посмотри планы и сделай следующий шаг к цели.</p>
      <div class="hero-actions"><button class="primary" data-today-start>${habits.length ? 'Отметить привычки' : 'Добавить привычку'}</button><a href="#journal">Открыть дневник</a></div>
    </div>
    <div class="today-glow" aria-hidden="true"></div>
    <div class="today-grid">
      <article class="today-card" id="today-habits" tabindex="-1">
        <div class="today-card-head"><h2>Привычки сегодня</h2><a href="#habits">Неделя</a></div>
        <div class="today-metric"><strong>${done}<small> / ${habits.length}</small></strong><span>${percent}%</span></div>
        <progress aria-label="Привычки на сегодня" value="${done}" max="${habits.length || 1}"></progress>
        ${habits.length ? `<div class="today-checks">${habits.map(habitRow).join('')}</div>` : '<p>На сегодня нет привычек.</p><button class="today-inline" data-advanced-habit>Добавить привычку</button>'}
      </article>
      <article class="today-card">
        <div class="today-card-head"><h2>Следующий шаг</h2><a href="#goals">Цели</a></div>
        ${next ? `<p class="today-context">${safe(next.goal.title)}</p>
          <label class="today-check today-step"><input class="check" type="checkbox" data-goal-step="${safe(next.goal.id)}" data-step-id="${safe(next.step.id)}"><span>${safe(next.step.text)}</span></label>
          ${stepTiming ? `<p>${stepTiming}</p>` : ''}` : '<p>Добавь шаг в «Целях» или назначь его на сегодня.</p>'}
      </article>
      <article class="today-card">
        <div class="today-card-head"><h2>Ближайшее событие</h2><a href="#calendar">Календарь</a></div>
        ${event ? `<div class="today-event"><time datetime="${safe(event.date)}T${safe(event.time)}">${safe(event.time)}</time><span>${eventDay}</span></div><p class="today-event-title">${safe(event.name)}</p>` : '<p>В календаре нет предстоящих событий.</p>'}
        <button class="today-inline" data-add-event="${date}">＋ Событие</button>
      </article>
    </div>
  </section>`;
}

function focusTodayHabits() {
  const card = $('today-habits');
  const first = card.querySelector('input:not(:checked)') || card.querySelector('input');
  if (!first) {
    openEditor('habit');
    return;
  }
  const motion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({behavior: motion ? 'instant' : 'smooth', block:'nearest'});
  first.focus({preventScroll:true});
}
