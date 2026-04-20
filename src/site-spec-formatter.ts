// Generates a site-spec pack per pack.md contract.
// Five required files. Every file always exists. Refusal stubs for what the
// extractor cannot produce. Shared provenance frontmatter anchors the pack.

import crypto from 'crypto';

const GENERATOR_VERSION = 'site-spec-formatter/0.1';

interface SiteSpecInput {
  meta: any;
  tokens: any;
  bindings?: any;
  theme?: any;
  cssPath?: string;
  analysisJsonString?: string;
}

export interface SiteSpec {
  designMd: string;
  structureMd: string;
  componentsMd: string;
  implementationMd: string;
  caveatsMd: string;
}

interface ProvenanceAnchor {
  canonicalHash: string;
  generatorVersion: string;
  generatedAt: string;
  sampledUrls: string[];
}

interface FileFrontmatter {
  file: string;
  fileRole: string;
  anchor: ProvenanceAnchor;
  status: 'full' | 'partial' | 'refused';
  score: number;
  threshold: number;
}

const ROLE_ORDER = [
  'bg.default', 'bg.muted', 'bg.elevated',
  'text.primary', 'text.muted', 'text.onAccent',
  'border.default', 'border.muted',
  'accent.primary', 'accent.secondary',
  'intent.danger', 'intent.warning', 'intent.success', 'intent.info'
];

// -------- Utilities --------

function confidenceLabel(n: number): string {
  if (n >= 0.85) return 'high';
  if (n >= 0.6) return 'medium';
  return 'low';
}

function isOverlayish(hex: string): boolean {
  if (!hex) return false;
  const rgba = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([0-9.]+)\s*\)/i.exec(hex);
  if (rgba) return parseFloat(rgba[1]) < 0.3;
  const hex8 = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(hex);
  if (hex8) return parseInt(hex8[1], 16) / 255 < 0.3;
  const hex4 = /^#[0-9a-f]{3}([0-9a-f])$/i.exec(hex);
  if (hex4) return parseInt(hex4[1], 16) / 15 < 0.3;
  return false;
}

function classifyStatus(score: number, threshold: number): 'full' | 'partial' | 'refused' {
  if (score >= threshold) return 'full';
  if (score >= threshold / 2) return 'partial';
  return 'refused';
}

function renderFrontmatter(fm: FileFrontmatter): string {
  const lines = [
    '---',
    `file: ${fm.file}`,
    `file_role: ${fm.fileRole}`,
    `canonical_hash: ${fm.anchor.canonicalHash}`,
    `generator_version: ${fm.anchor.generatorVersion}`,
    `generated_at: ${fm.anchor.generatedAt}`,
    'sampled_urls:',
    ...fm.anchor.sampledUrls.map(u => `  - ${u}`),
    `status: ${fm.status}`,
    `score: ${fm.score.toFixed(2)}`,
    `threshold: ${fm.threshold.toFixed(2)}`,
    '---',
    ''
  ];
  return lines.join('\n');
}

// -------- Scoring --------

interface Scores {
  design: number;
  structure: number;
  components: number;
  implementation: number;
  caveats: number;
}

function computeScores(input: SiteSpecInput): Scores {
  const { tokens, bindings, cssPath, meta } = input;
  const colors = tokens?.colors ?? [];
  const nonOverlayColors = colors.filter((c: string) => !isOverlayish(c));
  const paletteHealth = Math.min(nonOverlayColors.length / 5, 1);
  const families = (tokens?.fontFamilies ?? []).length;
  const sizes = (tokens?.fontSizes ?? []).length;
  // Each term clamps independently; families alone cannot saturate the score.
  const typographyHealth = Math.min(families / 3, 1) * 0.5 + Math.min(sizes / 4, 1) * 0.5;
  const radiiHealth = (tokens?.radii ?? []).length >= 1 ? 1 : 0;
  const spacingHealth = Math.min((tokens?.spacing ?? []).length / 5, 1);

  const bound = bindings?.bindings ?? {};
  const roleFraction = Object.keys(bound).filter(r => bound[r]).length / 14;

  const design =
      0.25 * paletteHealth
    + 0.25 * typographyHealth
    + 0.15 * radiiHealth
    + 0.15 * spacingHealth
    + 0.20 * roleFraction;

  // Structure: we have none of these inputs today.
  const structure = 0;

  // Components: semantic button analysis is a weak positive but insufficient alone.
  const buttonAnalysisPresent = Array.isArray(meta?.semanticAnalysis?.buttonColors) && meta.semanticAnalysis.buttonColors.length > 0;
  const components = 0.3 * (buttonAnalysisPresent ? 1 : 0);

  const adapterPresent = !!cssPath;
  const implementation = 0.5 * (adapterPresent ? 1 : 0) + 0.3 * roleFraction + 0.2 * paletteHealth;

  const caveats = 1.0;

  return { design, structure, components, implementation, caveats };
}

