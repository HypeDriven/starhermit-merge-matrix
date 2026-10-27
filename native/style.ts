// The look of the menus, HUD, rails and sheets: the browser build's style.css,
// rewritten class-based in tools/ui-style.css and converted once with
// `starhermit css` into assets/ui-style.json (`npm run css`), registered at
// start with the theme the runtime's own widgets (checkboxes, selects, scroll
// bars) take, in the system sans. The colour theme (Settings › Theme, or High
// Contrast while the runtime's high-contrast option is on) sets the tokens as
// the browser build's applySettingsToDom set its CSS variables.
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";
import type { ThemeDef } from "../src/content.ts";

let base: Record<string, string | number> = {};

export function initStyles(): void {
  const css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  base = { ...(css.tokens as Record<string, string | number>) };
  ui.setFont({ family: "system-ui" });
  ui.setTheme({
    fontSize: 16, smallSize: 14, headingSize: 24, padding: 8, spacing: 8, radius: 10,
    text: "#e8ecf6", muted: "#9aa7c4", panel: "#131b2e", control: "#1d2942", hovered: "#26355a",
    pressed: "#2c3d66", field: "#0a0e1a", accent: "#41d9c0", focus: "#41d9c0", outline: "#ffffff22",
  });
  ui.setTokens(css.tokens);
  ui.setAnimations(css.animations);
  ui.setStyles({
    ...css.styles,
    label: { text: { color: "$text" } },
    paragraph: { text: { color: "$text" } },
    heading: { text: { color: "$text" } },
    widget: { focusRing: { color: "$focus", width: 3, offset: 2 } },
    checkbox: {
      text: { color: "$text" }, minHeight: 44,
      parts: { box: { background: "$panel2", border: { width: 2, color: "$muted" }, radius: 4 }, mark: { background: "$accent" } },
    },
    select: { background: "$panel2", border: { width: 1, color: "$panel2" }, radius: 8, text: { color: "$text" }, minHeight: 40 },
    scrollArea: { parts: { bar: { background: "#9aa7c466", radius: 4 } } },
    tooltip: { background: "$panel", text: { color: "$text" }, radius: 6, padding: 6 },
  });
}

let key = "";
/** The theme's colours as the page's tokens (ui.ts applySettingsToDom). */
export function applyTheme(t: ThemeDef): void {
  if (key === t.id) return;
  key = t.id;
  // style.css body.high-contrast (its variables won over the theme's on <html>).
  if (t.id === "mono") {
    ui.setTokens({ ...base, bg: "#000000", panel: "#111111", panel2: "#222222", text: "#ffffff", muted: "#dddddd", accent: "#ffdf00", focus: "#ffdf00", "on-accent": "#000000" });
    return;
  }
  ui.setTokens({
    ...base, bg: t.bg, panel: t.grid, panel2: t.cell, accent: t.accent, focus: t.accent,
    text: t.textLight ? "#e8ecf6" : "#1b2540", muted: t.textLight ? "#9aa7c4" : "#4a5570",
    "on-accent": t.textLight ? "#07231e" : "#ffffff",
    scrim: t.textLight ? "#04060cbf" : "#e8e6dfcc",
  });
}
