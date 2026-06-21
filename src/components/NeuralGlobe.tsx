/**
 * NeuralGlobe — Interactive 3D sphere-surface knowledge graph.
 *
 * Features:
 * - InstancedMesh nodes with click-to-select (raycaster instanceId)
 * - Billboard text labels on nodes (nearest N visible)
 * - Selected node detail panel (HTML overlay)
 * - Edge highlighting for selected node connections
 * - Edge type labels on selected edges
 *
 * Code-split via React.lazy() so three.js never enters the main bundle.
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuralGraph, NeuralNode, Edge, Cluster } from '../lib/neural/types';
import { X, ArrowRight, GitBranch, CirclesFour } from '@phosphor-icons/react';
import PanelResizer from './PanelResizer';
import '../styles/neural-globe.css';

/* ── colour palette ─────────────────────────────────────── */
const CLUSTER_COLORS = [
  '#4ecafc', '#f97316', '#a855f7', '#22d3ee', '#ec4899',
  '#84cc16', '#f43f5e', '#06b6d4', '#eab308', '#6366f1',
  '#14b8a6', '#e879f9', '#fb923c', '#38bdf8', '#34d399',
];
const DEFAULT_NODE_COLOR = '#607d8b';
const ACCENT = '#3b9eff';        // brand key colour — used for edges & glow
const ACCENT_BRIGHT = '#7cc4ff'; // lighter accent for travelling signal pulses
const LLM_EDGE_COLOR = '#f59e0b'; // amber — LLM-inferred (Edge.source === 'llm')

// Edge type labels mirror NeuralGraphView.EDGE_TYPE_LABEL — keep in sync.
const GLOBE_EDGE_LABEL: Record<string, { ko: string; en: string }> = {
  relates: { ko: '관련', en: 'Relates' },
  supersedes: { ko: '대체', en: 'Supersedes' },
  supports: { ko: '근거', en: 'Supports' },
};

type GlobeTheme = 'light' | 'dark';

/** Theme-dependent visual tokens so the globe reads in both modes. */
function themeTokens(theme: GlobeTheme) {
  return theme === 'light'
    ? {
        labelColor: '#0f172a',
        labelDim: 'rgba(30,41,59,0.55)',
        labelOutline: '#ffffff',
        edge: '#2b8ae6',
        edgeOpacity: 0.32,
        edgeDimOpacity: 0.12,
        shell: '#dbe7f5',
        shellOpacity: 0.18,
        wire: '#9db8d8',
        ambient: 0.75,
      }
    : {
        labelColor: '#ffffff',
        labelDim: 'rgba(255,255,255,0.6)',
        labelOutline: '#000000',
        edge: ACCENT,
        edgeOpacity: 0.45,
        edgeDimOpacity: 0.12,
        shell: '#0d1117',
        shellOpacity: 0.12,
        wire: '#1a2744',
        ambient: 0.35,
      };
}

function clusterColor(clusterIndex: number): string {
  return CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length];
}

/* ── fibonacci sphere distribution ──────────────────────── */
function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  if (count === 0) return points;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1 || 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    points.push(new THREE.Vector3(
      Math.cos(theta) * r * radius,
      y * radius,
      Math.sin(theta) * r * radius,
    ));
  }
  return points;
}

/* ── arc between two points on sphere surface ────────────── */
function sphereArc(a: THREE.Vector3, b: THREE.Vector3, segments = 24): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const aDir = a.clone().normalize();
  const bDir = b.clone().normalize();
  const angle = aDir.angleTo(bDir);
  if (angle < 0.001) return [a.clone(), b.clone()];
  const axis = new THREE.Vector3().crossVectors(aDir, bDir).normalize();
  const radius = a.length();
  const lift = 1 + 0.06 * (angle / Math.PI);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dir = aDir.clone().applyAxisAngle(axis, angle * t);
    pts.push(dir.multiplyScalar(radius * lift));
  }
  return pts;
}

/* ── midpoint of an arc ──────────────────────────────────── */
function arcMidpoint(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const aDir = a.clone().normalize();
  const bDir = b.clone().normalize();
  const angle = aDir.angleTo(bDir);
  if (angle < 0.001) return a.clone().add(b).multiplyScalar(0.5);
  const axis = new THREE.Vector3().crossVectors(aDir, bDir).normalize();
  const radius = a.length();
  const lift = 1 + 0.06 * (angle / Math.PI);
  const mid = aDir.clone().applyAxisAngle(axis, angle * 0.5);
  return mid.multiplyScalar(radius * lift);
}

interface NeuralGlobeProps {
  graph: NeuralGraph;
  onClose: () => void;
  language: string;
  nodeTextById?: Record<string, string>;
  /** Async body lookup for wiki nodes whose content lives in a markdown file rather than
   *  the synchronous `nodeTextById` map (which only holds Studio-extracted blocks).
   *  Same signature the 2D NeuralGraphView uses, so a single callback serves both. */
  getBlockText?: (roomPath: string, blockTs: string) => Promise<string | null>;
  /** Render inline inside a container instead of a fixed full-screen overlay. */
  embedded?: boolean;
  /** Light / dark visual theme. Defaults to dark. */
  theme?: GlobeTheme;
  /** When true, show a decorative idle globe (no real data). Clicking calls onIdleClick. */
  idle?: boolean;
  onIdleClick?: () => void;
}

interface SelectedInfo {
  node: NeuralNode;
  index: number;
  connectedEdges: Edge[];
  connectedNodes: NeuralNode[];
}

const MAX_EDGES_RENDERED = 200;
const RADIUS = 1.5;
const MAX_LABELS = 30; // max labels to render (nearest to camera)
const NODE_BASE_SIZE = 0.06;