// -------- DESIGN.md --------

function renderRolesSection(bindings: any): { markdown: string; withheld: Array<{ role: string; hex: string; reason: string }> } {
  if (!bindings?.bindings) {
    return { markdown: '## Color Roles\n\n_No role bindings available._\n', withheld: [] };
  }
  const bound = bindings.bindings as Record<string, any>;
  const withheld: Array<{ role: string; hex: string; reason: string }> = [];
  const rows: string[] = ['## Color Roles (observed)', ''];
  rows.push('| Role | Hex | Confidence | Basis |');
  rows.push('|---|---|---|---|');
  for (const role of ROLE_ORDER) {
    const b = bound[role];
    if (!b) { rows.push(`| \`${role}\` | — | — | unmapped |`); continue; }
    if (isOverlayish(b.hex)) {
      withheld.push({ role, hex: b.hex, reason: 'overlay/translucent — invalid as canonical for this role' });
      rows.push(`| \`${role}\` | _withheld (overlay — see CAVEATS.md)_ | — | — |`);
      continue;
    }
    const conf = typeof b.confidence === 'number' ? b.confidence.toFixed(2) : 'n/a';
    const label = typeof b.confidence === 'number' ? confidenceLabel(b.confidence) : '—';
    const reason = (b.reason ?? '').replace(/\|/g, '\\|');
    rows.push(`| \`${role}\` | \`${b.hex}\` | ${conf} (${label}) | ${reason} |`);
  }
  return { markdown: rows.join('\n'), withheld };
}

function renderColorPalette(tokens: any): string {
  const colors = (tokens?.colors ?? []).filter((c: string) => !isOverlayish(c));
  if (!colors.length) return '';
  const top = colors.slice(0, 20);
  const rows = ['', '## Color Palette (observed, overlays filtered)', '', top.map((c: string) => `\`${c}\``).join(' · ')];
  if (colors.length > top.length) rows.push('', `_Showing ${top.length} of ${colors.length} non-overlay color values._`);
  return rows.join('\n');
}

function renderTypography(tokens: any): string {
  const families = tokens?.fontFamilies ?? [];
  const sizes = tokens?.fontSizes ?? [];
  const weights = (tokens?.fontWeights ?? []).filter((w: string) => !/var\(/.test(w));
  const lineHeights = (tokens?.lineHeights ?? []).filter((l: string) => !/var\(/.test(l));
  const letterSpacings = (tokens?.letterSpacings ?? []).filter((l: string) => !/var\(/.test(l));
  if (!families.length && !sizes.length && !weights.length) return '';
  const rows = ['', '## Typography (observed)', ''];
  if (families.length) {
    rows.push('**Font families**', '');
    for (const f of families.slice(0, 10)) rows.push(`- \`${f}\``);
    if (families.length > 10) rows.push(`- _…and ${families.length - 10} more_`);
    rows.push('');
  }
  if (sizes.length) rows.push('**Font sizes**', '', sizes.slice(0, 20).map((s: string) => `\`${s}\``).join(' · '), '');
  if (weights.length) rows.push('**Font weights** (unresolved `var()` references filtered)', '', weights.slice(0, 20).map((w: string) => `\`${w}\``).join(' · '), '');
  if (lineHeights.length) rows.push('**Line heights** (unresolved `var()` references filtered)', '', lineHeights.slice(0, 12).map((l: string) => `\`${l}\``).join(' · '), '');
  if (letterSpacings.length) rows.push('**Letter spacings** (unresolved `var()` references filtered)', '', letterSpacings.slice(0, 12).map((l: string) => `\`${l}\``).join(' · '), '');
  return rows.join('\n');
}

function renderSpacing(tokens: any): string {
  const spacing = tokens?.spacing ?? [];
  if (!spacing.length) return '';
  const top = spacing.slice(0, 30);
  const rows = ['', '## Spacing (observed — mixed kinds)', '', top.map((s: string) => `\`${s}\``).join(' · ')];
  if (spacing.length > top.length) rows.push('', `_Showing ${top.length} of ${spacing.length} observed spacing values._`);
  rows.push('', '> **Warning:** this bucket mixes scale steps, layout widths, fluid expressions, and container constraints. Canonical classification into separate kinds is future work.');
  return rows.join('\n');
}

function renderRadii(tokens: any): string {
  const radii = tokens?.radii ?? [];
  if (!radii.length) return '';
  return `\n## Radii (observed)\n\n${radii.map((r: string) => `\`${r}\``).join(' · ')}\n`;
}

function buildDesignMd(input: SiteSpecInput, anchor: ProvenanceAnchor, score: number, withheldRef: Array<{ role: string; hex: string; reason: string }>): string {
  const threshold = 0.6;
  const status = classifyStatus(score, threshold);
  const fm = renderFrontmatter({ file: 'DESIGN.md', fileRole: 'style and token system', anchor, status, score, threshold });
  const { markdown: rolesMd, withheld } = renderRolesSection(input.bindings);
  withheldRef.push(...withheld);
  const body = [
    `# DESIGN.md — ${input.meta?.source ?? 'site'}`,
    '',
    '> **Scope:** style and token system only. This file does not describe page structure, component geometry, or visual hierarchy. See STRUCTURE.md (refusal stub) and COMPONENTS.md (refusal stub) for what this extraction cannot provide.',
    '',
    rolesMd,
    renderColorPalette(input.tokens),
    renderTypography(input.tokens),
    renderSpacing(input.tokens),
    renderRadii(input.tokens),
  ].join('\n');
  return fm + body + '\n';
}

