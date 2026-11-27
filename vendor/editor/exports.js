export {Schema, Fragment} from 'prosemirror-model';
export {EditorState, TextSelection} from 'prosemirror-state';
export {EditorView} from 'prosemirror-view';
export {schema as basicSchema} from 'prosemirror-schema-basic';
export {baseKeymap, chainCommands, lift, setBlockType, toggleMark, wrapIn} from 'prosemirror-commands';
export {addListNodes, splitListItem, wrapInList, liftListItem, sinkListItem} from 'prosemirror-schema-list';
export {history, undo, redo, undoDepth, redoDepth} from 'prosemirror-history';
export {keymap} from 'prosemirror-keymap';
export {
  tableNodes, tableEditing, addRowAfter, addColumnAfter, deleteRow, deleteColumn,
  deleteTable, goToNextCell, isInTable
} from 'prosemirror-tables';
