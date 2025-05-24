import type { ColorAnalysis, FrequencyItem } from './types';

// Convert any color format to HSL
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

// Strip opacity from color values to get the solid version
function stripOpacity(color: string): string {
  if (!color || typeof color !== 'string') return color;
  
  // Handle rgba() format
  if (color.startsWith('rgba(')) {
    const match = color.match(/rgba\(([^,]+),\s*([^,]+),\s*([^,]+),\s*[^)]+\)/);
    if (match) {
      return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
    }
  }
  
  // Handle hex with alpha (8-digit hex)
  if (color.startsWith('#') && color.length === 9) {
    return color.substring(0, 7); // Strip last 2 characters (alpha)
  }
  
  // Handle hsla() format
  if (color.startsWith('hsla(')) {
    const match = color.match(/hsla\(([^,]+),\s*([^,]+),\s*([^,]+),\s*[^)]+\)/);
    if (match) {
      return `hsl(${match[1]}, ${match[2]}, ${match[3]})`;
    }
  }
  
  // Return as-is if no opacity detected
  return color;
}

// Normalize color to hex format for consistent comparison
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

// Backward compatibility alias
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  return colorToHsl(hex);
}

// Convert HSL to hex color
function hslToHex(hsl: { h: number; s: number; l: number }): string {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  
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

// Convert RGB to OKLCH (modern perceptual color space)
function rgbToOklch(r: number, g: number, b: number): { l: number; c: number; h: number } {
  // Normalize RGB values to 0-1
  r = r / 255;
  g = g / 255;
  b = b / 255;
  
  // sRGB to linear RGB
  const linearize = (c: number) => {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  
  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);
  
  // Linear RGB to OKLab (approximation for better performance)
  const l = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin;
  const m = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin;
  const s = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin;
  
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  
  const oklabL = 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot;
  const oklabA = 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot;
  const oklabB = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot;
  
  // Convert OKLab to OKLCH
  const chroma = Math.sqrt(oklabA * oklabA + oklabB * oklabB);
  let hue = Math.atan2(oklabB, oklabA) * 180 / Math.PI;
  if (hue < 0) hue += 360;
  
  return {
    l: Math.max(0, Math.min(1, oklabL)),
    c: Math.max(0, chroma),
    h: isNaN(hue) ? 0 : hue
  };
}

// Convert any color to OKLCH format
function colorToOklch(color: string): string {
  if (!color || typeof color !== 'string') return color;
  
  let r = 0, g = 0, b = 0;
  
  // Handle different color formats
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const fullHex = hex.length === 3 
      ? hex.split('').map(char => char + char).join('')
      : hex;
    
    r = parseInt(fullHex.substr(0, 2), 16);
    g = parseInt(fullHex.substr(2, 2), 16);
    b = parseInt(fullHex.substr(4, 2), 16);
  } else if (color.startsWith('rgb')) {
    const rgbMatch = color.match(/rgba?\(([^,]+),\s*([^,]+),\s*([^,]+)/);
    if (rgbMatch) {
      r = Math.round(parseFloat(rgbMatch[1].trim()));
      g = Math.round(parseFloat(rgbMatch[2].trim()));
      b = Math.round(parseFloat(rgbMatch[3].trim()));
    }
  } else if (color.startsWith('hsl')) {
    // Convert HSL to RGB first
    const hslMatch = color.match(/hsla?\(([^,]+),\s*([^,]+)%?,\s*([^,]+)%?/);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1].trim()) / 360;
      const s = parseFloat(hslMatch[2].trim()) / 100;
      const l = parseFloat(hslMatch[3].trim()) / 100;
      
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      let rNorm, gNorm, bNorm;
      if (s === 0) {
        rNorm = gNorm = bNorm = l;
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        rNorm = hue2rgb(p, q, h + 1/3);
        gNorm = hue2rgb(p, q, h);
        bNorm = hue2rgb(p, q, h - 1/3);
      }
      
      r = Math.round(rNorm * 255);
      g = Math.round(gNorm * 255);
      b = Math.round(bNorm * 255);
    }
  }
  
  const oklch = rgbToOklch(r, g, b);
  
  // Format OKLCH with appropriate precision
  const l = oklch.l.toFixed(3);
  const c = oklch.c.toFixed(3);
  const h = oklch.h.toFixed(3);
  
  return `oklch(${l} ${c} ${h})`;
}

