import { JSDOM } from 'jsdom';
import https from 'https';

async function debugSpirit() {
  const url = 'https://www.spirit.com';
  
  const html = await new Promise<string>((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });

  console.log('🔍 Debugging Spirit Airlines HTML...\n');
  console.log('📄 HTML Length:', html.length);
  console.log('📄 First 1000 characters:');
  console.log(html.substring(0, 1000));
  console.log('\n📄 Last 500 characters:');
  console.log(html.substring(html.length - 500));
  
  // Look for yellow color references in the raw HTML/CSS
  console.log('\n🟡 Yellow Color References in Raw Content:');
  const yellowPatterns = [
    /#ffc107/gi,
    /#ffdc00/gi,
    /#fff[0-9a-f]{3}/gi,
    /rgb\(255,\s*[0-9]+,\s*[0-9]+\)/gi,
    /yellow/gi
  ];
  
  yellowPatterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      console.log(`  ${pattern}: ${matches.length} matches`);
      console.log(`    Examples: ${matches.slice(0, 3).join(', ')}`);
    }
  });

  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Check basic document structure
  console.log('\n📋 Document Structure:');
  console.log(`  Title: "${document.title}"`);
  console.log(`  Body children: ${document.body?.children.length || 0}`);
  console.log(`  Total elements: ${document.querySelectorAll('*').length}`);
  
  // Check for any divs with specific patterns
  console.log('\n🎯 Spirit-specific Patterns:');
  const spiritPatterns = [
    '[class*="spirit"]',
    '[class*="yellow"]', 
    '[class*="header"]',
    '[id*="header"]',
    '[class*="nav"]',
    'div[style*="background"]',
    '[style*="#ffc"]',
    '[style*="yellow"]'
  ];
  
  spiritPatterns.forEach(pattern => {
    const elements = document.querySelectorAll(pattern);
    console.log(`  ${pattern}: ${elements.length} elements`);
  });

  console.log('🔍 Debugging Spirit Airlines HTML structure...\n');

  // Check for header elements
  console.log('🎯 Header Analysis:');
  const headers = document.querySelectorAll('header, [class*="header"], [class*="nav"], [role="banner"]');
  console.log(`  Found ${headers.length} header-like elements`);
  
  headers.forEach((el, i) => {
    const style = (el as HTMLElement).style;
    const classes = el.className;
    console.log(`  Header ${i}: tag=${el.tagName}, classes="${classes}"`);
    if (style.backgroundColor) console.log(`    background: ${style.backgroundColor}`);
  });

  // Check for elements with yellow background
  console.log('\n🟡 Yellow Background Elements:');
  const allElements = document.querySelectorAll('*');
  const yellowElements: Element[] = [];
  
  allElements.forEach(el => {
    const style = (el as HTMLElement).style;
    const bg = style.backgroundColor;
    if (bg && (bg.includes('yellow') || bg.includes('#ff') || bg.includes('rgb(255,') || bg.includes('ffc'))) {
      yellowElements.push(el);
    }
  });
  
  console.log(`  Found ${yellowElements.length} elements with yellow-ish backgrounds`);
  yellowElements.slice(0, 5).forEach((el, i) => {
    const classes = el.className;
    const style = (el as HTMLElement).style;
    console.log(`  Yellow ${i}: tag=${el.tagName}, classes="${classes}", bg="${style.backgroundColor}"`);
  });

  // Check what class patterns actually exist
  console.log('\n📋 Common Class Patterns:');
  const classCount = new Map<string, number>();
  
  allElements.forEach(el => {
    if (el.className && typeof el.className === 'string') {
      el.className.split(/\s+/).forEach(cls => {
        if (cls.trim()) {
          classCount.set(cls, (classCount.get(cls) || 0) + 1);
        }
      });
    }
  });

  // Show top class patterns
  const sortedClasses = Array.from(classCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log('  Top 20 most common classes:');
  sortedClasses.forEach(([cls, count]) => {
    console.log(`    ${cls}: ${count}`);
  });

  // Check for semantic HTML5 elements
  console.log('\n🏗️ Semantic HTML5 Elements:');
  ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer'].forEach(tag => {
    const elements = document.querySelectorAll(tag);
    console.log(`  ${tag}: ${elements.length} elements`);
  });
}

debugSpirit().catch(console.error); 