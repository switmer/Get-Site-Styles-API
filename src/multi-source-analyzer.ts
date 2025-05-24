import type { 
  ExtractedTokens, 
  MultiSourceTokens, 
  SourceMetadata, 
  TokenConflict, 
  FrequencyItem, 
  ColorAnalysis 
} from './types';
import { HttpClient } from './http-client';
import { analyzeColors } from './color-analysis';

// Determine source type based on URL patterns
function detectSourceType(url: string): SourceMetadata['type'] {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('design.') || urlLower.includes('/design') || urlLower.includes('styleguide') || urlLower.includes('tokens')) {
    return 'design-system';
  }
  if (urlLower.includes('docs') || urlLower.includes('documentation') || urlLower.includes('guide')) {
    return 'documentation';
  }
  if (urlLower.includes('app.') || urlLower.includes('portal.') || urlLower.includes('dashboard')) {
    return 'application';
  }
  if (urlLower.match(/\.(com|org|net)\/?$/)) {
    return 'marketing';
  }
  
  return 'unknown';
}

// Assign weights based on source type for decision making
function getSourceWeight(type: SourceMetadata['type'], cssLength: number): number {
  const baseWeights = {
    'design-system': 100,      // Highest authority
    'documentation': 80,       // High authority
    'application': 60,         // Medium authority  
    'marketing': 40,          // Lower authority
    'unknown': 20             // Lowest authority
  };
  
  // Boost weight for sources with substantial CSS (more comprehensive)
  const cssBonus = cssLength > 50000 ? 20 : cssLength > 20000 ? 10 : 0;
  
  return baseWeights[type] + cssBonus;
}

// Merge frequency arrays from multiple sources
function mergeFrequencies(
  tokenType: string,
  sourceFreqs: Record<string, FrequencyItem[]>,
  sources: SourceMetadata[]
): { merged: FrequencyItem[]; conflicts: TokenConflict[] } {
  const valueMap = new Map<string, { totalCount: number; totalPrevalence: number; sources: string[] }>();
  const conflicts: TokenConflict[] = [];
  
  // Aggregate values across sources
  for (const [sourceUrl, freqArray] of Object.entries(sourceFreqs)) {
    const sourceWeight = sources.find(s => s.url === sourceUrl)?.weight || 1;
    
    for (const item of freqArray) {
      const existing = valueMap.get(item.value);
      if (existing) {
        existing.totalCount += item.count * (sourceWeight / 100);
        existing.totalPrevalence += item.prevalence * (sourceWeight / 100);
        existing.sources.push(sourceUrl);
      } else {
        valueMap.set(item.value, {
          totalCount: item.count * (sourceWeight / 100),
          totalPrevalence: item.prevalence * (sourceWeight / 100),
          sources: [sourceUrl]
        });
      }
    }
  }
  
  // Convert back to frequency array
  const merged = Array.from(valueMap.entries())
    .map(([value, data]) => ({
      value,
      count: Math.round(data.totalCount),
      prevalence: Number((data.totalPrevalence / data.sources.length).toFixed(2))
    }))
    .sort((a, b) => b.count - a.count);
  
  return { merged, conflicts };
}

