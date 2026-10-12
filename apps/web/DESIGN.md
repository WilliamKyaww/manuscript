---
name: Manuscript
description: A calm, paper-like study workspace where the student's material is the loudest thing on screen.
colors:
  paper: "#f7f5f1"
  card-white: "#ffffff"
  sunken-well: "#f0ede7"
  hover-wash: "#ebe7e0"
  hairline: "#e2ddd4"
  hairline-strong: "#c9c1b4"
  ink: "#1f1c18"
  ink-muted: "#57514a"
  ink-subtle: "#6e675e"
  forest: "#2f6b5a"
  forest-deep: "#255748"
  forest-tint: "#e3efea"
  night-paper: "#121211"
  night-surface: "#1a1918"
  night-raised: "#232220"
  night-sunken: "#0e0e0d"
  night-hover: "#2a2826"
  night-hairline: "#2e2c29"
  night-hairline-strong: "#45423d"
  night-ink: "#ece8e1"
  night-ink-muted: "#b5aea4"
  night-ink-subtle: "#9a9389"
  mint: "#6bbfa6"
  mint-bright: "#86cdb8"
  mint-tint: "#1d3530"
  mint-contrast: "#0b1d17"
  success: "#256b43"
  success-tint: "#e2f1e7"
  warning: "#8a4f00"
  warning-tint: "#f8ecd8"
  danger: "#a8231b"
  danger-tint: "#f8e3e1"
  info: "#2a5aa0"
  info-tint: "#e2ebf7"
  graphite-paper: "#f5f5f4"
  graphite-ink-blue: "#3b5b86"
  graphite-night-paper: "#1c1c1c"
  graphite-night-ink-blue: "#9bb3d6"
  sand-paper: "#f8f1e7"
  sand-terracotta: "#9e4a27"
  sand-night-paper: "#16120e"
  sand-night-terracotta: "#e8a27c"
  slate-paper: "#f3f5f8"
  slate-steel: "#2c5d97"
  slate-night-paper: "#0f1318"
  slate-night-steel: "#80b1ec"
  sage-paper: "#f2f5f0"
  sage-leaf: "#41704a"
  sage-night-paper: "#111511"
  sage-night-leaf: "#90c597"
  iris-paper: "#f6f5f9"
  iris-violet: "#674caf"
  iris-night-paper: "#16141b"
  iris-night-violet: "#b39ef0"
typography:
  headline:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  section:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  reading:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  figure:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    fontFeature: "tnum"
  mono:
    fontFamily: "Cascadia Code, Cascadia Mono, Consolas, SFMono-Regular, Menlo, monospace"
    fontSize: "0.9em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.card-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.forest-deep}"
  button-secondary:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.hover-wash}"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-danger-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-sm:
    padding: "0 12px"
    height: "32px"
  icon-button:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    size: "36px"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  badge-accent:
    backgroundColor: "{colors.forest-tint}"
    textColor: "{colors.forest}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-neutral:
    backgroundColor: "{colors.sunken-well}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  tree-row:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    height: "26px"
  tree-row-active:
    backgroundColor: "{colors.forest-tint}"
    textColor: "{colors.ink}"
  menu-item:
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  menu-item-highlighted:
    backgroundColor: "{colors.hover-wash}"
---

# Design System: Manuscript

## Overview

**Creative North Star: "The Quiet Study Desk"**

Manuscript is a work surface for long study sessions on a Windows laptop: tinted paper, white sheets laid on it, sunken wells for secondary matter, and one ink accent that marks what can be acted on. The interface is compact and keyboard-first, close to Obsidian and to the operating system in its conventions, so the student's notes, slides and cards stay the loudest thing on screen. Density is deliberate: a 14px interface, 26-36px rows and controls, and no decorative whitespace that would show less material.

The world has three independent dials, set as attributes on the document before first paint: theme (light, dark), palette (Manuscript, the original warm paper and forest green, plus Graphite, Sand, Slate, Sage and Iris) and interface (Simplified, the default, or Standard). Palettes recolour only the neutrals and the accent. Simplified UI keeps every control and every component, and quietens the frame: a change of surface separates where it already can, and a softened line remains only where a boundary carries structure. Standard draws the frame with hairlines as Manuscript always did.

