---
version: 1
slug: "app-marketing-page-tsx"
primary_target: "app/(marketing)/page.tsx"
related_targets: ["components/marketing","app/(marketing)/features/page.tsx","app/(marketing)/pricing/page.tsx","app/(marketing)/faq/page.tsx","app/(marketing)/contact/page.tsx","app/(marketing)/privacy/page.tsx","app/(marketing)/terms/page.tsx"]
---

## Direction contract

THESIS: The landing page refuses the standard SaaS-hero-with-dashboard-screenshot arrangement. It is staged as a team roster board — the same object an agency already manages capacity on — where every capability, plan tier, and proof point is presented as a bordered lineup card, dramatizing "who's overloaded, who has bench capacity" as the product's real, unique mechanism (live computed workload %) rather than a generic feature list.

OWN-WORLD: WorkPulse's existing warm palette (cream `#FFFBF2` ground, brand-brown `#4A3A2C` ink, brand-yellow `#F2B705` accent) but committed at page scale, not sprinkled — yellow fills whole card backs and stat-digit glow, not just buttons. Cards carry a 2px solid brand-brown "trading card" rule-frame with a small radius, replacing today's borderless flat cards. Inter throughout, but the display scale is raised hard: 80-96px hero headline, tight tracking (-0.02em), scoreboard-style all-caps small labels in place of soft eyebrows. Two donations from the catalog challengers weighed against this direction: (1) nixie-tube instrument counters — the stats band renders as glowing amber cross-fading digit stacks instead of plain numerals; (2) sticker-album ghost slots — a not-yet-real state (an unfilled plan feature, a placeholder testimonial) renders as a pale dashed-outline ghost card instead of being hidden or invented as real.

STORY: A visiting agency owner lands on a roster of their own team's workload at a glance, scrolls through capability cards presented as roster positions (Employees, Projects, Tasks, Performance, Requests, Financials), hits a computed live stat band (glowing digit counters on real, honest mechanisms — never fabricated user/customer counts), compares pricing tiers styled as league divisions with the middle tier "drafted" (badged), reads the FAQ as a locker-room debrief, and converts through a scoreboard-styled CTA.

FIRST VIEWPORT: Cream ground, full width. Header: wordmark small at left, nav rendered as a horizontal tab strip with a black keyline underline on hover/active, dual login buttons at right. Hero: left ~58% carries a scoreboard-style all-caps label, an 88px two-line brand-brown headline naming the real mechanism, one subhead line, a filled-yellow primary CTA plus a bordered ghost secondary. Right ~42% carries 3 roster cards in an asymmetric bento stack (one tall "starter" card + two smaller stacked cards), each a 2px-bordered rectangle showing a real product concept (a person row, a live workload %, a status dot) — no dashboard screenshot, no generic icon tiles.

FORM: assigned candidate 5 of 7 in my own ranked, audience-grounded list (a staffing/team roster-card board, chosen for an agency-ops B2B audience whose own daily object is a capacity/roster wall) — seed key 24d7a886 — raised by catalog challenger `signals-instruments-nixie-laboratory-counter` (digit-stack stat band) and `pop-culture-shelf-sticker-album-spread` (ghost/empty-state card), both declined outright against the assigned direction but donating one system discipline each per the concept-seed weighing. No image-generation tool is available in this environment, so this build is code-led per protocol (no comp round; ambition carries in this contract's FIRST VIEWPORT and the finish check is behavioral).

FINISH: unreviewed and undocumented is unfinished; this build ends with a self-run finish check against this contract, a DESIGN.md update recording the new marketing-site direction, and every shipping raster carrying its provenance.
