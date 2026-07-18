#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ===================== CONFIGURATION =====================

const LEVEL_STYLES = [
  { fontSize: 24, height: 64, strokeWidth: 2 }, // Root
  { fontSize: 17, height: 42, strokeWidth: 2 }, // Level 1
  { fontSize: 14, height: 36, strokeWidth: 1 }, // Level 2
  { fontSize: 13, height: 32, strokeWidth: 1 }, // Level 3
  { fontSize: 12, height: 28, strokeWidth: 1 }, // Level 4
  { fontSize: 11, height: 26, strokeWidth: 1 }, // Level 5+
];

const V_GAP = 8;
const H_GAP = 50;
const PADDING_X = 24;
const MIN_NODE_WIDTH = 100;
const MAX_NODE_WIDTH = 360;
const FONT_FAMILY = 1; // 1 = Virgil (hand-drawn)
const LINE_HEIGHT = 1.25;

// Approximate character widths for Virgil font at each size
const CHAR_WIDTHS = { 24: 14, 17: 10.5, 14: 8.5, 13: 8, 12: 7.5, 11: 7 };

const ROOT_STYLE = { bg: '#343a40', stroke: '#212529', text: '#ffffff' };

const BRANCH_PALETTE = [
  { bg: '#a5d8ff', stroke: '#1971c2' },
  { bg: '#b2f2bb', stroke: '#2f9e44' },
  { bg: '#ffec99', stroke: '#e67700' },
  { bg: '#d0bfff', stroke: '#7048e8' },
  { bg: '#ffc9c9', stroke: '#e03131' },
  { bg: '#99e9f2', stroke: '#0c8599' },
  { bg: '#eebefa', stroke: '#ae3ec9' },
  { bg: '#ffd8a8', stroke: '#e8590c' },
  { bg: '#c3fae8', stroke: '#099268' },
  { bg: '#74c0fc', stroke: '#1864ab' },
  { bg: '#d8f5a2', stroke: '#5c940d' },
  { bg: '#fcc2d7', stroke: '#c2255c' },
  { bg: '#e599f7', stroke: '#9c36b5' },
  { bg: '#ffa94d', stroke: '#d9480f' },
  { bg: '#96f2d7', stroke: '#12b886' },
  { bg: '#ffdeeb', stroke: '#d6336c' },
  { bg: '#f783ac', stroke: '#a61e4d' },
  { bg: '#a9e34b', stroke: '#66a80f' },
  { bg: '#63e6be', stroke: '#0ca678' },
  { bg: '#ffa8a8', stroke: '#c92a2a' },
  { bg: '#b197fc', stroke: '#6741d9' },
];

// ===================== PARSER =====================

function parseMindmap(content) {
  const lines = content.split('\n');
  let root = null;
  const stack = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'mindmap') continue;

    const indent = line.length - line.trimStart().length;

    let text = trimmed;
    let isRoot = false;

    if (text.startsWith('root((') && text.endsWith('))')) {
      text = text.slice(6, -2);
      isRoot = true;
    }

    // Strip bold markers
    text = text.replace(/\*\*/g, '');

    const node = { text, children: [], level: 0 };

    if (isRoot) {
      root = node;
      stack.length = 0;
      stack.push({ node, indent });
      continue;
    }

    // Pop stack to find the correct parent (anything with less indentation)
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length > 0) {
      const parent = stack[stack.length - 1].node;
      parent.children.push(node);
      node.level = parent.level + 1;
    }

    stack.push({ node, indent });
  }

  return root;
}

// ===================== LAYOUT =====================

function getStyle(level) {
  return LEVEL_STYLES[Math.min(level, LEVEL_STYLES.length - 1)];
}

function estimateTextWidth(text, fontSize) {
  const cw = CHAR_WIDTHS[fontSize] || 7;
  return text.length * cw + PADDING_X * 2;
}