// -------- STRUCTURE.md (refusal stub) --------

function buildStructureMd(input: SiteSpecInput, anchor: ProvenanceAnchor, score: number): string {
  const threshold = 0.5;
  const status = classifyStatus(score, threshold);
  const fm = renderFrontmatter({ file: 'STRUCTURE.md', fileRole: 'layout and composition', anchor, status, score, threshold });
  const body = [
    '# STRUCTURE.md — refusal stub',
    '',
    '## What this file is supposed to describe',
    '',
    'Layout and composition — the things a screenshot does not convey well:',
    '',
    '- responsive behavior across breakpoints',
    '- route-level composition (flows across pages)',
    '- semantic landmarks (main, nav, aside, complementary)',
    '- state behavior (expanded/collapsed, loading/loaded, pre/post-interaction)',
    '- off-screen structure (drawers, modals, sticky overlays, scroll regions)',
    '- z-order and layering relationships',
    '',
    '## Why this file is refused',
    '',
    'The current extractor reads stylesheets and semantic color zones. It does not traverse live DOM at multiple breakpoints, inspect JavaScript-driven state, extract ARIA landmarks, or capture scroll/viewport behavior. These signals are the substrate STRUCTURE.md needs; none is present in v1 extraction.',
    '',
    '## What evidence was missing',
    '',
    '- no multi-breakpoint DOM capture',
    '- no ARIA landmark extraction from rendered DOM',
    '- no JavaScript-rendered state inspection',
    '- no scroll/viewport instrumentation',
    '- no route-level crawl',
    '',
    '## What would improve it',
    '',
    '- add Playwright-based DOM capture at mobile/tablet/desktop widths (`--use-browser` exists but does not yet persist structural evidence)',
    '- add a landmark/hierarchy extractor that runs on the rendered DOM',
    '- add multi-route crawling with structural diff',
    '- add a sibling schema `composition.json` as the machine-readable counterpart',
    '',
    'Until at least the first of these exists, STRUCTURE.md will remain a refusal stub and page-reconstruction consumers must supply their own structural evidence (typically a screenshot).',
    ''
  ].join('\n');
  return fm + body;
}

// -------- COMPONENTS.md (refusal stub) --------

