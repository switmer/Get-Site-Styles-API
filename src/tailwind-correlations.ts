import type { ExtractedTokens, TailwindCorrelations } from './types';

// Tailwind's default design system for reference
const TAILWIND_SPACING = [
  '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', 
  '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96'
];

const TAILWIND_FONT_SIZES = [
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'
];

const TAILWIND_BORDER_RADIUS = [
  'none', 'sm', '', 'md', 'lg', 'xl', '2xl', '3xl', 'full'
];

const TAILWIND_COLORS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 
  'purple', 'fuchsia', 'pink', 'rose'
];

// Convert various units to rem for comparison
function normalizeToRem(value: string): number | null {
  if (value.includes('rem')) {
    return parseFloat(value);
  } else if (value.includes('em')) {
    return parseFloat(value); // Assume em ≈ rem for this comparison
  } else if (value.includes('px')) {
    return parseFloat(value) / 16; // 16px = 1rem
  } else if (value === '0' || value === '0px') {
    return 0;
  }
  return null;
}

// Find closest Tailwind spacing value
function findClosestSpacing(value: string): string[] {
  const remValue = normalizeToRem(value);
  if (remValue === null) return [];
  
  // Tailwind spacing: 0.25rem increments for small values, then jumps
  const tailwindValues = [
    { tw: '0', rem: 0 },
    { tw: '0.5', rem: 0.125 },
    { tw: '1', rem: 0.25 },
    { tw: '1.5', rem: 0.375 },
    { tw: '2', rem: 0.5 },
    { tw: '2.5', rem: 0.625 },
    { tw: '3', rem: 0.75 },
    { tw: '3.5', rem: 0.875 },
    { tw: '4', rem: 1 },
    { tw: '5', rem: 1.25 },
    { tw: '6', rem: 1.5 },
    { tw: '7', rem: 1.75 },
    { tw: '8', rem: 2 },
    { tw: '9', rem: 2.25 },
    { tw: '10', rem: 2.5 },
    { tw: '11', rem: 2.75 },
    { tw: '12', rem: 3 },
    { tw: '14', rem: 3.5 },
    { tw: '16', rem: 4 },
    { tw: '20', rem: 5 },
    { tw: '24', rem: 6 },
    { tw: '28', rem: 7 },
    { tw: '32', rem: 8 },
    { tw: '36', rem: 9 },
    { tw: '40', rem: 10 },
    { tw: '44', rem: 11 },
    { tw: '48', rem: 12 },
    { tw: '52', rem: 13 },
    { tw: '56', rem: 14 },
    { tw: '60', rem: 15 },
    { tw: '64', rem: 16 },
    { tw: '72', rem: 18 },
    { tw: '80', rem: 20 },
    { tw: '96', rem: 24 }
  ];
  
  // Find closest match
  const closest = tailwindValues.reduce((prev, curr) => 
    Math.abs(curr.rem - remValue) < Math.abs(prev.rem - remValue) ? curr : prev
  );
  
  const tolerance = 0.125; // Allow some tolerance
  if (Math.abs(closest.rem - remValue) <= tolerance) {
    return [`space-${closest.tw}`, `p-${closest.tw}`, `m-${closest.tw}`, `gap-${closest.tw}`];
  }
  
  return [];
}

// Find closest Tailwind font size
function findClosestFontSize(value: string): string[] {
  const remValue = normalizeToRem(value);
  if (remValue === null) return [];
  
  const tailwindFontSizes = [
    { tw: 'xs', rem: 0.75 },
    { tw: 'sm', rem: 0.875 },
    { tw: 'base', rem: 1 },
    { tw: 'lg', rem: 1.125 },
    { tw: 'xl', rem: 1.25 },
    { tw: '2xl', rem: 1.5 },
    { tw: '3xl', rem: 1.875 },
    { tw: '4xl', rem: 2.25 },
    { tw: '5xl', rem: 3 },
    { tw: '6xl', rem: 3.75 },
    { tw: '7xl', rem: 4.5 },
    { tw: '8xl', rem: 6 },
    { tw: '9xl', rem: 8 }
  ];
  
  const closest = tailwindFontSizes.reduce((prev, curr) => 
    Math.abs(curr.rem - remValue) < Math.abs(prev.rem - remValue) ? curr : prev
  );
  
  const tolerance = 0.125;
  if (Math.abs(closest.rem - remValue) <= tolerance) {
    return [`text-${closest.tw}`];
  }
  
  return [];
}

