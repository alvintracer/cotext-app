// ============================================================
// Neural Link — interactive graph view (P4)
// 결정 D-009 / 계획서 §32
//
// d3-force based force-directed layout. KYT-style cluster/node graph
// specialized for Cotext: click selects (right panel), drag moves, click
// vs drag distinguished by motion threshold. Physics toggle (off → all
// pinned). Cluster-collapse toggle merges members into one super-node.
// Edge labels show relation type (관련/대체/근거).
//
// NOTE: react-hooks/immutability is disabled file-wide — d3-force owns
// the node array and mutates n.x/y/fx/fy/pinned in-place as part of its
// API. Mutations happen inside effects/handlers only.
// ============================================================
/* eslint-disable react-hooks/immutability */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide,
  type Simulation, type SimulationNodeDatum, type SimulationLinkDatum,
} from 'd3-force';
import {
  X, MagnifyingGlass, Lightning, Pause, ArrowsOutCardinal, PushPinSlash, ArrowSquareOut,
  CirclesThree, CircleDashed, Graph as GraphIcon, Tag, ArrowRight, Spinner as Loader2,
  Trash, LinkSimple, ArrowsClockwise, ArrowFatUp,
} from '@phosphor-icons/react';
import type { NeuralGraph, NeuralNode, Cluster } from '../lib/neural';
import PanelResizer from './PanelResizer';

// React FC alias for Phosphor icon components (used in ring menu segments).
type IconFC = React.FC<{ size?: number; color?: string; weight?: 'regular' | 'bold' | 'fill' }>;

interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  room: string;
  blockTs: string;
  clusters: string[];
  source?: string;
  pinned?: boolean;
  /** true when this is a synthetic cluster super-node in collapse mode */
  isCluster?: boolean;
  /** ids of member nodes when isCluster=true */
  memberIds?: string[];
  /** member NeuralNodes (resolved) for cluster panel rendering */
  members?: NeuralNode[];
}
interface GLink extends SimulationLinkDatum<GNode> {
  type?: string;
  viaCluster?: string;
  /** Edge provenance: 'wiki' (compiled from [[link]]) | 'llm' (LLM-inferred) | undefined.
   *  Named `provenance` (not `source`) to avoid collision with d3's link.source endpoint. */
  provenance?: string;
}

const CLUSTER_COLORS = [
  '#3b9eff', '#a78bfa', '#f59e0b', '#10b981', '#ec4899',
  '#06b6d4', '#f97316', '#84cc16', '#8b5cf6', '#ef4444',
];

const EDGE_TYPE_LABEL: Record<string, { ko: string; en: string }> = {
  relates: { ko: '관련', en: 'Relates' },
  supersedes: { ko: '대체', en: 'Supersedes' },
  supports: { ko: '근거', en: 'Supports' },
};

// 4-section ring menu layout (compass orientation: top=delete, then clockwise).
// Icons are language-neutral so segments are readable in both ko/en.
interface RingSection { id: 'delete' | 'relates' | 'supersedes' | 'supports'; ko: string; en: string; angle: number; color: string; Icon: IconFC }
const RING_SECTIONS: RingSection[] = [
  { id: 'delete', ko: '삭제', en: 'Delete', angle: -Math.PI / 2, color: '#ef4444', Icon: Trash },
  { id: 'relates', ko: '관련', en: 'Relates', angle: 0, color: '#3b9eff', Icon: LinkSimple },
  { id: 'supersedes', ko: '대체', en: 'Supersedes', angle: Math.PI / 2, color: '#f59e0b', Icon: ArrowsClockwise },
  { id: 'supports', ko: '근거', en: 'Supports', angle: Math.PI, color: '#10b981', Icon: ArrowFatUp },
];

const RING_SPAN = Math.PI / 2; // each segment spans 90°

