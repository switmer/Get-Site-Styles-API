
Based on the project structure and code, the goal of **Get-Site-Styles** is to create a comprehensive **design token extraction and analysis tool** that can reverse-engineer design systems from any website. Here are the key objectives:

## Primary Goals

**1. Automated Design Token Extraction**
- Input any website URL and automatically extract all design tokens (colors, typography, spacing, shadows, etc.)
- Parse both external stylesheets and inline CSS to capture the complete design system

**2. Design System Analysis & Auditing**
- Provide frequency analysis showing which tokens are used most often
- Help identify inconsistencies and redundancies in existing design systems
- Generate usage statistics and prevalence percentages for each token

**3. Design System Migration & Standardization**
- Convert existing websites into structured design token formats
- Support multiple output formats (JSON, Style Dictionary, compact mode)
- Resolve CSS variable references to show token relationships and aliases

## Key Features & Use Cases

**For Design Teams:**
- **Audit existing websites** to understand current design patterns
- **Identify design debt** by finding duplicate or rarely-used tokens
- **Extract design systems** from legacy sites for modernization projects

**For Developers:**
- **Generate theme files** from existing websites
- **Create Style Dictionary configs** for design system tooling
- **Analyze CSS variable usage** and dependencies

**Output Capabilities:**
```typescript
// Comprehensive token extraction
- 90+ CSS custom properties with reference counting
- 100+ unique colors with frequency analysis  
- Typography scales, spacing systems, component tokens
- Breakpoints, shadows, gradients, transitions, etc.

// Multiple output formats
- Standard JSON with full metadata
- Compact JSON for smaller file sizes
- Style Dictionary format for design system tooling
- Relationship mapping for token aliases
```

## Business Value

This tool essentially allows teams to **"reverse engineer" any website's design system** and convert it into modern, structured design tokens - making it invaluable for design system migration, competitive analysis, and design standardization projects.

The frequency analysis particularly helps identify which tokens are actually being used vs. which are legacy/unused, enabling more informed decisions during design system cleanup and optimization.
