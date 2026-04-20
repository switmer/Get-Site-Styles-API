# canonical.json — GSS ↔ consumer contract (v0.1 draft)

**Discipline rule.** Every field below must satisfy at least one of:

- A concrete consumer reads it today (DCP writing DESIGN.md; adapter emitting CSS).
- A concrete failure mode it prevents (refusal floor, unmapped site roles, per-candidate validity).
- A concrete comparison it enables (substrate score, extractor version, coverage).

No speculative fields. The schema grows only on demand.

## What the contract is for

`canonical.json` is the smallest typed, provenanced, validity-tagged token graph that any downstream consumer of GSS needs, and nothing else.

It carries **candidates**, not resolutions.
It carries **evidence**, not interpretation.
It carries **observation coverage**, not site-wide authority claims.

It is a description layer, not a decision layer. Semantic resolution, narrative synthesis, adapter projection, and policy decisions happen downstream.

## Per-token schema

```json
{
  "id": "string — stable across runs",
  "valueResolved": "string — the literal a browser would see",
  "valueSymbolic": "string | null — preserved expression for clamp, color-mix, unresolved var chains",
  "class": "discrete | scale | fluid | component | layout",
  "provenance": [
    {
      "basis": "named-variable | computed-style | alias-resolved | convention-match",
      "evidence": "string — human-readable anchor",
      "weight": "number 0..1"
    }
  ],
  "saliency_inputs": {
    "refCount": "integer",
    "aliasDepth": "integer",
    "contextBreadth": "integer — distinct CSS-selector contexts",
    "surfaceDiversity": "integer — distinct component-family contexts"
  },
  "roleCandidates": [
    {
      "role": "string — dictionary URI, e.g. shadcn/v1#bg.default",
      "confidence": "number 0..1 — evidence-weighted",
      "validity": "number 0..1 — rule-based plausibility for this token as this role",
      "basis": "string — why this candidate"
    }
  ]
}
```

### id

Stable across runs. For named variables, the variable name (`--primary-accent`). For literals, `literal:${sha1(normalized_value + primary_context_class)}` truncated to 10 hex chars. A literal extracted from a second run must produce the same id, or diffs and caching become unreliable.

### valueResolved vs valueSymbolic