/* ── Instanced Nodes with click/hover ───────────────────── */
function InteractiveNodes({ graph, positions, clusterMap, selectedIdx, onSelect, onHover, onUnhover }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  clusterMap: Map<string, number>;
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onHover: (idx: number) => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = graph.nodes.length;
  const animProgress = useRef(0);
  const selectedIdxRef = useRef(selectedIdx);
  useEffect(() => { selectedIdxRef.current = selectedIdx; }, [selectedIdx]);

  // Set instance transforms and colors
  useEffect(() => {
    if (!meshRef.current || count === 0) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      const node = graph.nodes[i];
      const cIdx = node.clusters[0] ? (clusterMap.get(node.clusters[0]) ?? -1) : -1;
      color.set(cIdx >= 0 ? clusterColor(cIdx) : DEFAULT_NODE_COLOR);
      meshRef.current.setColorAt(i, color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    animProgress.current = 0;
  }, [count, positions, graph.nodes, clusterMap]);

  // Animate + highlight selected
  useFrame((_, delta) => {
    if (!meshRef.current || count === 0) return;
    animProgress.current = Math.min(1, animProgress.current + delta * 0.8);
    const t = animProgress.current;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const stagger = Math.min(1, Math.max(0, (t * count - i * 0.3) / (count * 0.7)));
      const isSelected = selectedIdxRef.current === i;
      const baseScale = easeOutBack(Math.min(stagger, 1)) * NODE_BASE_SIZE;
      const scale = isSelected ? baseScale * 2.2 : baseScale;
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) onSelect(e.instanceId);
  }, [onSelect]);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) onHover(e.instanceId);
  }, [onHover]);

  const handlePointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onUnhover();
  }, [onUnhover]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial
        emissive="#ffffff"
        emissiveIntensity={0.5}
        roughness={0.3}
        metalness={0.2}
        vertexColors
      />
    </instancedMesh>
  );
}

/* ── Node Labels (Billboard Text, nearest N to camera) ──── */
function NodeLabels({ graph, positions, clusterMap, selectedIdx, connectedNodeIds, tokens }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  clusterMap: Map<string, number>;
  selectedIdx: number | null;
  connectedNodeIds: Set<string>;
  tokens: ReturnType<typeof themeTokens>;
}) {
  const { camera } = useThree();
  const [visibleIndices, setVisibleIndices] = useState<number[]>([]);

  // Update which labels are visible every 500ms
  useFrame(() => {
    const now = performance.now();
    if ((now % 500) > 16) return; // throttle

    const camPos = camera.position;
    const scored = graph.nodes.map((n, i) => ({
      i,
      dist: camPos.distanceTo(positions[i]),
      isSelected: selectedIdx === i,
      isConnected: connectedNodeIds.has(n.id),
    }));

    // Always show selected + connected, then nearest
    const always = scored.filter(s => s.isSelected || s.isConnected).map(s => s.i);
    const rest = scored
      .filter(s => !s.isSelected && !s.isConnected)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, MAX_LABELS - always.length)
      .map(s => s.i);

    setVisibleIndices([...always, ...rest]);
  });

  return (
    <>
      {visibleIndices.map(i => {
        const node = graph.nodes[i];
        if (!node || !positions[i]) return null;
        const cIdx = node.clusters[0] ? (clusterMap.get(node.clusters[0]) ?? -1) : -1;
        const color = cIdx >= 0 ? clusterColor(cIdx) : DEFAULT_NODE_COLOR;
        const isSelected = selectedIdx === i;
        const isConnected = connectedNodeIds.has(node.id);
        const labelPos = positions[i].clone().normalize().multiplyScalar(RADIUS + 0.12);

        return (
          <Billboard key={node.id} position={labelPos}>
            <Text
              fontSize={isSelected ? 0.07 : 0.045}
              color={isSelected ? tokens.labelColor : isConnected ? color : tokens.labelDim}
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.004}
              outlineColor={tokens.labelOutline}
              maxWidth={0.6}
            >
              {node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label}
            </Text>
          </Billboard>
        );
      })}
    </>
  );
}

/* ── Edge Lines with highlight (brand-blue base) ────────── */
function EdgeLines({ graph, positions, selectedNodeId, tokens }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  selectedNodeId: string | null;
  tokens: ReturnType<typeof themeTokens>;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const { normalGeo, llmGeo, highlightGeo } = useMemo(() => {
    const nodeIdx = new Map<string, number>();
    graph.nodes.forEach((n, i) => nodeIdx.set(n.id, i));

    const edgesToRender = graph.edges.slice(0, MAX_EDGES_RENDERED);
    const normVerts: number[] = [];
    const llmVerts: number[] = []; // LLM-inferred — drawn as dashes (every other segment)
    const hiVerts: number[] = [];

    for (const edge of edgesToRender) {
      const fi = nodeIdx.get(edge.from);
      const ti = nodeIdx.get(edge.to);
      if (fi === undefined || ti === undefined) continue;
      if (!positions[fi] || !positions[ti]) continue;

      const isHighlighted = selectedNodeId && (edge.from === selectedNodeId || edge.to === selectedNodeId);
      const isLlm = edge.source === 'llm';
      const arcPts = sphereArc(positions[fi], positions[ti], 16);
      // Selection wins over provenance: highlighted edges go to the bright bucket regardless.
      const targetVerts = isHighlighted ? hiVerts : isLlm ? llmVerts : normVerts;

      // LLM (non-highlighted) → dashed: push only every other segment pair so gaps appear.
      if (targetVerts === llmVerts) {
        for (let i = 0; i < arcPts.length - 1; i += 2) {
          targetVerts.push(arcPts[i].x, arcPts[i].y, arcPts[i].z);
          targetVerts.push(arcPts[i + 1].x, arcPts[i + 1].y, arcPts[i + 1].z);
        }
      } else {
        for (let i = 0; i < arcPts.length - 1; i++) {
          targetVerts.push(arcPts[i].x, arcPts[i].y, arcPts[i].z);
          targetVerts.push(arcPts[i + 1].x, arcPts[i + 1].y, arcPts[i + 1].z);
        }
      }
    }

    const makeGeo = (v: number[]) => {
      const geo = new THREE.BufferGeometry();
      if (v.length) geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      return geo;
    };

    return { normalGeo: makeGeo(normVerts), llmGeo: makeGeo(llmVerts), highlightGeo: makeGeo(hiVerts) };
  }, [graph.edges, graph.nodes, positions, selectedNodeId]);

  return (
    <>
      <lineSegments geometry={normalGeo} visible={visible}>
        <lineBasicMaterial color={tokens.edge} transparent opacity={selectedNodeId ? tokens.edgeDimOpacity : tokens.edgeOpacity} />
      </lineSegments>
      <lineSegments geometry={llmGeo} visible={visible}>
        <lineBasicMaterial color={LLM_EDGE_COLOR} transparent opacity={selectedNodeId ? tokens.edgeDimOpacity * 1.5 : tokens.edgeOpacity * 0.9} />
      </lineSegments>
      <lineSegments geometry={highlightGeo} visible={visible}>
        <lineBasicMaterial color={ACCENT_BRIGHT} transparent opacity={0.85} />
      </lineSegments>
    </>
  );
}