Confirmed rejections, from the direction for this build: hidden features, whitespace that shows less content, a generic grey look that loses Manuscript's warmth in its default palette, saturated backgrounds, separators removed where panes then blur together, and anything that breaks keyboard use or contrast.

**Key Characteristics:**
- Tinted paper page, white or near-white cards and panes, sunken wells: depth from tone, not shadow.
- One accent per palette, used for primary actions, links, focus, selection, caret and the active tree row.
- Status, mastery and graph colours carry meaning and never change with the palette.
- A compact system sans at 14px for the interface, 15px at a 1.65 line height for reading.
- Simplified UI removes lines, never controls.

## Colors

Warm, low-chroma neutrals in three ink strengths, each meeting WCAG AA on every surface, with a single muted accent; six palettes rework the neutrals and accent per theme while the meaning-bearing colours stay put.

### Primary
- **Forest** (light) and **Mint** (dark): the Manuscript accent. Primary buttons, links, the focus outline, the caret of every field, the active tab underline, the active-pane line on the tab strip, checkmarks in menus. **Forest Deep** / **Mint Bright** are its hover states only.
- **Forest Tint** / **Mint Tint**: the accent's quiet surface. Text selection, the active row in the file tree, accent badges, drop targets.
- Palette accents replace Forest one for one: **Graphite Ink Blue**, **Sand Terracotta**, **Slate Steel**, **Sage Leaf**, **Iris Violet**, each with a lighter night variant. Their hover, tint and contrast companions live beside them in `src/styles/tokens.css`.

### Neutral
- **Paper** (light) / **Night Paper** (dark): the page and pane background. Each palette has its own paper: Graphite's true grey, Sand's warmer cream, Slate's blue-grey, Sage's green tint, Iris's violet tint.
- **Card White** / **Night Surface**: cards, page headers, the Files pane in Simplified UI, inputs and secondary buttons. **Night Raised** lifts dialogues and menus in dark.
- **Sunken Well** / **Night Sunken**: neutral badges, keyboard keys, the Standard tab strip, file-type tags.
- **Hover Wash** / **Night Hover**: the hover and highlighted state of every ghost control, menu item and tree row.
- **Hairline** / **Hairline Strong**: borders. The strong one outlines inputs, secondary buttons and keys, and colours the thin scrollbars.
- **Ink**, **Ink Muted**, **Ink Subtle**: primary text; secondary text and icons; placeholders, hints and chevrons.

### Semantic
- **Success**, **Warning**, **Danger**, **Info**, each with a tint: badges, banners and destructive actions on their tint. Danger's solid fill is reserved for the confirming button of a destructive dialogue.
- Mastery stages, graph communities and graph structure have their own tokens in both themes and are the same in every palette.

### Named Rules
**The One Accent Rule.** Each palette has exactly one accent, and it means "act here" or "you are here". Status colours never stand in for it, and it never fills a large background.

**The Fixed Meaning Rule.** A palette overrides the neutrals and the accent, and nothing else. Success, warning, danger, info, mastery stages and graph colours read the same in Manuscript as in Iris.

**The Tested Pairing Rule.** Every text, accent, button and focus pairing in every palette and theme meets WCAG AA, and a unit test (`features/design/palettes.test.ts`) proves it. A new palette or token value is not done until that test passes.

**The Token-Only Rule.** Components use the token utilities (`bg-surface`, `text-muted`, `border-border`), never raw colours. The one exception is content drawn on a fixed white page: PDF pages and print.

## Typography

**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui and Arial behind it)
**Mono Font:** Cascadia Code (with Cascadia Mono, Consolas and Menlo)

**Character:** One operating-system sans for the whole interface, so Manuscript sits on Windows like a native tool; hierarchy comes from weight and a short size ramp rather than a second face. Cascadia handles code and inline code.

### Hierarchy
- **Headline** (600, 1.25rem, tight tracking): page titles in a page header. On the Notes page the title is kept for screen readers and focus while the tab row takes its place.
- **Title** (600, 1rem): card titles; dialogue titles step up to 1.125rem.
- **Section** (600, 0.875rem): sticky section headers and grouped headings inside a page body.
- **Body** (400, 0.875rem): every control, list, menu and paragraph of interface text. File-tree names in Simplified UI are 0.8125rem in Ink Muted.
- **Reading** (400, 15px, 1.65 line height, 46rem measure): the note editor and preview. Note headings scale from it: 1.6em and 1.35em at 700, 1.15em at 650.
- **Label** (500, 0.75rem): badges, breadcrumbs, tooltips, hints, the note status chip.
- **Figure** (600, 1.5rem, tabular numerals): counts and percentages on Today, Review and Progress.

