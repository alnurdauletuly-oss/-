let activeMapId = null;
let selectedMindNodeId = null;
const mindColors = ['#bbf029', '#63d9ca', '#a296ff', '#ffac7c', '#ef91bb', '#80baff'];
let mindMode = matchMedia('(max-width: 700px)').matches ? 'outline' : 'map';
let mindZoom = 1;
let mindEntrance = true;
const mindCollapsed = new Set();
const mindHistory = new Map();
let mindEditing = null;

function mindActiveMap() {
  if (!state.maps.length) {
    const root = {id:crypto.randomUUID(),text:'Моя идея',children:[
      {id:crypto.randomUUID(),text:'🎯 Для чего?',children:[{id:crypto.randomUUID(),text:'Мой результат',children:[]}]},
      {id:crypto.randomUUID(),text:'🚀 Первый шаг',children:[]},
      {id:crypto.randomUUID(),text:'💭 Что ещё?',children:[]}
    ]};
    state.maps.push({id:crypto.randomUUID(),name:'Моя первая карта',root}); save();
  }
  let map = state.maps.find(item=>item.id===activeMapId);
  if (!map) {map=state.maps[0];activeMapId=map.id;}
  if (!selectedMindNodeId || !mindFind(map.root,selectedMindNodeId)) selectedMindNodeId=map.root.id;
  return map;
}
function mindFind(root,id,parent=null,siblings=null,index=0) {
  if (root.id===id) return {node:root,parent,siblings,index};
  for (let i=0;i<root.children.length;i++) {
    const found=mindFind(root.children[i],id,root,root.children,i);
    if (found) return found;
  }
  return null;
}
function mindLayout(root) {
  const nodes = [], edges = [];
  let nextY = 38, right = 0;
  function walk(node, depth = 0, parent = null, color = mindColors[0]) {
    const length = [...(node.text.trim() || 'Новая ветка')].length;
    const width = Math.max(104, Math.min(235, length * 8 + 46));
    const item = {node, parent, color, width, x: parent ? parent.x + parent.width + 72 : 34, y: 0};
    nodes.push(item);
    right = Math.max(right, item.x + width);
    const children = mindCollapsed.has(node.id) ? [] : node.children;
    if (children.length) {
      const branches = children.map((child, i) => walk(child, depth + 1, item, depth ? color : mindColors[i % mindColors.length]));
      item.y = (branches[0].y + branches.at(-1).y) / 2;
    } else {
      item.y = nextY;
      nextY += 78;
    }
    if (parent) edges.push({from:parent, to:item});
    return item;
  }
  walk(root);
  return {nodes, edges, width: right + 104, height: Math.max(220, nextY + 26)};
}

function mindNodeControl(node) {
  const selected = node.id === selectedMindNodeId;
  return `<button class="mind-node-label" type="button" data-mind-node="${safe(node.id)}" aria-pressed="${selected}" title="${safe(node.text || 'Новая ветка')}">${safe(node.text.trim() || 'Новая ветка')}</button>`;
}

function mindNodeMarkup(node, root, style = '') {
  const selected = node.id === selectedMindNodeId;
  const collapsed = mindCollapsed.has(node.id);
  return `<div class="mind-item ${root ? 'mind-item-root' : ''} ${selected ? 'selected' : ''}" ${style}>
    ${mindNodeControl(node)}
    <button type="button" class="mind-node-add" data-mind-action="child" aria-label="Добавить подветку">＋</button>
    ${collapsed ? `<button type="button" class="mind-node-fold" data-mind-unfold="${safe(node.id)}" aria-label="Развернуть ветку" title="Развернуть ветку">+${node.children.length}</button>` : ''}
  </div>`;
}