/* ── Electric pulses — bright dots travelling along edge arcs ── */
function EdgePulses({ graph, positions, selectedNodeId, count = 14 }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  selectedNodeId: string | null;
  count?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Precompute candidate arcs (idle pulses cover the whole graph; when a node
  // is selected we bias toward its edges so the "signal" looks intentional).
  const arcs = useMemo(() => {
    const nodeIdx = new Map<string, number>();
    graph.nodes.forEach((n, i) => nodeIdx.set(n.id, i));
    const out: { pts: THREE.Vector3[]; touchesSelected: boolean }[] = [];
    for (const edge of graph.edges.slice(0, MAX_EDGES_RENDERED)) {
      const fi = nodeIdx.get(edge.from);
      const ti = nodeIdx.get(edge.to);
      if (fi === undefined || ti === undefined || !positions[fi] || !positions[ti]) continue;
      out.push({
        pts: sphereArc(positions[fi], positions[ti], 24),
        touchesSelected: !!selectedNodeId && (edge.from === selectedNodeId || edge.to === selectedNodeId),
      });
    }
    return out;
  }, [graph.edges, graph.nodes, positions, selectedNodeId]);

  // Per-pulse runtime state
  const pulses = useRef<{ arc: number; t: number; speed: number }[]>([]);
  const pool = Math.min(count, Math.max(0, arcs.length));

  const pickArc = useCallback(() => {
    if (arcs.length === 0) return 0;
    if (selectedNodeId) {
      const sel = arcs.map((a, i) => (a.touchesSelected ? i : -1)).filter((i) => i >= 0);
      if (sel.length && Math.random() < 0.8) return sel[(Math.random() * sel.length) | 0];
    }
    return (Math.random() * arcs.length) | 0;
  }, [arcs, selectedNodeId]);

  useEffect(() => {
    pulses.current = Array.from({ length: pool }, () => ({
      arc: pickArc(),
      t: Math.random(),
      speed: 0.4 + Math.random() * 0.5,
    }));
  }, [pool, pickArc]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || pool === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < pool; i++) {
      const p = pulses.current[i];
      if (!p) continue;
      p.t += delta * p.speed;
      if (p.t >= 1) { p.t = 0; p.arc = pickArc(); p.speed = 0.4 + Math.random() * 0.5; }
      const arc = arcs[p.arc];
      if (!arc || arc.pts.length < 2) { dummy.scale.setScalar(0.0001); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); continue; }
      const seg = p.t * (arc.pts.length - 1);
      const i0 = Math.floor(seg);
      const frac = seg - i0;
      const a = arc.pts[i0];
      const b = arc.pts[Math.min(i0 + 1, arc.pts.length - 1)];
      dummy.position.lerpVectors(a, b, frac);
      // fade in/out at the ends so pulses appear to be born and die smoothly
      const fade = Math.sin(p.t * Math.PI);
      dummy.scale.setScalar(0.022 * fade + 0.004);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (pool === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, pool]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={ACCENT_BRIGHT} transparent opacity={0.95} toneMapped={false} />
    </instancedMesh>
  );
}

/* ── Selected node glow ring (billboarded halo) ─────────── */
function SelectedGlow({ position }: { position: THREE.Vector3 | null }) {
  if (!position) return null;
  return (
    <Billboard position={position}>
      <mesh>
        <ringGeometry args={[0.11, 0.15, 32]} />
        <meshBasicMaterial color={ACCENT_BRIGHT} transparent opacity={0.7} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.1, 32]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.18} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/* ── Edge Type Labels (only for selected node's edges) ──── */
function EdgeTypeLabels({ graph, positions, selectedNodeId }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  selectedNodeId: string | null;
}) {
  if (!selectedNodeId) return null;

  const nodeIdx = new Map<string, number>();
  graph.nodes.forEach((n, i) => nodeIdx.set(n.id, i));

  const selectedEdges = graph.edges
    .filter(e => e.from === selectedNodeId || e.to === selectedNodeId)
    .filter(e => e.type)
    .slice(0, 15);

  return (
    <>
      {selectedEdges.map((edge, i) => {
        const fi = nodeIdx.get(edge.from);
        const ti = nodeIdx.get(edge.to);
        if (fi === undefined || ti === undefined) return null;
        if (!positions[fi] || !positions[ti]) return null;

        const mid = arcMidpoint(positions[fi], positions[ti]);
        const labelPos = mid.clone().normalize().multiplyScalar(mid.length() + 0.06);

        return (
          <Text
            key={`edge-${i}`}
            position={labelPos}
            fontSize={0.035}
            color="rgba(255,255,255,0.5)"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.003}
            outlineColor="#000000"
          >
            {edge.type || ''}
          </Text>
        );
      })}
    </>
  );
}

