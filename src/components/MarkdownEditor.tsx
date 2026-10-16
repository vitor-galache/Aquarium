import { useEffect, useRef } from "react";
import { EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
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
import {
  autocompletion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { convertFileSrc } from "@tauri-apps/api/core";
import { formattingKeymap, WIKILINK } from "../lib/markdown";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Pasta da nota, para achar imagens com caminho relativo. */
  baseDir: string;
  /** Títulos sugeridos ao digitar `[[`. */
  linkTargets: () => string[];
  onOpenLink: (target: string) => void;
  /** Grava a imagem colada e devolve o caminho relativo à nota. */
  onPasteImage: (file: File) => Promise<string>;
};

type Callbacks = Omit<Props, "value">;

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
const wikilink = Decoration.mark({ class: "cm-wikilink" });

/** Resolve o endereço de uma imagem do Markdown para o webview. */
function imageSrc(baseDir: string, url: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  const sep = baseDir.includes("\\") ? "\\" : "/";
  const relative = decodeURI(url).replace(/^\.\//, "").replace(/\//g, sep);
  return convertFileSrc(`${baseDir}${sep}${relative}`);
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.className = "cm-image";
    return img;
  }
}

/**
 * Prévia ao vivo: o Markdown aparece formatado e as marcações (`#`, `**`…)
 * só reaparecem na linha em que o cursor está, para poder editá-las.
 */
function livePreview(view: EditorView, baseDir: string): DecorationSet {
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
        if (node.name === "Image") {
          const url = node.node.getChild("URL");
          if (!url || active.has(state.doc.lineAt(node.from).number)) return;
          const text = state.sliceDoc(node.from, node.to);
          const alt = text.slice(2, text.indexOf("]"));
          const src = imageSrc(baseDir, state.sliceDoc(url.from, url.to));
          decorations.push(
            Decoration.replace({ widget: new ImageWidget(src, alt) }).range(
              node.from,
              node.to,
            ),
          );
          return false;
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
    // `[[nota]]`: o nome fica como link; os colchetes somem fora do cursor.
    const text = state.sliceDoc(from, to);
    for (const match of text.matchAll(WIKILINK)) {
      const start = from + match.index;
      const end = start + match[0].length;
      decorations.push(wikilink.range(start, end));
      if (active.has(state.doc.lineAt(start).number)) continue;
      const pipe = match[0].indexOf("|");
      decorations.push(
        hide.range(start, start + (pipe < 0 ? 2 : pipe + 1)),
        hide.range(end - 2, end),
      );
    }
  }
  return Decoration.set(decorations, true);
}

const livePreviewPlugin = (baseDir: string) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = livePreview(view, baseDir);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged)
          this.decorations = livePreview(update.view, baseDir);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );

/** Alvo do `[[link]]` sob a posição, se houver. */
function linkAt(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos);
  for (const match of line.text.matchAll(WIKILINK)) {
    const start = line.from + match.index;
    if (pos >= start && pos <= start + match[0].length) return match[1].trim();
  }
  return null;
}

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const imageExtension = (file: File) => IMAGE_TYPES[file.type];

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
  ".cm-wikilink": {
    color: "var(--color-brand)",
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  ".cm-image": {
    display: "block",
    maxWidth: "100%",
    maxHeight: "60vh",
    borderRadius: "var(--radius-card)",
  },
  ".cm-tooltip-autocomplete": {
    border: "1px solid var(--color-line)",
    background: "var(--color-surface)",
    fontFamily: "var(--font-sans)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "var(--color-highlight) !important",
  },
});

/** Editor Markdown (CodeMirror 6). Não controlado: `value` só vale ao montar. */
export function MarkdownEditor({ value, ...props }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef<Callbacks>(props);

  useEffect(() => {
    callbacks.current = props;
  });

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...formattingKeymap, ...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(highlight),
          livePreviewPlugin(props.baseDir),
          autocompletion({
            override: [
              (context: CompletionContext) => {
                const typed = context.matchBefore(/\[\[[^[\]|]*/);
                if (!typed) return null;
                const closed = context.state.sliceDoc(
                  context.pos,
                  context.pos + 2,
                );
                return {
                  from: typed.from + 2,
                  options: callbacks.current.linkTargets().map((title) => ({
                    label: title,
                    apply: closed === "]]" ? title : `${title}]]`,
                  })),
                  validFor: /^[^[\]|]*$/,
                };
              },
            ],
          }),
          EditorView.domEventHandlers({
            // Clique abre o link quando os colchetes estão escondidos;
            // na linha em edição, só com ⌘/Ctrl.
            mousedown: (event, editor) => {
              const target = event.target as HTMLElement;
              if (!target.closest(".cm-wikilink")) return false;
              const pos = editor.posAtDOM(target);
              const line = editor.state.doc.lineAt(pos).number;
              const editing = editor.state.selection.ranges.some(
                (r) =>
                  editor.state.doc.lineAt(r.from).number <= line &&
                  editor.state.doc.lineAt(r.to).number >= line,
              );
              if (editing && !(event.metaKey || event.ctrlKey)) return false;
              const link = linkAt(editor, pos);
              if (!link) return false;
              event.preventDefault();
              callbacks.current.onOpenLink(link);
              return true;
            },
            paste: (event, editor) => {
              const files = [...(event.clipboardData?.files ?? [])].filter(
                imageExtension,
              );
              if (!files.length) return false;
              event.preventDefault();
              void (async () => {
                for (const file of files) {
                  const path = await callbacks.current
                    .onPasteImage(file)
                    .catch(() => null);
                  if (!path) return;
                  editor.dispatch(
                    editor.state.replaceSelection(`![](${encodeURI(path)})\n`),
                  );
                }
              })();
              return true;
            },
          }),
          EditorView.lineWrapping,
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(update.state.doc.toString());
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
