/**
 * NeuralGlobe — 3D sphere-surface knowledge graph visualisation.
 *
 * Uses InstancedMesh for nodes (single draw call) and limits edge count
 * to prevent WebGL context loss. Fullscreen overlay with OrbitControls.
 *
 * Code-split via React.lazy() so three.js never enters the main bundle.
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuralGraph } from '../lib/neural/types';
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

interface NeuralGlobeProps {
  graph: NeuralGraph;
  onClose: () => void;
  language: string;
}

const MAX_EDGES_RENDERED = 200; // cap edges to prevent GPU overload
const RADIUS = 1.5;

/* ── Instanced Nodes (single draw call) ─────────────────── */
function InstancedNodes({ graph, positions, clusterMap }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  clusterMap: Map<string, number>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = graph.nodes.length;
  const animProgress = useRef(0);

  // Set instance transforms and colors
  useEffect(() => {
    if (!meshRef.current || count === 0) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(0.001); // start tiny for animation
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

  // Animate scale in
  useFrame((_, delta) => {
    if (!meshRef.current || count === 0) return;
    if (animProgress.current >= 1) return;

    animProgress.current = Math.min(1, animProgress.current + delta * 0.8);
    const t = animProgress.current;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const stagger = Math.min(1, Math.max(0, (t * count - i * 0.3) / (count * 0.7)));
      const s = easeOutBack(stagger) * 0.06;
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
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

/* ── Edge Lines (BufferGeometry batch) ──────────────────── */
function EdgeLines({ graph, positions, clusterMap }: {
  graph: NeuralGraph;
  positions: THREE.Vector3[];
  clusterMap: Map<string, number>;
}) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const [visible, setVisible] = useState(false);

  // Fade in edges after nodes appear
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const geometry = useMemo(() => {
    const nodeIdx = new Map<string, number>();
    graph.nodes.forEach((n, i) => nodeIdx.set(n.id, i));

    const edgesToRender = graph.edges.slice(0, MAX_EDGES_RENDERED);
    const verts: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();

    for (const edge of edgesToRender) {
      const fi = nodeIdx.get(edge.from);
      const ti = nodeIdx.get(edge.to);
      if (fi === undefined || ti === undefined) continue;
      if (!positions[fi] || !positions[ti]) continue;

      const arcPts = sphereArc(positions[fi], positions[ti], 16);
      const fromNode = graph.nodes[fi];
      const cIdx = fromNode.clusters[0] ? (clusterMap.get(fromNode.clusters[0]) ?? -1) : -1;
      color.set(cIdx >= 0 ? clusterColor(cIdx) : DEFAULT_NODE_COLOR);

      // Add line segments for the arc
      for (let i = 0; i < arcPts.length - 1; i++) {
        verts.push(arcPts[i].x, arcPts[i].y, arcPts[i].z);
        verts.push(arcPts[i + 1].x, arcPts[i + 1].y, arcPts[i + 1].z);
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [graph.edges, graph.nodes, positions, clusterMap]);

  return (
    <lineSegments ref={lineRef} geometry={geometry} visible={visible}>
      <lineBasicMaterial vertexColors transparent opacity={0.15} />
    </lineSegments>
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

/* ── Scene Setup ────────────────────────────────────────── */
function SceneSetup() {
  const { camera } = useThree();
  useEffect(() => { camera.position.set(0, 0.5, 3.5); }, [camera]);
  return null;
}

/* ── Main Scene ─────────────────────────────────────────── */
function GlobeScene({ graph }: { graph: NeuralGraph }) {
  const clusterMap = useMemo(() => {
    const m = new Map<string, number>();
    graph.clusters.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [graph.clusters]);

  const positions = useMemo(
    () => fibonacciSphere(graph.nodes.length, RADIUS),
    [graph.nodes.length],
  );

  return (
    <>
      <SceneSetup />
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.6} />
      <pointLight position={[-5, -3, -5]} intensity={0.3} color="#4ecafc" />

      <GlobeShell />
      <GlobeWireframe />
      <EdgeLines graph={graph} positions={positions} clusterMap={clusterMap} />
      <InstancedNodes graph={graph} positions={positions} clusterMap={clusterMap} />

      <OrbitControls
        enablePan={false}
        autoRotate
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

/* ── Exported component ─────────────────────────────────── */
export default function NeuralGlobe({ graph, onClose, language }: NeuralGlobeProps) {
  const ko = language === 'ko';
  const [contextLost, setContextLost] = useState(false);

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

  // Handle WebGL context loss
  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    const canvas = gl.domElement;
    const onLost = (e: Event) => { e.preventDefault(); setContextLost(true); };
    const onRestored = () => setContextLost(false);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
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
          >
            <GlobeScene graph={graph} />
          </Canvas>
        )}
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
