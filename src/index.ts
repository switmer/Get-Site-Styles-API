import { Command } from 'commander';
import { JSDOM } from 'jsdom';
import { Root, Declaration, AtRule } from 'postcss';
import safeParser from 'postcss-safe-parser';
import fs from 'fs';
import path from 'path';
import { formatOutput } from './formatter';
import { HttpClient } from './http-client';
import { SecurityValidator } from './security';
import { MultiSourceAnalyzer } from './multi-source-analyzer';
import { analyzeImages, mergeImageColorsWithCss } from './image-analysis';
import { analyzeSemanticColors, enhanceColorsWithSemantic } from './semantic-color-analyzer';
import type { ExtractedTokens, ExtractedMeta, ValidationError, AuthConfig, MultiSourceTokens, ImageAnalysisResult, SemanticColorAnalysis } from './types';

const program = new Command();

program
  .requiredOption('--url <url>', 'Primary URL of the website to extract styles from')
  .option('--urls <urls>', 'Additional URLs to analyze (comma-separated). Use for design system docs, style guides, etc.')
  .option('--compact', 'Output compact/minified JSON for LLM use')
  .option('--format <format>', 'Output format: json | style-dictionary | shadcn | tailwind | theme-json', 'json')
  .option('--all-formats', 'Generate all output formats (json, style-dictionary, shadcn, tailwind, theme-json)')
  .option('--color-format <format>', 'Color format for shadcn output: hsl | oklch | hex', 'hsl')
  .option('--auth-type <type>', 'Authentication type: basic | bearer | cookie | custom')
  .option('--auth-username <username>', 'Username for basic auth')
  .option('--auth-password <password>', 'Password for basic auth')
  .option('--auth-token <token>', 'Bearer token or API key')
  .option('--auth-cookies <cookies>', 'Cookie string for session auth')
  .option('--auth-headers <headers>', 'Custom headers as JSON string')
  .option('--include-images', 'Analyze images for additional brand colors (experimental)')
  .option('--max-images <number>', 'Maximum number of images to analyze', '10')
  .option('--semantic-analysis', 'Analyze HTML elements for semantic color importance (buttons, nav, etc.)')
  .parse(process.argv);

const options = program.opts();

// Build auth configuration
let authConfig: AuthConfig | undefined;
if (options.authType) {
  authConfig = {
    type: options.authType as 'basic' | 'bearer' | 'cookie' | 'custom'
  };

  switch (authConfig.type) {
    case 'basic':
      if (!options.authUsername || !options.authPassword) {
        console.error('Basic auth requires --auth-username and --auth-password');
        process.exit(1);
      }
      authConfig.username = options.authUsername;
      authConfig.password = options.authPassword;
      break;
    
    case 'bearer':
      if (!options.authToken) {
        console.error('Bearer auth requires --auth-token');
        process.exit(1);
      }
      authConfig.token = options.authToken;
      break;
    
    case 'cookie':
      if (!options.authCookies) {
        console.error('Cookie auth requires --auth-cookies');
        process.exit(1);
      }
      authConfig.cookies = options.authCookies;
      break;
    
    case 'custom':
      if (!options.authHeaders) {
        console.error('Custom auth requires --auth-headers as JSON string');
        process.exit(1);
      }
      try {
        authConfig.headers = JSON.parse(options.authHeaders);
      } catch (error) {
        console.error('Invalid JSON for --auth-headers');
        process.exit(1);
      }
      break;
  }
}

// Initialize HTTP client with auth configuration
const httpClient = new HttpClient({ auth: authConfig });

function resolveVar(value: string, customProperties: Record<string, string>, seen: Set<string> = new Set()): string {
  // Recursively resolve CSS variable references like var(--foo)
  const varRegex = /var\((--[\w-]+)\)/g;
  let result = value;
  let match;
  while ((match = varRegex.exec(result)) !== null) {
    const varName = match[1];
    if (seen.has(varName)) break; // Prevent infinite loops
    seen.add(varName);
    const replacement = customProperties[varName];
    if (replacement) {
      const resolved = resolveVar(replacement, customProperties, seen);
      result = result.replace(match[0], resolved);
    }
  }
  return result;
}

function frequencyMap(arr: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const v of arr) {
    freq[v] = (freq[v] || 0) + 1;
  }
  return freq;
}

