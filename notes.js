const noteSessions = new WeakMap();
let noteView;
let noteLibrary;
let noteSchema;
let noteLibraryLoading;
const noteScript = document.currentScript.src;

const noteFormats = [
  ['bold','Жирный','B'], ['italic','Курсив','I'], ['underline','Подчёркнутый','U'],
  ['strike','Зачёркнутый','S'], ['highlight','Выделить маркером','▰']
];
const noteHighlightColors = [
  ['lime','Лаймовый'], ['amber','Янтарный'], ['rose','Розовый'],
  ['blue','Голубой'], ['violet','Фиолетовый']
];
const noteBlocks = [
  ['title','Название'], ['heading','Заголовок'], ['subheading','Подзаголовок'],
  ['paragraph','Основной текст'], ['mono','Моноширинный шрифт'],
  ['bullet','Маркированный список'], ['dash','Список с тире'],
  ['number','Нумерованный список'], ['quote','Блок цитаты']
];
const noteTableActions = [
  ['row-add','Добавить строку'], ['column-add','Добавить столбец'],
  ['row-delete','Удалить строку'], ['column-delete','Удалить столбец'],
  ['table-delete','Удалить таблицу']
];

function noteButton(action, label, text = label) {
  return `<button type="button" data-note-command="${action}" aria-label="${label}" title="${label}">${text}</button>`;
}

function noteEditorMarkup() {
  return `<div class="note-tools" role="group" aria-label="Инструменты заметки">
    <details><summary>Формат</summary><div class="note-menu">
      <div class="note-inline-tools">${noteFormats.map(args => noteButton(...args)).join('')}</div>
      <div class="note-highlight-colors" role="group" aria-label="Цвет маркера">
        ${noteHighlightColors.map(([color,label]) => `<button type="button" data-note-command="highlight-${color}" data-highlight="${color}" aria-label="${label} маркер" title="${label} маркер"></button>`).join('')}
      </div>
      ${noteBlocks.map(args => noteButton(...args)).join('')}
    </div></details>
    ${noteButton('checklist','Чек-лист')}
    <details><summary>Таблица</summary><div class="note-menu">
      ${noteButton('table','Вставить таблицу 2 × 2')}
      <div class="note-table-actions" hidden>${noteTableActions.map(args => noteButton(...args)).join('')}</div>
    </div></details>
    <details><summary>Вставка</summary><div class="note-menu">
      ${noteButton('link','Ссылка')}${noteButton('media','Фото или видео')}${noteButton('file','Файл')}
    </div></details>
    <div class="note-history">${noteButton('undo','Отменить изменение','↶')}${noteButton('redo','Повторить изменение','↷')}</div>
    <input type="file" id="note-file" hidden multiple>
  </div>
  <div class="note-editor-host" aria-busy="true"></div>
  <dialog class="note-link-dialog" aria-labelledby="note-link-title">
    <form id="note-link-form"><h2 id="note-link-title">Ссылка</h2>
      <label>Адрес <input name="url" inputmode="url" placeholder="https://…" autocomplete="url" required></label>
      <div class="note-link-actions"><button type="submit" class="primary">Сохранить</button>
        <button type="button" data-note-command="unlink" hidden>Убрать ссылку</button>
        <a target="_blank" rel="noopener noreferrer" hidden>Открыть</a>
        <button type="button" data-note-command="close-link">Отмена</button></div>
    </form>
  </dialog>`;
}

