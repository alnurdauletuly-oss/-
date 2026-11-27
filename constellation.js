const constellationPositions = [
  [12,64],[24,30],[34,51],[46,22],[58,44],[69,25],[87,42],[79,73],
  [65,62],[51,76],[37,65],[21,80],[15,36],[30,16],[43,38],[54,57],
  [73,49],[90,66],[82,18],[64,14],[56,32],[39,15],[29,73],[72,83]
];
let selectedStarId = '';
let constellationPage = 0;

function progressStars() {
  const sessions = (state.focusSessions || []).map(session=>({
    id:`focus-${session.id}`, day:key(new Date(session.date)), date:session.date,
    name:session.taskName || 'Самостоятельная сессия', detail:`Фокус · ${session.minutes} мин`, kind:'focus'
  }));
  const stages = goalSteps().filter(({goal,step}) => goalMode(goal) === 'stages' && milestone(step) && step.done && step.doneAt)
    .map(({goal,step})=>({
      id:`stage-${goal.id}-${step.id}`, day:step.doneAt, date:step.doneAt,
      name:step.text, detail:`Этап цели · ${goal.title}`, kind:'stage'
    }));
  return [...sessions,...stages].sort((a,b)=>b.day.localeCompare(a.day) || b.date.localeCompare(a.date));
}

function constellationScreen() {
  const stars = progressStars();
  const pageSize = constellationPositions.length;
  const lastPage = Math.max(0,Math.ceil(stars.length / pageSize) - 1);
  constellationPage = Math.min(constellationPage,lastPage);
  const start = constellationPage * pageSize;
  const visible = stars.slice(start,start + pageSize);
  const selected = visible.find(star=>star.id === selectedStarId) || visible[0];
  const plot = visible.map((star,index)=>{
    const [left,top] = constellationPositions[index];
    return `<button type="button" class="progress-star ${star.kind}" style="--star-x:${left}%;--star-y:${top}%"
      data-progress-star="${safe(star.id)}" aria-pressed="${star === selected}" aria-label="${safe(star.name + ' · ' + star.detail)}"><span aria-hidden="true">✦</span></button>`;
  }).join('');
  return `<section class="panel constellation-panel" id="constellation" aria-labelledby="constellation-title">
    <div class="constellation-head"><h2 id="constellation-title">Созвездие прогресса</h2>
      ${stars.length ? `<span class="muted">Всего звёзд · ${stars.length}</span>` : ''}</div>
    <div class="constellation-sky" ${visible.length ? 'role="group" aria-label="Звёзды за последние достижения"' : 'aria-hidden="true"'}>${plot}</div>
    ${selected ? `<div class="constellation-detail" aria-live="polite"><div><strong>${safe(selected.name)}</strong><p>${safe(selected.detail)}</p></div>
      <time datetime="${safe(selected.day)}">${showGoalDate(selected.day)}</time></div>` :
      '<p class="muted">Первая звезда появится за завершённую сессию фокуса или выполненный этап цели.</p>'}
    ${lastPage ? `<div class="constellation-pages">
      <button type="button" data-star-page="-1" ${constellationPage === 0 ? 'disabled' : ''}>Новее</button>
      <span>${constellationPage + 1} / ${lastPage + 1}</span>
      <button type="button" data-star-page="1" ${constellationPage === lastPage ? 'disabled' : ''}>Раньше</button>
    </div>` : ''}
  </section>`;
}

function selectProgressStar(button) {
  selectedStarId = button.dataset.progressStar;
  $('constellation').outerHTML = constellationScreen();
  $('constellation').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
}

function changeConstellationPage(direction) {
  constellationPage = Math.max(0,constellationPage + Number(direction));
  selectedStarId = '';
  $('constellation').outerHTML = constellationScreen();
  const section = $('constellation');
  (section.querySelector(`[data-star-page="${direction}"]:not(:disabled)`) ||
    section.querySelector('[data-progress-star]'))?.focus({preventScroll:true});
}
