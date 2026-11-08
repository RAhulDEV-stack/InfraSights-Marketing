const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

// 1. Hidden inputs
const hiddenInputs = html.match(/<input[^>]*type=["']hidden["'][^>]*>/gi) || [];
console.log('Hidden inputs count:', hiddenInputs.length);
hiddenInputs.forEach((h, i) => console.log(`[Hidden Input ${i + 1}] ${h}`));

// 2. Script tags
const scriptTags = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
console.log('\nScript tags count:', scriptTags.length);
scriptTags.forEach((s, i) => console.log(`[Script Tag ${i + 1}] ${s.substring(0, 100)}...`));

// 3. Select options
const options = html.match(/<option\b[^>]*>([\s\S]*?)<\/option>/gi) || [];
console.log('\nSelect options count:', options.length);
options.forEach((o, i) => console.log(`[Option ${i + 1}] ${o.trim()}`));