function noteURL(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const input = value.trim();
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function noteHighlightColor(color) {
  return noteHighlightColors.some(([value]) => value === color) ? color : 'lime';
}

function makeNoteSchema() {
  const basic = noteLibrary.basicSchema.spec;
  const levelTags = ['h1','h2','h3'];
  const nodes = noteLibrary.addListNodes(basic.nodes.remove('image')
    .update('heading', {
      attrs:{level:{default:1, validate:'number'}}, content:'inline*', group:'block', defining:true,
      parseDOM:levelTags.map((tag, i) => ({tag, attrs:{level:i + 1}})),
      toDOM:node => [levelTags[node.attrs.level - 1] || 'h3', 0]
    }), 'paragraph block*', 'block')
    .append({
      dash_list:{content:'list_item+', group:'block', parseDOM:[{tag:'ul[data-dash]', priority:60}],
        toDOM:() => ['ul', {'data-dash':''}, 0]},
      task_list:{content:'task_item+', group:'block', parseDOM:[{tag:'ul[data-checklist]', priority:60}],
        toDOM:() => ['ul', {'data-checklist':''}, 0]},
      task_item:{
        content:'paragraph block*', defining:true, attrs:{checked:{default:false, validate:'boolean'}},
        parseDOM:[{tag:'li[data-checked]', priority:60, getAttrs:el => ({checked:el.dataset.checked === 'true'})}],
        toDOM:node => ['li', {'data-checked':String(node.attrs.checked)}, 0]
      },
      attachment:{
        group:'block', atom:true, selectable:true, draggable:false,
        attrs:{id:{validate:'string'}, name:{validate:'string'}, mime:{validate:'string'}, size:{validate:'number'}},
        leafText:node => node.attrs.name,
        toDOM:node => ['div', {'data-attachment':''}, node.attrs.name]
      }
    }).append(noteLibrary.tableNodes({tableGroup:'block', cellContent:'paragraph+'}));

  const marks = basic.marks.update('link', {
    attrs:{href:{validate:'string'}}, inclusive:false,
    parseDOM:[{tag:'a[href]', getAttrs:el => {
      const href = noteURL(el.getAttribute('href'));
      return href ? {href} : false;
    }}],
    toDOM:mark => ['a', {href:noteURL(mark.attrs.href) || null, target:'_blank', rel:'noopener noreferrer'}, 0]
  }).append({
    underline:{parseDOM:[{tag:'u'}, {style:'text-decoration=underline'}], toDOM:() => ['u', 0]},
    strike:{parseDOM:[{tag:'s'}, {tag:'del'}, {tag:'strike'}, {style:'text-decoration=line-through'}], toDOM:() => ['s', 0]},
    highlight:{
      attrs:{color:{default:'lime', validate:'string'}},
      parseDOM:[{tag:'mark', getAttrs:el => ({color:noteHighlightColor(el.dataset.highlight)})}],
      toDOM:mark => ['mark', {'data-highlight':noteHighlightColor(mark.attrs.color)}, 0]
    }
  });
  return new noteLibrary.Schema({nodes, marks});
}

function noteDocument(note) {
  if (note.content) {
    try {
      const doc = noteSchema.nodeFromJSON(note.content);
      if (doc.type !== noteSchema.topNodeType) throw new Error('Invalid note');
      doc.check();
      return doc;
    } catch { /* Plain text remains available for older or unreadable notes. */ }
  }
  const {paragraph, task_list, task_item} = noteSchema.nodes;
  const line = text => paragraph.create(null, text ? noteSchema.text(text) : null);
  const blocks = note.body.split(/\r\n?|\n/).map(line);
  if (note.checklist?.length) {
    blocks.push(task_list.create(null, note.checklist.map(item => task_item.create({checked:item.done}, line(item.text)))));
  }
  return noteSchema.topNodeType.create(null, blocks);
}

function currentNote() {
  return state.notes.find(note => note.id === activeNoteId);
}

function writeNoteDocument(note, doc) {
  note.content = doc.toJSON();
  note.body = doc.textBetween(0, doc.content.size, '\n');
  delete note.checklist;
  touchNote(note);
}

function touchNote(note) {
  note.updated = new Date().toISOString();
  const saved = save();
  if (currentNote() !== note) return;
  const status = $('note-save-status');
  if (status) status.textContent = saved ? 'Сохранено' : 'Не удалось сохранить';
  const updated = $('note-updated');
  if (updated) updated.textContent = noteUpdatedLabel(note);
  const items = $('note-items');
  if (items) items.innerHTML = noteListItems();
}

function noteAncestor(type, position = noteView.state.selection.$from) {
  for (let depth = position.depth; depth > 0; depth--) {
    if (position.node(depth).type === type) return depth;
  }
  return 0;
}

function noteTaskView(node, view, getPos) {
  const dom = document.createElement('li');
  const button = document.createElement('button');
  const contentDOM = document.createElement('div');
  button.type = 'button';
  button.className = 'note-check-toggle';
  button.contentEditable = 'false';
  button.setAttribute('role','checkbox');
  button.addEventListener('click', () => {
    const pos = getPos();
    if (Number.isInteger(pos)) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {checked:!node.attrs.checked}));
  });
  dom.append(button, contentDOM);
  function update(next) {
    if (next.type !== node.type) return false;
    node = next;
    dom.dataset.checked = String(node.attrs.checked);
    button.setAttribute('aria-checked', String(node.attrs.checked));
    button.setAttribute('aria-label', node.textContent ? `Выполнено: ${node.textContent}` : 'Выполнено');
    return true;
  }
  update(node);
  return {dom, contentDOM, update, stopEvent:event => button.contains(event.target),
    ignoreMutation:mutation => mutation.type !== 'selection' && !contentDOM.contains(mutation.target)};
}

