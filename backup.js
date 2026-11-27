const backupFormat = 'jospat-backup';
const backupVersion = 1;

function parseBackup(text) {
  const file = JSON.parse(text);
  if (file?.format !== backupFormat || file.version !== backupVersion) return null;

  const data = file.data;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const string = value => typeof value === 'string';
  const date = value => {
    if (!string(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const day = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
  };
  const time = value => string(value) && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
  const optional = (value, check) => value === undefined || check(value);
  const optionalDate = value => optional(value, item => item === '' || date(item));
  const optionalText = value => optional(value, string);
  const integer = (value,min,max) => Number.isInteger(value) && value >= min && value <= max;
  const list = (items, check) => Array.isArray(items) && items.every(check);
  const record = value => object(value) && string(value.id) && value.id !== '';
  const records = (items, check) => list(items, item => record(item) && check(item)) &&
    new Set(items.map(item => item.id)).size === items.length;
  const validTree = root => {
    const pending = [root];
    const ids = new Set();
    while (pending.length) {
      const node = pending.pop();
      if (!record(node) || ids.has(node.id) || !string(node.text) || !Array.isArray(node.children)) return false;
      ids.add(node.id);
      for (const child of node.children) pending.push(child);
    }
    return true;
  };

  if (!object(data) ||
    !optional(data.focusOptions, options => object(options) && integer(options.work,1,180) &&
      integer(options.rest,1,60) && integer(options.volume,0,100) && ['quiet','rain','space','noise','ambient'].includes(options.sound)) ||
    !optional(data.focusSessions, items => records(items, item => string(item.taskId) && string(item.taskName) &&
      integer(item.minutes,1,180) && string(item.date) && Number.isFinite(Date.parse(item.date)))) ||
    !optional(data.avoidanceTracks, tracks => records(tracks, track => string(track.name) && date(track.start) &&
      integer(track.target,1,3650) && object(track.entries) && Object.entries(track.entries).every(([day,mark]) =>
        date(day) && day >= track.start && ['kept','off'].includes(mark)))) ||
    !records(data.habits, habit => string(habit.name) &&
      list(habit.days, day => Number.isInteger(day) && day >= 0 && day < 7) &&
      list(habit.done, date) && optional(habit.paused, days => list(days, date)) &&
      optionalDate(habit.created) && optionalText(habit.color) && optionalText(habit.description)) ||
    !records(data.tasks, task => string(task.name) && date(task.date) && typeof task.done === 'boolean' &&
      optionalText(task.parentId) && optionalText(task.project) && optional(task.time, value => value === '' || time(value))) ||
    !records(data.events, event => string(event.name) && date(event.date) && time(event.time)) ||
    !records(data.notes, note => string(note.title) && string(note.body) && string(note.updated) &&
      optional(note.content, content => object(content) && content.type === 'doc') &&
      optional(note.checklist, items => records(items, item => string(item.text) && typeof item.done === 'boolean'))) ||
    !records(data.maps, map => string(map.name) && validTree(map.root)) ||
    !records(data.goals, goal => string(goal.title) && optionalText(goal.why) && optionalDate(goal.date) && optionalDate(goal.completedAt) &&
      optionalText(goal.criterion) && optionalText(goal.unit) &&
      optional(goal.mode, mode => Object.hasOwn(goalModes, mode)) &&
      (goal.mode === 'number' ? Number.isFinite(goal.target) : optional(goal.target, Number.isFinite)) &&
      optionalText(goal.habitId) && optionalDate(goal.startDate) && optional(goal.startValue, Number.isFinite) &&
      optional(goal.reviews, items => list(items, review => object(review) && date(review.week) &&
        string(review.reflection) && string(review.next) && optionalText(review.stepId))) &&
      optional(goal.measurements, items => records(items, item => date(item.date) && Number.isFinite(item.value))) &&
      records(goal.steps, step => string(step.text) && typeof step.done === 'boolean' && optionalDate(step.date) &&
        optionalDate(step.doneAt) && optional(step.milestone, value => typeof value === 'boolean'))) ||
    !object(data.journal) || !Object.entries(data.journal).every(([day, entry]) =>
      date(day) && object(entry) && ['win', 'closedAt', 'lesson', 'gratitude', 'thoughts', 'mood'].every(field => optionalText(entry[field])) &&
      optional(entry.sleep, value => value === '' || (typeof value === 'number' && value >= 0 && value <= 24)) &&
      optional(entry.energy, value => Number.isInteger(value) && value >= 0 && value <= 5))) return null;

  delete data.focusRun;
  return {data, noteFiles:object(file.noteFiles) ? file.noteFiles : {}};
}

function startBackup() {
  const dialog = $('backup');
  const fileInput = $('backup-file');
  const status = $('backup-status');
  const restore = $('backup-restore');
  const exportButton = $('backup-export');
  let candidate = null;
  let revision = 0;

  $('open-backup').addEventListener('click', () => dialog.showModal());
  $('backup-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    revision++;
    candidate = null;
    fileInput.value = '';
    status.textContent = '';
    restore.hidden = true;
  });
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const now = new Date();
      const data = structuredClone(state);
      delete data.focusRun;
      const noteFiles = await exportNoteFiles(data.notes);
      const file = new Blob([JSON.stringify({format:backupFormat, version:backupVersion, createdAt:now.toISOString(), data, noteFiles}, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `jospat-${key(now)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      status.textContent = 'Не удалось скачать копию. Проверь доступность вложений в заметках.';
    } finally {
      exportButton.disabled = false;
    }
  });

  fileInput.addEventListener('change', async () => {
    const revisionAtRead = ++revision;
    const file = fileInput.files[0];
    candidate = null;
    restore.hidden = true;
    status.textContent = '';
    if (!file) return;

    let contents;
    try { contents = parseBackup(await file.text()); }
    catch { contents = null; }
    if (revisionAtRead !== revision || !dialog.open) return;

    if (!contents) {
      status.textContent = 'Файл не подходит. Выбери JSON-копию, скачанную из JOSPAT.';
      return;
    }
    candidate = contents;
    const {data} = contents;
    status.textContent = `${file.name}. Привычки — ${data.habits.length}, задачи — ${data.tasks.length}, записи дневника — ${Object.keys(data.journal).length}. Текущие данные будут заменены.`;
    restore.hidden = false;
  });

  restore.addEventListener('click', async () => {
    if (!candidate) return;
    const attempt = revision;
    const data = structuredClone(candidate.data);
    const {noteFiles} = candidate;
    restore.disabled = true;
    fileInput.disabled = true;
    try {
      const ids = await restoreNoteFiles(data.notes, noteFiles);
      if (attempt !== revision || !dialog.open || !save(data)) {
        await writeNoteFiles([], ids);
        if (attempt === revision && dialog.open) status.textContent = 'Восстановить копию не удалось. Текущие данные сохранены.';
        return;
      }
      state = data;
      focusMessage = '';
      syncFocusSound();
      updateFocusPanel();
      activeNoteId = null;
      activeMapId = null;
      selectedMindNodeId = null;
      mindHistory.clear();
      mindCollapsed.clear();
      dialog.close();
      render();
      $('status').textContent = 'Резервная копия восстановлена.';
    } catch {
      if (attempt === revision) status.textContent = 'Восстановить копию не удалось. Проверь файл и доступное место в браузере.';
    } finally {
      restore.disabled = false;
      fileInput.disabled = false;
    }
  });
}
