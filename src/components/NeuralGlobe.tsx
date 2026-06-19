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
import { OrbitControls, Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuralGraph, NeuralNode, Edge, Cluster } from '../lib/neural/types';
import { X, ArrowRight, GitBranch, CirclesFour } from '@phosphor-icons/react';
import '../styles/neural-globe.css';

/* ── colour palette ─────────────────────────────────────── */
const CLUSTER_COLORS = [
  '#4ecafc', '#f97316', '#a855f7', '#22d3ee', '#ec4899',
  '#84cc16', '#f43f5e', '#06b6d4', '#eab308', '#6366f1',
  '#14b8a6', '#e879f9', '#fb923c', '#38bdf8', '#34d399',
];
const DEFAULT_NODE_COLOR = '#607d8b';

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
  selectedIdxRef.current = selectedIdx;

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
function NodeLabels({ graph, positions, clusterMap, selectedIdx, connectedNodeIds }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  clusterMap: Map<string, number>;
  selectedIdx: number | null;
  connectedNodeIds: Set<string>;
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
          <Text
            key={node.id}
            position={labelPos}
            fontSize={isSelected ? 0.07 : 0.045}
            color={isSelected ? '#ffffff' : isConnected ? color : 'rgba(255,255,255,0.6)'}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.004}
            outlineColor="#000000"
            maxWidth={0.6}
          >
            {node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label}
          </Text>
        );
      })}
    </>
  );
}