// Enhanced color role analysis with multi-source context
function analyzeColorRolesMultiSource(
  colorsBySource: Record<string, FrequencyItem[]>,
  sources: SourceMetadata[],
  sourceTokens: Record<string, ExtractedTokens>
): ColorAnalysis[] {
  const allAnalyses: ColorAnalysis[] = [];
  
  // Analyze colors from each source
  for (const [sourceUrl, colorFreq] of Object.entries(colorsBySource)) {
    const sourceType = sources.find(s => s.url === sourceUrl)?.type || 'unknown';
    const sourceWeight = sources.find(s => s.url === sourceUrl)?.weight || 1;
    
    // Get colorsFromVariables for this source
    const sourceTokensData = sourceTokens[sourceUrl];
    const colorsFromVariables = sourceTokensData?.colorsFromVariables || [];
    
    // Convert colorsFromVariables to the expected format
    const variableColors = colorsFromVariables.map(color => ({
      variable: `--unknown-var`,
      value: color,
      references: 1
    }));
    
    const analyses = analyzeColors(colorFreq, variableColors);
    
    // Add source context and adjust confidence based on source type
    analyses.forEach(analysis => {
      analysis.sources = [sourceUrl];
      analysis.confidence = calculateColorConfidence(analysis, sourceType, sourceWeight);
      allAnalyses.push(analysis);
    });
  }
  
  // Merge analyses for same colors across sources
  const colorMap = new Map<string, ColorAnalysis>();
  
  for (const analysis of allAnalyses) {
    const existing = colorMap.get(analysis.hex);
    if (existing) {
      // Merge data
      existing.frequency += analysis.frequency;
      existing.sources.push(...analysis.sources);
      
      // Choose role with highest confidence
      if (analysis.confidence > existing.confidence) {
        existing.role = analysis.role;
        existing.confidence = analysis.confidence;
      }
    } else {
      colorMap.set(analysis.hex, { ...analysis });
    }
  }
  
  return Array.from(colorMap.values()).sort((a, b) => b.confidence - a.confidence);
}

function calculateColorConfidence(
  analysis: ColorAnalysis, 
  sourceType: SourceMetadata['type'], 
  sourceWeight: number
): number {
  // Use the analysis confidence from the improved color analysis
  let confidence = analysis.confidence || analysis.frequency;
  
  // Boost confidence for authoritative sources
  if (sourceType === 'design-system') {
    confidence *= 2;
  } else if (sourceType === 'documentation') {
    confidence *= 1.5;
  } else if (sourceType === 'application') {
    confidence *= 1.2; // Apps show real usage patterns
  }
  
  // Additional boost for colors that appear across multiple sources
  if (analysis.sources && analysis.sources.length > 1) {
    confidence *= 1.3;
  }
  
  return confidence * (sourceWeight / 100);
}

function isPotentialBrandColor(analysis: ColorAnalysis): boolean {
  const { saturation, lightness, frequency, contrast } = analysis;
  
  // Universal brand color heuristics (not company-specific)
  return (
    saturation > 40 && // Has color (not grayscale)
    lightness > 15 && lightness < 85 && // Not pure black/white
    contrast > 2.5 && // Usable for interactive elements
    frequency > 1 // Used more than once
  );
}

