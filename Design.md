# Design.md — Visual Design System

## 1. Design Principles

- **Modern, sleek, minimalist** — generous whitespace, few borders, flat surfaces, no unnecessary shadows or gradients.
- **Warm but professional** — the yellow/brown palette should feel warm and approachable without tipping into playful or juvenile; this is still a tool handling HR, performance, and financial data.
- **Clarity over decoration** — this is a data-dense operations tool; managers need to scan and act fast. Brand color is used purposefully (accents, CTAs, active states), not everywhere.
- **Status at a glance** — a separate, consistent status color set (not the brand palette) is used for red/yellow/green alerts, workload, and task status, so brand color and status color never get confused.

## 2. Theme

- **Light theme only for v1** (dark mode deferred to a later phase, but color tokens below are written as CSS variables so dark mode can be added later without a redesign).
- Base is a warm off-white/cream background rather than stark white, to work with the brown/yellow brand palette.
- **Two palettes, one token set.** The marketing site and auth pages (`app/(marketing)`, `app/(auth)`) use the palette in section 3 below. The authenticated dashboard (`app/(dashboard)`) uses a separate yellow/white/black theme — see "Dashboard Theme Override" at the end of section 3 — applied by a `.dashboard-theme` class on the dashboard shell's root element in `app/(dashboard)/layout.tsx` rather than by touching `:root`. Every token name is identical between the two; only the values differ per scope, so no component needs to know which palette it's rendering in.

## 3. Color Palette

### Brand Colors

| Token                | Hex       | Usage                                                        |
| -------------------- | --------- | ------------------------------------------------------------ |
| `brand-yellow`       | `#F2B705` | Primary CTAs, active nav item, key highlights, chart accents |
| `brand-yellow-hover` | `#D9A400` | Hover state for yellow buttons/links                         |
| `brand-yellow-light` | `#FDF3D7` | Subtle highlight backgrounds, selected tab/row background    |
| `brand-brown`        | `#4A3A2C` | Headings, primary text on light surfaces, sidebar background |
| `brand-brown-soft`   | `#7A6653` | Secondary text, icons, muted labels                          |
| `brand-brown-light`  | `#C9B8A4` | Borders, dividers, subtle UI accents                         |

### Base / Neutrals

| Token            | Hex       | Usage                                                       |
| ---------------- | --------- | ----------------------------------------------------------- |
| `background`     | `#FFFBF2` | Page background — warm off-white/cream                      |
| `surface`        | `#FFFFFF` | Cards, panels (pure white to lift off the cream background) |
| `surface-muted`  | `#F5EFE3` | Secondary panels, table header background                   |
| `border`         | `#E9DFCB` | Dividers, card borders — warm neutral, not grey             |
| `text-primary`   | `#2E2317` | Main text (deep brown-black, not pure black — keeps warmth) |
| `text-secondary` | `#8A7A66` | Secondary/meta text                                         |

### Status Colors (kept separate from brand palette — never overlap with yellow/brown)

| Token     | Hex       | Meaning                                                                                             |
| --------- | --------- | --------------------------------------------------------------------------------------------------- |
| `success` | `#2F9E44` | On track, approved, green alerts                                                                    |
| `warning` | `#E8590C` | At risk, pending — warm orange, distinct from brand yellow so alerts don't blend into brand accents |
| `danger`  | `#D64545` | Overdue, overloaded, rejected, red alerts                                                           |
| `info`    | `#3B6E91` | Informational, neutral status — muted teal-blue for contrast against the warm palette               |

### Workload Indicator Scale

| Range    | Color              |
| -------- | ------------------ |
| 0–50%    | `success` (green)  |
| 51–80%   | `warning` (orange) |
| 81–100%+ | `danger` (red)     |

> Rule: brand yellow/brown is never reused to signal status (success/warning/danger). This avoids ambiguity between "this is a brand accent" and "this needs your attention."

### Dashboard Theme Override

The dashboard (`app/(dashboard)/**`) replaces the brand and base tokens above with a bold yellow/white/black identity, set in `app/globals.css` under the `.dashboard-theme` class rather than `:root`. The token *names* are unchanged — `brand-yellow`, `brand-brown`, `background`, `sidebar`, etc. — only the values differ, so this section only lists what's different from section 3 above. Status colors (`success`/`warning`/`danger`/`info` and their `-text` pairs) are untouched here: they stay out of the brand palette in both themes.

