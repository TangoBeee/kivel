---
name: socket.help
description: The internet toolkit for AI coding agents. A calm, light editorial site with one archive-photograph hero, large serif headlines and the product shown working.
colors:
  ground: "#ffffff"
  surface: "#ffffff"
  subtle: "#f4f4f1"
  code-ground: "#121514"
  ink: "#111312"
  muted: "#5d615e"
  line: "#e7e7e3"
  line-strong: "#d3d4d0"
  green: "#286747"
  green-hover: "#1f5239"
  green-soft: "#edf5ef"
  green-line: "#b6dbc3"
  green-ink: "#ffffff"
  brand: "#286747"
  warning: "#9a5a0c"
  danger: "#ad3f3b"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "5.75rem"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "3.5rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
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
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "9999px"
    height: "44px"
    padding: "0 22px"
  button-primary-hover:
    backgroundColor: "#2b2f2d"
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

A calm, light editorial site in the spirit of different.ai. The homepage opens on one full-bleed archive photograph of a 1940s telephone switchboard, toned into the palette, with small switchboard lamps glowing across the board and a large serif headline over it. Everything after the hero is a white page: large Instrument Serif headlines, small quiet Geist text, framed archive photographs, black pill buttons and generous space. The product is shown working (a live webhook inbox, real tool calls, a real dashboard screenshot); there is no decoration layer.

The switchboard is the metaphor: operators connected every call by hand, and socket.help connects agents to the internet while the human picks up when it matters. Photographs are U.S. National Archives and Bell Telephone Magazine (Internet Archive), no known copyright restrictions, credited on the page.

## Colors

### Primary
Near-black ink `#111312` on white. Brand green `#286747` is a small accent only: links on hover, tool calls in code, success states and the logo.

### Neutral
White page and surfaces, a warm grey band `#f4f4f1` for one section at a time, muted text `#5d615e` (above 4.5:1), hairlines `#e7e7e3`. Code blocks stay dark (`#121514`) with light text.

### Named Rules
- **Ink on paper.** Primary buttons are black pills with white text; on the hero they invert to white pills.
- **One art moment per screen.** Only the hero is full bleed; other photographs are framed inside the layout.

## Typography

Instrument Serif (400, with italic for one emphasised word) for display and section headlines; Geist for everything else; Geist Mono only for code, payloads and URLs.

### Hierarchy
- Hero 92px over 0.95, white on the photograph.
- Section headlines 56px, statement lines up to 96px.
- Page titles 64px on content pages, 44px in the app.
- Body 15 to 17px, muted, never more than about 460px wide beside a headline.

## Layout

1200px container, 24px gutters (16px on phones), 160px between homepage sections. Sections alternate: split image and text, a single centred line, a grey band of three cards, split demo, split screenshot, a three-column plain price row, two-column questions, and a split close with a framed photograph.

## Elevation & Depth

Flat white. Only the live inbox and the dashboard screenshot carry a soft, offset shadow.

## Shapes

Pills for every button; 16px cards; 10px inputs and code; 4px on photographs.

## Components

### Buttons
Black pill, 44px tall, 15px medium text; white pill on the hero; underlined text links as the secondary action.

### Live webhook inbox (signature)
A real anonymous inbox created when it scrolls into view, with the URL, a test button, the last three requests and the latest request's headers and body. A new request flashes a row of lamps in the hero.

## Do's and Don'ts

### Do:
- Keep pages light, quiet and spacious; let one headline and one image carry each section.
- Show the real product and real calls; mark planned prices as planned.
- Honour reduced motion: lamps static, no drift, reveals instant.

### Don't:
- Don't use dark full-page themes, glows, grids, eyebrows or gradient text.
- Don't put text over photographs except in the hero.
- Don't invent customers, logos or numbers.