function noteChecklistEnter(editorState, dispatch) {
  const {task_item} = noteSchema.nodes;
  if (!noteAncestor(task_item, editorState.selection.$from)) return false;
  const {empty, $from} = editorState.selection;
  const command = empty && !$from.parent.content.size ? noteLibrary.liftListItem(task_item) :
    noteLibrary.splitListItem(task_item, {checked:false});
  return command(editorState, dispatch);
}

async function mountNoteEditor() {
  noteView?.destroy();
  noteView = null;
  const host = document.querySelector('.note-editor-host');
  const note = currentNote();
  if (!host || !note) return;
  try {
    noteLibraryLoading ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('vendor/note-editor.js?v=notes-1', noteScript).href;
      script.onload = () => window.JospatEditor ? resolve(window.JospatEditor) : reject(new Error('Missing editor'));
      script.onerror = reject;
      document.head.append(script);
    }).catch(error => { noteLibraryLoading = null; throw error; });
    noteLibrary = await noteLibraryLoading;
  } catch {
    if (host.isConnected) {
      host.removeAttribute('aria-busy');
      host.textContent = 'Редактор не загрузился. Обнови страницу и попробуй снова.';
    }
    return;
  }
  if (!host.isConnected || currentNote() !== note) return;
  noteSchema ??= makeNoteSchema();
  const lib = noteLibrary;
  const keys = {
    'Mod-b':lib.toggleMark(noteSchema.marks.strong), 'Mod-i':lib.toggleMark(noteSchema.marks.em),
    'Mod-u':lib.toggleMark(noteSchema.marks.underline),
    'Mod-Shift-x':lib.toggleMark(noteSchema.marks.strike),
    'Mod-z':lib.undo, 'Mod-Shift-z':lib.redo, 'Ctrl-y':lib.redo,
    'Mod-k':() => { openNoteLink(); return true; },
    Enter:lib.chainCommands(noteChecklistEnter, lib.splitListItem(noteSchema.nodes.list_item)),
    'Shift-Enter':(editorState, dispatch) => {
      if (dispatch) dispatch(editorState.tr.replaceSelectionWith(noteSchema.nodes.hard_break.create()).scrollIntoView());
      return true;
    },
    Tab:(editorState, dispatch) => {
      if (lib.goToNextCell(1)(editorState, dispatch)) return true;
      if (!lib.isInTable(editorState)) return false;
      if (dispatch) {
        lib.addRowAfter(editorState, dispatch);
        lib.goToNextCell(1)(noteView.state, dispatch);
      }
      return true;
    },
    'Shift-Tab':lib.goToNextCell(-1)
  };
  host.removeAttribute('aria-busy');
  noteView = new lib.EditorView(host, {
    state:noteSessions.get(note) || lib.EditorState.create({
      doc:noteDocument(note),
      plugins:[lib.history(), lib.keymap(keys), lib.keymap(lib.baseKeymap), lib.tableEditing()]
    }),
    attributes:{id:'note-body', role:'textbox', 'aria-label':'Текст заметки', 'aria-multiline':'true'},
    nodeViews:{task_item:noteTaskView, attachment:noteAttachmentView},
    handleDOMEvents:{
      beforeinput(view, event) {
        if (event.isComposing || !event.cancelable) return false;
        const command = {
          insertParagraph:noteChecklistEnter, historyUndo:lib.undo, historyRedo:lib.redo
        }[event.inputType];
        if (!command?.(view.state, view.dispatch)) return false;
        event.preventDefault();
        return true;
      },
      click(view, event) {
        const link = event.target.closest('a[href]');
        if (!link || event.metaKey || event.ctrlKey) return false;
        event.preventDefault();
        return true;
      }
    },
    dispatchTransaction(transaction) {
      const next = this.state.apply(transaction);
      this.updateState(next);
      noteSessions.set(note, next);
      if (transaction.docChanged) writeNoteDocument(note, next.doc);
      updateNoteToolbar(this);
    }
  });
  noteSessions.set(note, noteView.state);
  updateNoteToolbar(noteView);
}