export class MultiSourceAnalyzer {
  private httpClient: HttpClient;
  
  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }
  
  async analyzeMultipleSources(
    urls: string[],
    extractTokensFromCss: (css: string) => ExtractedTokens
  ): Promise<MultiSourceTokens> {
    const sources: SourceMetadata[] = [];
    const sourceTokens: Record<string, ExtractedTokens> = {};
    
    console.log(`\nAnalyzing ${urls.length} sources...`);
    
    // Extract tokens from each source
    for (const url of urls) {
      try {
        console.log(`\nFetching: ${url}`);
        const html = await this.httpClient.fetchHtml(url);
        const allCss = await this.extractAllCss(html, url);
        
        console.log(`CSS length: ${allCss.length}`);
        
        const tokens = extractTokensFromCss(allCss);
        const sourceType = detectSourceType(url);
        const weight = getSourceWeight(sourceType, allCss.length);
        
        const metadata: SourceMetadata = {
          url,
          type: sourceType,
          weight,
          extractedAt: new Date().toISOString(),
          cssLength: allCss.length
        };
        
        sources.push(metadata);
        sourceTokens[url] = tokens;
        
        console.log(`Source type: ${sourceType}, Weight: ${weight}`);
        console.log(`Tokens found - Colors: ${tokens.colors.values.length}, Spacing: ${tokens.spacing.values.length}`);
        
      } catch (error) {
        console.warn(`Failed to analyze ${url}:`, error);
      }
    }
    
    // Merge tokens intelligently
    const mergedTokens = this.mergeTokensFromSources(sourceTokens, sources);
    const conflicts = this.detectConflicts(sourceTokens, sources);
    
    return {
      sources,
      mergedTokens,
      sourceTokens,
      conflicts
    };
  }
  
  private async extractAllCss(html: string, baseUrl: string): Promise<string> {
    const { JSDOM } = await import('jsdom');
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
    const externalCssArr = await Promise.all(linkHrefs.map(url => this.httpClient.fetchCss(url)));

    // Combine all CSS
    return [...externalCssArr, ...styleContents].join('\n');
  }
  
  private mergeTokensFromSources(
    sourceTokens: Record<string, ExtractedTokens>,
    sources: SourceMetadata[]
  ): ExtractedTokens {
    const merged: ExtractedTokens = {
      customProperties: {},
      colors: { values: [], frequency: [] },
      fontSizes: { values: [], frequency: [] },
      fontFamilies: { values: [], frequency: [] },
      fontWeights: { values: [], frequency: [] },
      lineHeights: { values: [], frequency: [] },
      letterSpacings: { values: [], frequency: [] },
      spacing: { values: [], frequency: [] },
      radii: { values: [], frequency: [] },
      shadows: { values: [], frequency: [] },
      gradients: { values: [], frequency: [] },
      breakpoints: { values: [], frequency: [] },
      zIndices: { values: [], frequency: [] },
      transitions: { values: [], frequency: [] },
      opacity: { values: [], frequency: [] },
      aspectRatios: { values: [], frequency: [] },
      borderWidths: { values: [], frequency: [] },
      borderStyles: { values: [], frequency: [] }
    };
    
    // Merge each token type
    const tokenTypes = Object.keys(merged) as Array<keyof ExtractedTokens>;
    
    for (const tokenType of tokenTypes) {
      if (tokenType === 'customProperties') {
        // Special handling for custom properties
        this.mergeCustomProperties(sourceTokens, sources, merged);
      } else {
        // Regular token groups
        const sourceFreqs: Record<string, FrequencyItem[]> = {};
        
        for (const [url, tokens] of Object.entries(sourceTokens)) {
          const tokenGroup = tokens[tokenType] as { frequency: FrequencyItem[] };
          if (tokenGroup?.frequency) {
            sourceFreqs[url] = tokenGroup.frequency;
          }
        }
        
        const { merged: mergedFreq } = mergeFrequencies(tokenType, sourceFreqs, sources);
        (merged[tokenType] as any).frequency = mergedFreq;
        (merged[tokenType] as any).values = mergedFreq.map(f => f.value);
      }
    }
    
    return merged;
  }
  
  private mergeCustomProperties(
    sourceTokens: Record<string, ExtractedTokens>,
    sources: SourceMetadata[],
    merged: ExtractedTokens
  ) {
    const propMap = new Map<string, any>();
    
    for (const [url, tokens] of Object.entries(sourceTokens)) {
      const sourceWeight = sources.find(s => s.url === url)?.weight || 1;
      
      for (const [prop, data] of Object.entries(tokens.customProperties)) {
        const existing = propMap.get(prop);
        if (existing) {
          // Merge references with weight
          existing.references += data.references * (sourceWeight / 100);
          if (sourceWeight > existing.sourceWeight) {
            existing.value = data.value;
            existing.sourceWeight = sourceWeight;
          }
        } else {
          propMap.set(prop, {
            ...data,
            sourceWeight
          });
        }
      }
    }
    
    // Convert back to the expected format
    for (const [prop, data] of Array.from(propMap)) {
      const { sourceWeight, ...cleanData } = data;
      merged.customProperties[prop] = cleanData;
    }
  }
  
  private detectConflicts(
    sourceTokens: Record<string, ExtractedTokens>,
    sources: SourceMetadata[]
  ): TokenConflict[] {
    const conflicts: TokenConflict[] = [];
    
    // This would detect when the same token appears with different roles/frequencies
    // across sources - implementation details depend on specific conflict scenarios
    
    return conflicts;
  }
} 