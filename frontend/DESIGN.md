---
name: Kivel
description: A dark, minimal toolkit for agents and the people working with them.
---

# Kivel design

The accepted dark landing page sets the direction for the public site and dashboard. Keep its layout and visual identity. Product screens use the same palette with less motion and more space for data.

## Tokens

`app/tokens.css` is the source of truth. Use tokens instead of introducing page palettes.

| Role        | Token                                       | Value                           |
| ----------- | ------------------------------------------- | ------------------------------- |
| Page        | `--bg`                                      | `#000`                          |
| Surfaces    | `--surface-1`, `--surface-2`, `--surface-3` | `#0d0d0d`, `#141414`, `#1c1c1f` |
| Borders     | `--line`, `--line-strong`                   | `#ffffff1f`, `#ffffff38`        |
| Text        | `--text`, `--text-2`, `--text-3`            | `#fff`, `#dadada`, `#999`       |
| Action      | `--accent`, `--accent-hover`                | `#4052ee`, `#5262ff`            |
| Links       | `--accent-text`                             | `#a9b2ff`                       |
| Information | `--info`                                    | `#5ad2ff`                       |
| Warning     | `--warning`                                 | `#ffb547`                       |
| Failure     | `--danger`                                  | `#ff5b5b`                       |

No green. Success uses a check icon and white or information blue. Never communicate state by colour alone. Use the light link token for small text, not the darker action fill. White text belongs on blue primary actions.

## Type and shape

Manrope for headings, Inter for body text, Geist Mono for code and URLs. Load fonts once in the root layout. Long text uses 17px Inter, 1.7 line height and a maximum width of 68ch. Body copy uses `--text-2`; secondary labels use `--text-3` (above AA contrast on `--surface-1`). Code uses `--surface-2`.

Use 6px small corners, 12px controls and rows, 16px cards, and 200px pills. Keep visible keyboard focus. Radix uses dark appearance and the indigo accent, mapped to the shared tokens.

## Layout and motion

Public pages have a header and footer. The dashboard has a sidebar and top bar, with resource details inside the dashboard. Use 16px minimum phone gutters and allow data to wrap or scroll inside its own panel. Check layouts at 1440px and 390px.

Keep app interactions between 150 and 250ms with `--ease`. Landing scroll effects stay on the landing page. Respect reduced motion. Render useful content immediately; don't hide the page while fonts, images or account checks finish.

## Copy

Sentence case, plain language and few words. Describe what the product does for development, testing and production. Payments always say test mode and never imply real funds. Don't invent customers, testimonials, volume or uptime claims.
