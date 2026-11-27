const maxNoteFileSize = 100 * 1024 * 1024;
let noteFileDatabase;

function openNoteFiles() {
  noteFileDatabase ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('jospat-note-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); noteFileDatabase = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => { noteFileDatabase = null; throw error; });
  return noteFileDatabase;
}

async function writeNoteFiles(entries, removals = []) {
  if (!entries.length && !removals.length) return;
  const db = await openNoteFiles();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    for (const [id, file] of entries) store.put(file, id);
    for (const id of removals) store.delete(id);
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

async function readNoteFile(id) {
  const db = await openNoteFiles();
  return new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function visitNoteFiles(notes, visit) {
  for (const note of notes) {
    const nodes = [note.content];
    while (nodes.length) {
      const node = nodes.pop();
      if (node?.type === 'attachment') visit(node.attrs);
      if (Array.isArray(node?.content)) for (const child of node.content) nodes.push(child);
    }
  }
}

function noteFileSize(size) {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 ** 2) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 ** 2).toLocaleString('ru-RU',{maximumFractionDigits:1})} МБ`;
}

function noteAttachmentView(node, view, getPos) {
  const {id,name,mime,size} = node.attrs;
  const dom = document.createElement('div');
  dom.className = 'note-attachment';
  dom.contentEditable = 'false';
  const info = document.createElement('div');
  info.className = 'note-file-info';
  const title = document.createElement('span');
  title.textContent = name;
  const status = document.createElement('small');
  status.textContent = noteFileSize(size);
  const download = document.createElement('a');
  download.textContent = 'Скачать';
  download.download = name;
  download.hidden = true;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '×';
  remove.title = 'Убрать вложение';
  remove.setAttribute('aria-label', `Убрать вложение: ${name}`);
  remove.addEventListener('click', () => {
    const pos = getPos();
    if (Number.isInteger(pos)) view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
    view.focus();
  });
  info.append(title,status,download,remove);
  dom.append(info);
  let url;
  let destroyed = false;
  readNoteFile(id).then(file => {
    if (destroyed) return;
    if (!(file instanceof Blob)) throw new Error('Missing attachment');
    url = URL.createObjectURL(file);
    download.href = url;
    download.hidden = false;
    if (/^image\/(?:png|jpeg|gif|webp|avif|bmp)$/i.test(mime)) {
      const preview = document.createElement('img');
      preview.alt = name;
      preview.loading = 'lazy';
      preview.src = url;
      preview.addEventListener('error', () => preview.remove(), {once:true});
      dom.prepend(preview);
    } else if (/^video\//i.test(mime)) {
      const preview = document.createElement('video');
      if (!preview.canPlayType(mime)) return;
      preview.controls = true;
      preview.playsInline = true;
      preview.preload = 'metadata';
      preview.src = url;
      preview.addEventListener('error', () => preview.remove(), {once:true});
      dom.prepend(preview);
    }
  }).catch(() => {
    if (!destroyed) status.textContent = 'Файл недоступен в этом браузере';
  });
  return {
    dom, stopEvent:() => true, ignoreMutation:() => true,
    destroy() {
      destroyed = true;
      if (url) URL.revokeObjectURL(url);
    }
  };
}

async function addNoteFiles(note, files) {
  if (!note || !noteView) return;
  const allowed = files.filter(file => file.size <= maxNoteFileSize);
  if (!allowed.length) { feedback('Размер файла превышает 100 МБ'); return; }
  const originalView = noteView;
  const entries = allowed.map(file => [crypto.randomUUID(), file]);
  try {
    await writeNoteFiles(entries);
    if (!state.notes.includes(note)) {
      await writeNoteFiles([], entries.map(([id]) => id));
      return;
    }
    const activeView = currentNote() === note ? noteView : null;
    const editorState = activeView?.state || noteSessions.get(note);
    const {doc, selection} = editorState;
    const nodes = entries.map(([id,file]) => noteSchema.nodes.attachment.create({
      id, name:file.name, mime:file.type, size:file.size
    }));
    const position = activeView === originalView && selection.$to.depth ? selection.$to.after(1) : doc.content.size;
    if (position === doc.content.size) nodes.push(noteSchema.nodes.paragraph.create());
    const tr = editorState.tr.insert(position, noteLibrary.Fragment.fromArray(nodes));
    if (activeView) {
      activeView.dispatch(tr.scrollIntoView());
    } else {
      const next = editorState.apply(tr);
      noteSessions.set(note, next);
      writeNoteDocument(note, next.doc);
    }
    if (allowed.length !== files.length) feedback('Добавлены файлы размером до 100 МБ');
  } catch {
    feedback('Не удалось сохранить вложения в браузере');
  }
}

function noteFileBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function exportNoteFiles(notes) {
  const ids = new Set();
  visitNoteFiles(notes, attrs => ids.add(attrs.id));
  const files = {};
  for (const id of ids) {
    const blob = await readNoteFile(id);
    if (!(blob instanceof Blob)) throw new Error('Missing attachment');
    Object.defineProperty(files,id,{value:await noteFileBase64(blob), enumerable:true});
  }
  return files;
}

async function restoreNoteFiles(notes, files = {}) {
  const copied = new Map();
  visitNoteFiles(notes, attrs => {
    if (!attrs || typeof attrs.id !== 'string' || typeof attrs.name !== 'string' || typeof attrs.mime !== 'string' ||
      !Number.isInteger(attrs.size) || attrs.size < 0 || attrs.size > maxNoteFileSize) throw new Error('Invalid attachment');
    if (copied.has(attrs.id)) {
      attrs.id = copied.get(attrs.id)[0];
      return;
    }
    const body = Object.hasOwn(files, attrs.id) ? files[attrs.id] : null;
    if (typeof body !== 'string' || body.length !== Math.ceil(attrs.size / 3) * 4) throw new Error('Missing attachment');
    if (typeof Uint8Array.fromBase64 === 'function') {
      const bytes = Uint8Array.fromBase64(body);
      if (bytes.length !== attrs.size) throw new Error('Invalid attachment size');
      copied.set(attrs.id, [crypto.randomUUID(), new Blob([bytes], {type:attrs.mime})]);
    } else {
      const binary = atob(body);
      if (binary.length !== attrs.size) throw new Error('Invalid attachment size');
      copied.set(attrs.id, [crypto.randomUUID(), new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], {type:attrs.mime})]);
    }
    attrs.id = copied.get(attrs.id)[0];
  });
  const entries = [...copied.values()];
  await writeNoteFiles(entries);
  return entries.map(([id]) => id);
}
