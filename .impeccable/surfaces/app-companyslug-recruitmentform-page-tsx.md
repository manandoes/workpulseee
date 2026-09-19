---
version: 1
slug: "app-companyslug-recruitmentform-page-tsx"
primary_target: "app/[companySlug]/recruitmentform/page.tsx"
related_targets: ["components/recruitment"]
---

Scope: the public, unauthenticated applicant surface at `/{companySlug}/recruitmentform` (and `/{companySlug}/recruitmentform/[formSlug]` for a company running more than one opening). Visitor mode: Operate — a stranger completing one task, once, usually on a phone, with no account and no support path.

Audience and job: a job applicant who arrived from a link the company sent. Their job is to understand what they are applying for, answer a variable-length set of questions the company authored, attach a resume, and leave certain it arrived. Constraints: no login, one attempt, unknown device, a 5 MB per-file cap, and a MIME allowlist that excludes HTML and SVG.

Related internal surface: `/hiring` and its children inside the dashboard are an ordinary extension of the established dashboard world and inherit it — no separate direction, no DESIGN.md change.

## Direction contract

THESIS: The application is the document the reviewer will open, assembled in front of the applicant as they answer. It refuses the category default of a centered card floating on a tinted hero — that arrangement makes an application feel like a newsletter signup and tells the candidate nothing about what they are producing.

OWN-WORLD: WorkPulse's marketing/auth palette, re-tinted at runtime by the company's own `brandColor` — warm paper ground `#FFFBF2`, white file surface, `#4A3A2C` heads, `#E9DFCB` rules, the company's accent carrying only the primary action, focus, and completeness. Inter throughout, one family, fixed rem scale. Sections are ruled bands on paper, not cards; attachments dock as named items with size and type, never as dashed drop-zone rectangles. No nested cards, no gradients, no glass.

STORY: The candidate lands already inside the file, understands the role from a facts strip rather than a pitch, answers straight down, watches the contents rail fill, and submits knowing exactly what was sent. The close states what happens next in the company's own words.

FIRST VIEWPORT: A calm header band carries the company mark and the role title at h1 scale, with a one-line role summary. Directly beneath, a labeled facts strip (team, location, employment type, posted date) in small caps-height labels over plain values. The file's first section opens immediately below at 8/12 width — no scroll needed to reach the first question. A 4/12 right rail lists every section with answered-versus-required counts and holds docked attachments; the primary submit sits at the rail's foot in the company accent. On mobile the rail collapses to a sticky progress bar above the submit.

CITED DEVIATIONS: FIRST VIEWPORT names the facts strip as "team, location, employment type, posted date". The build ships the close date in the posted date's slot, deliberately: an applicant deciding whether to start a twenty-minute form is served by when it shuts, not by when it opened, and `HiringForm.closesAt` is also what `isAcceptingApplications` enforces, so the strip states a fact the page acts on. Posted date remains available on `publishedAt` if it is ever wanted alongside.

FORM: The Application File — candidate 6 of 7 on the ordered grounded list, dealt as the lead by seed key `873b7006`, locked by the user, code-led.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
