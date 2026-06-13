import { useRef, useEffect } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { search } from '@codemirror/search';

interface CotextEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

export default function CotextEditor({ content, onChange, readOnly = false }: CotextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isUpdating = useRef(false);

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
        backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent) !important',
      },
      '.cm-focused .cm-selectionBackground': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent) !important',
      },
      '&.cm-focused': {
        outline: 'none',
      },
    });

    const updateListener = EditorView.updateListener.of((update: any) => {
      if (update.docChanged && !isUpdating.current) {
        onChange(update.state.doc.toString());
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

  return <div ref={editorRef} className="cotext-editor" />;
}
