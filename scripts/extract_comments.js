const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const commentRegex = /<!--([\s\S]*?)-->/g;
let match;
let count = 0;

console.log('=== All HTML Comments in index.html ===');
while ((match = commentRegex.exec(html)) !== null) {
  count++;
  const comment = match[1].trim();
  console.log(`[Comment ${count}] ${comment}`);
}
console.log(`Total HTML Comments: ${count}`);
