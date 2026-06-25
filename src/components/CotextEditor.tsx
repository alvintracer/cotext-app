import { useState, useRef, useEffect, useCallback, type MouseEvent } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { Decoration, type DecorationSet, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { search } from '@codemirror/search';
import {
  TextHOne as Heading1, TextHTwo as Heading2, TextHThree as Heading3,
  TextB as Bold, TextItalic as Italic, ListBullets as List, ListNumbers as ListOrdered,
  Code, Quotes as Quote, Table, Link, Minus, CaretUp as ChevronUp, X, CheckSquare,
  ChatCircleText, HighlighterCircle,
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  buildCotextAnnotation,
  createAnnotationId,
  parseCotextAnnotationStart,
  type CotextAnnotationColor,
} from '../lib/markdown/cotextAnnotations';

interface CotextEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  annotationAuthor?: string;
}

interface ToolbarAction {
  icon: React.ReactNode;
  label: string;
  group: string;
  action: (view: EditorView) => void;
}

interface SelectionBubbleState {
  top: number;
  left: number;
}

const annotationColorClass: Record<CotextAnnotationColor, string> = {
  amber: 'cm-cotext-mark-amber',
  mint: 'cm-cotext-mark-mint',
  sky: 'cm-cotext-mark-sky',
  rose: 'cm-cotext-mark-rose',
};

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

function insertAtLineStart(view: EditorView, prefix: string) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);

  const changes: Array<{ from: number; to: number; insert: string }> = [];
  for (let i = startLine.number; i <= endLine.number; i += 1) {
    const line = doc.line(i);
    changes.push({ from: line.from, to: line.from, insert: prefix });
  }

  view.dispatch({ changes });
  view.focus();
}

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

function applyAnnotation(view: EditorView, author: string, color: CotextAnnotationColor, note?: string) {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  const selected = view.state.sliceDoc(from, to);
  const wrapped = buildCotextAnnotation(selected, {
    id: createAnnotationId(),
    author,
    color,
    note: note?.trim() || '',
  });
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: { anchor: from, head: from + wrapped.length },
  });
  view.focus();
}

function buildAnnotationDecorations(docText: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let cursor = 0;
  while (cursor < docText.length) {
    const startIdx = docText.indexOf('<!-- cotext:mark', cursor);
    if (startIdx === -1) break;
    const startEnd = docText.indexOf('-->', startIdx);
    if (startEnd === -1) break;
    const startComment = docText.slice(startIdx, startEnd + 3);
    const meta = parseCotextAnnotationStart(startComment);
    const endIdx = docText.indexOf('<!-- /cotext:mark -->', startEnd + 3);
    if (!meta || endIdx === -1) {
      cursor = startEnd + 3;
      continue;
    }
    const endEnd = endIdx + '<!-- /cotext:mark -->'.length;
    builder.add(startIdx, startEnd + 3, Decoration.replace({}));
    builder.add(endIdx, endEnd, Decoration.replace({}));
    if (startEnd + 3 < endIdx) {
      builder.add(
        startEnd + 3,
        endIdx,
        Decoration.mark({
          class: `cm-cotext-mark ${annotationColorClass[meta.color]}${meta.resolved ? ' is-resolved' : ''}${meta.note ? ' has-note' : ''}`,
          attributes: {
            'data-author': meta.author,
            'data-note': meta.note || '',
          },
        }),
      );
    }
    cursor = endEnd;
  }
  return builder.finish();
}

const annotationPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildAnnotationDecorations(view.state.doc.toString());
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildAnnotationDecorations(update.state.doc.toString());
    }
  }
}, {
  decorations: (value) => value.decorations,
});

