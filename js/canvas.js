/**
 * Infrasights v2.10 - Living SAN Topology Canvas Engine
 * Simulates real-time Fibre Channel fabric topology, frame flow, 
 * direct telemetry collection rays, and buffer-to-buffer credit monitoring.
 * Fully vendor-neutral, 60fps animated, interactive HUD, and prefers-reduced-motion compliant.
 */

class SANTopologyCanvas {
  constructor(canvasId, tooltipId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = document.getElementById(tooltipId);

    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.telemetryRays = [];

    this.width = 0;
    this.height = 0;
    this.dpr = window.devicePixelRatio || 1;
    this.animId = null;
    this.isRunning = false;
    this.isIntersecting = false;
    this.hoveredNode = null;
    this.simulationMode = 'normal'; // 'normal' | 'congestion'
    this.canvasRect = null;
    this._currentTooltipNode = null;
    this._tooltipRafId = null;

    // Cached tooltip dimensions to eliminate forced layout thrashing
    this.TOOLTIP_WIDTH = 250;
    this.TOOLTIP_HEIGHT = 160;

    // Reduced motion accessibility support
    this.motionMediaQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = this.motionMediaQuery ? this.motionMediaQuery.matches : false;

    if (this.motionMediaQuery) {
      const motionHandler = (e) => {
        this.reducedMotion = e.matches;
        if (this.reducedMotion) {
          this.stop();
          this.render();
        } else if (this.isIntersecting) {
          this.start();
        }
      };
      if (this.motionMediaQuery.addEventListener) {
        this.motionMediaQuery.addEventListener('change', motionHandler);
      } else if (this.motionMediaQuery.addListener) {
        this.motionMediaQuery.addListener(motionHandler);
      }
    }

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => {
      this.canvasRect = null;
      this.resize();
    });
    window.addEventListener('scroll', () => {
      this.canvasRect = null;
    }, { passive: true });

    // Track mouse interaction
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