| Token                | Hex       | Usage                                                                     |
| --------------------- | --------- | -------------------------------------------------------------------------------- |
| `brand-yellow`        | `#FFCC00` | Primary CTAs, active nav item (solid fill), chart accent                         |
| `brand-yellow-hover`  | `#E6B800` | Hover state for yellow buttons/links                                             |
| `brand-yellow-light`  | `#FFF3B0` | Highlight backgrounds, selected tab/row, nav hover                               |
| `brand-brown`         | `#000000` | Repurposed, not renamed — this is still the "heading / primary text" slot, now literally black |
| `brand-brown-soft`    | `#3F3F3F` | Secondary text, icons, muted labels                                              |
| `brand-brown-light`   | `#E4E4E4` | Borders, dividers                                                                 |
| `background`          | `#FFFFFF` | Page background                                                                   |
| `surface`             | `#FFFFFF` | Cards, panels                                                                     |
| `surface-muted`       | `#FAFAF6` | Secondary panels, table header background                                        |
| `sidebar`             | `#FFFFFF` | Sidebar surface — white, same as the page. Yellow is reserved for the active nav item and accents rather than filling the whole rail, so a data-dense ops tool stays calm (section 1, "clarity over decoration") instead of reading as a wall of yellow. `border-r` (using `border`) separates it from `<main>` now that both are white. |

Contrast re-verified for this palette specifically (WCAG relative-luminance formula, not spot-checked): black and `brand-brown-soft` both clear AA on white, `surface-muted` and `brand-yellow-light`; the existing darkened `success-text`/`warning-text`/`danger-text`/`info-text` pairs (section 10 explains why they exist) clear 4.5:1 against white, `surface-muted` and `brand-yellow-light` too (4.62–5.49:1) — they were never re-picked, just re-checked. They do **not** clear AA against solid `brand-yellow` (~3.4–3.6:1), so status badges/text stay on white or `surface-muted`, never painted directly on the raw yellow fill — which matches how they're already used (task/status badges sit on cards, not on the sidebar).

## 4. Typography

- **Font family:** `Inter` (system-ui fallback) — clean, geometric, highly legible for dense UI and data tables; pairs well with a minimalist warm palette.
- **Headings:** Inter, Semibold — color `brand-brown` (`#4A3A2C`)
- **Body:** Inter, Regular/Medium — color `text-primary`

| Style      | Size | Weight         | Usage                              |
| ---------- | ---- | -------------- | ---------------------------------- |
| Display    | 32px | Semibold       | Landing page hero only             |
| H1         | 24px | Semibold       | Page titles                        |
| H2         | 20px | Semibold       | Section headers                    |
| H3         | 16px | Semibold       | Card titles                        |
| Body       | 14px | Regular        | Default text                       |
| Small/Meta | 12px | Regular/Medium | Timestamps, labels, secondary info |

- Letter-spacing kept tight/default (no wide tracking) to keep the minimalist feel.
- One typeface family throughout the product — no decorative or script fonts anywhere.

## 5. Spacing & Layout

- Base spacing unit: **4px** grid (Tailwind default scale)
- Generous whitespace: card padding 20–24px, section gaps 32px+ on the landing page
- Card padding (app): 16–24px
- Page max content width: 1280px, centered, with a fixed left sidebar (240px, `brand-brown` background with cream/white text) for app navigation
- Landing page: full-width sections with a centered 1200px content container
- Consistent 8px gap between related elements, 24px between distinct sections

## 6. Components (via shadcn/ui, themed to palette above)

- **Cards:** flat, minimal — thin `border` (1px, `#E9DFCB`), no heavy shadow (`shadow-sm` at most), `rounded-xl` (~12px) for a soft modern feel
- **Buttons:**
  - Primary: filled `brand-yellow` background, `brand-brown` text (high contrast, on-brand)
  - Secondary: outline in `brand-brown-light`, `brand-brown` text
  - Destructive: filled `danger`
  - Ghost: text-only, `text-secondary`, for low-emphasis actions
- **Badges/Pills:** used for task/request/workload status — always the status palette (never brand yellow/brown), paired with a text label for accessibility. One shared pill (`components/dashboard/status-pill.tsx`) owns the markup — `surface-muted` fill, full radius, 12px medium label in a darkened `*-text` token, a 6px dot in the matching fill hue — and each module declares its own vocabulary as a `PillStyle` map beside its feature (employees, hiring). A new status set inherits the shape and the contrast floor; it never re-invents them
- **Tables:** no zebra striping; `surface-muted` header row, thin `border`-bottom row separators, sticky header on scroll
- **Charts (Recharts):** workload bars and performance trends use the status palette; any "neutral" data series (e.g., task volume over time) uses `brand-yellow` as the single accent color
- **Sidebar (app shell):** `brand-brown` background, white/cream text, active item highlighted with a `brand-yellow` left-border or a filled `brand-yellow-light` background with `brand-brown` text
- **Modals/Drawers:** side drawer for quick task/employee detail; modal for confirmations and short forms — `surface` background, `border` outline, no heavy backdrop blur (keep it minimal/flat)