function updateNoteToolbar(view) {
  const editor = view.dom.closest('.note-editor');
  const {state} = view;
  editor.querySelector('[data-note-command="undo"]').disabled = !noteLibrary.undoDepth(state);
  editor.querySelector('[data-note-command="redo"]').disabled = !noteLibrary.redoDepth(state);
  editor.querySelector('.note-table-actions').hidden = !noteLibrary.isInTable(state);
  editor.querySelector('[data-note-command="table"]').hidden = noteLibrary.isInTable(state);
  const {marks} = noteSchema;
  const selection = state.selection;
  const activeMarks = state.storedMarks || selection.$from.marks();
  for (const [command, type] of Object.entries({bold:marks.strong, italic:marks.em, underline:marks.underline, strike:marks.strike, highlight:marks.highlight})) {
    const active = selection.empty ? Boolean(type.isInSet(activeMarks)) : state.doc.rangeHasMark(selection.from, selection.to, type);
    editor.querySelector(`[data-note-command="${command}"]`).setAttribute('aria-pressed',active);
  }
}

function insertNoteTable(editorState, dispatch) {
  const {table, table_row, table_cell} = noteSchema.nodes;
  const row = () => table_row.create(null, [table_cell.createAndFill(), table_cell.createAndFill()]);
  const tr = editorState.tr.replaceSelectionWith(table.create(null, [row(), row()]));
  const $boundary = tr.selection.$from;
  const before = $boundary.nodeBefore;
  const pos = before?.type === table ? $boundary.pos - before.nodeSize : tr.mapping.map(editorState.selection.from, -1);
  tr.setSelection(noteLibrary.TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, pos + 2)), 1));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

function noteListCommand(listType, itemType) {
  return (editorState, dispatch) => {
    if (noteAncestor(listType, editorState.selection.$from)) return noteLibrary.liftListItem(itemType)(editorState, dispatch);
    const {bullet_list, ordered_list, dash_list, list_item} = noteSchema.nodes;
    const otherList = [bullet_list, ordered_list, dash_list].find(type => noteAncestor(type, editorState.selection.$from));
    if (itemType === list_item && otherList) {
      const pos = editorState.selection.$from.before(noteAncestor(otherList, editorState.selection.$from));
      if (dispatch) dispatch(editorState.tr.setNodeMarkup(pos, listType));
      return true;
    }
    return noteLibrary.wrapInList(listType)(editorState, dispatch);
  };
}

function noteLinkSelection(editorState) {
  const {from, to, empty, $from} = editorState.selection;
  const type = noteSchema.marks.link;
  const mark = type.isInSet($from.marks());
  if (!mark || !empty) return {from,to,href:mark?.attrs.href || ''};
  const parent = $from.parent;
  let left = $from.index();
  if (!parent.maybeChild(left)?.marks.includes(mark)) left--;
  let right = left;
  while (left > 0 && mark.isInSet(parent.child(left - 1).marks)) left--;
  while (right + 1 < parent.childCount && mark.isInSet(parent.child(right + 1).marks)) right++;
  return {from:$from.posAtIndex(left),to:$from.posAtIndex(right + 1),href:mark.attrs.href};
}

function openNoteLink() {
  const dialog = document.querySelector('.note-link-dialog');
  const {href} = noteLinkSelection(noteView.state);
  const field = dialog.querySelector('input');
  field.value = href;
  field.setCustomValidity('');
  const existing = noteURL(href);
  const link = dialog.querySelector('a');
  link.hidden = !existing;
  if (existing) link.href = existing;
  else link.removeAttribute('href');
  dialog.querySelector('[data-note-command="unlink"]').hidden = !href;
  dialog.showModal();
  field.select();
}