const toolbarActions: ToolbarAction[] = [
  { icon: <Heading1 size={16} />, label: 'Heading 1', group: 'Headings', action: (v) => insertAtLineStart(v, '# ') },
  { icon: <Heading2 size={16} />, label: 'Heading 2', group: 'Headings', action: (v) => insertAtLineStart(v, '## ') },
  { icon: <Heading3 size={16} />, label: 'Heading 3', group: 'Headings', action: (v) => insertAtLineStart(v, '### ') },
  { icon: <Bold size={16} />, label: 'Bold', group: 'Inline', action: (v) => insertOrWrap(v, '**', '**') },
  { icon: <Italic size={16} />, label: 'Italic', group: 'Inline', action: (v) => insertOrWrap(v, '*', '*') },
  { icon: <Code size={16} />, label: 'Code', group: 'Inline', action: (v) => insertOrWrap(v, '`', '`') },
  { icon: <List size={16} />, label: 'Bullet', group: 'Lists', action: (v) => insertAtLineStart(v, '- ') },
  { icon: <ListOrdered size={16} />, label: 'Numbered', group: 'Lists', action: (v) => insertAtLineStart(v, '1. ') },
  { icon: <CheckSquare size={16} />, label: 'Checklist', group: 'Lists', action: (v) => insertAtLineStart(v, '- [ ] ') },
  { icon: <Quote size={16} />, label: 'Quote', group: 'Blocks', action: (v) => insertAtLineStart(v, '> ') },
  { icon: <Minus size={16} />, label: 'Divider', group: 'Blocks', action: (v) => insertBlock(v, '---') },
  { icon: <Link size={16} />, label: 'Link', group: 'Blocks', action: (v) => insertOrWrap(v, '[', '](url)') },
  { icon: <Table size={16} />, label: 'Table', group: 'Blocks', action: (v) => insertBlock(v, '| Column | Value |\n| --- | --- |\n| | |') },
];

export default function CotextEditor({
  content,
  onChange,
  readOnly = false,
  annotationAuthor = 'teammate',
}: CotextEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isUpdating = useRef(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [selectionBubble, setSelectionBubble] = useState<SelectionBubbleState | null>(null);

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

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged && !isUpdating.current) {
        onChange(update.state.doc.toString());
      }
      if (readOnly || !update.selectionSet) return;
      const main = update.state.selection.main;
      if (main.empty) {
        setSelectionBubble(null);
        return;
      }
      const wrapper = wrapperRef.current;
      const view = viewRef.current;
      if (!wrapper || !view) return;
      const head = view.coordsAtPos(main.to);
      if (!head) {
        setSelectionBubble(null);
        return;
      }
      const wrapperBox = wrapper.getBoundingClientRect();
      setSelectionBubble({
        top: head.top - wrapperBox.top - 44,
        left: Math.max(12, Math.min(head.left - wrapperBox.left - 110, wrapperBox.width - 232)),
      });
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
        annotationPlugin,
        EditorState.readOnly.of(readOnly),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          blur: () => {
            setSelectionBubble(null);
            return false;
          },
        }),
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
  }, [annotationAuthor, onChange, readOnly]);

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

  const handleAnnotation = useCallback((color: CotextAnnotationColor, withComment: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    const note = withComment ? window.prompt('Comment note') ?? '' : '';
    if (withComment && !note.trim()) return;
    applyAnnotation(view, annotationAuthor, color, note);
    setSelectionBubble(null);
  }, [annotationAuthor]);

  const keepSelectionBubbleAlive = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const groups = toolbarActions.reduce((acc, action) => {
    if (!acc[action.group]) acc[action.group] = [];
    acc[action.group].push(action);
    return acc;
  }, {} as Record<string, ToolbarAction[]>);

  return (
    <div ref={wrapperRef} className="cotext-editor-wrapper">
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

      <div ref={editorRef} className="cotext-editor" />

      {!readOnly && selectionBubble && (
        <div
          className="cotext-selection-bubble"
          style={{ top: selectionBubble.top, left: selectionBubble.left }}
          onMouseDown={keepSelectionBubbleAlive}
        >
          <button className="cotext-selection-bubble-chip is-amber" onMouseDown={keepSelectionBubbleAlive} onClick={() => handleAnnotation('amber', false)} title="Amber highlight">
            <HighlighterCircle size={14} /> Amber
          </button>
          <button className="cotext-selection-bubble-chip is-mint" onMouseDown={keepSelectionBubbleAlive} onClick={() => handleAnnotation('mint', false)} title="Mint highlight">
            <HighlighterCircle size={14} /> Mint
          </button>
          <button className="cotext-selection-bubble-chip is-sky" onMouseDown={keepSelectionBubbleAlive} onClick={() => handleAnnotation('sky', false)} title="Sky highlight">
            <HighlighterCircle size={14} /> Sky
          </button>
          <button className="cotext-selection-bubble-chip is-rose" onMouseDown={keepSelectionBubbleAlive} onClick={() => handleAnnotation('rose', false)} title="Rose highlight">
            <HighlighterCircle size={14} /> Rose
          </button>
          <button className="cotext-selection-bubble-chip is-comment" onMouseDown={keepSelectionBubbleAlive} onClick={() => handleAnnotation('amber', true)} title="Comment">
            <ChatCircleText size={14} /> Comment
          </button>
        </div>
      )}

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
