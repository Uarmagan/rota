---
name: Rota
description: Conversational flight search that shows its work
colors:
  radar-cyan: "#22d3ee"
  radar-cyan-bright: "#67e8f9"
  radar-cyan-soft: "#A5F3FC"
  night-ground: "#0b0b0f"
  panel: "#111117"
  floating-panel: "#17171f"
  ink: "#e5e5e5"
  ink-bright: "#f5f5f5"
  ink-muted: "#94949e"
  rose-alert: "#fda4af"
  hairline: "#FFFFFF1A"
  hairline-faint: "#FFFFFF0F"
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.12em"
  data:
    fontFamily: "ui-monospace, monospace"
    fontSize: "11px"
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  chip:
    backgroundColor: "#FFFFFF0F"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  button-primary:
    backgroundColor: "{colors.radar-cyan-bright}"
    textColor: "{colors.night-ground}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.radar-cyan-soft}"
  best-badge:
    backgroundColor: "#22D3EE26"
    textColor: "{colors.radar-cyan-bright}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  popover:
    backgroundColor: "{colors.floating-panel}"
    rounded: "{rounded.xl}"
---

# Design System: Rota

## 1. Overview

**Creative North Star: "The Night Cockpit"**

Rota's surface is a dark instrument panel: calm, legible, everything dimmed except what matters right now. The near-black ground recedes; structure is drawn with hairline white-alpha borders and tonal fills rather than color or ornament. Type stays small and quiet, data runs in tabular figures and mono airport codes, and the single cyan indicator lights up only when the instrument has something to report — the best result, the settled verdict, the parse in progress.

The system is refined and restrained. It explicitly rejects chatbot theater (no bubbles, no transcript, no typing indicators), legacy OTA clutter (no filter walls, banner noise, or urgency badges), and generic AI-product gloss (no sparkle icons, purple gradients, or glassmorphism). Motion exists solely to make state change legible: chips pop when set and flash when changed, rows land as batches arrive, the verdict blooms once and fades.

**Key Characteristics:**
- Near-black tonal layering; hairline borders carry all structure
- One accent (Radar Cyan) reserved for system signals, never decoration
- Small, quiet type; tabular numerals and mono codes for data
- Motion as a named state vocabulary, every animation with a reduced-motion fallback

## 2. Colors

A restrained monochrome ramp over a near-black ground, with a single cold instrument accent.

