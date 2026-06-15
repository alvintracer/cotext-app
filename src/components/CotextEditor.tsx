import { useState, useRef, useEffect, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { search } from '@codemirror/search';
import {
  TextHOne as Heading1, TextHTwo as Heading2, TextHThree as Heading3,
  TextB as Bold, TextItalic as Italic, ListBullets as List, ListNumbers as ListOrdered,
  Code, Quotes as Quote, Table, Link, Minus, CaretUp as ChevronUp, X, CheckSquare
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

interface CotextEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  /** Neural Link selection hook — fires when a text range is selected inside a dated block. */
  onSelectionForNode?: (blockTs: string, label: string, anchor: { x: number; y: number } | null) => void;
}

interface ToolbarAction {
  icon: React.ReactNode;
  label: string;
  group: string;
  action: (view: EditorView) => void;
}

// Insert text at cursor or wrap selection
function insertOrWrap(view: EditorView, before: string, after: string = '') {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (selected) {
    view.dispatch({
      changes: { from, to, insert: `${before}${selected}${after}` },
      selection: { anchor: from + before.length, head: from + before.length + selected.length },
    });
  } else {
    view.dispatch({
      changes: { from, insert: `${before}${after}` },
      selection: { anchor: from + before.length },
    });
  }
  view.focus();
}

// Insert at beginning of current line(s)
function insertAtLineStart(view: EditorView, prefix: string) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);

  const changes: Array<{ from: number; to: number; insert: string }> = [];
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = doc.line(i);
    changes.push({ from: line.from, to: line.from, insert: prefix });
  }

  view.dispatch({ changes });
  view.focus();
}

// Insert block (new line if needed + content)
function insertBlock(view: EditorView, block: string) {
  const { from } = view.state.selection.main;
  const doc = view.state.doc;
  const line = doc.lineAt(from);
  const needsNewline = line.text.trim() !== '';
  const prefix = needsNewline ? '\n\n' : '';

  view.dispatch({
    changes: { from, insert: `${prefix}${block}` },
    selection: { anchor: from + prefix.length + block.length },
  });
  view.focus();
}

const toolbarActions: ToolbarAction[] = [
  {
    icon: <Heading1 size={16} />,
    label: 'Heading 1',
    group: '제목',
    action: (v) => insertAtLineStart(v, '# '),
  },
  {
    icon: <Heading2 size={16} />,
    label: 'Heading 2',
    group: '제목',
    action: (v) => insertAtLineStart(v, '## '),
  },
  {
    icon: <Heading3 size={16} />,
    label: 'Heading 3',
    group: '제목',
    action: (v) => insertAtLineStart(v, '### '),
  },
  {
    icon: <Bold size={16} />,
    label: '굵게',
    group: '서식',
    action: (v) => insertOrWrap(v, '**', '**'),
  },
  {
    icon: <Italic size={16} />,
    label: '기울임',
    group: '서식',
    action: (v) => insertOrWrap(v, '*', '*'),
  },
  {
    icon: <Code size={16} />,
    label: '코드',
    group: '서식',
    action: (v) => insertOrWrap(v, '`', '`'),
  },
  {
    icon: <List size={16} />,
    label: '글머리',
    group: '리스트',
    action: (v) => insertAtLineStart(v, '- '),
  },
  {
    icon: <ListOrdered size={16} />,
    label: '번호',
    group: '리스트',
    action: (v) => insertAtLineStart(v, '1. '),
  },
  {
    icon: <CheckSquare size={16} />,
    label: '체크',
    group: '리스트',
    action: (v) => insertAtLineStart(v, '- [ ] '),
  },
  {
    icon: <Quote size={16} />,
    label: '인용',
    group: '블록',
    action: (v) => insertAtLineStart(v, '> '),
  },
  {
    icon: <Minus size={16} />,
    label: '구분선',
    group: '블록',
    action: (v) => insertBlock(v, '---'),
  },
  {
    icon: <Link size={16} />,
    label: '링크',
    group: '블록',
    action: (v) => insertOrWrap(v, '[', '](url)'),
  },
  {
    icon: <Table size={16} />,
    label: '표',
    group: '블록',
    action: (v) => insertBlock(v, '| 항목 | 내용 |\n| --- | --- |\n| | |'),
  },
];