/* ── Edge Lines with highlight ──────────────────────────── */
function EdgeLines({ graph, positions, clusterMap, selectedNodeId }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  clusterMap: Map<string, number>;
  selectedNodeId: string | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const { normalGeo, highlightGeo } = useMemo(() => {
    const nodeIdx = new Map<string, number>();
    graph.nodes.forEach((n, i) => nodeIdx.set(n.id, i));

    const edgesToRender = graph.edges.slice(0, MAX_EDGES_RENDERED);
    const normVerts: number[] = [];
    const normColors: number[] = [];
    const hiVerts: number[] = [];
    const hiColors: number[] = [];
    const color = new THREE.Color();

    for (const edge of edgesToRender) {
      const fi = nodeIdx.get(edge.from);
      const ti = nodeIdx.get(edge.to);
      if (fi === undefined || ti === undefined) continue;
      if (!positions[fi] || !positions[ti]) continue;

      const isHighlighted = selectedNodeId && (edge.from === selectedNodeId || edge.to === selectedNodeId);
      const arcPts = sphereArc(positions[fi], positions[ti], 16);
      const fromNode = graph.nodes[fi];
      const cIdx = fromNode.clusters[0] ? (clusterMap.get(fromNode.clusters[0]) ?? -1) : -1;
      color.set(cIdx >= 0 ? clusterColor(cIdx) : DEFAULT_NODE_COLOR);

      const targetVerts = isHighlighted ? hiVerts : normVerts;
      const targetColors = isHighlighted ? hiColors : normColors;

      for (let i = 0; i < arcPts.length - 1; i++) {
        targetVerts.push(arcPts[i].x, arcPts[i].y, arcPts[i].z);
        targetVerts.push(arcPts[i + 1].x, arcPts[i + 1].y, arcPts[i + 1].z);
        targetColors.push(color.r, color.g, color.b);
        targetColors.push(color.r, color.g, color.b);
      }
    }

    const makeGeo = (v: number[], c: number[]) => {
      const geo = new THREE.BufferGeometry();
      if (v.length) {
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      }
      return geo;
    };

    return { normalGeo: makeGeo(normVerts, normColors), highlightGeo: makeGeo(hiVerts, hiColors) };
  }, [graph.edges, graph.nodes, positions, clusterMap, selectedNodeId]);

  return (
    <>
      <lineSegments geometry={normalGeo} visible={visible}>
        <lineBasicMaterial vertexColors transparent opacity={selectedNodeId ? 0.06 : 0.15} />
      </lineSegments>
      <lineSegments geometry={highlightGeo} visible={visible}>
        <lineBasicMaterial vertexColors transparent opacity={0.6} />
      </lineSegments>
    </>
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
function GlobeWireframe() {
  return (
    <mesh>
      <sphereGeometry args={[RADIUS * 0.99, 24, 24]} />
      <meshBasicMaterial color="#1a2744" transparent opacity={0.06} wireframe />
    </mesh>
  );
}

/* ── Shell ──────────────────────────────────────────────── */
function GlobeShell() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.0004; });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[RADIUS * 0.97, 48, 48]} />
      <meshStandardMaterial color="#0d1117" transparent opacity={0.12} roughness={1} metalness={0} side={THREE.BackSide} />
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
function GlobeScene({ graph, selectedIdx, hoveredIdx, onSelect, onHover, onUnhover, connectedNodeIds }: {
  graph: NeuralGraph;
  selectedIdx: number | null;
  hoveredIdx: number | null;
  onSelect: (idx: number) => void;
  onHover: (idx: number) => void;
  onUnhover: () => void;
  connectedNodeIds: Set<string>;
}) {
  const clusterMap = useMemo(() => {
    const m = new Map<string, number>();
    graph.clusters.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [graph.clusters]);

  const positions = useMemo(
    () => fibonacciSphere(graph.nodes.length, RADIUS),
    [graph.nodes.length],
  );

  const selectedNodeId = selectedIdx !== null ? graph.nodes[selectedIdx]?.id ?? null : null;

  return (
    <>
      <SceneSetup />
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.6} />
      <pointLight position={[-5, -3, -5]} intensity={0.3} color="#4ecafc" />

      <GlobeShell />
      <GlobeWireframe />
      <EdgeLines graph={graph} positions={positions} clusterMap={clusterMap} selectedNodeId={selectedNodeId} />
      <InteractiveNodes
        graph={graph}
        positions={positions}
        clusterMap={clusterMap}
        selectedIdx={selectedIdx}
        onSelect={onSelect}
        onHover={onHover}
        onUnhover={onUnhover}
      />
      <NodeLabels
        graph={graph}
        positions={positions}
        clusterMap={clusterMap}
        selectedIdx={selectedIdx}
        connectedNodeIds={connectedNodeIds}
      />
      <EdgeTypeLabels graph={graph} positions={positions} selectedNodeId={selectedNodeId} />
      <HoverTooltip graph={graph} positions={positions} hoveredIdx={hoveredIdx} />

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

/* ── Easing ─────────────────────────────────────────────── */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* ── Detail Panel (HTML overlay) ────────────────────────── */
function DetailPanel({ info, graph, clusterMap, ko, nodeTextById, onClose }: {
  info: SelectedInfo;
  graph: NeuralGraph;
  clusterMap: Map<string, number>;
  ko: boolean;
  nodeTextById?: Record<string, string>;
  onClose: () => void;
}) {
  const { node, connectedEdges, connectedNodes } = info;
  const clusters = node.clusters
    .map(cid => graph.clusters.find(c => c.id === cid))
    .filter(Boolean) as Cluster[];
  const text = nodeTextById?.[node.id];

  return (
    <div className="globe-detail-panel">
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

      {/* Block text */}
      {text && (
        <div className="globe-detail-section">
          <div className="globe-detail-section-title">{ko ? '본문' : 'Content'}</div>
          <div className="globe-detail-text">{text.length > 300 ? text.slice(0, 300) + '…' : text}</div>
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

      {/* Connections */}
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
              return (
                <div key={i} className="globe-detail-connection">
                  <ArrowRight size={10} />
                  <span className="globe-detail-conn-label">{otherNode.label}</span>
                  {edge.type && <span className="globe-detail-conn-type">{edge.type}</span>}
                </div>
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

/* ── Exported component ─────────────────────────────────── */
export default function NeuralGlobe({ graph, onClose, language, nodeTextById }: NeuralGlobeProps) {
  const ko = language === 'ko';
  const [contextLost, setContextLost] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const clusterMap = useMemo(() => {
    const m = new Map<string, number>();
    graph.clusters.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [graph.clusters]);

  const clusterLegend = useMemo(() =>
    graph.clusters.slice(0, 10).map((c, i) => ({
      ...c,
      color: clusterColor(i),
    })),
  [graph.clusters]);

  // Compute selected info
  const selectedInfo = useMemo<SelectedInfo | null>(() => {
    if (selectedIdx === null || !graph.nodes[selectedIdx]) return null;
    const node = graph.nodes[selectedIdx];
    const connectedEdges = graph.edges.filter(e => e.from === node.id || e.to === node.id);
    const connectedIds = new Set(connectedEdges.flatMap(e => [e.from, e.to]));
    connectedIds.delete(node.id);
    const connectedNodes = graph.nodes.filter(n => connectedIds.has(n.id));
    return { node, index: selectedIdx, connectedEdges, connectedNodes };
  }, [selectedIdx, graph]);

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


  return (
    <div className="neural-globe-overlay">
      {/* Header */}
      <div className="neural-globe-header">
        <div className="neural-globe-title">
          <div className="globe-icon" />
          <span>{ko ? '뉴럴 글로브' : 'Neural Globe'}</span>
        </div>
        <button className="neural-globe-close" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>

      {/* 3D Canvas */}
      <div className="neural-globe-canvas">
        {contextLost ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            {ko ? 'GPU 컨텍스트가 손실되었습니다. 닫고 다시 열어주세요.' : 'GPU context lost. Close and reopen.'}
          </div>
        ) : (
          <Canvas
            dpr={[1, 1.5]}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'default',
              failIfMajorPerformanceCaveat: false,
            }}
            camera={{ fov: 50, near: 0.1, far: 100 }}
            onCreated={handleCreated}
            onPointerMissed={() => setSelectedIdx(null)}
          >
            <GlobeScene
              graph={graph}
              selectedIdx={selectedIdx}
              hoveredIdx={hoveredIdx}
              onSelect={handleSelect}
              onHover={setHoveredIdx}
              onUnhover={() => setHoveredIdx(null)}
              connectedNodeIds={connectedNodeIds}
            />
          </Canvas>
        )}
      </div>

      {/* Detail Panel */}
      {selectedInfo && (
        <DetailPanel
          info={selectedInfo}
          graph={graph}
          clusterMap={clusterMap}
          ko={ko}
          nodeTextById={nodeTextById}
          onClose={() => setSelectedIdx(null)}
        />
      )}

      {/* Cluster legend */}
      <div className="neural-globe-legend">
        {clusterLegend.map((c) => (
          <div key={c.id} className="neural-globe-legend-item">
            <div className="neural-globe-legend-dot" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
            {c.name}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="neural-globe-stats">
        <div><span>{graph.nodes.length}</span> {ko ? '노드' : 'nodes'}</div>
        <div><span>{graph.edges.length}</span> {ko ? '연결' : 'edges'}</div>
        <div><span>{graph.clusters.length}</span> {ko ? '클러스터' : 'clusters'}</div>
      </div>
    </div>
  );
}