Adapters need the literal (you can't project `clamp(1rem, 2vw, 2rem)` into an HSL variable). Canonical consumers need both. If the token is a plain literal, `valueSymbolic` is null. If it's a `clamp()`, `color-mix()`, `var(...)` chain, or any expression that carries design intent not captured by its resolved value, preserve the expression string.

> **v1 limitation:** `valueSymbolic` is a string. The symbolic form is load-bearing for fluid and relational tokens, and a string is marginally better than discarding it — but a stringified clamp loses the structural information that motivated preserving it. **v2 should upgrade** `valueSymbolic` to a structured AST (`{fn: "clamp", args: [...]}`) when a consumer needs to reason over the expression. Flagged here so v1 isn't mistaken for final.

### class

Five kinds. Collapsing them into one bucket loses the type signal DESIGN.md synthesis needs.

- **discrete** — palette entries, font families. Finite set. Role-bearing.
- **scale** — type sizes, spacing steps, radii. Ordered, relational.
- **fluid** — `clamp()`, breakpoint-dependent. A function, not a value.
- **component** — bound to a component primitive (button padding, card radius).
- **layout** — structural (container max-width, nav height, section rhythm).

### provenance

A DAG, not a flat source tag. A single token can simultaneously be a named variable declaration, a frequently-computed style, and an alias-resolved target of another variable. Flattening to one source loses the conflict-resolution signal consumers need.

`weight` is a combiner input, not an already-combined scalar. A shared combiner library function (shipped with the contract) reduces the DAG to a single confidence score per role candidate. That function is the *only* place weights get collapsed.

### saliency_inputs

Raw measured inputs, not computed scores. Consumers (or a shared library function) compute saliency. Storing both the inputs and the computed score invites drift.

- `contextBreadth` — distinct CSS-selector contexts the token appears in.
- `surfaceDiversity` — distinct component-family contexts (nav, button, card, form, footer, etc.). 12 contexts all inside `<button>` is not the same as 12 contexts across nav/card/form/footer.

### roleCandidates

**Plural, with per-candidate validity.** Canonical does not pick one. Role resolution is policy and lives in the semantic layer.

Validity is an *edge* property on `{token, role}`, not a node property on the token. `rgba(0,0,0,.5)` is perfectly valid as an overlay, invalid as `bg.default`. This is the shape that prevents the `bg.default = rgba(0,0,0,.5) @ 0.73` pathology — the extractor surfaces both the candidate and its low validity for that role, and the downstream resolver can refuse to pick it.

The `role` field is a dictionary URI, not an enum value. See `roleDictionary` below.

## Top-level schema

```json
{
  "contractVersion": "0.1.0",
  "extractorVersion": "string — GSS version + ruleset version",
  "roleDictionary": "string URI — e.g. shadcn/v1",
  "coverage": {
    "urls": ["string"],
    "routes": ["string"],
    "sampledAt": "ISO timestamp",
    "sampleBias": "homepage-only | multi-route | full-crawl",
    "estimatedFraction": "number 0..1 | null"
  },
  "substrateScore": "number 0..1",
  "outcome": "full | partial | refused",
  "refusal": {
    "reason": "substrate_below_threshold | coverage_too_narrow | extraction_failed",
    "missingRoles": ["string"],
    "substrateScore": "number",
    "recommendedConsumerBehavior": "string"
  },
  "tokens": [ /* per-token objects */ ],
  "unmappedSiteRoles": [ /* per-token objects with no dictionary-fitting role */ ]
}
```

### roleDictionary

Externalized. `shadcn/v1`, `fintech/v1`, `ide/v1`, `site-derived` (for tokens with no dictionary fit). The 14-role shadcn enum becomes one versioned dictionary among many. Sites whose native ontology doesn't fit shadcn (IDE chrome, charting libraries, devtools, editor UIs) don't silently lose evidence.

### coverage

Every canonical output quietly implies authority over the site. Without coverage, a homepage-only extraction claims system-wide validity. `coverage.urls` and `coverage.sampleBias` make the scope explicit. `estimatedFraction` is nullable because we rarely know the true denominator; leave it null rather than guess.

### substrateScore

Computed from:

- Fraction of tokens that are named-variable-backed.
- Fraction of roles with ≥1 high-confidence, high-validity candidate.
- Coverage breadth (routes sampled, component families touched).

The formula is versioned with `contractVersion`. If the formula changes, the version bumps. The score is the gate for the refusal floor; it has to be auditable, not a black box.

### outcome + refusal

Three terminal states. `refusal` is populated only when `outcome == "refused"`. Consumers **must** check `outcome` before reading narrative-intent fields. Refusal is not a failure; failure is a separate error path (extraction crash, network, timeout) that doesn't produce a canonical.json at all.

The refusal floor exists because prose is sticky. A 9-section DESIGN.md synthesized from substrate that can only support 4 sections is a liability regardless of how prominent its "medium confidence" labels are. Refusal as a first-class output state, read by consumers before synthesis, is the correct brake.

### unmappedSiteRoles

Tokens the extractor determined are semantically load-bearing (high saliency, named-variable-backed, component-bound) but for which no role in the active dictionary fits. Preserves extraction success when the contract dictionary is too small. Silent lossage — where "dictionary didn't know about this role" becomes "nothing was there" — is the current failure mode.

## What is explicitly NOT in canonical

- **Resolved role per token.** Semantic-layer work. Canonical ships candidates.
- **Narrative prose.** Belongs in DESIGN.md. Canonical has no human-readable labels, descriptions, or summaries.
- **Adapter projections.** HSL triplets, Tailwind keys, target-dialect variable names. Belongs in adapter layer.
- **Policy.** What a consumer should treat as fixed is consumer-side.
- **Composition.** Templates, slots, page structure, nesting. Sibling schema (`composition.json`) when an extractor exists. Conflating composition and token graph is what doubles the schema.
- **Per-breakpoint / dark-mode variants.** v1 handles the default render. Variants are a structural extension.
- **Temporal diffs.** Canonical-over-time tracking. Useful eventually; not v1.

## Migration notes

### Adapter shim quarantine

The first `canonical.json` emitter in GSS will be a shim over the current `shadcn.analysis.json` shape. That shim is a translation layer, not the long-term model. **The contract must survive shim replacement without conceptual change.** If it does not, the contract is still secretly extractor-shaped.

Fields that exist only because the current extractor emits them in a particular way go in a clearly-labeled `legacy_extractor_residue` section during transition, not in the main schema, and are deleted once the extractor has been restructured.

### Candidates-vs-resolved transition (biggest migration cost)

Current consumers read `bindings.bindings[role] = {hex, confidence}`. The new shape is `tokens[i].roleCandidates = [{role, confidence, validity}]`. Every consumer has to invert the lookup — "give me `bg.default`" becomes "iterate tokens, filter candidates by role, pick one per policy."

During transition, GSS emits both shapes:

- `canonical.json` — candidates, as specified here.
- `semantic.json` — resolved via a default policy. Emitted for consumer backwards compatibility only. Contains nothing canonical.json doesn't contain; it's a convenience projection.

Once consumers have migrated to reading canonical.json directly with their own resolution policy, `semantic.json` becomes optional and eventually deprecated.

### The open verification question

Every promise in this contract should either:

1. Be producible deterministically from current GSS extraction, or
2. Be explicitly marked with a roadmap line naming the extraction work required.

Fields that require new extraction work but aren't labeled as such ship as unfulfillable commitments. The transition from aspiration to contract is the labeling exercise.

## Outputs in the wider pipeline

```
    compiled surface (browser-rendered site)
        ↓
    [ GSS extractor ]
        ↓
    canonical.json      ← THIS CONTRACT
        ↓
    [ semantic resolver — policy lives here ]
        ↓
    semantic.json       ← resolved roles + chosen candidates
        ↓     ↘
        ↓      [ adapter: shadcn / tailwind / theme-json ]
        ↓      ↓
        ↓      target-specific theme file
        ↓
    [ DCP narrative synthesis — gated by outcome field ]
        ↓
    DESIGN.md
```

Each stage loses information and adds interpretation. Canonical is the largest carrier of undistorted evidence. Every stage after it is lossy by design.
