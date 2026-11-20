let activeMapId = null;
let selectedMindNodeId = null;
const mindColors = ['#ed4fb0','#18b6ed','#00d5b5','#9661ed','#ffd93d','#ed814f'];

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
  const nodes=[], edges=[];
  let leaf=0,maxDepth=0;
  function walk(node,depth=0,parent=null,color=null) {
    maxDepth=Math.max(maxDepth,depth);
    const item={node,depth,x:42+depth*256,y:0,color:color||'#7555a5',parent};
    nodes.push(item);
    const children=node.children||[];
    if (!children.length) item.y=48+leaf++*92;
    else {
      children.forEach((child,i)=>walk(child,depth+1,item,depth===0?mindColors[i%mindColors.length]:item.color));
      const own=nodes.filter(n=>n.parent===item);
      item.y=(own[0].y+own[own.length-1].y)/2;
    }
    if (parent) edges.push({from:parent,to:item});
  }
  walk(root);
  return {nodes,edges,width:Math.max(800,(maxDepth+1)*256+130),height:Math.max(490,leaf*92+92)};
}
function mindScreen() {
  const map=mindActiveMap(), selected=mindFind(map.root,selectedMindNodeId).node;
  const layout=mindLayout(map.root);
  const lines=layout.edges.map(({from,to})=>{
    const x1=from.x+206,x2=to.x,y1=from.y+22,y2=to.y+22,m=(x1+x2)/2;
    return `<path d="M ${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}" stroke="${to.color}"/>`;
  }).join('');
  const nodes=layout.nodes.map(({node,depth,x,y,color})=>`<button class="mind-branch ${depth===0?'mind-root':''} ${node.id===selectedMindNodeId?'selected':''}" style="left:${x}px;top:${y}px;--branch:${color}" data-mind-node="${safe(node.id)}" aria-pressed="${node.id===selectedMindNodeId}" title="Выбрать · двойной щелчок — изменить">${safe(node.text||'Новая ветка')}</button>`).join('');
  return `<section class="mind-studio"><div class="mind-studio-bar"><div><span class="mind-eyebrow">MIND SPACE</span><h2>Разложи мысль по веткам</h2></div><div class="mind-map-controls"><select id="mind-map-select" aria-label="Выбрать карту">${state.maps.map(item=>`<option value="${safe(item.id)}" ${item.id===map.id?'selected':''}>${safe(item.name||'Новая карта')}</option>`).join('')}</select><button data-mind-rename-map title="Переименовать карту" aria-label="Переименовать карту">✎</button><button data-mind-new-map title="Новая карта">＋ Новая карта</button></div></div><div class="mind-canvas" id="mind-canvas"><div class="mind-paper" style="width:${layout.width}px;height:${layout.height}px"><svg class="mind-connections" width="${layout.width}" height="${layout.height}" aria-hidden="true">${lines}</svg>${nodes}</div></div><div class="mind-dock"><div class="mind-edit"><span>Выбрана ветка</span><input id="mind-node-text" maxlength="100" value="${safe(selected.text)}" aria-label="Название выбранной ветки"></div><div class="mind-dock-actions"><button data-mind-action="child" title="Дочерняя ветка · Enter"><b>↳</b><span>Дочерняя</span></button><button data-mind-action="sibling" title="Соседняя ветка · Пробел"><b>＋</b><span>Соседняя</span></button><button data-mind-action="indent" title="Вложить · Tab"><b>→</b><span>Вложить</span></button><button data-mind-action="outdent" title="Извлечь · Shift+Tab"><b>←</b><span>Извлечь</span></button><button data-mind-action="delete" title="Удалить · Delete"><b>×</b><span>Удалить</span></button></div></div><p class="mind-hint">На ноутбуке: <kbd>Enter</kbd> дочерняя · <kbd>Пробел</kbd> соседняя · <kbd>Tab</kbd> вложить · <kbd>F2</kbd> изменить. На телефоне выбери ветку и нажми кнопку снизу.</p></section>`;
}
function mindRefocus(edit=false) {
  const old=$('mind-canvas'),left=old?.scrollLeft||0,top=old?.scrollTop||0;
  render();
  const canvas=$('mind-canvas'); if(canvas){canvas.scrollLeft=left;canvas.scrollTop=top;}
  if(edit){$('mind-node-text')?.focus();$('mind-node-text')?.select();}
  else $('view').querySelector(`[data-mind-node="${CSS.escape(selectedMindNodeId)}"]`)?.focus({preventScroll:true});
}
function mindEdit(){ $('mind-node-text')?.focus(); $('mind-node-text')?.select(); }
function mindAction(action) {
  const map=mindActiveMap(),current=mindFind(map.root,selectedMindNodeId);
  if(!current)return;
  if(action==='child'||action==='sibling'){
    const node={id:crypto.randomUUID(),text:'Новая ветка',children:[]};
    if(action==='child'||!current.parent) current.node.children.push(node);
    else current.siblings.splice(current.index+1,0,node);
    selectedMindNodeId=node.id;
    save();mindRefocus(true);return;
  }
  if(action==='indent'){
    if(!current.parent||current.index===0)return;
    current.siblings.splice(current.index,1);current.siblings[current.index-1].children.push(current.node);
  }else if(action==='outdent'){
    if(!current.parent||current.parent.id===map.root.id)return;
    const parent=mindFind(map.root,current.parent.id);
    current.siblings.splice(current.index,1);parent.siblings.splice(parent.index+1,0,current.node);
  }else if(action==='delete'){
    if(!current.parent)return;
    if(current.node.children.length&&!confirm('Удалить ветку вместе с дочерними ветками?'))return;
    current.siblings.splice(current.index,1);selectedMindNodeId=current.parent.id;
  }else return;
  save();mindRefocus();
}
function mindClick(button) {
  if(button.hasAttribute('data-mind-rename-map')){
    const map=mindActiveMap(),name=prompt('Название карты',map.name);
    if(name?.trim()){map.name=name.trim().slice(0,80);save();render();}return true;
  }
  if(button.dataset.mindNode){selectedMindNodeId=button.dataset.mindNode;mindRefocus();return true;}
  if(button.dataset.mindAction){mindAction(button.dataset.mindAction);return true;}
  if(button.hasAttribute('data-mind-new-map')){
    const root={id:crypto.randomUUID(),text:'Главная идея',children:[]};
    const map={id:crypto.randomUUID(),name:'Новая карта',root};
    state.maps.push(map);activeMapId=map.id;selectedMindNodeId=root.id;save();render();mindEdit();return true;
  }
  return false;
}
function mindChooseMap(id){activeMapId=id;selectedMindNodeId=null;render();}
function mindInput(target) {
  if(target.id!=='mind-node-text')return false;
  const map=mindActiveMap(),current=mindFind(map.root,selectedMindNodeId);
  if(!current)return true;
  current.node.text=target.value;save();
  const button=$('view').querySelector(`[data-mind-node="${CSS.escape(selectedMindNodeId)}"]`);
  if(button)button.textContent=target.value||'Новая ветка';
  if(current.node.id===map.root.id&&map.name==='Новая карта'){
    map.name=target.value||'Новая карта';const option=$('mind-map-select')?.selectedOptions[0];if(option)option.textContent=map.name;save();
  }
  return true;
}
function mindKeydown(event) {
  if(screen!=='mind'||!event.target.closest?.('[data-mind-node]'))return;
  if(event.key===' '){event.preventDefault();mindAction('sibling');}
  else if(event.key==='Enter'){event.preventDefault();mindAction('child');}
  else if(event.key==='Tab'){
    const current=mindFind(mindActiveMap().root,selectedMindNodeId);
    if(event.shiftKey?current?.parent?.id!==mindActiveMap().root.id:current?.parent&&current.index>0){event.preventDefault();mindAction(event.shiftKey?'outdent':'indent');}
  }else if(event.key==='F2'){event.preventDefault();mindEdit();}
  else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();mindAction('delete');}
}
