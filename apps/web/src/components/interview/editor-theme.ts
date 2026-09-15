import type { BeforeMount } from "@monaco-editor/react";

export const WELL_THEME = "broadsheet-well";

/**
 * The code editor is a well: the one surface darker than the page, in both
 * themes. Monaco can't read CSS variables, so --well (oklch 0.135 0.004 85)
 * and its neighbours are written out as hex here.
 */
export const defineWellTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(WELL_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0e0e0d",
      "editorGutter.background": "#0e0e0d",
      "editor.lineHighlightBackground": "#1b1b19",
      "editor.lineHighlightBorder": "#1b1b19",
      "editorLineNumber.foreground": "#5e5d5a",
      "editorLineNumber.activeForeground": "#9a9994",
      "editorCursor.foreground": "#8fb4f0",
      "editor.selectionBackground": "#2c3a52",
      "editorWidget.background": "#1f1f1d",
      "editorWidget.border": "#3a3a37",
      "scrollbarSlider.background": "#ffffff14",
    },
  });
};