/* ── Wireframe Grid ─────────────────────────────────────── */
function GlobeWireframe({ tokens }: { tokens: ReturnType<typeof themeTokens> }) {
  return (
    <mesh>
      <sphereGeometry args={[RADIUS * 0.99, 24, 24]} />
      <meshBasicMaterial color={tokens.wire} transparent opacity={0.08} wireframe />
    </mesh>
  );
}

/* ── Shell ──────────────────────────────────────────────── */
function GlobeShell({ tokens }: { tokens: ReturnType<typeof themeTokens> }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.0004; });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[RADIUS * 0.97, 48, 48]} />
      <meshStandardMaterial color={tokens.shell} transparent opacity={tokens.shellOpacity} roughness={1} metalness={0} side={THREE.BackSide} />
    </mesh>
  );
}

/* ── Hover Tooltip (Html overlay on hovered node) ─────── */
function HoverTooltip({ graph, positions, hoveredIdx }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  hoveredIdx: number | null;
}) {
  if (hoveredIdx === null || !graph.nodes[hoveredIdx] || !positions[hoveredIdx]) return null;
  const node = graph.nodes[hoveredIdx];
  return (
    <Html position={positions[hoveredIdx]} center style={{ pointerEvents: 'none' }}>
      <div className="neural-globe-tooltip">
        {node.label}
      </div>
    </Html>
  );
}

/* ── Scene Setup ────────────────────────────────────────── */
function SceneSetup() {
  const { camera } = useThree();
  useEffect(() => { camera.position.set(0, 0.5, 3.5); }, [camera]);
  return null;
}

/* ── Main Scene ─────────────────────────────────────────── */
/** Build a reduced graph where each cluster = one node, with inter-cluster edges. */
function buildClusterGraph(graph: NeuralGraph): NeuralGraph {
  // Count how many nodes belong to each cluster
  const memberCounts = new Map<string, number>();
  graph.nodes.forEach((n) => {
    for (const cid of n.clusters) memberCounts.set(cid, (memberCounts.get(cid) || 0) + 1);
  });
  const clusterNodes: NeuralNode[] = graph.clusters.map((c) => ({
    id: `__cluster__${c.id}`,
    label: c.name,
    clusters: [c.id],
    room: '',
    blockTs: '',
    description: `${memberCounts.get(c.id) || 0} nodes`,
  }));
  // Dedupe cross-cluster edges
  const seen = new Set<string>();
  const clusterEdges: Edge[] = [];
  const nodeCluster = new Map<string, string>();
  graph.nodes.forEach((n) => { if (n.clusters[0]) nodeCluster.set(n.id, n.clusters[0]); });
  for (const e of graph.edges) {
    const cFrom = nodeCluster.get(e.from);
    const cTo = nodeCluster.get(e.to);
    if (!cFrom || !cTo || cFrom === cTo) continue;
    const key = [cFrom, cTo].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    clusterEdges.push({ from: `__cluster__${cFrom}`, to: `__cluster__${cTo}`, type: 'relates' });
  }
  return { ...graph, nodes: clusterNodes, edges: clusterEdges };
}