export default function CotextEditor({ content, onChange, readOnly = false, onSelectionForNode }: CotextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isUpdating = useRef(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const selectionCbRef = useRef(onSelectionForNode);
  useEffect(() => { selectionCbRef.current = onSelectionForNode; }, [onSelectionForNode]);

  useEffect(() => {
    if (!editorRef.current) return;

    const theme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '14px',
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
      },
      '.cm-content': {
        padding: '16px',
        caretColor: 'var(--accent)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--surface)',
        color: 'var(--text-muted)',
        border: 'none',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--surface-2)',
      },
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--accent)',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent) !important',
      },
      '.cm-focused .cm-selectionBackground': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 35%, transparent) !important',
      },
      '&.cm-focused': {
        outline: 'none',
      },
    });

    const updateListener = EditorView.updateListener.of((update: any) => {
      if (update.docChanged && !isUpdating.current) {
        onChange(update.state.doc.toString());
      }
      // Neural Link — emit selection (for "Make node" floating button)
      if (update.selectionSet && selectionCbRef.current) {
        const sel = update.state.selection.main;
        if (sel.empty) {
          selectionCbRef.current('', '', null);
        } else {
          const text = update.state.sliceDoc(sel.from, sel.to);
          // Find enclosing `## YYYY-MM-DD HH:mm` block by scanning lines above sel.from
          const doc = update.state.doc;
          const startLine = doc.lineAt(sel.from).number;
          let blockTs: string | null = null;
          for (let i = startLine; i >= 1; i--) {
            const m = doc.line(i).text.match(/^##\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
            if (m) { blockTs = m[1]; break; }
          }
          if (blockTs) {
            const coords = update.view.coordsAtPos(sel.to);
            const anchor = coords ? { x: coords.right, y: coords.bottom } : null;
            selectionCbRef.current(blockTs, text, anchor);
          }
        }
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        markdown({ codeLanguages: languages }),
        keymap.of([...defaultKeymap, indentWithTab]),
        search(),
        theme,
        updateListener,
        EditorState.readOnly.of(readOnly),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly]);

  // Sync external content changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      isUpdating.current = true;
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
      });
      isUpdating.current = false;
    }
  }, [content]);

  const handleAction = useCallback((action: ToolbarAction['action']) => {
    if (viewRef.current) {
      action(viewRef.current);
      setShowMobileSheet(false);
    }
  }, []);

  // Group actions
  const groups = toolbarActions.reduce((acc, action) => {
    if (!acc[action.group]) acc[action.group] = [];
    acc[action.group].push(action);
    return acc;
  }, {} as Record<string, ToolbarAction[]>);

  return (
    <div className="cotext-editor-wrapper">
      {/* Desktop toolbar */}
      {!readOnly && (
        <div className="md-toolbar md-toolbar-desktop">
          {toolbarActions.map((action, i) => (
            <button
              key={i}
              className="md-toolbar-btn"
              onClick={() => handleAction(action.action)}
              title={action.label}
            >
              {action.icon}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <div ref={editorRef} className="cotext-editor" />

      {/* Mobile: floating trigger button */}
      {!readOnly && (
        <button
          className="md-mobile-trigger"
          onClick={() => setShowMobileSheet(!showMobileSheet)}
          aria-label="Markdown helper"
        >
          {showMobileSheet ? <X size={18} /> : <ChevronUp size={18} />}
          <span>Markdown</span>
        </button>
      )}

      {/* Mobile: bottom sheet */}
      <AnimatePresence>
        {showMobileSheet && (
          <>
            <div className="md-sheet-backdrop" onClick={() => setShowMobileSheet(false)} />
            <motion.div
              className="md-bottom-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            >
              <div className="md-sheet-handle" />
              <div className="md-sheet-content">
                {Object.entries(groups).map(([group, actions]) => (
                  <div key={group} className="md-sheet-group">
                    <span className="md-sheet-group-label">{group}</span>
                    <div className="md-sheet-group-items">
                      {actions.map((action, i) => (
                        <button
                          key={i}
                          className="md-sheet-item"
                          onClick={() => handleAction(action.action)}
                        >
                          {action.icon}
                          <span>{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
