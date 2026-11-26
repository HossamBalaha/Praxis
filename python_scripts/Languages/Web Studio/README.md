# Web Studio

Web design & development examples — the full frontend trio plus the
typed language behind it:

| File               | What it shows                                                                                                                                             |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `LandingPage.html` | A real landing page (hero, features, pricing table, contact form). Open it in **Preview** mode; its messy indentation is the Auto-format **HTML** target. |
| `styles.css`       | The page's stylesheet — minified-ish blocks, nested media queries. Auto-format **CSS** unwraps it.                                                        |
| `app.js`           | The page's script — deliberately messy braces/spacing. Auto-format **JavaScript** snaps it back; runs under Node too (DOM guarded).                       |
| `utils.ts`         | Typed utilities (generics, discriminated unions, `Money`). Runnable via tsx / Node ≥ 22.6 / deno.                                                         |
| `Parser.ts`        | The deliberately-messy **Auto-format TypeScript** playground.                                                                                             |
| `Stats.ts`         | Typed stats over sensor readings — a real runnable `.ts`.                                                                                                 |
| `HelloNode.js`     | A Node CLI demo — run it with args (`--name Praxis --count 3`).                                                                                           |

The viewer's view mode renders `LandingPage.html` live in a sandboxed
iframe (full height, like the source pane); edit mode gives the
textarea + live-preview split.
