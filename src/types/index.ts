export interface ExtractedTokens {
  customProperties: Record<string, {
    value: string;
    references: number;
    refVariable?: string;
  }>;
  colors: TokenGroup;
  colorsFromVariables?: string[]; // Colors that come from CSS custom properties
  fontSizes: TokenGroup;
  fontFamilies: TokenGroup;
  fontWeights: TokenGroup;
  lineHeights: TokenGroup;
  letterSpacings: TokenGroup;
  spacing: TokenGroup;
  radii: TokenGroup;
  shadows: TokenGroup;
  gradients: TokenGroup;
  breakpoints: TokenGroup;
  zIndices: TokenGroup;
  transitions: TokenGroup;
  opacity: TokenGroup;
  aspectRatios: TokenGroup;
  borderWidths: TokenGroup;
  borderStyles: TokenGroup;
}

export interface TokenGroup {
  values: string[];
  frequency: FrequencyItem[];
}

export interface FrequencyItem {
  value: string;
  count: number;
  prevalence: number;
}

export interface ExtractedMeta {
  source: string;
  extractedAt: string;
  totalTokens: Record<string, number>;
}

export interface AuthConfig {
  type: 'basic' | 'bearer' | 'cookie' | 'custom';
  username?: string;
  password?: string;
  token?: string;
  cookies?: string;
  headers?: Record<string, string>;
}

export interface RequestConfig {
  timeout: number;
  maxContentLength: number;
  maxRedirects: number;
  userAgent: string;
  auth?: AuthConfig;
}

export interface SecurityConfig {
  allowedHosts: string[];
  blockedHosts: string[];
  maxCssSize: number;
  maxConcurrentRequests: number;
}

export interface ValidationError extends Error {
  code: string;
  details?: any;
}

export interface SourceMetadata {
  url: string;
  type: 'marketing' | 'design-system' | 'documentation' | 'application' | 'unknown';
  weight: number;
  extractedAt: string;
  cssLength: number;
}

export interface MultiSourceTokens {
  sources: SourceMetadata[];
  mergedTokens: ExtractedTokens;
  sourceTokens: Record<string, ExtractedTokens>;
  conflicts: TokenConflict[];
}

export interface TokenConflict {
  tokenType: string;
  value: string;
  sources: Array<{
    url: string;
    frequency: number;
    role?: string;
  }>;
  resolution: 'frequency' | 'source-weight' | 'manual';
  chosen: {
    value: string;
    source: string;
    reason: string;
  };
}

export interface ColorAnalysis {
  hex: string;
  role: 'primary' | 'secondary' | 'accent' | 'background' | 'foreground' | 'muted' | 'destructive' | 'border' | 'neutral';
  lightness: number;
  saturation: number;
  hue: number;
  contrast: number;
  frequency: number;
  sources: string[];
  confidence: number;
}

export interface ShadcnTheme {
  light: Record<string, string>;
  dark?: Record<string, string>;
}

export interface TailwindCorrelations {
  colors: Record<string, string[]>;
  spacing: Record<string, string[]>;
  fontSize: Record<string, string[]>;
  borderRadius: Record<string, string[]>;
  fontFamily: Record<string, string[]>;
}

export interface ImageColorData {
  url: string;
  type: 'logo' | 'hero' | 'product' | 'background' | 'icon' | 'unknown';
  dominantColors: string[];
  weight: number;
  analysis?: {
    colorCount: number;
    averageSaturation: number;
    isMonochrome: boolean;
    hasTransparency: boolean;
  };
}

export interface ImageAnalysisResult {
  images: ImageColorData[];
  totalImages: number;
  logoColors: string[];
  heroColors: string[];
  averageColorsPerImage: number;
}

export interface SemanticColorData {
  color: string;
  element: string;
  context: 'button' | 'navigation' | 'cta' | 'form' | 'brand' | 'status' | 'link' | 'header' | 'hero' | 'accent';
  weight: number;
  selector: string;
  property: string; // background-color, color, border-color, etc.
  frequency: number;
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