function mindScreen() {
  const map = mindActiveMap(), current = mindFind(map.root, selectedMindNodeId);
  const layout = mindLayout(map.root);
  const lines = layout.edges.map(({from,to}) => {
    const x1 = from.x + from.width, x2 = to.x, y1 = from.y + 26, y2 = to.y + 26, m = (x1 + x2) / 2;
    return `<path d="M ${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}" stroke="${to.color}"/>`;
  }).join('');
  const nodes = layout.nodes.map(({node, x, y, width, color}) =>
    mindNodeMarkup(node, node === map.root, `style="left:${x}px;top:${y}px;width:${width}px;--branch:${color}"`)
  ).join('');
  function outline(node) {
    const children = !mindCollapsed.has(node.id) && node.children.length ?
      `<ul>${node.children.map(outline).join('')}</ul>` : '';
    return `<li>${mindNodeMarkup(node, node === map.root)}${children}</li>`;
  }
  const history = mindHistory.get(map.id);
  const tools = [
    ['edit', 'Изменить', 'F2', false],
    ['child', 'Подветка', 'Tab', false],
    ['sibling', 'Рядом', 'Enter или пробел', !current.parent],
    ['fold', mindCollapsed.has(current.node.id) ? 'Развернуть' : 'Свернуть', 'Alt + точка', !current.node.children.length],
    ['delete', 'Удалить', 'Delete', !current.parent]
  ];
  const entrance = mindEntrance ? ' mind-entrance' : '';
  mindEntrance = false;
  return `<section class="mind-workspace${entrance}" aria-label="Редактор карты">
    <div class="mind-toolbar">
      <div class="mind-map-picker"><select id="mind-map-select" aria-label="Выбрать карту">${state.maps.map(item =>
        `<option value="${safe(item.id)}" ${item.id === map.id ? 'selected' : ''}>${safe(item.name || 'Новая карта')}</option>`
      ).join('')}</select><button data-mind-rename-map aria-label="Переименовать карту">✎</button><button data-mind-new-map>＋ Новая</button></div>
      <div class="mind-modes" aria-label="Вид карты"><button data-mind-mode="map" aria-pressed="${mindMode === 'map'}">Карта</button><button data-mind-mode="outline" aria-pressed="${mindMode === 'outline'}">Список</button></div>
      <div class="mind-level-controls">
        <button data-mind-action="undo" aria-label="Отменить" ${history?.undo.length ? '' : 'disabled'}>↶</button><button data-mind-action="redo" aria-label="Повторить" ${history?.redo.length ? '' : 'disabled'}>↷</button>
        ${mindMode === 'map' ? `<button data-mind-zoom="out" aria-label="Уменьшить масштаб">−</button><button data-mind-zoom="fit" aria-label="Уместить карту" title="Уместить карту">${Math.round(mindZoom * 100)}%</button><button data-mind-zoom="in" aria-label="Увеличить масштаб">＋</button>` : ''}
      </div>
    </div>
    <div id="mind-canvas" class="mind-surface ${mindMode === 'map' ? 'mind-map' : 'mind-outline'}">
      ${mindMode === 'map' ? `<div class="mind-scroll-size" style="width:${layout.width * mindZoom}px;height:${layout.height * mindZoom}px">
        <div class="mind-scene" data-width="${layout.width}" data-height="${layout.height}" style="width:${layout.width}px;height:${layout.height}px;transform:scale(${mindZoom})">
          <svg class="mind-lines" width="${layout.width}" height="${layout.height}" aria-hidden="true">${lines}</svg>${nodes}
        </div>
      </div>` : `<ul class="mind-tree">${outline(map.root)}</ul>`}
    </div>
    <div class="mind-footer"><div class="mind-tools" aria-label="Действия с веткой">${tools.map(([action, label, shortcut, disabled]) =>
      `<button type="button" data-mind-action="${action}" title="${shortcut}" ${disabled ? 'disabled' : ''}>${label}</button>`
    ).join('')}</div>
    <p><kbd>Tab</kbd> подветка · <kbd>Enter</kbd> рядом · <kbd>F2</kbd> изменить · стрелки — переход</p></div>
  </section>`;
}

function mindFocusNode() {
  const node = $('view').querySelector(`[data-mind-node="${CSS.escape(selectedMindNodeId)}"]`);
  if (!node) return;
  node.focus({preventScroll:true});
  const canvas = $('mind-canvas'), rect = canvas.getBoundingClientRect(), target = node.getBoundingClientRect();
  if (target.left < rect.left + 12) canvas.scrollLeft += target.left - rect.left - 24;
  if (target.right > rect.right - 48) canvas.scrollLeft += target.right - rect.right + 56;
  if (target.top < rect.top + 12) canvas.scrollTop += target.top - rect.top - 24;
  if (target.bottom > rect.bottom - 12) canvas.scrollTop += target.bottom - rect.bottom + 24;
}

function mindRefocus({edit = false, focus = true} = {}) {
  const previous = $('mind-canvas');
  const left = previous?.scrollLeft ?? 0, top = previous?.scrollTop ?? 0;
  render();
  const canvas = $('mind-canvas');
  canvas.scrollLeft = left;
  canvas.scrollTop = top;
  if (focus) mindFocusNode();
  if (edit) mindEdit(false);
}