function GlobeScene({ graph, selectedIdx, hoveredIdx, onSelect, onHover, onUnhover, connectedNodeIds, tokens, displayMode }: {
  graph: NeuralGraph;
  selectedIdx: number | null;
  hoveredIdx: number | null;
  onSelect: (idx: number) => void;
  onHover: (idx: number) => void;
  onUnhover: () => void;
  connectedNodeIds: Set<string>;
  tokens: ReturnType<typeof themeTokens>;
  displayMode: 'nodes' | 'clusters';
}) {
  // In cluster mode, swap to reduced graph
  const viewGraph = useMemo(
    () => displayMode === 'clusters' ? buildClusterGraph(graph) : graph,
    [graph, displayMode],
  );

  const clusterMap = useMemo(() => {
    const m = new Map<string, number>();
    viewGraph.clusters.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [viewGraph.clusters]);

  const positions = useMemo(
    () => fibonacciSphere(viewGraph.nodes.length, RADIUS),
    [viewGraph.nodes.length],
  );

  const selectedNodeId = selectedIdx !== null ? viewGraph.nodes[selectedIdx]?.id ?? null : null;
  const selectedPos = selectedIdx !== null ? positions[selectedIdx] ?? null : null;

  return (
    <>
      <SceneSetup />
      <ambientLight intensity={tokens.ambient} />
      <pointLight position={[5, 5, 5]} intensity={0.6} />
      <pointLight position={[-5, -3, -5]} intensity={0.4} color={ACCENT} />

      <GlobeShell tokens={tokens} />
      <GlobeWireframe tokens={tokens} />
      <EdgeLines graph={viewGraph} positions={positions} selectedNodeId={selectedNodeId} tokens={tokens} />
      <EdgePulses graph={viewGraph} positions={positions} selectedNodeId={selectedNodeId} />
      <SelectedGlow position={selectedPos} />
      <InteractiveNodes
        graph={viewGraph}
        positions={positions}
        clusterMap={clusterMap}
        selectedIdx={selectedIdx}
        onSelect={onSelect}
        onHover={onHover}
        onUnhover={onUnhover}
      />
      <NodeLabels
        graph={viewGraph}
        positions={positions}
        clusterMap={clusterMap}
        selectedIdx={selectedIdx}
        connectedNodeIds={connectedNodeIds}
        tokens={tokens}
      />
      <EdgeTypeLabels graph={viewGraph} positions={positions} selectedNodeId={selectedNodeId} />
      <HoverTooltip graph={viewGraph} positions={positions} hoveredIdx={hoveredIdx} />

      <OrbitControls
        enablePan={false}
        autoRotate={selectedIdx === null}
        autoRotateSpeed={0.3}
        minDistance={2.2}
        maxDistance={6}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

/* ── Idle decorative globe (no real data) ───────────────── */
function IdleScene({ tokens }: { tokens: ReturnType<typeof themeTokens> }) {
  const groupRef = useRef<THREE.Group>(null);
  const count = 80;
  const positions = useMemo(() => fibonacciSphere(count, RADIUS), []);

  // Random faint edges between nearby points
  const edgeGeo = useMemo(() => {
    const verts: number[] = [];
    for (let i = 0; i < count; i++) {
      // connect each node to ~2 nearby neighbours
      const links = [(i + 3) % count, (i + 7) % count];
      for (const j of links) {
        const arc = sphereArc(positions[i], positions[j], 12);
        for (let k = 0; k < arc.length - 1; k++) {
          verts.push(arc[k].x, arc[k].y, arc[k].z, arc[k + 1].x, arc[k + 1].y, arc[k + 1].z);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return geo;
  }, [positions]);

  // Synthetic graph for pulses + node instances
  const fakeGraph = useMemo<NeuralGraph>(() => ({
    version: 1,
    updatedAt: '',
    clusters: [],
    nodes: positions.map((_, i) => ({ id: `idle-${i}`, label: '', clusters: [], room: '', blockTs: '', source: '' })),
    edges: positions.map((_, i) => ({ from: `idle-${i}`, to: `idle-${(i + 3) % count}`, type: 'relates' as const })),
  }), [positions]);

  const nodesMesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = nodesMesh.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color(ACCENT);
    for (let i = 0; i < count; i++) {
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(0.03);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [positions]);

  useFrame(() => { if (groupRef.current) groupRef.current.rotation.y += 0.0016; });

  return (
    <>
      <SceneSetup />
      <ambientLight intensity={tokens.ambient} />
      <pointLight position={[5, 5, 5]} intensity={0.5} />
      <pointLight position={[-5, -3, -5]} intensity={0.4} color={ACCENT} />
      <group ref={groupRef}>
        <GlobeShell tokens={tokens} />
        <GlobeWireframe tokens={tokens} />
        <lineSegments geometry={edgeGeo}>
          <lineBasicMaterial color={tokens.edge} transparent opacity={tokens.edgeOpacity * 0.7} />
        </lineSegments>
        <instancedMesh ref={nodesMesh} args={[undefined, undefined, count]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial emissive={ACCENT} emissiveIntensity={0.6} roughness={0.4} metalness={0.2} vertexColors />
        </instancedMesh>
        <EdgePulses graph={fakeGraph} positions={positions} selectedNodeId={null} count={18} />
      </group>
      <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.4} enableDamping dampingFactor={0.05} />
    </>
  );
}

/* ── Easing ─────────────────────────────────────────────── */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* ── Detail Panel (HTML overlay) ────────────────────────── */
function DetailPanel({ info, graph, clusterMap, ko, nodeTextById, getBlockText, width, setWidth, onClose, onPickNode }: {
  info: SelectedInfo;
  graph: NeuralGraph;
  clusterMap: Map<string, number>;
  ko: boolean;
  nodeTextById?: Record<string, string>;
  /** Async body fallback (wiki nodes whose markdown file lives in the repo). */
  getBlockText?: (roomPath: string, blockTs: string) => Promise<string | null>;
  width: number;
  setWidth: (px: number) => void;
  onClose: () => void;
  /** Clicking a connection row picks that node (parity with the 2D editor). */
  onPickNode?: (nodeId: string) => void;
}) {
  const { node, connectedEdges, connectedNodes } = info;
  const clusters = node.clusters
    .map(cid => graph.clusters.find(c => c.id === cid))
    .filter(Boolean) as Cluster[];
  const syncText = nodeTextById?.[node.id];

  // Async body for wiki nodes (markdown files in the repo). Only fetches when
  // there's no synchronous text and a callback is wired. Resets on node swap.
  const [asyncBody, setAsyncBody] = useState<string | null>(null);
  const [asyncLoading, setAsyncLoading] = useState(false);
  useEffect(() => {
    if (syncText || !getBlockText || !node.room) {
      setAsyncBody(null);
      return;
    }
    let cancelled = false;
    setAsyncLoading(true);
    setAsyncBody(null);
    getBlockText(node.room, node.blockTs).then((txt) => {
      if (cancelled) return;
      setAsyncBody(txt ?? '');
      setAsyncLoading(false);
    });
    return () => { cancelled = true; };
  }, [node.id, node.room, node.blockTs, syncText, getBlockText]);
  const text = syncText ?? asyncBody;

  return (
    <div className="globe-detail-panel" style={{ width }}>
      <PanelResizer width={width} setWidth={setWidth} min={260} max={640} side="left" />
      <div className="globe-detail-header">
        <div className="globe-detail-label">{node.label}</div>
        <button className="globe-detail-close" onClick={onClose}><X size={14} /></button>
      </div>

      {/* Clusters */}
      {clusters.length > 0 && (
        <div className="globe-detail-section">
          <div className="globe-detail-section-title">
            <CirclesFour size={12} weight="fill" />
            {ko ? '클러스터' : 'Clusters'}
          </div>
          <div className="globe-detail-tags">
            {clusters.map(c => {
              const cIdx = clusterMap.get(c.id) ?? -1;
              return (
                <span key={c.id} className="globe-detail-tag" style={{ borderColor: clusterColor(cIdx), color: clusterColor(cIdx) }}>
                  {c.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Block text — sync (nodeTextById) wins over async (wiki file fetch). */}
      {(text || asyncLoading) && (
        <div className="globe-detail-section">
          <div className="globe-detail-section-title">{ko ? '본문' : 'Content'}</div>
          <div className="globe-detail-text">
            {asyncLoading ? (ko ? '불러오는 중…' : 'Loading…') : text}
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="globe-detail-section">
        <div className="globe-detail-meta">
          {node.room && <span>📁 {node.room}</span>}
          {node.source && <span>👤 {node.source}</span>}
          {node.blockTs && <span>🕐 {node.blockTs}</span>}
        </div>
      </div>

      {/* Connections — parity with NeuralGraphView's NodePanel:
          - translated edge-type labels (ko: 관련/대체/근거)
          - LLM-edge tag for edges added by neural-enrich
          - other-node's room when it differs from this node's */}
      {connectedEdges.length > 0 && (
        <div className="globe-detail-section">
          <div className="globe-detail-section-title">
            <GitBranch size={12} />
            {ko ? `연결 (${connectedEdges.length})` : `Connections (${connectedEdges.length})`}
          </div>
          <div className="globe-detail-connections">
            {connectedEdges.slice(0, 10).map((edge, i) => {
              const otherId = edge.from === node.id ? edge.to : edge.from;
              const otherNode = connectedNodes.find(n => n.id === otherId);
              if (!otherNode) return null;
              const typeLabel = edge.type ? (GLOBE_EDGE_LABEL[edge.type]?.[ko ? 'ko' : 'en'] ?? edge.type) : '';
              const showRoom = otherNode.room && otherNode.room !== node.room;
              const clickable = !!onPickNode;
              const RowTag = clickable ? 'button' : 'div';
              return (
                <RowTag
                  key={i}
                  className={`globe-detail-connection${clickable ? ' globe-detail-connection-btn' : ''}`}
                  onClick={clickable ? () => onPickNode!(otherNode.id) : undefined}
                  type={clickable ? 'button' : undefined}
                >
                  <ArrowRight size={10} />
                  <span className="globe-detail-conn-label">{otherNode.label}</span>
                  {typeLabel && <span className="globe-detail-conn-type">{typeLabel}</span>}
                  {edge.source === 'llm' && (
                    <span className="globe-detail-conn-type" style={{ borderColor: LLM_EDGE_COLOR, color: LLM_EDGE_COLOR }}>
                      LLM
                    </span>
                  )}
                  {showRoom && <span className="globe-detail-conn-room">{otherNode.room}</span>}
                </RowTag>
              );
            })}
            {connectedEdges.length > 10 && (
              <div className="globe-detail-more">+{connectedEdges.length - 10} {ko ? '더' : 'more'}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Cluster Detail Panel (3D globe cluster mode) ────────── */
function ClusterDetailPanel({ info, graph, clusterMap, ko, width, setWidth, onClose, onPickMember }: {
  info: SelectedInfo;
  graph: NeuralGraph;
  clusterMap: Map<string, number>;
  ko: boolean;
  width: number;
  setWidth: (px: number) => void;
  onClose: () => void;
  onPickMember?: (nodeId: string) => void;
}) {
  const { node } = info;
  const realClusterId = node.id.replace(/^__cluster__/, '');
  const cluster = graph.clusters.find(c => c.id === realClusterId);
  const cIdx = clusterMap.get(realClusterId) ?? -1;
  const color = cIdx >= 0 ? clusterColor(cIdx) : '#888';

  const memberNodes = graph.nodes.filter(n => n.clusters.includes(realClusterId));

  const clusterEdges = info.connectedEdges;
  const connectedClusterNames = info.connectedNodes.map(cn => {
    const cid = cn.id.replace(/^__cluster__/, '');
    return graph.clusters.find(c => c.id === cid)?.name ?? cid;
  });

  return (
    <div className="globe-detail-panel" style={{ width }}>
      <PanelResizer width={width} setWidth={setWidth} min={260} max={640} side="left" />
      <div className="globe-detail-header">
        <div className="globe-detail-label" style={{ color }}>
          <CirclesFour size={14} weight="fill" style={{ marginRight: 6, color }} />
          {cluster?.name ?? realClusterId}
        </div>
        <button className="globe-detail-close" onClick={onClose}><X size={14} /></button>
      </div>

      {/* Cluster meta */}
      <div className="globe-detail-section">
        <div className="globe-detail-meta">
          <span className="globe-detail-tag" style={{ borderColor: color, color }}>
            {ko ? `${memberNodes.length}개 노드` : `${memberNodes.length} nodes`}
          </span>
        </div>
        {cluster?.desc && (
          <div className="globe-detail-text" style={{ marginTop: 6 }}>{cluster.desc}</div>
        )}
      </div>

      {/* Member nodes — clickable */}
      <div className="globe-detail-section">
        <div className="globe-detail-section-title">
          <GitBranch size={12} />
          {ko ? '소속 노드' : 'Members'}
        </div>
        <div className="globe-detail-connections">
          {memberNodes.slice(0, 20).map((m) => (
            <button
              key={m.id}
              className="globe-detail-connection globe-detail-connection-btn"
              onClick={() => onPickMember?.(m.id)}
            >
              <ArrowRight size={10} />
              <span className="globe-detail-conn-label">{m.label}</span>
              {m.room && <span className="globe-detail-conn-room">{m.room}</span>}
            </button>
          ))}
          {memberNodes.length > 20 && (
            <div className="globe-detail-more">+{memberNodes.length - 20} {ko ? '더' : 'more'}</div>
          )}
        </div>
      </div>

      {/* Connected clusters */}
      {clusterEdges.length > 0 && (
        <div className="globe-detail-section">
          <div className="globe-detail-section-title">
            <CirclesFour size={12} weight="fill" />
            {ko ? `연결된 클러스터 (${clusterEdges.length})` : `Connected clusters (${clusterEdges.length})`}
          </div>
          <div className="globe-detail-tags" style={{ marginTop: 4 }}>
            {connectedClusterNames.map((name, i) => {
              const cid = info.connectedNodes[i]?.id.replace(/^__cluster__/, '');
              const ci = cid ? (clusterMap.get(cid) ?? -1) : -1;
              const c2 = ci >= 0 ? clusterColor(ci) : '#888';
              return (
                <span key={i} className="globe-detail-tag" style={{ borderColor: c2, color: c2 }}>
                  {name}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Exported component ─────────────────────────────────── */
export default function NeuralGlobe({ graph, onClose, language, nodeTextById, getBlockText, embedded = false, theme = 'dark', idle = false, onIdleClick }: NeuralGlobeProps) {
  const ko = language === 'ko';
  const tokens = useMemo(() => themeTokens(theme), [theme]);
  const [contextLost, setContextLost] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(
    typeof window !== 'undefined' && window.innerWidth > 768
  );
  const [displayMode, setDisplayMode] = useState<'nodes' | 'clusters'>('nodes');
  const [panelWidth, setPanelWidth] = useState(320);

  const clusterMap = useMemo(() => {
    const m = new Map<string, number>();
    graph.clusters.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [graph.clusters]);

  const hasLlmEdges = useMemo(() => graph.edges.some((e) => e.source === 'llm'), [graph.edges]);

  const clusterLegend = useMemo(() =>
    graph.clusters.slice(0, 10).map((c, i) => ({
      ...c,
      color: clusterColor(i),
    })),
  [graph.clusters]);

  // Build the view graph (cluster-reduced when in clusters mode)
  const viewGraph = useMemo(
    () => displayMode === 'clusters' ? buildClusterGraph(graph) : graph,
    [graph, displayMode],
  );

  // Compute selected info — must use viewGraph to match selectedIdx from InteractiveNodes
  const selectedInfo = useMemo<SelectedInfo | null>(() => {
    if (selectedIdx === null || !viewGraph.nodes[selectedIdx]) return null;
    const node = viewGraph.nodes[selectedIdx];
    const connectedEdges = viewGraph.edges.filter(e => e.from === node.id || e.to === node.id);
    const connectedIds = new Set(connectedEdges.flatMap(e => [e.from, e.to]));
    connectedIds.delete(node.id);
    const connectedNodes = viewGraph.nodes.filter(n => connectedIds.has(n.id));
    return { node, index: selectedIdx, connectedEdges, connectedNodes };
  }, [selectedIdx, viewGraph]);

  const connectedNodeIds = useMemo(() => {
    if (!selectedInfo) return new Set<string>();
    const ids = new Set<string>();
    selectedInfo.connectedEdges.forEach(e => { ids.add(e.from); ids.add(e.to); });
    ids.delete(selectedInfo.node.id);
    return ids;
  }, [selectedInfo]);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedIdx !== null) setSelectedIdx(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, selectedIdx]);

  // Handle WebGL context loss
  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    const canvas = gl.domElement;
    const onLost = (e: Event) => { e.preventDefault(); setContextLost(true); };
    const onRestored = () => setContextLost(false);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
  }, []);

  const handleSelect = useCallback((idx: number) => {
    setSelectedIdx(prev => prev === idx ? null : idx);
  }, []);

  // When clicking a member node inside ClusterDetailPanel → switch to nodes mode and select that node
  const handlePickMember = useCallback((nodeId: string) => {
    setDisplayMode('nodes');
    const idx = graph.nodes.findIndex(n => n.id === nodeId);
    if (idx >= 0) setSelectedIdx(idx);
  }, [graph.nodes]);

  // When clicking a connection inside DetailPanel → select that node (stay in current mode).
  // Cluster super-nodes have synthetic `__cluster__*` ids; we strip and resolve to the
  // real cluster index when in clusters mode.
  const handlePickConnection = useCallback((nodeId: string) => {
    if (displayMode === 'clusters') {
      const clusterId = nodeId.replace(/^__cluster__/, '');
      const built = buildClusterGraph(graph);
      const idx = built.nodes.findIndex(n => n.id === `__cluster__${clusterId}`);
      if (idx >= 0) setSelectedIdx(idx);
      return;
    }
    const idx = graph.nodes.findIndex(n => n.id === nodeId);
    if (idx >= 0) setSelectedIdx(idx);
  }, [graph, displayMode]);


  const canvasEl = contextLost ? (
    <div className="neural-globe-lost">
      {ko ? 'GPU 컨텍스트가 손실되었습니다. 다시 시도해주세요.' : 'GPU context lost. Please retry.'}
    </div>
  ) : (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false }}
      camera={{ fov: 50, near: 0.1, far: 100 }}
      onCreated={handleCreated}
      onPointerMissed={() => { if (!idle) setSelectedIdx(null); }}
    >
      {idle ? (
        <IdleScene tokens={tokens} />
      ) : (
        <GlobeScene
          graph={graph}
          selectedIdx={selectedIdx}
          hoveredIdx={hoveredIdx}
          onSelect={handleSelect}
          onHover={setHoveredIdx}
          onUnhover={() => setHoveredIdx(null)}
          connectedNodeIds={connectedNodeIds}
          tokens={tokens}
          displayMode={displayMode}
        />
      )}
    </Canvas>
  );

  // ── Embedded mode: fill the parent container (the studio center stage) ──
  if (embedded) {
    return (
      <div
        className={`neural-globe-embed ${theme === 'light' ? 'is-light' : 'is-dark'}`}
        onClick={idle ? onIdleClick : undefined}
        role={idle ? 'button' : undefined}
      >
        <div className="neural-globe-canvas">{canvasEl}</div>

        {idle ? (
          <div className="neural-globe-idle-hint">
            <span>{ko ? '데이터를 기반으로 지식망을 구현하세요' : 'Build a knowledge graph from your data'}</span>
            <small>{ko ? '왼쪽 패널에서 파일을 업로드하고 생성하세요' : 'Upload files in the left panel, then generate'}</small>
          </div>
        ) : (
          <>
            {selectedInfo && (
              displayMode === 'clusters' ? (
                <ClusterDetailPanel
                  info={selectedInfo}
                  graph={graph}
                  clusterMap={clusterMap}
                  ko={ko}
                  width={panelWidth}
                  setWidth={setPanelWidth}
                  onClose={() => setSelectedIdx(null)}
                  onPickMember={handlePickMember}
                />
              ) : (
                <DetailPanel
                  info={selectedInfo}
                  graph={graph}
                  clusterMap={clusterMap}
                  ko={ko}
                  nodeTextById={nodeTextById}
                  getBlockText={getBlockText}
                  width={panelWidth}
                  setWidth={setPanelWidth}
                  onPickNode={handlePickConnection}
                  onClose={() => setSelectedIdx(null)}
                />
              )
            )}
            {/* Collapsible cluster legend */}
            <div className={`neural-globe-legend ${legendOpen ? 'is-open' : ''}`}>
              <button
                className="neural-globe-legend-toggle"
                onClick={() => setLegendOpen(!legendOpen)}
                title={ko ? '클러스터 범례' : 'Cluster legend'}
              >
                <CirclesFour size={14} weight="fill" />
                <span>{clusterLegend.length}</span>
              </button>
              {legendOpen && (
                <div className="neural-globe-legend-list">
                  {clusterLegend.map((c) => (
                    <div key={c.id} className="neural-globe-legend-item">
                      <div className="neural-globe-legend-dot" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
                      {c.name}
                    </div>
                  ))}
                  {hasLlmEdges && (
                    <div className="neural-globe-legend-item neural-globe-legend-edge-llm" title={ko ? 'LLM이 의미상 연결을 추론한 엣지' : 'LLM-inferred semantic edges'}>
                      <svg width="20" height="6" viewBox="0 0 20 6" aria-hidden>
                        <line x1="0" y1="3" x2="20" y2="3" stroke={LLM_EDGE_COLOR} strokeWidth="2" strokeDasharray="4 3" />
                      </svg>
                      <span style={{ opacity: 0.85 }}>{ko ? 'LLM 추론 엣지' : 'LLM-inferred'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="neural-globe-stats">
              <button className={`globe-stat-btn ${displayMode === 'nodes' ? 'active' : ''}`} onClick={() => { setDisplayMode('nodes'); setSelectedIdx(null); }}>
                <span>{graph.nodes.length}</span> {ko ? '노드' : 'nodes'}
              </button>
              <button className={`globe-stat-btn ${displayMode === 'clusters' ? 'active' : ''}`} onClick={() => { setDisplayMode('clusters'); setSelectedIdx(null); }}>
                <span>{graph.clusters.length}</span> {ko ? '클러스터' : 'clusters'}
              </button>
              <div><span>{graph.edges.length}</span> {ko ? '연결' : 'edges'}</div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Full-screen overlay mode (legacy) ──
  return (
    <div className={`neural-globe-overlay ${theme === 'light' ? 'is-light' : 'is-dark'}`}>
      <div className="neural-globe-header">
        <div className="neural-globe-title">
          <div className="globe-icon" />
          <span>{ko ? '뉴럴 글로브' : 'Neural Globe'}</span>
        </div>
        <button className="neural-globe-close" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>

      <div className="neural-globe-canvas">{canvasEl}</div>

      {selectedInfo && (
        displayMode === 'clusters' ? (
          <ClusterDetailPanel
            info={selectedInfo}
            graph={graph}
            clusterMap={clusterMap}
            ko={ko}
            width={panelWidth}
            setWidth={setPanelWidth}
            onClose={() => setSelectedIdx(null)}
            onPickMember={handlePickMember}
          />
        ) : (
          <DetailPanel
            info={selectedInfo}
            graph={graph}
            clusterMap={clusterMap}
            ko={ko}
            nodeTextById={nodeTextById}
            width={panelWidth}
            setWidth={setPanelWidth}
            onClose={() => setSelectedIdx(null)}
          />
        )
      )}

      <div className={`neural-globe-legend ${legendOpen ? 'is-open' : ''}`}>
        <button
          className="neural-globe-legend-toggle"
          onClick={() => setLegendOpen(!legendOpen)}
          title={ko ? '클러스터 범례' : 'Cluster legend'}
        >
          <CirclesFour size={14} weight="fill" />
          <span>{clusterLegend.length}</span>
        </button>
        {legendOpen && (
          <div className="neural-globe-legend-list">
            {clusterLegend.map((c) => (
              <div key={c.id} className="neural-globe-legend-item">
                <div className="neural-globe-legend-dot" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="neural-globe-stats">
        <button className={`globe-stat-btn ${displayMode === 'nodes' ? 'active' : ''}`} onClick={() => { setDisplayMode('nodes'); setSelectedIdx(null); }}>
          <span>{graph.nodes.length}</span> {ko ? '노드' : 'nodes'}
        </button>
        <button className={`globe-stat-btn ${displayMode === 'clusters' ? 'active' : ''}`} onClick={() => { setDisplayMode('clusters'); setSelectedIdx(null); }}>
          <span>{graph.clusters.length}</span> {ko ? '클러스터' : 'clusters'}
        </button>
        <div><span>{graph.edges.length}</span> {ko ? '연결' : 'edges'}</div>
      </div>
    </div>
  );
}
