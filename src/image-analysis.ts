import { JSDOM } from 'jsdom';
import type { ImageColorData, ImageAnalysisResult } from './types';

// Image type detection based on URL patterns and context
function detectImageType(url: string, alt: string = '', className: string = '', context: string = ''): ImageColorData['type'] {
  const urlLower = url.toLowerCase();
  const altLower = alt.toLowerCase();
  const classLower = className.toLowerCase();
  const contextLower = context.toLowerCase();
  
  // Logo detection
  if (
    urlLower.includes('logo') ||
    altLower.includes('logo') ||
    classLower.includes('logo') ||
    urlLower.includes('brand') ||
    contextLower.includes('logo')
  ) {
    return 'logo';
  }
  
  // Hero image detection
  if (
    classLower.includes('hero') ||
    classLower.includes('banner') ||
    urlLower.includes('hero') ||
    urlLower.includes('banner') ||
    contextLower.includes('hero')
  ) {
    return 'hero';
  }
  
  // Icon detection
  if (
    urlLower.includes('icon') ||
    altLower.includes('icon') ||
    classLower.includes('icon') ||
    urlLower.includes('.ico')
  ) {
    return 'icon';
  }
  
  // Product image detection
  if (
    urlLower.includes('product') ||
    altLower.includes('product') ||
    classLower.includes('product')
  ) {
    return 'product';
  }
  
  // Background image detection
  if (
    urlLower.includes('background') ||
    urlLower.includes('bg-') ||
    classLower.includes('background') ||
    contextLower.includes('background-image')
  ) {
    return 'background';
  }
  
  return 'unknown';
}

// Get image weight based on type and other factors
function getImageWeight(type: ImageColorData['type'], size?: { width: number; height: number }): number {
  const baseWeights = {
    'logo': 150,      // Highest authority
    'icon': 120,      // High authority  
    'hero': 80,       // Medium-high authority
    'product': 60,    // Medium authority
    'background': 40, // Lower authority
    'unknown': 30     // Lowest authority
  };
  
  let weight = baseWeights[type];
  
  // Boost weight for larger images (likely more important)
  if (size) {
    const area = size.width * size.height;
    if (area > 100000) weight += 20; // Large images
    else if (area > 10000) weight += 10; // Medium images
    // Small images get no boost
  }
  
  return weight;
}

// Extract images from HTML and CSS
export function discoverImages(html: string, css: string, baseUrl: string): string[] {
  const imageUrls = new Set<string>();
  
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Extract from IMG tags
    const imgTags = document.querySelectorAll('img');
    imgTags.forEach(img => {
      const src = (img as HTMLImageElement).src;
      if (src) {
        const absoluteUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
        imageUrls.add(absoluteUrl);
      }
    });
    
    // Extract from CSS background-image
    const backgroundImageRegex = /background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/gi;
    let match;
    while ((match = backgroundImageRegex.exec(css)) !== null) {
      const url = match[1];
      if (url && !url.startsWith('data:')) {
        const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        imageUrls.add(absoluteUrl);
      }
    }
    
    // Extract from SVG (could contain brand colors)
    const svgTags = document.querySelectorAll('svg');
    // For now, we'll skip SVG processing but could extract fill/stroke colors
    
  } catch (error) {
    console.warn('Error parsing HTML for images:', error);
  }
  
  return Array.from(imageUrls);
}

// Mock dominant color extraction (would use real library in production)
async function extractDominantColors(imageUrl: string): Promise<string[]> {
  // This is a placeholder - in real implementation would use:
  // - sharp + color-thief for Node.js
  // - Canvas API for browser
  // - Computer vision API for advanced analysis
  
  console.log(`[MOCK] Extracting colors from: ${imageUrl}`);
  
  // Return mock colors based on URL patterns (for demonstration)
  const url = imageUrl.toLowerCase();
  
  if (url.includes('logo')) {
    // Mock logo colors - typically brand primaries
    return ['#e40089', '#262a82', '#ffffff'];
  } else if (url.includes('hero') || url.includes('banner')) {
    // Mock hero image colors - typically brand + photography
    return ['#569ff7', '#f398c0', '#b0f4ff', '#3da834'];
  } else if (url.includes('product')) {
    // Mock product colors - varied
    return ['#d32f2f', '#1976d2', '#f57c00'];
  }
  
  // Default mock colors
  return ['#333333', '#666666', '#999999'];
}