function mindSelectNode(id) {
  if (mindEditing && mindEditing.node.id !== id) mindFinishEdit();
  const view = $('view');
  const previous = view.querySelector('.mind-item.selected');
  const next = view.querySelector(`[data-mind-node="${CSS.escape(id)}"]`);
  if (!next) return;
  previous?.classList.remove('selected');
  previous?.querySelector('[data-mind-node]')?.setAttribute('aria-pressed', 'false');
  next.setAttribute('aria-pressed', 'true');
  next.closest('.mind-item').classList.add('selected');
  selectedMindNodeId = id;
  const {node, parent} = mindFind(mindActiveMap().root, id);
  const tools = view.querySelector('.mind-tools');
  tools.querySelector('[data-mind-action="sibling"]').disabled = !parent;
  tools.querySelector('[data-mind-action="delete"]').disabled = !parent;
  const fold = tools.querySelector('[data-mind-action="fold"]');
  fold.disabled = !node.children.length;
  fold.textContent = mindCollapsed.has(id) ? 'Развернуть' : 'Свернуть';
  mindFocusNode();
}

function mindRecord(map, selection = selectedMindNodeId) {
  if (!mindHistory.has(map.id)) mindHistory.set(map.id, {undo:[], redo:[]});
  const history = mindHistory.get(map.id);
  history.undo.push({root: structuredClone(map.root), name: map.name, selection});
  if (history.undo.length > 40) history.undo.shift();
  history.redo.length = 0;
  const undo = $('view').querySelector('[data-mind-action="undo"]');
  const redo = $('view').querySelector('[data-mind-action="redo"]');
  if (undo) undo.disabled = false;
  if (redo) redo.disabled = true;
}

function mindEditNodeExists(edit) {
  return state.maps.includes(edit.map) && mindFind(edit.map.root, edit.node.id)?.node === edit.node;
}

function mindFinishEdit(cancel = false) {
  const edit = mindEditing;
  if (!edit) return;
  mindEditing = null;
  const {map, node, input, label, record} = edit;
  const value = input.value.trim();
  if (!cancel && mindEditNodeExists(edit) && node.text !== value) {
    if (record) mindRecord(map, node.id);
    node.text = value;
    if (node === map.root && map.name === 'Новая карта' && value) {
      map.name = value.slice(0, 80);
      const option = Array.from($('mind-map-select')?.options || []).find(item => item.value === map.id);
      if (option) option.textContent = map.name;
    }
    save();
  }
  label.textContent = node.text || 'Новая ветка';
  label.title = label.textContent;
  label.hidden = false;
  input.remove();
}

function mindSuspendEdit() {
  const edit = mindEditing;
  if (!edit) return;
  if (edit.map.id !== activeMapId || edit.node.id !== selectedMindNodeId || !mindEditNodeExists(edit)) {
    mindFinishEdit();
    return;
  }
  if (!edit.input.isConnected || edit.suspended) return;
  const {input} = edit;
  edit.selection = [input.selectionStart, input.selectionEnd, input.selectionDirection];
  const canvas = $('mind-canvas');
  edit.scroll = [canvas.scrollLeft, canvas.scrollTop];
  edit.suspended = true;
}

function mindResumeEdit() {
  const edit = mindEditing;
  if (!edit || screen !== 'mind' || !edit.suspended || document.querySelector('dialog[open]')) return;
  const label = $('view').querySelector(`[data-mind-node="${CSS.escape(edit.node.id)}"]`);
  if (!label) return;
  const {input} = edit;
  if (edit.label !== label || !input.isConnected) {
    edit.label = label;
    label.after(input);
    label.hidden = true;
    if (edit.scroll) {
      const canvas = $('mind-canvas');
      [canvas.scrollLeft, canvas.scrollTop] = edit.scroll;
    }
  }
  if (!document.hasFocus()) return;
  edit.suspended = false;
  if (document.activeElement !== input) input.focus({preventScroll:true});
  input.setSelectionRange(...edit.selection);
}

