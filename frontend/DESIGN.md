---
name: Kivel
description: The internet toolkit for AI coding agents. A white, minimal site with one colourful painting, one typeface and few words.
colors:
  ground: "#ffffff"
  surface: "#ffffff"
  subtle: "#f4f4f1"
  code-ground: "#121514"
  ink: "#111312"
  muted: "#5d615e"
  line: "#e7e7e3"
  line-strong: "#d3d4d0"
  brand: "#111312"
  warning: "#9a5a0c"
  danger: "#ad3f3b"
typography:
  display:
    fontFamily: "Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  heading:
    fontFamily: "Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.035em"
  page-title:
    fontFamily: "Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "clamp(36px, 4.5vw, 56px)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  lede:
    fontFamily: "Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75rem
  body:
    fontFamily: "Hanken Grotesk, -apple-system, sans-serif"
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

# Design System: Kivel

## Overview

Option A, "Gallery": a white, minimal page in the spirit of different.ai. The homepage says what the product is in the first screen (headline, one sentence, price and compatibility line), then shows one colourful painting, Hilma af Klint's The Ten Largest, No. 3 (1907, public domain), as a framed image. Few sections, few words, lots of space. The dashboard, docs, pricing and tool pages share the same type, colours and pill buttons, without art.

## Colors

White page, ink `#141414`, muted `#5b5b5b` (above 4.5:1), hairlines `#e8e8e8`, a light grey `#f5f5f4` for small fills. There is no accent colour: the logo and success states use ink. Colour comes from the painting, never from the interface.

## Typography

Hanken Grotesk for everything; Geist Mono only for code, URLs and payloads. Headlines weight 500 with -0.035em tracking: hero 60px, section 44px, page titles 56 to 64px. Body 15 to 18px in muted ink.

## Layout

1104px content width (matches the header), 24px gutters (16px on phones), 160px between homepage sections. Homepage: hero (headline left, sentence, buttons and facts right), the painting, three short lines with a rule above each, then split sections (short heading left, content right) for the live demo, pricing and questions, and a one-line close.

## Elevation & Depth

Flat. Hairline borders only; no shadows on the homepage.

## Shapes

Pill buttons; 14px cards; 10px inputs and code; 6px on the painting.

## Components

### Logo
An outline wall socket (a circle and two centred slots) in the text colour, beside the wordmark "Kivel" in Hanken Grotesk 600. The favicon is the same socket in white on an ink tile. Source: components/logo.tsx and app/icon.svg.

### Buttons
Black pill, 46px, 15px medium text. Secondary actions are underlined text links.

### Live webhook inbox
A real anonymous inbox created when it scrolls into view: URL, test button, the last three requests and the latest request's headers and body.

## Do's and Don'ts

### Do:
- Say what the product is, who it is for and what it costs in the first screen.
- Keep each section to one heading and one idea.
- Mark planned prices as planned.

### Don't:
- Don't add dark themes, background animation, glows, grids, eyebrows or gradient text.
- Don't add a second typeface for headlines.
- Don't invent customers, logos or numbers.
