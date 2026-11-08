const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const aMatches = [...html.matchAll(/<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi)];
console.log('=== All Anchor Links in index.html ===');
aMatches.forEach((m, i) => {
  const attrs = m[1];
  const text = m[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
  const hrefMatch = attrs.match(/href=["']([^"']*)["']/);
  const href = hrefMatch ? hrefMatch[1] : 'NO_HREF';
  const idMatch = attrs.match(/id=["']([^"']*)["']/);
  const id = idMatch ? idMatch[1] : '';
  const onclickMatch = attrs.match(/onclick=["']([^"']*)["']/);
  const onclick = onclickMatch ? onclickMatch[1] : '';
  console.log(`${i+1}. [${id || 'no-id'}] "${text}" -> href="${href}" onclick="${onclick}"`);
});

const btnMatches = [...html.matchAll(/<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi)];
console.log('\n=== All Buttons in index.html ===');
btnMatches.forEach((m, i) => {
  const attrs = m[1];
  const text = m[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
  const idMatch = attrs.match(/id=["']([^"']*)["']/);
  const id = idMatch ? idMatch[1] : '';
  const classMatch = attrs.match(/class=["']([^"']*)["']/);
  const cls = classMatch ? classMatch[1] : '';
  const typeMatch = attrs.match(/type=["']([^"']*)["']/);
  const type = typeMatch ? typeMatch[1] : '';
  const onclickMatch = attrs.match(/onclick=["']([^"']*)["']/);
  const onclick = onclickMatch ? onclickMatch[1] : '';
  console.log(`${i+1}. [${id || 'no-id'}] class="${cls}" type="${type}" "${text}" onclick="${onclick}"`);
});

console.log('\n=== Target Section Anchor Verification ===');
const targets = ['hero', 'comparison', 'capabilities', 'architecture', 'interface', 'deployment', 'faq', 'roadmap'];
targets.forEach(t => {
  const exists = html.includes(`id="${t}"`);
  console.log(`Target #${t}: ${exists ? 'FOUND' : 'MISSING!'}`);
});