// Create OKLCH color from lightness, chroma, hue values
function createOklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(3)})`;
}

// Adjust OKLCH color for dark mode
function adjustOklchForDarkMode(oklchStr: string, role: 'background' | 'foreground' | 'border' | 'muted'): string {
  const match = oklchStr.match(/oklch\(([^\s]+)\s+([^\s]+)\s+([^\s]+)\)/);
  if (!match) return oklchStr;
  
  let l = parseFloat(match[1]);
  const c = parseFloat(match[2]);
  const h = parseFloat(match[3]);
  
  switch (role) {
    case 'background':
      // Make backgrounds very dark (5-15% lightness)
      l = Math.min(l, 0.15);
      break;
    case 'foreground':
      // Make foregrounds very light (85-98% lightness)
      l = Math.max(l, 0.90);
      break;
    case 'border':
      // Make borders medium-dark (20-35% lightness)
      l = Math.min(Math.max(l * 0.4, 0.20), 0.35);
      break;
    case 'muted':
      // Make muted colors dark but distinguishable (25-40% lightness)
      l = Math.min(Math.max(l * 0.5, 0.25), 0.40);
      break;
  }
  
  return createOklch(l, c, h);
}

// Adjust brand colors (primary/secondary/accent) for dark mode
function adjustBrandOklchForDarkMode(oklchStr: string): string {
  const match = oklchStr.match(/oklch\(([^\s]+)\s+([^\s]+)\s+([^\s]+)\)/);
  if (!match) return oklchStr;
  
  let l = parseFloat(match[1]);
  const c = parseFloat(match[2]);
  const h = parseFloat(match[3]);
  
  // Keep hue and chroma, adjust lightness for dark mode visibility
  if (l < 0.30) {
    // Too dark, lighten it
    l = Math.min(l + 0.20, 0.50);
  } else if (l > 0.80) {
    // Too light, darken it slightly
    l = Math.max(l - 0.15, 0.65);
  }
  // Colors in 0.30-0.80 range stay mostly the same
  
  return createOklch(l, c, h);
}

// Convert any color to HSL space-separated format (modern Tailwind/shadcn)
function colorToHslSpaceSeparated(color: string): string {
  const hsl = colorToHsl(color);
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

// Convert color to specified format
export function convertColorToFormat(color: string, format: 'hsl' | 'oklch' | 'hex'): string {
  switch (format) {
    case 'hsl':
      return colorToHslSpaceSeparated(color);
    case 'oklch':
      return colorToOklch(color);
    case 'hex':
      return normalizeColorToHex(color);
    default:
      return colorToHslSpaceSeparated(color); // Default to HSL
  }
}

// Adjust color for dark mode in specified format
function adjustColorForDarkMode(color: string, role: 'background' | 'foreground' | 'border' | 'muted', format: 'hsl' | 'oklch' | 'hex'): string {
  if (format === 'oklch') {
    const oklchColor = colorToOklch(color);
    return adjustOklchForDarkMode(oklchColor, role);
  } else {
    // For HSL and hex, use HSL adjustments then convert
    const hsl = colorToHsl(color);
    
    switch (role) {
      case 'background':
        hsl.l = Math.min(hsl.l, 15);
        break;
      case 'foreground':
        hsl.l = Math.max(hsl.l, 85);
        break;
      case 'border':
        hsl.l = Math.min(Math.max(hsl.l * 0.4, 20), 35);
        break;
      case 'muted':
        hsl.l = Math.min(Math.max(hsl.l * 0.5, 25), 40);
        break;
    }
    
    const adjustedColor = hslToHex(hsl);
    return convertColorToFormat(adjustedColor, format);
  }
}

// Adjust brand color for dark mode in specified format
function adjustBrandColorForDarkMode(color: string, format: 'hsl' | 'oklch' | 'hex'): string {
  if (format === 'oklch') {
    const oklchColor = colorToOklch(color);
    return adjustBrandOklchForDarkMode(oklchColor);
  } else {
    // For HSL and hex, use HSL adjustments then convert
    const hsl = colorToHsl(color);
    
    if (hsl.l < 30) {
      hsl.l = Math.min(hsl.l + 20, 50);
    } else if (hsl.l > 80) {
      hsl.l = Math.max(hsl.l - 15, 65);
    }
    
    const adjustedColor = hslToHex(hsl);
    return convertColorToFormat(adjustedColor, format);
  }
}

// Get default colors for different formats
function getDefaultColors(format: 'hsl' | 'oklch' | 'hex') {
  const defaults = {
    white: { hsl: '0 0% 100%', oklch: 'oklch(1 0 0)', hex: '#ffffff' },
    black: { hsl: '0 0% 0%', oklch: 'oklch(0 0 0)', hex: '#000000' },
    darkGray: { hsl: '240 2% 14%', oklch: 'oklch(0.141 0.005 285.823)', hex: '#141414' },
    lightGray: { hsl: '210 40% 96%', oklch: 'oklch(0.967 0.001 286.375)', hex: '#f5f5f5' },
    mutedGray: { hsl: '240 6% 27%', oklch: 'oklch(0.274 0.006 286.033)', hex: '#454545' },
    borderGray: { hsl: '240 6% 20%', oklch: 'oklch(0.2 0.004 286.32)', hex: '#333333' },
    destructiveRed: { hsl: '0 84% 60%', oklch: 'oklch(0.577 0.245 27.325)', hex: '#dc2626' }
  };
  
  return {
    white: defaults.white[format],
    black: defaults.black[format],
    darkGray: defaults.darkGray[format],
    lightGray: defaults.lightGray[format],
    mutedGray: defaults.mutedGray[format],
    borderGray: defaults.borderGray[format],
    destructiveRed: defaults.destructiveRed[format]
  };
}

// Calculate contrast ratio between two colors
function getContrastRatio(color1: string, color2: string): number {
  const getLuminance = (color: string) => {
    let r = 0, g = 0, b = 0;
    
    // Handle different color formats
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      const fullHex = hex.length === 3 
        ? hex.split('').map(char => char + char).join('')
        : hex;
      r = parseInt(fullHex.substr(0, 2), 16) / 255;
      g = parseInt(fullHex.substr(2, 2), 16) / 255;
      b = parseInt(fullHex.substr(4, 2), 16) / 255;
    } else if (color.startsWith('rgb')) {
      const rgbMatch = color.match(/rgba?\(([^)]+)\)/);
      if (rgbMatch) {
        const values = rgbMatch[1].split(',').map(v => parseFloat(v.trim()));
        r = values[0] / 255;
        g = values[1] / 255;
        b = values[2] / 255;
      }
    }
    
    const [rs, gs, bs] = [r, g, b].map(c => 
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };
  
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  
  return (brightest + 0.05) / (darkest + 0.05);
}

// Check if color is a common web utility color
function isCommonWebColor(hex: string): boolean {
  const normalized = hex.toLowerCase();
  const commonColors = [
    '#ffffff', '#fff', '#000000', '#000',
    '#f5f5f5', '#f0f0f0', '#e5e5e5', '#e0e0e0', '#d0d0d0', '#cccccc', '#c0c0c0',
    '#999999', '#888888', '#777777', '#666666', '#555555', '#444444', '#333333',
    '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#6c757d', '#495057', '#343a40', '#212529'
  ];
  return commonColors.includes(normalized);
}

// Check if color is a common browser default (link/focus/system colors)
function isBrowserDefaultColor(hex: string): boolean {
  const normalized = hex.toLowerCase();
  const browserDefaults = [
    // Default link colors
    '#0000ee', '#0000ff', '#0066cc', '#0080ff', '#0099ff', '#1e90ff', '#4169e1',
    // Default visited link colors  
    '#800080', '#8b008b', '#9932cc', '#663399',
    // Common focus ring colors
    '#005fcc', '#0078d4', '#0066ff', '#217ce8', '#2563eb',
    // Windows/Chrome default blue
    '#0078d7', '#0078d4', '#106ebe',
    // Default form focus colors
    '#66afe9', '#80bdff', '#007bff',
    // Material Design blue
    '#1976d2', '#2196f3', '#42a5f5'
  ];
  return browserDefaults.includes(normalized);
}

// Dynamic framework detection based on patterns rather than hard-coded colors
function analyzeFrameworkUsage(html: string, css: string): {
  detectedFrameworks: string[];
  confidence: Record<string, number>;
  frameworkColors: Set<string>;
} {
  const frameworks = {
    bootstrap: {
      classPatterns: [
        /\bbtn\b/, /\bbtn-primary\b/, /\bbtn-secondary\b/, /\bcontainer\b/, /\brow\b/, /\bcol-/, 
        /\bnavbar\b/, /\bcard\b/, /\balert\b/, /\bbadge\b/, /\btable\b/
      ],
      variablePatterns: [/--bs-[\w-]+/g],
      selectorPatterns: [/\.btn-primary/, /\.bg-primary/, /\.text-primary/, /\.navbar-/, /\.card-/],
      commonColors: ['#0d6efd', '#6610f2', '#6f42c1', '#dc3545', '#198754', '#ffc107', '#20c997']
    },
    material: {
      classPatterns: [
        /\bmat-/, /\bmdc-/, /\bmd-/, /\bmaterial-/, /\bmui-/
      ],
      variablePatterns: [/--mdc-[\w-]+/g, /--mat-[\w-]+/g],
      selectorPatterns: [/\.mdc-button/, /\.mat-button/, /\.material-/],
      commonColors: ['#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#e53935', '#00acc1']
    },
    tailwind: {
      classPatterns: [
        /\bbg-\w+(-\d+)?/, /\btext-\w+(-\d+)?/, /\bborder-\w+(-\d+)?/, /\bp-\d+/, /\bm-\d+/, 
        /\bflex\b/, /\bgrid\b/, /\bhidden\b/, /\bblock\b/
      ],
      variablePatterns: [/--tw-[\w-]+/g],
      selectorPatterns: [/\.(bg|text|border)-\w+/, /\.(p|m|px|py)-\d+/],
      commonColors: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4']
    },
    semantic: {
      classPatterns: [/\bui\b/, /\bui\.button/, /\bui\.primary/, /\bui\.menu/],
      variablePatterns: [],
      selectorPatterns: [/\.ui\.button/, /\.ui\.primary/, /\.ui\.menu/],
      commonColors: ['#21ba45', '#2185d0', '#db2828', '#f2711c', '#a333c8']
    },
    antd: {
      classPatterns: [/\bant-/, /\bant-btn/, /\bant-button/, /\bant-menu/],
      variablePatterns: [/--ant-[\w-]+/g],
      selectorPatterns: [/\.ant-btn/, /\.ant-button/, /\.ant-menu/],
      commonColors: ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1']
    }
  };

  const detectedFrameworks: string[] = [];
  const confidence: Record<string, number> = {};
  const frameworkColors = new Set<string>();

  for (const [frameworkName, config] of Object.entries(frameworks)) {
    let score = 0;
    
    // Check class patterns in HTML
    let classMatches = 0;
    config.classPatterns.forEach(pattern => {
      const matches = html.match(pattern);
      if (matches) {
        classMatches += matches.length;
      }
    });
    
    if (classMatches > 0) {
      score += Math.min(classMatches * 2, 50); // Cap class-based scoring
    }
    
    // Check CSS variable patterns
    let variableMatches = 0;
    config.variablePatterns.forEach(pattern => {
      const matches = css.match(pattern);
      if (matches) {
        variableMatches += matches.length;
      }
    });
    
    if (variableMatches > 0) {
      score += Math.min(variableMatches * 3, 60); // CSS variables are strong indicators
    }
    
    // Check CSS selector patterns
    let selectorMatches = 0;
    config.selectorPatterns.forEach(pattern => {
      const matches = css.match(pattern);
      if (matches) {
        selectorMatches += matches.length;
      }
    });
    
    if (selectorMatches > 0) {
      score += Math.min(selectorMatches * 1.5, 40);
    }
    
    // Store confidence and detect framework
    confidence[frameworkName] = score;
    
    if (score > 20) { // Threshold for framework detection
      detectedFrameworks.push(frameworkName);
      
      // Add framework's common colors to the set for penalization
      config.commonColors.forEach(color => {
        frameworkColors.add(color.toLowerCase());
      });
    }
  }
  
  return { detectedFrameworks, confidence, frameworkColors };
}

// Enhanced framework color detection using dynamic analysis
function isDynamicFrameworkColor(hex: string, detectedFrameworkColors: Set<string>): boolean {
  return detectedFrameworkColors.has(hex.toLowerCase());
}

// Check if color is a common UI framework color (Bootstrap, Material, etc.)
function isFrameworkColor(hex: string): boolean {
  const normalized = hex.toLowerCase();
  const frameworkColors = [
    // Bootstrap 5 default colors
    '#0d6efd', '#6610f2', '#6f42c1', '#d63384', '#dc3545', '#fd7e14', 
    '#ffc107', '#198754', '#20c997', '#0dcaf0',
    // Bootstrap 4 colors
    '#007bff', '#6c757d', '#28a745', '#17a2b8', '#ffc107', '#dc3545',
    '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#495057', '#343a40', '#212529',
    // Material Design primary colors  
    '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#5d4037', '#455a64', '#e53935',
    '#00acc1', '#fbc02d', '#ff5722', '#795548', '#607d8b',
    // Tailwind CSS defaults (when not customized)
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16',
    '#f97316', '#ec4899', '#6366f1',
    // Common button/form colors from frameworks
    '#5cb85c', '#5bc0de', '#337ab7', '#d9534f', '#f0ad4e', // Old Bootstrap
    '#0073e6', '#17a2b8', '#28a745', '#6c757d', // Bootstrap variants
  ];
  return frameworkColors.includes(normalized);
}

// Enhanced detection combining browser defaults and framework colors
function isNonBrandColor(hex: string): boolean {
  return isBrowserDefaultColor(hex) || isFrameworkColor(hex) || isCommonWebColor(hex);
}

// Check if color is grayscale/neutral
function isGrayscale(hsl: { h: number; s: number; l: number }): boolean {
  return hsl.s < 5; // Very low saturation = grayscale
}

// Calculate brand color confidence score
function calculateBrandColorScore(
  hex: string,
  hsl: { h: number; s: number; l: number },
  frequency: number,
  totalColors: number,
  allColors: { hex: string; frequency: number }[],
  isFromVariable: boolean = false
): number {
  let score = 0;
  
  // 1. Saturation bonus (brand colors are usually saturated)
  if (hsl.s > 40) score += 30;
  else if (hsl.s > 20) score += 15;
  
  // 2. Lightness sweet spot (not too dark, not too light)
  if (hsl.l > 20 && hsl.l < 80) score += 20;
  else if (hsl.l > 10 && hsl.l < 90) score += 10;
  
  // 3. Not a common web color
  if (!isCommonWebColor(hex)) score += 25;
  
  // 3b. MASSIVE penalty for framework colors (Bootstrap, Material, etc.)
  if (isFrameworkColor(hex)) score -= 150;
  
  // 3c. Heavy penalty for browser default colors
  if (isBrowserDefaultColor(hex)) score -= 100;
  
  // 4. Not grayscale
  if (!isGrayscale(hsl)) score += 20;
  
  // 5. Good contrast for interactive use
  const whiteContrast = getContrastRatio(hex, '#ffffff');
  const blackContrast = getContrastRatio(hex, '#000000');
  if (whiteContrast > 3 || blackContrast > 3) score += 15;
  
  // 6. Frequency consideration (balanced with brand prominence)
  // Brand colors should be used consistently, but not necessarily most frequently
  const relativeFreq = frequency / totalColors;
  if (frequency >= 8) score += 20; // High usage = likely important
  else if (frequency >= 4) score += 15; // Medium usage  
  else if (frequency >= 2) score += 10; // Still viable brand color
  else score -= 5; // Single use = less likely brand color
  
  // 7. Boost for highly saturated colors that aren't overused
  // Pure brand colors are often used selectively but with high impact
  if (hsl.s > 80 && frequency >= 2 && frequency <= 8) {
    score += 15; // Sweet spot for brand colors
  }
  
  // 8. Uniqueness bonus (stand out from other colors)
  const similarColors = allColors.filter(c => {
    const otherHsl = colorToHsl(c.hex);
    const hueDiff = Math.abs(hsl.h - otherHsl.h);
    return hueDiff < 30 && Math.abs(hsl.s - otherHsl.s) < 20;
  });
  if (similarColors.length <= 2) score += 10;
  
  // 9. HUGE boost for colors defined as CSS custom properties
  // These are intentionally defined design tokens - top priority!
  if (isFromVariable) score += 75;
  
  return score;
}

// Improved role analysis using multiple heuristics
function analyzeColorRole(
  hex: string, 
  hsl: { h: number; s: number; l: number }, 
  frequency: number,
  totalColors: number,
  allColors: { hex: string; frequency: number }[],
  isFromVariable: boolean = false,
  isVibrantBrand: boolean = false
): { role: ColorAnalysis['role']; confidence: number } {
  const { h, s, l } = hsl;
  const relativeFreq = frequency / totalColors;
  
  // Background colors - very light/dark with high relative frequency
  if ((l > 95 || l < 5) && relativeFreq > 0.05) {
    return { role: 'background', confidence: 90 };
  }
  
  // Foreground/text colors - high contrast, common colors, high frequency
  if ((l < 15 || l > 90) && relativeFreq > 0.1 && (isCommonWebColor(hex) || s < 10)) {
    return { role: 'foreground', confidence: 85 };
  }
  
  // Border colors - light grays with medium frequency
  if (l > 80 && l < 98 && s < 15 && relativeFreq > 0.01 && relativeFreq < 0.1) {
    return { role: 'border', confidence: 80 };
  }
  
  // Destructive colors - red family with good saturation
  if ((h > 340 || h < 25) && s > 40 && l > 25 && l < 75) {
    return { role: 'destructive', confidence: 85 };
  }
  
  // Calculate brand color score
  const brandScore = calculateBrandColorScore(hex, hsl, frequency, totalColors, allColors, isFromVariable);
  
  // Adjust thresholds for vibrant brands - be more selective about primaries
  const primaryThreshold = isVibrantBrand ? 85 : 70;
  const secondaryThreshold = isVibrantBrand ? 60 : 50;
  
  // Primary brand color - highest brand score
  if (brandScore > primaryThreshold) {
    return { role: 'primary', confidence: brandScore };
  }
  
  // Secondary brand color - good brand score but lower
  if (brandScore > secondaryThreshold) {
    return { role: 'secondary', confidence: brandScore };
  }
  
  // Accent colors - high saturation, lower frequency (more permissive for vibrant brands)
  const accentFreqThreshold = isVibrantBrand ? 0.08 : 0.05;
  if (s > 60 && l > 30 && l < 80 && relativeFreq < accentFreqThreshold) {
    return { role: 'accent', confidence: 70 };
  }
  
  // Muted colors - low saturation, medium usage
  if (s < 25 && l > 30 && l < 80) {
    return { role: 'muted', confidence: 60 };
  }
  
  // Default to neutral
  return { role: 'neutral', confidence: 30 };
}

// Group similar colors together to improve brand color detection
function groupSimilarColors(colorFrequency: FrequencyItem[]): FrequencyItem[] {
  const groups = new Map<string, { colors: FrequencyItem[]; totalCount: number }>();
  
  for (const colorItem of colorFrequency) {
    if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(colorItem.value)) continue;
    
    const hsl = colorToHsl(colorItem.value);
    
    // Create a grouping key based on similar hue and saturation
    let groupKey = '';
    if (hsl.s < 10) {
      // Grayscale - group by lightness ranges
      groupKey = `gray-${Math.floor(hsl.l / 20) * 20}`;
    } else {
      // Special handling for red colors (more sensitive grouping)
      const isRed = hsl.h < 30 || hsl.h > 330;
      if (isRed && hsl.s > 50) {
        // Group all reds with high saturation together
        groupKey = `red-brand`;
      } else {
        // Colored - group by hue ranges (30-degree bins) and saturation level
        const hueBin = Math.floor(hsl.h / 30) * 30;
        const satLevel = hsl.s > 70 ? 'high' : hsl.s > 30 ? 'med' : 'low';
        groupKey = `hue-${hueBin}-sat-${satLevel}`;
      }
    }
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { colors: [], totalCount: 0 });
    }
    
    const group = groups.get(groupKey)!;
    group.colors.push(colorItem);
    group.totalCount += colorItem.count;
  }
  
  // For each group, select the most frequent color as representative
  const result: FrequencyItem[] = [];
  for (const group of groups.values()) {
    if (group.colors.length === 1) {
      result.push(group.colors[0]);
    } else {
      // Find the most frequent color in the group and boost its count
      const sortedColors = group.colors.sort((a, b) => b.count - a.count);
      const representative = { ...sortedColors[0] };
      representative.count = group.totalCount; // Combine all counts
      result.push(representative);
    }
  }
  
  return result.sort((a, b) => b.count - a.count);
}

// Redistribute roles for vibrant brands to limit primaries and enhance secondary/accent detection
function redistributeVibrantBrandRoles(analyses: ColorAnalysis[]): ColorAnalysis[] {
  // Find all current primaries
  const primaries = analyses.filter(a => a.role === 'primary');
  
  // Keep only the top 2 primaries (highest frequency + confidence)
  const topPrimaries = primaries
    .sort((a, b) => {
      const freqDiff = b.frequency - a.frequency;
      return Math.abs(freqDiff) < 10 ? (b.confidence || 0) - (a.confidence || 0) : freqDiff;
    })
    .slice(0, 2);
  
  // Redistribute the rest as secondary/accent based on properties
  for (const analysis of analyses) {
    if (analysis.role === 'primary' && !topPrimaries.includes(analysis)) {
      // High saturation, lower frequency = accent
      if (analysis.saturation > 70 && analysis.frequency < 50) {
        analysis.role = 'accent';
        analysis.confidence = 75;
      }
      // Medium saturation, decent frequency = secondary
      else if (analysis.saturation > 40 && analysis.frequency >= 20) {
        analysis.role = 'secondary';
        analysis.confidence = 65;
      }
      // Low saturation = muted
      else if (analysis.saturation < 30) {
        analysis.role = 'muted';
        analysis.confidence = 50;
      }
      // Everything else becomes accent
      else {
        analysis.role = 'accent';
        analysis.confidence = 60;
      }
    }
  }
  
  return analyses;
}

export function analyzeColors(
  colors: Array<{ value: string; count: number; prevalence?: number }>,
  variableColors: Array<{ variable: string; value: string; references: number }> = [],
  semanticData?: Array<{ color: string; domDepth?: number; firstSeenIndex?: number; documentPosition?: number; weight: number; context: string }>,
  html?: string,
  css?: string
): ColorAnalysis[] {
  const analyses: ColorAnalysis[] = [];
  
  // Dynamic framework detection if we have HTML/CSS
  let frameworkAnalysis: { detectedFrameworks: string[]; confidence: Record<string, number>; frameworkColors: Set<string> } | undefined = undefined;
  if (html && css) {
    frameworkAnalysis = analyzeFrameworkUsage(html, css);
    console.log(`🔍 Detected frameworks: ${frameworkAnalysis.detectedFrameworks.join(', ')} (confidence: ${JSON.stringify(frameworkAnalysis.confidence)})`);
  }
  
  // Combine regular and variable colors
  const allColors = [
    ...colors.map(c => ({ value: c.value, count: c.count, source: 'css' as const })),
    ...variableColors.map(v => ({ value: v.value, count: v.references, source: 'variable' as const }))
  ];

  // Filter out common non-brand colors
  const filteredColors = allColors.filter(color => {
    if (!color?.value || typeof color.value !== 'string') return false;
    const hex = color.value.toLowerCase();
    return hex !== '#fff' && hex !== '#ffffff' && hex !== '#000' && hex !== '#000000' && 
           hex !== 'transparent' && hex !== 'inherit' && hex !== 'initial' && hex !== 'unset';
  });

  // Group colors by their normalized hex value to consolidate variants
  const colorGroups = new Map<string, Array<{ value: string; count: number; source: string; hasOpacity: boolean }>>();
  
  filteredColors.forEach(({ value, count, source }) => {
    try {
      if (!value || typeof value !== 'string') return;
      
      const normalizedHex = normalizeColorToHex(value);
      const hasOpacity = value.includes('rgba(') || value.includes('hsla(') || 
                        (value.startsWith('#') && value.length === 9) ||
                        // Check for alpha channel in rgba/hsla (4th parameter)
                        (value.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*[^)]+\)/) !== null) ||
                        (value.match(/hsla?\([^,]+,[^,]+,[^,]+,\s*[^)]+\)/) !== null);
      
      if (!colorGroups.has(normalizedHex)) {
        colorGroups.set(normalizedHex, []);
      }
      
      colorGroups.get(normalizedHex)!.push({ value, count, source, hasOpacity });
    } catch (error) {
      console.warn(`Failed to normalize color ${value}:`, error);
    }
  });

  // For each color group, select the best representative and combine frequencies
  colorGroups.forEach((variants, normalizedHex) => {
    // Sort variants: prioritize solid colors (no opacity), then by frequency
    variants.sort((a, b) => {
      if (a.hasOpacity !== b.hasOpacity) {
        return a.hasOpacity ? 1 : -1; // Solid colors first
      }
      return b.count - a.count; // Then by frequency
    });
    
    const bestVariant = variants[0];
    const totalFrequency = variants.reduce((sum, v) => sum + v.count, 0);
    
    try {
      const hsl = colorToHsl(bestVariant.value);
      const contrast = getContrastRatio(bestVariant.value, '#ffffff');
      
      const analysis: ColorAnalysis = {
        hex: bestVariant.value, // Use the best variant (preferably solid)
        role: 'neutral', // Will be assigned later
        lightness: hsl.l,
        saturation: hsl.s,
        hue: hsl.h,
        contrast,
        frequency: totalFrequency, // Combined frequency from all variants
        sources: [...new Set(variants.map(v => v.source))], // Unique sources
        confidence: totalFrequency > 10 ? 0.8 : 0.5
      };
      
      analyses.push(analysis);
    } catch (error) {
      console.warn(`Failed to analyze color ${bestVariant.value}:`, error);
    }
  });

  // Sort by frequency first
  analyses.sort((a, b) => b.frequency - a.frequency);

  // Enhanced role assignment with brand color bias and framework detection
  assignRoles(analyses, semanticData, frameworkAnalysis);

  return analyses;
}

function assignRoles(analyses: ColorAnalysis[], semanticData?: Array<{ color: string; domDepth?: number; firstSeenIndex?: number; documentPosition?: number; weight: number; context: string }>, frameworkAnalysis?: { detectedFrameworks: string[]; confidence: Record<string, number>; frameworkColors: Set<string> }): void {
  // Reset all roles
  analyses.forEach(analysis => analysis.role = 'neutral');
  
  // Calculate brand relevance score based on heuristics (no hard-coded color boosts)
  const brandScores = analyses.map(analysis => {
    let score = 0;
    
    // Base frequency importance (but not the only factor)
    score += Math.log(analysis.frequency + 1) * 10;
    
    // Saturation heuristic: brand colors are typically saturated
    if (analysis.saturation > 80) score += 40;
    else if (analysis.saturation > 60) score += 25;
    else if (analysis.saturation > 40) score += 15;
    else if (analysis.saturation < 10) score -= 20; // Penalize grayscale
    
    // Lightness heuristic: brand colors avoid extremes
    if (analysis.lightness >= 25 && analysis.lightness <= 75) score += 20;
    else if (analysis.lightness >= 15 && analysis.lightness <= 85) score += 10;
    else if (analysis.lightness > 95 || analysis.lightness < 5) score -= 30; // Penalize pure black/white
    
    // Common web color penalty
    if (isCommonWebColor(analysis.hex)) score -= 25;
    
    // Dynamic framework color penalty - use detected frameworks if available
    if (frameworkAnalysis?.frameworkColors.has(analysis.hex.toLowerCase())) {
      score -= 200; // Even higher penalty for dynamically detected framework colors
    } else if (isFrameworkColor(analysis.hex)) {
      // Fallback to static detection if dynamic detection wasn't available
      score -= 150;
    }
    
    // Heavy penalty for browser default colors
    if (isBrowserDefaultColor(analysis.hex)) score -= 100;
    
    // Uniqueness heuristic: brand colors should have good contrast potential
    const whiteContrast = getContrastRatio(analysis.hex, '#ffffff');
    const blackContrast = getContrastRatio(analysis.hex, '#000000');
    if (whiteContrast > 4.5 || blackContrast > 4.5) score += 15;
    
         // Usage pattern heuristic: brand colors are used consistently but not overwhelmingly
     const totalColors = analyses.reduce((sum, a) => sum + a.frequency, 0);
     const relativeFreq = analysis.frequency / totalColors;
     if (relativeFreq > 0.01 && relativeFreq < 0.3) score += 10; // Sweet spot
     else if (relativeFreq > 0.5) score -= 15; // Too dominant (likely background/text)
     // Don't heavily penalize low-frequency colors if they have strong brand characteristics
     else if (analysis.frequency === 1 && analysis.saturation > 80) score -= 5; // Light penalty for single highly saturated colors
     
     // NEW: Positional heuristics from semantic data (available only when passed in)
     const semantic = semanticData?.find((s: any) => s.color.toLowerCase() === analysis.hex.toLowerCase());
     if (semantic) {
       // MASSIVE boost for colors that appear in semantic contexts
       // This prioritizes VISIBLE/CONTEXTUAL colors over invisible CSS colors
       score += 100; // Base semantic context bonus
       
       // First-seen bonus: earlier colors get priority
       if (semantic.firstSeenIndex !== undefined && semantic.firstSeenIndex < 5) {
         score += 15 - (semantic.firstSeenIndex * 2); // 15, 13, 11, 9, 7 points
       }
       
       // DOM depth bonus: shallower elements (closer to body) get priority
       if (semantic.domDepth !== undefined && semantic.domDepth <= 3) {
         score += 10 - (semantic.domDepth * 2); // 10, 8, 6 points
       }
       
       // Document position bonus: colors closer to top of page
       if (semantic.documentPosition !== undefined && semantic.documentPosition < 0.3) {
         score += 8; // Above-the-fold bonus
       }
       
       // Semantic context bonus: high-weight contexts get extra points
       if (semantic.weight >= 90) score += 25; // Hero, brand, headers, buttons - VERY high priority
       else if (semantic.weight >= 80) score += 15; // Navigation, headers - high priority
       else if (semantic.weight >= 70) score += 10; // Forms, accents - medium priority
       
       // Additional boost for header context colors - they're often primary brand colors
       if (semantic.context === 'header' && semantic.weight >= 90) {
         score += 20; // Extra header brand color bonus
       }
     } else {
       // Penalty for colors that DON'T appear in semantic contexts
       // These are likely invisible/unused CSS colors
       score -= 20; // Reduce priority of non-semantic colors
     }
    
    return { analysis, score };
  });
  
  // Sort by brand relevance score
  brandScores.sort((a, b) => b.score - a.score);
  
  // Assign roles based on characteristics and scores
  let assignedPrimary = false;
  let assignedSecondary = false;
  let assignedAccent = false;
  let assignedDestructive = false;
  
  for (const { analysis, score } of brandScores) {
    // Destructive colors (red family with good saturation)
    if (!assignedDestructive && 
        ((analysis.hue >= 340 || analysis.hue <= 20) && 
         analysis.saturation > 50 && 
         analysis.lightness > 25 && 
         analysis.lightness < 75)) {
      analysis.role = 'destructive';
      assignedDestructive = true;
      continue;
    }
    
    // Background colors (extreme lightness with high frequency)
    if ((analysis.lightness > 95 || analysis.lightness < 5) && 
        analysis.frequency > 20) {
      analysis.role = 'background';
      continue;
    }
    
    // Foreground colors (low saturation, extreme lightness, high frequency)
    if (analysis.saturation < 15 && 
        (analysis.lightness > 90 || analysis.lightness < 15) && 
        analysis.frequency > 30) {
      analysis.role = 'foreground';
      continue;
    }
    
    // Primary brand color (highest brand score that's not utility)
    if (!assignedPrimary && score > 30 && analysis.saturation > 30) {
      analysis.role = 'primary';
      assignedPrimary = true;
      continue;
    }
    
    // Secondary brand color (good brand score, different characteristics from primary)
    if (!assignedSecondary && score > 20) {
      analysis.role = 'secondary';
      assignedSecondary = true;
      continue;
    }
    
    // Accent colors (high saturation, moderate usage)
    if (!assignedAccent && 
        analysis.saturation > 60 && 
        analysis.frequency < 50 &&
        analysis.lightness > 20 && 
        analysis.lightness < 80) {
      analysis.role = 'accent';
      assignedAccent = true;
      continue;
    }
    
    // Border/muted colors (low saturation, light colors)
    if (analysis.saturation < 25 && 
        analysis.lightness > 70 && 
        analysis.lightness < 95) {
      analysis.role = 'border';
      continue;
    }
    
    // Muted colors (low saturation)
    if (analysis.saturation < 30) {
      analysis.role = 'muted';
      continue;
    }
    
    // Default to neutral for remaining colors
    analysis.role = 'neutral';
  }
}

// Helper function to get appropriate foreground color based on lightness
export function getForegroundColor(backgroundColor: string, colorFormat: 'hsl' | 'oklch' | 'hex', isLightTheme: boolean = true): string {
  const defaults = getDefaultColors(colorFormat);
  const bgHsl = colorToHsl(backgroundColor);
  
  if (isLightTheme) {
    // Light theme: dark foreground for light backgrounds, light foreground for dark backgrounds
    return bgHsl.l < 50 ? defaults.white : defaults.darkGray;
  } else {
    // Dark theme: light foreground for dark backgrounds, dark foreground for light backgrounds  
    return bgHsl.l < 60 ? defaults.white : defaults.darkGray;
  }
}

// Helper function to set color with appropriate foreground
function setColorWithForeground(
  theme: Record<string, string>, 
  baseKey: string, 
  color: string, 
  colorFormat: 'hsl' | 'oklch' | 'hex',
  isLightTheme: boolean = true
): void {
  const formattedColor = convertColorToFormat(color, colorFormat);
  theme[baseKey] = formattedColor;
  theme[`${baseKey}-foreground`] = getForegroundColor(color, colorFormat, isLightTheme);
}

export function generateShadcnTheme(colorAnalyses: ColorAnalysis[], colorFormat: 'hsl' | 'oklch' | 'hex' = 'hsl'): { light: Record<string, string>; dark?: Record<string, string> } {
  const theme: { light: Record<string, string>; dark?: Record<string, string> } = {
    light: {}
  };
  
  // Get defaults for the specified format
  const defaults = getDefaultColors(colorFormat);
  
  // Find colors by role, sorted by confidence
  const findBestColorByRole = (role: ColorAnalysis['role']) => {
    const colors = colorAnalyses.filter(c => c.role === role);
    if (colors.length === 0) return null;
    return colors.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0].hex;
  };
  
  // Find multiple colors by role
  const findColorsByRole = (role: ColorAnalysis['role']) => {
    return colorAnalyses
      .filter(c => c.role === role)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .map(c => c.hex);
  };
  
  // Get the best primary color
  const primaryColor = findBestColorByRole('primary');
  
  // Light theme colors
  const backgrounds = findColorsByRole('background');
  const foregrounds = findColorsByRole('foreground');
  const secondaries = findColorsByRole('secondary');
  const accents = findColorsByRole('accent');
  const borders = findColorsByRole('border');
  const muteds = findColorsByRole('muted');
  const destructives = findColorsByRole('destructive');
  
  // Smart color selection with intelligent fallbacks
  const getSecondaryColor = () => {
    if (secondaries[0]) return secondaries[0];
    if (accents[0]) return accents[0]; // Use accent as secondary
    if (muteds[0]) return muteds[0];
    
    // Pick the most saturated non-primary color if available
    const nonPrimary = colorAnalyses.filter(c => c.role !== 'primary' && c.saturation > 30);
    if (nonPrimary.length > 0) {
      return nonPrimary.sort((a, b) => b.saturation - a.saturation)[0].hex;
    }
    
    return null;
  };
  
  const getAccentColor = () => {
    if (accents[0]) return accents[0];
    if (secondaries[1]) return secondaries[1]; // Use second secondary as accent
    
    // Find most vibrant color that's not primary or secondary  
    const secondaryColor = getSecondaryColor();
    const vibrantColors = colorAnalyses.filter(c => 
      c.role !== 'primary' && 
      c.hex !== secondaryColor && 
      c.saturation > 60 && 
      c.lightness > 30 && 
      c.lightness < 80
    );
    
    if (vibrantColors.length > 0) {
      return vibrantColors.sort((a, b) => b.saturation - a.saturation)[0].hex;
    }
    
    return secondaryColor;
  };
  
  const secondaryColor = getSecondaryColor();
  const accentColor = getAccentColor();
  
  // Build complete light theme with specified color format and sensible defaults
  const lightTheme: Record<string, string> = {};
  
  // Always include basic structure
  lightTheme['--radius'] = '0.5rem';
  
  // Background colors - use detected or sensible defaults
  if (backgrounds[0]) {
    const bgColor = convertColorToFormat(backgrounds[0], colorFormat);
    lightTheme['--background'] = bgColor;
    lightTheme['--card'] = bgColor;
    lightTheme['--popover'] = bgColor;
  } else {
    // Default to clean white
    lightTheme['--background'] = defaults.white;
    lightTheme['--card'] = defaults.white;
    lightTheme['--popover'] = defaults.white;
  }
  
  // Foreground colors - use detected or sensible defaults
  if (foregrounds[0]) {
    const fgColor = convertColorToFormat(foregrounds[0], colorFormat);
    lightTheme['--foreground'] = fgColor;
    lightTheme['--card-foreground'] = fgColor;
    lightTheme['--popover-foreground'] = fgColor;
  } else {
    // Default to dark gray for readability
    lightTheme['--foreground'] = defaults.darkGray;
    lightTheme['--card-foreground'] = defaults.darkGray;
    lightTheme['--popover-foreground'] = defaults.darkGray;
  }
  
  // Primary brand colors
  if (primaryColor) {
    const solidPrimaryColor = stripOpacity(primaryColor);
    setColorWithForeground(lightTheme, '--primary', solidPrimaryColor, colorFormat, true);
    lightTheme['--ring'] = convertColorToFormat(solidPrimaryColor, colorFormat);
  }
  
  // Secondary colors
  if (secondaryColor) {
    const solidSecondaryColor = stripOpacity(secondaryColor);
    setColorWithForeground(lightTheme, '--secondary', solidSecondaryColor, colorFormat, true);
  } else {
    // Default neutral secondary
    lightTheme['--secondary'] = defaults.lightGray;
    lightTheme['--secondary-foreground'] = defaults.darkGray;
  }
  
  // Accent colors
  if (accentColor) {
    setColorWithForeground(lightTheme, '--accent', accentColor, colorFormat, true);
  } else {
    // Default neutral accent
    lightTheme['--accent'] = defaults.lightGray;
    lightTheme['--accent-foreground'] = defaults.darkGray;
  }
  
  // Muted colors
  if (muteds[0]) {
    const mutedColor = convertColorToFormat(muteds[0], colorFormat);
    lightTheme['--muted'] = mutedColor;
    
    const mutedHsl = colorToHsl(muteds[0]);
    lightTheme['--muted-foreground'] = mutedHsl.l < 50 ? defaults.white : defaults.mutedGray;
  } else {
    // Default neutral muted
    lightTheme['--muted'] = defaults.lightGray;
    lightTheme['--muted-foreground'] = defaults.mutedGray;
  }
  
  // Destructive colors
  if (destructives[0]) {
    setColorWithForeground(lightTheme, '--destructive', destructives[0], colorFormat, true);
  } else {
    // Default red destructive color
    lightTheme['--destructive'] = defaults.destructiveRed;
    lightTheme['--destructive-foreground'] = defaults.white;
  }
  
  // Border colors
  if (borders[0]) {
    const borderColor = convertColorToFormat(borders[0], colorFormat);
    lightTheme['--border'] = borderColor;
    lightTheme['--input'] = borderColor;
  } else {
    // Default light border
    lightTheme['--border'] = defaults.borderGray;
    lightTheme['--input'] = defaults.borderGray;
  }
  
  theme.light = lightTheme;
  
  // Generate dark theme using specified color format with intelligent adjustments
  const hasColorVariation = colorAnalyses.some(c => c.saturation > 30);
  
  if (hasColorVariation && Object.keys(lightTheme).length > 3) {
    const darkTheme: Record<string, string> = {};
    
    // Always include basic structure
    darkTheme['--radius'] = '0.5rem';
    
    // Generate dark theme backgrounds and foregrounds
    if (backgrounds[0]) {
      const darkBg = adjustColorForDarkMode(backgrounds[0], 'background', colorFormat);
      darkTheme['--background'] = darkBg;
      darkTheme['--card'] = darkBg;
      darkTheme['--popover'] = darkBg;
    } else {
      // Standard dark background - different shades for depth
      darkTheme['--background'] = colorFormat === 'hsl' ? '240 9% 2%' : 
                                  colorFormat === 'oklch' ? 'oklch(0.141 0.005 285.823)' : '#0a0a0a';
      darkTheme['--card'] = colorFormat === 'hsl' ? '240 6% 10%' :
                           colorFormat === 'oklch' ? 'oklch(0.21 0.006 285.885)' : '#1a1a1a';
      darkTheme['--popover'] = colorFormat === 'hsl' ? '240 6% 10%' :
                              colorFormat === 'oklch' ? 'oklch(0.21 0.006 285.885)' : '#1a1a1a';
    }
    
    if (foregrounds[0]) {
      const darkFg = adjustColorForDarkMode(foregrounds[0], 'foreground', colorFormat);
      darkTheme['--foreground'] = darkFg;
      darkTheme['--card-foreground'] = darkFg;
      darkTheme['--popover-foreground'] = darkFg;
    } else {
      // Standard light foreground for dark mode
      darkTheme['--foreground'] = defaults.white;
      darkTheme['--card-foreground'] = defaults.white;
      darkTheme['--popover-foreground'] = defaults.white;
    }
    
    // Adjust brand colors for dark mode while preserving their character
    if (primaryColor) {
      const adjustedPrimary = adjustBrandColorForDarkMode(primaryColor, colorFormat);
      darkTheme['--primary'] = adjustedPrimary;
      darkTheme['--ring'] = adjustedPrimary;
      darkTheme['--primary-foreground'] = getForegroundColor(primaryColor, colorFormat, false);
    }
    
    if (secondaryColor) {
      const adjustedSecondary = adjustBrandColorForDarkMode(secondaryColor, colorFormat);
      darkTheme['--secondary'] = adjustedSecondary;
      darkTheme['--secondary-foreground'] = getForegroundColor(secondaryColor, colorFormat, false);
    } else {
      // Default dark secondary
      darkTheme['--secondary'] = defaults.mutedGray;
      darkTheme['--secondary-foreground'] = defaults.white;
    }
    
    if (accentColor) {
      const adjustedAccent = adjustBrandColorForDarkMode(accentColor, colorFormat);
      darkTheme['--accent'] = adjustedAccent;
      darkTheme['--accent-foreground'] = getForegroundColor(accentColor, colorFormat, false);
    } else {
      // Default dark accent
      darkTheme['--accent'] = defaults.mutedGray;
      darkTheme['--accent-foreground'] = defaults.white;
    }
    
    if (destructives[0]) {
      const adjustedDestructive = adjustBrandColorForDarkMode(destructives[0], colorFormat);
      darkTheme['--destructive'] = adjustedDestructive;
      darkTheme['--destructive-foreground'] = getForegroundColor(destructives[0], colorFormat, false);
    } else {
      // Default dark destructive
      darkTheme['--destructive'] = defaults.destructiveRed;
      darkTheme['--destructive-foreground'] = defaults.white;
    }
    
    // Adjust borders and muted colors for dark mode
    if (borders[0]) {
      const darkBorder = adjustColorForDarkMode(borders[0], 'border', colorFormat);
      darkTheme['--border'] = darkBorder;
      darkTheme['--input'] = darkBorder;
    } else {
      // Default dark borders using the defaults system
      darkTheme['--border'] = defaults.borderGray;
      darkTheme['--input'] = defaults.mutedGray;
    }
    
    if (muteds[0]) {
      const darkMuted = adjustColorForDarkMode(muteds[0], 'muted', colorFormat);
      darkTheme['--muted'] = darkMuted;
      darkTheme['--muted-foreground'] = defaults.white;
    } else {
      // Default dark muted
      darkTheme['--muted'] = defaults.mutedGray;
      darkTheme['--muted-foreground'] = defaults.white;
    }
    
    theme.dark = darkTheme;
  }
  
  return theme;
} 