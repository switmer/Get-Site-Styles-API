import { JSDOM } from 'jsdom';

export interface SemanticColorData {
  color: string;
  element: string;
  context: 'button' | 'navigation' | 'cta' | 'form' | 'brand' | 'status' | 'link' | 'header' | 'hero' | 'accent';
  weight: number;
  selector: string;
  property: string; // background-color, color, border-color, etc.
  frequency: number;
  // NEW: Positional heuristics
  domDepth?: number; // Distance from body
  firstSeenIndex?: number; // Order in which color was first encountered
  documentPosition?: number; // Approximate vertical position (0-1 scale)
  elementCount?: number; // How many elements are using this color
}

export interface SemanticColorAnalysis {
  colors: SemanticColorData[];
  summary: {
    totalElements: number;
    colorsByContext: Record<string, string[]>;
    highestWeightColors: string[];
    buttonColors: string[];
    brandColors: string[];
  };
  tailwind?: {
    detected: boolean;
    totalClasses: number;
    colorClasses: string[];
    colors: Array<{ color: string; property: string; className: string; frequency: number }>;
  };
}

// Element selectors and their semantic context with weights
const SEMANTIC_SELECTORS = [
  // Buttons (highest priority)
  { selector: 'button, [role="button"], input[type="submit"], input[type="button"]', context: 'button', weight: 100 },
  { selector: '.btn, .button, .cta-button, [class*="btn-"], [class*="button-"]', context: 'button', weight: 95 },
  
  // Call-to-Action elements
  { selector: '.cta, .call-to-action, [class*="cta-"], .hero-cta, .primary-cta', context: 'cta', weight: 90 },
  
  // Navigation (high priority for brand colors)
  { selector: 'nav, .nav, .navbar, .navigation, .menu', context: 'navigation', weight: 85 },
  { selector: 'nav a, .nav a, .navbar a, .menu a, .nav-link, .menu-item', context: 'navigation', weight: 80 },
  
  // Brand/Logo areas (high priority)
  { selector: '.logo, .brand, [class*="logo"], [class*="brand"], [alt*="logo"]', context: 'brand', weight: 95 },
  
  // Enhanced header detection (NEW - better Angular/React support)
  { selector: 'header, .header, .masthead, .site-header, .page-header', context: 'header', weight: 90 },
  { selector: '.header-wrapper, .header-container, [class*="header-"], [class*="spirit-header"], [class*="masthead"], [class*="topbar"]', context: 'header', weight: 85 },
  
  // Hero sections (NEW - primary brand expression zones)
  { selector: '.hero, .banner, .jumbotron, [class*="hero-"], .hero-section', context: 'hero', weight: 85 },
  { selector: '.hero-wrapper, .hero-container, .hero-banner', context: 'hero', weight: 80 },
  
  // Footer backgrounds (NEW - secondary brand zones)
  { selector: 'footer, .footer, [class*="footer"], .site-footer', context: 'brand', weight: 80 },
  { selector: '.footer-wrapper, .footer-container, .footer-section', context: 'brand', weight: 75 },
  
  // Layout zones with potential brand backgrounds (NEW)
  { selector: '.sidebar, [class*="sidebar"], aside, .aside', context: 'brand', weight: 70 },
  { selector: 'main, .main, [role="main"], .content, .main-content', context: 'brand', weight: 60 },
  { selector: '.section, [class*="section"], .section-wrapper', context: 'accent', weight: 65 },
  { selector: '.container, [class*="container"], .wrapper, [class*="wrapper"]', context: 'accent', weight: 55 },
  
  // Cards and panels (accent zones)
  { selector: '.card, [class*="card"], .panel, [class*="panel"]', context: 'accent', weight: 65 },
  { selector: '.modal, [class*="modal"], .overlay, [class*="overlay"]', context: 'accent', weight: 65 },
  
  // Framer-specific selectors (for design tools)
  { selector: '[class*="framer-"], .framer', context: 'brand', weight: 70 },
  
  // Form elements
  { selector: 'input:focus, textarea:focus, select:focus, [class*="focus"]', context: 'form', weight: 70 },
  { selector: '.form-control:focus, .input:focus, .form-input:focus', context: 'form', weight: 70 },
  
  // Status/State elements
  { selector: '.active, .current, .selected, [aria-selected="true"], [aria-current]', context: 'status', weight: 75 },
  { selector: '.badge, .tag, .label, [class*="badge"], [class*="tag"]', context: 'status', weight: 65 },
  { selector: '.alert, .notification, .toast, [role="alert"]', context: 'status', weight: 60 },
  
  // Links (especially primary/styled ones)
  { selector: 'a[class*="primary"], a[class*="button"], .link-primary', context: 'link', weight: 60 },
  
  // Accent elements
  { selector: '.accent, .highlight, .featured, [class*="accent"]', context: 'accent', weight: 70 },
  
  // Headers/Titles
  { selector: 'h1, .title, .page-title, [class*="title"]', context: 'header', weight: 50 }
] as const;