// Find closest Tailwind border radius
function findClosestBorderRadius(value: string): string[] {
  const remValue = normalizeToRem(value);
  if (remValue === null) return [];
  
  const tailwindRadii = [
    { tw: 'none', rem: 0 },
    { tw: 'sm', rem: 0.125 },
    { tw: '', rem: 0.25 },
    { tw: 'md', rem: 0.375 },
    { tw: 'lg', rem: 0.5 },
    { tw: 'xl', rem: 0.75 },
    { tw: '2xl', rem: 1 },
    { tw: '3xl', rem: 1.5 }
  ];
  
  const closest = tailwindRadii.reduce((prev, curr) => 
    Math.abs(curr.rem - remValue) < Math.abs(prev.rem - remValue) ? curr : prev
  );
  
  const tolerance = 0.0625;
  if (Math.abs(closest.rem - remValue) <= tolerance) {
    const suffix = closest.tw ? `-${closest.tw}` : '';
    return [`rounded${suffix}`];
  }
  
  return [];
}

// Analyze color similarity to Tailwind palette
function findSimilarTailwindColors(hex: string): string[] {
  // This is a simplified approach - in a full implementation, you'd want
  // to calculate color distance in LAB color space
  const h = hex.toLowerCase();
  
  const colorMatches: string[] = [];
  
  // Basic color matching based on hex patterns
  if (h.match(/^#(ff|f[0-9a-f]|[0-9a-f]f)/)) colorMatches.push('red');
  if (h.match(/^#(00|0[0-9a-f]|[0-9a-f]0)/)) colorMatches.push('green', 'emerald', 'teal');
  if (h.match(/^#([0-9a-f]{2}[0-9a-f]{2}ff|[0-9a-f]{2}[0-9a-f]{2}f[0-9a-f])/)) colorMatches.push('blue', 'sky', 'cyan');
  if (h.match(/^#(ff[0-9a-f]{2}ff|f[0-9a-f][0-9a-f]f[0-9a-f])/)) colorMatches.push('purple', 'violet', 'fuchsia');
  if (h.match(/^#(ff[0-9a-f]{2}[0-9a-f]{2})/)) colorMatches.push('orange', 'amber', 'yellow');
  if (h.match(/^#([0-9a-f])\1\1/)) colorMatches.push('gray', 'slate', 'zinc');
  
  // Add common exact matches
  const exactMatches: Record<string, string[]> = {
    '#ffffff': ['white'],
    '#000000': ['black'],
    '#f3f4f6': ['gray-100'],
    '#e5e7eb': ['gray-200'],
    '#d1d5db': ['gray-300'],
    '#9ca3af': ['gray-400'],
    '#6b7280': ['gray-500'],
    '#374151': ['gray-700'],
    '#1f2937': ['gray-800'],
    '#111827': ['gray-900']
  };
  
  if (exactMatches[h]) {
    colorMatches.push(...exactMatches[h]);
  }
  
  return colorMatches;
}

// Map font families to Tailwind equivalents
function mapFontFamily(fontFamily: string): string[] {
  const family = fontFamily.toLowerCase().trim();
  
  if (family.includes('inter') || family.includes('system-ui')) {
    return ['font-sans'];
  }
  if (family.includes('mono') || family.includes('courier') || family.includes('consolas')) {
    return ['font-mono'];
  }
  if (family.includes('serif') || family.includes('times') || family.includes('georgia')) {
    return ['font-serif'];
  }
  
  return ['font-sans']; // Default fallback
}

export function generateTailwindCorrelations(tokens: ExtractedTokens): TailwindCorrelations {
  const correlations: TailwindCorrelations = {
    colors: {},
    spacing: {},
    fontSize: {},
    borderRadius: {},
    fontFamily: {}
  };
  
  // Map colors
  tokens.colors.values.forEach(color => {
    if (color.startsWith('#')) {
      const tailwindColors = findSimilarTailwindColors(color);
      if (tailwindColors.length > 0) {
        correlations.colors[color] = tailwindColors;
      }
    }
  });
  
  // Map spacing
  tokens.spacing.values.forEach(spacing => {
    const tailwindSpacing = findClosestSpacing(spacing);
    if (tailwindSpacing.length > 0) {
      correlations.spacing[spacing] = tailwindSpacing;
    }
  });
  
  // Map font sizes
  tokens.fontSizes.values.forEach(fontSize => {
    const tailwindFontSize = findClosestFontSize(fontSize);
    if (tailwindFontSize.length > 0) {
      correlations.fontSize[fontSize] = tailwindFontSize;
    }
  });
  
  // Map border radius
  tokens.radii.values.forEach(radius => {
    const tailwindRadius = findClosestBorderRadius(radius);
    if (tailwindRadius.length > 0) {
      correlations.borderRadius[radius] = tailwindRadius;
    }
  });
  
  // Map font families
  tokens.fontFamilies.values.forEach(fontFamily => {
    const tailwindFontFamily = mapFontFamily(fontFamily);
    correlations.fontFamily[fontFamily] = tailwindFontFamily;
  });
  
  return correlations;
} 