/** SVG path for a donut-arc segment centered at (cx,cy). */
function arcSegment(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
  const x1o = cx + rOuter * Math.cos(startAngle);
  const y1o = cy + rOuter * Math.sin(startAngle);
  const x2o = cx + rOuter * Math.cos(endAngle);
  const y2o = cy + rOuter * Math.sin(endAngle);
  const x1i = cx + rInner * Math.cos(endAngle);
  const y1i = cy + rInner * Math.sin(endAngle);
  const x2i = cx + rInner * Math.cos(startAngle);
  const y2i = cy + rInner * Math.sin(startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${x1o},${y1o} A${rOuter},${rOuter} 0 ${large} 1 ${x2o},${y2o} L${x1i},${y1i} A${rInner},${rInner} 0 ${large} 0 ${x2i},${y2i} Z`;
}

function colorFor(clusterId: string | undefined, palette: Map<string, string>): string {
  if (!clusterId) return 'var(--text-dim)';
  let c = palette.get(clusterId);
  if (!c) { c = CLUSTER_COLORS[palette.size % CLUSTER_COLORS.length]; palette.set(clusterId, c); }
  return c;
}

export default function NeuralGraphView({
  graph, currentRoom, language, getBlockText, onClose, onJump, onNavigateRoom,
  onDeleteNode, onLinkEdge, onUnlinkEdge, embedded = false, focusNodeId,
}: {
  graph: NeuralGraph;
  currentRoom: string;
  language: string;
  /** Render inline inside a container instead of a fixed overlay (studio center stage). */
  embedded?: boolean;
  /** Deep-link target: auto-select this node once it's present in the graph. */
  focusNodeId?: string;
  /** Async block-text fetch for the detail panel (current room = local; others = GitHub). */
  getBlockText?: (roomPath: string, blockTs: string) => Promise<string | null>;
  onClose: () => void;
  onJump: (blockTs: string) => void;
  onNavigateRoom?: (roomPath: string, blockTs: string) => void;
  /** Editor capabilities — same handlers the timeline/menu uses, so graph edits flow to repo. */
  onDeleteNode?: (node: GNode) => void;
  onLinkEdge?: (fromId: string, toId: string, type: string) => void;
  onUnlinkEdge?: (fromId: string, toId: string) => void;
}) {
  const ko = language === 'ko';
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [physics, setPhysics] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [hover, setHover] = useState<GNode | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [, force] = useState(0); // re-render on tick
  const [panning, setPanning] = useState(false);
  // Selection: either a node or a synthetic cluster super-node.
  const [selected, setSelected] = useState<GNode | null>(null);
  // Selected edge (for the circular edit menu over its midpoint).
  const [selectedEdge, setSelectedEdge] = useState<{ from: string; to: string; type?: string } | null>(null);
  // Edge being drafted via drag from a ring-menu segment.
  const [draftEdge, setDraftEdge] = useState<{ from: string; type: string; toX: number; toY: number; hoverNode?: string } | null>(null);
  // Mobile support
  const [legendOpen, setLegendOpen] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  // Resizable right detail panel — drag the left edge to widen/narrow.
  const [panelWidth, setPanelWidth] = useState(320);
  const lastTouchDist = useRef(0);
  // Keep view in a ref so native (non-passive) wheel/touch handlers never read stale state.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  // Resize observer
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build base sim nodes/links from the graph.
  // GNode identity registry — preserves x/y/vx/vy/pinned across graph updates.
  // Without this, adding an edge would recreate every GNode and reset the whole
  // layout (causing the "튕김" jolt and stranding the ring menu at stale coords).
  const nodeRegistryRef = useRef<Map<string, GNode>>(new Map());

  const { palette, clusterList, baseNodes, baseLinks, originalById } = useMemo(() => {
    const pal = new Map<string, string>();
    for (const c of graph.clusters) colorFor(c.id, pal);
    const registry = nodeRegistryRef.current;
    const ns: GNode[] = graph.nodes.map((n: NeuralNode) => {
      const existing = registry.get(n.id);
      if (existing) {
        // Mutate in place so the simulation's x/y/vx/vy stay attached.
        existing.label = n.label || n.id;
        existing.room = n.room;
        existing.blockTs = n.blockTs;
        existing.clusters = n.clusters;
        existing.source = n.source;
        // Clear any leftover cluster-mode flags so a real node never inherits them.
        existing.isCluster = false;
        existing.memberIds = undefined;
        existing.members = undefined;
        return existing;
      }
      const fresh: GNode = {
        id: n.id, label: n.label || n.id, room: n.room, blockTs: n.blockTs,
        clusters: n.clusters, source: n.source,
      };
      registry.set(n.id, fresh);
      return fresh;
    });
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const ids = new Set(ns.map((n) => n.id));
    const ls: GLink[] = graph.edges
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, type: e.type, viaCluster: e.viaCluster, provenance: e.source }));
    return { palette: pal, clusterList: graph.clusters, baseNodes: ns, baseLinks: ls, originalById: byId };
  }, [graph]);

  // Collapsed view: group nodes by their first cluster; merge members into one super-node.
  // Unclustered nodes remain as themselves. Edges aggregate between groups.
  const { nodes, links } = useMemo(() => {
    if (!collapsed) return { nodes: baseNodes, links: baseLinks };

    const groupOf = new Map<string, string>(); // nodeId -> groupId
    for (const n of baseNodes) groupOf.set(n.id, n.clusters[0] ?? n.id);

    const membersByGroup = new Map<string, GNode[]>();
    for (const n of baseNodes) {
      const g = groupOf.get(n.id)!;
      const arr = membersByGroup.get(g) ?? [];
      arr.push(n);
      membersByGroup.set(g, arr);
    }

    const synthIdOf = (groupId: string) => {
      const isCluster = clusterList.some((c) => c.id === groupId);
      return isCluster ? `cluster:${groupId}` : groupId;
    };

    const registry = nodeRegistryRef.current;
    const cNodes: GNode[] = [];
    for (const [groupId, members] of membersByGroup) {
      const isCluster = clusterList.some((c) => c.id === groupId);
      if (!isCluster && members.length === 1) {
        cNodes.push(members[0]);
        continue;
      }
      const cluster = clusterList.find((c) => c.id === groupId);
      const superId = `cluster:${groupId}`;
      const memberIds = members.map((m) => m.id);
      const memberNodes = members.map((m) => originalById.get(m.id)!).filter(Boolean);
      const existing = registry.get(superId);
      if (existing) {
        existing.label = cluster?.name ?? groupId;
        existing.room = members[0].room;
        existing.clusters = [groupId];
        existing.isCluster = true;
        existing.memberIds = memberIds;
        existing.members = memberNodes;
        cNodes.push(existing);
      } else {
        const fresh: GNode = {
          id: superId,
          label: cluster?.name ?? groupId,
          room: members[0].room,
          blockTs: '',
          clusters: [groupId],
          isCluster: true,
          memberIds,
          members: memberNodes,
        };
        registry.set(superId, fresh);
        cNodes.push(fresh);
      }
    }

    const seen = new Set<string>();
    const cLinks: GLink[] = [];
    for (const e of baseLinks) {
      const sId = typeof e.source === 'string' ? e.source : (e.source as GNode).id;
      const tId = typeof e.target === 'string' ? e.target : (e.target as GNode).id;
      const sg = groupOf.get(sId);
      const tg = groupOf.get(tId);
      if (!sg || !tg || sg === tg) continue;
      const ss = synthIdOf(sg);
      const tt = synthIdOf(tg);
      const key = `${ss}::${tt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cLinks.push({ source: ss, target: tt, type: e.type, viaCluster: e.viaCluster, provenance: e.provenance });
    }

    return { nodes: cNodes, links: cLinks };
  }, [collapsed, baseNodes, baseLinks, clusterList, originalById]);

  // Deep-link focus: select the requested node once it shows up in the graph
  // (graph loads async). Only auto-applies once per focusNodeId.
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNodeId || focusedRef.current === focusNodeId) return;
    const target = nodes.find((n) => n.id === focusNodeId);
    if (target) {
      focusedRef.current = focusNodeId;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link focus once async graph data arrives
      setSelected(target);
    }
  }, [focusNodeId, nodes]);

  // d3-force simulation. Built once; nodes/links swapped IN PLACE on graph updates
  // (rebuilding would reset alpha to 1 and "튕기게" — the visible jolt the user
  // complained about). Since GNode identity is preserved via the registry, the
  // existing x/y survive and only the link force needs a tiny re-settle.
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  useEffect(() => {
    if (simRef.current) {
      simRef.current.nodes(nodes);
      const linkForce = simRef.current.force('link') as ReturnType<typeof forceLink<GNode, GLink>> | null;
      if (linkForce) linkForce.links(links);
      // Tiny nudge so new edges can pull their endpoints — barely visible.
      if (physics) simRef.current.alpha(0.08).restart();
      return;
    }
    const sim = forceSimulation<GNode>(nodes)
      .force('charge', forceManyBody().strength(-220))
      .force('link', forceLink<GNode, GLink>(links).id((d) => d.id).distance(90).strength(0.55))
      .force('center', forceCenter(size.w / 2, size.h / 2))
      .force('collide', forceCollide<GNode>().radius((d) => (d.isCluster ? 26 + Math.min(20, (d.memberIds?.length ?? 0) * 1.5) : 22)));
    sim.on('tick', () => force((n) => (n + 1) & 0xffff));
    simRef.current = sim;
    return () => { sim.stop(); simRef.current = null; };
  }, [nodes, links, physics]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.force('center', forceCenter(size.w / 2, size.h / 2));
    // No alpha restart on size change — the right panel opening would otherwise
    // bounce the whole layout. Sim is already running on initial mount, and for
    // user-driven resizes the gentle center-force update is enough.
  }, [size.w, size.h]);

  // Physics toggle: OFF → pin all at current positions; ON → unfreeze non-user-pinned.
  // The previous version had `nodes` in its deps and restarted the sim at alpha(0.7)
  // on every graph update, which jolted the entire layout each time an edge was added.
  // Now: only the actual physics toggle restarts; node array refresh just pins any
  // newly-arrived nodes when physics is off (without restarting).
  const prevPhysicsRef = useRef(physics);
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const toggled = prevPhysicsRef.current !== physics;
    prevPhysicsRef.current = physics;

    if (!toggled) {
      if (!physics) {
        // New node arrived while paused — pin it where it landed.
        for (const n of nodes) {
          if (n.fx == null && n.x != null) { n.fx = n.x; n.fy = n.y; n.pinned = true; }
        }
      }
      return;
    }

    if (physics) {
      for (const n of nodes) {
        if (!n.pinned) { n.fx = null; n.fy = null; }
      }
      sim.alpha(0.7).restart();
    } else {
      for (const n of nodes) {
        if (n.x != null) n.fx = n.x;
        if (n.y != null) n.fy = n.y;
        n.pinned = true;
      }
      sim.alpha(0).stop();
    }
  }, [physics, nodes]);

  const unpinAll = () => {
    for (const n of nodes) { n.fx = null; n.fy = null; n.pinned = false; }
    simRef.current?.alpha(0.5).restart();
  };

  // Click vs drag distinction — track motion since pointerdown.
  const dragRef = useRef<{ id: string; downX: number; downY: number; moved: boolean } | null>(null);
  const DRAG_THRESHOLD = 4; // px

  function onPointerDown(e: React.PointerEvent<SVGGElement>, n: GNode) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { id: n.id, downX: e.clientX, downY: e.clientY, moved: false };
    e.stopPropagation();
  }
  function onPointerMove(e: React.PointerEvent<SVGGElement>, n: GNode) {
    const d = dragRef.current;
    if (!d || d.id !== n.id) return;
    const dx = e.clientX - d.downX, dy = e.clientY - d.downY;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      d.moved = true;
      // start a real drag — pin and pulse the sim
      n.fx = n.x; n.fy = n.y; n.pinned = true;
      simRef.current?.alphaTarget(0.2).restart();
    }
    if (d.moved) {
      const { x, y } = svgPoint(svgRef.current!, e.clientX, e.clientY, view);
      n.fx = x; n.fy = y;
    }
    e.stopPropagation();
  }
  function onPointerUp(e: React.PointerEvent<SVGGElement>, n: GNode) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.id !== n.id) return;
    simRef.current?.alphaTarget(0);
    if (!d.moved) {
      // Treat as click → select (no navigation)
      setSelected(n);
    }
    e.stopPropagation();
  }

  // Background pan + wheel zoom. Also: click-on-empty clears selections.
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  function onBgDown(e: React.PointerEvent<SVGSVGElement>) {
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
    setPanning(true);
  }
  function onBgMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.x, dy = e.clientY - panRef.current.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) panRef.current.moved = true;
    setView((v) => {
      if (!panRef.current) return v;
      return { ...v, x: panRef.current.vx + dx, y: panRef.current.vy + dy };
    });
  }
  function onBgUp() {
    const had = panRef.current;
    const wasMoved = had?.moved ?? false;
    panRef.current = null;
    setPanning(false);
    // Only clear selections if this was a real background interaction (had a down).
    // Without this guard, clicking on a node/edge (which stopPropagation()'d down)
    // would still bubble its up event here and immediately deselect.
    if (had && !wasMoved) { setSelected(null); setSelectedEdge(null); }
  }

  // Drag-to-link gesture from a ring-menu edge-type segment.
  // We bypass setPointerCapture so we can detect the drop target via elementFromPoint.
  function startEdgeDraft(e: React.PointerEvent, fromId: string, type: string) {
    e.stopPropagation();
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const initial = svgPoint(svg, e.clientX, e.clientY, view);
    setDraftEdge({ from: fromId, type, toX: initial.x, toY: initial.y });

    function onMove(ev: PointerEvent) {
      const pt = svgPoint(svg!, ev.clientX, ev.clientY, view);
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const targetEl = el?.closest('[data-graph-node-id]');
      const targetId = targetEl?.getAttribute('data-graph-node-id') ?? undefined;
      setDraftEdge((d) => d ? { ...d, toX: pt.x, toY: pt.y, hoverNode: targetId && targetId !== fromId ? targetId : undefined } : null);
    }
    function onUp(ev: PointerEvent) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const targetEl = el?.closest('[data-graph-node-id]');
      const targetId = targetEl?.getAttribute('data-graph-node-id') ?? undefined;
      if (targetId && targetId !== fromId && onLinkEdge) {
        onLinkEdge(fromId, targetId, type);
      }
      setDraftEdge(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function handleDeleteSelectedNode() {
    if (!selected || selected.isCluster || !onDeleteNode) return;
    // Room-scoped graph (currentRoom set): only delete nodes from this room,
    // since cross-room deletion would need that room's content. The MindSync
    // workspace-wide editor passes an empty currentRoom and deletes via
    // neural.json directly, so the guard doesn't apply there.
    if (currentRoom && selected.room !== currentRoom) return;
    onDeleteNode(selected);
    setSelected(null);
  }

  function handleEdgeMenuPick(type: string) {
    if (!selectedEdge) return;
    if (type === 'delete') {
      onUnlinkEdge?.(selectedEdge.from, selectedEdge.to);
    } else {
      onLinkEdge?.(selectedEdge.from, selectedEdge.to, type);
    }
    setSelectedEdge(null);
  }
  // Attach wheel/touch handlers as native events (non-passive) to allow preventDefault.
  // React synthetic events are passive by default, causing console warnings.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      const k = Math.max(0.3, Math.min(3, viewRef.current.k * (1 + delta)));
      const rect = svg!.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const px = (cx - viewRef.current.x) / viewRef.current.k;
      const py = (cy - viewRef.current.y) / viewRef.current.k;
      setView({ k, x: cx - px * k, y: cy - py * k });
    }
    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist.current = Math.hypot(dx, dy);
      }
    }
    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = dist - lastTouchDist.current;
        const newK = Math.max(0.3, Math.min(3, viewRef.current.k + delta * 0.005));
        setView(v => ({ ...v, k: newK }));
        lastTouchDist.current = dist;
      }
    }
    svg.addEventListener('wheel', handleWheel, { passive: false });
    svg.addEventListener('touchstart', handleTouchStart, { passive: true });
    svg.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
      svg.removeEventListener('touchstart', handleTouchStart);
      svg.removeEventListener('touchmove', handleTouchMove);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search highlight
  const q = query.trim().toLowerCase();
  const isHit = (n: GNode) =>
    !q || n.label.toLowerCase().includes(q) || n.clusters.some((c) => c.toLowerCase().includes(q));

  const typeLabel = (id?: string) => {
    if (!id) return '';
    const t = EDGE_TYPE_LABEL[id];
    return t ? (ko ? t.ko : t.en) : id;
  };

  // When current selection is a real node, lazily fetch its block text.
  const [blockText, setBlockText] = useState<string | null>(null);
  const [blockTextLoading, setBlockTextLoading] = useState(false);
  useEffect(() => {
    if (!selected || selected.isCluster || !getBlockText) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset cache on selection clear
      setBlockText(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to loading on selection swap
    setBlockTextLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale text immediately
    setBlockText(null);
    getBlockText(selected.room, selected.blockTs).then((txt) => {
      if (cancelled) return;
      setBlockText(txt ?? '');
      setBlockTextLoading(false);
    });
    return () => { cancelled = true; };
  }, [selected, getBlockText]);

  function nodeRadius(n: GNode): number {
    if (n.isCluster) return 14 + Math.min(18, (n.memberIds?.length ?? 0) * 1.2);
    return 9;
  }
  function selectMember(realNodeId: string) {
    const real = baseNodes.find((n) => n.id === realNodeId);
    if (real) setSelected(real);
  }
  function jumpFromPanel(n: GNode) {
    if (n.isCluster) return;
    if (n.room === currentRoom) onJump(n.blockTs);
    else onNavigateRoom?.(n.room, n.blockTs);
  }

  return (
    <div
      className={embedded ? 'neural-graph-embed' : 'modal-overlay'}
      onClick={embedded ? undefined : onClose}
    >
      <div className="modal-content neural-graph" onClick={(e) => e.stopPropagation()}>
        <div className="neural-graph-toolbar">
          <div className="neural-graph-title">{ko ? '뉴럴 링크 그래프' : 'Neural Link graph'}</div>
          <div className="neural-graph-search">
            <MagnifyingGlass size={13} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ko ? '라벨·클러스터 검색…' : 'Search labels & clusters…'}
            />
          </div>
          <button
            className={`btn btn-ghost btn-sm ${collapsed ? 'active' : ''}`}
            onClick={() => setCollapsed((c) => !c)}
            title={ko ? '같은 클러스터 노드를 하나로 묶기' : 'Collapse same-cluster nodes'}
          >
            {collapsed ? <CirclesThree size={13} weight="fill" /> : <CircleDashed size={13} />}
            {collapsed ? (ko ? '클러스터 ON' : 'Cluster') : (ko ? '클러스터 OFF' : 'Individual')}
          </button>
          <button
            className={`btn btn-ghost btn-sm ${physics ? '' : 'active'}`}
            onClick={() => setPhysics((p) => !p)}
            title={ko ? '물리엔진 켜기/끄기' : 'Toggle physics'}
          >
            {physics ? <><Lightning size={13} /> {ko ? '물리 ON' : 'Physics on'}</> : <><Pause size={13} /> {ko ? '물리 OFF (고정)' : 'Physics off (pinned)'}</>}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={unpinAll} title={ko ? '모든 핀 해제' : 'Unpin all'}>
            <PushPinSlash size={13} /> {ko ? '핀 해제' : 'Unpin all'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setView({ x: 0, y: 0, k: 1 })} title={ko ? '뷰 리셋' : 'Reset view'}>
            <ArrowsOutCardinal size={13} /> {ko ? '뷰 리셋' : 'Reset'}
          </button>
          {!embedded && <button className="icon-button" onClick={onClose} aria-label="close"><X size={16} /></button>}
        </div>

        <div className="neural-graph-body">
          <aside className={`neural-graph-legend ${isMobile && legendOpen ? 'mobile-open' : ''}`}>
            <p className="neural-graph-stat">
              {ko
                ? `노드 ${nodes.length} · 클러스터 ${clusterList.length} · 엣지 ${links.length}`
                : `${nodes.length} nodes · ${clusterList.length} clusters · ${links.length} edges`}
            </p>
            <div className="neural-graph-clusters">
              {clusterList.map((c) => (
                <button
                  key={c.id}
                  className="neural-graph-cluster-row"
                  onClick={() => setQuery(c.id)}
                  title={ko ? '이 클러스터로 필터' : 'Filter to this cluster'}
                >
                  <span className="neural-graph-swatch" style={{ background: palette.get(c.id) }} />
                  <span className="neural-graph-cluster-name">{c.name}</span>
                </button>
              ))}
              {clusterList.length === 0 && (
                <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                  {ko ? '클러스터가 아직 없습니다.' : 'No clusters yet.'}
                </p>
              )}
            </div>
            <div className="neural-graph-help">
              <p>{ko ? '클릭: 선택 (우측 패널)' : 'Click: select (panel)'}</p>
              <p>{ko ? '드래그: 노드 이동(자동 핀)' : 'Drag: move node (auto-pin)'}</p>
              <p>{ko ? '휠/팬: 줌·이동' : 'Wheel/pan: zoom·move'}</p>
              <p>{ko ? '물리 OFF: 모든 위치 고정' : 'Physics off: pin all'}</p>
              <p>{ko ? '클러스터 ON: 클러스터 단위' : 'Cluster ON: collapse by cluster'}</p>
            </div>
          </aside>

          <div className="neural-graph-canvas-wrap" ref={wrapRef}>
            <svg
              ref={svgRef}
              width={size.w}
              height={size.h}
              onPointerDown={onBgDown}
              onPointerMove={onBgMove}
              onPointerUp={onBgUp}
              onPointerLeave={onBgUp}
              style={{ display: 'block', cursor: panning ? 'grabbing' : 'grab' }}
            >
              <defs>
                <marker id="ng-arrow" viewBox="0 -5 10 10" refX="14" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,-5L10,0L0,5" fill="var(--text-dim)" />
                </marker>
              </defs>
              <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                {/* Edges + invisible click overlay + edge labels */}
                {links.map((l, i) => {
                  const s = l.source as GNode; const t = l.target as GNode;
                  if (s?.x == null || t?.x == null) return null;
                  // Visual provenance: 'llm' (AI-inferred) = dashed amber; 'supersedes' = dashed default.
                  const isLlm = l.provenance === 'llm';
                  const dashed = l.type === 'supersedes' || isLlm;
                  const mx = (s.x + t.x!) / 2;
                  const my = (s.y! + t.y!) / 2;
                  const tlabel = typeLabel(l.type);
                  const sId = typeof l.source === 'string' ? l.source : (l.source as GNode).id;
                  const tId = typeof l.target === 'string' ? l.target : (l.target as GNode).id;
                  const editable = !collapsed && onUnlinkEdge && !sId.startsWith('cluster:') && !tId.startsWith('cluster:');
                  const isSelectedEdge = selectedEdge && selectedEdge.from === sId && selectedEdge.to === tId;
                  const llmStroke = '#f59e0b'; // amber — distinct from default text-dim
                  return (
                    <g key={i}>
                      <line
                        x1={s.x} y1={s.y!} x2={t.x} y2={t.y!}
                        stroke={isSelectedEdge ? 'var(--accent)' : isLlm ? llmStroke : 'var(--text-dim)'}
                        strokeOpacity={isSelectedEdge ? 0.9 : isLlm ? 0.6 : 0.5}
                        strokeWidth={isSelectedEdge ? 2 : 1.3}
                        strokeDasharray={dashed ? (isLlm ? '5 4' : '4 3') : undefined}
                        markerEnd={l.type ? 'url(#ng-arrow)' : undefined}
                      />
                      {editable && (
                        <line
                          x1={s.x} y1={s.y!} x2={t.x} y2={t.y!}
                          stroke="transparent" strokeWidth={14}
                          style={{ cursor: 'pointer' }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedEdge({ from: sId, to: tId, type: l.type });
                            setSelected(null);
                          }}
                        />
                      )}
                      {tlabel && view.k > 0.55 && (
                        <g
                          transform={`translate(${mx},${my})`}
                          style={{ cursor: editable ? 'pointer' : 'default' }}
                          onPointerDown={editable ? (e) => {
                            e.stopPropagation();
                            setSelectedEdge({ from: sId, to: tId, type: l.type });
                            setSelected(null);
                          } : undefined}
                        >
                          <rect x={-tlabel.length * 3 - 5} y={-7} width={tlabel.length * 6 + 10} height={13} rx={6}
                                fill={isSelectedEdge ? 'var(--accent-muted)' : 'var(--surface)'}
                                stroke={isSelectedEdge ? 'var(--accent)' : 'var(--border)'} strokeWidth={isSelectedEdge ? 1 : 0.7} />
                          <text textAnchor="middle" y={3} fontSize={9}
                                fill={isSelectedEdge ? 'var(--accent)' : 'var(--text-muted)'}
                                fontWeight={isSelectedEdge ? 700 : 400}
                                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            {tlabel}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
                {/* Nodes */}
                {nodes.map((n) => {
                  const dim = !isHit(n);
                  const isSelected = selected?.id === n.id;
                  const ringColor = colorFor(n.clusters[0], palette);
                  const r = nodeRadius(n);
                  return (
                    <g
                      key={n.id}
                      data-graph-node-id={n.id}
                      transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                      style={{ cursor: 'pointer', opacity: dim ? 0.2 : (draftEdge && draftEdge.hoverNode === n.id ? 1 : 1) }}
                      onPointerDown={(e) => onPointerDown(e, n)}
                      onPointerMove={(e) => onPointerMove(e, n)}
                      onPointerUp={(e) => onPointerUp(e, n)}
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover((h) => (h?.id === n.id ? null : h))}
                    >
                      {n.isCluster ? (
                        <>
                          <circle r={r + 4} fill={ringColor} fillOpacity={0.12} stroke={ringColor} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 2" />
                          <circle r={r} fill={ringColor} fillOpacity={0.85} stroke={isSelected ? 'var(--accent)' : ringColor} strokeWidth={isSelected ? 3 : 1.5} />
                          <text textAnchor="middle" y={3} fontSize={10} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            {n.memberIds?.length ?? 0}
                          </text>
                        </>
                      ) : (
                        <>
                          {n.clusters.slice(0, 3).map((c, idx) => (
                            <circle key={idx} r={r + 2 + idx * 2.5} fill="none" stroke={colorFor(c, palette)} strokeWidth={2} strokeOpacity={0.65 - idx * 0.15} />
                          ))}
                          <circle r={r} fill="var(--surface)" stroke={isSelected ? 'var(--accent)' : ringColor} strokeWidth={isSelected ? 2.5 : 1.5} />
                          {draftEdge?.hoverNode === n.id && (
                            <circle r={r + 8} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="3 2" />
                          )}
                          {n.pinned && <circle r={2.5} cx={r - 2} cy={-(r - 2)} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1} />}
                          {n.room !== currentRoom && <circle r={2.5} cx={-(r - 2)} cy={-(r - 2)} fill="var(--draft)" stroke="var(--surface)" strokeWidth={1} />}
                        </>
                      )}
                      {!isSelected && (
                        <text
                          x={r + 4} y={4}
                          fontSize={10}
                          fontWeight={400}
                          fill="var(--text)"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Draft-edge preview (during drag-to-link) — colored by type, label at midpoint */}
                {draftEdge && (() => {
                  const src = nodes.find((n) => n.id === draftEdge.from);
                  if (!src || src.x == null) return null;
                  const sec = RING_SECTIONS.find((s) => s.id === draftEdge.type);
                  const color = sec?.color ?? '#3b9eff';
                  const label = sec ? (ko ? sec.ko : sec.en) : draftEdge.type;
                  const mx = (src.x + draftEdge.toX) / 2;
                  const my = (src.y! + draftEdge.toY) / 2;
                  const labelW = Math.max(48, label.length * 8 + 18);
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      <line
                        x1={src.x} y1={src.y!} x2={draftEdge.toX} y2={draftEdge.toY}
                        stroke={color} strokeWidth={2.5} strokeDasharray="5 3" strokeOpacity={0.9}
                      />
                      <g transform={`translate(${mx},${my})`}>
                        <rect x={-labelW / 2} y={-10} width={labelW} height={20} rx={10}
                              fill={color} fillOpacity={0.95} />
                        <text textAnchor="middle" y={4} fontSize={11} fontWeight={700} fill="#fff">
                          {label}
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* Ring menu around selected real node (delete + 3 edge types, draggable) — hidden on mobile */}
                {!isMobile && selected && !selected.isCluster && selected.x != null && (
                  <RingMenu
                    cx={selected.x}
                    cy={selected.y!}
                    nodeRadius={nodeRadius(selected)}
                    canDelete={!!onDeleteNode && (!currentRoom || selected.room === currentRoom)}
                    canLink={!!onLinkEdge}
                    draftType={draftEdge?.from === selected.id ? draftEdge.type : null}
                    onDelete={handleDeleteSelectedNode}
                    onStartDraft={(type, e) => startEdgeDraft(e, selected.id, type)}
                  />
                )}

                {/* Edge edit menu (delete + change type) — only outside collapsed mode, hidden on mobile */}
                {!isMobile && selectedEdge && !collapsed && (() => {
                  const s = nodes.find((n) => n.id === selectedEdge.from);
                  const t = nodes.find((n) => n.id === selectedEdge.to);
                  if (!s || !t || s.x == null || t.x == null) return null;
                  const cx = (s.x + t.x!) / 2;
                  const cy = (s.y! + t.y!) / 2;
                  return (
                    <EdgeMenu
                      cx={cx} cy={cy}
                      currentType={selectedEdge.type}
                      onPick={handleEdgeMenuPick}
                    />
                  );
                })()}
              </g>
            </svg>

            {/* Hover tooltip — only shown when nothing selected, to avoid overlap */}
            {hover && !selected && hover.x != null && hover.y != null && (
              <div
                className="neural-graph-tip"
                style={{ left: view.x + hover.x * view.k + 16, top: view.y + hover.y * view.k - 8 }}
              >
                <div className="neural-graph-tip-label">{hover.label || hover.id}</div>
                <div className="neural-graph-tip-meta">
                  {hover.isCluster ? (
                    <>{ko ? `클러스터 · ${hover.memberIds?.length ?? 0}개 노드` : `Cluster · ${hover.memberIds?.length ?? 0} nodes`}</>
                  ) : hover.room === currentRoom ? (
                    ko ? '이 챗' : 'this chat'
                  ) : (
                    <><ArrowSquareOut size={9} /> {hover.room}</>
                  )}
                  {hover.source ? ` · ${hover.source}` : ''}
                </div>
              </div>
            )}

            {nodes.length === 0 && (
              <div className="neural-graph-empty">
                <p>{ko ? '아직 노드가 없습니다. 블록을 노드로 만들면 여기 나타납니다.' : 'No nodes yet. Make a block into a node to see it here.'}</p>
              </div>
            )}
            {/* Mobile legend FAB */}
            <button
              className="neural-graph-legend-fab"
              onClick={() => setLegendOpen(o => !o)}
            >
              <Tag size={14} />
              {clusterList.length} {ko ? '클러스터' : 'clusters'}
            </button>
          </div>

          {/* Right detail panel — drag the left edge to resize */}
          {selected && (
            <aside className="neural-graph-detail" style={{ width: panelWidth }}>
              <PanelResizer width={panelWidth} setWidth={setPanelWidth} min={260} max={640} side="left" />
              <div className="neural-graph-detail-header">
                {selected.isCluster ? <Tag size={14} /> : <GraphIcon size={14} weight="bold" />}
                <span className="neural-graph-detail-title">{selected.label}</span>
                <button className="icon-button" onClick={() => setSelected(null)} aria-label="close"><X size={14} /></button>
              </div>

              {selected.isCluster ? (
                <ClusterPanel
                  node={selected}
                  clusterList={clusterList}
                  palette={palette}
                  currentRoom={currentRoom}
                  ko={ko}
                  onPickMember={(id) => selectMember(id)}
                />
              ) : (
                <NodePanel
                  node={selected}
                  graph={graph}
                  clusterList={clusterList}
                  palette={palette}
                  currentRoom={currentRoom}
                  blockText={blockText}
                  blockTextLoading={blockTextLoading}
                  ko={ko}
                  typeLabel={typeLabel}
                  onPickNode={(id) => selectMember(id)}
                  onJump={() => jumpFromPanel(selected)}
                />
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Right panel: node detail ----
function NodePanel({ node, graph, clusterList, palette, currentRoom, blockText, blockTextLoading, ko, typeLabel, onPickNode, onJump }: {
  node: GNode;
  graph: NeuralGraph;
  clusterList: Cluster[];
  palette: Map<string, string>;
  currentRoom: string;
  blockText: string | null;
  blockTextLoading: boolean;
  ko: boolean;
  typeLabel: (id?: string) => string;
  onPickNode: (id: string) => void;
  onJump: () => void;
}) {
  // Edges touching this node
  const myEdges = graph.edges.filter((e) => e.from === node.id || e.to === node.id);
  const otherId = (e: { from: string; to: string }) => (e.from === node.id ? e.to : e.from);
  const nameOf = (id: string) => graph.nodes.find((n) => n.id === id)?.label || id;
  const roomOf = (id: string) => graph.nodes.find((n) => n.id === id)?.room || '';
  return (
    <div className="neural-graph-detail-body">
      <div className="neural-graph-detail-meta">
        <span>{node.room === currentRoom ? (ko ? '이 챗' : 'this chat') : <><ArrowSquareOut size={10} /> {node.room}</>}</span>
        {node.source && <span className={`source-badge source-${node.source}`}>{node.source}</span>}
      </div>

      {node.clusters.length > 0 && (
        <>
          <label className="node-editor-label">{ko ? '클러스터' : 'Clusters'}</label>
          <div className="cluster-chips">
            {node.clusters.map((id) => {
              const c = clusterList.find((x) => x.id === id);
              const col = palette.get(id);
              return (
                <span key={id} className="cluster-chip" style={{ borderColor: col, color: col }}>
                  <Tag size={10} /> {c?.name ?? id}
                </span>
              );
            })}
          </div>
        </>
      )}

      <label className="node-editor-label">{ko ? '본문' : 'Content'}</label>
      <div className="neural-graph-block-text">
        {blockTextLoading ? (
          <span className="text-muted"><Loader2 size={12} className="spin" /> {ko ? '불러오는 중…' : 'Loading…'}</span>
        ) : blockText ? (
          blockText
        ) : (
          <span className="text-muted">{ko ? '본문을 불러올 수 없습니다.' : 'Unable to load content.'}</span>
        )}
      </div>

      {myEdges.length > 0 && (
        <>
          <label className="node-editor-label">{ko ? '연결' : 'Connections'}</label>
          <div className="neural-graph-edge-list">
            {myEdges.map((e, i) => {
              const oid = otherId(e);
              return (
                <button key={`${oid}-${i}`} className="neural-graph-edge-row" onClick={() => onPickNode(oid)}>
                  <ArrowRight size={11} />
                  <span className="neural-graph-edge-label">{nameOf(oid)}</span>
                  {e.type && <span className="link-type-badge">{typeLabel(e.type)}</span>}
                  {roomOf(oid) && roomOf(oid) !== currentRoom && (
                    <span className="link-row-room">{roomOf(oid)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      <button className="btn btn-primary btn-sm neural-graph-jump" onClick={onJump}>
        <ArrowSquareOut size={13} /> {node.room === currentRoom ? (ko ? '이 블록으로 이동' : 'Jump to block') : (ko ? '챗 열기' : 'Open chat')}
      </button>
    </div>
  );
}

// ---- Right panel: cluster detail ----
function ClusterPanel({ node, clusterList, palette, currentRoom, ko, onPickMember }: {
  node: GNode;
  clusterList: Cluster[];
  palette: Map<string, string>;
  currentRoom: string;
  ko: boolean;
  onPickMember: (id: string) => void;
}) {
  const cluster = clusterList.find((c) => c.id === node.clusters[0]);
  const color = palette.get(node.clusters[0]);
  return (
    <div className="neural-graph-detail-body">
      <div className="neural-graph-detail-meta">
        <span className="neural-graph-swatch" style={{ background: color }} />
        <span>{ko ? `${node.memberIds?.length ?? 0}개 노드` : `${node.memberIds?.length ?? 0} nodes`}</span>
      </div>
      {cluster?.desc && <p className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>{cluster.desc}</p>}

      <label className="node-editor-label">{ko ? '소속 노드' : 'Members'}</label>
      <div className="neural-graph-member-list">
        {node.members?.map((m) => (
          <button key={m.id} className="neural-graph-member" onClick={() => onPickMember(m.id)}>
            <GraphIcon size={11} weight="bold" />
            <span className="neural-graph-member-label">{m.label || m.id}</span>
            <span className="neural-graph-member-room">
              {m.room === currentRoom ? (ko ? '이 챗' : 'this chat') : <><ArrowSquareOut size={9} /> {m.room}</>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Render a Phosphor icon inside SVG at (cx, cy) with a transparent overlay
// so it doesn't intercept pointer events on the underlying segment.
function SvgIcon({ Icon, cx, cy, size = 14 }: { Icon: IconFC; cx: number; cy: number; size?: number }) {
  return (
    <foreignObject x={cx - size / 2} y={cy - size / 2} width={size} height={size} style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        <Icon size={size} weight="bold" color="#fff" />
      </div>
    </foreignObject>
  );
}

// Ring menu around a selected node — 4 solid-color donut segments with white icons:
// top=Delete, right=Relates, bottom=Supersedes, left=Supports.
// Edge-type segments are draggable to another node (drag-to-link).
function RingMenu({ cx, cy, nodeRadius: nr, canDelete, canLink, draftType, onDelete, onStartDraft }: {
  cx: number; cy: number; nodeRadius: number;
  canDelete: boolean; canLink: boolean;
  draftType: string | null;
  onDelete: () => void;
  onStartDraft: (type: string, e: React.PointerEvent) => void;
}) {
  const rInner = nr + 10;
  const rOuter = nr + 32;
  const iconR = (rInner + rOuter) / 2;
  return (
    <g style={{ pointerEvents: 'all' }}>
      {RING_SECTIONS.map((sec) => {
        const start = sec.angle - RING_SPAN / 2;
        const end = sec.angle + RING_SPAN / 2;
        const path = arcSegment(cx, cy, rOuter, rInner, start, end);
        const ix = cx + iconR * Math.cos(sec.angle);
        const iy = cy + iconR * Math.sin(sec.angle);
        const isDelete = sec.id === 'delete';
        const enabled = isDelete ? canDelete : canLink;
        const isActive = draftType === sec.id;
        return (
          <g key={sec.id} style={{ opacity: enabled ? 1 : 0.35, cursor: enabled ? (isDelete ? 'pointer' : 'grab') : 'not-allowed' }}>
            <path
              d={path}
              fill={sec.color}
              fillOpacity={isActive ? 1 : 0.78}
              stroke={isActive ? '#fff' : sec.color}
              strokeWidth={isActive ? 1.6 : 0.8}
              onPointerDown={(e) => {
                if (!enabled) return;
                if (isDelete) {
                  e.stopPropagation();
                  onDelete();
                } else {
                  onStartDraft(sec.id, e);
                }
              }}
            />
            <SvgIcon Icon={sec.Icon} cx={ix} cy={iy} size={14} />
          </g>
        );
      })}
    </g>
  );
}

// Edge edit menu — same 4-section ring near the edge midpoint, white icons.
// Click delete to remove, click an edge-type to change relation type. The
// current type's segment is rendered solid as the active indicator.
function EdgeMenu({ cx, cy, currentType, onPick }: {
  cx: number; cy: number; currentType?: string;
  onPick: (typeOrDelete: string) => void;
}) {
  const rInner = 16;
  const rOuter = 38;
  const iconR = (rInner + rOuter) / 2;
  return (
    <g style={{ pointerEvents: 'all' }}>
      <circle cx={cx} cy={cy} r={rInner - 2} fill="var(--surface)" stroke="var(--border)" strokeWidth={1} />
      {RING_SECTIONS.map((sec) => {
        const start = sec.angle - RING_SPAN / 2;
        const end = sec.angle + RING_SPAN / 2;
        const path = arcSegment(cx, cy, rOuter, rInner, start, end);
        const ix = cx + iconR * Math.cos(sec.angle);
        const iy = cy + iconR * Math.sin(sec.angle);
        const isActive = sec.id !== 'delete' && currentType === sec.id;
        return (
          <g key={sec.id} style={{ cursor: 'pointer' }}>
            <path
              d={path}
              fill={sec.color}
              fillOpacity={isActive ? 1 : 0.78}
              stroke={isActive ? '#fff' : sec.color}
              strokeWidth={isActive ? 1.6 : 0.8}
              onPointerDown={(e) => { e.stopPropagation(); onPick(sec.id); }}
            />
            <SvgIcon Icon={sec.Icon} cx={ix} cy={iy} size={13} />
          </g>
        );
      })}
    </g>
  );
}

// Convert client (x, y) to svg-local coords accounting for current transform.
function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number, view: { x: number; y: number; k: number }) {
  const rect = svg.getBoundingClientRect();
  return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
}