// Color extraction regex
const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/g;

// CSS properties that can contain colors
const COLOR_PROPERTIES = [
  'color',
  'background-color', 
  'background',
  'border-color',
  'border-top-color',
  'border-right-color', 
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke'
];

/**
 * Calculate DOM depth (distance from body)
 */
function getDomDepth(element: Element): number {
  let depth = 0;
  let current = element.parentElement;
  while (current && current.tagName !== 'BODY') {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

/**
 * Estimate document position (0 = top, 1 = bottom)
 */
function getDocumentPosition(element: Element, allElements: Element[]): number {
  // Simple approximation: use the element's index in document order
  const index = Array.from(allElements).indexOf(element);
  return index / Math.max(allElements.length - 1, 1);
}

/**
 * Extract colors from inline styles with positional data
 */
function extractInlineColors(element: Element, firstSeenColors: Map<string, number>, allElements: Element[]): Array<{ color: string; property: string; domDepth: number; documentPosition: number; firstSeenIndex: number }> {
  const colors: Array<{ color: string; property: string; domDepth: number; documentPosition: number; firstSeenIndex: number }> = [];
  const style = (element as HTMLElement).style;
  const domDepth = getDomDepth(element);
  const documentPosition = getDocumentPosition(element, allElements);
  
  for (const prop of COLOR_PROPERTIES) {
    const value = style.getPropertyValue(prop);
    if (value) {
      const matches = value.match(COLOR_REGEX);
      if (matches) {
        matches.forEach(color => {
          // Track first-seen order
          if (!firstSeenColors.has(color)) {
            firstSeenColors.set(color, firstSeenColors.size);
          }
          const firstSeenIndex = firstSeenColors.get(color) || 0;
          
          colors.push({ 
            color, 
            property: prop, 
            domDepth, 
            documentPosition, 
            firstSeenIndex 
          });
        });
      }
    }
  }
  
  return colors;
}

/**
 * Extract computed colors from CSS using a more sophisticated approach
 * This analyzes the DOM elements and tries to find CSS rules that might apply
 */
function extractComputedColorsFromElements(css: string, elements: NodeListOf<Element>, context: string): Array<{ color: string; property: string; element: Element }> {
  const colors: Array<{ color: string; property: string; element: Element }> = [];
  
  // Extract all CSS class names and IDs from the elements
  const classNames = new Set<string>();
  const ids = new Set<string>();
  const tagNames = new Set<string>();
  
  elements.forEach(element => {
    // Collect class names
    if (element.className && typeof element.className === 'string') {
      element.className.split(/\s+/).forEach(cls => {
        if (cls.trim()) classNames.add(cls.trim());
      });
    }
    
    // Collect IDs
    if (element.id) {
      ids.add(element.id);
    }
    
    // Collect tag names
    tagNames.add(element.tagName.toLowerCase());
  });
  
  // Analyze CSS for rules that might apply to these elements
  const cssLines = css.split('\n');
  let currentRule: { selector: string; declarations: Array<{ prop: string; value: string }> } | null = null;
  
  for (let i = 0; i < cssLines.length; i++) {
    const line = cssLines[i].trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith('/*') || line.startsWith('//')) continue;
    
    // Check if this line starts a new CSS rule
    if (line.includes('{') && !line.includes('}')) {
      const selectorPart = line.substring(0, line.indexOf('{')).trim();
      currentRule = { selector: selectorPart, declarations: [] };
      continue;
    }
    
    // Check if we're in a rule and this line has declarations
    if (currentRule && line.includes(':') && !line.startsWith('@')) {
      const colonIndex = line.indexOf(':');
      const prop = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).replace(/[;}]/g, '').trim();
      
      if (COLOR_PROPERTIES.includes(prop)) {
        currentRule.declarations.push({ prop, value });
      }
    }
    
    // Check if rule ends
    if (line.includes('}') && currentRule) {
      // Check if this rule might apply to our elements
      const selector = currentRule.selector.toLowerCase();
      let ruleMatches = false;
      
      // Check for tag name matches
      for (const tag of tagNames) {
        if (selector.includes(tag)) {
          ruleMatches = true;
          break;
        }
      }
      
      // Check for class name matches
      if (!ruleMatches) {
        for (const className of classNames) {
          if (selector.includes(`.${className}`) || selector.includes(`[class*="${className}"]`)) {
            ruleMatches = true;
            break;
          }
        }
      }
      
      // Check for ID matches
      if (!ruleMatches) {
        for (const id of ids) {
          if (selector.includes(`#${id}`)) {
            ruleMatches = true;
            break;
          }
        }
      }
      
      // Check for attribute selectors that might match button types
      if (!ruleMatches && context === 'button') {
        if (selector.includes('[type="submit"]') || 
            selector.includes('[type="button"]') || 
            selector.includes('[role="button"]')) {
          ruleMatches = true;
        }
      }
      
      // If rule matches, extract colors
      if (ruleMatches) {
        currentRule.declarations.forEach(({ prop, value }) => {
          const matches = value.match(COLOR_REGEX);
          if (matches) {
            matches.forEach(color => {
              // Try to associate with specific element if possible
              const targetElement = Array.from(elements)[0]; // Use first element as representative
              colors.push({ color, property: prop, element: targetElement });
            });
          }
        });
      }
      
      currentRule = null;
    }
  }
  
  return colors;
}

