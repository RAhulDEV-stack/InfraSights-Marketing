const fs = require('fs');

const files = ['index.html', 'js/app.js', 'js/canvas.js', 'css/styles.css'];

const terms = [
  'ai', 'ml', 'machine learning', 'neural', 'deep learning', 'llm', 'copilot', 'predictive', 'prediction',
  'brocade', 'cisco', 'mds', 'sannav', 'fabric os', 'fos', 'nx-os', 'nxos', 'x7', 'g620', 'g630', '9710', '9148', 'broadcom',
  'insightops', 'infrasight'
];

let totalMatches = 0;

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  console.log('=== Checking', f, 'lines:', lines.length, '===');
  lines.forEach((line, i) => {
    for (const term of terms) {
      const regex = new RegExp('\\b' + term.replace('-', '[\\s-]*') + '\\b', 'i');
      if (regex.test(line)) {
        if (term === 'insightops' && /Formerly known as InsightOps/i.test(line)) {
          console.log(`[ALLOWED NOTE] [${f}:${i + 1}] Line contains allowed legacy note: "${line.trim()}"`);
          continue;
        }
        if (term === 'ml' && /ml-\d+/.test(line)) continue;

        // If term is 'infrasight', verify if it's 'Infrasights' (plural) vs 'Infrasight' (singular)
        if (term === 'infrasight') {
          // If followed by 's', it's Infrasights which is the correct product name!
          const singularMatch = line.match(/\bInfrasight(?!s)\b/i);
          if (!singularMatch) {
            continue; // It's "Infrasights", valid!
          }
        }

        totalMatches++;
        console.log(`[VIOLATION] [${f}:${i + 1}] Found '${term}': "${line.trim()}"`);
      }
    }
  });
});

console.log('=== Total Frontend Violations (excluding allowed footer migration note):', totalMatches);