function setNoteLink(href) {
  const {state, dispatch} = noteView;
  const {from,to} = noteLinkSelection(state);
  const type = noteSchema.marks.link;
  let tr = state.tr.removeMark(from,to,type);
  if (href) {
    const mark = type.create({href});
    tr = from === to ? tr.replaceSelectionWith(noteSchema.text(href,[mark]), false) : tr.addMark(from,to,mark);
  }
  dispatch(tr.scrollIntoView());
  document.querySelector('.note-link-dialog').close();
  noteView.focus();
}

function noteToolsClick(button) {
  const action = button.dataset.noteCommand;
  if (!action) return false;
  button.closest('details')?.removeAttribute('open');
  if (!noteView) return true;
  if (action === 'link') { openNoteLink(); return true; }
  if (action === 'unlink') { setNoteLink(''); return true; }
  if (action === 'close-link') { button.closest('dialog').close(); noteView.focus(); return true; }
  if (action === 'file' || action === 'media') {
    const input = $('note-file');
    input.accept = action === 'media' ? 'image/*,video/*' : '';
    input.click();
    return true;
  }
  const lib = noteLibrary;
  const {marks, nodes} = noteSchema;
  const commands = {
    bold:lib.toggleMark(marks.strong), italic:lib.toggleMark(marks.em),
    underline:lib.toggleMark(marks.underline), strike:lib.toggleMark(marks.strike),
    highlight:lib.toggleMark(marks.highlight),
    title:lib.setBlockType(nodes.heading,{level:1}), heading:lib.setBlockType(nodes.heading,{level:2}),
    subheading:lib.setBlockType(nodes.heading,{level:3}), paragraph:lib.setBlockType(nodes.paragraph),
    mono:lib.setBlockType(nodes.code_block), quote:noteAncestor(nodes.blockquote) ? lib.lift : lib.wrapIn(nodes.blockquote),
    bullet:noteListCommand(nodes.bullet_list,nodes.list_item), dash:noteListCommand(nodes.dash_list,nodes.list_item),
    number:noteListCommand(nodes.ordered_list,nodes.list_item), checklist:noteListCommand(nodes.task_list,nodes.task_item),
    table:insertNoteTable, 'row-add':lib.addRowAfter, 'column-add':lib.addColumnAfter,
    'row-delete':lib.deleteRow, 'column-delete':lib.deleteColumn, 'table-delete':lib.deleteTable,
    undo:lib.undo, redo:lib.redo
  };
  if (action.startsWith('highlight-')) {
    const highlight = marks.highlight.create({color:noteHighlightColor(action.slice('highlight-'.length))});
    const {state} = noteView;
    const {from,to,empty} = state.selection;
    noteView.dispatch(empty ? state.tr.addStoredMark(highlight) : state.tr.addMark(from,to,highlight));
  }
  commands[action]?.(noteView.state, noteView.dispatch, noteView);
  noteView.focus();
  return true;
}

function startNoteTools() {
  const view = $('view');
  view.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.target.closest('.note-tools button[data-note-command]')) event.preventDefault();
  });
  view.addEventListener('input', event => {
    if (event.target.closest('#note-link-form')) event.target.setCustomValidity('');
  });
  view.addEventListener('submit', event => {
    if (event.target.id !== 'note-link-form') return;
    event.preventDefault();
    const field = event.target.elements.url;
    const href = noteURL(field.value);
    if (!href) {
      field.setCustomValidity('Введи адрес сайта или ссылку mailto.');
      field.reportValidity();
      return;
    }
    setNoteLink(href);
  });
  view.addEventListener('change', event => {
    if (event.target.id !== 'note-file') return;
    const files = [...event.target.files];
    event.target.value = '';
    if (files.length) void addNoteFiles(currentNote(), files);
  });
  document.addEventListener('click', event => {
    for (const menu of view.querySelectorAll('.note-tools details[open]')) {
      if (!menu.contains(event.target)) menu.open = false;
    }
  });
  view.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const menu = event.target.closest('.note-tools details[open]');
    if (!menu) return;
    menu.open = false;
    menu.querySelector('summary').focus();
  });
}
