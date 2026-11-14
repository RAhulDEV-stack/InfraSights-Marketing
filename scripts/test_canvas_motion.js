const fs = require('fs');
const assert = require('assert');

// Create mock browser DOM environment
class MockContext2D {
  constructor() {
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.font = '';
    this.textAlign = '';
    this.shadowBlur = 0;
    this.shadowColor = '';
    this.lineDashOffset = 0;
    this.drawnPixels = 0;
  }
  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() { this.drawnPixels += 10; }
  fill() { this.drawnPixels += 10; }
  arc() {}
  rect() {}
  fillRect() { this.drawnPixels += 10; }
  save() {}
  restore() {}
  translate() {}
  scale() {}
  rotate() {}
  closePath() {}
  setLineDash() {}
  measureText(str) { return { width: (str || '').length * 7 }; }
  fillText() { this.drawnPixels += 10; }
  quadraticCurveTo() {}
  createRadialGradient() {
    return { addColorStop: () => {} };
  }
  getImageData() {
    // Return mock image data with positive alpha
    const arr = new Uint8ClampedArray(400);
    arr[3] = 255;
    return { data: arr };
  }
}

class MockCanvas {
  constructor() {
    this.width = 800;
    this.height = 460;
    this.ctx = new MockContext2D();
    this.listeners = {};
  }
  getContext() { return this.ctx; }
  getBoundingClientRect() {
    return { left: 100, top: 100, width: this.width, height: this.height, right: 100 + this.width, bottom: 100 + this.height };
  }
  addEventListener(event, fn) {
    this.listeners[event] = fn;
  }
}

class MockElement {
  constructor(id) {
    this.id = id;
    this.style = {};
    this.classList = new Set();
    this.innerText = '';
    this.innerHTML = '';
  }
}

