---
name: socket.help
description: The internet toolkit for AI coding agents. One dark, precise devtool site where the product is shown working.
colors:
  ground: "#0b0c0c"
  surface: "#121414"
  subtle: "#181a1a"
  code-ground: "#0e1010"
  ink: "#ecedeb"
  muted: "#9a9e9b"
  line: "rgb(255 255 255 / 0.08)"
  line-strong: "rgb(255 255 255 / 0.16)"
  mint: "#6bdc9a"
  mint-hover: "#8be6b1"
  mint-soft: "rgb(107 220 154 / 0.1)"
  mint-line: "rgb(107 220 154 / 0.35)"
  mint-ink: "#04170c"
  brand: "#286747"
  warning: "#f5b544"
  danger: "#f08c84"
typography:
  display:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
  heading:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  page-title:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "clamp(36px, 4.5vw, 56px)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  lede:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75rem
  body:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5rem
  code:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5rem
rounded:
  sm: "8px"
  control: "10px"
  row: "12px"
  card: "16px"
  panel: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
  section: "128px"
components:
  button-primary:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.mint-ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.mint-hover}"
  button-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.control}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  code-block:
    backgroundColor: "{colors.code-ground}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
---

# Design System: socket.help

## Overview

A dark developer-tool site in the tradition of Resend, AgentMail and Trigger.dev, where every page shows the product working instead of describing it. The homepage leads with a live webhook inbox that really receives requests, over ridgelines that pulse when one arrives. Elsewhere the brand is carried by real tool calls, real code and real product screenshots. There is no decoration layer: no glows, aurora, grids, pointer lights or eyebrow labels.

The whole site, including the dashboard, tool pages, docs and the Scalar API reference, uses the same tokens from `app/base.css`. Light mode does not exist.

## Colors

### Primary
**Mint** `#6bdc9a` is the single accent, lifted from the brand green `#286747` so it reads on near-black. Use it for the primary action, active states, code calls and success. **Brand green** `#286747` stays only in the logo mark.

### Neutral
Near-black ground `#0b0c0c`, raised surface `#121414`, subtle fill `#181a1a`, off-white ink `#ecedeb`, muted text `#9a9e9b`, which stays above 4.5:1 on every surface. Hairlines are 8% white, strong lines 16% white.

### Named Rules
- **One accent.** Mint is the only hue doing brand work. Amber (`#f5b544`) appears only for "waiting on you" and warnings, and coral (`#f08c84`) only for errors.
- **Ink on paper.** Solid neutral buttons are light with dark text (`--ink` on `--bg`), never white text on a light fill.

## Typography

Geist for everything, Geist Mono only for code, payloads, URLs and tabular numbers.

### Hierarchy
- Display 60px, 600, line height 1, tracking -0.04em: the homepage hero only.
- Section heading 48px, tracking -0.035em.
- Page title clamp(36px, 4.5vw, 56px) for content pages.
- Lede 18px over 28px in muted ink, at most about 560px wide.
- Body 16px over 24px.
- Code 13px Geist Mono over 24px.

Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`. Tracking never goes below -0.04em.

## Layout

Content sits in a 1200px container (1104px for the shared header) with 24px gutters, 16px under 640px. Homepage sections are separated by 128px (96px on phones). Composition varies by section: split hero, full-width tool panel, one centred section wider than the text column for the dashboard shot, split copy and screenshot, price row, two-column questions, and a centred close over the setup prompt. Docs use a 220px left navigation, the article, and a 200px on-page table of contents.

## Elevation & Depth

Elevation is a border, not a shadow: panels are `--surface` with a 1px `--line` border. Only floating product imagery and the live inbox carry a soft, offset dark shadow (`0 32px 80px rgb(0 0 0 / 0.5)`).

## Shapes

8px for small parts, 10px for controls, 12px for rows, 16px for cards and panels, 24px for large panels. Pills only for small status chips.

## Components

### Buttons
- Primary: mint fill with dark mint ink, 44px tall on marketing pages, 10px radius.
- Solid neutral: light ink fill with dark text.
- Ghost: transparent with a strong hairline.
- Press: scale(0.98).
- Focus: a 2px mint outline, offset 3px.

### Cards / Containers
Raised surface, 1px hairline, 16px radius. Never nest cards. Lists of more than a few pages are rows with hairline dividers, not card grids.

### Navigation
The header is a 64px translucent bar over the ground. The active link gets a subtle fill. The dashboard and docs navigation mark the active item with a fill and bold ink, never a side stripe.

### Code and transcripts
Code blocks sit on `#0e1010` with Geist Mono. Tool transcripts mark calls (→) in mint, results (←) in ink and comments in grey. On the homepage they play in sequence: the call, a "waiting…" pause, then the result.

### Live webhook inbox (signature)
A real anonymous inbox, created when the card scrolls into view and reused for the browser session. It shows the URL, a test-request button, the last three requests, and the latest request's key headers and pretty body. A new request sends a pulse along one ridgeline.

## Do's and Don'ts

### Do:
- Show the product working: live components, real tool calls, real screenshots from a demo workspace.
- Write limits and prices exactly as they are, and mark planned plans as planned.
- Honour reduced motion: ridgelines stop, transcripts render complete, reveals are instant.

### Don't:
- Don't add eyebrow labels above headings, gradient text, glows, grids or pointer effects.
- Don't put company logos or customer claims on the site without real, permitted evidence.
- Don't use side stripes thicker than 1px for active or callout states.
- Don't introduce a light theme on individual pages.
