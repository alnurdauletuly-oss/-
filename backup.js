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
    !records(data.habits, habit => string(habit.name) &&
      list(habit.days, day => Number.isInteger(day) && day >= 0 && day < 7) &&
      list(habit.done, date) && optional(habit.paused, days => list(days, date)) &&
      optionalDate(habit.created) && optionalText(habit.color) && optionalText(habit.description)) ||
    !records(data.tasks, task => string(task.name) && date(task.date) && typeof task.done === 'boolean' &&
      optionalText(task.parentId) && optionalText(task.project) && optional(task.time, value => value === '' || time(value))) ||
    !records(data.events, event => string(event.name) && date(event.date) && time(event.time)) ||
    !records(data.notes, note => string(note.title) && string(note.body) && string(note.updated)) ||
    !records(data.maps, map => string(map.name) && validTree(map.root)) ||
    !records(data.goals, goal => string(goal.title) && optionalText(goal.why) && optionalDate(goal.date) &&
      records(goal.steps, step => string(step.text) && typeof step.done === 'boolean' && optionalDate(step.date))) ||
    !object(data.journal) || !Object.entries(data.journal).every(([day, entry]) =>
      date(day) && object(entry) && ['win', 'closedAt', 'lesson', 'gratitude', 'thoughts', 'mood'].every(field => optionalText(entry[field])) &&
      optional(entry.sleep, value => value === '' || (typeof value === 'number' && value >= 0 && value <= 24)) &&
      optional(entry.energy, value => Number.isInteger(value) && value >= 0 && value <= 5))) return null;

  return data;
}

function startBackup() {
  const dialog = $('backup');
  const fileInput = $('backup-file');
  const status = $('backup-status');
  const restore = $('backup-restore');
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
  $('backup-export').addEventListener('click', () => {
    const now = new Date();
    const file = new Blob([JSON.stringify({format:backupFormat, version:backupVersion, createdAt:now.toISOString(), data:state}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jospat-${key(now)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  fileInput.addEventListener('change', async () => {
    const revisionAtRead = ++revision;
    const file = fileInput.files[0];
    candidate = null;
    restore.hidden = true;
    status.textContent = '';
    if (!file) return;

    let data;
    try { data = parseBackup(await file.text()); }
    catch { data = null; }
    if (revisionAtRead !== revision || !dialog.open) return;

    if (!data) {
      status.textContent = 'Файл не подходит. Выбери JSON-копию, скачанную из JOSPAT.';
      return;
    }
    candidate = data;
    status.textContent = `${file.name}. Привычки — ${data.habits.length}, задачи — ${data.tasks.length}, записи дневника — ${Object.keys(data.journal).length}. Текущие данные будут заменены.`;
    restore.hidden = false;
  });

  restore.addEventListener('click', () => {
    if (!candidate) return;
    if (!save(candidate)) {
      status.textContent = 'Восстановить копию не удалось. Текущие данные сохранены.';
      return;
    }
    state = candidate;
    activeNoteId = null;
    activeMapId = null;
    selectedMindNodeId = null;
    mindHistory.clear();
    mindCollapsed.clear();
    dialog.close();
    render();
    $('status').textContent = 'Резервная копия восстановлена.';
  });
}