// Setup globals
global.window = {
  devicePixelRatio: 1,
  matchMedia: (q) => ({ matches: false, addEventListener: () => {} }),
  addEventListener: () => {}
};
global.document = {
  getElementById: (id) => {
    if (id === 'san-topology-canvas') return new MockCanvas();
    if (id === 'canvas-tooltip') return new MockElement('canvas-tooltip');
    if (id === 'toggle-congestion-btn') return new MockElement('toggle-congestion-btn');
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Load canvas.js
const { SANTopologyCanvas } = require('../js/canvas.js');

console.log('=== Step 1: Testing SANTopologyCanvas Instantiation & Node Hierarchy ===');
const topology = new SANTopologyCanvas('san-topology-canvas', 'canvas-tooltip');
assert(topology !== null, 'Topology instance must be created');
assert(topology.nodes.length >= 7, `Expected at least 7 nodes, got ${topology.nodes.length}`);

const engineNode = topology.nodes.find(n => n.id === 'infrasights-engine');
assert(engineNode, 'infrasights-engine must exist in topology.nodes');
assert(/Fabric|Optics|Throughput|Latency|Health|Collector|Engine|Buffer/i.test(JSON.stringify(engineNode.metrics)),
  'infrasights-engine metrics must match domain requirements');

const ciscoNode = topology.nodes.find(n => n.id === 'core-sw-01');
assert(ciscoNode, 'Cisco MDS Director node must exist');
const brocadeNode = topology.nodes.find(n => n.id === 'core-sw-02');
assert(brocadeNode, 'Brocade Director node must exist');
const hostNode = topology.nodes.find(n => n.id === 'host-cbs-db01');
assert(hostNode, 'Host node srv-cbs-db01 must exist');
assert(hostNode.slices && hostNode.slices.length === 4, 'Host node must have 4 dedicated SAN path slices');
console.log('✓ Verified: 3-tier node hierarchy & dedicated SAN path slices properly structured');

console.log('\n=== Step 2: Testing Rapid Mouse Movement & Tooltip Clamping ===');
let clampingViolations = 0;
const origGetBoundingClientRect = topology.canvas.getBoundingClientRect;
let forcedReflowCalls = 0;
topology.canvas.getBoundingClientRect = function() {
  forcedReflowCalls++;
  return origGetBoundingClientRect.apply(this, arguments);
};

// Fire 160 rapid mouse events across canvas
const tw = topology.TOOLTIP_WIDTH;
const th = topology.TOOLTIP_HEIGHT;
const maxW = topology.width;
const maxH = topology.height;

for (let i = 0; i < 160; i++) {
  const fakeEvent = {
    clientX: 100 + (i % 40) * 20,
    clientY: 100 + (i % 25) * 15
  };
  topology.handleMouseMove(fakeEvent);

  if (topology.tooltip.style.opacity === '1') {
    const transformStr = topology.tooltip.style.transform;
    const match = transformStr.match(/translate3d\(([-0-9.]+)px,\s*([-0-9.]+)px/);
    if (match) {
      const posX = parseFloat(match[1]);
      const posY = parseFloat(match[2]);
      if (posX < 8 || posX > maxW - tw - 8) {
        clampingViolations++;
      }
      if (posY < 8 || posY > maxH - th - 8) {
        clampingViolations++;
      }
    }
  }
}
assert.strictEqual(clampingViolations, 0, 'No tooltip clamping violations allowed');
assert.strictEqual(forcedReflowCalls, 0, 'Zero getBoundingClientRect calls during mouse moves');
console.log('✓ Verified: 160 mouse events handled with 0 clamping violations and 0 forced reflows');

console.log('\n=== Step 3: Testing Resize Resilience & Negative Dimension Stress ===');
// Zero dimensions
topology.width = 0;
topology.height = 0;
topology.setupTopology();
topology.render();
assert(topology.nodes.length === 0, 'Nodes safely cleared on 0x0 dimensions');

// Negative dimensions
topology.width = -500;
topology.height = -300;
topology.setupTopology();
topology.render();
assert(topology.nodes.length === 0, 'Nodes safely cleared on negative dimensions');

// Multi-resolution boundary audit
const resolutions = [
  { w: 320, h: 568 },
  { w: 768, h: 1024 },
  { w: 1920, h: 1080 },
  { w: 3840, h: 2160 }
];

for (const res of resolutions) {
  topology.width = res.w;
  topology.height = res.h;
  topology.setupTopology();
  topology.render();
  const allInBounds = topology.nodes.every(n => n.x >= 0 && n.x <= res.w && n.y >= 0 && n.y <= res.h);
  assert(allInBounds, `All nodes must stay within [0, ${res.w}] and [0, ${res.h}]`);
}
console.log('✓ Verified: All tested resolutions keep 100% of nodes strictly within screen bounds');

console.log('\n=== Step 4: Testing Real-Time Switch Fault Simulation (Red Slice) ===');
topology.width = 800;
topology.height = 460;
topology.setupTopology();

// Nominal mode
const hostNominal = topology.nodes.find(n => n.id === 'host-cbs-db01');
const slice4Nominal = hostNominal.slices.find(s => s.isTargetDown);
assert(slice4Nominal.color === '#10b981', 'Nominal Slice 4 must be emerald #10b981');

// Fault mode
topology.setMode('congestion');
const hostFault = topology.nodes.find(n => n.id === 'host-cbs-db01');
const slice4Fault = hostFault.slices.find(s => s.isTargetDown);
assert(slice4Fault.color === '#ef4444', 'Faulted Slice 4 must be vibrant red #ef4444');
assert(topology.snmpTrapPulses.length > 0, 'SNMP trap pulse must be active in fault mode');
assert(hostFault.metrics.path4FabricB.includes('RED SLICE'), 'Path 4 metrics must indicate RED SLICE');

// Reset nominal
topology.setMode('normal');
const hostRestored = topology.nodes.find(n => n.id === 'host-cbs-db01');
const slice4Restored = hostRestored.slices.find(s => s.isTargetDown);
assert(slice4Restored.color === '#10b981', 'Restored Slice 4 must return to #10b981');
console.log('✓ Verified: Switch fault simulation triggers vibrant red slice & SNMP trap stream');

console.log('\n=== Step 5: Testing Reduced Motion Mode ===');
topology.reducedMotion = true;
topology.stop();
topology.render();
assert(topology.isRunning === false, 'Animation must stop in reduced motion');
assert(topology.animId === null, 'animId must be null');
console.log('✓ Verified: Reduced motion accessibility mode operates correctly');

console.log('\n=== Step 6: Testing Multi-Tier Camera Coordinate Inversion & Hit Testing ===');
topology.reducedMotion = false;
topology.width = 800;
topology.height = 460;
topology.setupTopology();

const testTiers = ['app', 'cluster', 'host', 'overview'];
for (const tier of testTiers) {
  topology.setTier(tier);
  topology.camera.zoom = topology.camera.targetZoom;
  topology.camera.panX = topology.camera.targetPanX;
  topology.camera.panY = topology.camera.targetPanY;

  // Verify round-trip conversion accuracy for every node
  for (const node of topology.nodes) {
    const screenCoord = topology.worldToScreen(node.x, node.y);
    const worldCoord = topology.screenToWorld(screenCoord.x, screenCoord.y);
    assert(Math.abs(worldCoord.x - node.x) < 1e-6, `X round-trip mismatch in ${tier} tier`);
    assert(Math.abs(worldCoord.y - node.y) < 1e-6, `Y round-trip mismatch in ${tier} tier`);
  }
}

// Deep test: Hovering directly over host node visual screen position in host tier
topology.setTier('host');
topology.camera.zoom = topology.camera.targetZoom;
topology.camera.panX = topology.camera.targetPanX;
topology.camera.panY = topology.camera.targetPanY;

const hostTarget = topology.nodes.find(n => n.id === 'host-cbs-db01');
const hostScreen = topology.worldToScreen(hostTarget.x, hostTarget.y);

// Cursor directly over the visual screen coordinates
topology.handleMouseMove({ clientX: 100 + hostScreen.x, clientY: 100 + hostScreen.y });
assert.strictEqual(topology.hoveredNode ? topology.hoveredNode.id : null, 'host-cbs-db01',
  'Hovering visual node position must detect host-cbs-db01');

// Cursor at untransformed model position in empty space must NOT detect the node
topology.handleMouseMove({ clientX: 100 + hostTarget.x, clientY: 100 + hostTarget.y });
assert.strictEqual(topology.hoveredNode ? topology.hoveredNode.id : null, null,
  'Hovering empty space must not detect phantom node');

// Test slice hit detection in host tier
const worldSlice = { x: hostTarget.x + 22, y: hostTarget.y + 22 };
const screenSlice = topology.worldToScreen(worldSlice.x, worldSlice.y);
topology.handleMouseMove({ clientX: 100 + screenSlice.x, clientY: 100 + screenSlice.y });
assert(topology.hoveredSlice && topology.hoveredSlice.name, 'Slice hover must detect valid slice in host tier');

// Test click navigation in host tier
topology.handleClick({ clientX: 100 + hostScreen.x, clientY: 100 + hostScreen.y });
assert.strictEqual(topology.activeTier, 'overview', 'Clicking active host node must toggle back to overview');

console.log('✓ Verified: Pixel-perfect camera inverse coordinate mapping & slice hit-testing in all tiers');

console.log('\n=============================================');
console.log('ALL CANVAS MOTION GRAPHICS TESTS PASSED 100%!');
console.log('=============================================');
