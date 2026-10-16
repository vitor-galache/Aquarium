import { useEffect, useRef } from "react";
import { EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

/** Marcas que somem quando o cursor não está no trecho. */
const HIDDEN_MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
]);

const HEADINGS: Record<string, string> = {
  ATXHeading1: "cm-h1",
  ATXHeading2: "cm-h2",
  ATXHeading3: "cm-h3",
  ATXHeading4: "cm-h4",
  ATXHeading5: "cm-h4",
  ATXHeading6: "cm-h4",
};

const hide = Decoration.replace({});

/**
 * Prévia ao vivo: o Markdown aparece formatado e as marcações (`#`, `**`…)
 * só reaparecem na linha em que o cursor está, para poder editá-las.
 */
function livePreview(view: EditorView): DecorationSet {
  const { state } = view;
  const active = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) active.add(n);
  }
  const decorations: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const heading = HEADINGS[node.name];
        if (heading) {
          decorations.push(
            Decoration.line({ class: heading }).range(
              state.doc.lineAt(node.from).from,
            ),
          );
        }
        if (!HIDDEN_MARKS.has(node.name)) return;
        const line = state.doc.lineAt(node.from);
        if (active.has(line.number)) return;
        let end = node.to;
        // No título, esconde também o espaço depois do `#`.
        if (node.name === "HeaderMark" && state.sliceDoc(end, end + 1) === " ")
          end++;
        if (end > node.from) decorations.push(hide.range(node.from, end));
      },
    });
  }
  return Decoration.set(decorations, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = livePreview(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged)
        this.decorations = livePreview(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const highlight = HighlightStyle.define([
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--color-brand)" },
  { tag: tags.url, color: "var(--color-muted)" },
  { tag: tags.monospace, fontFamily: "ui-monospace, monospace" },
  { tag: tags.quote, color: "var(--color-muted)" },
  { tag: tags.processingInstruction, color: "var(--color-muted)" },
]);

const theme = EditorView.theme({
  "&": { fontSize: "var(--text-md)", color: "var(--color-ink)" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "var(--font-sans)",
    lineHeight: "1.7",
    padding: "0",
    caretColor: "var(--color-brand)",
  },
  ".cm-line": { padding: "0" },
  ".cm-h1, .cm-h2, .cm-h3, .cm-h4": {
    fontFamily: "var(--font-display)",
    fontWeight: "600",
  },
  ".cm-h1": { fontSize: "var(--text-heading)", lineHeight: "1.5" },
  ".cm-h2": { fontSize: "var(--text-panel)" },
  ".cm-h3": { fontSize: "var(--text-title)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "var(--color-highlight) !important",
  },
});

/** Editor Markdown (CodeMirror 6). Não controlado: `value` só vale ao montar. */
export function MarkdownEditor({ value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(highlight),
          livePreviewPlugin,
          EditorView.lineWrapping,
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    editor.focus();
    return () => editor.destroy();
    // O documento inicial só importa na montagem; trocas vêm por `replace`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="min-h-[50vh]" data-editor />;
}
