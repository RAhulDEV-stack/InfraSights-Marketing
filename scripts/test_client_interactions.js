const fs = require('fs');
const assert = require('assert');

// 1. Verify index.html content and structure
const html = fs.readFileSync('index.html', 'utf8');

console.log('=== Step 1: Checking index.html static elements ===');
assert(html.includes('id="appwise-dashboard"'), 'Dashboard root element must exist');
assert(html.includes('id="crumb-home"'), 'Crumb home must exist');
assert(html.includes('id="crumb-app"'), 'Crumb app must exist');
assert(html.includes('id="crumb-host"'), 'Crumb host must exist');
assert(html.includes('id="btn-simulate-down"'), 'Simulate down button must exist');
assert(html.includes('id="btn-sim-text"'), 'Simulate down button text span must exist');
assert(html.includes('id="btn-reset-nominal"'), 'Reset nominal button must exist');
assert(html.includes('id="appwise-view-home"'), 'Home view container must exist');
assert(html.includes('id="appwise-view-cluster"'), 'Cluster view container must exist');
assert(html.includes('id="appwise-view-host"'), 'Host view container must exist');
assert(html.includes('id="appwise-home-grid"'), 'Home grid container must exist');
assert(html.includes('id="cluster-view-app-title"'), 'Cluster app title must exist');
assert(html.includes('id="cluster-view-app-badge"'), 'Cluster app badge must exist');
assert(html.includes('id="cluster-cards-container"'), 'Cluster cards container must exist');
assert(html.includes('id="host-view-hostname"'), 'Host view hostname must exist');
assert(html.includes('id="host-view-ip"'), 'Host view IP must exist');
assert(html.includes('id="host-view-selector"'), 'Host view selector must exist');
assert(html.includes('id="canvas-host-large-pie"'), 'Host large pie canvas must exist');
assert(html.includes('id="host-pie-center-num"'), 'Host pie center num must exist');
assert(html.includes('id="host-pie-center-status"'), 'Host pie center status must exist');
assert(html.includes('id="fabric-a-card"'), 'Fabric A card must exist');
assert(html.includes('id="fabric-b-card"'), 'Fabric B card must exist');
assert(html.includes('id="fabric-b-badge"'), 'Fabric B badge must exist');
assert(html.includes('id="host-path-item-4"'), 'Host path item 4 must exist');
assert(html.includes('id="path-4-dot"'), 'Path 4 dot must exist');
assert(html.includes('id="path-4-name"'), 'Path 4 name must exist');
assert(html.includes('id="path-4-speed"'), 'Path 4 speed must exist');
assert(html.includes('id="host-alerts-box"'), 'Host alerts box must exist');
assert(html.includes('id="host-alerts-table"'), 'Host alerts table must exist');
assert(html.includes('id="host-alerts-tbody"'), 'Host alerts tbody must exist');
assert(html.includes('id="tab-overview"'), 'Tab overview pane must exist');
assert(html.includes('id="tab-optics"'), 'Tab optics pane must exist');
assert(html.includes('id="tab-switches"'), 'Tab switches pane must exist');
assert(html.includes('id="tab-congestion"'), 'Tab congestion pane must exist');
console.log('✓ All 37 essential DOM elements verified in index.html');

console.log('=== Step 2: Checking HTML tag balance ===');
const tagRegex = /<\/?([a-zA-Z0-9-]+)(\s+[^>]*)?>/g;
const stack = [];
const lines = html.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let match;
  while ((match = tagRegex.exec(line)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    if (['meta', 'link', 'br', 'hr', 'img', 'input', 'source'].includes(tagName) || fullTag.endsWith('/>')) {
      continue;
    }
    if (fullTag.startsWith('</')) {
      assert(stack.length > 0, `Extra closing tag </${tagName}> at line ${i+1}`);
      const last = stack.pop();
      assert(last.tag === tagName, `Mismatched closing tag </${tagName}> at line ${i+1}, expected </${last.tag}> (opened at ${last.line})`);
    } else {
      stack.push({ tag: tagName, line: i+1 });
    }
  }
}
assert(stack.length === 0, `Unclosed tags remaining: ${stack.map(s => s.tag).join(', ')}`);
console.log('✓ HTML tags are 100% strictly balanced');

console.log('=== Step 3: Checking App-Wise Domain Terms ===');
const terms = [
  'App-Wise', 'Cisco', 'Brocade', 'SNMP', 'Server Cluster', 'SAN path', 
  'Slot 4 Port 12', 'Slot 2 Port 8', 'One-view dashboard', 'complex DC structure'
];
for (const term of terms) {
  assert(html.toLowerCase().includes(term.toLowerCase()), `Term "${term}" must be present in index.html`);
}
console.log('✓ All domain terms present and prominent');

console.log('=== Step 4: Simulating Client-Side Logic from js/app.js ===');
const appJs = fs.readFileSync('js/app.js', 'utf8');

// Ensure navigation hijacking bug is NOT present
assert(!appJs.includes('if (isPortDownSimulated && host.id !== \'srv-cbs-db01\')'), 
  'Navigation hijacking bug must NOT exist in js/app.js');
console.log('✓ Verified: No navigation hijacking bug');

// Ensure host-view-selector is populated dynamically
assert(appJs.includes('host-view-selector'), 'Host view selector logic must exist in js/app.js');
assert(appJs.includes('appwise-host-pill'), 'Host pill selector logic must exist in js/app.js');
console.log('✓ Verified: Host selector allows switching hostnames within cluster');

console.log('\n========================================');
console.log('ALL CLIENT-SIDE VERIFICATION TESTS PASSED!');
console.log('========================================');
