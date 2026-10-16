import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";

/** Envolve a seleção com `mark` (ou desfaz, se já estiver envolvida). */
function toggleWrap(mark: string) {
  return (view: EditorView) => {
    const { state } = view;
    const n = mark.length;
    view.dispatch(
      state.changeByRange((range) => {
        const before = state.sliceDoc(range.from - n, range.from);
        const after = state.sliceDoc(range.to, range.to + n);
        if (before === mark && after === mark) {
          return {
            changes: [
              { from: range.from - n, to: range.from },
              { from: range.to, to: range.to + n },
            ],
            range: EditorSelection.range(range.from - n, range.to - n),
          };
        }
        const text = state.sliceDoc(range.from, range.to);
        if (
          text.length >= 2 * n &&
          text.startsWith(mark) &&
          text.endsWith(mark)
        ) {
          return {
            changes: {
              from: range.from,
              to: range.to,
              insert: text.slice(n, -n),
            },
            range: EditorSelection.range(range.from, range.to - 2 * n),
          };
        }
        return {
          changes: [
            { from: range.from, insert: mark },
            { from: range.to, insert: mark },
          ],
          range: EditorSelection.range(range.from + n, range.to + n),
        };
      }),
      { scrollIntoView: true, userEvent: "input" },
    );
    return true;
  };
}

/** Linhas tocadas pela seleção, sem repetir. */
function selectedLines(state: EditorState) {
  const lines = new Map<number, { from: number; text: string }>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
      const line = state.doc.line(n);
      lines.set(n, { from: line.from, text: line.text });
    }
  }
  return [...lines.values()];
}

/** Troca o prefixo de cada linha selecionada; mesmo prefixo de novo remove. */
function togglePrefix(pattern: RegExp, prefix: string) {
  return (view: EditorView) => {
    const lines = selectedLines(view.state);
    const all = lines.every((l) => l.text.match(pattern)?.[0] === prefix);
    view.dispatch({
      changes: lines.map((line) => {
        const current = line.text.match(pattern)?.[0] ?? "";
        return {
          from: line.from,
          to: line.from + current.length,
          insert: all ? "" : prefix,
        };
      }),
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  };
}

const HEADING = /^#{1,6} /;
const LIST = /^(- \[[ xX]\] |[-*+] |\d+[.)] )/;

/** Atalhos de formatação Markdown (Mod = ⌘ no macOS, Ctrl nos demais). */
export const formattingKeymap: KeyBinding[] = [
  { key: "Mod-b", run: toggleWrap("**") },
  { key: "Mod-i", run: toggleWrap("*") },
  { key: "Mod-Shift-x", run: toggleWrap("~~") },
  { key: "Mod-e", run: toggleWrap("`") },
  { key: "Mod-1", run: togglePrefix(HEADING, "# ") },
  { key: "Mod-2", run: togglePrefix(HEADING, "## ") },
  { key: "Mod-3", run: togglePrefix(HEADING, "### ") },
  { key: "Mod-Shift-8", run: togglePrefix(LIST, "- ") },
  { key: "Mod-Shift-7", run: togglePrefix(LIST, "1. ") },
  { key: "Mod-Shift-9", run: togglePrefix(LIST, "- [ ] ") },
];

/** `[[nota]]` ou `[[nota|apelido]]`: grupo 1 é o alvo. */
export const WIKILINK = /\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/g;

/** Palavras do texto, ignorando a marcação Markdown. */
export const countWords = (text: string) =>
  text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