function assignDimensions(node) {
  const style = getStyle(node.level);
  node.width = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, estimateTextWidth(node.text, style.fontSize)));
  node.height = style.height;
  node.fontSize = style.fontSize;
  node.strokeWidth = style.strokeWidth;
  for (const child of node.children) assignDimensions(child);
}

function calcSubtreeHeight(node) {
  if (node.children.length === 0) {
    node.subtreeHeight = node.height;
    return;
  }
  let total = 0;
  for (const child of node.children) {
    calcSubtreeHeight(child);
    total += child.subtreeHeight;
  }
  total += (node.children.length - 1) * V_GAP;
  node.subtreeHeight = Math.max(node.height, total);
}

function positionNodes(node, x, subtreeTop) {
  if (node.children.length === 0) {
    node.x = x;
    node.y = subtreeTop + (node.subtreeHeight - node.height) / 2;
    return;
  }

  let currentY = subtreeTop;
  for (const child of node.children) {
    positionNodes(child, x + node.width + H_GAP, currentY);
    currentY += child.subtreeHeight + V_GAP;
  }

  const firstChild = node.children[0];
  const lastChild = node.children[node.children.length - 1];
  const centerY = (firstChild.y + firstChild.height / 2 + lastChild.y + lastChild.height / 2) / 2;

  node.x = x;
  node.y = centerY - node.height / 2;
}

// ===================== COLORS =====================

