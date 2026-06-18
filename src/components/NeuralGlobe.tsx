/**
 * NeuralGlobe — 3D sphere-surface knowledge graph visualisation.
 *
 * Renders all NeuralGraph nodes on the surface of a translucent sphere,
 * colour-coded by cluster, with arc-edges connecting related nodes.
 * Fullscreen overlay with OrbitControls (rotate/zoom).
 *
 * Code-split via React.lazy() so three.js never enters the main bundle.
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Line, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuralGraph, NeuralNode, Edge } from '../lib/neural/types';
import { X } from '@phosphor-icons/react';
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
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1 || 1)) * 2; // -1..1
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
function sphereArc(a: THREE.Vector3, b: THREE.Vector3, segments = 48): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const aDir = a.clone().normalize();
  const bDir = b.clone().normalize();
  const angle = aDir.angleTo(bDir);
  if (angle < 0.001) return [a.clone(), b.clone()];

  const axis = new THREE.Vector3().crossVectors(aDir, bDir).normalize();
  const radius = a.length();
  const lift = 1 + 0.08 * (angle / Math.PI); // slight lift above surface

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dir = aDir.clone().applyAxisAngle(axis, angle * t);
    pts.push(dir.multiplyScalar(radius * lift));
  }
  return pts;
}

/* ── Types ──────────────────────────────────────────────── */
interface GlobeNodeData {
  node: NeuralNode;
  pos: THREE.Vector3;
  color: string;
  clusterIdx: number;
}

interface NeuralGlobeProps {
  graph: NeuralGraph;
  onClose: () => void;
  language: string;
}

/* ── Animated Node Mesh ─────────────────────────────────── */
function NodeSphere({
  data,
  index,
  onHover,
  onUnhover,
  highlighted,
}: {
  data: GlobeNodeData;
  index: number;
  onHover: (data: GlobeNodeData, evt: ThreeEvent<PointerEvent>) => void;
  onUnhover: () => void;
  highlighted: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [scale, setScale] = useState(0);
  const baseSize = 0.06;
  const targetScale = highlighted ? 1.8 : 1;

  // Entry animation — stagger by index
  useEffect(() => {
    const delay = 200 + index * 30;
    const timer = setTimeout(() => setScale(1), delay);
    return () => clearTimeout(timer);
  }, [index]);

  useFrame(() => {
    if (!meshRef.current) return;
    const cur = meshRef.current.scale.x;
    const target = scale * targetScale;
    const next = THREE.MathUtils.lerp(cur, target, 0.12);
    meshRef.current.scale.setScalar(next);
    if (glowRef.current) {
      glowRef.current.scale.setScalar(next * 2.5);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        THREE.MathUtils.lerp((glowRef.current.material as THREE.MeshBasicMaterial).opacity, highlighted ? 0.35 : 0.12, 0.1);
    }
  });

  const col = new THREE.Color(data.color);

  return (
    <group position={data.pos}>
      {/* Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[baseSize, 12, 12]} />
        <meshBasicMaterial color={col} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {/* Core */}
      <mesh
        ref={meshRef}
        scale={0}
        onPointerOver={(e) => { e.stopPropagation(); onHover(data, e); }}
        onPointerOut={(e) => { e.stopPropagation(); onUnhover(); }}
      >
        <sphereGeometry args={[baseSize, 16, 16]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={highlighted ? 1.2 : 0.6}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>
    </group>
  );
}

/* ── Animated Edge Arc ──────────────────────────────────── */
function EdgeArc({
  from,
  to,
  color,
  index,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  index: number;
}) {
  const [opacity, setOpacity] = useState(0);
  const points = useMemo(() => sphereArc(from, to), [from, to]);

  useEffect(() => {
    const delay = 600 + index * 15;
    const timer = setTimeout(() => setOpacity(1), delay);
    return () => clearTimeout(timer);
  }, [index]);

  useFrame(() => {
    // opacity is handled by Line's opacity prop
  });

  return (
    <Line
      points={points}
      color={color}
      lineWidth={1}
      transparent
      opacity={opacity * 0.25}
    />
  );
}

/* ── Translucent Sphere Shell ───────────────────────────── */
function GlobeSphere({ radius }: { radius: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.0005;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius * 0.98, 64, 64]} />
      <meshStandardMaterial
        color="#0d1117"
        transparent
        opacity={0.15}
        roughness={1}
        metalness={0}
        wireframe={false}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

/* ── Wireframe grid on sphere ───────────────────────────── */
function GlobeWireframe({ radius }: { radius: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius * 0.99, 32, 32]} />
      <meshBasicMaterial
        color="#1a2744"
        transparent
        opacity={0.08}
        wireframe
      />
    </mesh>
  );
}

