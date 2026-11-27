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
  const dragSources = '[data-habit-drag], [data-task-drag], [data-task-name]';
  const dropClasses = ['drop-before', 'drop-after', 'drop-on'];
  let scrollFrame = 0;

  function startDrag(handle, point, pointer, touch) {
    const {habitDrag, taskDrag, taskName} = handle.dataset;
    drag = {handle, pointer, touch, habit:Boolean(habitDrag), id:habitDrag || taskDrag || taskName,
      x:point.clientX, y:point.clientY, target:null, active:false};
  }

  function updateDropTarget() {
    drag.target?.classList.remove(...dropClasses);
    const hit = document.elementFromPoint(drag.x, drag.y);
    const selector = drag.habit ? '[data-habit-row]' : '[data-plan-jump], [data-task-drop], [data-plan-drop]';
    const target = hit?.closest(selector);
    const targetId = target?.dataset.habitRow || target?.dataset.taskDrop;
    drag.target = target && targetId !== drag.id ? target : null;
    if (!drag.target) return;
    const rect = target.getBoundingClientRect();
    const fraction = (drag.y - rect.top) / rect.height;
    drag.after = fraction >= .5;
    const nest = target.hasAttribute('data-task-parent') && fraction > .28 && fraction < .72;
    const between = drag.habit || (target.hasAttribute('data-task-drop') && !nest);
    drag.mode = between ? (drag.after ? 'drop-after' : 'drop-before') : 'drop-on';
    target.classList.add(drag.mode);
  }

  function scrollNearEdge() {
    if (!drag?.active || drag.habit) return;
    if (!drag.handle.isConnected) { finishDrag(false); return; }
    const edge = 84;
    let speed = 0;
    if (drag.y < edge) speed = -Math.ceil((edge - drag.y) / 5);
    else if (drag.y > innerHeight - edge) speed = Math.ceil((drag.y - innerHeight + edge) / 5);
    if (speed) {
      window.scrollBy(0, speed);
      updateDropTarget();
    }
    scrollFrame = requestAnimationFrame(scrollNearEdge);
  }

  function activateDrag() {
    drag.active = true;
    if (drag.habit) return;
    document.querySelectorAll('.row-menu').forEach(menu => menu.remove());
    drag.row = drag.handle.closest('.plan-task-row');
    drag.row.classList.add('task-drag-source');
    drag.preview = document.createElement('div');
    drag.preview.className = 'task-drag-preview';
    drag.preview.setAttribute('aria-hidden', 'true');
    drag.preview.textContent = drag.row.querySelector('.task-name')?.textContent ||
      drag.row.querySelector('input[name="name"]')?.value || '';
    document.body.append(drag.preview);
    scrollFrame = requestAnimationFrame(scrollNearEdge);
  }

  function trackDrag(point) {
    drag.x = point.clientX;
    drag.y = point.clientY;
    if (drag.preview) {
      const x = Math.min(drag.x, innerWidth - drag.preview.offsetWidth - 16);
      const y = Math.min(drag.y, innerHeight - drag.preview.offsetHeight - 24);
      drag.preview.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    updateDropTarget();
  }

  function finishDrag(dropped) {
    const {active, habit, id, target, after, mode, preview, row, hold} = drag;
    drag = null;
    clearTimeout(hold);
    cancelAnimationFrame(scrollFrame);
    target?.classList.remove(...dropClasses);
    row?.classList.remove('task-drag-source');
    preview?.remove();
    suppressClick = active;
    if (!dropped || !target) return;
    if (habit) {
      moveHabit(id, target.dataset.habitRow, after);
    } else if (target.dataset.taskDrop && mode !== 'drop-on') {
      const sibling = state.tasks.find(task => task.id === target.dataset.taskDrop);
      if (sibling) movePlannerTask(id, sibling.parentId, sibling.date, {id:sibling.id, after});
    } else {
      movePlannerTask(id, target.dataset.taskDrop, target.dataset.planJump || target.dataset.planDrop);
    }
  }

  view.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    const handle = event.target.closest(dragSources);
    if (!handle || (event.pointerType === 'touch' && handle.hasAttribute('data-task-name'))) return;
    startDrag(handle, event, event.pointerId, false);
    handle.setPointerCapture(event.pointerId);
  });
  view.addEventListener('pointermove', event => {
    if (!drag || drag.touch || drag.pointer !== event.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      activateDrag();
    }
    trackDrag(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    view.addEventListener(type, event => {
      if (drag && !drag.touch && drag.pointer === event.pointerId) finishDrag(type === 'pointerup');
    });
  }

  // A swipe before the hold scrolls normally. After the hold this gesture moves the task.
  view.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) {
      if (drag?.touch) finishDrag(false);
      return;
    }
    const handle = event.target.closest('[data-task-name]');
    if (!handle) return;
    suppressClick = false;
    const point = event.changedTouches[0];
    startDrag(handle, point, point.identifier, true);
    drag.hold = setTimeout(() => {
      if (!drag.handle.isConnected) { finishDrag(false); return; }
      activateDrag();
      trackDrag(point);
    }, 330);
  }, {passive:true});
  view.addEventListener('touchmove', event => {
    if (!drag?.touch) return;
    const point = [...event.changedTouches].find(touch => touch.identifier === drag.pointer);
    if (!point) return;
    if (!drag.active) {
      if (Math.hypot(point.clientX - drag.x, point.clientY - drag.y) >= 7) finishDrag(false);
      return;
    }
    if (!event.cancelable) { finishDrag(false); return; }
    event.preventDefault();
    trackDrag(point);
  }, {passive:false});
  for (const type of ['touchend', 'touchcancel']) {
    view.addEventListener(type, event => {
      if (drag?.touch && [...event.changedTouches].some(touch => touch.identifier === drag.pointer)) {
        if (type === 'touchend' && drag.active && event.cancelable) event.preventDefault();
        finishDrag(type === 'touchend' && drag.active);
      }
    }, {passive:false});
  }
  view.addEventListener('contextmenu', event => {
    if (drag?.touch && event.target.closest('[data-task-name]')) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) finishDrag(false);
  });
  window.addEventListener('hashchange', () => { if (drag) finishDrag(false); });
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