## 7. Iconography

- **Icon set:** Lucide (pairs natively with shadcn/ui) — outline style, 1.5px stroke, consistent sizing (16px inline, 20px nav)
- Icons colored `text-secondary` by default; `brand-yellow` or status colors only when the icon itself is conveying meaning (e.g., an alert icon)
- Icons used sparingly — nav, status indicators, empty states — not decoratively inside body copy

## 8. Landing / Marketing Page Specific Guidance

**Direction (redesigned; surface brief `.impeccable/surfaces/app-marketing-page-tsx.md`).** The marketing site (`app/(marketing)/**`, `components/marketing/**`) is staged as a team roster board rather than a generic SaaS hero-plus-screenshot layout: every capability, plan tier, and proof point is a bordered lineup card, dramatizing the product's real differentiator (a live computed workload %) instead of a stock feature list.

- **Palette/type, committed at page scale.** Same warm tokens as section 3 (cream `background`, `brand-brown` ink, `brand-yellow` accent), but color and type now commit at page scale rather than sitting as accents: `brand-yellow` fills whole card backs and the stats band's digit glow, not just buttons; the hero headline runs `text-5xl` to `text-7xl` (Tailwind's own scale, not the shared `--text-display` token — that token is still 32px and still used by the pricing price figure, so it was left untouched) with tight tracking. `--text-h1`/`h2`/`h3`/`body`/`meta`/`display` are all unchanged; only Tailwind's built-in larger sizes are newly used here.
- **Card frame.** A "trading card" rule: `border-2 border-brand-brown rounded-lg` (bolder tier: `border-brand-brown-light` for lower-emphasis cards), replacing the old borderless flat card. Used for feature tiles, roster cards, pricing tiers, and the testimonial ghost slots.
- **No eyebrows.** `SectionHeading` no longer renders a kicker/eyebrow line above its title — the heading carries its own weight at a bold display scale instead. Do not reintroduce a small-caps label floating above a section heading anywhere on this site.
- **Hero visual.** `components/marketing/roster-cards.tsx` — an asymmetric 3-card bento of "lineup cards" (a person, a live workload %, a status dot, using the existing status palette), replacing the flat dashboard-screenshot mock. Same "no stock photography of people" rule as before.
- **Features.** Two larger "starter" cards for the differentiating modules (Workload intelligence, Performance tracking), each with an inline mini status-bar visualization, above a denser grid of smaller "bench" cards for the rest — an intentionally asymmetric bento, not seven identical icon+heading+text tiles.
- **Stats band.** `components/marketing/stats-band.tsx` + `stat-counter.tsx` — a `bg-brand-brown` band (same dark surface `CtaBand` already uses) of glowing amber digit counters that count up once scrolled into view (`prefers-reduced-motion` shows the final value immediately, no animation). Every number is a real, structural product fact (module count, role count, steps to launch, % of queries tenant-scoped) — never a fabricated usage/customer metric; PRD.md and PRODUCT.md are explicit that no real customer numbers exist yet.
- **Testimonials.** Still an honest empty state (no invented quotes) — now styled as open roster slots: a dashed 2px `brand-brown-light` card rather than a solid skeleton-loader card, so an empty slot reads as "not filled yet" rather than "still loading."
- **FAQ.** Same accordion pattern, `brand-brown` question text (now bold, no longer using the shared `text-h3` token — a marketing-only type choice), `text-secondary` answer text, `border-2` dividers; the first question is open by default rather than every item starting collapsed.
- **Nav.** `SiteHeader`'s links render as a bold tracked "tab strip" with a `brand-yellow` underline that fills in on hover, rather than plain text links.
- **Login page:** unchanged from the original guidance — centered card on a cream background; the two paths ("Company Login" / "Employee Login") shown as two clearly labeled tabs or side-by-side buttons at the top of the card, `brand-yellow` for the active/selected path.

## 9. Alerts & Notification Styling

- Early-warning panel uses a simple traffic-light list format:
  - 🔴 Red = urgent/overdue
  - 🟠 Orange = needs attention soon
  - 🟢 Green = healthy/on track
- Toast notifications: top-right, flat style with `surface` background + thin colored left-border matching status (not a full-colored background), auto-dismiss after 4s for success, persistent for errors until dismissed

## 10. Accessibility

- Minimum contrast ratio AA (4.5:1) for all text — verified specifically for `brand-brown` on `brand-yellow` (used for primary buttons) and `text-secondary` on `background`
- Never rely on color alone to convey status — always pair with text/icon
- All interactive elements keyboard-navigable and focus-visible (focus ring in `brand-yellow` at 2px offset)

## 11. Empty & Loading States

