const constellationPositions = [
  [50,51],[36,30],[25,56],[14,38],[31,75],[46,74],[61,64],[72,39],
  [85,48],[78,76],[90,70],[63,29],[51,25],[34,49],[22,27],[15,70],
  [40,59],[57,81],[67,51],[82,28],[89,33],[71,78],[55,36],[27,44]
];
let selectedStarId = '';
let constellationPage = 0;
let pendingProgressStar = '';
let progressStarObserver;

function queueProgressStar(id) {
  pendingProgressStar = selectedStarId = id;
  constellationPage = 0;
}

function observeProgressStar() {
  progressStarObserver?.disconnect();
  const star = $('constellation')?.querySelector('.awaiting-reveal');
  if (!star) return;

  const reveal = () => {
    if (pendingProgressStar !== star.dataset.progressStar) return;
    pendingProgressStar = '';
    star.classList.replace('awaiting-reveal','just-earned');
    $('constellation').querySelector('.awaiting-starlight')?.classList.replace('awaiting-starlight','trace-starlight');
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    reveal();
    return;
  }
  progressStarObserver = new IntersectionObserver(([entry],observer)=>{
    if (entry.intersectionRatio < .65 || !star.isConnected) return;
    observer.disconnect();
    reveal();
  },{threshold:.65});
  progressStarObserver.observe(star);
}

function updateConstellation(highlight = '') {
  const section = $('constellation');
  if (!section) return;
  section.outerHTML = constellationScreen(highlight);
  observeProgressStar();
}

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

function constellationScreen(highlight = '') {
  const stars = progressStars();
  const pageSize = constellationPositions.length;
  const lastPage = Math.max(0,Math.ceil(stars.length / pageSize) - 1);
  constellationPage = Math.min(constellationPage,lastPage);
  const start = constellationPage * pageSize;
  const visible = stars.slice(start,start + pageSize);
  const selected = visible.find(star=>star.id === selectedStarId) || visible[0];
  const plotted = visible.slice().reverse().map((star,index)=>({star, point:constellationPositions[index]}));
  const links = plotted.slice(1).map(({star,point},index)=>{
    const previous = plotted[index].point;
    const pending = star.id === pendingProgressStar ? ' class="awaiting-starlight"' : '';
    return `<path${pending} pathLength="1" d="M${previous.join(' ')} L${point.join(' ')}"/>`;
  }).join('');
  const plot = plotted.slice().reverse().map(({star,point:[left,top]})=>{
    const effect = star.id === pendingProgressStar ? ' awaiting-reveal' : star.id === highlight ? ' star-selected' : '';
    return `<button type="button" class="progress-star ${star.kind}${effect}" style="--star-x:${left}%;--star-y:${top}%"
      data-progress-star="${safe(star.id)}" aria-pressed="${star === selected}" aria-label="${safe(star.name + ' · ' + star.detail)}"><span aria-hidden="true">✦</span></button>`;
  }).join('');
  return `<section class="panel constellation-panel" id="constellation" aria-labelledby="constellation-title">
    <div class="constellation-head"><div><h2 id="constellation-title">Созвездие прогресса</h2><p class="muted">Маленькие шаги каждый день</p></div>
      ${stars.length ? `<span class="muted">Всего звёзд · ${stars.length}</span>` : ''}</div>
    <div class="constellation-sky" ${visible.length ? 'role="group" aria-label="Звёзды за последние достижения"' : 'aria-hidden="true"'}>
      ${links ? `<svg class="constellation-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${links}</svg>` : ''}${plot}
    </div>
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
  updateConstellation(selectedStarId);
  $('constellation').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
}

function changeConstellationPage(direction) {
  constellationPage = Math.max(0,constellationPage + Number(direction));
  selectedStarId = '';
  updateConstellation();
  const section = $('constellation');
  (section.querySelector(`[data-star-page="${direction}"]:not(:disabled)`) ||
    section.querySelector('[data-progress-star]'))?.focus({preventScroll:true});
}