/**
 * Extract colors from computed styles (if available in browser context)
 * This is a fallback method for when CSS parsing doesn't work well
 */
function extractComputedStyleColors(element: Element): Array<{ color: string; property: string }> {
  const colors: Array<{ color: string; property: string }> = [];
  
  // In a real browser environment, we could use getComputedStyle
  // For now, we'll check common style attributes that might be present
  const htmlElement = element as HTMLElement;
  
  // Check for style attributes that might contain colors
  const bgColor = htmlElement.style.backgroundColor;
  const textColor = htmlElement.style.color;
  const borderColor = htmlElement.style.borderColor;
  
  if (bgColor) {
    const matches = bgColor.match(COLOR_REGEX);
    if (matches) matches.forEach(color => colors.push({ color, property: 'background-color' }));
  }
  
  if (textColor) {
    const matches = textColor.match(COLOR_REGEX);
    if (matches) matches.forEach(color => colors.push({ color, property: 'color' }));
  }
  
  if (borderColor) {
    const matches = borderColor.match(COLOR_REGEX);
    if (matches) matches.forEach(color => colors.push({ color, property: 'border-color' }));
  }
  
  return colors;
}

/**
 * Extract colors from CSS based on context-specific patterns
 * This is especially important for Angular/React apps where DOM elements might not be present
 */