### Named Rules
**The Compact Ramp Rule.** The interface lives between 0.75rem and 1.25rem. Larger sizes are for figures and note headings only.

**The Tabular Figures Rule.** Every number that is compared or counted (due cards, scores, mastery) uses tabular numerals.

## Layout

An application shell: an icon rail or 13.5rem sidebar (3.75rem collapsed) on the left, then exactly one page. A page is a fixed header outside its scroll container and one scrolling body, centred at 64rem (`max-w-5xl`), 80rem for wide pages, or full width; work surfaces such as Notes, the library and the graph use a row of resizable panes, each with its own fixed 40px header and its own scroll container. The window itself never scrolls.

The spacing rhythm is a 4px base: 6-8px gaps between controls, 12px pane and field padding, 16-20px card padding, 24px page padding. Page headers use 16px top and bottom at regular density, 6px vertical at compact density.

Responsive behaviour: the primary target is 1280px and wider. Below 1024px the sidebar becomes the icon rail. At 768px every route stays usable; side panels remain resizable panes. A page header's actions wrap below the title rather than cut it short. Narrow panels use icon tabs whose names appear as the panel widens (container queries at 12rem, 19rem and 28rem). The note status chip floats in the note's corner only once the note is 62rem wide; narrower, it sits inline.

### Named Rules
**The Fixed Header Rule.** Every page and every pane keeps its header outside its scroll container, so it can never scroll away.

**The Surface Separates Rule.** In Simplified UI, draw no line where a change of surface already separates (page headers, pane headers and toolbars, the tab strip, the Files pane footer). Keep a softened divider where a boundary carries structure: between resizable panes, beside the app sidebar, in indent guides. Never remove a line where two panes would then blur together.

**The Chrome Token Rule.** Draw a frame with the chrome tokens (`border-chrome-line`, `bg-divider`, `bg-pane-header`), not with `border-border`, so it follows the interface setting.

## Elevation & Depth

Depth is tonal first: paper, white sheets on it, sunken wells beneath, raised surfaces for floating layers in dark. Shadows are short, low-opacity and warm-tinted in light (ink at 6-16 %), plain black in dark. In Simplified UI cards lose both shadow and edge in light themes (white on tinted paper is enough) and keep a faint divider-coloured edge in dark.

### Shadow Vocabulary
- **Low** (`box-shadow: 0 1px 2px rgb(31 28 24 / 0.06)`): cards in Standard; the floating note status chip.
- **Mid** (`box-shadow: 0 4px 12px rgb(31 28 24 / 0.08), 0 1px 3px rgb(31 28 24 / 0.06)`): menus, popovers and tooltips.
- **High** (`box-shadow: 0 16px 40px rgb(31 28 24 / 0.16), 0 4px 12px rgb(31 28 24 / 0.08)`): dialogues over the overlay.

### Named Rules
**The Floating Shadow Rule.** A shadow means "this floats above the page". Anything that sits in the page's flow is separated by tone or a hairline, and in Simplified UI by tone alone.

## Shapes

Three radii, gently rounded: 4px for small parts (menu items, keys, file-type tags, inline rename fields), 8px for controls (buttons, inputs, icon buttons, tooltips, menus, tree rows inset as soft pills), 12px for containers (cards, dialogues). Badges are full pills. Tabs in the note tab strip are rounded only at the top (8px), joining the surface beneath them. Borders are 1px hairlines; the only 2px strokes are the focus outline, the active tab underline and the active pane's top line on its tab strip.

## Components

### Buttons
Restrained and exact: medium-weight 14px labels, named for what they do.
- **Shape:** gently rounded (8px); 36px tall with 16px side padding, or 32px and 12px at the small size.
- **Primary:** accent fill with the accent's contrast text; one per view.
- **Secondary:** the default. Surface fill, strong hairline, Ink text.
- **Ghost:** no fill or border until hover. **Link:** a ghost in accent text, for a way to another page among buttons.
- **Danger outline:** Delete in a page header, present but not where the eye lands first. **Danger** (solid) only confirms a destructive dialogue.
- **Hover / Focus:** hover changes the fill over 120ms (primary to accent-hover, others to Hover Wash); focus is a 2px accent outline offset 2px. Disabled is 50 % opacity with no pointer events; loading shows a spinner and disables.