function buildComponentsMd(input: SiteSpecInput, anchor: ProvenanceAnchor, score: number): string {
  const threshold = 0.5;
  const status = classifyStatus(score, threshold);
  const fm = renderFrontmatter({ file: 'COMPONENTS.md', fileRole: 'component primitives', anchor, status, score, threshold });
  const buttonColors = input.meta?.semanticAnalysis?.buttonColors ?? [];
  const body = [
    '# COMPONENTS.md — refusal stub',
    '',
    '## What this file is supposed to describe',
    '',
    'Component primitives and their geometry:',
    '',
    '- component families (button, card, input, nav, form, modal)',
    '- known dimensions (padding, height, border width)',
    '- known states (default, hover, focus, active, disabled)',
    '- known variants (primary/secondary, sizes, emphasis)',
    '',
    '_Colors_ of components live in DESIGN.md. _Dimensions_ of components live here. This file is refused because dimensions are not reliably extractable from stylesheet evidence alone.',
    '',
    '## Why this file is refused',
    '',
    'Component geometry requires pairing CSS rules to DOM nodes and measuring box model properties at render time. The current extractor reads CSS in isolation, which surfaces token values but not which DOM node any given padding/height rule applies to. Without that pairing, statements like "button padding is X" are unsupported.',
    '',
    `The one component signal currently extracted is **button-layer colors**: ${buttonColors.length} observed for this site. That is not component geometry.`,
    '',
    '## What evidence was missing',
    '',
    '- no DOM ↔ CSS rule pairing at render time',
    '- no computed-style capture per component node',
    '- no component state enumeration (hover/focus/active pseudo-class resolution)',
    '- no variant detection (no evidence of primary vs secondary button distinction)',
    '',
    '## What would improve it',
    '',
    '- capture computed styles per DOM node via Playwright with known component selectors',
    '- add a component-family classifier that maps CSS classes and element types to primitives',
    '- resolve pseudo-class states (`:hover`, `:focus`) at capture time',
    '- add a variant inference pass over typography and color patterns',
    '',
    'Until component geometry extraction exists, COMPONENTS.md will remain a refusal stub and consumers must treat component dimensions as unknown.',
    ''
  ].join('\n');
  return fm + body;
}

// -------- IMPLEMENTATION.md --------

function buildImplementationMd(input: SiteSpecInput, anchor: ProvenanceAnchor, score: number): string {
  const threshold = 0.5;
  const status = classifyStatus(score, threshold);
  const fm = renderFrontmatter({ file: 'IMPLEMENTATION.md', fileRole: 'adapter guidance', anchor, status, score, threshold });
  const bound = input.bindings?.bindings ?? {};
  const rows: string[] = [
    '# IMPLEMENTATION.md',
    '',
    'Practical defaults for a consumer building in the style of the source site. These are **suggested starting points**, not assertions about designer intent. Confirm against the source before shipping.',
    ''
  ];
  if (input.cssPath) {
    rows.push('## Adapter CSS', '', `A shadcn-formatted CSS variable set is available at \`${input.cssPath}\`. Drop-in for shadcn-style projects.`, '');
  }
  rows.push('## Suggested role → CSS variable mapping', '', '| Role | Suggested value | Status |', '|---|---|---|');
  for (const role of ROLE_ORDER) {
    const b = bound[role];
    if (!b) { rows.push(`| \`${role}\` | _not bound_ | requires manual choice |`); continue; }
    if (isOverlayish(b.hex)) { rows.push(`| \`${role}\` | _withheld (overlay)_ | do not use raw value — see CAVEATS.md |`); continue; }
    const label = typeof b.confidence === 'number' ? confidenceLabel(b.confidence) : '—';
    rows.push(`| \`${role}\` | \`${b.hex}\` | ${label} confidence — verify |`);
  }
  rows.push(
    '',
    '## Notes',
    '',
    '- Values here are **observed**, not prescribed. A site rebuilt with these defaults may feel right but could diverge from the original in ways the extractor cannot see.',
    '- Unresolved `var()` references are dropped from the mapping but preserved in DESIGN.md for reference.',
    '- If you are building a live site replica, read CAVEATS.md first.',
    ''
  );
  return fm + rows.join('\n');
}

// -------- CAVEATS.md --------