    // Observe visibility for power efficiency
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          this.isIntersecting = entry.isIntersecting;
          if (entry.isIntersecting) {
            if (this.reducedMotion) {
              this.render();
            } else {
              this.start();
            }
          } else {
            this.stop();
          }
        });
      }, { threshold: 0.1 });

      observer.observe(this.canvas);
    } else {
      this.isIntersecting = true;
      if (this.reducedMotion) {
        this.render();
      } else {
        this.start();
      }
    }

    this.setupTopology();
  }

  resize() {
    this.canvasRect = this.canvas.getBoundingClientRect();
    this.width = this.canvasRect.width;
    this.height = this.canvasRect.height;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    this.setupTopology();
    if (this.reducedMotion || !this.isRunning) {
      this.render();
    }
  }

  setupTopology() {
    const w = this.width;
    const h = this.height;
    if (w === 0 || h === 0) return;

    this.nodes = [];
    this.links = [];
    this.particles = [];

    // Central Collector Node (Infrasights Direct Collector Appliance)
    const collector = {
      id: 'infrasights-engine',
      type: 'collector',
      label: 'Infrasights v2.10',
      sublabel: 'Central Direct Collector',
      x: w * 0.5,
      y: h * 0.14,
      radius: 18,
      color: '#00f2fe',
      metrics: {
        status: 'Active Direct Telemetry',
        cadence: '1-sec Sub-Second Interval',
        protocol: 'Native REST / Secure SNMPv3 / SSH',
        encryption: 'TLS 1.3 / SSH',
        switchesMonitored: '6 / 6 Live Dual Fabric'
      }
    };
    this.nodes.push(collector);

    // Core Directors (Dual Fabric A / B)
    const core1 = {
      id: 'core-sw-01',
      type: 'switch',
      role: 'Director (Fabric A)',
      label: 'Core-Director-01A',
      sublabel: 'Gen 7 Core Director',
      x: w * 0.35,
      y: h * 0.39,
      radius: 13,
      color: '#38bdf8',
      metrics: {
        architecture: 'Gen 7 Fibre Channel Director',
        fabric: 'Fabric A (Core)',
        ports: '192 / 256 Active',
        throughput: '128 Gbps ISL Trunk',
        b2bCreditHealth: '100% Nominal (16 credits available)',
        zeroCreditWait: '0 ms (Nominal)',
        sfpOptics: 'TX: -1.8 dBm | RX: -2.1 dBm'
      }
    };

    const core2 = {
      id: 'core-sw-02',
      type: 'switch',
      role: 'Director (Fabric B)',
      label: 'Core-Director-01B',
      sublabel: 'Enterprise Modular Director',
      x: w * 0.65,
      y: h * 0.39,
      radius: 13,
      color: '#2dd4bf',
      metrics: {
        architecture: 'Modular Fibre Channel Director',
        fabric: 'Fabric B (Core)',
        ports: '184 / 256 Active',
        throughput: '124 Gbps ISL Trunk',
        b2bCreditHealth: '99.9% Nominal (16 credits available)',
        zeroCreditWait: '0 ms (Nominal)',
        sfpOptics: 'TX: -1.9 dBm | RX: -2.3 dBm'
      }
    };
    this.nodes.push(core1, core2);

    // Edge Switches (Fabric A)
    const edge1A = {
      id: 'edge-sw-1a',
      type: 'switch',
      role: 'Edge Switch (Fabric A)',
      label: 'Edge-1A',
      sublabel: 'High-Density 32G FC',
      x: w * 0.18,
      y: h * 0.63,
      radius: 10,
      color: '#38bdf8',
      metrics: {
        architecture: 'High-Density 32G FC Switch',
        fabric: 'Fabric A (Edge)',
        activeLogins: '48 FLOGI / 112 PLOGI',
        b2bCreditHealth: '100% Available',
        zeroCreditWait: '0 ms (Nominal)',
        crcErrors: '0 / min',
        sfpOptics: 'TX: -2.0 dBm | RX: -2.2 dBm'
      }
    };

    const isCongested = this.simulationMode === 'congestion';
    const edge2A = {
      id: 'edge-sw-2a',
      type: 'switch',
      role: 'Edge Switch (Fabric A)',
      label: 'Edge-2A',
      sublabel: 'High-Density 32G FC',
      x: w * 0.39,
      y: h * 0.63,
      radius: 10,
      color: isCongested ? '#fbbf24' : '#38bdf8',
      metrics: {
        architecture: 'High-Density 32G FC Switch',
        fabric: 'Fabric A (Edge)',
        activeLogins: '42 FLOGI',
        b2bCreditHealth: isCongested ? '82.4% (Slow Drain Alert)' : '99.8% Nominal',
        zeroCreditWait: isCongested ? '18.4 ms (Starvation Alert)' : '0 ms (Nominal)',
        crcErrors: isCongested ? '42 / min' : '0 / min',
        sfpOptics: isCongested ? 'TX: -2.1 dBm | RX: -6.4 dBm (Low Power Warning)' : 'TX: -1.9 dBm | RX: -2.1 dBm'
      }
    };

    // Edge Switches (Fabric B)
    const edge1B = {
      id: 'edge-sw-1b',
      type: 'switch',
      role: 'Edge Switch (Fabric B)',
      label: 'Edge-1B',
      sublabel: 'Fixed-Port 32G FC',
      x: w * 0.61,
      y: h * 0.63,
      radius: 10,
      color: '#2dd4bf',
      metrics: {
        architecture: 'Fixed-Port 32G FC Switch',
        fabric: 'Fabric B (Edge)',
        activeLogins: '46 FLOGI',
        b2bCreditHealth: '100% Nominal',
        zeroCreditWait: '0 ms (Nominal)',
        crcErrors: '0 / min',
        sfpOptics: 'TX: -2.0 dBm | RX: -2.1 dBm'
      }
    };

    const edge2B = {
      id: 'edge-sw-2b',
      type: 'switch',
      role: 'Edge Switch (Fabric B)',
      label: 'Edge-2B',
      sublabel: 'Fixed-Port 32G FC',
      x: w * 0.82,
      y: h * 0.63,
      radius: 10,
      color: '#2dd4bf',
      metrics: {
        architecture: 'Fixed-Port 32G FC Switch',
        fabric: 'Fabric B (Edge)',
        activeLogins: '38 FLOGI',
        b2bCreditHealth: '99.9% Nominal',
        zeroCreditWait: '0 ms (Nominal)',
        crcErrors: '0 / min',
        sfpOptics: 'TX: -1.9 dBm | RX: -2.2 dBm'
      }
    };
    this.nodes.push(edge1A, edge2A, edge1B, edge2B);

    // Endpoints: Storage Arrays & Hosts
    const storage1 = {
      id: 'storage-nvme-01',
      type: 'storage',
      label: 'NVMe Array 01',
      sublabel: 'Dual Fabric Target',
      x: w * 0.18,
      y: h * 0.85,
      radius: 8,
      color: '#fbbf24',
      metrics: {
        type: 'All-Flash Tier-0 Storage',
        connectedTo: 'Edge-1A (Fabric A) & Edge-1B (Fabric B)',
        iops: '480,000 IOPS',
        latency: '0.24 ms'
      }
    };

    const storage2 = {
      id: 'storage-nvme-02',
      type: 'storage',
      label: 'NVMe Array 02',
      sublabel: 'Dual Fabric Target',
      x: w * 0.82,
      y: h * 0.85,
      radius: 8,
      color: '#fbbf24',
      metrics: {
        type: 'Enterprise SAN Storage',
        connectedTo: 'Edge-2A (Fabric A) & Edge-2B (Fabric B)',
        iops: '340,000 IOPS',
        latency: '0.31 ms'
      }
    };

    const hostCluster = {
      id: 'host-esxi-cluster',
      type: 'host',
      label: 'Compute Cluster (HBA)',
      sublabel: 'Dual Fabric Initiator',
      x: w * 0.50,
      y: h * 0.85,
      radius: 8,
      color: '#a78bfa',
      metrics: {
        type: 'Enterprise Compute Cluster',
        dualFabric: 'Multipath I/O Active (Fabric A + B)',
        hbaPorts: '64 Initiators'
      }
    };
    this.nodes.push(storage1, storage2, hostCluster);

    // Define Links
    // 1. ISL Inter-Switch Links (Trunks)
    this.links.push({ from: core1, to: core2, type: 'isl', speed: 'Trunk 128G' });
    this.links.push({ from: core1, to: edge1A, type: 'isl', speed: '32G' });
    this.links.push({ from: core1, to: edge2A, type: 'isl', speed: '32G' });
    this.links.push({ from: core2, to: edge1B, type: 'isl', speed: '32G' });
    this.links.push({ from: core2, to: edge2B, type: 'isl', speed: '32G' });

    // 2. Storage & Host Links (Fabric A and Fabric B redundant connectivity)
    this.links.push({ from: edge1A, to: storage1, type: 'edge' });
    this.links.push({ from: edge1B, to: storage1, type: 'edge' });
    this.links.push({ from: edge2A, to: hostCluster, type: 'edge' });
    this.links.push({ from: edge1B, to: hostCluster, type: 'edge' });
    this.links.push({ from: edge2B, to: storage2, type: 'edge' });

    // 3. Direct Telemetry Polling Links (Infrasights Collector to all 6 Switches)
    this.telemetryRays = [core1, core2, edge1A, edge2A, edge1B, edge2B].map(sw => ({
      from: sw,
      to: collector
    }));

    // Seed Data Frame Particles
    for (let i = 0; i < 28; i++) {
      const link = this.links[Math.floor(Math.random() * this.links.length)];
      const isSlowDrain = isCongested && (link.from === edge2A || link.to === edge2A);
      this.particles.push({
        link,
        progress: Math.random(),
        speed: isSlowDrain ? 0.001 : (0.003 + Math.random() * 0.005),
        color: isSlowDrain ? '#fbbf24' : (link.type === 'isl' ? '#00f2fe' : '#34d399'),
        size: 2.2
      });
    }
  }

  handleMouseMove(e) {
    if (!this.canvasRect) {
      this.canvasRect = this.canvas.getBoundingClientRect();
    }
    const mouseX = e.clientX - this.canvasRect.left;
    const mouseY = e.clientY - this.canvasRect.top;

    let found = null;
    for (const node of this.nodes) {
      const dx = mouseX - node.x;
      const dy = mouseY - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 6) {
        found = node;
        break;
      }
    }

    const previousHovered = this.hoveredNode;
    this.hoveredNode = found;

    if (found && this.tooltip) {
      this.showTooltip(found, mouseX, mouseY);
    } else if (this.tooltip) {
      this.hideTooltip();
    }

    if (previousHovered !== found && (this.reducedMotion || !this.isRunning)) {
      this.render();
    }
  }

  handleMouseLeave() {
    this.hoveredNode = null;
    this.hideTooltip();
    if (this.reducedMotion || !this.isRunning) {
      this.render();
    }
  }

  hideTooltip() {
    this._currentTooltipNode = null;
    if (this._tooltipRafId) {
      cancelAnimationFrame(this._tooltipRafId);
      this._tooltipRafId = null;
    }
    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
      this.tooltip.style.transform = 'translate3d(-9999px, -9999px, 0)';
    }
  }

  showTooltip(node, mouseX, mouseY) {
    if (!this.tooltip) return;

    // Cache node reference to eliminate unnecessary innerHTML writes during continuous mouse movement
    if (this._currentTooltipNode !== node) {
      this._currentTooltipNode = node;
      let content = `<strong>${node.label}</strong> <span style="color:#00f2fe">(${node.role || node.type})</span><hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:4px 0;">`;
      if (node.metrics) {
        for (const [k, v] of Object.entries(node.metrics)) {
          const formattedKey = k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          const isDegraded = String(v).includes('Alert') || String(v).includes('Warning') || String(v).includes('Starvation');
          const color = isDegraded ? '#fbbf24' : '#94a3b8';
          content += `<div style="font-size:11px;line-height:1.4"><span style="color:${color}">${formattedKey}:</span> <span style="color:#fff">${v}</span></div>`;
        }
      }
      this.tooltip.innerHTML = content;
    }

    // Local coordinates relative to .canvas-viewport (position: relative container)
    // Supports both local mouse coordinates (mouseX, mouseY) and node center fallback
    let localX = (typeof mouseX === 'number') ? mouseX : node.x;
    let localY = (typeof mouseY === 'number') ? mouseY : node.y;

    // Safety fallback: if viewport client coordinates were passed, convert to local container coordinates
    if (this.canvasRect && localX > this.width && localX >= this.canvasRect.left) {
      localX = localX - this.canvasRect.left;
      localY = localY - this.canvasRect.top;
    }

    // Cached dimensions eliminate synchronous layout reflow (zero getBoundingClientRect() during mousemove)
    const tw = this.TOOLTIP_WIDTH || 250;
    const th = this.TOOLTIP_HEIGHT || 160;
    const maxW = this.width > 0 ? this.width : 800;
    const maxH = this.height > 0 ? this.height : 400;

    let posX = localX + 14;
    let posY = localY - 10;

    // Viewport bounds clamping strictly inside canvas container bounds
    if (posX + tw > maxW - 8) {
      posX = localX - tw - 14;
    }
    if (posX < 8) {
      posX = 8;
    }

    if (posY + th > maxH - 8) {
      posY = maxH - th - 8;
    }
    if (posY < 8) {
      posY = 8;
    }

    // GPU-accelerated translate3d positioning (bypasses layout & paint, composite layer only)
    const targetTransform = `translate3d(${Math.round(posX)}px, ${Math.round(posY)}px, 0)`;

    // Apply transform and opacity directly on compositor layer
    this.tooltip.style.transform = targetTransform;
    this.tooltip.style.opacity = '1';
  }

  setMode(mode) {
    this.simulationMode = mode;
    const oldHoveredId = this.hoveredNode ? this.hoveredNode.id : null;
    this.setupTopology();
    if (oldHoveredId) {
      this.hoveredNode = this.nodes.find(n => n.id === oldHoveredId) || null;
      if (this.hoveredNode && this.tooltip) {
        this._currentTooltipNode = null; // Invalidate cache to render updated congestion metrics
        this.showTooltip(this.hoveredNode);
      }
    }
    if (this.reducedMotion || !this.isRunning) {
      this.render();
    }
  }

  start() {
    if (this.reducedMotion) {
      this.render();
      return;
    }
    if (this.isRunning) return;
    this.isRunning = true;
    const loop = () => {
      this.render();
      if (this.isRunning && !this.reducedMotion) {
        this.animId = requestAnimationFrame(loop);
      }
    };
    loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 0. Subtle NOC Observation Grid Background
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.035)';
    ctx.lineWidth = 1;
    const gridStep = 32;
    for (let gx = 0; gx < w; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // 1. Draw Direct Infrasights Telemetry Rays (Dashed upward streams)
    const time = this.reducedMotion ? 0 : Date.now() * 0.002;
    ctx.lineWidth = this.reducedMotion ? 1.5 : 1.2;
    for (const ray of this.telemetryRays) {
      ctx.beginPath();
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -time * 14;
      ctx.strokeStyle = this.reducedMotion ? 'rgba(0, 242, 254, 0.55)' : 'rgba(0, 242, 254, 0.3)';
      ctx.moveTo(ray.from.x, ray.from.y);
      ctx.lineTo(ray.to.x, ray.to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]); // Reset dash

    // 2. Draw Physical Fibre Channel Links (Dual Fabric Interconnects)
    for (const link of this.links) {
      ctx.beginPath();
      ctx.moveTo(link.from.x, link.from.y);
      ctx.lineTo(link.to.x, link.to.y);

      if (link.type === 'isl') {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = this.reducedMotion ? 'rgba(56, 189, 248, 0.75)' : 'rgba(56, 189, 248, 0.45)';
        ctx.stroke();

        // Inner glowing core
        ctx.lineWidth = 1;
        ctx.strokeStyle = this.reducedMotion ? 'rgba(0, 242, 254, 0.95)' : 'rgba(0, 242, 254, 0.85)';
        ctx.stroke();
      } else {
        ctx.lineWidth = this.reducedMotion ? 1.5 : 1.2;
        ctx.strokeStyle = this.reducedMotion ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.16)';
        ctx.stroke();
      }
    }

    // 3. Animate Traveling Data Particles (disabled in prefers-reduced-motion)
    if (!this.reducedMotion) {
      for (const p of this.particles) {
        p.progress += p.speed;
        if (p.progress >= 1) p.progress = 0;

        const lx = p.link.from.x + (p.link.to.x - p.link.from.x) * p.progress;
        const ly = p.link.from.y + (p.link.to.y - p.link.from.y) * p.progress;

        ctx.beginPath();
        ctx.arc(lx, ly, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // 4. Draw Nodes
    for (const node of this.nodes) {
      const isHovered = this.hoveredNode === node;

      // Soft breathing aura
      const pulse = this.reducedMotion ? 0 : Math.sin(Date.now() * 0.003 + node.x * 0.05) * 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + (isHovered ? 8 : 4) + pulse, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'rgba(0, 242, 254, 0.35)' : (this.reducedMotion ? 'rgba(56, 189, 248, 0.22)' : 'rgba(56, 189, 248, 0.10)');
      ctx.fill();

      // Node base
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.lineWidth = this.reducedMotion ? 2 : 1.5;
      ctx.strokeStyle = isHovered ? '#ffffff' : (this.reducedMotion ? '#ffffff' : 'rgba(255, 255, 255, 0.6)');
      ctx.stroke();

      // Inner dark core
      ctx.beginPath();
      ctx.arc(node.x, node.y, Math.max(3, node.radius * 0.45), 0, Math.PI * 2);
      ctx.fillStyle = '#070b14';
      ctx.fill();

      // High-contrast text badge pill
      const label = node.label;
      const sublabel = node.sublabel;

      ctx.font = '600 10px "JetBrains Mono", monospace';
      const lw = ctx.measureText(label).width;

      ctx.font = '500 8.5px "Inter", sans-serif';
      const sw = sublabel ? ctx.measureText(sublabel).width : 0;

      const bw = Math.max(lw, sw) + 12;
      const bh = sublabel ? 25 : 15;
      const bx = Math.max(6, Math.min(w - bw - 6, node.x - bw / 2));
      const by = node.y + node.radius + 5;

      // Pill background
      ctx.beginPath();
      const radius = 4;
      if (ctx.roundRect) {
        ctx.roundRect(bx, by, bw, bh, radius);
      } else {
        ctx.rect(bx, by, bw, bh);
      }
      ctx.fillStyle = isHovered ? 'rgba(10, 20, 38, 0.96)' : (this.reducedMotion ? 'rgba(12, 22, 40, 0.98)' : 'rgba(8, 14, 26, 0.90)');
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = isHovered ? 'rgba(0, 242, 254, 0.8)' : (this.reducedMotion ? 'rgba(56, 189, 248, 0.5)' : 'rgba(56, 189, 248, 0.22)');
      ctx.stroke();

      // Node label
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = isHovered ? '#00f2fe' : '#f8fafc';
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + bw / 2, by + 11);

      if (sublabel) {
        ctx.font = '500 8.5px "Inter", sans-serif';
        ctx.fillStyle = isHovered ? '#7dd3fc' : '#94a3b8';
        ctx.fillText(sublabel, bx + bw / 2, by + 21);
      }
    }
  }
}

// Global initialization helper
document.addEventListener('DOMContentLoaded', () => {
  const topology = new SANTopologyCanvas('san-topology-canvas', 'canvas-tooltip');
  window.sanTopology = topology;

  // Listen to simulation toggle button
  const toggleBtn = document.getElementById('toggle-congestion-btn');
  if (toggleBtn) {
    let congested = false;
    toggleBtn.addEventListener('click', () => {
      congested = !congested;
      topology.setMode(congested ? 'congestion' : 'normal');
      toggleBtn.innerText = congested ? 'Normal Mode' : 'Simulate Buffer Wait';
      toggleBtn.classList.toggle('active', congested);
    });
  }
});
