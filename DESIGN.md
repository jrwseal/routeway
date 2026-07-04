---
name: RouteWay Intelligence
description: Logistics intelligence dashboard for VRP route optimization and carbon footprint tracking
colors:
  fleet-navy: "#1E3A8A"
  fleet-navy-hover: "#1e40af"
  signal-green: "#10B981"
  signal-green-hover: "#059669"
  alert-red: "#EF4444"
  amber-warning: "#F59E0B"
  amber-warning-deep: "#D97706"
  amber-warning-bg: "#FEF3C7"
  route-blue: "#3B82F6"
  route-orange: "#F97316"
  green-bg-tint: "#F0FDF4"
  blue-bg-tint: "#EFF6FF"
  green-bg-tint-solid: "#D1FAE5"
  neutral-canvas: "#F8FAFC"
  neutral-surface: "#FFFFFF"
  neutral-border: "#E2E8F0"
  neutral-border-light: "#F1F5F9"
  neutral-text-muted: "#94A3B8"
  neutral-text-body: "#333333"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: "1.2"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "1.3"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  sm: "2px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.fleet-navy}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.fleet-navy-hover}"
  button-success:
    backgroundColor: "{colors.signal-green}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
    padding: "10px 24px"
  button-success-hover:
    backgroundColor: "{colors.signal-green-hover}"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
---

# Design System: RouteWay Intelligence

## 1. Overview

**Creative North Star: "The Dispatch Console"**

RouteWay Intelligence reads like the console a dispatcher trusts to plan a real fleet's day: dense with numbers that must be scannable and citable, never decorative for its own sake. The system is built around one dominant fleet navy that carries structure and authority, a single signal green reserved for "this is the best number on the row" and confirmed actions, and a flat, bordered surface language that keeps 8-9 rows of algorithm comparison legible at a glance rather than fighting the eye with gradients or glass.

This explicitly rejects generic SaaS-dashboard tropes: no gradient text, no hero-metric-with-gradient-accent cards, no identical icon-heading-text card grids repeated for their own sake, no glassmorphism as decoration. Every visual choice earns its place by making a real operational number easier to read, compare, or trust.

**Key Characteristics:**
- One dominant brand color (Fleet Navy) carrying headings, primary actions, and active nav state
- Signal green is earned, not default — it marks the winning value in a comparison, not "primary" branding
- Flat cards with hairline borders and shadow-sm at rest; elevation increases only for things that float above the page (popups, modals, floating map controls)
- Data density over whitespace-for-its-own-sake — this is a working tool, not a marketing surface

## 2. Colors

The palette is Restrained-to-Committed: one dominant navy carries most chrome and structure, with signal green earning its place only when it means something (best value, success, active/checked state).

