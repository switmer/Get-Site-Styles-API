import { JSDOM } from 'jsdom';
import { Root, Declaration, AtRule } from 'postcss';
import safeParser from 'postcss-safe-parser';
import { formatOutput } from '../../formatter';
import { HttpClient } from '../../http-client';
import { SecurityValidator } from '../../security';
import { MultiSourceAnalyzer } from '../../multi-source-analyzer';
import { analyzeImages, mergeImageColorsWithCss } from '../../image-analysis';
import { analyzeSemanticColors, enhanceColorsWithSemantic } from '../../semantic-color-analyzer';
import type { 
  ExtractedTokens, 
  ExtractedMeta, 
  ValidationError, 
  AuthConfig, 
  MultiSourceTokens, 
  ImageAnalysisResult, 
  SemanticColorAnalysis 
} from '../../types';
import type { AnalyzeRequest, AnalyzeResponse } from '../types';

export class AnalysisService {
  private httpClient: HttpClient;
  private validator: SecurityValidator;

  constructor() {
    this.validator = new SecurityValidator();
    this.httpClient = new HttpClient(); // Will be configured per request
  }

  async analyzeWebsite(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    const startTime = Date.now();

    try {
      // Validate URLs
      const validator = this.validator;
      await validator.validateUrl(request.url);
      
      if (request.urls) {
        for (const url of request.urls) {
          await validator.validateUrl(url);
        }
      }

      // Configure auth if provided
      let authConfig: AuthConfig | undefined;
      if (request.auth) {
        authConfig = {
          type: request.auth.type as 'basic' | 'bearer' | 'cookie' | 'custom'
        };

        switch (authConfig.type) {
          case 'basic':
            if (!request.auth.username || !request.auth.password) {
              throw new Error('Basic auth requires username and password');
            }
            authConfig.username = request.auth.username;
            authConfig.password = request.auth.password;
            break;
          
          case 'bearer':
            if (!request.auth.token) {
              throw new Error('Bearer auth requires token');
            }
            authConfig.token = request.auth.token;
            break;
          
          case 'cookie':
            if (!request.auth.cookies) {
              throw new Error('Cookie auth requires cookies');
            }
            authConfig.cookies = request.auth.cookies;
            break;
          
          case 'custom':
            if (!request.auth.headers) {
              throw new Error('Custom auth requires headers');
            }
            authConfig.headers = request.auth.headers;
            break;
        }
      }

      // Initialize HTTP client with auth
      const httpClient = new HttpClient({ auth: authConfig });

      // Determine if multi-source analysis
      const urls = [request.url];
      if (request.urls) {
        urls.push(...request.urls);
      }

      let result: any;
      let meta: any;

      if (urls.length === 1) {
        // Single source analysis
        const html = await httpClient.fetchHtml(request.url);
        const { tokens, meta: extractedMeta } = await this.extractStylesFromHtml(html, request.url, request);
        
        result = formatOutput(tokens, extractedMeta, {
          format: request.format || 'json',
          allFormats: request.allFormats || false,
          colorFormat: request.colorFormat || 'hsl',
          compact: request.compact || false
        });

        meta = {
          url: request.url,
          extractedAt: new Date().toISOString(),
          format: request.format || 'json',
          processingTime: Date.now() - startTime,
          totalTokens: extractedMeta.totalTokens
        };
      } else {
        // Multi-source analysis
        const multiAnalyzer = new MultiSourceAnalyzer(httpClient);
        const multiResult = await multiAnalyzer.analyzeMultipleSources(urls, this.extractTokensFromCss.bind(this));
        
        result = formatOutput(multiResult.mergedTokens, {
          sources: multiResult.sources,
          extractedAt: new Date().toISOString(),
          totalTokens: this.calculateTotalTokens(multiResult.mergedTokens),
          conflicts: multiResult.conflicts
        }, {
          format: request.format || 'json',
          allFormats: request.allFormats || false,
          colorFormat: request.colorFormat || 'hsl',
          compact: request.compact || false
        });

        meta = {
          url: request.url,
          urls: request.urls,
          extractedAt: new Date().toISOString(),
          format: request.format || 'json',
          processingTime: Date.now() - startTime,
          sources: multiResult.sources,
          conflicts: multiResult.conflicts,
          totalTokens: this.calculateTotalTokens(multiResult.mergedTokens)
        };
      }

      return {
        success: true,
        data: result,
        meta
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: {
          code: 'ANALYSIS_FAILED',
          message,
          details: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  private async extractStylesFromHtml(html: string, baseUrl: string, request: AnalyzeRequest): Promise<{ tokens: ExtractedTokens; meta: ExtractedMeta }> {
    const dom = new JSDOM(html, { url: baseUrl });
    const document = dom.window.document;

    // Extract CSS
    const cssContents: string[] = [];
    
    // Inline styles
    const styleElements = document.querySelectorAll('style');
    styleElements.forEach(style => {
      if (style.textContent) {
        cssContents.push(style.textContent);
      }
    });

    // External stylesheets (limited for security)
    const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of Array.from(linkElements).slice(0, 10)) { // Limit to 10 stylesheets
      const href = link.getAttribute('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          await this.validator.validateUrl(absoluteUrl);
          const css = await this.httpClient.fetchCss(absoluteUrl);
          cssContents.push(css);
        } catch (error) {
          console.warn(`Failed to fetch stylesheet: ${href}`, error);
        }
      }
    }

    const combinedCss = cssContents.join('\n');
    console.log(`Total combined CSS length: ${combinedCss.length}`);

    // Extract tokens
    const tokens = this.extractTokensFromCss(combinedCss);

    const meta: ExtractedMeta = {
      source: baseUrl,
      extractedAt: new Date().toISOString(),
      totalTokens: {
        customProperties: Object.keys(tokens.customProperties).length,
        colors: tokens.colors.frequency.length,
        fontSizes: tokens.fontSizes.frequency.length,
        fontFamilies: tokens.fontFamilies.frequency.length,
        fontWeights: tokens.fontWeights.frequency.length,
        lineHeights: tokens.lineHeights.frequency.length,
        letterSpacings: tokens.letterSpacings.frequency.length,
        spacing: tokens.spacing.frequency.length,
        radii: tokens.radii.frequency.length,
        shadows: tokens.shadows.frequency.length,
        gradients: tokens.gradients.frequency.length,
        breakpoints: tokens.breakpoints.frequency.length,
        zIndices: tokens.zIndices.frequency.length,
        transitions: tokens.transitions.frequency.length,
        opacity: tokens.opacity.frequency.length,
        aspectRatios: tokens.aspectRatios.frequency.length,
        borderWidths: tokens.borderWidths.frequency.length,
        borderStyles: tokens.borderStyles.frequency.length
      }
    };

    return { tokens, meta };
  }

  private extractTokensFromCss(css: string): ExtractedTokens {
    const root: Root = safeParser(css);
    const customProperties: Record<string, string> = {};
    const customPropRefs: Record<string, number> = {};
    const colors: string[] = [];
    const colorsFromVariables: Set<string> = new Set();
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

    // Extract tokens (simplified version of the CLI logic)
    root.walkDecls((decl: Declaration) => {
      // Custom properties
      if (decl.prop.startsWith('--')) {
        customProperties[decl.prop] = decl.value;
        
        const colorRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/g;
        const colorMatches = decl.value.match(colorRegex);
        if (colorMatches) {
          colorMatches.forEach(color => colorsFromVariables.add(color));
        }
        return;
      }

      // Extract various token types based on property names and values
      this.extractTokensByProperty(decl, {
        colors,
        fontSizes,
        fontFamilies,
        fontWeights,
        lineHeights,
        letterSpacings,
        spacing,
        radii,
        shadows,
        gradients,
        breakpoints,
        zIndices,
        transitions,
        opacity,
        aspectRatios,
        borderWidths,
        borderStyles
      });
    });

    // Convert to frequency arrays
    const dedup = (arr: string[]) => [...new Set(arr)];
    const frequencyArray = (arr: string[]) => {
      const freq: Record<string, number> = {};
      for (const v of arr) {
        freq[v] = (freq[v] || 0) + 1;
      }
      const total = arr.length;
      return Object.entries(freq)
        .map(([value, count]) => ({ value, count, prevalence: +(count / total * 100).toFixed(2) }))
        .sort((a, b) => b.count - a.count);
    };

    // Build colorsFromVariables array
    const colorsFromVariablesArray = Array.from(colorsFromVariables).map(color => ({
      variable: Object.keys(customProperties).find(prop => customProperties[prop].includes(color)) || '',
      value: color,
      references: 1
    }));

    return {
      customProperties: Object.fromEntries(
        Object.entries(customProperties).map(([k, v]) => [
          k,
          {
            value: v,
            references: customPropRefs[k] || 0,
            refVariable: this.resolveVar(v, customProperties) !== v ? v : undefined
          }
        ])
      ),
      colors: {
        values: dedup(colors),
        frequency: frequencyArray(colors)
      },
      colorsFromVariables: colorsFromVariablesArray.map(c => c.value),
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

  private extractTokensByProperty(decl: Declaration, collectors: any): void {
    const prop = decl.prop.toLowerCase();
    const value = decl.value;

    // Colors
    if (this.isColorProperty(prop)) {
      const colorRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)/g;
      const matches = value.match(colorRegex);
      if (matches) {
        matches.forEach(match => {
          if (this.isValidColor(match)) {
            collectors.colors.push(match);
          }
        });
      }
    }

    // Font sizes
    if (this.isFontSizeProperty(prop)) {
      const sizeRegex = /(\d+(?:\.\d+)?(?:px|em|rem|pt|pc|in|mm|cm|ex|ch|vw|vh|vmin|vmax|%))/g;
      const matches = value.match(sizeRegex);
      if (matches) {
        collectors.fontSizes.push(...matches);
      }
    }

    // Spacing (margins, padding, gaps, etc.)
    if (this.isSpacingProperty(prop)) {
      const spacingRegex = /(\d+(?:\.\d+)?(?:px|em|rem|pt|pc|in|mm|cm|ex|ch|vw|vh|vmin|vmax|%))/g;
      const matches = value.match(spacingRegex);
      if (matches) {
        collectors.spacing.push(...matches);
      }
    }

    // Additional token extraction logic would go here...
    // (This is a simplified version for the API)
  }

  private isColorProperty(prop: string): boolean {
    return /color|background|border|outline|fill|stroke/.test(prop);
  }

  private isFontSizeProperty(prop: string): boolean {
    return prop === 'font-size' || prop === 'font';
  }

  private isSpacingProperty(prop: string): boolean {
    return /margin|padding|gap|top|right|bottom|left|width|height/.test(prop);
  }

  private isValidColor(color: string): boolean {
    // Basic color validation
    return !/^(inherit|initial|unset|auto|none|transparent)$/.test(color.toLowerCase());
  }

  private resolveVar(value: string, customProperties: Record<string, string>, seen: Set<string> = new Set()): string {
    const varRegex = /var\((--[\w-]+)\)/g;
    let result = value;
    let match;
    while ((match = varRegex.exec(result)) !== null) {
      const varName = match[1];
      if (seen.has(varName)) break;
      seen.add(varName);
      const replacement = customProperties[varName];
      if (replacement) {
        const resolved = this.resolveVar(replacement, customProperties, seen);
        result = result.replace(match[0], resolved);
      }
    }
    return result;
  }

  private calculateTotalTokens(tokens: ExtractedTokens): Record<string, number> {
    return {
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
    };
  }
} 