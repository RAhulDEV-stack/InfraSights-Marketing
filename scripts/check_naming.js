const fs = require('fs');

const files = ['index.html', 'js/app.js', 'js/canvas.js'];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const matches = content.match(/infrasight[a-z0-9\s.-]*/gi) || [];
  const uniqueNames = new Set(matches.map(m => m.trim()));
  console.log('=== File:', f, '===');
  console.log('Total occurrences:', matches.length);
  console.log('Unique expressions:', Array.from(uniqueNames).slice(0, 30));
});