### Icon Buttons
36px (or 28px small) squares at 8px radius, Ink Muted icons that turn Ink on a Hover Wash. Every one has a label, which is also its tooltip, with its shortcut beside it.

### Badges
Full pills, 12px medium text, 2px by 8px padding: a tint background with its own strong colour (accent, success, warning, danger, info), or the neutral well with a hairline.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Card White / Night Surface on the page's paper.
- **Shadow Strategy:** Low in Standard; none in Simplified (see Elevation).
- **Border:** the card-edge token: a hairline in Standard, none in Simplified light, a faint divider in Simplified dark.
- **Internal Padding:** 20px sides, 16px top; a 16px semibold title with an optional muted description and right-aligned actions.

### Inputs / Fields
- **Style:** 36px, 8px radius, surface fill, strong hairline, 12px side padding, Ink Subtle placeholder, accent caret.
- **Focus:** the global 2px accent outline.
- **Error / Disabled:** invalid fields take a danger border; disabled fields fade to 60 % with a not-allowed cursor.

### Menus and Tooltips
Dropdown and right-click menus are one data-described list, so the same commands appear in the same words: a raised surface, 8px radius, hairline, 4px inset, Mid shadow, a 200ms fade. Items are 4px-rounded rows with a 16px icon column, highlighted with Hover Wash, hints and shortcuts right-aligned in Ink Subtle. Tooltips invert the theme (Ink background, Paper text) with keys inside.

### Navigation
- **Sidebar:** icons with labels, or a rail of icons; the active route sits on the accent tint. In Simplified UI its group separators disappear and a softened divider runs beside it.
- **Tabs:** 14px medium muted labels; the active tab turns Ink with a 2px accent underline. In narrow panels, icon tabs show names only as space allows.
- **Note tab strip:** 32px tabs rounded at the top. The selected tab takes the page's paper so it joins the note beneath; in Simplified UI it loses its outline and the strip sits on the surface at 40px, level with the Files pane header. With two panes, the active pane's strip carries a 2px accent line along its top.

### File Tree (signature)
The Files pane is the densest surface and the clearest expression of Simplified UI. Rows are 26px, inset 6px from the pane's edges as 8px-rounded pills, names at 0.8125rem in Ink Muted; folders keep only their chevron, notes and folders have no icons, attachments show their name and a small upper-case file-type tag on the sunken well. One 1px indent guide per containing folder joins from row to row. The open note's row is the accent tint with Ink text at medium weight; hover is Hover Wash; keyboard focus is an inset 2px ring. The full path shows on hover. Standard keeps 28px full-width rows with icons.

### Note Status Chip
In Simplified UI, save status and word count sit in a small chip in the note's bottom-right corner: 12px text, the surface at 90 % opacity, 8px radius, the Low shadow, ignoring the pointer.

## Do's and Don'ts

### Do:
- **Do** keep Manuscript (warm paper and forest green) the default palette and Simplified UI the default interface.
- **Do** add a palette only as overrides of the neutral and accent tokens for both themes, and only once every pairing passes the WCAG AA test.
- **Do** draw new frames with the chrome tokens so they follow Simplified UI, and reach for the `simplified:` variant only for the few styles that genuinely differ.
- **Do** offer the same controls in Simplified and Standard; an end-to-end test compares them.
- **Do** keep the interface at 14px and 26-36px rows and controls; density is how the student sees more material.
- **Do** let the caret, selection, scrollbars, focus rings, desktop title-bar buttons and graph canvas follow the palette.
- **Do** keep every motion on the duration tokens (120ms for hover and state, 200ms for overlays), which fall to 0ms under reduced motion.

### Don't:
- **Don't** hide a feature to make a screen look calmer.
- **Don't** add whitespace that shows less content.
- **Don't** turn Manuscript's default palette into a generic grey; the neutral greys belong to Graphite.
- **Don't** use saturated backgrounds; colour fills are tints, and the accent fills only buttons and small marks.
- **Don't** remove a separator where panes would then blur together.
- **Don't** let a palette change a status, mastery or graph colour.
- **Don't** put a shadow on anything that does not float.
- **Don't** break keyboard operation or contrast for the sake of quieter chrome.