// Main image analysis function
export async function analyzeImages(
  html: string, 
  css: string, 
  baseUrl: string,
  options: { maxImages?: number; timeout?: number } = {}
): Promise<ImageAnalysisResult> {
  const { maxImages = 20, timeout = 5000 } = options;
  
  console.log('🖼️  Starting image analysis...');
  
  // Discover images
  const imageUrls = discoverImages(html, css, baseUrl);
  console.log(`Found ${imageUrls.length} images`);
  
  // Limit number of images to process
  const urlsToProcess = imageUrls.slice(0, maxImages);
  
  const imageAnalysis: ImageColorData[] = [];
  const logoColors: string[] = [];
  const heroColors: string[] = [];
  
  // Process each image
  for (const url of urlsToProcess) {
    try {
      console.log(`Processing: ${url.substring(0, 80)}...`);
      
      // Extract context from original HTML for better type detection
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const imgElement = Array.from(document.querySelectorAll('img')).find(
        img => (img as HTMLImageElement).src === url || (img as HTMLImageElement).src.endsWith(url.split('/').pop() || '')
      );
      
      const alt = imgElement ? (imgElement as HTMLImageElement).alt : '';
      const className = imgElement ? (imgElement as HTMLImageElement).className : '';
      
      // Detect image type
      const type = detectImageType(url, alt, className);
      
      // Extract dominant colors (mock for now)
      const dominantColors = await extractDominantColors(url);
      
      // Get weight
      const weight = getImageWeight(type);
      
      const imageData: ImageColorData = {
        url,
        type,
        dominantColors,
        weight,
        analysis: {
          colorCount: dominantColors.length,
          averageSaturation: 75, // Mock
          isMonochrome: dominantColors.length <= 2,
          hasTransparency: url.includes('.png') // Mock
        }
      };
      
      imageAnalysis.push(imageData);
      
      // Collect colors by type
      if (type === 'logo') {
        logoColors.push(...dominantColors);
      } else if (type === 'hero') {
        heroColors.push(...dominantColors);
      }
      
    } catch (error) {
      console.warn(`Failed to process image ${url}:`, error);
    }
  }
  
  console.log(`✅ Processed ${imageAnalysis.length} images`);
  console.log(`🎨 Found ${logoColors.length} logo colors, ${heroColors.length} hero colors`);
  
  return {
    images: imageAnalysis,
    totalImages: imageUrls.length,
    logoColors: Array.from(new Set(logoColors)),
    heroColors: Array.from(new Set(heroColors)),
    averageColorsPerImage: imageAnalysis.length > 0 
      ? imageAnalysis.reduce((sum, img) => sum + img.dominantColors.length, 0) / imageAnalysis.length 
      : 0
  };
}

// Integration function: merge image colors with CSS colors
export function mergeImageColorsWithCss(
  cssColors: { value: string; count: number }[],
  imageAnalysis: ImageAnalysisResult
): { value: string; count: number; source: 'css' | 'image'; imageType?: string }[] {
  type MergedColor = { value: string; count: number; source: 'css' | 'image'; imageType?: string };
  
  const merged: MergedColor[] = cssColors.map(c => ({ 
    ...c, 
    source: 'css' as const, 
    imageType: undefined 
  }));
  
  // Add image colors with weighted frequency
  imageAnalysis.images.forEach(image => {
    image.dominantColors.forEach(color => {
      // Check if color already exists in CSS
      const existing = merged.find(c => c.value.toLowerCase() === color.toLowerCase());
      if (existing) {
        // Boost existing color with image weight
        existing.count += image.weight;
      } else {
        // Add new color from image
        merged.push({
          value: color,
          count: image.weight,
          source: 'image',
          imageType: image.type
        });
      }
    });
  });
  
  return merged.sort((a, b) => b.count - a.count);
} 