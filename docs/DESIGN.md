# Shopfront Ledger — StoreRate design record

The design decisions behind StoreRate's interface, the reasoning that produced each one,
and the assumptions they rest on.

| | |
| --- | --- |
| **Project** | StoreRate — Roxiler FullStack Intern Coding Challenge |
| **Scope** | Frontend presentation only |
| **Governing document** | `Campus-Roxiler-FSDI-Assessment.pdf` |

---

## Contents

1. [What governs the work](#what-governs-the-work)
2. [Assumptions](#assumptions)
3. [Colour, and two reservations](#colour-and-two-reservations)
4. [Type](#type)
5. [The rating meter](#the-rating-meter)
6. [Screen-level decisions](#screen-level-decisions)
7. [Defects found and fixed](#defects-found-and-fixed)
8. [Considered and rejected](#considered-and-rejected)
9. [How any of this was checked](#how-any-of-this-was-checked)

---

## What governs the work

StoreRate is a submission against a fixed brief. The assessment PDF is the authority on
*what the product does*; every decision recorded here concerns only *how it looks and
reads*. No endpoint was added, no schema changed, and no capability introduced that the
brief does not ask for.

That constraint did real work. It ruled out the most obvious fix for the thinnest screen
in the product, and it settled four later proposals without a design argument being
needed. Both are recorded under [Considered and rejected](#considered-and-rejected).

---

## Assumptions

Everything below is a judgement that could reasonably have gone another way. Each is
stated so a reviewer can disagree with the premise rather than the output.

**01 · The subject is Indian high-street retail.**
The brief names no industry or region. The seed data does: grocers, electronics, books,
fashion and sports shops in Bengaluru, Mumbai, Chennai, Kolkata, Pune, Hyderabad and
Chandigarh. The visual language — enamel-signage green, wide painted lettering, saffron —
is drawn from that world rather than imported from a generic SaaS palette. **If the seed
data is not representative of the intended market, this is the assumption to revisit
first**; the palette's justification goes with it.

**02 · A reviewer reads this product before a user does.**
Choices favour legibility to someone auditing against a checklist: capabilities stay where
they are easy to find, and density is tuned for scanning a register rather than for a
consumer browsing experience.

**03 · The interface is light-only.**
No dark theme was built. The brief does not ask for one, and a second palette doubles the
surface where the two colour reservations could be broken. The tokens are structured so a
dark set could be added in one place.

**04 · Desktop is the primary surface; mobile must not break.**
Layout is composed at 1440px, where an administrator would actually work. Down to 390px no
page scrolls horizontally — wide tables scroll inside their own container instead. This was
measured, not assumed.

**05 · Webfonts may fail to load.**
Archivo and Instrument Sans come from Google Fonts. Both carry real fallback stacks, so a
deployment without network egress degrades to system faces rather than breaking. The
containerised frontend sets no CSP, so nothing blocks them there.

**06 · Two deviations from the brief are intentional.**
The admin listing shows all three roles where the brief says "normal and admin users" — the
store-owner rating requirement needs somewhere to live. And password update is offered to
administrators, who are not listed as having it. Both are supersets that cost nothing;
neither removes anything the brief asks for.

**07 · A store's owner is assigned when the store is created.**
The brief never describes owner assignment, so the flow is inferred: create the owner
account, then the store. There is no way to reassign afterwards. A known limitation,
accepted rather than overlooked.

---

## Colour, and two reservations

Bottle green carries navigation, primary actions and the masthead, on a warm grey-green
ground. The neutrals are biased toward the accent rather than left as pure grey, so the
page reads as one temperature.

| Token | Hex | Use |
| --- | --- | --- |
| `--bottle` | `#0D4F44` | Navigation, primary action, masthead |
| `--paper` | `#E8EBE6` | Page ground |
| `--ink` | `#131A18` | Body text |
| `--saffron` | `#D9901A` | Ratings — **reserved** |
| `--clay` | `#A3392B` | Errors and destruction — **reserved** |

> **Saffron means a rating. Nothing else in the product is saffron.**
> Not a hover state, not a warning, not a highlight. If a score is on screen it is saffron;
> if something is saffron it is a score.

> **Clay means an error or a destructive control. Nothing else is clay.**
> Field errors, the invalid-input border, the alert rule. Never decoration.

### Why reserve two colours at all

The rule is load-bearing rather than tidy. Because saffron and clay are spoken for,
anything else that needs to be told apart has to earn its distinction some other way — and
that forced three decisions that would otherwise have defaulted to colour:

- **Role badges** separate by weight and outline, not by three unrelated hues. Only the
  administrator badge fills, because it is the one role with authority over the others — a
  real distinction rather than a decorative one.
- **The active navigation link** is marked with a white rule instead of a coloured pill,
  since a second green on green would be noise.
- **The store-owner dashboard's headline figure** is green because the average rating *is*
  that page's subject, not because a card needed brightening.

Before this, the interface used a generic blue with green, amber and blue badges assigned
to three roles for no reason a reader could recover. The constraint is what removed that
arbitrariness.

---

## Type

**Archivo**, with its width axis widened, sets the wordmark, page titles, table headings
and figures. A wide grotesque is what painted shop signage looks like, which ties the type
back to the subject rather than to a house style. **Instrument Sans** carries interface
text.

Every numeric column is set in tabular figures, so digits line up down the column rather
than shuffling by glyph width. This matters more here than in most products: the whole
application is a table of numbers.

A third face was considered and cut. Monospace table headings would have read as "ledger",
but monospace headings are a developer-tool cliché, and Archivo's tabular figures already
solved the alignment problem the mono was being hired for. Removing it cost nothing.

The starting point was `'Segoe UI', -apple-system, …` — the Windows system stack. It was
the single loudest signal that the interface was unstyled: every screen announced it before
anything else registered.

---

## The rating meter

A rating is drawn as five segments filled in proportion to the score, with the figure
beside it. It appears in every table, on both dashboards, in the store list, and shrunk to
two pixels tall beneath the wordmark. See `frontend/src/components/StarRating.jsx`.

```
4.14   ████ ████ ████ ████ █░░░     ← fifth segment 14% filled
4.80   ████ ████ ████ ████ ███░     ← fifth segment 80% filled
both   ★★★★★                        ← what five glyphs showed
```

### Why stars went

Removing stars from a star-rating product is the one real risk in this design. The
justification is that the glyphs were already redundant — every star row in the product
printed the numeral beside it — and actively worse than nothing at three jobs:

- they sat off their baseline against the numbers;
- they changed size with the font;
- rounded to the nearest whole star, 4.14 and 4.80 were the same picture.

The meter is exact, holds its size, and forms a column you can read straight down. The
interactive picker keeps five discrete targets and its `radiogroup` semantics, so the mark
changed but the affordance did not.

One consequence is easy to undo by accident: in a right-aligned column the cell grows
leftwards, so a wider rating count drags the bars out of alignment. The count's width is
reserved (`.rating-cell__count`) to prevent it. Verified stable at one, two and three
digits.

---

## Screen-level decisions

**The signed-out pages became a split screen.** A 380px card floated in a 1440×900 field,
leaving roughly two-thirds of the viewport as empty gradient. It now splits: the left panel
states what the product is and demonstrates the meter on three real stores, so the mark is
legible before a reader first meets it in a table. The right panel does the work.

**The masthead is a solid painted band.** Full-bleed bottle green, with the wordmark in
widened Archivo over five saffron segments. It anchors pages that would otherwise float on
an undifferentiated ground, and it puts the product's atom — a rating out of five — in the
identity itself.

**The admin dashboard displays three totals, and says which ones open.** The brief asks for
exactly three figures and nothing else. Rather than pad the page, the figures were enlarged
to carry it. Two of the three lead to a listing and now declare it; **Total ratings** does
not, because no ratings listing exists in the brief. The asymmetry is the information: it
shows which figures you can follow.

**Filters name the column they narrow.** Filter fields carried their name in the
placeholder alone, which vanished the moment anyone typed — leaving a row of filled boxes
with nothing to say which column each one acted on. The label is now set like a table
heading, because that is precisely what it names.

**Sort indicators are drawn, not typed.** The `↕ ↑ ↓` glyphs sat off-baseline and changed
size with the font. They are now CSS carets, which hold their size and position regardless
of what loads.

---

## Defects found and fixed

Found by reading rendered screenshots and measuring the DOM, not by reading source. The
first is a functional bug that predates any design work.

| Defect | Cause | Resolution |
| --- | --- | --- |
| **An administrator could not assign a store owner** — the form claimed no owners existed while three did | The form requested `limit=200`; the validator caps `limit` at 100 and rejects rather than clamps. The 400 left the list empty, which rendered as an empty state | Request the documented maximum. Verified: all three owners populate |
| **Two dashboard figures were blue, one was black** | `.stat__value { color: inherit }`. Two cards were wrapped in a link and inherited the link colour; the third was a `div` and inherited body ink | Set the colour explicitly, so markup no longer decides it |
| **Rating meters drifted out of column** | A two-digit rating count widened a right-aligned cell, pushing the bars 8px left | Reserve the count's width. Verified stable at one, two and three digits |
| **Row heights jumped without visible cause** | Auto table layout let long columns squeeze their neighbours, so name, email and owner all wrapped unpredictably | Explicit column widths. A taller row now means one thing: a long address |
| **A filter label sat out of line with its row** | A native `<select>` and a text input do not resolve to the same intrinsic height | Fixed control height across the filter row |

---

## Considered and rejected

| Proposal | Verdict | Reasoning |
| --- | --- | --- |
| Charts and a leaderboard on the admin dashboard | **Cut** | The brief specifies three totals. Enriching it needs new backend fields, widening the surface a reviewer audits. A thin specification faithfully implemented should not be padded |
| Separate login pages for admin and store owner | **Cut** | Directly contradicts the brief: *"A single login system should be implemented for all users."* It would also leak account roles, breaking a login that answers identically — and at the same speed — for an unknown address and a wrong password |
| Move password change under a profile page | **Cut** | Permitted, but it costs discoverability for a reviewer checking a listed capability, and "profile" invites self-service fields the brief never grants |
| Reassign a store's owner after creation | **Cut** | A real product gap, but the brief never describes owner assignment. Fixing it means a new endpoint for an unstated requirement. Recorded as a known limitation instead |
| Monospace table headings | **Cut** | A developer-tool cliché, and tabular figures already solved the alignment it was hired for |
| Dropping stars for the segmented meter | **Kept** | The one accepted risk. Justified because the numeral was always printed alongside, and because five glyphs cannot distinguish 4.14 from 4.80 |

---

## How any of this was checked

Every screen was captured from the running application by `scripts/capture-screenshots.mjs`
and then looked at. Nothing here rests on reading source and inferring what it would
render.

Alignment claims were measured rather than eyeballed, because eyeballing failed twice:

- A review finding that form cards were badly undersized in their container **dissolved
  entirely on measurement** — the estimate had been read off a screenshot without accounting
  for its 2× device pixel ratio, and the cards were exactly the intended width.
- Another claimed filter inputs lacked accessible labels when every one already carried an
  `aria-label`. The real defect was narrower: no label was *visible*.

Both corrections are in the record deliberately. A design document that lists only the
decisions that survived is not describing how the work happened.
