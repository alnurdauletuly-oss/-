let activeMapId = null;
let selectedMindNodeId = null;
const mindColors = ['#e65a9e','#26a7b4','#e4ac35','#8b6bd4','#4ba274'];

function mindActiveMap() {
  if(!state.maps.length){
    const root={id:crypto.randomUUID(),text:'Моя идея',children:[
      {id:crypto.randomUUID(),text:'🎯 Зачем это важно?',children:[]},
      {id:crypto.randomUUID(),text:'🚀 Первый шаг',children:[]}
    ]};
    state.maps.push({id:crypto.randomUUID(),name:'Моя первая карта',root});
    save();
  }
  let map=state.maps.find(item=>item.id===activeMapId);
  if(!map){map=state.maps[0];activeMapId=map.id;}
  if(!selectedMindNodeId||!mindFind(map.root,selectedMindNodeId))selectedMindNodeId=map.root.id;
  return map;
}

function mindFind(root,id,parent=null,siblings=null,index=0) {
  if(root.id===id)return {node:root,parent,siblings,index};
  for(let i=0;i<root.children.length;i++){
    const found=mindFind(root.children[i],id,root,root.children,i);
    if(found)return found;
  }
  return null;
}

function mindNodeHtml(node,depth=0) {
  const selected=node.id===selectedMindNodeId;
  return `<div class="mind-node-row"><button class="mind-node ${selected?'selected':''} ${depth===0?'root-node':''}" data-mind-node="${safe(node.id)}" aria-pressed="${selected}" title="Выбрать ветку">${safe(node.text||'Новая ветка')}</button></div>${node.children.length?`<ul class="mind-children">${node.children.map((child,index)=>`<li style="--branch:${depth===0?mindColors[index%mindColors.length]:'inherit'}">${mindNodeHtml(child,depth+1)}</li>`).join('')}</ul>`:''}`;
}

function mindScreen() {
  const map=mindActiveMap();
  const selected=mindFind(map.root,selectedMindNodeId).node;
  return `<section class="mind-workspace"><div class="mind-topbar"><label>Моя карта <select id="mind-map-select" aria-label="Выбрать карту">${state.maps.map(item=>`<option value="${safe(item.id)}" ${item.id===map.id?'selected':''}>${safe(item.name||'Новая карта')}</option>`).join('')}</select></label><input id="mind-map-name" maxlength="80" aria-label="Название карты" value="${safe(map.name)}"><button data-mind-new-map>＋ Новая карта</button></div><div class="mind-canvas"><div class="mind-canvas-head"><span>💡 Пространство идей</span><small>Нажми на ветку, чтобы продолжить</small></div><div class="mind-tree-scroll"><div class="mind-tree">${mindNodeHtml(map.root)}</div></div></div><div class="mind-tools"><div class="mind-selection"><label for="mind-node-text">Выбрана ветка</label><input id="mind-node-text" maxlength="100" value="${safe(selected.text)}" aria-label="Текст выбранной ветки"></div><div class="mind-actions"><button data-mind-action="child">＋ Дочерняя</button><button data-mind-action="sibling">＋ Соседняя</button><button data-mind-action="indent">→ Вложить</button><button data-mind-action="outdent">← Извлечь</button><button data-mind-action="delete" aria-label="Удалить выбранную ветку">Удалить</button></div><p class="mind-tip">Выбери ветку: <kbd>Space</kbd> новая соседняя · <kbd>Tab</kbd> вложить · <kbd>Shift+Tab</kbd> извлечь · <kbd>F2</kbd> изменить текст. На телефоне используй кнопки.</p></div></section>`;
}

function mindRefocus() {
  render();
  $('view').querySelector(`[data-mind-node="${selectedMindNodeId}"]`)?.focus({preventScroll:true});
}

function mindAction(action) {
  const map=mindActiveMap();
  const current=mindFind(map.root,selectedMindNodeId);
  if(!current)return;
  let newNode;
  if(action==='child'||action==='sibling'){
    newNode={id:crypto.randomUUID(),text:'Новая ветка',children:[]};
    if(action==='child'||!current.parent)current.node.children.push(newNode);
    else current.siblings.splice(current.index+1,0,newNode);
    selectedMindNodeId=newNode.id;
  }else if(action==='indent'){
    if(!current.parent||current.index===0)return;
    const previous=current.siblings[current.index-1];
    current.siblings.splice(current.index,1);
    previous.children.push(current.node);
  }else if(action==='outdent'){
    if(!current.parent||current.parent.id===map.root.id)return;
    const parentContext=mindFind(map.root,current.parent.id);
    current.siblings.splice(current.index,1);
    parentContext.siblings.splice(parentContext.index+1,0,current.node);
  }else if(action==='delete'){
    if(!current.parent)return;
    if(!confirm('Удалить выбранную ветку и все её дочерние ветки?'))return;
    current.siblings.splice(current.index,1);
    selectedMindNodeId=current.parent.id;
  }else return;
  save();mindRefocus();
}

function mindClick(button) {
  if(button.dataset.mindNode){selectedMindNodeId=button.dataset.mindNode;mindRefocus();return true;}
  if(button.dataset.mindAction){mindAction(button.dataset.mindAction);return true;}
  if(button.hasAttribute('data-mind-new-map')){
    const root={id:crypto.randomUUID(),text:'Главная идея',children:[]};
    const map={id:crypto.randomUUID(),name:'Новая карта',root};
    state.maps.push(map);activeMapId=map.id;selectedMindNodeId=root.id;save();render();
    $('mind-node-text')?.focus();$('mind-node-text')?.select();return true;
  }
  return false;
}

function mindChooseMap(id) {activeMapId=id;selectedMindNodeId=null;render();}

function mindInput(target) {
  if(target.id==='mind-map-name'){
    const map=mindActiveMap();map.name=target.value;save();
    const option=$('mind-map-select')?.selectedOptions[0];if(option)option.textContent=target.value||'Новая карта';
    return true;
  }
  if(target.id!=='mind-node-text')return false;
  const map=mindActiveMap();
  const selected=mindFind(map.root,selectedMindNodeId);
  if(!selected)return true;
  selected.node.text=target.value;
  save();
  const button=$('view').querySelector(`[data-mind-node="${selectedMindNodeId}"]`);
  if(button)button.textContent=target.value||'Новая ветка';
  return true;
}

function mindKeydown(event) {
  const node=event.target.closest?.('[data-mind-node]');
  if(!node||screen!=='mind')return;
  if(event.key===' '){event.preventDefault();mindAction('sibling');}
  if(event.key==='Tab'){
    const map=mindActiveMap();
    const current=mindFind(map.root,selectedMindNodeId);
    const possible=event.shiftKey?current?.parent&&current.parent.id!==map.root.id:current?.parent&&current.index>0;
    if(possible){event.preventDefault();mindAction(event.shiftKey?'outdent':'indent');}
  }
  if(event.key==='Enter'){event.preventDefault();mindAction('child');}
  if(event.key==='F2'){event.preventDefault();$('mind-node-text')?.focus();$('mind-node-text')?.select();}
}