const entranceVersion = 'arrival-from-open';
const entranceRampMs = 500;
const entranceTotalMs = 2000;
const entranceBrakeMs = 1000;
const entranceSpeed = 1.35;
let homeEntranceAt = null;

function finishHomeEntrance() {
  homeEntranceAt = null;
  document.body.classList.remove('home-warp', 'home-reveal');
}

function smoothEntrance(progress) {
  return progress * progress * (3 - 2 * progress);
}

function homeEntranceFrame(time) {
  if (homeEntranceAt === null) return null;
  const elapsed = Math.max(0, time - homeEntranceAt);
  if (elapsed < entranceRampMs) return entranceSpeed * smoothEntrance(elapsed / entranceRampMs);
  const brakeStart = entranceTotalMs - entranceBrakeMs;
  if (elapsed < brakeStart) return entranceSpeed;
  const braking = (elapsed - brakeStart) / entranceBrakeMs;
  if (braking >= 1) {
    finishHomeEntrance();
    return null;
  }
  document.body.classList.replace('home-warp', 'home-reveal');
  return entranceSpeed * (1 - smoothEntrance(braking));
}

function startHomeEntrance(spaceReady) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let entered = false;
  function updateRoute(startedAt) {
    const hero = document.querySelector('.today-hero');
    if (!hero) {
      finishHomeEntrance();
      return;
    }
    if (entered) return;
    entered = true;
    try {
      if (sessionStorage.getItem('jospat-home-entered') === entranceVersion) return;
      sessionStorage.setItem('jospat-home-entered', entranceVersion);
    } catch {}
    if (performance.now() - startedAt >= entranceTotalMs) return;
    if (!spaceReady || motion.matches) {
      hero.classList.add('home-quiet-entry');
      return;
    }
    homeEntranceAt = startedAt;
    document.body.classList.add('home-warp');
  }
  motion.addEventListener('change', finishHomeEntrance);
  window.addEventListener('hashchange', () => updateRoute(performance.now()));
  // The initial visit includes loading time in the entrance budget.
  updateRoute(0);
}