### Primary
- **Fleet Navy** (#1E3A8A): headings, primary buttons, active nav item background, table header row, brand wordmark. Carries the bulk of the interface's "voice."
- **Fleet Navy Hover** (#1e40af): hover state for navy buttons/links (e.g. the comparison table's "View" button).

### Secondary
- **Signal Green** (#10B981): the "this is the winning number" color — best-value cell highlighting in Algorithm Comparison, Save/Confirm actions in Fleet Config, on-time delivery status, the 4-wheel truck's category color on the map. Also used as green tints (#F0FDF4 background, #D1FAE5 solid) for gentle "good news" surfaces.
- **Signal Green Hover** (#059669): hover state for green buttons.

### Tertiary
- **Alert Red** (#EF4444): delay/error states only. Never decorative.
- **Amber Warning** (#F59E0B / deep #D97706, background tint #FEF3C7): caution states — capacity approaching limits, waiting-time warnings. Sits between green and red on the urgency scale.
- **Route Blue** (#3B82F6) / **Route Orange** (#F97316): categorical, not semantic — these exist purely to let a user visually tell one truck's route apart from another's on the map and in per-vehicle breakdowns. Never reused for buttons or status.

### Neutral
- **Neutral Canvas** (#F8FAFC): app background.
- **Neutral Surface** (#FFFFFF): card/modal/table backgrounds.
- **Neutral Border** (#E2E8F0) / **Neutral Border Light** (#F1F5F9): hairline dividers, card borders, table row separators.
- **Neutral Text Muted** (#94A3B8): secondary/disabled text, placeholder copy.
- **Neutral Text Body** (#333333): default body text color set at the document root.

### Named Rules
**The Earned Green Rule.** Signal green is never a default accent color. It appears only where it marks a specific winning value, a successful save, or an on-time status. If green shows up on a screen with nothing to compare or confirm, it's misused.

**The Categorical-Never-Semantic Rule.** Route Blue and Route Orange identify a truck's route on the map. They must never be reinterpreted as "info" or "warning" colors elsewhere in the UI — that collision is exactly the kind of accidental meaning-drift that breaks trust in the color system.

## 3. Typography

**Body/Display Font:** ui-sans-serif, system-ui, sans-serif (Tailwind's default sans stack — no custom webfont is loaded; this is a deliberate choice for a tool where legibility across every OS matters more than brand voice in the type itself).

**Character:** Utilitarian and dense. Hierarchy is carried entirely by size and weight contrast, not by font personality — this is a console, not an editorial piece.

### Hierarchy
- **Headline** (700 weight, 1.875rem / 30px, 1.2 line-height): page-level titles ("RouteWay" wordmark, section titles like "Algorithm Comparison").
- **Title** (700 weight, 1.5rem / 24px, 1.3 line-height): modal headers, card section titles.
- **Body** (400 weight, 0.875rem / 14px, 1.5 line-height): default UI copy, table cells, descriptions. Kept compact and dense rather than airy — this is a data tool, most screens are read in short scanning bursts, not long-form reading, so the usual 65-75ch cap doesn't drive layout here.
- **Label** (600 weight, 0.75rem / 12px, 0.02em letter-spacing): table column headers, form field labels, small status badges.

### Named Rules
**The Scan-First Rule.** Every number that feeds a business decision (cost, CO2, distance, truck count) must be at Body weight or heavier and never below 0.875rem — these are the values a user might screenshot into a report.

## 4. Elevation

Flat by default, layered only where something needs to visually float above the page content. This system uses three deliberate elevation tiers rather than a large shadow scale, and each tier is tied to a concrete z-index band already established in the codebase.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)` / Tailwind `shadow-sm`): default for cards, table containers. The vast majority of the UI lives here.
- **Floating** (`shadow-md` / `shadow-lg`): elements that sit above the base layer but within the page flow — the map's Route Filter panel and "View Algorithm" button, dropdown-like surfaces.
- **Overlay** (`shadow-xl`): true overlays — the Fleet Config modal, the routing-parameters modal, and the Algorithm Comparison popup. These also carry the highest z-index tier in the app (Fleet Config at z-[9999], the Comparison popup at z-[9999] to clear the map's floating controls, in-page floating controls at z-[1000]).

### Named Rules
**The Elevation-Equals-Z-Index Rule.** A component's shadow weight must match its z-index tier: resting shadow for in-flow content, floating shadow for above-flow-but-not-modal elements, overlay shadow for anything with a backdrop. Never give a resting-tier card an overlay-tier shadow — it reads as a bug, not a design choice.

## 5. Components

Sharp and confident: clear borders, workhorse 8px radius, shadow used structurally (to indicate stacking order) rather than decoratively.

### Buttons
- **Shape:** rounded-lg (8px radius) on all buttons; icon-only controls (map zoom, close buttons) use rounded-full.
- **Primary:** Fleet Navy background, white text, 10px/20px padding, font-bold. Used for calculation/confirm actions ("คำนวณเส้นทาง", primary CTAs).
- **Success:** Signal Green background, white text — reserved for explicit save/apply actions in Fleet Config ("บันทึกและใช้งานกองรถนี้").
- **Hover:** background shifts to the deeper hover shade (`fleet-navy-hover` / `signal-green-hover`); no scale or shadow change, just color.
- **Ghost/Secondary:** slate-200 background, slate-700 text, used for Cancel/Reset actions ("🔄 ใช้ค่ามาตรฐาน").

### Cards / Containers
- **Corner Style:** rounded-lg (8px) as the default; rounded-2xl (16px) reserved for modals/popups to visually distinguish "floating overlay" from "in-page card."
- **Background:** Neutral Surface (white).
- **Shadow Strategy:** Resting tier (see Elevation). No shadow escalation on hover for static cards.
- **Border:** 1px Neutral Border, always present — borders, not shadows, are the primary tool for separating adjacent cards in a dense layout.
- **Internal Padding:** 24px (`p-6`) standard; comparison table cells use tighter 16px (`p-4`) to preserve data density.

### Inputs / Fields
- **Style:** 1px slate-300 border, rounded-lg, white background, 10px/16px padding.
- **Focus:** border and ring shift to Fleet Navy (`focus:ring-2 focus:ring-[#1E3A8A]`) — no glow or shadow, a clean color-only focus indicator.

### Navigation
- **Style:** vertical sidebar, each item full-width with icon + label. Active state fills the item with Fleet Navy background and white text; inactive items are transparent with slate-700 text and a subtle slate-100 hover fill. Disabled items (e.g. "Algorithm Comparison" before any comparison exists) are visually muted and non-interactive.

### Comparison Table (signature component)
The core interaction surface. Header row is solid Fleet Navy with white label-weight text. Best-value cells per column get a Signal Green background tint with bold green text — the single strongest visual signal in the entire app, deliberately reserved for this one meaning. Alternating row backgrounds (white / slate-50) aid horizontal scanning across 8 columns without needing gridlines.

## 6. Do's and Don'ts

### Do:
- **Do** reserve Signal Green exclusively for "winning value," "on-time," or "confirmed save" — never as decoration or a default accent.
- **Do** match shadow tier to z-index tier: resting for in-flow cards, floating for above-flow controls, overlay for true modals/popups (see The Elevation-Equals-Z-Index Rule).
- **Do** keep every cost/CO2/distance number at Body weight (0.875rem) or larger — these values get screenshotted into reports.
- **Do** use borders, not shadows, to separate adjacent cards in dense layouts.
- **Do** use rounded-lg (8px) as the default corner radius; reserve rounded-2xl for true overlays only.

### Don't:
- **Don't** use gradient text or gradient-accented "hero metric" cards — explicitly rejected per PRODUCT.md's anti-references.
- **Don't** build identical icon+heading+text card grids as a default layout pattern.
- **Don't** use glassmorphism decoratively; the app has zero backdrop-blur-as-aesthetic usage today and should stay that way.
- **Don't** reuse Route Blue or Route Orange (the per-vehicle map colors) as semantic info/warning colors elsewhere — that's a meaning collision (see The Categorical-Never-Semantic Rule).
- **Don't** reach for a modal as the first instinct for new features; the Algorithm Comparison popup and Fleet Config modal exist because they're genuinely overlay-shaped tasks, not because modals are the default affordance.
- **Don't** encode delivery status with color alone — always pair with a text label or icon (existing On-Time/Delayed pattern) to hold WCAG AA and not rely on color perception.
