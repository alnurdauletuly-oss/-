let feedbackTimer;
function feedback(message) {
  const status = $('workspace-feedback');
  clearTimeout(feedbackTimer);
  status.textContent = message;
  status.classList.add('visible');
  feedbackTimer = setTimeout(() => status.classList.remove('visible'), 2100);
}

function showActionMenu(button, items) {
  const open = button.parentElement.querySelector('.row-menu');
  document.querySelectorAll('.row-menu').forEach(menu => menu.remove());
  if (open || !items.length) return;
  const menu = document.createElement('div');
  menu.className = 'row-menu';
  for (const [label, action] of items) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.addEventListener('click', event => {
      event.stopPropagation();
      menu.remove();
      action();
    });
    menu.append(item);
  }
  button.after(menu);
  const rect = button.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.setProperty('--menu-x', `${Math.max(12, Math.min(innerWidth - width - 12, rect.right - width))}px`);
  menu.style.setProperty('--menu-y', `${Math.max(8, rect.bottom + height + 8 < innerHeight ? rect.bottom + 4 : rect.top - height - 4)}px`);
  menu.firstElementChild.focus({preventScroll:true});
}

function startWorkspaceInteractions() {
  const view = $('view');
  let drag = null;
  let suppressClick = false;

  document.addEventListener('click', event => {
    document.querySelectorAll('.row-menu').forEach(menu => {
      if (!menu.contains(event.target) && menu.previousElementSibling !== event.target.closest('button')) menu.remove();
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.row-menu').forEach(menu => {
      menu.previousElementSibling.focus({preventScroll:true});
      menu.remove();
    });
  });
  view.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    const handle = event.target.closest('[data-habit-drag], [data-task-drag]');
    if (!handle) return;
    const habit = Boolean(handle.dataset.habitDrag);
    drag = {handle, habit, id:handle.dataset.habitDrag || handle.dataset.taskDrag,
      pointer:event.pointerId, x:event.clientX, y:event.clientY, target:null, active:false};
    handle.setPointerCapture(event.pointerId);
  });
  view.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7 && !drag.active) return;
    drag.active = true;
    drag.target?.classList.remove('drop-before', 'drop-after', 'drop-on');
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const target = hit?.closest(drag.habit ? '[data-habit-row]' : '[data-task-drop], [data-plan-drop]');
    const id = target?.dataset.habitRow || target?.dataset.taskDrop || target?.dataset.planDrop;
    drag.target = id && id !== drag.id ? target : null;
    if (!drag.target) return;
    const rect = target.getBoundingClientRect();
    drag.after = event.clientY >= rect.top + rect.height / 2;
    target.classList.add(drag.habit ? (drag.after ? 'drop-after' : 'drop-before') : 'drop-on');
  });
  function finish(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const {active, habit, id, target, after} = drag;
    drag = null;
    target?.classList.remove('drop-before', 'drop-after', 'drop-on');
    suppressClick = active;
    if (event.type !== 'pointerup' || !target) return;
    if (habit) moveHabit(id, target.dataset.habitRow, after);
    else movePlannerTask(id, target.dataset.taskDrop, target.dataset.planDrop);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) view.addEventListener(type, finish);
  view.addEventListener('click', event => {
    if (!suppressClick || !event.detail) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function noteTools(note) {
  return `<div class="note-checklist">${(note.checklist || []).map(item => `<div class="note-check-row">
    <input class="check" type="checkbox" data-note-check="${safe(item.id)}" aria-label="Выполнить пункт" ${item.done ? 'checked' : ''}>
    <input data-note-check-text="${safe(item.id)}" maxlength="180" value="${safe(item.text)}" placeholder="Пункт списка" aria-label="Текст пункта списка">
    <button type="button" data-note-check-delete="${safe(item.id)}" aria-label="Удалить пункт">×</button>
  </div>`).join('')}</div>
  <div class="note-tools" aria-label="Инструменты заметки">
    <button type="button" data-note-check-add>☑ Чек-лист</button>
    <button type="button" data-note-format="bullet">• Список</button>
    <button type="button" data-note-format="number">1. Список</button>
  </div>`;
}

function editNoteItem(field) {
  const note = state.notes.find(item => item.id === activeNoteId);
  const item = note?.checklist?.find(item => item.id === (field.dataset.noteCheck || field.dataset.noteCheckText));
  if (!item) return false;
  if (field.type === 'checkbox') {
    item.done = field.checked;
    if (item.done) feedback('Пункт выполнен');
  }
  else item.text = field.value;
  note.updated = new Date().toISOString();
  save();
  return true;
}

function noteToolsClick(button) {
  const note = state.notes.find(item => item.id === activeNoteId);
  if (!note) return false;
  if (button.hasAttribute('data-note-check-add')) {
    const id = crypto.randomUUID();
    (note.checklist ??= []).push({id, text:'', done:false});
    note.updated = new Date().toISOString();
    if (!save()) return true;
    render();
    $('view').querySelector(`[data-note-check-text="${id}"]`)?.focus({preventScroll:true});
    feedback('Пункт добавлен');
    return true;
  }
  if (button.dataset.noteCheckDelete) {
    note.checklist = note.checklist.filter(item => item.id !== button.dataset.noteCheckDelete);
    note.updated = new Date().toISOString();
    if (save()) render();
    return true;
  }
  if (button.dataset.noteFormat) {
    const body = $('note-body');
    const start = body.selectionStart ? body.value.lastIndexOf('\n', body.selectionStart - 1) + 1 : 0;
    const next = body.value.indexOf('\n', body.selectionEnd);
    const end = next === -1 ? body.value.length : next;
    const lines = body.value.slice(start, end).split('\n');
    const formatted = lines.map((line, i) => (button.dataset.noteFormat === 'bullet' ? '• ' : `${i + 1}. `) +
      line.replace(/^(?:•|\d+\.) /, '')).join('\n');
    body.setRangeText(formatted, start, end, 'end');
    body.dispatchEvent(new Event('input', {bubbles:true}));
    body.focus();
    return true;
  }
  return false;
}

const entranceCruiseMs = 2500;
const entranceBrakeMs = 1000;
const entranceSpeed = 1.35;
let homeEntranceAt = null;

function finishHomeEntrance() {
  homeEntranceAt = null;
  document.body.classList.remove('home-warp', 'home-reveal');
}

function homeEntranceFrame(time) {
  if (homeEntranceAt === null) return 0;
  const elapsed = time - homeEntranceAt;
  if (elapsed < entranceCruiseMs) return entranceSpeed;
  const braking = (elapsed - entranceCruiseMs) / entranceBrakeMs;
  if (braking >= 1) {
    finishHomeEntrance();
    return 0;
  }
  document.body.classList.replace('home-warp', 'home-reveal');
  // Smoothstep keeps speed continuous at both ends of the transition.
  return entranceSpeed * (1 - braking * braking * (3 - 2 * braking));
}

function startHomeEntrance(spaceReady) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let entered = false;
  function updateRoute() {
    const hero = document.querySelector('.today-hero');
    if (!hero) {
      finishHomeEntrance();
      return;
    }
    if (entered) return;
    entered = true;
    try {
      if (sessionStorage.getItem('jospat-home-entered')) return;
      sessionStorage.setItem('jospat-home-entered', '1');
    } catch {}
    if (!spaceReady || motion.matches) {
      hero.classList.add('home-quiet-entry');
      return;
    }
    homeEntranceAt = performance.now();
    document.body.classList.add('home-warp');
  }
  motion.addEventListener('change', finishHomeEntrance);
  window.addEventListener('hashchange', updateRoute);
  updateRoute();
}