/* ── Label on hover ─────────────────────────────────────── */
function NodeLabel({ data, visible }: { data: GlobeNodeData | null; visible: boolean }) {
  if (!data || !visible) return null;
  return (
    <Billboard position={data.pos.clone().normalize().multiplyScalar(data.pos.length() + 0.15)}>
      <Text
        fontSize={0.06}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.003}
        outlineColor="#000000"
      >
        {data.node.label.length > 30 ? data.node.label.slice(0, 30) + '…' : data.node.label}
      </Text>
    </Billboard>
  );
}

/* ── Auto-rotate scene ──────────────────────────────────── */
function SceneSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0.5, 3.2);
  }, [camera]);
  return null;
}

/* ── Main Globe Scene ───────────────────────────────────── */
function GlobeScene({ graph }: { graph: NeuralGraph }) {
  const RADIUS = 1.5;
  const [hovered, setHovered] = useState<GlobeNodeData | null>(null);
  const hoveredNeighbors = useRef<Set<string>>(new Set());

  // Build cluster → index map
  const clusterMap = useMemo(() => {
    const m = new Map<string, number>();
    graph.clusters.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [graph.clusters]);

  // Assign positions on the sphere
  const nodesData: GlobeNodeData[] = useMemo(() => {
    const positions = fibonacciSphere(graph.nodes.length, RADIUS);
    return graph.nodes.map((node, i) => {
      const cIdx = node.clusters[0] ? (clusterMap.get(node.clusters[0]) ?? -1) : -1;
      return {
        node,
        pos: positions[i],
        color: cIdx >= 0 ? clusterColor(cIdx) : DEFAULT_NODE_COLOR,
        clusterIdx: cIdx,
      };
    });
  }, [graph.nodes, clusterMap]);

  // Node id → index for edge lookup
  const nodeIdx = useMemo(() => {
    const m = new Map<string, number>();
    graph.nodes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [graph.nodes]);

  // Edge data
  const edgesData = useMemo(() => {
    return graph.edges
      .map((e, i) => {
        const fi = nodeIdx.get(e.from);
        const ti = nodeIdx.get(e.to);
        if (fi === undefined || ti === undefined) return null;
        return { edge: e, fromPos: nodesData[fi].pos, toPos: nodesData[ti].pos, color: nodesData[fi].color, index: i };
      })
      .filter(Boolean) as { edge: Edge; fromPos: THREE.Vector3; toPos: THREE.Vector3; color: string; index: number }[];
  }, [graph.edges, nodeIdx, nodesData]);

  const handleHover = useCallback((data: GlobeNodeData, _evt: ThreeEvent<PointerEvent>) => {
    setHovered(data);
    const neighbors = new Set<string>();
    neighbors.add(data.node.id);
    graph.edges.forEach((e) => {
      if (e.from === data.node.id) neighbors.add(e.to);
      if (e.to === data.node.id) neighbors.add(e.from);
    });
    hoveredNeighbors.current = neighbors;
  }, [graph.edges]);

  const handleUnhover = useCallback(() => {
    setHovered(null);
    hoveredNeighbors.current = new Set();
  }, []);

  return (
    <>
      <SceneSetup />
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />
      <pointLight position={[-5, -3, -5]} intensity={0.4} color="#4ecafc" />

      <GlobeSphere radius={RADIUS} />
      <GlobeWireframe radius={RADIUS} />

      {/* Edges */}
      {edgesData.map((e, i) => (
        <EdgeArc key={i} from={e.fromPos} to={e.toPos} color={e.color} index={i} />
      ))}

      {/* Nodes */}
      {nodesData.map((nd, i) => (
        <NodeSphere
          key={nd.node.id}
          data={nd}
          index={i}
          onHover={handleHover}
          onUnhover={handleUnhover}
          highlighted={hoveredNeighbors.current.has(nd.node.id)}
        />
      ))}

      {/* Hover label */}
      <NodeLabel data={hovered} visible={!!hovered} />

      <OrbitControls
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.4}
        minDistance={2}
        maxDistance={6}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

/* ── Exported component ─────────────────────────────────── */
export default function NeuralGlobe({ graph, onClose, language }: NeuralGlobeProps) {
  const ko = language === 'ko';

  // Cluster legend with assigned colours
  const clusterLegend = useMemo(() =>
    graph.clusters.slice(0, 10).map((c, i) => ({
      ...c,
      color: clusterColor(i),
    })),
  [graph.clusters]);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 50, near: 0.1, far: 100 }}
        >
          <GlobeScene graph={graph} />
        </Canvas>
      </div>

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
