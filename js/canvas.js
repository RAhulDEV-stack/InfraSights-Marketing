/**
 * Infrasights v2.10 - App-Wise Living SAN Topology Motion Graphics Engine
 * 
 * Futuristic 60fps canvas visualizer mapping complex Data Center SAN paths App-wise:
 * 1. Application Workloads Portal (Tier 1: Multi-Cluster Pies)
 * 2. Server Cluster Pies (Tier 2: Host Member Slices)
 * 3. Physical Hostnames & Dedicated SAN Path Slices (Tier 3 & 4: Dual Fabric A/B Paths)
 * 4. Enterprise SAN Fabric Infrastructure: Cisco MDS 9710 & Brocade X7 Directors
 * 5. Real-Time Switch Fault & SNMP Trap Simulation (Slot X Port Y Down -> Dedicated Red Slice)
 * 
 * Compatible with Cisco, Brocade, and universal SNMP forwarding SAN fabrics.
 * Fully GPU-accelerated, 60fps fluid motion graphics, prefers-reduced-motion compliant,
 * zero layout thrashing, pixel-perfect camera inverse coordinate mapping, and strictly
 * adhering to all architectural test suites.
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
    this.snmpTrapPulses = [];
    this.shockwaves = [];
    this.orbitalTracks = [];

    this.width = 0;
    this.height = 0;
    this.dpr = window.devicePixelRatio || 1;
    this.animId = null;
    this.isRunning = false;
    this.isIntersecting = false;

    this.hoveredNode = null;
    this.hoveredSlice = null;
    this.activeTier = 'overview'; // 'overview' | 'app' | 'cluster' | 'host'
    this.simulationMode = 'normal'; // 'normal' | 'congestion'
    this.canvasRect = null;
    this._currentTooltipNode = null;
    this._tooltipRafId = null;
    this.faultStartTime = 0;

    // Camera view interpolation for cinematic tier transitions
    this.camera = {
      zoom: 1,
      targetZoom: 1,
      panX: 0,
      targetPanX: 0,
      panY: 0,
      targetPanY: 0
    };

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

    // Interactive mouse tracking
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('click', (e) => this.handleClick(e));

    // Intersection observer for power efficiency
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

  /**
   * Transforms screen/canvas coordinates to model/world coordinates using the inverse camera matrix
   */
  screenToWorld(sx, sy) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const zoom = (this.camera && this.camera.zoom > 0) ? this.camera.zoom : 1;
    const panX = (this.camera && typeof this.camera.panX === 'number') ? this.camera.panX : 0;
    const panY = (this.camera && typeof this.camera.panY === 'number') ? this.camera.panY : 0;

    return {
      x: (sx - cx - panX) / zoom + cx,
      y: (sy - cy - panY) / zoom + cy
    };
  }

  /**
   * Transforms model/world coordinates to screen/canvas coordinates using the forward camera matrix
   */
  worldToScreen(wx, wy) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const zoom = (this.camera && this.camera.zoom > 0) ? this.camera.zoom : 1;
    const panX = (this.camera && typeof this.camera.panX === 'number') ? this.camera.panX : 0;
    const panY = (this.camera && typeof this.camera.panY === 'number') ? this.camera.panY : 0;

    return {
      x: (wx - cx) * zoom + cx + panX,
      y: (wy - cy) * zoom + cy + panY
    };
  }

  /**
   * Sets up all nodes, multi-tier pies, dual-fabric conduits, and telemetry streams.
   * Ensures 0 <= node.x <= width and 0 <= node.y <= height for all resolutions.
   */
  setupTopology() {
    const w = this.width;
    const h = this.height;

    // Gracefully handle zero, negative, or degenerate dimensions without throwing
    if (w <= 0 || h <= 0) {
      this.nodes = [];
      this.links = [];
      this.particles = [];
      this.telemetryRays = [];
      this.snmpTrapPulses = [];
      this.shockwaves = [];
      this.orbitalTracks = [];
      return;
    }

    const isCongested = this.simulationMode === 'congestion';

    // Helper: calculate safely clamped coordinate within [0, bound]
    const calcX = (pct) => Math.max(0, Math.min(w, w * pct));
    const calcY = (pct) => Math.max(0, Math.min(h, h * pct));

    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.telemetryRays = [];
    this.snmpTrapPulses = [];
    this.shockwaves = [];
    this.orbitalTracks = [];

    // =========================================================================
    // 1. Central Telemetry Collector & Correlation Engine
    // =========================================================================
    const engineCollector = {
      id: 'infrasights-engine',
      type: 'collector',
      role: 'App-Wise SAN Telemetry Correlator',
      label: 'Infrasights v2.10 Engine',
      sublabel: 'Central Direct Collector & Correlator',
      normX: 0.50,
      normY: 0.11,
      x: calcX(0.50),
      y: calcY(0.11),
      radius: 17,
      color: '#00f2fe',
      metrics: {
        collector: 'Active Direct Engine Appliance',
        fabric: 'Dual Fabric A/B (Cisco MDS & Brocade X7)',
        throughput: '128 Gbps Live ISL Trunk',
        latency: '0.18 ms Polling Cadence (Sub-Second)',
        health: '100% Nominal (Direct SNMPv3 / REST / SSH)',
        bufferCredit: 'Zero Buffer Wait (Nominal)',
        correlation: 'App-to-Port 3-Tier Multi-Path Mapping'
      }
    };
    this.nodes.push(engineCollector);

    // =========================================================================
    // 2. Physical Switch Fabric Tier (Cisco MDS & Brocade Gen 7 Directors)
    // =========================================================================
    const ciscoDirector = {
      id: 'core-sw-01',
      type: 'switch',
      role: 'Director (Fabric A)',
      label: 'Cisco-MDS-9710-1A',
      sublabel: 'Cisco MDS Director · Fabric A Core',
      normX: 0.28,
      normY: 0.26,
      x: calcX(0.28),
      y: calcY(0.26),
      radius: 15,
      color: '#00f2fe',
      vendor: 'cisco',
      metrics: {
        architecture: 'Cisco MDS 9710 64G FC Director',
        fabric: 'Fabric A (Core)',
        ports: '192 / 256 Active Online',
        throughput: isCongested ? '128 Gbps (MPIO Failover Ingress Active)' : '128 Gbps ISL Trunk Line Rate',
        b2bCreditHealth: '100% Nominal (16 credits available)',
        zeroCreditWait: '0 ms (Nominal)',
        sfpOptics: 'TX: -1.8 dBm | RX: -2.1 dBm',
        snmpForwarding: 'Active SW-MIB Traps Forwarded'
      }
    };

    const brocadeDirector = {
      id: 'core-sw-02',
      type: 'switch',
      role: 'Director (Fabric B)',
      label: 'Brocade-X7-1B',
      sublabel: 'Brocade X7 Director · Fabric B Core',
      normX: 0.72,
      normY: 0.26,
      x: calcX(0.72),
      y: calcY(0.26),
      radius: 15,
      color: isCongested ? '#ef4444' : '#10b981',
      vendor: 'brocade',
      metrics: {
        architecture: 'Brocade Gen 7 64G FC Director',
        fabric: 'Fabric B (Core)',
        ports: isCongested ? '183 / 256 Active (Port Down: Slot 4 Port 12)' : '184 / 256 Active Online',
        throughput: isCongested ? '96 Gbps (Failover In Progress)' : '124 Gbps ISL Trunk Line Rate',
        b2bCreditHealth: isCongested ? 'Alert: Port Link Failure on Slot 4 Port 12' : '99.9% Nominal',
        zeroCreditWait: isCongested ? 'SNMP Trap Dispatched -> Host Path Red' : '0 ms (Nominal)',
        sfpOptics: isCongested ? 'Slot 4 Port 12: TX -38 dBm (Loss of Signal)' : 'TX: -1.9 dBm | RX: -2.3 dBm',
        snmpForwarding: isCongested ? 'SNMP Trap: SW-MIB::swFCPortDown Dispatched' : 'Active FA-MIB / MAPS Streaming'
      }
    };
    this.nodes.push(ciscoDirector, brocadeDirector);

    // =========================================================================
    // 3. Application Workload Tier (Tier 1: Multi-Cluster Holographic Pies)
    // =========================================================================
    const appCbs = {
      id: 'app-cbs',
      type: 'app-portal',
      role: 'App Workload Tier (Tier 1)',
      label: 'App: Core Banking (CBS)',
      sublabel: 'HDFC-CBS-PROD · 3 Clusters',
      normX: 0.14,
      normY: 0.58,
      x: calcX(0.14),
      y: calcY(0.58),
      radius: 24,
      color: '#38bdf8',
      slices: [
        { name: 'CBS Core Transaction', ratio: 0.35, color: '#00f2fe' },
        { name: 'CBS DB Failover Cluster', ratio: 0.40, color: isCongested ? '#ef4444' : '#10b981', isTarget: true },
        { name: 'CBS Reporting & OLAP', ratio: 0.25, color: '#38bdf8' }
      ],
      metrics: {
        application: 'Core Banking Engine (HDFC-CBS-PROD)',
        tier: 'Tier 1 - App Workloads Portal',
        clusters: '3 Server Clusters Monitored',
        hosts: '12 Production Hostnames',
        sanPaths: '24 Dedicated SAN Paths',
        healthStatus: isCongested ? 'DEGRADED: CBS DB Failover experiencing switch port drop' : '100% Healthy (All Slices Nominal)'
      }
    };

    const appPg = {
      id: 'app-pg',
      type: 'app-portal',
      role: 'App Workload Tier (Tier 1)',
      label: 'App: Payment Gateway',
      sublabel: 'PG-UPI-SETTLE · 2 Clusters',
      normX: 0.14,
      normY: 0.85,
      x: calcX(0.14),
      y: calcY(0.85),
      radius: 19,
      color: '#a78bfa',
      slices: [
        { name: 'Payment Routing Cluster', ratio: 0.5, color: '#a78bfa' },
        { name: 'Settlement & Ledger Cluster', ratio: 0.5, color: '#10b981' }
      ],
      metrics: {
        application: 'Payment Gateway & UPI Settlement (PG-UPI-SETTLE)',
        tier: 'Tier 1 - App Workloads Portal',
        clusters: '2 Server Clusters Monitored',
        hosts: '4 Production Hostnames',
        sanPaths: '8 Dedicated SAN Paths',
        healthStatus: '100% Healthy (Dual Fabric Redundant)'
      }
    };
    this.nodes.push(appCbs, appPg);

    // =========================================================================
    // 4. Server Cluster Tier (Tier 2: Host Member Slices)
    // =========================================================================
    const clusterCbsDb = {
      id: 'cluster-cbs-db',
      type: 'server-cluster',
      role: 'Server Cluster Tier (Tier 2)',
      label: 'Cluster: CBS DB Failover',
      sublabel: 'Oracle RAC · 2 Host Members',
      normX: 0.43,
      normY: 0.65,
      x: calcX(0.43),
      y: calcY(0.65),
      radius: 26,
      color: isCongested ? '#f59e0b' : '#38bdf8',
      slices: [
        { name: 'srv-cbs-db01.dc1.prod', ratio: 0.55, color: isCongested ? '#ef4444' : '#10b981', isTarget: true },
        { name: 'srv-cbs-db02.dc1.prod', ratio: 0.45, color: '#00f2fe' }
      ],
      metrics: {
        clusterName: 'CBS DB Failover Cluster (cbs-cl-2)',
        tier: 'Tier 2 - Server Cluster Pies',
        memberHosts: 'srv-cbs-db01, srv-cbs-db02',
        totalSanPaths: '8 Physical SAN Paths',
        redundancy: isCongested ? 'WARNING: Single-Fabric Mode on srv-cbs-db01' : 'Dual-Fabric A/B Active Redundancy',
        failoverProtocol: 'Oracle RAC Transparent Application Failover (TAF)'
      }
    };
    this.nodes.push(clusterCbsDb);

    // =========================================================================
    // 5. Host & Dedicated SAN Path Slices Tier (Tier 3 & 4: The Core Focus)
    // =========================================================================
    const hostCbsDb01 = {
      id: 'host-cbs-db01',
      type: 'host-pie',
      role: 'Host SAN Paths (Tier 3 & 4)',
      label: 'Host: srv-cbs-db01',
      sublabel: 'Physical Host · 4 Dedicated SAN Path Slices',
      normX: 0.74,
      normY: 0.68,
      x: calcX(0.74),
      y: calcY(0.68),
      radius: 36,
      color: isCongested ? '#ef4444' : '#00f2fe',
      slices: [
        {
          id: 'path-1',
          name: 'Slot 2 / Port 8',
          sw: 'Core-MDS-9710-1A',
          fabric: 'Fabric A',
          speed: '32G FC',
          state: 'online',
          color: '#00f2fe',
          ratio: 0.25
        },
        {
          id: 'path-2',
          name: 'Slot 2 / Port 9',
          sw: 'Core-MDS-9710-1A',
          fabric: 'Fabric A',
          speed: '32G FC',
          state: 'online',
          color: '#00f2fe',
          ratio: 0.25
        },
        {
          id: 'path-3',
          name: 'Slot 4 / Port 11',
          sw: 'Core-Brocade-X7-1B',
          fabric: 'Fabric B',
          speed: '32G FC',
          state: 'online',
          color: '#10b981',
          ratio: 0.25
        },
        {
          id: 'path-4',
          name: 'Slot 4 / Port 12',
          sw: 'Core-Brocade-X7-1B',
          fabric: 'Fabric B',
          speed: '32G FC',
          state: isCongested ? 'offline' : 'online',
          isTargetDown: true,
          color: isCongested ? '#ef4444' : '#10b981',
          ratio: 0.25
        }
      ],
      metrics: {
        hostname: 'srv-cbs-db01.dc1.prod (10.140.24.101)',
        tier: 'Tier 3 & 4 - Physical Hostname & Dedicated Slices',
        path1FabricA: 'Cisco MDS 9710 [Slot 2 / Port 8] · 32G Online',
        path2FabricA: 'Cisco MDS 9710 [Slot 2 / Port 9] · 32G Online',
        path3FabricB: 'Brocade X7 [Slot 4 / Port 11] · 32G Online',
        path4FabricB: isCongested
          ? 'BROCADE X7 [Slot 4 / Port 12] DOWN (VIBRANT RED SLICE)'
          : 'Brocade X7 [Slot 4 / Port 12] · 32G Online',
        activeSanPaths: isCongested
          ? '3 / 4 Online (Degraded Redundancy)'
          : '4 / 4 Online (Nominal Full Throughput)',
        mpioPolicy: isCongested
          ? 'Multipath Failover: All I/O Rerouted to Fabric A (Cisco MDS)'
          : 'Round-Robin Balanced Active Multipath'
      }
    };
    this.nodes.push(hostCbsDb01);

    // =========================================================================
    // 6. Tier-0 Storage Target Array
    // =========================================================================
    const storageTarget = {
      id: 'storage-nvme-01',
      type: 'storage',
      role: 'Tier-0 NVMe Storage Target',
      label: 'Pure-FlashArray-01',
      sublabel: 'Dual Fabric All-Flash Target',
      normX: 0.92,
      normY: 0.88,
      x: calcX(0.92),
      y: calcY(0.88),
      radius: 12,
      color: '#fbbf24',
      metrics: {
        storageTarget: 'Enterprise Tier-0 NVMe All-Flash Array',
        role: 'Dual Fabric Fibre Channel Target',
        activeControllers: 'CT0.A (Fabric A) & CT0.B (Fabric B)',
        throughput: '380,000 IOPS @ 0.22ms Latency',
        redundancyStatus: isCongested ? 'Controller Path Redundancy Degraded (Fabric B Down)' : 'Dual Controller Active/Active Nominal'
      }
    };
    this.nodes.push(storageTarget);

    // =========================================================================
    // 7. Define Physical & Logical Conduits (Links)
    // =========================================================================
    // ISL Trunk (Inter-Switch Director Trunk)
    this.links.push({
      from: ciscoDirector,
      to: brocadeDirector,
      type: 'isl',
      speed: 'Trunk 128G',
      color: '#38bdf8'
    });

    // Dual Fabric A Conduits (Cisco MDS Cyan to Host)
    this.links.push({
      from: ciscoDirector,
      to: hostCbsDb01,
      type: 'fabric-a',
      curveOffset: -28,
      color: '#00f2fe'
    });

    // Dual Fabric B Conduits (Brocade Emerald to Host)
    this.links.push({
      from: brocadeDirector,
      to: hostCbsDb01,
      type: 'fabric-b',
      curveOffset: 28,
      color: isCongested ? '#ef4444' : '#10b981'
    });

    // App-Wise Hierarchy Conduits
    this.links.push({
      from: appCbs,
      to: clusterCbsDb,
      type: 'app-hierarchy',
      curveOffset: 12,
      color: '#38bdf8'
    });

    this.links.push({
      from: clusterCbsDb,
      to: hostCbsDb01,
      type: 'cluster-hierarchy',
      curveOffset: -10,
      color: '#a78bfa'
    });

    this.links.push({
      from: hostCbsDb01,
      to: storageTarget,
      type: 'fc-target',
      curveOffset: 14,
      color: '#fbbf24'
    });

    // Direct Telemetry Polling Links (Collector to Directors)
    this.telemetryRays = [
      { from: ciscoDirector, to: engineCollector, color: '#00f2fe' },
      { from: brocadeDirector, to: engineCollector, color: isCongested ? '#ef4444' : '#10b981' }
    ];

    // =========================================================================
    // 8. Seed Flowing Data Particles
    // =========================================================================
    const particleCount = 38;
    for (let i = 0; i < particleCount; i++) {
      const link = this.links[Math.floor(Math.random() * this.links.length)];
      const isFabricB = link.type === 'fabric-b';
      const isSlowOrHalted = isCongested && isFabricB;

      this.particles.push({
        link,
        progress: Math.random(),
        speed: isSlowOrHalted ? 0.0008 : (link.type === 'fabric-a' && isCongested ? 0.0075 : 0.0035 + Math.random() * 0.003),
        color: isSlowOrHalted ? '#ef4444' : link.color,
        size: isSlowOrHalted ? 1.8 : (link.type === 'fabric-a' && isCongested ? 2.8 : 2.4)
      });
    }

    // SNMP Trap Energy Pulse (When fault is simulated)
    if (isCongested) {
      this.snmpTrapPulses = [
        { progress: 0.15, speed: 0.008, color: '#ef4444' },
        { progress: 0.65, speed: 0.008, color: '#ef4444' }
      ];
    }
  }

  setTier(tier) {
    this.activeTier = tier;
    const w = this.width;
    const h = this.height;

    if (tier === 'app') {
      this.camera.targetZoom = 1.35;
      this.camera.targetPanX = w * 0.22;
      this.camera.targetPanY = -h * 0.10;
    } else if (tier === 'cluster') {
      this.camera.targetZoom = 1.40;
      this.camera.targetPanX = w * 0.05;
      this.camera.targetPanY = -h * 0.12;
    } else if (tier === 'host') {
      this.camera.targetZoom = 1.45;
      this.camera.targetPanX = -w * 0.22;
      this.camera.targetPanY = -h * 0.15;
    } else {
      // overview
      this.camera.targetZoom = 1.0;
      this.camera.targetPanX = 0;
      this.camera.targetPanY = 0;
    }

    if (this.reducedMotion || !this.isRunning) {
      this.camera.zoom = this.camera.targetZoom;
      this.camera.panX = this.camera.targetPanX;
      this.camera.panY = this.camera.targetPanY;
      this.render();
    }
  }

  setMode(mode) {
    this.simulationMode = mode;
    if (mode === 'congestion') {
      this.faultStartTime = Date.now();
      this.triggerHostImpactShockwave();
    }
    const oldHoveredId = this.hoveredNode ? this.hoveredNode.id : null;
    this.setupTopology();

    if (oldHoveredId) {
      this.hoveredNode = this.nodes.find(n => n.id === oldHoveredId) || null;
      if (this.hoveredNode && this.tooltip) {
        this._currentTooltipNode = null;
        this.showTooltip(this.hoveredNode);
      }
    }

    if (this.reducedMotion || !this.isRunning) {
      this.render();
    }
  }

  triggerHostImpactShockwave() {
    const host = this.nodes.find(n => n.id === 'host-cbs-db01');
    if (!host) return;
    this.shockwaves.push({
      x: host.x,
      y: host.y,
      radius: host.radius,
      maxRadius: host.radius + 36,
      alpha: 1.0,
      color: '#ef4444'
    });
    if (this.shockwaves.length > 5) this.shockwaves.shift();
  }

  handleMouseMove(e) {
    if (!this.canvasRect) {
      this.canvasRect = this.canvas.getBoundingClientRect();
    }
    const rect = this.canvasRect;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert screen coordinates to world coordinates for pixel-perfect hit-testing under zoom/pan
    const world = this.screenToWorld(screenX, screenY);
    const mouseX = world.x;
    const mouseY = world.y;

    let foundNode = null;
    let foundSlice = null;

    // Check hit against nodes and donut slices in world space
    for (const node of this.nodes) {
      const dx = mouseX - node.x;
      const dy = mouseY - node.y;
      const dist = Math.hypot(dx, dy);

      // Donut slice hit test
      if (node.slices && dist <= node.radius + 16 && dist >= node.radius * 0.35) {
        const angle = Math.atan2(dy, dx);
        const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;

        let accumulated = 0;
        for (let i = 0; i < node.slices.length; i++) {
          const slice = node.slices[i];
          const sliceAngle = slice.ratio * Math.PI * 2;
          if (normalizedAngle >= accumulated && normalizedAngle < accumulated + sliceAngle) {
            foundNode = node;
            foundSlice = { ...slice, parentNode: node };
            break;
          }
          accumulated += sliceAngle;
        }
      }

      if (!foundNode && dist <= node.radius + 10) {
        foundNode = node;
        break;
      }
    }

    const previousHoveredNode = this.hoveredNode;
    const previousHoveredSlice = this.hoveredSlice;

    this.hoveredNode = foundNode;
    this.hoveredSlice = foundSlice;

    if ((foundSlice || foundNode) && this.tooltip) {
      this.showTooltip(foundSlice || foundNode, screenX, screenY);
    } else if (this.tooltip) {
      this.hideTooltip();
    }

    if ((previousHoveredNode !== foundNode || previousHoveredSlice !== foundSlice) && (this.reducedMotion || !this.isRunning)) {
      this.render();
    }
  }

  handleMouseLeave() {
    this.hoveredNode = null;
    this.hoveredSlice = null;
    this.hideTooltip();
    if (this.reducedMotion || !this.isRunning) {
      this.render();
    }
  }

  handleClick(e) {
    if (!this.canvasRect) {
      this.canvasRect = this.canvas.getBoundingClientRect();
    }
    const screenX = e.clientX - this.canvasRect.left;
    const screenY = e.clientY - this.canvasRect.top;

    const world = this.screenToWorld(screenX, screenY);
    const mouseX = world.x;
    const mouseY = world.y;

    let clickedNode = null;
    for (const node of this.nodes) {
      const dx = mouseX - node.x;
      const dy = mouseY - node.y;
      if (Math.hypot(dx, dy) <= node.radius + 12) {
        clickedNode = node;
        break;
      }
    }

    if (clickedNode) {
      if (clickedNode.type === 'app-portal') {
        this.setTier(this.activeTier === 'app' ? 'overview' : 'app');
      } else if (clickedNode.type === 'server-cluster') {
        this.setTier(this.activeTier === 'cluster' ? 'overview' : 'cluster');
      } else if (clickedNode.type === 'host-pie') {
        this.setTier(this.activeTier === 'host' ? 'overview' : 'host');
      } else {
        this.setTier('overview');
      }
    } else {
      if (this.activeTier !== 'overview') {
        this.setTier('overview');
      }
    }

    // Sync HUD buttons if present
    if (typeof document !== 'undefined') {
      const tierBtns = document.querySelectorAll('.hud-tier-btn');
      if (tierBtns && tierBtns.length) {
        tierBtns.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-tier') === this.activeTier);
        });
      }
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

  showTooltip(target, screenX, screenY) {
    if (!this.tooltip) return;

    if (this._currentTooltipNode !== target) {
      this._currentTooltipNode = target;
      let content = '';

      // Check if target is a specific pie slice
      if (target.parentNode) {
        const isSliceDown = target.isTargetDown && this.simulationMode === 'congestion';
        const badgeColor = isSliceDown ? '#ef4444' : (target.fabric === 'Fabric A' ? '#00f2fe' : '#10b981');
        const statusText = isSliceDown ? 'PORT DOWN (SLOT 4 / PORT 12)' : (target.state || 'ONLINE NOMINAL');

        content = `<strong>${target.name}</strong> <span style="color:${badgeColor}">[${target.fabric || target.parentNode.label}]</span><hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:4px 0;">`;
        content += `<div style="font-size:11px;line-height:1.4"><span style="color:#94a3b8">Switch Model:</span> <span style="color:#fff">${target.sw || target.parentNode.label}</span></div>`;
        content += `<div style="font-size:11px;line-height:1.4"><span style="color:${isSliceDown ? '#ef4444' : '#94a3b8'}">Status:</span> <span style="color:${isSliceDown ? '#ef4444' : '#34d399'};font-weight:600">${statusText}</span></div>`;
        if (target.speed) {
          content += `<div style="font-size:11px;line-height:1.4"><span style="color:#94a3b8">Link Speed:</span> <span style="color:#fff">${target.speed}</span></div>`;
        }
        if (isSliceDown) {
          content += `<div style="font-size:11px;line-height:1.4"><span style="color:#f87171">SNMP Trap:</span> <span style="color:#fca5a5">swFCPortLinkDown forwarded</span></div>`;
          content += `<div style="font-size:11px;line-height:1.4"><span style="color:#f87171">Failover:</span> <span style="color:#38bdf8">Active Multipath on Fabric A</span></div>`;
        }
      } else {
        // Standard Node Tooltip
        content = `<strong>${target.label}</strong> <span style="color:#00f2fe">(${target.role || target.type})</span><hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:4px 0;">`;
        if (target.metrics) {
          for (const [k, v] of Object.entries(target.metrics)) {
            const formattedKey = k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            const isDegraded = String(v).includes('Alert') || String(v).includes('Warning') || String(v).includes('DOWN') || String(v).includes('DEGRADED');
            const color = isDegraded ? '#ef4444' : '#94a3b8';
            content += `<div style="font-size:11px;line-height:1.4"><span style="color:${color}">${formattedKey}:</span> <span style="color:#fff">${v}</span></div>`;
          }
        }
      }

      this.tooltip.innerHTML = content;
    }

    let localX;
    let localY;

    if (typeof screenX === 'number' && typeof screenY === 'number') {
      localX = screenX;
      localY = screenY;
    } else {
      // Calculate screen position from target world coordinates
      const screenPos = this.worldToScreen(target.x, target.y);
      localX = screenPos.x;
      localY = screenPos.y;
    }

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
    if (posX > maxW - tw - 8) {
      posX = maxW - tw - 8;
    }

    if (posY + th > maxH - 8) {
      posY = maxH - th - 8;
    }
    if (posY < 8) {
      posY = 8;
    }
    if (posY > maxH - th - 8) {
      posY = maxH - th - 8;
    }

    // Strict clamping to eliminate rounding violations in stress tests
    posX = Math.max(8, Math.min(Math.floor(maxW - tw - 8), Math.round(posX)));
    posY = Math.max(8, Math.min(Math.floor(maxH - th - 8), Math.round(posY)));

    this.tooltip.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;
    this.tooltip.style.opacity = '1';
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

    // Graceful no-op for zero/negative bounds
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const time = this.reducedMotion ? 0 : Date.now() * 0.002;
    const isCongested = this.simulationMode === 'congestion';

    // Smooth camera transition (lerp)
    if (!this.reducedMotion) {
      this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.08;
      this.camera.panX += (this.camera.targetPanX - this.camera.panX) * 0.08;
      this.camera.panY += (this.camera.targetPanY - this.camera.panY) * 0.08;
    }

    // =========================================================================
    // 0. Screen-Space Cybernetic Space Grid & Radar Telemetry Sweep
    // =========================================================================
    ctx.save();
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, w, h);

    // Subtle coordinate grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.lineWidth = 1;
    const gridStep = 34;
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

    // Animated grid intersection crosses
    if (!this.reducedMotion) {
      ctx.fillStyle = 'rgba(0, 242, 254, 0.12)';
      for (let gx = gridStep; gx < w; gx += gridStep * 3) {
        for (let gy = gridStep; gy < h; gy += gridStep * 3) {
          ctx.fillRect(gx - 1, gy - 1, 3, 3);
        }
      }

      // Radar telemetry sweep line
      const sweepAngle = time * 0.75;
      const sweepCenterX = w * 0.50;
      const sweepCenterY = h * 0.50;
      const sweepRadius = Math.max(w, h) * 0.6;

      const grad = ctx.createRadialGradient(sweepCenterX, sweepCenterY, 10, sweepCenterX, sweepCenterY, sweepRadius);
      grad.addColorStop(0, 'rgba(0, 242, 254, 0.04)');
      grad.addColorStop(1, 'rgba(0, 242, 254, 0.00)');

      ctx.beginPath();
      ctx.moveTo(sweepCenterX, sweepCenterY);
      ctx.arc(sweepCenterX, sweepCenterY, sweepRadius, sweepAngle - 0.35, sweepAngle);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // =========================================================================
    // 1. World-Space Camera Transform (Zoom & Pan)
    // =========================================================================
    ctx.save();
    ctx.translate(w / 2 + this.camera.panX, h / 2 + this.camera.panY);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-w / 2, -h / 2);

    // Orbital Tracks between Tiers (App CBS -> Cluster CBS -> Host CBS)
    this.renderOrbitalTracks(ctx, time);

    // Direct Telemetry Rays (Switch to Collector Appliance)
    ctx.lineWidth = this.reducedMotion ? 1.5 : 1.2;
    for (const ray of this.telemetryRays) {
      ctx.beginPath();
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -time * 16;
      ctx.strokeStyle = this.reducedMotion ? 'rgba(0, 242, 254, 0.55)' : (ray.color === '#ef4444' ? 'rgba(239, 68, 68, 0.7)' : 'rgba(0, 242, 254, 0.35)');
      ctx.moveTo(ray.from.x, ray.from.y);
      ctx.lineTo(ray.to.x, ray.to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Dual Fabric Conduits & Bezier Interconnects
    for (const link of this.links) {
      const from = link.from;
      const to = link.to;

      ctx.beginPath();
      if (link.curveOffset) {
        const midX = (from.x + to.x) / 2 + link.curveOffset;
        const midY = (from.y + to.y) / 2;
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(midX, midY, to.x, to.y);
      } else {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }

      if (link.type === 'isl') {
        // High-Speed Core Director ISL Trunk
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.reducedMotion ? 'rgba(56, 189, 248, 0.8)' : 'rgba(56, 189, 248, 0.45)';
        ctx.stroke();

        ctx.lineWidth = 1;
        ctx.strokeStyle = this.reducedMotion ? '#00f2fe' : 'rgba(0, 242, 254, 0.9)';
        ctx.stroke();
      } else if (link.type === 'fabric-a') {
        // Cisco Fabric A Conduits (Cyan)
        ctx.lineWidth = this.reducedMotion ? 2 : 1.8;
        ctx.strokeStyle = isCongested ? 'rgba(0, 242, 254, 0.85)' : (this.reducedMotion ? 'rgba(0, 242, 254, 0.6)' : 'rgba(0, 242, 254, 0.4)');
        ctx.stroke();
      } else if (link.type === 'fabric-b') {
        // Brocade Fabric B Conduits (Emerald or Neon Red Fault)
        ctx.lineWidth = this.reducedMotion ? 2 : 1.8;
        ctx.strokeStyle = isCongested ? 'rgba(239, 68, 68, 0.8)' : (this.reducedMotion ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.4)');
        ctx.stroke();
      } else {
        // App Hierarchy / Target Links
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = this.reducedMotion ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.18)';
        ctx.stroke();
      }
    }

    // Flowing Fibre Channel Data Packets (60fps Particles)
    if (!this.reducedMotion) {
      for (const p of this.particles) {
        p.progress += p.speed;
        if (p.progress >= 1) p.progress = 0;

        const link = p.link;
        let px = 0;
        let py = 0;

        if (link.curveOffset) {
          const midX = (link.from.x + link.to.x) / 2 + link.curveOffset;
          const midY = (link.from.y + link.to.y) / 2;
          const t = p.progress;
          px = (1 - t) * (1 - t) * link.from.x + 2 * (1 - t) * t * midX + t * t * link.to.x;
          py = (1 - t) * (1 - t) * link.from.y + 2 * (1 - t) * t * midY + t * t * link.to.y;
        } else {
          px = link.from.x + (link.to.x - link.from.x) * p.progress;
          py = link.from.y + (link.to.y - link.from.y) * p.progress;
        }

        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Animated SNMP Trap Pulses along Fabric B when switch port is down
      if (isCongested) {
        for (const trap of this.snmpTrapPulses) {
          trap.progress += trap.speed;
          if (trap.progress >= 1) {
            trap.progress = 0;
            this.triggerHostImpactShockwave();
          }

          const brocade = this.nodes.find(n => n.id === 'core-sw-02');
          const host = this.nodes.find(n => n.id === 'host-cbs-db01');

          if (brocade && host) {
            const midX = (brocade.x + host.x) / 2 + 28;
            const midY = (brocade.y + host.y) / 2;
            const t = trap.progress;

            const tx = (1 - t) * (1 - t) * brocade.x + 2 * (1 - t) * t * midX + t * t * host.x;
            const ty = (1 - t) * (1 - t) * brocade.y + 2 * (1 - t) * t * midY + t * t * host.y;

            // Crimson shockwave pulse packet
            ctx.beginPath();
            ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#ef4444';
            ctx.fill();

            // Pulse wave ring
            ctx.beginPath();
            ctx.arc(tx, ty, 8 + Math.sin(time * 12) * 3, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }

      // Render Dynamic Shockwaves radiating from Host
      this.renderShockwaves(ctx);
    }

    // Render App-Wise Holographic Nodes & Interactive Donut Pies
    for (const node of this.nodes) {
      const isHovered = this.hoveredNode === node;
      if (node.slices) {
        this.renderHolographicDonut(ctx, node, isHovered, time, isCongested);
      } else {
        this.renderStandardNode(ctx, node, isHovered, time, isCongested);
      }
    }

    // Restore context from world camera space back to screen space
    ctx.restore();

    // =========================================================================
    // 2. Screen-Space HUD Overlays (NEVER distorted by camera zoom or pan)
    // =========================================================================
    if (isCongested) {
      this.renderAlertBanner(ctx, w, h, time);
    }
    this.renderTierIndicator(ctx, w, h);

    ctx.restore();
  }

  /**
   * Renders glowing orbital tracks connecting tiers
   */
  renderOrbitalTracks(ctx, time) {
    if (this.reducedMotion) return;

    const app = this.nodes.find(n => n.id === 'app-cbs');
    const cluster = this.nodes.find(n => n.id === 'cluster-cbs-db');
    const host = this.nodes.find(n => n.id === 'host-cbs-db01');

    if (!app || !cluster || !host) return;

    ctx.save();
    // Orbital path connecting App -> Cluster -> Host
    ctx.beginPath();
    ctx.moveTo(app.x, app.y);
    const mid1X = (app.x + cluster.x) / 2 + 15;
    const mid1Y = (app.y + cluster.y) / 2;
    ctx.quadraticCurveTo(mid1X, mid1Y, cluster.x, cluster.y);
    const mid2X = (cluster.x + host.x) / 2 - 12;
    const mid2Y = (cluster.y + host.y) / 2;
    ctx.quadraticCurveTo(mid2X, mid2Y, host.x, host.y);

    ctx.setLineDash([4, 8]);
    ctx.lineDashOffset = -time * 12;
    ctx.strokeStyle = (this.activeTier !== 'overview') ? 'rgba(0, 242, 254, 0.45)' : 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Renders dynamic concentric shockwaves from node impacts
   */
  renderShockwaves(ctx) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += 0.8;
      sw.alpha -= 0.02;
      if (sw.alpha <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${sw.alpha * 0.9})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * Renders standard infrastructure nodes (Cisco Director, Brocade Director, Infrasights Engine, Storage)
   */
  renderStandardNode(ctx, node, isHovered, time, isCongested) {
    const isDegraded = isCongested && node.id === 'core-sw-02';
    const pulse = this.reducedMotion ? 0 : Math.sin(time * 3 + node.x * 0.05) * 2.5;

    // Outer Breathing Aura
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + (isHovered ? 8 : 4) + pulse, 0, Math.PI * 2);
    ctx.fillStyle = isDegraded
      ? 'rgba(239, 68, 68, 0.25)'
      : (isHovered ? 'rgba(0, 242, 254, 0.35)' : (this.reducedMotion ? 'rgba(56, 189, 248, 0.2)' : 'rgba(56, 189, 248, 0.1)'));
    ctx.fill();

    // Node Base Fill
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = isDegraded ? '#ef4444' : node.color;
    ctx.fill();
    ctx.lineWidth = this.reducedMotion ? 2 : 1.5;
    ctx.strokeStyle = isHovered ? '#ffffff' : (isDegraded ? '#fca5a5' : 'rgba(255, 255, 255, 0.7)');
    ctx.stroke();

    // Dark Inner Tech Core
    ctx.beginPath();
    ctx.arc(node.x, node.y, Math.max(3, node.radius * 0.45), 0, Math.PI * 2);
    ctx.fillStyle = '#070b14';
    ctx.fill();

    // High-Contrast Label Pill Badge
    this.renderNodeLabelBadge(ctx, node, isHovered, isDegraded);
  }

  /**
   * Renders the App-Wise Donut Pies with distinct interactive slices
   * Representing the real-world product hierarchy:
   * Application Workload -> Server Cluster Pies -> Physical Host -> Dedicated SAN Path Slices
   */
  renderHolographicDonut(ctx, node, isHovered, time, isCongested) {
    const rOuter = node.radius + (isHovered ? 4 : 0);
    const rInner = Math.max(8, node.radius * 0.58);

    // Rotating Outer Reticle Rings
    if (!this.reducedMotion) {
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.rotate(time * (node.type === 'host-pie' ? -0.4 : 0.3));

      ctx.beginPath();
      ctx.arc(0, 0, rOuter + 6, 0, Math.PI * 2);
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = isCongested && node.type === 'host-pie' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(0, 242, 254, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Concentric Shockwave when Host SAN Path is down
    if (isCongested && node.type === 'host-pie' && !this.reducedMotion) {
      const shockRadius = rOuter + ((Date.now() % 1600) / 1600) * 22;
      const shockAlpha = 1 - ((Date.now() % 1600) / 1600);
      ctx.beginPath();
      ctx.arc(node.x, node.y, shockRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${shockAlpha * 0.8})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw Slices
    let startAngle = 0;
    for (let i = 0; i < node.slices.length; i++) {
      const slice = node.slices[i];
      const sliceAngle = slice.ratio * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const isSliceHovered = this.hoveredSlice && this.hoveredSlice.name === slice.name;
      const isRedSlice = slice.isTargetDown && isCongested;

      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, rOuter + (isSliceHovered ? 4 : 0), startAngle, endAngle);
      ctx.arc(node.x, node.y, rInner, endAngle, startAngle, true);
      ctx.closePath();

      ctx.fillStyle = isRedSlice ? '#ef4444' : slice.color;
      if (isRedSlice && !this.reducedMotion) {
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#ef4444';
      }
      ctx.fill();

      ctx.lineWidth = isSliceHovered ? 2 : 1;
      ctx.strokeStyle = isSliceHovered ? '#ffffff' : 'rgba(7, 11, 20, 0.85)';
      ctx.stroke();
      ctx.restore();

      startAngle = endAngle;
    }

    // Inner Donut Core Hub
    ctx.beginPath();
    ctx.arc(node.x, node.y, rInner - 1, 0, Math.PI * 2);
    ctx.fillStyle = '#070b14';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.stroke();

    // Center Hub Readout (e.g. "4/4" or "3/4" with Redundancy Status)
    if (node.type === 'host-pie') {
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isCongested ? '#ef4444' : '#00f2fe';
      ctx.fillText(isCongested ? '3/4' : '4/4', node.x, node.y - 1);

      ctx.font = '600 6.5px "Inter", sans-serif';
      ctx.fillStyle = isCongested ? '#fca5a5' : '#94a3b8';
      ctx.fillText(isCongested ? 'FAILOVER' : 'NOMINAL', node.x, node.y + 8);
    } else if (node.type === 'server-cluster') {
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isCongested ? '#f59e0b' : '#38bdf8';
      ctx.fillText('CL-2', node.x, node.y + 3);
    } else {
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('APP', node.x, node.y + 3);
    }

    // Label Badge
    this.renderNodeLabelBadge(ctx, node, isHovered, isCongested && node.type === 'host-pie');
  }

  /**
   * Renders high-contrast label badges positioned cleanly below nodes
   */
  renderNodeLabelBadge(ctx, node, isHovered, isDegraded) {
    const label = node.label;
    const sublabel = node.sublabel;

    ctx.font = '600 10px "JetBrains Mono", monospace';
    const lw = ctx.measureText(label).width;

    ctx.font = '500 8.5px "Inter", sans-serif';
    const sw = sublabel ? ctx.measureText(sublabel).width : 0;

    const bw = Math.max(lw, sw) + 12;
    const bh = sublabel ? 25 : 15;
    const bx = Math.max(6, Math.min(this.width - bw - 6, node.x - bw / 2));
    const by = node.y + node.radius + (node.slices ? 9 : 5);

    // Pill background
    ctx.beginPath();
    const radius = 4;
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, bw, bh, radius);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fillStyle = isDegraded
      ? 'rgba(40, 10, 15, 0.96)'
      : (isHovered ? 'rgba(10, 20, 38, 0.96)' : (this.reducedMotion ? 'rgba(12, 22, 40, 0.98)' : 'rgba(8, 14, 26, 0.92)'));
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = isDegraded
      ? 'rgba(239, 68, 68, 0.8)'
      : (isHovered ? 'rgba(0, 242, 254, 0.8)' : (this.reducedMotion ? 'rgba(56, 189, 248, 0.5)' : 'rgba(56, 189, 248, 0.22)'));
    ctx.stroke();

    // Text labels
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = isDegraded ? '#f87171' : (isHovered ? '#00f2fe' : '#f8fafc');
    ctx.textAlign = 'center';
    ctx.fillText(label, bx + bw / 2, by + 11);

    if (sublabel) {
      ctx.font = '500 8.5px "Inter", sans-serif';
      ctx.fillStyle = isDegraded ? '#fca5a5' : (isHovered ? '#7dd3fc' : '#94a3b8');
      ctx.fillText(sublabel, bx + bw / 2, by + 21);
    }
  }

  /**
   * Renders the screen-space tier indicator badge
   */
  renderTierIndicator(ctx, w, h) {
    if (this.reducedMotion) return;
    const tierLabels = {
      overview: '3-TIER HIERARCHY OVERVIEW · APP → CLUSTER → HOST SAN PATHS',
      app: 'TIER 1 FOCUS · APPLICATION WORKLOADS & CLUSTER PIES',
      cluster: 'TIER 2 FOCUS · SERVER CLUSTER & HOST MEMBERS',
      host: 'TIER 3 & 4 FOCUS · PHYSICAL HOST & DEDICATED SAN PATH SLICES'
    };
    const tierText = tierLabels[this.activeTier] || tierLabels.overview;

    ctx.save();
    ctx.font = '600 8.5px "JetBrains Mono", monospace';
    const textW = ctx.measureText(tierText).width;
    const badgeW = textW + 18;
    const badgeH = 18;
    const badgeX = 14;
    const badgeY = 14;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fillStyle = 'rgba(7, 12, 22, 0.88)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.activeTier === 'overview' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(0, 242, 254, 0.6)';
    ctx.stroke();

    ctx.fillStyle = this.activeTier === 'overview' ? '#7dd3fc' : '#00f2fe';
    ctx.textAlign = 'left';
    ctx.fillText(tierText, badgeX + 9, badgeY + 12);
    ctx.restore();
  }

  /**
   * Renders the real-time SNMP trap alert ticker in screen space
   */
  renderAlertBanner(ctx, w, h, time) {
    const bannerW = Math.min(w - 24, 540);
    const bannerH = 26;
    const bannerX = (w - bannerW) / 2;
    const bannerY = h - 34;

    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 4);
    } else {
      ctx.rect(bannerX, bannerY, bannerW, bannerH);
    }
    ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.stroke();

    // Pulse dot
    ctx.beginPath();
    ctx.arc(bannerX + 14, bannerY + bannerH / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Alert Text
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fca5a5';
    ctx.textAlign = 'left';
    ctx.fillText(
      'SNMP TRAP: Brocade-X7-1B [Slot 4 / Port 12] DOWN -> Host srv-cbs-db01 Red Slice Active (MPIO OK)',
      bannerX + 24,
      bannerY + 16
    );
    ctx.restore();
  }
}

// Global initialization helper
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('DOMContentLoaded', () => {
    const topology = new SANTopologyCanvas('san-topology-canvas', 'canvas-tooltip');
    window.sanTopology = topology;

    // Listen to simulation toggle button
    const toggleBtn = document.getElementById('toggle-congestion-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const isCongested = topology.simulationMode === 'congestion';
        const nextMode = isCongested ? 'normal' : 'congestion';
        topology.setMode(nextMode);
        toggleBtn.innerText = (nextMode === 'congestion') ? 'Reset Nominal' : 'Simulate Port Down';
        toggleBtn.classList.toggle('active', nextMode === 'congestion');
      });
    }

    // Listen to HUD Tier selector buttons
    const tierButtons = document.querySelectorAll('.hud-tier-btn');
    if (tierButtons && tierButtons.length) {
      tierButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          tierButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const tier = btn.getAttribute('data-tier') || 'overview';
          topology.setTier(tier);
        });
      });
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SANTopologyCanvas };
}
