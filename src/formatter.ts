// Formatter for output formats: json, style-dictionary, shadcn, tailwind, theme-json
import type { Options } from './types/formatter';
import { analyzeColors, generateShadcnTheme, convertColorToFormat, getForegroundColor } from './color-analysis';

// Normalize color to hex format for consistent output
function normalizeColorToHex(color: string): string {
  if (!color || typeof color !== 'string') return color;
  
  // Already hex, just clean it up
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    // Convert 3-digit to 6-digit hex
    if (hex.length === 3) {
      return '#' + hex.split('').map(char => char + char).join('');
    }
    // Strip alpha if present (8-digit hex)
    if (hex.length === 8) {
      return '#' + hex.substring(0, 6);
    }
    return color;
  }
  
  // Handle rgb/rgba format
  if (color.startsWith('rgb')) {
    const rgbMatch = color.match(/rgba?\(([^,]+),\s*([^,]+),\s*([^,]+)/);
    if (rgbMatch) {
      const r = Math.round(parseFloat(rgbMatch[1].trim()));
      const g = Math.round(parseFloat(rgbMatch[2].trim()));
      const b = Math.round(parseFloat(rgbMatch[3].trim()));
      
      // Convert to hex
      const toHex = (n: number) => {
        const hex = n.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  }
  
  // Handle hsl/hsla format - convert to RGB first, then hex
  if (color.startsWith('hsl')) {
    const hslMatch = color.match(/hsla?\(([^,]+),\s*([^,]+)%?,\s*([^,]+)%?/);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1].trim()) / 360;
      const s = parseFloat(hslMatch[2].trim()) / 100;
      const l = parseFloat(hslMatch[3].trim()) / 100;
      
      // HSL to RGB conversion
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      let r, g, b;
      if (s === 0) {
        r = g = b = l; // achromatic
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      
      const rInt = Math.round(r * 255);
      const gInt = Math.round(g * 255);
      const bInt = Math.round(b * 255);
      
      const toHex = (n: number) => {
        const hex = n.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      
      return `#${toHex(rInt)}${toHex(gInt)}${toHex(bInt)}`;
    }
  }
  
  // Return as-is if we can't normalize
  return color;
}
import { generateTailwindCorrelations } from './tailwind-correlations';

// Import colorToHsl for theme-json format
function colorToHsl(color: string): { h: number; s: number; l: number } {
  let r = 0, g = 0, b = 0;
  
  // Handle different color formats
  if (color.startsWith('#')) {
    // Hex format
    const hex = color.replace('#', '');
    
    // Convert 3-digit hex to 6-digit
    const fullHex = hex.length === 3 
      ? hex.split('').map(char => char + char).join('')
      : hex;
    
    r = parseInt(fullHex.substr(0, 2), 16) / 255;
    g = parseInt(fullHex.substr(2, 2), 16) / 255;
    b = parseInt(fullHex.substr(4, 2), 16) / 255;
  } else if (color.startsWith('rgb')) {
    // RGB/RGBA format - extract numbers
    const rgbMatch = color.match(/rgba?\(([^)]+)\)/);
    if (rgbMatch) {
      const values = rgbMatch[1].split(',').map(v => parseFloat(v.trim()));
      r = values[0] / 255;
      g = values[1] / 255;
      b = values[2] / 255;
    }
  } else {
    // Try to treat as hex without #
    try {
      const fullHex = color.length === 3 
        ? color.split('').map(char => char + char).join('')
        : color;
      
      r = parseInt(fullHex.substr(0, 2), 16) / 255;
      g = parseInt(fullHex.substr(2, 2), 16) / 255;
      b = parseInt(fullHex.substr(4, 2), 16) / 255;
    } catch {
      // Default to black if parsing fails
      return { h: 0, s: 0, l: 0 };
    }
  }
  
  // Convert RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / diff + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / diff + 2) / 6; break;
      case b: h = ((r - g) / diff + 4) / 6; break;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function formatOutput(tokens: any, meta: any, options: Options): any {
  const format = options.format || 'json';
  
  if (format === 'shadcn') {
    // Prepare semantic data for enhanced color analysis
    let semanticData: Array<{ color: string; domDepth?: number; firstSeenIndex?: number; documentPosition?: number; weight: number; context: string }> | undefined;
    
    if (meta.semanticAnalysis?.colors) {
      semanticData = meta.semanticAnalysis.colors.map((item: any) => ({
        color: item.color,
        domDepth: item.domDepth,
        firstSeenIndex: item.firstSeenIndex,
        documentPosition: item.documentPosition,
        weight: item.weight,
        context: item.context
      }));
    }
    
    // Generate shadcn theme with enhanced positional analysis
    const colorAnalyses = analyzeColors(
      tokens.colors.frequency, 
      tokens.colorsFromVariables || [], 
      semanticData,
      meta.html, // Pass HTML for framework detection
      meta.css   // Pass CSS for framework detection
    );
    const colorFormat = options.colorFormat || 'hsl';
    const shadcnTheme = generateShadcnTheme(colorAnalyses, colorFormat);
    
    // Helper function to check if a color is valid and not transparent/problematic
    const isValidBrandColor = (color: string): boolean => {
      if (!color || typeof color !== 'string') return false;
      
      // Filter out CSS variable references and computed styles
      if (color.includes('var(') || color.includes('--')) return false;
      
      // Filter out malformed CSS functions
      if (color.includes('hsl(var(') || color.includes('rgb(var(') || color.includes('oklch(var(')) return false;
      
      // Filter out transparent colors, invalid colors, and common problematic patterns
      const problematicPatterns = [
        /^(transparent|inherit|initial|unset|none)$/i,
        /^#(fff|ffffff|000|000000|0000|fff0|f{3,})$/i, // Pure white/black/transparent variants
        /rgba?\([^)]*,\s*0\)/i, // Fully transparent rgba
        /rgba?\([^)]*,\s*0\.[0-2]\)/i, // Nearly transparent rgba (opacity < 0.2)
        /#[0-9a-f]{6}(00|[0-3][0-9a-f])/i, // Hex with very low alpha
        /#[0-9a-f]{3}0$/i, // 3-digit hex with zero alpha
        /^#0+$/i, // All zeros
        /var\(/i, // Any CSS variable reference
        /--[\w-]+/i, // CSS custom property names
        /\$[\w-]+/i, // Sass/SCSS variables
        /calc\(/i, // CSS calc() functions
        /url\(/i, // CSS url() functions
      ];
      
      return !problematicPatterns.some(pattern => pattern.test(color));
    };
    
    // Extract additional brand colors from semantic analysis
    const additionalBrandColors: Record<string, string> = {};
    const buttonSpecificColors: Record<string, string> = {};
    const layoutZoneColors: Record<string, string> = {};
    
    if (meta.semanticAnalysis) {
      // Get already used colors in the current format
      const usedColors = new Set([
        shadcnTheme.light['--primary'],
        shadcnTheme.light['--secondary'], 
        shadcnTheme.light['--accent']
      ]);
      
      // Add top button colors that aren't already in the main theme
      const validButtonColors = meta.semanticAnalysis.buttonColors
        .filter((color: string) => {
          // Additional validation to ensure it's a proper color value
          if (!isValidBrandColor(color)) return false;
          
          // Must start with # (hex) or be a valid rgb/hsl function
          const isProperColorFormat = 
            /^#[0-9a-f]{3,8}$/i.test(color) || 
            /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(color) ||
            /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i.test(color) ||
            /^hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)$/i.test(color) ||
            /^hsla\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*,\s*[\d.]+\s*\)$/i.test(color);
          
          return isProperColorFormat && !usedColors.has(color);
        })
        .slice(0, 5); // Take top 5 button colors
      
      validButtonColors.forEach((color: string, index: number) => {
        const normalizedColor = convertColorToFormat(normalizeColorToHex(color), colorFormat);
        buttonSpecificColors[`--button-${index + 1}`] = normalizedColor;
      });
      
      // Add semantic layout zone colors (only if we have valid, solid colors)
      if (meta.semanticAnalysis.colorsByContext) {
        const contexts = meta.semanticAnalysis.colorsByContext;
        
        // Helper to find first valid color in context
        const findValidContextColor = (contextColors: string[]) => {
          return contextColors?.find((color: string) => 
            isValidBrandColor(color) && 
            !usedColors.has(color) &&
            !color.includes('rgba') && // Avoid transparent overlays
            !color.includes('0.')  // Avoid low opacity
          );
        };
        
        // Only add layout colors if we find solid, valid colors
        const headerColor = findValidContextColor(contexts.header);
        if (headerColor) {
          const normalizedColor = convertColorToFormat(normalizeColorToHex(headerColor), colorFormat);
          layoutZoneColors['--header-background'] = normalizedColor;
          layoutZoneColors['--header-foreground'] = getForegroundColor(headerColor, colorFormat, true);
        }
        
        const heroColor = findValidContextColor(contexts.hero);
        if (heroColor && heroColor !== headerColor) {
          const normalizedColor = convertColorToFormat(normalizeColorToHex(heroColor), colorFormat);
          layoutZoneColors['--hero-background'] = normalizedColor;
          layoutZoneColors['--hero-foreground'] = getForegroundColor(heroColor, colorFormat, true);
        }
        
        const brandColor = findValidContextColor(contexts.brand);
        if (brandColor && brandColor !== headerColor && brandColor !== heroColor) {
          const normalizedColor = convertColorToFormat(normalizeColorToHex(brandColor), colorFormat);
          layoutZoneColors['--footer-background'] = normalizedColor;
          layoutZoneColors['--footer-foreground'] = getForegroundColor(brandColor, colorFormat, true);
        }
        
        const accentColor = findValidContextColor(contexts.accent);
        if (accentColor && accentColor !== headerColor && accentColor !== heroColor && accentColor !== brandColor) {
          const normalizedColor = convertColorToFormat(normalizeColorToHex(accentColor), colorFormat);
          layoutZoneColors['--section-background'] = normalizedColor;
          layoutZoneColors['--section-foreground'] = getForegroundColor(accentColor, colorFormat, true);
        }
      }
      
      // Add top brand colors with better filtering
      const validBrandColors = meta.semanticAnalysis.brandColors
        .filter((color: string) => {
          // Special handling for specific brand colors (like lime/yellow-green)
          if (color.includes('230, 255') || color.includes('237, 255') || color.includes('#d8e843') || color.includes('#e6ff')) {
            return isValidBrandColor(color);
          }
          // Standard filtering for other colors - ensure proper color format
          if (!isValidBrandColor(color) || usedColors.has(color)) return false;
          
          // Must be a proper color format
          const isProperColorFormat = 
            /^#[0-9a-f]{3,8}$/i.test(color) || 
            /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(color) ||
            /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i.test(color) ||
            /^hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)$/i.test(color) ||
            /^hsla\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*,\s*[\d.]+\s*\)$/i.test(color);
          
          return isProperColorFormat;
        })
        .slice(0, 3); // Take top 3 brand colors
      
      validBrandColors.forEach((color: string, index: number) => {
        const normalizedColor = convertColorToFormat(normalizeColorToHex(color), colorFormat);
        additionalBrandColors[`--brand-${index + 1}`] = normalizedColor;
      });
      
      // Add highest weight semantic colors as additional accents
      const validHighWeightColors = meta.semanticAnalysis.highestWeightColors
        .filter((color: string) => {
          const alreadyUsedInButtons = Object.values(buttonSpecificColors).some(used => 
            convertColorToFormat(normalizeColorToHex(color), colorFormat) === used
          );
          const alreadyUsedInLayout = Object.values(layoutZoneColors).some(used => 
            convertColorToFormat(normalizeColorToHex(color), colorFormat) === used
          );
          const alreadyUsedInBrand = Object.values(additionalBrandColors).some(used => 
            convertColorToFormat(normalizeColorToHex(color), colorFormat) === used
          );
          
          // Must be a valid brand color and proper format
          if (!isValidBrandColor(color) || usedColors.has(color)) return false;
          
          // Must be a proper color format
          const isProperColorFormat = 
            /^#[0-9a-f]{3,8}$/i.test(color) || 
            /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(color) ||
            /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i.test(color) ||
            /^hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)$/i.test(color) ||
            /^hsla\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*,\s*[\d.]+\s*\)$/i.test(color);
          
          return isProperColorFormat && 
                 !alreadyUsedInButtons &&
                 !alreadyUsedInLayout &&
                 !alreadyUsedInBrand;
        })
        .slice(0, 2); // Take top 2 high-weight colors
      
      validHighWeightColors.forEach((color: string, index: number) => {
        const normalizedColor = convertColorToFormat(normalizeColorToHex(color), colorFormat);
        additionalBrandColors[`--brand-accent-${index + 1}`] = normalizedColor;
      });
    }
    
    // Format as CSS
    const formatCssVariables = (vars: Record<string, string>) => {
      return Object.entries(vars)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');
    };
    
    let css = `:root {\n${formatCssVariables(shadcnTheme.light)}`;
    
    // Add layout zone colors to light theme
    if (Object.keys(layoutZoneColors).length > 0) {
      css += `\n\n  /* Layout Zone Colors */\n${formatCssVariables(layoutZoneColors)}`;
    }
    
    // Add additional brand colors to light theme
    if (Object.keys(additionalBrandColors).length > 0) {
      css += `\n\n  /* Additional Brand Colors */\n${formatCssVariables(additionalBrandColors)}`;
    }
    
    // Add button-specific colors to light theme  
    if (Object.keys(buttonSpecificColors).length > 0) {
      css += `\n\n  /* Button Colors */\n${formatCssVariables(buttonSpecificColors)}`;
    }
    
    css += '\n}';
    
          if (shadcnTheme.dark) {
        css += `\n\n.dark {\n${formatCssVariables(shadcnTheme.dark)}`;
        
        // Add layout zone colors to dark theme (same as light for now)
        if (Object.keys(layoutZoneColors).length > 0) {
          css += `\n\n  /* Layout Zone Colors */\n${formatCssVariables(layoutZoneColors)}`;
        }
        
        // Add additional brand colors to dark theme (same as light for now)
        if (Object.keys(additionalBrandColors).length > 0) {
          css += `\n\n  /* Additional Brand Colors */\n${formatCssVariables(additionalBrandColors)}`;
        }
        
        // Add button-specific colors to dark theme
        if (Object.keys(buttonSpecificColors).length > 0) {
          css += `\n\n  /* Button Colors */\n${formatCssVariables(buttonSpecificColors)}`;
        }
        
        css += '\n}';
      }
    
          return {
        meta: {
          ...meta,
          format: 'shadcn',
          colorAnalysis: colorAnalyses.map(c => ({
            color: c.hex,
            role: c.role,
            frequency: c.frequency,
            lightness: c.lightness,
            saturation: c.saturation
          }))
        },
        css,
        theme: {
          ...shadcnTheme,
          layoutZoneColors,
          additionalBrandColors,
          buttonColors: buttonSpecificColors
        },
      tokens: {
        // Include original tokens for reference
        colors: tokens.colors.values,
        fontSizes: tokens.fontSizes.values,
        spacing: tokens.spacing.values,
        radii: tokens.radii.values
      }
    };
  }
  
  if (format === 'tailwind') {
    // Prepare semantic data for enhanced color analysis
    let semanticData: Array<{ color: string; domDepth?: number; firstSeenIndex?: number; documentPosition?: number; weight: number; context: string }> | undefined;
    
    if (meta.semanticAnalysis?.colors) {
      semanticData = meta.semanticAnalysis.colors.map((item: any) => ({
        color: item.color,
        domDepth: item.domDepth,
        firstSeenIndex: item.firstSeenIndex,
        documentPosition: item.documentPosition,
        weight: item.weight,
        context: item.context
      }));
    }
    
    // Generate Tailwind correlations with enhanced color analysis
    const tailwindCorrelations = generateTailwindCorrelations(tokens);
    const colorAnalyses = analyzeColors(
      tokens.colors.frequency, 
      tokens.colorsFromVariables || [], 
      semanticData,
      meta.html, // Pass HTML for framework detection
      meta.css   // Pass CSS for framework detection
    );
    
    return {
      meta: {
        ...meta,
        format: 'tailwind'
      },
      correlations: tailwindCorrelations,
      colorAnalysis: colorAnalyses,
      recommendations: {
        primaryColors: colorAnalyses.filter(c => c.role === 'primary').slice(0, 3),
        secondaryColors: colorAnalyses.filter(c => c.role === 'secondary').slice(0, 2),
        accentColors: colorAnalyses.filter(c => c.role === 'accent').slice(0, 3),
        spacingSystem: Object.keys(tailwindCorrelations.spacing).slice(0, 10),
        fontSizes: Object.keys(tailwindCorrelations.fontSize).slice(0, 8),
        borderRadius: Object.keys(tailwindCorrelations.borderRadius).slice(0, 5)
      },
      tokens
    };
  }
  
  if (format === 'theme-json') {
    // Generate theme.json style format with enhanced color analysis
    let semanticData: Array<{ color: string; domDepth?: number; firstSeenIndex?: number; documentPosition?: number; weight: number; context: string }> | undefined;
    
    if (meta.semanticAnalysis?.colors) {
      semanticData = meta.semanticAnalysis.colors.map((item: any) => ({
        color: item.color,
        domDepth: item.domDepth,
        firstSeenIndex: item.firstSeenIndex,
        documentPosition: item.documentPosition,
        weight: item.weight,
        context: item.context
      }));
    }
    
    const colorAnalyses = analyzeColors(
      tokens.colors.frequency, 
      tokens.colorsFromVariables || [], 
      semanticData,
      meta.html, // Pass HTML for framework detection
      meta.css   // Pass CSS for framework detection
    );
    
    // Build theme.json structure with custom properties and detected colors
    const themeJson: any = {
      customProperties: {},
      colors: []
    };
    
    // Add CSS custom properties from detected colors
    const primaryColor = colorAnalyses.find(c => c.role === 'primary');
    const secondaryColor = colorAnalyses.find(c => c.role === 'secondary');
    const accentColor = colorAnalyses.find(c => c.role === 'accent');
    const destructiveColor = colorAnalyses.find(c => c.role === 'destructive');
    
    if (primaryColor) {
      themeJson.customProperties['--primary'] = primaryColor.hex;
      themeJson.customProperties['--primary-foreground'] = 
        colorToHsl(primaryColor.hex).l < 50 ? '#ffffff' : '#000000';
    }
    
    if (secondaryColor) {
      themeJson.customProperties['--secondary'] = secondaryColor.hex;
      themeJson.customProperties['--secondary-foreground'] = 
        colorToHsl(secondaryColor.hex).l < 50 ? '#ffffff' : '#000000';
    }
    
    if (accentColor) {
      themeJson.customProperties['--accent'] = accentColor.hex;
      themeJson.customProperties['--accent-foreground'] = 
        colorToHsl(accentColor.hex).l < 50 ? '#ffffff' : '#000000';
    }
    
    if (destructiveColor) {
      themeJson.customProperties['--destructive'] = destructiveColor.hex;
      themeJson.customProperties['--destructive-foreground'] = 
        colorToHsl(destructiveColor.hex).l < 50 ? '#ffffff' : '#000000';
    }
    
    // Add layout zone colors from semantic analysis
    if (meta.semanticAnalysis?.colorsByContext) {
      const contexts = meta.semanticAnalysis.colorsByContext;
      
      if (contexts.header && contexts.header[0]) {
        themeJson.customProperties['--header-background'] = contexts.header[0];
      }
      
      if (contexts.hero && contexts.hero[0]) {
        themeJson.customProperties['--hero-background'] = contexts.hero[0];
      }
      
      if (contexts.brand && contexts.brand[0]) {
        themeJson.customProperties['--brand-background'] = contexts.brand[0];
      }
    }
    
    // Add button colors
    if (meta.semanticAnalysis?.buttonColors) {
      meta.semanticAnalysis.buttonColors
        .slice(0, 3)
        .forEach((color: string, index: number) => {
          themeJson.customProperties[`--button-${index + 1}`] = color;
        });
    }
    
    // Include all detected colors in array
    themeJson.colors = colorAnalyses
      .sort((a, b) => b.frequency - a.frequency)
      .map(c => c.hex);
    
    // Add font sizes, spacing, etc. if detected
    if (tokens.fontSizes?.values) {
      themeJson.fontSizes = tokens.fontSizes.values;
    }
    
    if (tokens.spacing?.values) {
      themeJson.spacing = tokens.spacing.values;
    }
    
    if (tokens.radii?.values) {
      themeJson.radii = tokens.radii.values;
    }
    
    return {
      meta: {
        ...meta,
        format: 'theme-json',
        colorAnalysis: colorAnalyses.map(c => ({
          color: c.hex,
          role: c.role,
          frequency: c.frequency,
          lightness: c.lightness,
          saturation: c.saturation
        }))
      },
      theme: themeJson
    };
  }
  
  if (format === 'json') {
    if (options.compact) {
      // Compact mode: only values, short keys
      const compactCustomProps: Record<string, any> = {};
      for (const [k, v] of Object.entries(tokens.customProperties)) {
        if (typeof v === 'object' && v !== null && 'value' in v) {
          const entry: any = { v: (v as any).value };
          if ('references' in v && (v as any).references && (v as any).references > 0) entry.r = (v as any).references;
          if ('refVariable' in v && (v as any).refVariable) entry.ref = (v as any).refVariable;
          if (Object.keys(entry).length === 1) {
            compactCustomProps[k] = entry.v;
          } else {
            compactCustomProps[k] = entry;
          }
        } else {
          compactCustomProps[k] = v;
        }
      }
      const compactTokens: Record<string, any> = { customProperties: compactCustomProps };
      for (const group of [
        'colors','fontSizes','fontFamilies','fontWeights','lineHeights','letterSpacings','spacing','radii','shadows','gradients','breakpoints','zIndices','transitions','opacity','aspectRatios','borderWidths','borderStyles']) {
        const groupObj = (tokens as any)[group];
        if (groupObj && groupObj.values) {
          compactTokens[group] = groupObj.values;
        }
      }
      // Build relationships
      const relationships: Record<string, any> = {};
      if (tokens.customProperties) {
        Object.entries(tokens.customProperties).forEach(([k, v]: [string, any]) => {
          if (v && typeof v === 'object' && 'refVariable' in v && v.refVariable) {
            relationships[k] = { aliasOf: v.refVariable };
          }
        });
      }
      return { meta, tokens: compactTokens, relationships };
    } else {
      // Build relationships
      const relationships: Record<string, any> = {};
      if (tokens.customProperties) {
        Object.entries(tokens.customProperties).forEach(([k, v]: [string, any]) => {
          if (v && typeof v === 'object' && 'refVariable' in v && v.refVariable) {
            relationships[k] = { aliasOf: v.refVariable };
          }
        });
      }
      return { meta, tokens, relationships };
    }
  } else if (format === 'style-dictionary') {
    // Map tokens to Style Dictionary format
    const sd: any = {
      meta,
      properties: {
        color: {},
        size: {},
        radius: {},
        shadow: {},
        gradient: {},
        breakpoint: {},
        zIndex: {},
        transition: {},
        opacity: {},
        aspectRatio: {},
        borderWidth: {},
        borderStyle: {},
        font: {},
        customProperties: {},
      }
    };
    // Colors
    if (tokens.colors && tokens.colors.values) {
      tokens.colors.values.forEach((c: string, i: number) => {
        sd.properties.color[`color${i+1}`] = { value: c };
      });
    }
    // Font sizes
    if (tokens.fontSizes && tokens.fontSizes.values) {
      tokens.fontSizes.values.forEach((s: string, i: number) => {
        sd.properties.size[`fontSize${i+1}`] = { value: s };
      });
    }
    // Spacing
    if (tokens.spacing && tokens.spacing.values) {
      tokens.spacing.values.forEach((s: string, i: number) => {
        sd.properties.size[`spacing${i+1}`] = { value: s };
      });
    }
    // Radii
    if (tokens.radii && tokens.radii.values) {
      tokens.radii.values.forEach((r: string, i: number) => {
        sd.properties.radius[`radius${i+1}`] = { value: r };
      });
    }
    // Shadows
    if (tokens.shadows && tokens.shadows.values) {
      tokens.shadows.values.forEach((s: string, i: number) => {
        sd.properties.shadow[`shadow${i+1}`] = { value: s };
      });
    }
    // Gradients
    if (tokens.gradients && tokens.gradients.values) {
      tokens.gradients.values.forEach((g: string, i: number) => {
        sd.properties.gradient[`gradient${i+1}`] = { value: g };
      });
    }
    // Breakpoints
    if (tokens.breakpoints && tokens.breakpoints.values) {
      tokens.breakpoints.values.forEach((bp: string, i: number) => {
        sd.properties.breakpoint[`breakpoint${i+1}`] = { value: bp };
      });
    }
    // Z-Indices
    if (tokens.zIndices && tokens.zIndices.values) {
      tokens.zIndices.values.forEach((z: string, i: number) => {
        sd.properties.zIndex[`zIndex${i+1}`] = { value: z };
      });
    }
    // Transitions
    if (tokens.transitions && tokens.transitions.values) {
      tokens.transitions.values.forEach((t: string, i: number) => {
        sd.properties.transition[`transition${i+1}`] = { value: t };
      });
    }
    // Opacity
    if (tokens.opacity && tokens.opacity.values) {
      tokens.opacity.values.forEach((o: string, i: number) => {
        sd.properties.opacity[`opacity${i+1}`] = { value: o };
      });
    }
    // Aspect Ratios
    if (tokens.aspectRatios && tokens.aspectRatios.values) {
      tokens.aspectRatios.values.forEach((ar: string, i: number) => {
        sd.properties.aspectRatio[`aspectRatio${i+1}`] = { value: ar };
      });
    }
    // Border Widths
    if (tokens.borderWidths && tokens.borderWidths.values) {
      tokens.borderWidths.values.forEach((bw: string, i: number) => {
        sd.properties.borderWidth[`borderWidth${i+1}`] = { value: bw };
      });
    }
    // Border Styles
    if (tokens.borderStyles && tokens.borderStyles.values) {
      tokens.borderStyles.values.forEach((bs: string, i: number) => {
        sd.properties.borderStyle[`borderStyle${i+1}`] = { value: bs };
      });
    }
    // Font Families
    if (tokens.fontFamilies && tokens.fontFamilies.values) {
      tokens.fontFamilies.values.forEach((ff: string, i: number) => {
        sd.properties.font[`fontFamily${i+1}`] = { value: ff };
      });
    }
    // Font Weights
    if (tokens.fontWeights && tokens.fontWeights.values) {
      tokens.fontWeights.values.forEach((fw: string, i: number) => {
        sd.properties.font[`fontWeight${i+1}`] = { value: fw };
      });
    }
    // Line Heights
    if (tokens.lineHeights && tokens.lineHeights.values) {
      tokens.lineHeights.values.forEach((lh: string, i: number) => {
        sd.properties.font[`lineHeight${i+1}`] = { value: lh };
      });
    }
    // Letter Spacings
    if (tokens.letterSpacings && tokens.letterSpacings.values) {
      tokens.letterSpacings.values.forEach((ls: string, i: number) => {
        sd.properties.font[`letterSpacing${i+1}`] = { value: ls };
      });
    }
    // Custom Properties (CSS variables)
    if (tokens.customProperties) {
      Object.entries(tokens.customProperties).forEach(([k, v]: [string, any]) => {
        if (v && typeof v === 'object' && 'value' in v) {
          sd.properties.customProperties[k] = { value: v.value };
          if ('refVariable' in v && v.refVariable) sd.properties.customProperties[k].ref = v.refVariable;
          if ('references' in v && typeof v.references === 'number') sd.properties.customProperties[k].references = v.references;
        }
      });
    }
    // Build relationships
    const relationships: Record<string, any> = {};
    if (tokens.customProperties) {
      Object.entries(tokens.customProperties).forEach(([k, v]: [string, any]) => {
        if (v && typeof v === 'object' && 'refVariable' in v && v.refVariable) {
          relationships[k] = { aliasOf: v.refVariable };
        }
      });
    }
    sd.relationships = relationships;
    return sd;
  } else {
    throw new Error(`Unknown format: ${format}`);
  }
} 