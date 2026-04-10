/* ============================================================
   create.js - Interactive flowchart builder
   ============================================================ */

(function () {
  'use strict';

  // ── DOM refs ───────────────────────────────────────────────
  const canvasWrap   = document.getElementById('canvasWrap');
  const world        = document.getElementById('world');
  const connSvg      = document.getElementById('connSvg');
  const zoomLevelEl  = document.getElementById('zoomLevel');
  const canvasHint   = document.getElementById('canvasHint');
  const connLabelPopup = document.getElementById('connLabelPopup');
  const connLabelInput = document.getElementById('connLabelInput');
  const connLabelSave  = document.getElementById('connLabelSave');

  // ── State ─────────────────────────────────────────────────
  let panX = 0, panY = 0, zoom = 1;
  let isPanning = false, panStartX = 0, panStartY = 0;

  let nodes = [];       // { id, type, x, y, label }
  let conns = [];       // { id, fromId, toId, label }
  let nextId = 1;

  let selectedNodeId = null;
  let selectedConnId = null;

  let draggingNodeId = null;
  let dragOffsetX = 0, dragOffsetY = 0;

  // Connection drawing state
  let drawingConn = false;
  let drawFromNodeId = null;
  let drawFromPort = null;   // 'top'|'right'|'bottom'|'left'
  let draftPath = null;

  // Undo/redo
  let history = [];
  let historyIndex = -1;

  // ── Node type metadata ────────────────────────────────────
  const NODE_META = {
    user:     { label: 'User',          icon: iconUser,     cls: 'node--user'     },
    agent:    { label: 'Agent',         icon: iconAgent,    cls: 'node--agent'    },
    mcp:      { label: 'MCP Server',    icon: iconMcp,      cls: 'node--mcp'      },
    tool:     { label: 'Tool',          icon: iconTool,     cls: 'node--tool'     },
    response: { label: 'Response',      icon: iconResponse, cls: 'node--response' },
    skill:    { label: 'Skill',         icon: iconSkill,    cls: 'node--skill'    },
    registry: { label: 'Skill Registry',icon: iconRegistry, cls: 'node--registry' },
    custom:   { label: 'Custom',        icon: iconCustom,   cls: 'node--custom'   },
  };

  // ── SVG icon generators ───────────────────────────────────
  function svgIcon(pathData) {
    return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">${pathData}</svg>`;
  }
  function iconUser()     { return svgIcon('<circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'); }
  function iconAgent()    { return svgIcon('<rect x="5" y="7" width="10" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="11" r="1" fill="currentColor"/><circle cx="12" cy="11" r="1" fill="currentColor"/><path d="M8 16v2M12 16v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 7V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="4" r="1" fill="currentColor"/>'); }
  function iconMcp()      { return svgIcon('<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M7 10h6M10 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'); }
  function iconTool()     { return svgIcon('<path d="M14.5 3.5l-3 3 2 2 3-3a3 3 0 01-4 4l-5 5a1.5 1.5 0 01-2-2l5-5a3 3 0 014-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'); }
  function iconResponse() { return svgIcon('<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'); }
  function iconSkill()    { return svgIcon('<path d="M10 3v4M10 13v4M3 10h4M13 10h4M5.6 5.6l2.8 2.8M11.6 11.6l2.8 2.8M14.4 5.6l-2.8 2.8M8.4 11.6l-2.8 2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'); }
  function iconRegistry() { return svgIcon('<rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>'); }
  function iconCustom()   { return svgIcon('<rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>'); }

  // ── Coordinate helpers ────────────────────────────────────
  function toWorld(clientX, clientY) {
    const rect = canvasWrap.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top  - panY) / zoom,
    };
  }

  function nodeCenter(node) {
    const el = document.getElementById('node-' + node.id);
    if (!el) return { x: node.x, y: node.y };
    return {
      x: node.x + el.offsetWidth  / 2,
      y: node.y + el.offsetHeight / 2,
    };
  }

  function portPos(node, port) {
    const el = document.getElementById('node-' + node.id);
    const w = el ? el.offsetWidth  : 110;
    const h = el ? el.offsetHeight : 70;
    switch (port) {
      case 'top':    return { x: node.x + w / 2, y: node.y };
      case 'right':  return { x: node.x + w,     y: node.y + h / 2 };
      case 'bottom': return { x: node.x + w / 2, y: node.y + h };
      case 'left':   return { x: node.x,          y: node.y + h / 2 };
    }
  }

  // ── Apply transform ───────────────────────────────────────
  function applyTransform() {
    const t = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    world.style.transform   = t;
    connSvg.style.transform = t;
    zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
  }

  // ── Hint visibility ───────────────────────────────────────
  function updateHint() {
    if (nodes.length > 0) {
      canvasHint.classList.add('hidden');
    } else {
      canvasHint.classList.remove('hidden');
    }
  }

  // ── Render all connections ────────────────────────────────
  function renderConns() {
    // Remove existing paths/labels (keep defs + draft)
    const toRemove = connSvg.querySelectorAll('.conn-path, .conn-label-group');
    toRemove.forEach(el => el.remove());

    conns.forEach(conn => {
      const fromNode = nodes.find(n => n.id === conn.fromId);
      const toNode   = nodes.find(n => n.id === conn.toId);
      if (!fromNode || !toNode) return;

      const from = portPos(fromNode, conn.fromPort || 'bottom');
      const to   = portPos(toNode,   conn.toPort   || 'top');

      if (!from || !to) return;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const cx1 = from.x + dx * 0.0;
      const cy1 = from.y + dy * 0.5;
      const cx2 = to.x   - dx * 0.0;
      const cy2 = to.y   - dy * 0.5;

      const d = `M ${from.x} ${from.y} C ${from.x} ${from.y + Math.abs(dy) * 0.5}, ${to.x} ${to.y - Math.abs(dy) * 0.5}, ${to.x} ${to.y}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'conn-path' + (conn.id === selectedConnId ? ' selected' : ''));
      path.dataset.connId = conn.id;
      connSvg.appendChild(path);

      // Invisible wider hit-target
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '14');
      hit.style.cursor = 'pointer';
      hit.dataset.connId = conn.id;
      hit.addEventListener('click', onConnClick);
      connSvg.appendChild(hit);

      // Label
      if (conn.label) {
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'conn-label-group');

        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const tw = conn.label.length * 6.5 + 10;
        bg.setAttribute('x', midX - tw / 2);
        bg.setAttribute('y', midY - 9);
        bg.setAttribute('width', tw);
        bg.setAttribute('height', 16);
        bg.setAttribute('rx', '4');
        bg.setAttribute('fill', 'rgba(7, 16, 31, 0.85)');
        g.appendChild(bg);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', midX);
        text.setAttribute('y', midY + 3);
        text.setAttribute('class', 'conn-label-text');
        text.textContent = conn.label;
        g.appendChild(text);

        connSvg.appendChild(g);
      }
    });
  }

  // ── Create node DOM element ───────────────────────────────
  function createNodeEl(node) {
    const meta = NODE_META[node.type] || NODE_META.custom;
    const el = document.createElement('div');
    el.id = 'node-' + node.id;
    el.className = 'node ' + meta.cls;
    el.style.left = node.x + 'px';
    el.style.top  = node.y + 'px';

    el.innerHTML = `
      <div class="node-icon">${meta.icon()}</div>
      <div class="node-label" contenteditable="false" spellcheck="false">${node.label}</div>
      <div class="node-ports">
        <div class="port port--top"    data-port="top"></div>
        <div class="port port--right"  data-port="right"></div>
        <div class="port port--bottom" data-port="bottom"></div>
        <div class="port port--left"   data-port="left"></div>
      </div>
    `;

    // Double-click to edit label
    const label = el.querySelector('.node-label');
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      label.contentEditable = 'true';
      label.focus();
      // Place cursor at end
      const range = document.createRange();
      range.selectNodeContents(label);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    label.addEventListener('blur', () => {
      label.contentEditable = 'false';
      const newLabel = label.textContent.trim() || meta.label;
      label.textContent = newLabel;
      const n = nodes.find(n => n.id === node.id);
      if (n) n.label = newLabel;
      saveHistory();
      persistState();
    });

    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); label.blur(); }
      e.stopPropagation(); // don't fire delete etc. while editing
    });

    // Drag node
    el.addEventListener('mousedown', onNodeMouseDown);

    // Port drag
    el.querySelectorAll('.port').forEach(port => {
      port.addEventListener('mousedown', onPortMouseDown);
    });

    world.appendChild(el);
  }

  // ── Add node ──────────────────────────────────────────────
  function addNode(type, x, y, label) {
    const meta = NODE_META[type] || NODE_META.custom;
    const node = {
      id:    nextId++,
      type,
      x,
      y,
      label: label || meta.label,
    };
    nodes.push(node);
    createNodeEl(node);
    updateHint();
    return node;
  }

  // ── Remove node ───────────────────────────────────────────
  function removeNode(id) {
    const el = document.getElementById('node-' + id);
    if (el) el.remove();
    nodes = nodes.filter(n => n.id !== id);
    conns = conns.filter(c => c.fromId !== id && c.toId !== id);
    if (selectedNodeId === id) selectedNodeId = null;
    renderConns();
    updateHint();
  }

  // ── Add connection ────────────────────────────────────────
  function addConn(fromId, fromPort, toId, toPort, label) {
    // Prevent duplicate
    if (conns.find(c => c.fromId === fromId && c.toId === toId)) return;
    // Prevent self-loop
    if (fromId === toId) return;
    const conn = {
      id:       nextId++,
      fromId,
      fromPort: fromPort || 'bottom',
      toId,
      toPort:   toPort || 'top',
      label:    label || '',
    };
    conns.push(conn);
    renderConns();
    return conn;
  }

  // ── Remove connection ─────────────────────────────────────
  function removeConn(id) {
    conns = conns.filter(c => c.id !== id);
    if (selectedConnId === id) selectedConnId = null;
    renderConns();
  }

  // ── Select node ───────────────────────────────────────────
  function selectNode(id) {
    // Deselect previous
    if (selectedNodeId) {
      const prev = document.getElementById('node-' + selectedNodeId);
      if (prev) prev.classList.remove('selected');
    }
    selectedNodeId = id;
    selectedConnId = null;
    renderConns();
    if (id) {
      const el = document.getElementById('node-' + id);
      if (el) el.classList.add('selected');
    }
  }

  // ── Node mousedown (drag) ─────────────────────────────────
  function onNodeMouseDown(e) {
    if (e.target.classList.contains('port')) return;
    if (e.target.contentEditable === 'true') return;
    e.stopPropagation();

    const nodeEl = e.currentTarget;
    const id = parseInt(nodeEl.id.replace('node-', ''));
    selectNode(id);

    draggingNodeId = id;
    const node = nodes.find(n => n.id === id);
    const wpos = toWorld(e.clientX, e.clientY);
    dragOffsetX = wpos.x - node.x;
    dragOffsetY = wpos.y - node.y;

    nodeEl.style.cursor = 'grabbing';
  }

  // ── Port mousedown (start connection) ─────────────────────
  function onPortMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();

    const port = e.currentTarget;
    const nodeEl = port.closest('.node');
    const id = parseInt(nodeEl.id.replace('node-', ''));

    drawingConn  = true;
    drawFromNodeId = id;
    drawFromPort = port.dataset.port;

    // Create draft path
    draftPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    draftPath.setAttribute('class', 'draft-path');
    connSvg.appendChild(draftPath);
  }

  // ── Connection click ──────────────────────────────────────
  function onConnClick(e) {
    e.stopPropagation();
    const connId = parseInt(e.currentTarget.dataset.connId);
    selectedConnId = connId;
    selectedNodeId = null;
    // Deselect nodes
    document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
    renderConns();

    // Show label popup
    const conn = conns.find(c => c.id === connId);
    if (conn) {
      connLabelInput.value = conn.label || '';
      connLabelPopup.style.display = 'flex';
      connLabelPopup.style.left = (e.clientX - 100) + 'px';
      connLabelPopup.style.top  = (e.clientY + 12) + 'px';
      connLabelInput.focus();
    }
  }

  // ── Save label ────────────────────────────────────────────
  function saveConnLabel() {
    if (selectedConnId == null) return;
    const conn = conns.find(c => c.id === selectedConnId);
    if (conn) {
      conn.label = connLabelInput.value.trim();
      renderConns();
      saveHistory();
      persistState();
    }
    connLabelPopup.style.display = 'none';
  }

  connLabelSave.addEventListener('click', saveConnLabel);
  connLabelInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveConnLabel();
    if (e.key === 'Escape') connLabelPopup.style.display = 'none';
  });

  // ── Canvas mousemove ──────────────────────────────────────
  document.addEventListener('mousemove', (e) => {
    // Pan
    if (isPanning) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      applyTransform();
      return;
    }

    // Drag node
    if (draggingNodeId !== null) {
      const node = nodes.find(n => n.id === draggingNodeId);
      const wpos = toWorld(e.clientX, e.clientY);
      node.x = wpos.x - dragOffsetX;
      node.y = wpos.y - dragOffsetY;
      const el = document.getElementById('node-' + draggingNodeId);
      if (el) {
        el.style.left = node.x + 'px';
        el.style.top  = node.y + 'px';
      }
      renderConns();
      return;
    }

    // Draw connection draft
    if (drawingConn && draftPath) {
      const fromNode = nodes.find(n => n.id === drawFromNodeId);
      const from = portPos(fromNode, drawFromPort);
      const to   = toWorld(e.clientX, e.clientY);
      const dy   = to.y - from.y;
      const d    = `M ${from.x} ${from.y} C ${from.x} ${from.y + Math.abs(dy) * 0.5}, ${to.x} ${to.y - Math.abs(dy) * 0.5}, ${to.x} ${to.y}`;
      draftPath.setAttribute('d', d);
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (draggingNodeId !== null) {
      const el = document.getElementById('node-' + draggingNodeId);
      if (el) el.style.cursor = 'grab';
      draggingNodeId = null;
      saveHistory();
      persistState();
    }

    if (isPanning) {
      isPanning = false;
      canvasWrap.style.cursor = 'default';
    }

    if (drawingConn) {
      drawingConn = false;
      if (draftPath) { draftPath.remove(); draftPath = null; }

      // Did we land on a node?
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target) {
        const targetNode = target.closest('.node');
        if (targetNode) {
          const toId   = parseInt(targetNode.id.replace('node-', ''));
          const toPort = target.classList.contains('port') ? target.dataset.port : 'top';
          if (toId !== drawFromNodeId) {
            addConn(drawFromNodeId, drawFromPort, toId, toPort);
            saveHistory();
            persistState();
          }
        }
      }
      drawFromNodeId = null;
      drawFromPort   = null;
    }
  });

  // ── Canvas mousedown (pan or deselect) ───────────────────
  canvasWrap.addEventListener('mousedown', (e) => {
    if (e.target === canvasWrap || e.target === world || e.target.classList.contains('conn-svg')) {
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      canvasWrap.style.cursor = 'grabbing';
      selectNode(null);
      selectedConnId = null;
      renderConns();
      connLabelPopup.style.display = 'none';
    }
  });

  // ── Zoom on scroll ────────────────────────────────────────
  canvasWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvasWrap.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * delta, 0.2), 3);

    // Zoom toward mouse position
    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    zoom = newZoom;

    applyTransform();
  }, { passive: false });

  // ── Zoom buttons ──────────────────────────────────────────
  document.getElementById('zoomIn').addEventListener('click', () => {
    zoom = Math.min(zoom * 1.2, 3);
    applyTransform();
  });
  document.getElementById('zoomOut').addEventListener('click', () => {
    zoom = Math.max(zoom * 0.8, 0.2);
    applyTransform();
  });
  document.getElementById('zoomReset').addEventListener('click', () => {
    zoom = 1; panX = 0; panY = 0;
    applyTransform();
  });

  // ── Keyboard shortcuts ────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.contentEditable === 'true') return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedNodeId !== null) {
        removeNode(selectedNodeId);
        saveHistory();
        persistState();
      } else if (selectedConnId !== null) {
        removeConn(selectedConnId);
        saveHistory();
        persistState();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      redo();
    }
  });

  // ── Drag from sidebar ─────────────────────────────────────
  document.querySelectorAll('.palette-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('nodeType', item.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  canvasWrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  canvasWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('nodeType');
    if (!type) return;
    const wpos = toWorld(e.clientX, e.clientY);
    addNode(type, wpos.x - 60, wpos.y - 40);
    saveHistory();
    persistState();
  });

  // ── Template: Single Agent ────────────────────────────────
  document.getElementById('templateSingleAgent').addEventListener('click', () => {
    clearCanvas(false); // clear without pushing history yet

    const cx = 400, cy = 100;

    const user   = addNode('user',     cx - 55,  cy,         'User');
    const agent  = addNode('agent',    cx - 55,  cy + 130,   'Agent');
    const tool1  = addNode('tool',     cx - 220, cy + 270,   'Tool 1');
    const tool2  = addNode('tool',     cx - 55,  cy + 270,   'Tool 2');
    const tool3  = addNode('tool',     cx + 110, cy + 270,   'Tool 3');
    const resp   = addNode('response', cx - 55,  cy + 410,   'Response');

    addConn(user.id,  'bottom', agent.id, 'top');
    addConn(agent.id, 'bottom', tool1.id, 'top');
    addConn(agent.id, 'bottom', tool2.id, 'top');
    addConn(agent.id, 'bottom', tool3.id, 'top');
    addConn(agent.id, 'bottom', resp.id,  'top');

    // Center view
    zoom = 1; panX = 60; panY = 40;
    applyTransform();

    saveHistory();
    persistState();
  });

  // ── Clear canvas ──────────────────────────────────────────
  function clearCanvas(pushHistory = true) {
    world.innerHTML    = '';
    const paths = connSvg.querySelectorAll('.conn-path, .conn-label-group, .draft-path');
    paths.forEach(p => p.remove());
    nodes = [];
    conns = [];
    selectedNodeId = null;
    selectedConnId = null;
    updateHint();
    if (pushHistory) { saveHistory(); persistState(); }
  }

  document.getElementById('btnClear').addEventListener('click', () => {
    if (nodes.length === 0) return;
    clearCanvas(true);
  });

  // ── History ───────────────────────────────────────────────
  function getSnapshot() {
    return JSON.stringify({ nodes: nodes.map(n => ({...n})), conns: conns.map(c => ({...c})), nextId });
  }

  function saveHistory() {
    // Truncate forward history
    history = history.slice(0, historyIndex + 1);
    history.push(getSnapshot());
    if (history.length > 60) history.shift();
    historyIndex = history.length - 1;
  }

  function restoreSnapshot(snap) {
    const data = JSON.parse(snap);
    world.innerHTML = '';
    const paths = connSvg.querySelectorAll('.conn-path, .conn-label-group, .draft-path');
    paths.forEach(p => p.remove());
    nodes   = data.nodes;
    conns   = data.conns;
    nextId  = data.nextId;
    nodes.forEach(n => createNodeEl(n));
    renderConns();
    updateHint();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restoreSnapshot(history[historyIndex]);
    persistState();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    restoreSnapshot(history[historyIndex]);
    persistState();
  }

  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);

  // ── Persistence (localStorage) ────────────────────────────
  const LS_KEY = 'agenticCreate_v1';

  function persistState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        nodes, conns, nextId, panX, panY, zoom,
      }));
    } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      nodes  = data.nodes  || [];
      conns  = data.conns  || [];
      nextId = data.nextId || 1;
      panX   = data.panX   || 0;
      panY   = data.panY   || 0;
      zoom   = data.zoom   || 1;
      nodes.forEach(n => createNodeEl(n));
      renderConns();
      applyTransform();
      updateHint();
      return nodes.length > 0;
    } catch (_) { return false; }
  }

  // ── Init ──────────────────────────────────────────────────
  applyTransform();
  const hasState = loadState();
  if (!hasState) {
    saveHistory(); // push initial empty state
  } else {
    saveHistory();
  }

})();