function mindEdit(record = true) {
  const map = mindActiveMap(), {node} = mindFind(map.root, selectedMindNodeId);
  if (mindEditing?.node === node) {
    mindResumeEdit();
    return;
  }
  mindFinishEdit();
  const label = $('view').querySelector(`[data-mind-node="${CSS.escape(node.id)}"]`);
  if (!label) return;
  const input = document.createElement('input');
  input.className = 'mind-node-input';
  input.value = node.text;
  input.maxLength = 100;
  input.setAttribute('aria-label', 'Название ветки');
  const edit = {map, node, label, input, record, suspended:true, selection:[0,node.text.length,'none']};
  mindEditing = edit;
  input.addEventListener('blur', event => {
    if (mindEditing !== edit || edit.suspended) return;
    if (event.relatedTarget && document.hasFocus()) {
      mindFinishEdit();
      return;
    }
    // Leaving the browser can blur the input before the window loses focus.
    setTimeout(() => {
      if (mindEditing !== edit || edit.suspended || document.activeElement === input) return;
      if (document.hasFocus() && !document.hidden) mindFinishEdit();
      else mindSuspendEdit();
    }, 0);
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    const addChild = event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (!addChild && event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    if (addChild && event.repeat) return;
    mindFinishEdit(event.key === 'Escape');
    if (addChild) mindAction('child');
    else mindRefocus();
  });
  mindResumeEdit();
}

function mindReveal(root, id) {
  let item = mindFind(root, id);
  while (item?.parent) {
    mindCollapsed.delete(item.parent.id);
    item = mindFind(root, item.parent.id);
  }
}

function mindAction(action) {
  if (action === 'edit') { mindEdit(); return; }
  mindFinishEdit();
  const map = mindActiveMap(), current = mindFind(map.root, selectedMindNodeId);
  if (action === 'fold') {
    if (!current.node.children.length) return;
    if (!mindCollapsed.delete(current.node.id)) mindCollapsed.add(current.node.id);
    mindRefocus();
    return;
  }
  if (action === 'undo' || action === 'redo') {
    const history = mindHistory.get(map.id), snapshot = history?.[action].pop();
    if (!snapshot) return;
    history[action === 'undo' ? 'redo' : 'undo'].push({root:map.root, name:map.name, selection:selectedMindNodeId});
    map.root = snapshot.root;
    map.name = snapshot.name;
    selectedMindNodeId = snapshot.selection;
    mindReveal(map.root, selectedMindNodeId);
  } else if (action === 'child' || action === 'sibling') {
    mindRecord(map);
    const node = {id:crypto.randomUUID(), text:'', children:[]};
    if (action === 'child' || !current.parent) {
      mindCollapsed.delete(current.node.id);
      current.node.children.push(node);
    } else current.siblings.splice(current.index + 1, 0, node);
    selectedMindNodeId = node.id;
    save();
    mindRefocus({edit:true});
    return;
  } else if (action === 'delete' && current.parent) {
    if (current.node.children.length && !confirm('Удалить ветку вместе с дочерними ветками?')) return;
    mindRecord(map);
    current.siblings.splice(current.index, 1);
    selectedMindNodeId = current.siblings[current.index]?.id || current.siblings.at(-1)?.id || current.parent.id;
  } else if (action === 'indent' && current.parent && current.index > 0) {
    mindRecord(map);
    current.siblings.splice(current.index, 1);
    current.siblings[current.index - 1].children.push(current.node);
    mindCollapsed.delete(current.siblings[current.index - 1].id);
  } else if (action === 'outdent' && current.parent && current.parent !== map.root) {
    mindRecord(map);
    const parent = mindFind(map.root, current.parent.id);
    current.siblings.splice(current.index, 1);
    parent.siblings.splice(parent.index + 1, 0, current.node);
  } else return;
  save();
  mindRefocus();
}

function mindClick(button) {
  if (screen !== 'mind') return false;
  const {mindNode, mindAction:action, mindUnfold, mindMode:mode, mindZoom:zoom} = button.dataset;
  if (mindNode) {
    mindSelectNode(mindNode);
    return true;
  }
  if (action) { mindAction(action); return true; }
  if (mindUnfold) {
    selectedMindNodeId = mindUnfold;
    mindAction('fold');
    return true;
  }
  if (mode) {
    mindMode = mode;
    mindRefocus();
    return true;
  }
  if (zoom) {
    const canvas = $('mind-canvas'), scene = canvas.querySelector('.mind-scene');
    const fit = Math.min(1, canvas.clientWidth / Number(scene.dataset.width), canvas.clientHeight / Number(scene.dataset.height));
    mindZoom = zoom === 'fit' ? Math.max(.2, Math.floor(fit * 100) / 100) :
      Math.min(2, Math.max(.2, Math.round((mindZoom + (zoom === 'in' ? .15 : -.15)) * 100) / 100));
    mindRefocus({focus:false});
    if (zoom === 'fit') {
      $('mind-canvas').scrollTo(0, 0);
    }
    $('view').querySelector(`[data-mind-zoom="${zoom}"]`)?.focus({preventScroll:true});
    return true;
  }
  if (button.hasAttribute('data-mind-rename-map')) {
    const map = mindActiveMap(), name = prompt('Название карты', map.name);
    if (name?.trim() && name.trim() !== map.name) {
      mindRecord(map);
      map.name = name.trim().slice(0, 80);
      save();
      mindRefocus();
    }
    return true;
  }
  if (button.hasAttribute('data-mind-new-map')) {
    const root = {id:crypto.randomUUID(), text:'Главная идея', children:[]};
    const map = {id:crypto.randomUUID(), name:'Новая карта', root};
    state.maps.push(map);
    activeMapId = map.id;
    selectedMindNodeId = root.id;
    mindZoom = 1;
    mindEntrance = true;
    save();
    render();
    mindEdit(false);
    return true;
  }
  return false;
}

function mindChooseMap(id) {
  mindFinishEdit();
  activeMapId = id;
  selectedMindNodeId = null;
  mindZoom = 1;
  mindEntrance = true;
  render();
  $('mind-map-select').focus({preventScroll:true});
}

function mindKeydown(event) {
  if (screen !== 'mind' || event.isComposing) return;
  const label = event.target.closest('[data-mind-node]');
  if (!label) return;
  selectedMindNodeId = label.dataset.mindNode;
  const map = mindActiveMap(), current = mindFind(map.root, selectedMindNodeId);
  let action;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') action = event.shiftKey ? 'redo' : 'undo';
  else if (event.altKey && event.code === 'Period') action = 'fold';
  else if (event.altKey && event.key === 'ArrowRight') action = 'indent';
  else if (event.altKey && event.key === 'ArrowLeft') action = 'outdent';
  else if (event.metaKey || event.ctrlKey || event.altKey) return;
  else if (event.key === 'Tab' && !event.shiftKey) action = 'child';
  else if (event.key === ' ' || event.key === 'Enter') action = 'sibling';
  else if (event.key === 'F2') action = 'edit';
  else if (event.key === 'Delete' || event.key === 'Backspace') action = 'delete';
  if (action) {
    event.preventDefault();
    if (!event.repeat) mindAction(action);
    return;
  }
  const visible = [...$('view').querySelectorAll('[data-mind-node]')];
  const index = visible.indexOf(label);
  const id = {
    ArrowLeft: current.parent?.id,
    ArrowRight: !mindCollapsed.has(current.node.id) && current.node.children[0]?.id,
    ArrowUp: visible[index - 1]?.dataset.mindNode,
    ArrowDown: visible[index + 1]?.dataset.mindNode
  }[event.key];
  if (id) {
    event.preventDefault();
    mindSelectNode(id);
  }
}

function startMindEditing() {
  window.addEventListener('blur', () => {
    if (screen === 'mind') mindSuspendEdit();
  });
  window.addEventListener('focus', mindResumeEdit);
  window.addEventListener('pagehide', event => {
    if (event.persisted) mindSuspendEdit();
    else mindFinishEdit();
  });
  window.addEventListener('pageshow', mindResumeEdit);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (screen === 'mind') mindSuspendEdit();
    } else mindResumeEdit();
  });
  document.addEventListener('pointerdown', event => {
    const edit = mindEditing;
    if (!edit || screen !== 'mind' || event.button !== 0 || event.target === edit.input) return;
    const link = event.target.closest('a[href^="#"]');
    if ((link?.hash && link.hash !== location.hash) || event.target.closest('[data-mind-mode]')) mindSuspendEdit();
    else if (edit.suspended) mindFinishEdit();
  }, true);
}

function startMindPan() {
  const view = $('view');
  let pan = null;
  view.addEventListener('pointerdown', event => {
    const canvas = event.target.closest('.mind-map');
    if (!canvas || event.pointerType !== 'mouse' || event.button !== 0 ||
      event.target.closest('button, input')) return;
    pan = {canvas, id:event.pointerId, x:event.clientX, y:event.clientY, left:canvas.scrollLeft, top:canvas.scrollTop};
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-panning');
  });
  view.addEventListener('pointermove', event => {
    if (pan?.id !== event.pointerId) return;
    pan.canvas.scrollLeft = pan.left + pan.x - event.clientX;
    pan.canvas.scrollTop = pan.top + pan.y - event.clientY;
  });
  view.addEventListener('lostpointercapture', event => {
    if (pan?.id !== event.pointerId) return;
    pan.canvas.classList.remove('is-panning');
    pan = null;
  });
}