### Primary
- **Radar Cyan Bright** (#67e8f9): the primary token (`--primary`) and the solid-fill grade — calendar selection, primary buttons, the parse progress sweep — plus readable accent text (best-badge text, bloom ring, streaming counter). It reports; it never decorates.
- **Radar Cyan** (#22d3ee): the tint-and-glow grade — chip change flash, best-badge tint (at 15%), verdict bloom outer glow. Never used as a solid fill.
- **Radar Cyan Soft** (#A5F3FC): hover grade of solid cyan fills and pressed-toggle text.

### Neutral
- **Night Ground** (#0b0b0f): the page. Everything sits on this.
- **Panel** (#111117): card surface, one tonal step up.
- **Floating Panel** (#17171f): popovers, drawers, menus — the highest tonal layer.
- **Ink** (#e5e5e5): default text. **Ink Bright** (#f5f5f5) for emphasized values.
- **Ink Muted** (#94949e): secondary text; tuned to hold ≥4.5:1 on the ground and the lifted best-result slab.
- **Hairline** (#FFFFFF1A) and **Hairline Faint** (#FFFFFF0F): all borders and dividers. Fills use the same white-alpha family at 2–7%.

### Tertiary
- **Rose Alert** (#fda4af): errors only, kept clearly warm against the cold accent.

### Named Rules
**The One Lamp Rule.** Radar Cyan appears only when the system has something to report: the best-match badge, the settle bloom, the parse sweep, a pressed toggle, a streaming counter. It never appears at rest and never as decoration. If cyan covers more than a few percent of the screen, something is wrong.

**The Hairline Rule.** Structure is drawn with white-alpha hairlines at 6–12% and tonal fills at 2–7%. Never solid gray borders, never colored side-stripes.

## 3. Typography

**Body Font:** system sans (Tailwind default `ui-sans-serif` stack)
**Data Font:** system mono (`ui-monospace`), for IATA codes

**Character:** One quiet family at small sizes; hierarchy comes from weight, tone, and tracking rather than scale. Numbers are always tabular so prices and times align as they re-rank.

### Hierarchy
- **Title** (600, 16px): result prices and key values, in `tabular-nums`.
- **Body** (400–500, 15px): the search input and result rows — the working size of the app.
- **Small** (400, 12px): chips, menu items, secondary copy.
- **Label** (400, 10px, 0.12–0.14em tracking, uppercase): chip field names, editor headings, whispered metadata.
- **Data** (mono, 11px, 0.05em tracking): airport codes.

### Named Rules
**The Whisper Label Rule.** Labels are 10px, uppercase, letter-spaced, and muted. They identify; the value they sit next to carries the weight. (This is a functional labeling system inside components, not a section-eyebrow pattern.)

## 4. Elevation

Flat, lit from above. Surfaces are flat tonal layers of the same white-alpha family; depth is conveyed by lightness steps, not shadows. The one lift in the system is the best-result slab: an inset top highlight (`inset 0 1px 0` white at 9%) that reads as light falling from above, reserved exclusively for the winner. True shadows exist only under floating layers (popovers, drawers), where they separate the layer from the page.

### Shadow Vocabulary
- **Floating layer** (`shadow-lg` on #17171f panels): popovers, dropdowns, drawers.
- **Winner lift** (`inset 0 1px 0 rgba(255,255,255,0.09), inset 0 0 0 1px rgba(255,255,255,0.055)`): the best-result slab only.
- **Verdict bloom** (`0 0 0 1px rgba(103,232,249,0.55), 0 0 20px 2px rgba(34,211,238,0.3)`, animated once): the settle moment.

### Named Rules
**The Lit-From-Above Rule.** Resting surfaces are flat. The inset top highlight marks exactly one element per screen — the current winner. Shadows appear only under layers that actually float.

## 5. Components

Refined and restrained: hairline borders, small type, controls that whisper until touched.

### Chips
- **Style:** 8px radius, 1px border, `text-xs`; uppercase whisper label + medium-weight value.
- **Filled:** `border-white/10` on `bg-white/[0.06]`.
- **Assumed:** dashed `border-white/[0.18]` on `bg-white/[0.03]`, with a small "assumed" suffix — visibly provisional.
- **Prompt (unfilled):** dashed border, empty value ("Where to?", "When?"); the emphasized first blocker gets `border-white/40`. Emphasis is static, never looping motion.
- **Interaction:** `rota-press` scale-down on tap; hover brightens the border; `focus-visible` ring at white/20.

### Buttons
- **Shape:** 8px radius, compact heights (32–40px).
- **Primary:** Radar Cyan Bright (#67e8f9) fill with Night Ground text; hover lifts to Radar Cyan Soft (#A5F3FC). Used sparingly (Apply in editors).
- **Ghost:** transparent with muted text; hover `bg-white/[0.06]` and brightened text. The default for secondary actions (Clear).

### Inputs / Fields
- **Search input:** borderless inside its `rounded-xl` hairline container (`bg-white/[0.04]`); the container's border brightens on `focus-within` — the input itself stays chromeless.
- **Editor inputs:** `bg-white/[0.04]`, hairline border, `[color-scheme:dark]`; focus brightens border to white/40.

### Cards / Containers
- **Corner Style:** 10–14px (search shell and popovers `rounded-xl`, best slab 10px).
- **Background:** tonal white-alpha steps; floating panels use solid #17171f.
- **Border:** hairline white/10; internal dividers white/[0.06–0.07].
- **Internal Padding:** 12px panels, denser (4–8px) inside menus.

### Best Result (signature)
The winner is a lifted neutral slab — `bg-white/[0.045]` with the inset lit-from-above highlight — never a colored stripe. The accent lives only in the ★ BEST badge (cyan-300 on cyan-400/15, 6px radius) and the one-shot verdict bloom. The resting row stays neutral.

### Skeletons & Progress
Loading is shimmer bands (`rota-shimmer`, white-alpha gradient sweep), never spinners in content. The parse busy state is a 2px indeterminate cyan sweep along the input's bottom track. Reduced motion swaps both for gentle opacity pulses.

## 6. Do's and Don'ts

### Do:
- **Do** reserve Radar Cyan for system signals (best badge, verdict bloom, parse sweep, pressed states). The One Lamp Rule is the identity.
- **Do** keep Ink Muted (#94949e) as the floor for body-size text — it is tuned for ≥4.5:1 on the ground and the best slab.
- **Do** use `tabular-nums` on every price, time, and count that can re-rank or stream.
- **Do** give every animation a `prefers-reduced-motion` alternative (fade or pulse), matching the existing `search.css` pattern.
- **Do** make state changes visible: chips pop when set, flash when changed; rows land with `rota-row`; the badge pops when it moves.

### Don't:
- **Don't** build chatbot UI: no chat bubbles, no scrolling transcript, no "assistant is typing" theater.
- **Don't** import legacy OTA clutter: no filter walls, banner noise, urgency badges, or cramped result rows.
- **Don't** add generic AI-product gloss: no sparkle icons, no purple gradients, no "magic" framing, no glassmorphism.
- **Don't** use colored side-stripes, gradient text, or a second accent hue; warmth belongs only to Rose Alert, and only for errors.
- **Don't** animate at rest. Looping motion is allowed only for genuinely indeterminate states (shimmer, progress sweep).
