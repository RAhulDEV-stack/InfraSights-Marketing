const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

const ids = [
  'appwise-dashboard', 'crumb-home', 'crumb-app', 'crumb-host', 'crumb-sep-1', 'crumb-sep-2',
  'btn-simulate-down', 'btn-sim-text', 'btn-reset-nominal', 'appwise-view-home',
  'appwise-view-cluster', 'appwise-view-host', 'appwise-home-grid', 'cluster-view-app-title',
  'cluster-view-app-badge', 'cluster-cards-container', 'host-view-hostname', 'host-view-ip',
  'canvas-host-large-pie', 'host-pie-center-num', 'host-pie-center-status', 'fabric-b-card',
  'fabric-b-badge', 'host-path-item-4', 'path-4-dot', 'path-4-name', 'path-4-speed',
  'host-alerts-box', 'host-alerts-table', 'host-alerts-tbody', 'appwise-slice-tooltip',
  'tab-overview', 'tab-optics', 'tab-switches', 'tab-congestion', 'san-topology-canvas', 'toggle-congestion-btn'
];

const missing = ids.filter(id => !html.includes(`id="${id}"`));

console.log('Checked IDs:', ids.length);
if (missing.length === 0) {
  console.log('ALL REQUIRED IDs ARE PRESENT IN index.html!');
} else {
  console.error('MISSING IDs:', missing);
  process.exit(1);
}

// Check JSON-LD validity
const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!jsonLdMatch) {
  console.error('JSON-LD script not found!');
  process.exit(1);
}
try {
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  console.log('JSON-LD parsed successfully! Graph nodes:', jsonLd['@graph'].length);
} catch (e) {
  console.error('JSON-LD parse error:', e.message);
  process.exit(1);
}

// Verify key terminology present in index.html
const terms = ['App-Wise', 'Cisco', 'Brocade', 'SNMP', 'Server Cluster', 'SAN path', 'Slot 4 Port 12'];
for (const term of terms) {
  if (!html.includes(term)) {
    console.error(`Term "${term}" not found in index.html!`);
    process.exit(1);
  }
}
console.log('All key domain terms verified present in index.html!');
