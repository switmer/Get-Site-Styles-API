# site-spec pack — consumer contract (v0.1 draft)

**Discipline rule.** The pack is a product surface, not a file dump. Every file must communicate status honestly, even when its status is "we can't do this." Silent absence is the failure mode this contract exists to prevent.

## What the pack is for

A site-spec pack is a synchronized projection of a single extraction run, split into five files by the *question each file answers*. The split exists because a monolithic `DESIGN.md` over uneven evidence hides the evidence gradient — a well-formatted 500-line doc implies uniform coverage. Five files with explicit per-file status signal which questions the extraction can answer and which it cannot.

## Required files

Every pack contains five files. Every file always exists. A file that cannot be filled is a **refusal stub** — it still exists, and its frontmatter says `status: refused`.

| File | Question answered | Current readiness |
|---|---|---|
| `DESIGN.md` | What does it feel like? | ready |
| `STRUCTURE.md` | What is it made of? | refusal stub — no structural extractor |
| `COMPONENTS.md` | What are its building blocks? | refusal stub — no geometry extraction |
| `IMPLEMENTATION.md` | How do I build it? | partial — adapter-oriented |
| `CAVEATS.md` | What don't we know? | always ready |

## Required frontmatter

Every file, full or refused, opens with:

```yaml
---
file: DESIGN.md
file_role: style and token system
canonical_hash: sha256:…
generator_version: site-spec-formatter/0.1
generated_at: 2026-04-20T23:45:00Z
sampled_urls:
  - https://onroster.io
status: full | partial | refused
score: 0.62
threshold: 0.6
---
```

Five of these fields — `canonical_hash`, `generator_version`, `generated_at`, `sampled_urls`, and (by definition) the extraction they describe — are **identical across all five files of a pack**. That is what makes them a pack, not five independent documents.

### Field definitions

- `file` — filename, for self-reference.
- `file_role` — short phrase naming the file's job.
- `canonical_hash` — sha256 of the analysis artifact this pack was derived from. Pack files with differing `canonical_hash` values are drift, not a pack.
- `generator_version` — name + semver. Lets downstream consumers invalidate caches safely.
- `generated_at` — ISO-8601 timestamp.
- `sampled_urls` — list of URLs the extraction touched. Surfaces homepage bias.
- `status` — one of `full`, `partial`, `refused`. A consumer must check this before citing the file.
- `score` — per-file evidence score, 0..1.
- `threshold` — per-file refusal threshold.

### Status derivation

```
score >= threshold           → full
threshold/2 <= score < threshold → partial
score < threshold/2           → refused
```

## Per-file scoring

Each file has its own score because evidence classes differ. A site can be strong on design and empty on structure; one scalar cannot capture that.

| File | Score inputs | Threshold |
|---|---|---|
| `DESIGN.md` | non-overlay palette size, fontFamilies+fontSizes (clamped per-term), radii presence, spacing values, role coverage | 0.6 |
| `STRUCTURE.md` | DOM capture availability, breakpoint sampling count, ARIA extraction | 0.5 |
| `COMPONENTS.md` | component-geometry extraction, button semantic analysis, state extraction | 0.5 |
| `IMPLEMENTATION.md` | adapter CSS present, roles-bound fraction, palette health | 0.5 |
| `CAVEATS.md` | constant 1.0 — listing what we don't know requires no substrate | n/a |

The specific formulas live in the generator and are versioned with `generator_version`. If a formula changes, the version bumps.

## Refusal stub format

Every refusal stub answers the same four questions, in this order:

1. **What this file is supposed to describe.** The scope it would fill if substrate allowed.
2. **Why this file is refused.** The specific extractor or evidence gap.
3. **What evidence was missing.** A concrete list of inputs that would have changed the answer.
4. **What would improve it.** Named extractor work or input changes that would flip the status.

A refusal stub without "what would improve it" is decoration. Consumers use question 4 to decide whether the gap is closable or fundamental.

## File scopes

### DESIGN.md — style/token system
Colors, typography, spacing, radii, role bindings. Observational statements only. No prescriptions, no "do's and don'ts," no "visual theme" vibe synthesis. Overlay values are withheld from role tables and redirected to CAVEATS.md with invalidation reasons.

### STRUCTURE.md — layout and composition
Responsive behavior across breakpoints. Route-level composition. Semantic landmarks. State behavior. Off-screen structure. z-order and layered relationships. *Things a screenshot does not convey well.*

### COMPONENTS.md — component primitives
Component families (button, card, input, nav). Known geometry. Known states. Known variants. Colors of components belong in DESIGN.md. **Dimensions** of components belong here.

### IMPLEMENTATION.md — adapter guidance
Role → CSS variable mapping. Adapter CSS pointer. Framework notes. Suggested defaults with `verify` status on every row. Every value labeled as observed, not prescribed.

### CAVEATS.md — truth boundaries
Cross-cutting. What the extraction does NOT contain. Substrate quality signals. Withheld bindings. Coverage limits. How to consume the pack safely.

## What this contract prevents

Four failure modes the one-file design kept exhibiting:

1. **Uniform-coverage illusion.** A well-formatted long doc implies equal confidence across sections.
2. **Silent absence.** When the extractor couldn't produce something, the corresponding section was omitted or padded with prose. Neither registered as a gap to a human reader.
3. **Mixed adapter residue.** Implementation defaults and design observations blurred together.
4. **Unverifiable provenance.** Without a shared canonical hash, pack files could drift independently from the analysis they claim to derive from.

Refusal stubs + per-file scores + shared provenance anchors close all four.

## Not in this contract (yet)

- **Inter-pack diffs.** A `canonical_hash` comparison tool could surface drift across extraction runs. Not shipped.
- **Composition.json sibling schema.** When a structural extractor exists, STRUCTURE.md gets a machine-readable counterpart. Not v1.
- **Pack signatures.** Cryptographic signing of the pack as a unit. Not v1.

## Relationship to `canonical.md`

`canonical.md` describes the GSS ↔ consumer **data** contract (the token graph). `pack.md` describes the GSS ↔ consumer **presentation** contract (the five files). They share the same `canonical_hash` anchor. The pack is a projection; canonical is the source.