function extractContextSpecificColors(elements: NodeListOf<Element>, context: string, css: string): Array<{ color: string; property: string; frequency: number }> {
  const colors: Array<{ color: string; property: string; frequency: number }> = [];
  
  // Context-specific CSS patterns to match even when DOM elements aren't found
  const patterns: Record<string, RegExp[]> = {
    'button': [
      /\.btn[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /button[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.cta[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.primary[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
    ],
    'header': [
      // Enhanced header patterns for Angular/React apps
      /header[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.header[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.spirit-header[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.masthead[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.topbar[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.site-header[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.page-header[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      // Angular/React specific patterns
      /\[.*\]\s*header[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /header\[.*\][^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
    ],
    'hero': [
      /\.hero[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.banner[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.jumbotron[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
    ],
    'navigation': [
      /nav[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.nav[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.navbar[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
    ],
    'brand': [
      /\.logo[^{]*\{[^}]*(?:background(?:-color)?|color)[^:]*:\s*([^;}]+)/gi,
      /\.brand[^{]*\{[^}]*(?:background(?:-color)?|color)[^:]*:\s*([^;}]+)/gi,
      /footer[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
      /\.footer[^{]*\{[^}]*background(?:-color)?[^:]*:\s*([^;}]+)/gi,
    ]
  };

  const contextPatterns = patterns[context] || [];
  
  contextPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(css)) !== null) {
      const colorValue = match[1].trim();
      
      // Extract colors from the matched value
      const colorMatches = colorValue.match(COLOR_REGEX);
      if (colorMatches) {
        colorMatches.forEach(color => {
          const normalizedColor = color.toLowerCase().trim();
          if (normalizedColor && normalizedColor !== 'transparent' && normalizedColor !== 'inherit') {
            colors.push({
              color: normalizedColor,
              property: 'background-color',
              frequency: 1
            });
          }
        });
      }
    }
  });

  // Additional: Look for CSS custom properties that match context
  if (context === 'header' || context === 'brand') {
    const customPropertyPattern = /--(?:header|brand|primary|main)[^:]*:\s*([^;}]+)/gi;
    let match;
    while ((match = customPropertyPattern.exec(css)) !== null) {
      const colorValue = match[1].trim();
      const colorMatches = colorValue.match(COLOR_REGEX);
      if (colorMatches) {
        colorMatches.forEach(color => {
          colors.push({
            color: color.toLowerCase().trim(),
            property: 'background-color',
            frequency: 2 // Higher frequency for custom properties
          });
        });
      }
    }
  }
  
  return colors;
}

/**
 * Main semantic color analysis function
 */
export function analyzeSemanticColors(html: string, css: string): SemanticColorAnalysis {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  const semanticColors: SemanticColorData[] = [];
  const colorCounts = new Map<string, number>();
  
  // NEW: Track first-seen order and get all elements for positional calculations
  const firstSeenColors = new Map<string, number>();
  const allElements = Array.from(document.querySelectorAll('*'));
  
  console.log('🎨 Starting semantic color analysis...');
  
  // Analyze Tailwind usage
  const tailwindAnalysis = analyzeTailwindUsage(html);
  if (tailwindAnalysis.hasTailwind) {
    console.log(`🎨 Tailwind detected: ${tailwindAnalysis.totalTailwindClasses} classes, ${tailwindAnalysis.tailwindColors.length} color instances`);
    
    // Add Tailwind colors to semantic analysis
    tailwindAnalysis.tailwindColors.forEach(({ color, property, className, frequency }) => {
      // Determine context based on property
      let context: SemanticColorData['context'] = 'accent';
      if (property === 'background-color') context = 'brand';
      if (className.includes('btn') || className.includes('button')) context = 'button';
      
      semanticColors.push({
        color,
        element: 'tailwind-class',
        context,
        weight: 60, // Medium weight for Tailwind colors
        selector: className,
        property,
        frequency
      });
      
      colorCounts.set(color, (colorCounts.get(color) || 0) + frequency);
    });
  }
  
  // Analyze each semantic selector
  for (const { selector, context, weight } of SEMANTIC_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      console.log(`  Analyzing ${elements.length} elements for: ${context} (${selector})`);
      
      elements.forEach((element) => {
        // Extract inline colors
        const inlineColors = extractInlineColors(element, firstSeenColors, allElements);
        
        inlineColors.forEach(({ color, property, domDepth, documentPosition, firstSeenIndex }) => {
          const key = `${color}-${context}-${property}`;
          const existing = semanticColors.find(sc => 
            sc.color === color && sc.context === context && sc.property === property
          );
          
          if (existing) {
            existing.frequency += 1;
          } else {
            semanticColors.push({
              color,
              element: element.tagName.toLowerCase(),
              context,
              weight,
              selector,
              property,
              frequency: 1,
              domDepth,
              documentPosition,
              firstSeenIndex
            });
          }
          
          colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        });
        
        // Also try computed style extraction for each element
        const computedColors = extractComputedStyleColors(element);
        computedColors.forEach(({ color, property }) => {
          const existing = semanticColors.find(sc => 
            sc.color === color && sc.context === context && sc.property === property
          );
          
          if (existing) {
            existing.frequency += 1;
          } else {
            semanticColors.push({
              color,
              element: element.tagName.toLowerCase(),
              context,
              weight,
              selector,
              property,
              frequency: 1
            });
          }
          
          colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        });
      });
      
      // Also analyze CSS rules that might apply to these elements
      const cssColors = extractComputedColorsFromElements(css, elements, context);
      cssColors.forEach(({ color, property, element }) => {
        const existing = semanticColors.find(sc => 
          sc.color === color && sc.context === context && sc.property === property && sc.element === element.tagName.toLowerCase()
        );
        
        if (existing) {
          existing.frequency += 1;
        } else {
          semanticColors.push({
            color,
            element: element.tagName.toLowerCase(),
            context,
            weight,
            selector,
            property,
            frequency: 1
          });
        }
        
        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
      });
      
      // Try context-specific extraction patterns
      const contextColors = extractContextSpecificColors(elements, context, css);
      contextColors.forEach(({ color, property, frequency }) => {
        const existing = semanticColors.find(sc => 
          sc.color === color && sc.context === context && sc.property === property
        );
        
        if (existing) {
          existing.frequency += frequency;
        } else {
          semanticColors.push({
            color,
            element: 'css-pattern',
            context,
            weight,
            selector,
            property,
            frequency
          });
        }
        
        colorCounts.set(color, (colorCounts.get(color) || 0) + frequency);
      });
    } catch (error) {
      console.warn(`Error analyzing selector "${selector}":`, error);
    }
  }
  
  // Sort by weight and frequency
  semanticColors.sort((a, b) => {
    const aScore = a.weight * a.frequency;
    const bScore = b.weight * b.frequency;
    return bScore - aScore;
  });
  
  // Build summary
  const colorsByContext: Record<string, string[]> = {};
  const buttonColors: string[] = [];
  const brandColors: string[] = [];
  
  semanticColors.forEach(sc => {
    if (!colorsByContext[sc.context]) {
      colorsByContext[sc.context] = [];
    }
    if (!colorsByContext[sc.context].includes(sc.color)) {
      colorsByContext[sc.context].push(sc.color);
    }
    
    if (sc.context === 'button' && !buttonColors.includes(sc.color)) {
      buttonColors.push(sc.color);
    }
    
    // Enhanced brand color detection - headers are brand-critical!
    if ((sc.context === 'brand' || sc.context === 'hero' || sc.context === 'header') && !brandColors.includes(sc.color)) {
      brandColors.push(sc.color);
    }
  });
  
  const highestWeightColors = semanticColors
    .slice(0, 10)
    .map(sc => sc.color)
    .filter((color, index, arr) => arr.indexOf(color) === index);
  
  console.log(`✅ Found ${semanticColors.length} semantic color instances`);
  console.log(`🎯 Button colors: ${buttonColors.length}`);
  console.log(`🏢 Brand colors: ${brandColors.length}`);
  
  return {
    colors: semanticColors,
    summary: {
      totalElements: semanticColors.length,
      colorsByContext,
      highestWeightColors,
      buttonColors,
      brandColors
    },
    tailwind: tailwindAnalysis.hasTailwind ? {
      detected: true,
      totalClasses: tailwindAnalysis.totalTailwindClasses,
      colorClasses: tailwindAnalysis.colorClasses,
      colors: tailwindAnalysis.tailwindColors
    } : undefined
  };
}

/**
 * Merge semantic colors with existing color frequency data
 */
export function enhanceColorsWithSemantic(
  cssColors: { value: string; count: number }[],
  semanticAnalysis: SemanticColorAnalysis
): { value: string; count: number; semanticWeight: number; contexts: string[] }[] {
  
  const enhanced = cssColors.map(cssColor => ({
    ...cssColor,
    semanticWeight: 0,
    contexts: [] as string[]
  }));
  
  // Boost colors found in semantic contexts
  semanticAnalysis.colors.forEach(semanticColor => {
    const existing = enhanced.find(c => 
      c.value.toLowerCase() === semanticColor.color.toLowerCase()
    );
    
    if (existing) {
      // Add semantic weight boost
      existing.semanticWeight += semanticColor.weight * semanticColor.frequency;
      
      // Track contexts
      if (!existing.contexts.includes(semanticColor.context)) {
        existing.contexts.push(semanticColor.context);
      }
    } else {
      // Add new color from semantic analysis
      enhanced.push({
        value: semanticColor.color,
        count: semanticColor.frequency,
        semanticWeight: semanticColor.weight * semanticColor.frequency,
        contexts: [semanticColor.context]
      });
    }
  });
  
  // Sort by combined weight (CSS frequency + semantic importance)
  return enhanced.sort((a, b) => {
    const aScore = a.count + (a.semanticWeight * 0.5); // Weight semantic data at 50% of CSS frequency
    const bScore = b.count + (b.semanticWeight * 0.5);
    return bScore - aScore;
  });
}

/**
 * Extract colors from Tailwind CSS classes
 */
function extractTailwindColors(html: string): Array<{ color: string; property: string; className: string; frequency: number }> {
  const colors: Array<{ color: string; property: string; className: string; frequency: number }> = [];
  
  // Tailwind color mapping (subset of most common colors)
  const tailwindColors: Record<string, string> = {
    // Red
    'red-50': '#fef2f2', 'red-100': '#fee2e2', 'red-200': '#fecaca', 'red-300': '#fca5a5',
    'red-400': '#f87171', 'red-500': '#ef4444', 'red-600': '#dc2626', 'red-700': '#b91c1c',
    'red-800': '#991b1b', 'red-900': '#7f1d1d', 'red-950': '#450a0a',
    
    // Blue  
    'blue-50': '#eff6ff', 'blue-100': '#dbeafe', 'blue-200': '#bfdbfe', 'blue-300': '#93c5fd',
    'blue-400': '#60a5fa', 'blue-500': '#3b82f6', 'blue-600': '#2563eb', 'blue-700': '#1d4ed8',
    'blue-800': '#1e40af', 'blue-900': '#1e3a8a', 'blue-950': '#172554',
    
    // Green
    'green-50': '#f0fdf4', 'green-100': '#dcfce7', 'green-200': '#bbf7d0', 'green-300': '#86efac',
    'green-400': '#4ade80', 'green-500': '#22c55e', 'green-600': '#16a34a', 'green-700': '#15803d',
    'green-800': '#166534', 'green-900': '#14532d', 'green-950': '#052e16',
    
    // Purple
    'purple-50': '#faf5ff', 'purple-100': '#f3e8ff', 'purple-200': '#e9d5ff', 'purple-300': '#d8b4fe',
    'purple-400': '#c084fc', 'purple-500': '#a855f7', 'purple-600': '#9333ea', 'purple-700': '#7c3aed',
    'purple-800': '#6b21a8', 'purple-900': '#581c87', 'purple-950': '#3b0764',
    
    // Yellow
    'yellow-50': '#fefce8', 'yellow-100': '#fef3c7', 'yellow-200': '#fde68a', 'yellow-300': '#fcd34d',
    'yellow-400': '#fbbf24', 'yellow-500': '#f59e0b', 'yellow-600': '#d97706', 'yellow-700': '#b45309',
    'yellow-800': '#92400e', 'yellow-900': '#78350f', 'yellow-950': '#451a03',
    
    // Lime (NEW - common for brands like the user's example)
    'lime-50': '#f7fee7', 'lime-100': '#ecfccb', 'lime-200': '#d9f99d', 'lime-300': '#bef264',
    'lime-400': '#a3e635', 'lime-500': '#84cc16', 'lime-600': '#65a30d', 'lime-700': '#4d7c0f',
    'lime-800': '#365314', 'lime-900': '#1a2e05', 'lime-950': '#0f1711',
    
    // Emerald
    'emerald-50': '#ecfdf5', 'emerald-100': '#d1fae5', 'emerald-200': '#a7f3d0', 'emerald-300': '#6ee7b7',
    'emerald-400': '#34d399', 'emerald-500': '#10b981', 'emerald-600': '#059669', 'emerald-700': '#047857',
    'emerald-800': '#065f46', 'emerald-900': '#064e3b', 'emerald-950': '#022c22',
    
    // Gray
    'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb', 'gray-300': '#d1d5db',
    'gray-400': '#9ca3af', 'gray-500': '#6b7280', 'gray-600': '#4b5563', 'gray-700': '#374151',
    'gray-800': '#1f2937', 'gray-900': '#111827', 'gray-950': '#030712',
    
    // Indigo
    'indigo-50': '#eef2ff', 'indigo-100': '#e0e7ff', 'indigo-200': '#c7d2fe', 'indigo-300': '#a5b4fc',
    'indigo-400': '#818cf8', 'indigo-500': '#6366f1', 'indigo-600': '#4f46e5', 'indigo-700': '#4338ca',
    'indigo-800': '#3730a3', 'indigo-900': '#312e81', 'indigo-950': '#1e1b4b',
    
    // Pink
    'pink-50': '#fdf2f8', 'pink-100': '#fce7f3', 'pink-200': '#fbcfe8', 'pink-300': '#f9a8d4',
    'pink-400': '#f472b6', 'pink-500': '#ec4899', 'pink-600': '#db2777', 'pink-700': '#be185d',
    'pink-800': '#9d174d', 'pink-900': '#831843', 'pink-950': '#500724',
    
    // Orange
    'orange-50': '#fff7ed', 'orange-100': '#ffedd5', 'orange-200': '#fed7aa', 'orange-300': '#fdba74',
    'orange-400': '#fb923c', 'orange-500': '#f97316', 'orange-600': '#ea580c', 'orange-700': '#c2410c',
    'orange-800': '#9a3412', 'orange-900': '#7c2d12', 'orange-950': '#431407',
    
    // Common colors
    'white': '#ffffff', 'black': '#000000',
    'transparent': 'transparent', 'current': 'currentColor'
  };
  
  // Tailwind class patterns (enhanced)
  const tailwindPatterns = [
    // Background colors
    { pattern: /\bbg-(\w+(?:-\d+)?)\b/g, property: 'background-color' },
    // Arbitrary background values bg-[#color]
    { pattern: /\bbg-\[([#][0-9a-fA-F]{3,8})\]/g, property: 'background-color', isArbitrary: true },
    // Text colors  
    { pattern: /\btext-(\w+(?:-\d+)?)\b/g, property: 'color' },
    // Arbitrary text values text-[#color]
    { pattern: /\btext-\[([#][0-9a-fA-F]{3,8})\]/g, property: 'color', isArbitrary: true },
    // Border colors
    { pattern: /\bborder-(\w+(?:-\d+)?)\b/g, property: 'border-color' },
    // Arbitrary border values border-[#color]
    { pattern: /\bborder-\[([#][0-9a-fA-F]{3,8})\]/g, property: 'border-color', isArbitrary: true },
    // Ring colors
    { pattern: /\bring-(\w+(?:-\d+)?)\b/g, property: 'ring-color' },
    // Fill colors (for SVG)
    { pattern: /\bfill-(\w+(?:-\d+)?)\b/g, property: 'fill' },
    // Stroke colors (for SVG) 
    { pattern: /\bstroke-(\w+(?:-\d+)?)\b/g, property: 'stroke' }
  ];
  
  const classFrequency = new Map<string, number>();
  
  // Extract all classes from HTML
  const classMatches = html.match(/class\s*=\s*["']([^"']+)["']/gi);
  if (classMatches) {
    classMatches.forEach(match => {
      const classContent = match.match(/["']([^"']+)["']/)?.[1];
      if (classContent) {
        const classes = classContent.split(/\s+/);
        classes.forEach(cls => {
          classFrequency.set(cls, (classFrequency.get(cls) || 0) + 1);
        });
      }
    });
  }
  
  // Process Tailwind patterns
  tailwindPatterns.forEach(({ pattern, property, isArbitrary }) => {
    classFrequency.forEach((frequency, className) => {
      const matches = [...className.matchAll(pattern)];
      matches.forEach(match => {
        let hexColor: string | undefined;
        
        if (isArbitrary) {
          // For arbitrary values like bg-[#d8e843], extract the hex directly
          hexColor = match[1];
        } else {
          // For standard Tailwind classes, look up in mapping
          const colorKey = match[1];
          hexColor = tailwindColors[colorKey];
        }
        
        if (hexColor && hexColor !== 'transparent' && hexColor !== 'currentColor') {
          colors.push({
            color: hexColor,
            property,
            className,
            frequency
          });
        }
      });
    });
  });
  
  return colors;
}

/**
 * Analyze Tailwind usage in the HTML
 */
function analyzeTailwindUsage(html: string): {
  hasTailwind: boolean;
  totalTailwindClasses: number;
  colorClasses: string[];
  tailwindColors: Array<{ color: string; property: string; className: string; frequency: number }>;
} {
  const tailwindColors = extractTailwindColors(html);
  
  // Detect common Tailwind patterns
  const tailwindIndicators = [
    /\b(?:bg|text|border|ring|fill|stroke)-\w+(?:-\d+)?\b/g,
    /\b(?:p|m|px|py|mx|my)-\d+\b/g,
    /\b(?:w|h)-\d+\b/g,
    /\bflex\b/g,
    /\bgrid\b/g,
    /\bhidden\b/g,
    /\bblock\b/g
  ];
  
  let totalTailwindClasses = 0;
  const colorClasses: string[] = [];
  
  tailwindIndicators.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      totalTailwindClasses += matches.length;
    }
  });
  
  // Extract color class names
  const colorClassPattern = /\b(?:bg|text|border|ring|fill|stroke)-\w+(?:-\d+)?\b/g;
  const colorMatches = html.match(colorClassPattern);
  if (colorMatches) {
    colorClasses.push(...colorMatches);
  }
  
  return {
    hasTailwind: totalTailwindClasses > 10, // Threshold for Tailwind detection
    totalTailwindClasses,
    colorClasses: Array.from(new Set(colorClasses)),
    tailwindColors
  };
} 