function buildCaveatsMd(input: SiteSpecInput, anchor: ProvenanceAnchor, withheld: Array<{ role: string; hex: string; reason: string }>): string {
  const threshold = 0;
  const score = 1.0;
  const status: 'full' = 'full';
  const fm = renderFrontmatter({ file: 'CAVEATS.md', fileRole: 'truth boundaries', anchor, status, score, threshold });
  const report = input.bindings?.report ?? {};
  const bound = input.bindings?.bindings ?? {};
  const boundCount = Object.keys(bound).filter(r => bound[r]).length;
  const sizes = (input.tokens?.fontSizes ?? []).length;
  const colors = input.tokens?.colors ?? [];
  const overlayColors = colors.filter(isOverlayish);

  const rows: string[] = [
    '# CAVEATS.md',
    '',
    '## What this extraction does NOT contain',
    '',
    '- **Page structure / section layout** — STRUCTURE.md is a refusal stub.',
    '- **Component geometry** — COMPONENTS.md is a refusal stub. DESIGN.md has component *colors*, not *dimensions*.',
    '- **Visual hierarchy** — which styles apply to which semantic elements (h1 vs h2, primary button vs secondary) is not recovered.',
    '- **Interaction and motion** — hover, focus, transitions, animations are not captured.',
    '- **Imagery and illustration** — only token-level color extraction from images is possible (not shipped in this output).',
    '- **Designer intent** — these are observations of the compiled surface. Whether any value was intentional or incidental cannot be determined from stylesheet evidence alone.',
    '',
    '## Substrate quality signals',
    '',
    `- **Roles bound:** ${boundCount} of 14 (${report.autoBound ?? 0} auto, ${report.suggested ?? 0} suggested, ${report.uncertain ?? 0} uncertain)`,
    `- **Unmapped roles:** ${(report.unmappedRoles ?? []).length} — ${(report.unmappedRoles ?? []).join(', ') || 'none'}`
  ];
  if (sizes < 4) rows.push(`- **Font-size coverage:** thin (${sizes} observed). The site may express typography through named custom properties that the current extractor does not classify. Likely cause if the site uses Webflow, Framer, or similar systems.`);
  if (overlayColors.length) rows.push(`- **Overlay/translucent values:** ${overlayColors.length} observed color values are overlay-like and are not valid candidates for canonical text/background roles.`);
  rows.push('');

  if (withheld.length) {
    rows.push(
      '## Role bindings withheld from DESIGN.md',
      '',
      'These bindings were produced by the mapper but suppressed from the DESIGN.md role table because the value is invalid for that role:',
      '',
      '| Role | Raw value | Reason |',
      '|---|---|---|'
    );
    for (const w of withheld) rows.push(`| \`${w.role}\` | \`${w.hex}\` | ${w.reason} |`);
    rows.push('', 'A consumer that needs the raw binding can read it from the analysis JSON. DESIGN.md deliberately does not display it.', '');
  }

  rows.push(
    '## Coverage',
    '',
    `- **URLs sampled:** \`${input.meta?.source ?? 'unknown'}\` (single URL). No route diversity — implicit homepage bias.`,
    `- **Contexts:** stylesheet-level extraction with semantic analysis of button/nav/hero/form/footer zones.`,
    '',
    '## How to consume this pack safely',
    '',
    '- **For theming / style transfer:** DESIGN.md and IMPLEMENTATION.md are sufficient. Treat each value as observed, not prescribed.',
    '- **For page reconstruction:** do NOT rely on this pack alone. STRUCTURE.md and COMPONENTS.md are refusal stubs; their scope is what the extractor cannot provide. Supply screenshot or DOM capture for structural evidence.',
    '- **For confidence-sensitive work:** read each file\'s `status` and `score` fields before synthesizing anything downstream.',
    ''
  );
  return fm + rows.join('\n');
}

// -------- Entry --------

export function generateSiteSpec(input: SiteSpecInput): SiteSpec {
  const canonicalHash = 'sha256:' + crypto
    .createHash('sha256')
    .update(input.analysisJsonString ?? '')
    .digest('hex');
  const anchor: ProvenanceAnchor = {
    canonicalHash,
    generatorVersion: GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    sampledUrls: [input.meta?.source].filter(Boolean),
  };
  const scores = computeScores(input);
  const withheldRef: Array<{ role: string; hex: string; reason: string }> = [];

  const designMd = buildDesignMd(input, anchor, scores.design, withheldRef);
  const structureMd = buildStructureMd(input, anchor, scores.structure);
  const componentsMd = buildComponentsMd(input, anchor, scores.components);
  const implementationMd = buildImplementationMd(input, anchor, scores.implementation);
  const caveatsMd = buildCaveatsMd(input, anchor, withheldRef);

  return { designMd, structureMd, componentsMd, implementationMd, caveatsMd };
}