function frequencyArray(arr: string[]): { value: string; count: number; prevalence: number }[] {
  const freq = frequencyMap(arr);
  const total = arr.length;
  return Object.entries(freq)
    .map(([value, count]) => ({ value, count, prevalence: +(count / total * 100).toFixed(2) }))
    .sort((a, b) => b.count - a.count);
}

function extractTokensFromCss(css: string): ExtractedTokens {
  const root: Root = safeParser(css);
  const customProperties: Record<string, string> = {};
  const customPropRefs: Record<string, number> = {};
  const colors: string[] = [];
  const colorsFromVariables: Set<string> = new Set(); // Track colors that come from CSS variables
  const fontSizes: string[] = [];
  const fontFamilies: string[] = [];
  const fontWeights: string[] = [];
  const lineHeights: string[] = [];
  const letterSpacings: string[] = [];
  const spacing: string[] = [];
  const radii: string[] = [];
  const shadows: string[] = [];
  const gradients: string[] = [];
  const breakpoints: string[] = [];
  const zIndices: string[] = [];
  const transitions: string[] = [];
  const opacity: string[] = [];
  const aspectRatios: string[] = [];
  const borderWidths: string[] = [];
  const borderStyles: string[] = [];

  // Count var(--token) references
  const varRefRegex = /var\((--[\w-]+)\)/g;
  let match;
  while ((match = varRefRegex.exec(css)) !== null) {
    const varName = match[1];
    customPropRefs[varName] = (customPropRefs[varName] || 0) + 1;
  }

  // Helper function to check if a CSS rule should be ignored
  const shouldIgnoreRule = (rule: any): boolean => {
    if (!rule.parent) return false;
    
    // Get the full selector chain
    let currentRule = rule.parent;
    let selectors: string[] = [];
    
    while (currentRule) {
      if (currentRule.type === 'rule') {
        selectors.push(currentRule.selector || '');
      }
      currentRule = currentRule.parent;
    }
    
    const fullSelector = selectors.join(' ').toLowerCase();
    
    // Ignore problematic pseudo-states that often contain browser defaults
    const ignoredPatterns = [
      /:hover/i,           // Hover states often use browser defaults
      /:focus/i,           // Focus rings often use browser defaults  
      /:visited/i,         // Visited link colors use browser defaults
      /:link/i,            // Default link colors
      /:active/i,          // Active states may use defaults
      /a:not\(/i,          // Default link styling
      /\*:focus/i,         // Universal focus styles
      /input:focus/i,      // Default form focus colors
      /button:focus/i,     // Default button focus colors
      /textarea:focus/i,   // Default textarea focus colors
      /select:focus/i,     // Default select focus colors
      /:focus-visible/i,   // Focus-visible often browser defaults
      /:target/i           // Target pseudo-class defaults
    ];
    
    return ignoredPatterns.some(pattern => pattern.test(fullSelector));
  };

  root.walkDecls((decl: Declaration) => {
    // Custom properties
    if (decl.prop.startsWith('--')) {
      customProperties[decl.prop] = decl.value;
      
      // If this custom property contains colors, mark them as variable-defined
      const colorRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/g;
      const colorMatches = decl.value.match(colorRegex);
      if (colorMatches) {
        colorMatches.forEach(color => colorsFromVariables.add(color));
      }
    }
    
    // Colors - but skip problematic pseudo-states
    if (!shouldIgnoreRule(decl) && /color|background|border|fill|stroke|shadow|outline|caret|text-decoration|accent-color/i.test(decl.prop)) {
      const colorRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/g;
      const matches = decl.value.match(colorRegex);
      if (matches) {
        // Additional filter for known browser default colors
        matches.forEach(color => {
          const normalized = color.toLowerCase();
          const browserDefaults = [
            '#0000ee', '#0000ff', '#0066cc', '#0080ff', '#0099ff', '#1e90ff', '#4169e1',
            '#800080', '#8b008b', '#9932cc', '#663399',
            '#005fcc', '#0078d4', '#0066ff', '#217ce8', '#2563eb',
            '#0078d7', '#106ebe', '#66afe9', '#80bdff', '#007bff',
            '#1976d2', '#2196f3', '#42a5f5'
          ];
          
          // Only include if it's not a known browser default
          if (!browserDefaults.includes(normalized)) {
            colors.push(color);
          }
        });
      }
      
      // Only check for CSS color keywords if no other color formats were found
      if (!matches || matches.length === 0) {
        const validColorKeywords = ['red', 'blue', 'green', 'black', 'white', 'gray', 'grey', 'yellow', 'orange', 'purple', 'pink', 'brown', 'cyan', 'magenta', 'lime', 'navy', 'olive', 'teal', 'silver', 'maroon', 'fuchsia', 'aqua'];
        const keywords = decl.value.split(/\s+/).filter(word => validColorKeywords.includes(word.toLowerCase()));
        if (keywords.length > 0) {
          colors.push(...keywords);
        }
      }
    }
    
    // Also extract colors from any CSS value that contains color patterns (but still filter)
    if (!shouldIgnoreRule(decl) && decl.value) {
      const valueColorRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/g;
      const valueMatches = decl.value.match(valueColorRegex);
      if (valueMatches) {
        valueMatches.forEach(color => {
          const normalized = color.toLowerCase();
          const browserDefaults = [
            '#0000ee', '#0000ff', '#0066cc', '#0080ff', '#0099ff', '#1e90ff', '#4169e1',
            '#800080', '#8b008b', '#9932cc', '#663399',
            '#005fcc', '#0078d4', '#0066ff', '#217ce8', '#2563eb',
            '#0078d7', '#106ebe', '#66afe9', '#80bdff', '#007bff',
            '#1976d2', '#2196f3', '#42a5f5'
          ];
          
          // Only include if it's not a known browser default
          if (!browserDefaults.includes(normalized)) {
            colors.push(color);
          }
        });
      }
    }
    // Font sizes
    if (/font-size/i.test(decl.prop)) {
      const fontSizeRegex = /([\d.]+(px|rem|em|%|vw|vh))/g;
      const matches = decl.value.match(fontSizeRegex);
      if (matches) matches.forEach(f => fontSizes.push(f));
    }
    // Font families
    if (/font-family/i.test(decl.prop)) {
      const families = decl.value.split(',').map(f => f.trim().replace(/^['"]|['"]$/g, ''));
      families.forEach(fam => fontFamilies.push(fam));
    }
    // Font weights
    if (/font-weight/i.test(decl.prop)) {
      fontWeights.push(decl.value.trim());
    }
    // Line heights
    if (/line-height/i.test(decl.prop)) {
      lineHeights.push(decl.value.trim());
    }
    // Letter spacing
    if (/letter-spacing/i.test(decl.prop)) {
      letterSpacings.push(decl.value.trim());
    }
    // Spacing
    if (/margin|padding|gap/i.test(decl.prop)) {
      const spacingRegex = /([\d.]+(px|rem|em|%|vw|vh))/g;
      const matches = decl.value.match(spacingRegex);
      if (matches) matches.forEach(s => spacing.push(s));
    }
    // Border radius
    if (/radius/i.test(decl.prop)) {
      const radiusRegex = /([\d.]+(px|rem|em|%))/g;
      const matches = decl.value.match(radiusRegex);
      if (matches) matches.forEach(r => radii.push(r));
    }
    // Shadows
    if (/box-shadow|text-shadow/i.test(decl.prop)) {
      shadows.push(decl.value);
    }
    // Gradients
    if (/gradient/i.test(decl.value)) {
      gradients.push(decl.value);
    }
    // Z-Index
    if (/z-index/i.test(decl.prop)) {
      zIndices.push(decl.value.trim());
    }
    // Transitions & Animations
    if (/transition|animation/i.test(decl.prop)) {
      transitions.push(decl.value.trim());
    }
    // Opacity
    if (/opacity/i.test(decl.prop)) {
      opacity.push(decl.value.trim());
    }
    // Aspect Ratio
    if (/aspect-ratio/i.test(decl.prop)) {
      aspectRatios.push(decl.value.trim());
    }
    // Border Widths
    if (/border-width/i.test(decl.prop)) {
      borderWidths.push(decl.value.trim());
    }
    // Border Styles
    if (/border-style/i.test(decl.prop)) {
      borderStyles.push(decl.value.trim());
    }
  });

  // Media queries for breakpoints
  root.walkAtRules((rule: AtRule) => {
    if (rule.name === 'media') {
      const bpRegex = /(min|max)-width:\s*([\d.]+(px|em|rem|vw|vh))/g;
      let match;
      while ((match = bpRegex.exec(rule.params)) !== null) {
        breakpoints.push(match[2]);
      }
    }
  });

  // Resolve custom property values
  const processedCustomProperties: Record<string, { value: string; references: number; refVariable?: string }> = {};
  for (const [key, value] of Object.entries(customProperties)) {
    // Check if the original value is exactly a single var(--token)
    const varMatch = value.match(/^var\((--[\w-]+)\)$/);
    if (varMatch) {
      processedCustomProperties[key] = {
        value: resolveVar(value, customProperties),
        references: customPropRefs[key] || 0,
        refVariable: varMatch[1]
      };
    } else {
      processedCustomProperties[key] = {
        value: resolveVar(value, customProperties),
        references: customPropRefs[key] || 0
      };
    }
  }

  function dedup(arr: string[]) {
    return Array.from(new Set(arr));
  }

  return {
    customProperties: processedCustomProperties,
    colors: {
      values: dedup(colors),
      frequency: frequencyArray(colors)
    },
    colorsFromVariables: Array.from(colorsFromVariables),
    fontSizes: {
      values: dedup(fontSizes),
      frequency: frequencyArray(fontSizes)
    },
    fontFamilies: {
      values: dedup(fontFamilies),
      frequency: frequencyArray(fontFamilies)
    },
    fontWeights: {
      values: dedup(fontWeights),
      frequency: frequencyArray(fontWeights)
    },
    lineHeights: {
      values: dedup(lineHeights),
      frequency: frequencyArray(lineHeights)
    },
    letterSpacings: {
      values: dedup(letterSpacings),
      frequency: frequencyArray(letterSpacings)
    },
    spacing: {
      values: dedup(spacing),
      frequency: frequencyArray(spacing)
    },
    radii: {
      values: dedup(radii),
      frequency: frequencyArray(radii)
    },
    shadows: {
      values: dedup(shadows),
      frequency: frequencyArray(shadows)
    },
    gradients: {
      values: dedup(gradients),
      frequency: frequencyArray(gradients)
    },
    breakpoints: {
      values: dedup(breakpoints),
      frequency: frequencyArray(breakpoints)
    },
    zIndices: {
      values: dedup(zIndices),
      frequency: frequencyArray(zIndices)
    },
    transitions: {
      values: dedup(transitions),
      frequency: frequencyArray(transitions)
    },
    opacity: {
      values: dedup(opacity),
      frequency: frequencyArray(opacity)
    },
    aspectRatios: {
      values: dedup(aspectRatios),
      frequency: frequencyArray(aspectRatios)
    },
    borderWidths: {
      values: dedup(borderWidths),
      frequency: frequencyArray(borderWidths)
    },
    borderStyles: {
      values: dedup(borderStyles),
      frequency: frequencyArray(borderStyles)
    }
  };
}

async function extractStyles(html: string, baseUrl: string): Promise<void> {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;

  // Get all external stylesheet URLs
  const linkHrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(link => (link as HTMLLinkElement).href)
    .map(href => href.startsWith('http') ? href : new URL(href, baseUrl).href);

  // Get all inline <style> tag contents
  const styleContents = Array.from(document.querySelectorAll('style'))
    .map(style => (style as HTMLStyleElement).textContent || '');

  // Fetch all external CSS
  const externalCssArr = await Promise.all(linkHrefs.map(url => httpClient.fetchCss(url)));

  // Combine all CSS
  const allCss = [...externalCssArr, ...styleContents].join('\n');
  console.log('Total combined CSS length:', allCss.length);

  // Optional image analysis
  let imageAnalysis: ImageAnalysisResult | undefined;
  if (options.includeImages) {
    try {
      imageAnalysis = await analyzeImages(html, allCss, baseUrl, {
        maxImages: parseInt(options.maxImages || '10'),
        timeout: 5000
      });
    } catch (error) {
      console.warn('Image analysis failed:', error);
    }
  }

  // Optional semantic color analysis
  let semanticAnalysis: SemanticColorAnalysis | undefined;
  if (options.semanticAnalysis) {
    try {
      semanticAnalysis = analyzeSemanticColors(html, allCss);
    } catch (error) {
      console.warn('Semantic analysis failed:', error);
    }
  }

  // Parse and extract tokens
  let tokens = extractTokensFromCss(allCss);

  // Enhance colors with all available analysis types
  let enhancedColors = tokens.colors.frequency.map(f => ({ value: f.value, count: f.count }));

  // Apply image analysis enhancement
  if (imageAnalysis) {
    enhancedColors = mergeImageColorsWithCss(enhancedColors, imageAnalysis);
    console.log(`🖼️  Enhanced colors with image analysis: ${imageAnalysis.images.length} images processed`);
  }

  // Apply semantic analysis enhancement
  if (semanticAnalysis) {
    const semanticEnhanced = enhanceColorsWithSemantic(enhancedColors, semanticAnalysis);
    
    // Update tokens with semantic-enhanced color data
    tokens.colors.frequency = semanticEnhanced.map(c => ({
      value: c.value,
      count: c.count,
      prevalence: +(c.count / semanticEnhanced.reduce((sum, item) => sum + item.count, 0) * 100).toFixed(2)
    }));
    
    tokens.colors.values = semanticEnhanced.map(c => c.value);
    
    console.log(`🎯 Enhanced colors with semantic analysis:`);
    console.log(`    Button colors: ${semanticAnalysis.summary.buttonColors.length}`);
    console.log(`    Brand colors: ${semanticAnalysis.summary.brandColors.length}`);
    console.log(`    Total semantic elements: ${semanticAnalysis.summary.totalElements}`);
  } else if (imageAnalysis) {
    // If only image analysis was performed, update tokens
    tokens.colors.frequency = enhancedColors.map(c => ({
      value: c.value,
      count: c.count,
      prevalence: +(c.count / enhancedColors.reduce((sum, item) => sum + item.count, 0) * 100).toFixed(2)
    }));
    
    tokens.colors.values = enhancedColors.map(c => c.value);
  }

  // Prepare output folder name: outputs/<hostname>-YYYY-MM-DD
  const urlObj = new URL(baseUrl);
  const hostname = urlObj.hostname.replace(/^www\./, '');
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const outputDir = path.join(process.cwd(), 'outputs', `${hostname}-${dateStr}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Add meta info
  const now = new Date();
  const meta = {
    source: baseUrl,
    extractedAt: now.toISOString(),
    imageAnalysis: imageAnalysis ? {
      totalImages: imageAnalysis.totalImages,
      processedImages: imageAnalysis.images.length,
      logoColors: imageAnalysis.logoColors,
      heroColors: imageAnalysis.heroColors,
      averageColorsPerImage: imageAnalysis.averageColorsPerImage,
      imageTypes: imageAnalysis.images.reduce((acc: Record<string, number>, img) => {
        acc[img.type] = (acc[img.type] || 0) + 1;
        return acc;
      }, {})
    } : undefined,
    semanticAnalysis: semanticAnalysis ? {
      totalElements: semanticAnalysis.summary.totalElements,
      buttonColors: semanticAnalysis.summary.buttonColors,
      brandColors: semanticAnalysis.summary.brandColors,
      colorsByContext: semanticAnalysis.summary.colorsByContext,
      highestWeightColors: semanticAnalysis.summary.highestWeightColors,
      tailwind: semanticAnalysis.tailwind
    } : undefined,
    totalTokens: {
      customProperties: Object.keys(tokens.customProperties).length,
      colors: tokens.colors.frequency.reduce((a, b) => a + b.count, 0),
      fontSizes: tokens.fontSizes.frequency.reduce((a, b) => a + b.count, 0),
      fontFamilies: tokens.fontFamilies.frequency.reduce((a, b) => a + b.count, 0),
      fontWeights: tokens.fontWeights.frequency.reduce((a, b) => a + b.count, 0),
      lineHeights: tokens.lineHeights.frequency.reduce((a, b) => a + b.count, 0),
      letterSpacings: tokens.letterSpacings.frequency.reduce((a, b) => a + b.count, 0),
      spacing: tokens.spacing.frequency.reduce((a, b) => a + b.count, 0),
      radii: tokens.radii.frequency.reduce((a, b) => a + b.count, 0),
      shadows: tokens.shadows.frequency.reduce((a, b) => a + b.count, 0),
      gradients: tokens.gradients.frequency.reduce((a, b) => a + b.count, 0),
      breakpoints: tokens.breakpoints.frequency.reduce((a, b) => a + b.count, 0),
      zIndices: tokens.zIndices.frequency.reduce((a, b) => a + b.count, 0),
      transitions: tokens.transitions.frequency.reduce((a, b) => a + b.count, 0),
      opacity: tokens.opacity.frequency.reduce((a, b) => a + b.count, 0),
      aspectRatios: tokens.aspectRatios.frequency.reduce((a, b) => a + b.count, 0),
      borderWidths: tokens.borderWidths.frequency.reduce((a, b) => a + b.count, 0),
      borderStyles: tokens.borderStyles.frequency.reduce((a, b) => a + b.count, 0)
    }
  };

  // Write to outputs/<hostname>-YYYY-MM-DD/theme-HH-MM-SS.json
  const now2 = new Date();
  const timeStr = now2.toISOString().slice(11, 19).replace(/:/g, '-'); // HH-MM-SS

  if (options.allFormats) {
    // Generate all formats
    const formats: ('json' | 'style-dictionary' | 'shadcn' | 'tailwind' | 'theme-json')[] = ['json', 'style-dictionary', 'shadcn', 'tailwind', 'theme-json'];
    console.log(`\n🎨 Generating all formats: ${formats.join(', ')}`);
    
    for (const format of formats) {
      const formatOptions = { ...options, format };
      const output = formatOutput(tokens, meta, formatOptions);
      
      let ext = 'json';
      let formatSuffix = '';
      
      switch (format) {
        case 'style-dictionary':
          ext = 'sd.json';
          break;
        case 'shadcn':
          ext = 'css';
          formatSuffix = '-shadcn';
          break;
        case 'tailwind':
          ext = 'json';
          formatSuffix = '-tailwind';
          break;
        case 'theme-json':
          ext = 'json';
          formatSuffix = '-theme';
          break;
        default:
          ext = 'json';
      }
      
      const outputPath = path.join(outputDir, `theme-${timeStr}${options.compact ? '-compact' : ''}${formatSuffix}.${ext}`);
      
      if (format === 'shadcn') {
        // For shadcn, write the CSS directly, but also save the full analysis as JSON
        fs.writeFileSync(outputPath, output.css, 'utf-8');
        
        // Also save the analysis data
        const analysisPath = outputPath.replace('.css', '.analysis.json');
        fs.writeFileSync(analysisPath, JSON.stringify(output, null, 2), 'utf-8');
        console.log(`  ✅ ${format}: ${outputPath}`);
        console.log(`  📊 ${format} analysis: ${analysisPath}`);
      } else {
        fs.writeFileSync(outputPath, options.compact ? JSON.stringify(output) : JSON.stringify(output, null, 2), 'utf-8');
        console.log(`  ✅ ${format}: ${outputPath}`);
      }
    }
    console.log(`\n🎉 All formats generated successfully!`);
  } else {
    // Single format output (existing behavior)
    const output = formatOutput(tokens, meta, options);
    
    let ext = 'json';
    let formatSuffix = '';
    
    switch (options.format) {
      case 'style-dictionary':
        ext = 'sd.json';
        break;
      case 'shadcn':
        ext = 'css';
        formatSuffix = '-shadcn';
        break;
      case 'tailwind':
        ext = 'json';
        formatSuffix = '-tailwind';
        break;
      case 'theme-json':
        ext = 'json';
        formatSuffix = '-theme';
        break;
      default:
        ext = 'json';
    }
    
    const outputPath = path.join(outputDir, `theme-${timeStr}${options.compact ? '-compact' : ''}${formatSuffix}.${ext}`);

    if (options.format === 'shadcn') {
      // For shadcn, write the CSS directly, but also save the full analysis as JSON
      fs.writeFileSync(outputPath, output.css, 'utf-8');
      
      // Also save the analysis data
      const analysisPath = outputPath.replace('.css', '.analysis.json');
      fs.writeFileSync(analysisPath, JSON.stringify(output, null, 2), 'utf-8');
      console.log(`Shadcn CSS written to ${outputPath}`);
      console.log(`Analysis data written to ${analysisPath}`);
    } else {
      fs.writeFileSync(outputPath, options.compact ? JSON.stringify(output) : JSON.stringify(output, null, 2), 'utf-8');
      console.log(`Theme tokens written to ${outputPath}`);
    }
  }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract styles: ${message}`);
  }
}

async function saveMultiSourceResults(multiResult: MultiSourceTokens, options: any): Promise<void> {
  // Use the primary URL for folder naming
  const primaryUrl = multiResult.sources[0]?.url || 'multi-source';
  const urlObj = new URL(primaryUrl);
  const hostname = urlObj.hostname.replace(/^www\./, '');
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const outputDir = path.join(process.cwd(), 'outputs', `${hostname}-${dateStr}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Prepare meta info
  const meta = {
    sources: multiResult.sources,
    extractedAt: new Date().toISOString(),
    totalTokens: {
      customProperties: Object.keys(multiResult.mergedTokens.customProperties).length,
      colors: multiResult.mergedTokens.colors.frequency.reduce((a, b) => a + b.count, 0),
      fontSizes: multiResult.mergedTokens.fontSizes.frequency.reduce((a, b) => a + b.count, 0),
      fontFamilies: multiResult.mergedTokens.fontFamilies.frequency.reduce((a, b) => a + b.count, 0),
      fontWeights: multiResult.mergedTokens.fontWeights.frequency.reduce((a, b) => a + b.count, 0),
      lineHeights: multiResult.mergedTokens.lineHeights.frequency.reduce((a, b) => a + b.count, 0),
      letterSpacings: multiResult.mergedTokens.letterSpacings.frequency.reduce((a, b) => a + b.count, 0),
      spacing: multiResult.mergedTokens.spacing.frequency.reduce((a, b) => a + b.count, 0),
      radii: multiResult.mergedTokens.radii.frequency.reduce((a, b) => a + b.count, 0),
      shadows: multiResult.mergedTokens.shadows.frequency.reduce((a, b) => a + b.count, 0),
      gradients: multiResult.mergedTokens.gradients.frequency.reduce((a, b) => a + b.count, 0),
      breakpoints: multiResult.mergedTokens.breakpoints.frequency.reduce((a, b) => a + b.count, 0),
      zIndices: multiResult.mergedTokens.zIndices.frequency.reduce((a, b) => a + b.count, 0),
      transitions: multiResult.mergedTokens.transitions.frequency.reduce((a, b) => a + b.count, 0),
      opacity: multiResult.mergedTokens.opacity.frequency.reduce((a, b) => a + b.count, 0),
      aspectRatios: multiResult.mergedTokens.aspectRatios.frequency.reduce((a, b) => a + b.count, 0),
      borderWidths: multiResult.mergedTokens.borderWidths.frequency.reduce((a, b) => a + b.count, 0),
      borderStyles: multiResult.mergedTokens.borderStyles.frequency.reduce((a, b) => a + b.count, 0)
    },
    conflicts: multiResult.conflicts
  };

  // Write files
  const now = new Date();
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-'); // HH-MM-SS

  if (options.allFormats) {
    // Generate all formats for multi-source
    const formats: ('json' | 'style-dictionary' | 'shadcn' | 'tailwind' | 'theme-json')[] = ['json', 'style-dictionary', 'shadcn', 'tailwind', 'theme-json'];
    console.log(`\n🎨 Generating all multi-source formats: ${formats.join(', ')}`);
    
    for (const format of formats) {
      const formatOptions = { ...options, format };
      const output = formatOutput(multiResult.mergedTokens, meta, formatOptions);
      
      let ext = 'json';
      let formatSuffix = '';
      
      switch (format) {
        case 'style-dictionary':
          ext = 'sd.json';
          break;
        case 'shadcn':
          ext = 'css';
          formatSuffix = '-shadcn';
          break;
        case 'tailwind':
          ext = 'json';
          formatSuffix = '-tailwind';
          break;
        case 'theme-json':
          ext = 'json';
          formatSuffix = '-theme';
          break;
        default:
          ext = 'json';
      }
      
      const outputPath = path.join(outputDir, `multi-source-${timeStr}${options.compact ? '-compact' : ''}${formatSuffix}.${ext}`);
      
      if (format === 'shadcn') {
        // For shadcn, write the CSS directly, but also save the full analysis as JSON
        fs.writeFileSync(outputPath, output.css, 'utf-8');
        
        // Also save the analysis data
        const analysisPath = outputPath.replace('.css', '.analysis.json');
        fs.writeFileSync(analysisPath, JSON.stringify(output, null, 2), 'utf-8');
        console.log(`  ✅ ${format}: ${outputPath}`);
        console.log(`  📊 ${format} analysis: ${analysisPath}`);
      } else {
        fs.writeFileSync(outputPath, options.compact ? JSON.stringify(output) : JSON.stringify(output, null, 2), 'utf-8');
        console.log(`  ✅ ${format}: ${outputPath}`);
      }
    }
    console.log(`\n🎉 All multi-source formats generated successfully!`);
  } else {
    // Single format output (existing behavior)
    const output = formatOutput(multiResult.mergedTokens, meta, options);
    
    let ext = 'json';
    let formatSuffix = '';
    
    switch (options.format) {
      case 'style-dictionary':
        ext = 'sd.json';
        break;
      case 'shadcn':
        ext = 'css';
        formatSuffix = '-shadcn';
        break;
      case 'tailwind':
        ext = 'json';
        formatSuffix = '-tailwind';
        break;
      case 'theme-json':
        ext = 'json';
        formatSuffix = '-theme';
        break;
      default:
        ext = 'json';
    }
    
    const outputPath = path.join(outputDir, `multi-source-${timeStr}${options.compact ? '-compact' : ''}${formatSuffix}.${ext}`);

    if (options.format === 'shadcn') {
      // For shadcn, write the CSS directly, but also save the full analysis as JSON
      fs.writeFileSync(outputPath, output.css, 'utf-8');
      
      // Also save the analysis data
      const analysisPath = outputPath.replace('.css', '.analysis.json');
      fs.writeFileSync(analysisPath, JSON.stringify(output, null, 2), 'utf-8');
      console.log(`✅ Multi-source Shadcn CSS written to ${outputPath}`);
      console.log(`📊 Analysis data written to ${analysisPath}`);
    } else {
      fs.writeFileSync(outputPath, options.compact ? JSON.stringify(output) : JSON.stringify(output, null, 2), 'utf-8');
      console.log(`✅ Multi-source theme tokens written to ${outputPath}`);
    }
  }

  // Also save the raw multi-source data for debugging
  const debugPath = path.join(outputDir, `multi-source-debug-${timeStr}.json`);
  fs.writeFileSync(debugPath, JSON.stringify(multiResult, null, 2), 'utf-8');
  console.log(`🔍 Debug data written to ${debugPath}`);
  
  // Print summary
  console.log(`\n📋 Multi-source Analysis Summary:`);
  console.log(`   Sources analyzed: ${multiResult.sources.length}`);
  multiResult.sources.forEach(s => {
    console.log(`   • ${s.url} (${s.type}, weight: ${s.weight})`);
  });
  console.log(`   Conflicts detected: ${multiResult.conflicts.length}`);
}

(async () => {
  try {
    // Parse URLs
    const urls = [options.url];
    if (options.urls) {
      const additionalUrls = options.urls.split(',').map((url: string) => url.trim());
      urls.push(...additionalUrls);
    }
    
    if (urls.length === 1) {
      // Single source analysis (original behavior)
      const html = await httpClient.fetchHtml(options.url);
      await extractStyles(html, options.url);
    } else {
      // Multi-source analysis
      console.log(`\n🔍 Multi-source analysis starting...`);
      console.log(`Sources (${urls.length}):`);
      urls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
      
      const multiAnalyzer = new MultiSourceAnalyzer(httpClient);
      const multiResult = await multiAnalyzer.analyzeMultipleSources(urls, extractTokensFromCss);
      
      await saveMultiSourceResults(multiResult, options);
    }
  } catch (error) {
    const validationError = error as ValidationError;
    console.error(`Error: ${validationError.message}`);
    if (validationError.code) {
      console.error(`Error Code: ${validationError.code}`);
    }
    process.exit(1);
  }
})(); 