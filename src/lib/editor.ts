import { EditorView } from "@codemirror/view";

/** Troca o texto do editor numa transação desfazível (Ctrl/Cmd+Z volta). */
export function replaceEditorText(root: HTMLElement | null, text: string) {
  const dom = root?.querySelector<HTMLElement>(".cm-editor");
  const editor = dom && EditorView.findFromDOM(dom);
  if (!editor) return;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: text },
  });
}