- Empty states include a short friendly message + a clear primary (`brand-yellow`) action (e.g., "No tasks yet — Create your first task")
- Loading states use skeleton loaders (matching the shape of the content, in `surface-muted` tone), not spinners, for dashboard widgets and tables

## 12. Public, Company-Branded Surfaces (scoped `--file-*` tokens)

WorkPulse shows one class of page to people who have no account and never will: the applicant-facing surface at `/{companySlug}/recruitmentform`. It is inside this visual world, not beside it — it takes the marketing/auth palette of section 3, not the dashboard override of section 3's tail — but it is the *company's* sheet rather than WorkPulse's, so its accent is the company's own `Company.brandColor` resolved at request time.

**The Surface-Root Scoping Rule.** A palette that only one surface needs is declared on that surface's own layout root, never on `:root`. The dashboard does this with the `.dashboard-theme` class (section 2); the applicant surface does it with a `--file-*` custom-property set as an inline style on `app/[companySlug]/recruitmentform/layout.tsx`. Either way the global tokens stay untouched, and nothing outside the scope can inherit a value meant for one page.

| Token              | Value                    | Relation to section 3        | Usage                                                          |
| ------------------ | ------------------------ | ---------------------------- | -------------------------------------------------------------- |
| `--file-paper`     | `#FFFBF2`                | `background`                 | The sheet the whole surface is drawn on                        |
| `--file-head`      | `#4A3A2C`                | `brand-brown`                | Section headings and field labels                              |
| `--file-ink`       | `#2E2317`                | `text-primary`               | Body, fact values, answers, input text                         |
| `--file-muted`     | `#7A6653`                | `brand-brown-soft`           | Help text, meta, uppercase labels, footer                      |
| `--file-rule`      | `#E9DFCB`                | `border`                     | Every rule, divider and control stroke                         |
| `--file-required`  | `#B03A3A`                | near `danger`, darkened      | The required marker and inline field errors                    |
| `--file-accent`    | `Company.brandColor`     | runtime, per company         | Primary action, focus, completeness, selection                 |
| `--file-on-accent` | `readableTextOn(accent)` | computed                     | Text and glyphs sitting on the accent fill                     |

**The Muted-Ink Floor Rule.** On the cream ground, `text-secondary` (`#8A7A66`) measures ~4.2:1 and misses the AA floor section 10 requires. Secondary text on cream uses `brand-brown-soft` (`#7A6653`, ~5.3:1) instead. This is the same correction `--muted-foreground` already carries in `app/globals.css`; `--file-muted` is it stated as a token. Section 3's `text-secondary` row is the value that is wrong, not this one.

**The Computed Foreground Rule.** When a color enters the product at runtime — an owner picking a brand color from a plain color input, with no contrast check attached — the foreground on it is computed, never assumed. `readableTextOn()` in `lib/recruitment.ts` takes WCAG relative luminance and returns `#2E2317` or `#FFFFFF`, so a dark brand and a pale brand both land readable. No surface hardcodes text on an accent it did not choose.

### Form language on the applicant surface

- **Ruled bands, not cards.** Sections are separated by a 1px `--file-rule` top border and vertical rhythm, and fields within a section by `divide-y` on the same rule. The page reads as one continuous sheet. The only card on the surface is the contents rail — flat, white, 1px `--file-rule`, `rounded-xl` (12px), 20px padding, exactly section 6's card language.
- **Controls are sized to their content class, not to the column.** Date and number 13rem, phone 20rem, name 26rem, email and dropdown 28rem, short text 34rem; long text and choice lists take the column. A four-digit answer in a 34rem box tells the applicant the wrong thing about what is wanted.
- **Attachments dock as named items.** A file already chosen appears as a row with its name, its size and a remove control, and is listed again in the rail under "Attached". No dashed drop-zone rectangle, and no native `Choose File / No file chosen` chrome — the real input stays underneath, `sr-only`, with a drawn label over it.
- **Focus on this surface is the accent, not brand yellow.** `focus-visible` sets the control's border to `--file-accent` and a 2px ring of the accent at 40%. Section 10's rule is a visible 2px focus indicator in the surface's accent; on the applicant page that accent is the company's.
- **Mobile.** Below `lg` the contents rail collapses to a fixed bottom bar carrying the answered-of-required count and the submit. Only one submit and only one progress readout are ever on screen at once.

### Don't, on public surfaces

- **Don't** introduce a second palette here. Everything but `--file-accent` is section 3's marketing/auth palette under a local name.
- **Don't** place a small muted label directly above a heading as a kicker or eyebrow. Where the company's name has to appear above the role title, it sits on its own ruled letterhead band, separated by a rule — a band, not a label the title carries.
- **Don't** paint status color or brand yellow onto this surface. The company's accent is the only accent; status color stays in the dashboard (section 3).