function lightenHex(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

function assignColors(root) {
  root.bgColor = ROOT_STYLE.bg;
  root.strokeColor = ROOT_STYLE.stroke;
  root.textColor = ROOT_STYLE.text;

  root.children.forEach((child, i) => {
    const pal = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
    colorBranch(child, pal, 0);
  });
}

function colorBranch(node, palette, depth) {
  node.bgColor = lightenHex(palette.bg, Math.min(depth * 0.18, 0.55));
  node.strokeColor = palette.stroke;
  node.textColor = '#1e1e1e';
  for (const child of node.children) colorBranch(child, palette, depth + 1);
}

// ===================== EXCALIDRAW ELEMENT FACTORY =====================

let idCounter = 0;

function uid() {
  return `node_${(idCounter++).toString(36).padStart(6, '0')}`;
}

function seed() {
  return Math.floor(Math.random() * 2147483647);
}

function baseElement(id, type, x, y, w, h) {
  return {
    id,
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === 'ellipse' ? { type: 2 } : type === 'arrow' ? { type: 2 } : { type: 3 },
    seed: seed(),
    version: 1,
    versionNonce: seed(),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

// ===================== ELEMENT GENERATION =====================

function generateNodeElements(node, elements) {
  const shapeId = uid();
  const textId = uid();
  node.elementId = shapeId;

  const isRoot = node.level === 0;
  const shapeType = isRoot ? 'ellipse' : 'rectangle';

  // Shape
  const shape = baseElement(shapeId, shapeType, node.x, node.y, node.width, node.height);
  shape.strokeColor = node.strokeColor;
  shape.backgroundColor = node.bgColor;
  shape.strokeWidth = node.strokeWidth;
  shape.boundElements = [{ id: textId, type: 'text' }];

  // Text
  const textH = node.fontSize * LINE_HEIGHT;
  const txt = baseElement(textId, 'text',
    node.x + PADDING_X, node.y + (node.height - textH) / 2,
    node.width - PADDING_X * 2, textH);
  txt.strokeColor = node.textColor || '#1e1e1e';
  txt.backgroundColor = 'transparent';
  txt.fontSize = node.fontSize;
  txt.fontFamily = FONT_FAMILY;
  txt.text = node.text;
  txt.rawText = node.text;
  txt.textAlign = 'center';
  txt.verticalAlign = 'middle';
  txt.containerId = shapeId;
  txt.originalText = node.text;
  txt.autoResize = true;
  txt.lineHeight = LINE_HEIGHT;
  txt.roundness = null;

  elements.push(shape);
  elements.push(txt);

  for (const child of node.children) generateNodeElements(child, elements);
}

function generateArrowElements(node, elements) {
  for (const child of node.children) {
    const arrowId = uid();

    const startX = node.x + node.width;
    const startY = node.y + node.height / 2;
    const endX = child.x;
    const endY = child.y + child.height / 2;
    const dx = endX - startX;
    const dy = endY - startY;

    const arrow = baseElement(arrowId, 'arrow', startX, startY, Math.abs(dx), Math.abs(dy));
    arrow.strokeColor = child.strokeColor;
    arrow.strokeWidth = 1;
    arrow.opacity = 70;
    arrow.backgroundColor = 'transparent';
    arrow.startBinding = { elementId: node.elementId, focus: 0, gap: 5, fixedPoint: null };
    arrow.endBinding = { elementId: child.elementId, focus: 0, gap: 5, fixedPoint: null };
    arrow.startArrowhead = null;
    arrow.endArrowhead = 'arrow';
    arrow.points = [[0, 0], [dx, dy]];

    // Register arrow on connected shapes
    const parentShape = elements.find(e => e.id === node.elementId);
    const childShape = elements.find(e => e.id === child.elementId);
    if (parentShape) parentShape.boundElements.push({ id: arrowId, type: 'arrow' });
    if (childShape) childShape.boundElements.push({ id: arrowId, type: 'arrow' });

    elements.push(arrow);
    generateArrowElements(child, elements);
  }
}

// ===================== STATISTICS =====================

function countNodes(node) {
  let count = 1;
  for (const child of node.children) count += countNodes(child);
  return count;
}

function maxDepth(node) {
  if (node.children.length === 0) return node.level;
  return Math.max(...node.children.map(c => maxDepth(c)));
}

// ===================== MAIN =====================

function convert(inputFile, outputFile) {
  console.log(`\nReading ${inputFile}...`);
  const content = fs.readFileSync(inputFile, 'utf-8');

  // Parse
  const root = parseMindmap(content);
  if (!root) {
    console.error('ERROR: Failed to parse mindmap - no root node found.');
    process.exit(1);
  }

  const totalNodes = countNodes(root);
  const depth = maxDepth(root);
  console.log(`Parsed: "${root.text}" — ${root.children.length} branches, ${totalNodes} total nodes, ${depth} levels deep`);

  // Layout
  assignDimensions(root);
  calcSubtreeHeight(root);
  positionNodes(root, 100, 100);
  assignColors(root);

  // Generate elements
  const elements = [];
  generateNodeElements(root, elements);
  generateArrowElements(root, elements);

  const shapes = elements.filter(e => e.type === 'rectangle' || e.type === 'ellipse').length;
  const texts = elements.filter(e => e.type === 'text').length;
  const arrows = elements.filter(e => e.type === 'arrow').length;
  console.log(`Generated ${elements.length} elements (${shapes} shapes, ${texts} texts, ${arrows} arrows)`);

  // Compute canvas bounds for sensible initial viewport
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (el.type === 'arrow') continue;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  const canvasW = maxX - minX;
  const canvasH = maxY - minY;
  console.log(`Canvas size: ${Math.round(canvasW)} x ${Math.round(canvasH)} px`);

  // Build Excalidraw file
  const excalidrawFile = {
    type: 'excalidraw',
    version: 2,
    source: 'mmd-to-excalidraw-converter',
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: '#ffffff',
      scrollX: -minX + 50,
      scrollY: -minY + 50,
      zoom: { value: 0.4 },
    },
    files: {},
  };

  fs.writeFileSync(outputFile, JSON.stringify(excalidrawFile, null, 2));
  console.log(`Written to ${outputFile}\n`);
}

// Run
const inputFile = process.argv[2] || path.join(__dirname, 'easy-kanban-mindmap.mmd');
const outputFile = process.argv[3] || inputFile.replace(/\.mmd$/, '.excalidraw');
convert(inputFile, outputFile);
