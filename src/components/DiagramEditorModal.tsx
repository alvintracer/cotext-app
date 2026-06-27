import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useViewport,
  addEdge,
  applyNodeChanges,
  ConnectionMode,
  type Connection,
  type Node,
  type NodeChange,
  type NodeProps,
  Handle,
  MarkerType,
  NodeResizer,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  ArrowRight,
  ArrowsHorizontal,
  ArrowsLeftRight,
  ArrowsVertical,
  Code,
  Columns,
  Eye,
  FloppyDisk,
  Minus,
  Plus,
  Rows,
  Stack,
  Trash,
  X,
} from '@phosphor-icons/react';
import {
  DIAGRAM_TEMPLATES,
  DIAGRAM_TYPE_LABELS_EN,
  DIAGRAM_TYPE_LABELS_KO,
  detectMermaidType,
  flowToMermaid,
  mermaidToFlow,
  newNodeId,
  type DiagramEdge,
  type DiagramEdgeData,
  type DiagramNode,
  type DiagramNodeData,
  type Direction,
  type EdgeArrow,
  type EdgeStyle,
  type MermaidDiagramType,
  type NodeShape,
} from '../lib/diagram/mermaid';
import { buildExternalDiagramDraftMarkdown, buildInlineMermaidMarkdown } from '../lib/markdown/cotextDiagrams';
import MermaidBlock from './MermaidBlock';
import SequenceDiagramBuilder from './SequenceDiagramBuilder';

export interface DiagramInsertResult {
  mermaidCode: string;
  markdown: string;
  storage: 'inline' | 'external';
  externalPath?: string;
}

interface Props {
  open: boolean;
  initialCode?: string;
  initialExternalPath?: string;
  language: 'ko' | 'en';
  onClose: () => void;
  onInsert: (result: DiagramInsertResult) => void;
}

type EdgeReconnectState =
  | { edgeId: string; end: 'source' | 'target'; pointerX: number; pointerY: number }
  | null;

type ConnectDragState = null | 'source' | 'target';

const SHAPE_LABELS_KO: Record<NodeShape, string> = {
  rectangle: '사각형',
  rounded: '둥근 상자',
  diamond: '마름모',
  circle: '원',
  group: '그룹',
};

const SHAPE_LABELS_EN: Record<NodeShape, string> = {
  rectangle: 'Rectangle',
  rounded: 'Rounded',
  diamond: 'Diamond',
  circle: 'Circle',
  group: 'Group',
};

const PALETTE_SHAPES: NodeShape[] = ['rectangle', 'rounded', 'diamond', 'circle', 'group'];

const DEFAULT_SIZE: Record<NodeShape, { width: number; height: number }> = {
  rectangle: { width: 140, height: 56 },
  rounded: { width: 140, height: 56 },
  diamond: { width: 110, height: 110 },
  circle: { width: 110, height: 110 },
  group: { width: 320, height: 220 },
};

const EDGE_COLOR = '#4f7cff';

function t(language: 'ko' | 'en', ko: string, en: string) {
  return language === 'ko' ? ko : en;
}

function ShapeNode({ data, selected }: NodeProps<DiagramNode>) {
  const isGroup = data.shape === 'group';
  const cls = `diagram-node diagram-node-${data.shape}${selected ? ' is-selected' : ''}`;
  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={isGroup ? 160 : 60}
        minHeight={isGroup ? 120 : 32}
        lineClassName="diagram-resize-line"
        handleClassName="diagram-resize-handle"
      />
      <div className={cls} style={{ width: '100%', height: '100%' }}>
        <Handle type="source" position={Position.Top} id="t" className="diagram-handle diagram-handle-source diagram-handle-top" isConnectableStart isConnectableEnd={false} />
        <Handle type="target" position={Position.Top} id="t-in" className="diagram-handle diagram-handle-target diagram-handle-top" isConnectableStart={false} isConnectableEnd />
        <Handle type="source" position={Position.Right} id="r" className="diagram-handle diagram-handle-source diagram-handle-right" isConnectableStart isConnectableEnd={false} />
        <Handle type="target" position={Position.Right} id="r-in" className="diagram-handle diagram-handle-target diagram-handle-right" isConnectableStart={false} isConnectableEnd />
        <Handle type="source" position={Position.Bottom} id="b" className="diagram-handle diagram-handle-source diagram-handle-bottom" isConnectableStart isConnectableEnd={false} />
        <Handle type="target" position={Position.Bottom} id="b-in" className="diagram-handle diagram-handle-target diagram-handle-bottom" isConnectableStart={false} isConnectableEnd />
        <Handle type="source" position={Position.Left} id="l" className="diagram-handle diagram-handle-source diagram-handle-left" isConnectableStart isConnectableEnd={false} />
        <Handle type="target" position={Position.Left} id="l-in" className="diagram-handle diagram-handle-target diagram-handle-left" isConnectableStart={false} isConnectableEnd />
        <span className="diagram-node-label">{data.label || (isGroup ? '' : ' ')}</span>
      </div>
    </>
  );
}

const NODE_TYPES = { shape: ShapeNode };

function handleDirection(handleId?: string | null) {
  const key = (handleId || 'b').charAt(0);
  switch (key) {
    case 't': return { x: 0, y: -1 };
    case 'r': return { x: 1, y: 0 };
    case 'l': return { x: -1, y: 0 };
    case 'b':
    default:
      return { x: 0, y: 1 };
  }
}

function handlePoint(node: DiagramNode, handleId: string | null | undefined, allNodes: DiagramNode[]) {
  const abs = absoluteNodePosition(node, allNodes);
  const width = Number(node.style?.width ?? node.data.width ?? DEFAULT_SIZE[node.data.shape].width);
  const height = Number(node.style?.height ?? node.data.height ?? DEFAULT_SIZE[node.data.shape].height);
  const key = (handleId || 'b').charAt(0);
  const centerX = abs.x + width / 2;
  const centerY = abs.y + height / 2;

  if (node.data.shape === 'diamond') {
    switch (key) {
      case 't': return { x: centerX, y: abs.y + height * 0.14 };
      case 'r': return { x: abs.x + width * 0.86, y: centerY };
      case 'l': return { x: abs.x + width * 0.14, y: centerY };
      case 'b':
      default:
        return { x: centerX, y: abs.y + height * 0.86 };
    }
  }

  switch (key) {
    case 't': return { x: centerX, y: abs.y };
    case 'r': return { x: abs.x + width, y: centerY };
    case 'l': return { x: abs.x, y: centerY };
    case 'b':
    default:
      return { x: centerX, y: abs.y + height };
  }
}

function cubicPointAt(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t * t2;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeConnection(connection: Connection): Connection {
  const sourceIsInput = String(connection.sourceHandle || '').endsWith('-in');
  const targetIsInput = String(connection.targetHandle || '').endsWith('-in');
  if (sourceIsInput && !targetIsInput) {
    return {
      ...connection,
      source: connection.target,
      sourceHandle: connection.targetHandle,
      target: connection.source,
      targetHandle: connection.sourceHandle,
    };
  }
  if (sourceIsInput && targetIsInput) {
    return {
      ...connection,
      source: connection.target,
      sourceHandle: String(connection.targetHandle || '').replace(/-in$/, ''),
      target: connection.source,
      targetHandle: connection.sourceHandle,
    };
  }
  if (!sourceIsInput && !targetIsInput) {
    return {
      ...connection,
      sourceHandle: String(connection.sourceHandle || 'b').replace(/-in$/, ''),
      targetHandle: `${String(connection.targetHandle || 'b').replace(/-in$/, '')}-in`,
    };
  }
  return {
    ...connection,
    sourceHandle: String(connection.sourceHandle || 'b').replace(/-in$/, ''),
    targetHandle: `${String(connection.targetHandle || 'b').replace(/-in$/, '')}-in`,
  };
}

function buildEdgePath(edge: DiagramEdge, allNodes: DiagramNode[]) {
  const source = allNodes.find((node) => node.id === edge.source);
  const target = allNodes.find((node) => node.id === edge.target);
  if (!source || !target) return null;

  const sourceHandle = 'sourceHandle' in edge ? String(edge.sourceHandle || 'b') : 'b';
  const targetHandle = 'targetHandle' in edge ? String(edge.targetHandle || 't-in') : 't-in';
  const start = handlePoint(source, sourceHandle, allNodes);
  const end = handlePoint(target, targetHandle, allNodes);
  const startDir = handleDirection(sourceHandle);
  const endDir = handleDirection(targetHandle);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy), 40);
  const offset = Math.min(80, Math.max(28, distance * 0.3));
  const c1x = start.x + startDir.x * offset;
  const c1y = start.y + startDir.y * offset;
  const c2x = end.x + endDir.x * offset;
  const c2y = end.y + endDir.y * offset;
  return {
    start,
    end,
    c1: { x: c1x, y: c1y },
    c2: { x: c2x, y: c2y },
    label: cubicPointAt(start, { x: c1x, y: c1y }, { x: c2x, y: c2y }, end, 0.5),
  };
}

function edgeVisualProps(arrow: EdgeArrow = 'forward', style: EdgeStyle = 'solid') {
  const markerStart = arrow === 'backward' || arrow === 'both'
    ? { type: MarkerType.ArrowClosed, width: 18, height: 18, color: EDGE_COLOR }
    : undefined;
  const markerEnd = arrow === 'forward' || arrow === 'both'
    ? { type: MarkerType.ArrowClosed, width: 18, height: 18, color: EDGE_COLOR }
    : undefined;

  return {
    markerStart,
    markerEnd,
    style: {
      strokeWidth: 2,
      stroke: EDGE_COLOR,
      strokeDasharray: style === 'dashed' ? '6 4' : undefined,
    },
  };
}

function absoluteNodePosition(node: DiagramNode, allNodes: DiagramNode[]): { x: number; y: number } {
  if (!node.parentId) return node.position;
  const parent = allNodes.find((candidate) => candidate.id === node.parentId);
  if (!parent) return node.position;
  const parentAbs = absoluteNodePosition(parent, allNodes);
  return {
    x: parentAbs.x + node.position.x,
    y: parentAbs.y + node.position.y,
  };
}

function pointInsideGroup(x: number, y: number, group: DiagramNode, allNodes: DiagramNode[]) {
  const abs = absoluteNodePosition(group, allNodes);
  const width = Number(group.style?.width ?? group.data.width ?? DEFAULT_SIZE.group.width);
  const height = Number(group.style?.height ?? group.data.height ?? DEFAULT_SIZE.group.height);
  return x >= abs.x && x <= abs.x + width && y >= abs.y && y <= abs.y + height;
}

export default function DiagramEditorModal(props: Props) {
  if (!props.open) return null;
  return (
    <ReactFlowProvider>
      <DiagramEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function DiagramEditorInner({ open, initialCode, initialExternalPath, language, onClose, onInsert }: Props) {
  const ko = language === 'ko';
  const shapeLabels = ko ? SHAPE_LABELS_KO : SHAPE_LABELS_EN;
  const viewport = useViewport();
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [direction, setDirection] = useState<Direction>('TD');
  const [showCode, setShowCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState('');
  const [diagramType, setDiagramType] = useState<MermaidDiagramType>('flowchart');
  const [previewLayout, setPreviewLayout] = useState<'split' | 'wide'>('split');
  const [storageMode, setStorageMode] = useState<'inline' | 'external'>('inline');
  const [externalPath, setExternalPath] = useState('.cotext/diagrams/diagram.mmd');
  const [labelEditTarget, setLabelEditTarget] = useState<{ kind: 'node' | 'edge'; id: string; label: string } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<EdgeReconnectState>(null);
  const [connectDrag, setConnectDrag] = useState<ConnectDragState>(null);

  const clientToCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const detected = detectMermaidType(initialCode ?? '');
    const effectiveType: MermaidDiagramType = detected === 'unknown' ? 'flowchart' : detected;
    setDiagramType(effectiveType);

    if (initialCode?.trim() && effectiveType === 'flowchart') {
      const parsed = mermaidToFlow(initialCode);
      setNodes(parsed.nodes);
      setEdges(parsed.edges.map((edge) => ({
        ...edge,
        type: 'diagram',
        ...edgeVisualProps(edge.data?.arrow, edge.data?.style),
      })));
      setDirection(parsed.direction);
    } else {
      setNodes([]);
      setEdges([]);
      setDirection('TD');
    }

    const bigDiagram = (initialCode?.length ?? 0) > 300;
    const seededPath = initialExternalPath || `.cotext/diagrams/diagram-${Date.now().toString(36)}.mmd`;
    setStorageMode(initialExternalPath || bigDiagram ? 'external' : 'inline');
    setExternalPath(seededPath);
    setCodeDraft(initialCode?.trim() || '');
    setShowCode(false);
    setLabelEditTarget(null);
    setSelectedEdgeId(null);
    setCodeError(null);
    setReconnecting(null);
    setConnectDrag(null);
  }, [open, initialCode, initialExternalPath]);

  const isCanvasMode = diagramType === 'flowchart';
  const typeLabels = ko ? DIAGRAM_TYPE_LABELS_KO : DIAGRAM_TYPE_LABELS_EN;
  const HORIZONTAL_TYPES: MermaidDiagramType[] = ['gantt', 'journey', 'mindmap'];

  // Auto-set preview layout when type changes — horizontal-shaped diagrams get
  // the wide layout (preview spans full width below) by default.
  useEffect(() => {
    setPreviewLayout(HORIZONTAL_TYPES.includes(diagramType) ? 'wide' : 'split');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramType]);

  const switchDiagramType = useCallback((nextType: MermaidDiagramType) => {
    if (nextType === diagramType) return;
    const hasContent = nodes.length > 0 || edges.length > 0 || codeDraft.trim().length > 0;
    if (hasContent) {
      const confirmed = window.confirm(t(
        language,
        '다이어그램 유형을 바꾸면 기존 내용은 새 보일러플레이트로 대체됩니다. 진행할까요?',
        'Switching diagram type will replace the existing content with a starter template. Continue?',
      ));
      if (!confirmed) return;
    }
    const template = DIAGRAM_TEMPLATES[nextType] || '';
    setDiagramType(nextType);
    setCodeDraft(template);
    setCodeError(null);
    setSelectedEdgeId(null);
    if (nextType === 'flowchart') {
      const parsed = mermaidToFlow(template);
      setNodes(parsed.nodes);
      setEdges(parsed.edges.map((edge) => ({
        ...edge,
        type: 'diagram',
        ...edgeVisualProps(edge.data?.arrow, edge.data?.style),
      })));
      setDirection(parsed.direction);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [codeDraft, diagramType, edges.length, language, nodes.length]);

  const appendCodeSnippet = useCallback((snippet: string) => {
    setCodeDraft((current) => {
      const trimmed = current.replace(/\s+$/, '');
      const block = snippet.startsWith('\n') ? snippet : `\n${snippet}`;
      return `${trimmed}${block.replace(/\n$/, '')}\n`;
    });
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current) as DiagramNode[];
      return next.map((node) => {
        const change = changes.find((candidate) => candidate.type === 'dimensions' && candidate.id === node.id) as
          | (NodeChange & { dimensions?: { width: number; height: number } })
          | undefined;
        if (!change?.dimensions) return node;
        return {
          ...node,
          data: {
            ...node.data,
            width: change.dimensions.width,
            height: change.dimensions.height,
          },
          style: {
            ...node.style,
            width: change.dimensions.width,
            height: change.dimensions.height,
          },
        };
      });
    });
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    const normalized = normalizeConnection(connection);
    if (!normalized.source || !normalized.target) return;
    const fresh: DiagramEdge = {
      ...normalized,
      id: `e_${normalized.source}_${normalized.target}_${Date.now().toString(36)}`,
      data: { arrow: 'forward', style: 'solid' },
      ...edgeVisualProps('forward', 'solid'),
    } as DiagramEdge;
    setEdges((current) => addEdge(fresh, current) as DiagramEdge[]);
    setSelectedEdgeId(fresh.id);
  }, []);

  const isValidConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return false;
    const sourceHandle = String(connection.sourceHandle || '');
    const targetHandle = String(connection.targetHandle || '');
    return !sourceHandle.endsWith('-in') && targetHandle.endsWith('-in');
  }, []);

  const addShape = useCallback((shape: NodeShape) => {
    const id = newNodeId();
    const size = DEFAULT_SIZE[shape];
    const rootCount = nodes.filter((node) => !node.parentId).length;
    const x = 80 + (rootCount % 4) * 200;
    const y = 60 + Math.floor(rootCount / 4) * 160;
    const fresh: DiagramNode = {
      id,
      type: 'shape',
      position: { x, y },
      data: {
        label: shapeLabels[shape],
        shape,
        width: size.width,
        height: size.height,
      } as DiagramNodeData,
      style: { width: size.width, height: size.height },
    };
    setNodes((current) => [...current, fresh]);
    setLabelEditTarget({ kind: 'node', id, label: fresh.data.label });
  }, [nodes, shapeLabels]);

  const deleteSelected = useCallback(() => {
    setNodes((current) => current.filter((node) => !node.selected));
    setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  }, [selectedEdgeId]);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const data = node.data as DiagramNodeData;
    setLabelEditTarget({ kind: 'node', id: node.id, label: data.label });
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: DiagramEdge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: DiagramEdge) => {
    setSelectedEdgeId(edge.id);
    setLabelEditTarget({ kind: 'edge', id: edge.id, label: String(edge.data?.label ?? '') });
  }, []);

  const onPaneClick = useCallback(() => {
    if (reconnecting) return;
    setSelectedEdgeId(null);
  }, [reconnecting]);

  const patchEdge = useCallback((id: string, patch: Partial<DiagramEdgeData>) => {
    setEdges((current) => current.map((edge) => {
      if (edge.id !== id) return edge;
      const data = { ...(edge.data || {}), ...patch } as DiagramEdgeData;
      return {
        ...edge,
        label: data.label,
        data,
        ...edgeVisualProps(data.arrow, data.style),
      };
    }));
  }, []);

  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) : undefined;

  const screenHandleCandidates = useMemo(() => {
    const sourceIds = ['t', 'r', 'b', 'l'];
    const targetIds = ['t-in', 'r-in', 'b-in', 'l-in'];
    return nodes.flatMap((node) => ([
      ...sourceIds.map((handleId) => {
        const p = handlePoint(node, handleId, nodes);
        return {
          nodeId: node.id,
          handleId,
          kind: 'source' as const,
          x: p.x * viewport.zoom + viewport.x,
          y: p.y * viewport.zoom + viewport.y,
        };
      }),
      ...targetIds.map((handleId) => {
        const p = handlePoint(node, handleId, nodes);
        return {
          nodeId: node.id,
          handleId,
          kind: 'target' as const,
          x: p.x * viewport.zoom + viewport.x,
          y: p.y * viewport.zoom + viewport.y,
        };
      }),
    ]));
  }, [nodes, viewport]);

  useEffect(() => {
    if (!reconnecting) return;

    const onMove = (event: MouseEvent) => {
      const point = clientToCanvasPoint(event.clientX, event.clientY);
      setReconnecting((current) => (
        current
          ? { ...current, pointerX: point.x, pointerY: point.y }
          : null
      ));
    };

    const onUp = (event: MouseEvent) => {
      const dropPoint = clientToCanvasPoint(event.clientX, event.clientY);
      setReconnecting((current) => {
        if (!current) return null;
        const match = screenHandleCandidates
          .filter((candidate) => current.end === 'source' ? candidate.kind === 'source' : candidate.kind === 'target')
          .map((candidate) => ({ ...candidate, d: distance(candidate, dropPoint) }))
          .sort((a, b) => a.d - b.d)[0];

        if (match && match.d <= 28) {
          setEdges((edgesCurrent) => edgesCurrent.map((edge) => {
            if (edge.id !== current.edgeId) return edge;
            return current.end === 'source'
              ? { ...edge, source: match.nodeId, sourceHandle: match.handleId }
              : { ...edge, target: match.nodeId, targetHandle: match.handleId };
          }));
        }
        return null;
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [clientToCanvasPoint, reconnecting, screenHandleCandidates]);

  const onConnectStart = useCallback((_: unknown, params: { handleType?: 'source' | 'target' | null }) => {
    setConnectDrag(params.handleType ?? null);
  }, []);

  const onConnectEnd = useCallback(() => {
    setConnectDrag(null);
  }, []);

  const commitLabel = useCallback(() => {
    if (!labelEditTarget) return;
    if (labelEditTarget.kind === 'node') {
      setNodes((current) => current.map((node) => (
        node.id === labelEditTarget.id
          ? { ...node, data: { ...node.data, label: labelEditTarget.label } as DiagramNodeData }
          : node
      )));
    } else {
      patchEdge(labelEditTarget.id, { label: labelEditTarget.label });
    }
    setLabelEditTarget(null);
  }, [labelEditTarget, patchEdge]);

  const canvasMermaidCode = useMemo(() => flowToMermaid(nodes, edges, direction), [nodes, edges, direction]);

  useEffect(() => {
    if (!isCanvasMode) return;
    setCodeDraft(canvasMermaidCode.trim());
  }, [canvasMermaidCode, isCanvasMode]);

  const finalMermaidCode = isCanvasMode ? canvasMermaidCode.trim() : codeDraft.trim();

  const applyCodeDraft = useCallback(() => {
    if (!codeDraft.trim()) return;
    try {
      const parsed = mermaidToFlow(codeDraft);
      if (parsed.nodes.length === 0 && parsed.edges.length === 0) {
        setCodeError(t(
          language,
          'Mermaid 코드를 읽지 못했습니다. `graph TD` 또는 `flowchart LR` 헤더와 노드/엣지 문법을 확인해 주세요.',
          'Could not parse that Mermaid block. Check the header like `graph TD` or `flowchart LR`, then verify node and edge syntax.',
        ));
        return;
      }
      setNodes(parsed.nodes);
      setEdges(parsed.edges.map((edge) => ({
        ...edge,
        type: 'diagram',
        ...edgeVisualProps(edge.data?.arrow, edge.data?.style),
      })));
      setDirection(parsed.direction);
      setSelectedEdgeId(null);
      setCodeError(null);
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : t(language, 'Mermaid 적용 중 오류가 발생했습니다.', 'Failed to apply Mermaid code.'));
    }
  }, [codeDraft, language]);

  const onNodeDragStop = useCallback((_: unknown, dragged: Node) => {
    setNodes((current) => {
      const groups = current.filter((node) => node.data.shape === 'group' && node.id !== dragged.id);
      const self = current.find((node) => node.id === dragged.id) as DiagramNode | undefined;
      if (!self) return current;

      const width = Number(self.style?.width ?? self.data.width ?? DEFAULT_SIZE[self.data.shape].width);
      const height = Number(self.style?.height ?? self.data.height ?? DEFAULT_SIZE[self.data.shape].height);
      const abs = absoluteNodePosition(self, current);
      const centerX = abs.x + width / 2;
      const centerY = abs.y + height / 2;

      const nextParent = groups.find((group) => pointInsideGroup(centerX, centerY, group, current));
      return current.map((node) => {
        if (node.id !== dragged.id) return node;
        if (nextParent) {
          const parentAbs = absoluteNodePosition(nextParent, current);
          return {
            ...node,
            parentId: nextParent.id,
            extent: 'parent',
            position: {
              x: abs.x - parentAbs.x,
              y: abs.y - parentAbs.y,
            },
          };
        }
        return {
          ...node,
          parentId: undefined,
          extent: undefined,
          position: abs,
        };
      });
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && labelEditTarget) {
        event.preventDefault();
        setLabelEditTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [labelEditTarget]);

  return (
    <div className="modal-overlay diagram-modal-overlay" onClick={onClose}>
      <div className="modal-content diagram-modal" onClick={(event) => event.stopPropagation()}>
        <div className="diagram-modal-header">
          <h3>{t(language, '도식도', 'Diagram')}</h3>
          <div className="diagram-modal-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="diagram-modal-toolbar">
          <div className="diagram-toolbar-group">
            <label className="diagram-toolbar-label" style={{ marginRight: 4 }}>
              {t(language, '유형', 'Type')}
            </label>
            <select
              className="diagram-type-select"
              value={diagramType}
              onChange={(event) => switchDiagramType(event.target.value as MermaidDiagramType)}
            >
              {(Object.keys(typeLabels) as MermaidDiagramType[])
                .filter((type) => type !== 'unknown')
                .map((type) => (
                  <option key={type} value={type}>{typeLabels[type]}</option>
                ))}
            </select>
            {!isCanvasMode && (
              <span className="diagram-direction-hint">
                {t(language, '코드 + 미리보기 모드', 'Code + preview mode')}
              </span>
            )}
          </div>

          {!isCanvasMode && (
            <div className="diagram-toolbar-group">
              <button
                className={`diagram-toolbar-btn ${previewLayout === 'split' ? 'is-active' : ''}`}
                onClick={() => setPreviewLayout('split')}
                title={t(language, '미리보기를 우측 컬럼으로', 'Preview as right column')}
              >
                <Columns size={14} /> {t(language, '세로 미리보기', 'Side preview')}
              </button>
              <button
                className={`diagram-toolbar-btn ${previewLayout === 'wide' ? 'is-active' : ''}`}
                onClick={() => setPreviewLayout('wide')}
                title={t(language, '미리보기를 하단 가로로 (간트/마인드맵 추천)', 'Preview as wide bottom row (recommended for gantt / mindmap)')}
              >
                <Rows size={14} /> {t(language, '가로 미리보기', 'Wide preview')}
              </button>
            </div>
          )}

          {isCanvasMode && (
            <>
              <div className="diagram-toolbar-group">
                {PALETTE_SHAPES.map((shape) => (
                  <button
                    key={shape}
                    className="diagram-toolbar-btn"
                    onClick={() => addShape(shape)}
                    title={shapeLabels[shape]}
                  >
                    {shape === 'group'
                      ? <Stack size={14} />
                      : <span className={`diagram-shape-preview diagram-shape-preview-${shape}`} />}
                    <span className="diagram-toolbar-label">{shapeLabels[shape]}</span>
                  </button>
                ))}
              </div>
              <div className="diagram-toolbar-group">
                <button className={`diagram-toolbar-btn ${direction === 'TD' ? 'is-active' : ''}`} onClick={() => setDirection('TD')}>
                  <ArrowsVertical size={14} /> TD
                </button>
                <button className={`diagram-toolbar-btn ${direction === 'LR' ? 'is-active' : ''}`} onClick={() => setDirection('LR')}>
                  <ArrowsHorizontal size={14} /> LR
                </button>
                <span className="diagram-direction-hint">
                  {direction === 'TD'
                    ? t(language, 'TD: 위에서 아래로 읽히는 배치', 'TD: top-to-bottom layout')
                    : t(language, 'LR: 왼쪽에서 오른쪽으로 읽히는 배치', 'LR: left-to-right layout')}
                </span>
              </div>
            </>
          )}

          {isCanvasMode && (
            <div className="diagram-toolbar-group">
              <button
                className={`diagram-toolbar-btn diagram-toolbar-btn-code ${showCode ? 'is-active' : ''}`}
                onClick={() => setShowCode((value) => !value)}
              >
                {showCode ? <Eye size={14} /> : <Code size={14} />}
                <span>{showCode ? t(language, '코드 패널 닫기', 'Hide code panel') : t(language, 'Mermaid 붙여넣기', 'Paste Mermaid')}</span>
              </button>
            </div>
          )}

          {isCanvasMode && (
            <div className="diagram-toolbar-group diagram-toolbar-group-end">
              <button
                className="diagram-toolbar-btn"
                onClick={deleteSelected}
                disabled={!nodes.some((node) => node.selected) && !edges.some((edge) => edge.selected)}
              >
                <Trash size={14} /> {t(language, '삭제', 'Delete')}
              </button>
            </div>
          )}
        </div>

        <div className="diagram-modal-body">
          {!isCanvasMode && (
            <div className={`diagram-code-only ${previewLayout === 'wide' ? 'is-wide' : ''}`}>
              <div className="diagram-code-only-left">
                {diagramType === 'sequence' ? (
                  <SequenceDiagramBuilder language={language} onInsert={appendCodeSnippet} />
                ) : (
                  <div className="diagram-code-only-tips">
                    <h4>{typeLabels[diagramType]} {t(language, '편집 팁', 'editing tips')}</h4>
                    <p>
                      {t(
                        language,
                        '이 유형은 비주얼 캔버스 대신 Mermaid 코드와 즉시 미리보기로 편집합니다. 우측 코드 패널을 수정하면 실시간으로 도식이 갱신됩니다.',
                        'This type is edited via Mermaid code + live preview instead of a canvas. Edits to the right pane update the diagram in real time.',
                      )}
                    </p>
                    <p className="diagram-code-only-hint">
                      {t(
                        language,
                        '보일러플레이트가 자동 삽입되어 있습니다. 외부 mermaid 코드를 그대로 붙여넣어도 됩니다.',
                        'A starter template has been inserted. You can also paste any Mermaid code directly.',
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div className="diagram-code-only-center">
                <label className="diagram-code-only-label">{t(language, 'Mermaid 코드', 'Mermaid code')}</label>
                <textarea
                  className="diagram-code-input"
                  value={codeDraft}
                  onChange={(event) => setCodeDraft(event.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="diagram-code-only-right">
                <label className="diagram-code-only-label">{t(language, '미리보기', 'Preview')}</label>
                <div className="diagram-code-only-preview">
                  {codeDraft.trim() ? (
                    <MermaidBlock code={codeDraft} />
                  ) : (
                    <p className="diagram-code-only-empty">
                      {t(language, '코드를 입력하면 미리보기가 표시됩니다.', 'Preview appears once you enter code.')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {isCanvasMode && (
          <>
          <div
            className={[
              'diagram-canvas',
              reconnecting ? 'is-reconnecting' : '',
              reconnecting?.end === 'source' ? 'is-reconnecting-source' : '',
              reconnecting?.end === 'target' ? 'is-reconnecting-target' : '',
              connectDrag ? 'is-connecting' : '',
              connectDrag === 'source' ? 'is-connecting-from-source' : '',
              connectDrag === 'target' ? 'is-connecting-from-target' : '',
            ].filter(Boolean).join(' ')}
            ref={canvasRef}
          >
            <ReactFlow
              nodes={nodes}
              edges={[]}
              onNodesChange={onNodesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeDragStop={onNodeDragStop}
              onPaneClick={onPaneClick}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              deleteKeyCode={['Backspace', 'Delete']}
              connectionMode={ConnectionMode.Strict}
              isValidConnection={isValidConnection}
            >
              <Background gap={16} size={1} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>

            <svg className="diagram-edge-layer" aria-hidden="true">
              <defs>
                <marker id="diagram-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR} />
                </marker>
                <marker id="diagram-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 10 0 L 0 5 L 10 10 z" fill={EDGE_COLOR} />
                </marker>
              </defs>
              {edges.map((edge) => {
                const path = buildEdgePath(edge, nodes);
                if (!path) return null;
                const arrow = edge.data?.arrow ?? 'forward';
                const isSelected = edge.id === selectedEdgeId;
                const startX = path.start.x * viewport.zoom + viewport.x;
                const startY = path.start.y * viewport.zoom + viewport.y;
                const endX = path.end.x * viewport.zoom + viewport.x;
                const endY = path.end.y * viewport.zoom + viewport.y;
                const c1x = path.c1.x * viewport.zoom + viewport.x;
                const c1y = path.c1.y * viewport.zoom + viewport.y;
                const c2x = path.c2.x * viewport.zoom + viewport.x;
                const c2y = path.c2.y * viewport.zoom + viewport.y;
                const labelX = path.label.x * viewport.zoom + viewport.x;
                const labelY = path.label.y * viewport.zoom + viewport.y;
                const isReconnectingSource = reconnecting?.edgeId === edge.id && reconnecting.end === 'source';
                const isReconnectingTarget = reconnecting?.edgeId === edge.id && reconnecting.end === 'target';
                const dragStartX = isReconnectingSource ? reconnecting.pointerX : startX;
                const dragStartY = isReconnectingSource ? reconnecting.pointerY : startY;
                const dragEndX = isReconnectingTarget ? reconnecting.pointerX : endX;
                const dragEndY = isReconnectingTarget ? reconnecting.pointerY : endY;
                return (
                  <g key={edge.id}>
                    <path
                      d={`M ${dragStartX} ${dragStartY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${dragEndX} ${dragEndY}`}
                      className="diagram-edge-hit"
                      style={{ strokeDasharray: edge.data?.style === 'dashed' ? '6 4' : undefined }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdgeClick(event as unknown as React.MouseEvent, edge);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        onEdgeDoubleClick(event as unknown as React.MouseEvent, edge);
                      }}
                    />
                    <path
                      d={`M ${dragStartX} ${dragStartY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${dragEndX} ${dragEndY}`}
                      className={`diagram-edge-path${isSelected ? ' is-selected' : ''}`}
                      style={{ strokeDasharray: edge.data?.style === 'dashed' ? '6 4' : undefined }}
                      markerStart={arrow === 'backward' || arrow === 'both' ? 'url(#diagram-arrow-start)' : undefined}
                      markerEnd={arrow === 'forward' || arrow === 'both' ? 'url(#diagram-arrow-end)' : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdgeClick(event as unknown as React.MouseEvent, edge);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        onEdgeDoubleClick(event as unknown as React.MouseEvent, edge);
                      }}
                    />
                    {edge.data?.label ? (
                      <foreignObject x={labelX - 70} y={labelY - 14} width="140" height="28" pointerEvents="none">
                        <div className={`diagram-edge-label${isSelected ? ' is-selected' : ''}`}>
                          {String(edge.data.label)}
                        </div>
                      </foreignObject>
                    ) : null}
                    {isSelected ? (
                      <>
                        <circle
                          cx={startX}
                          cy={startY}
                          r={8}
                          className="diagram-edge-endpoint"
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            const point = clientToCanvasPoint(event.clientX, event.clientY);
                            setReconnecting({ edgeId: edge.id, end: 'source', pointerX: point.x, pointerY: point.y });
                          }}
                        />
                        <circle
                          cx={endX}
                          cy={endY}
                          r={8}
                          className="diagram-edge-endpoint"
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            const point = clientToCanvasPoint(event.clientX, event.clientY);
                            setReconnecting({ edgeId: edge.id, end: 'target', pointerX: point.x, pointerY: point.y });
                          }}
                        />
                      </>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {nodes.length === 0 && (
              <div className="diagram-canvas-empty">
                <Plus size={32} weight="bold" />
                <p>{t(language, '위 툴바에서 도형을 추가해 보세요.', 'Add a shape from the toolbar above.')}</p>
              </div>
            )}

            {selectedEdge ? (
              <div className="diagram-edge-inspector" onClick={(event) => event.stopPropagation()}>
                <div className="diagram-edge-inspector-row">
                  <span className="diagram-edge-inspector-label">{t(language, '화살표', 'Arrow')}</span>
                  <div className="diagram-edge-inspector-group">
                    <button className={`diagram-edge-btn ${(selectedEdge.data?.arrow ?? 'forward') === 'forward' ? 'is-active' : ''}`} onClick={() => patchEdge(selectedEdge.id, { arrow: 'forward' })}>
                      <ArrowRight size={14} />
                      <span>{t(language, '단방향', 'Forward')}</span>
                    </button>
                    <button className={`diagram-edge-btn ${selectedEdge.data?.arrow === 'backward' ? 'is-active' : ''}`} onClick={() => patchEdge(selectedEdge.id, { arrow: 'backward' })}>
                      <ArrowLeft size={14} />
                      <span>{t(language, '역방향', 'Backward')}</span>
                    </button>
                    <button className={`diagram-edge-btn ${selectedEdge.data?.arrow === 'both' ? 'is-active' : ''}`} onClick={() => patchEdge(selectedEdge.id, { arrow: 'both' })}>
                      <ArrowsLeftRight size={14} />
                      <span>{t(language, '양방향', 'Both')}</span>
                    </button>
                    <button className={`diagram-edge-btn ${selectedEdge.data?.arrow === 'none' ? 'is-active' : ''}`} onClick={() => patchEdge(selectedEdge.id, { arrow: 'none' })}>
                      <Minus size={14} />
                      <span>{t(language, '선만', 'None')}</span>
                    </button>
                  </div>
                </div>
                <div className="diagram-edge-inspector-row">
                  <span className="diagram-edge-inspector-label">{t(language, '스타일', 'Style')}</span>
                  <div className="diagram-edge-inspector-group">
                    <button className={`diagram-edge-btn ${(selectedEdge.data?.style ?? 'solid') === 'solid' ? 'is-active' : ''}`} onClick={() => patchEdge(selectedEdge.id, { style: 'solid' })}>
                      <span className="diagram-edge-style-preview diagram-edge-style-solid" />
                      <span>{t(language, '실선', 'Solid')}</span>
                    </button>
                    <button className={`diagram-edge-btn ${selectedEdge.data?.style === 'dashed' ? 'is-active' : ''}`} onClick={() => patchEdge(selectedEdge.id, { style: 'dashed' })}>
                      <span className="diagram-edge-style-preview diagram-edge-style-dashed" />
                      <span>{t(language, '점선', 'Dashed')}</span>
                    </button>
                  </div>
                </div>
                <div className="diagram-edge-inspector-row">
                  <span className="diagram-edge-inspector-label">{t(language, '라벨', 'Label')}</span>
                  <input
                    className="diagram-edge-inspector-input"
                    value={String(selectedEdge.data?.label ?? '')}
                    onChange={(event) => patchEdge(selectedEdge.id, { label: event.target.value })}
                    placeholder={t(language, '엣지 라벨', 'Edge label')}
                  />
                </div>
              </div>
            ) : (
              <div className="diagram-edge-inspector is-empty">
                {t(language, '엣지를 연결하거나 클릭하면 여기서 화살표, 점선, 라벨을 바꿀 수 있습니다.', 'Connect or click an edge to edit arrow direction, dashed style, and label here.')}
              </div>
            )}
          </div>

          {showCode && (
            <div className="diagram-code-pane">
              <label>{t(language, 'Mermaid 코드 붙여넣기 / 확인', 'Paste Mermaid / inspect code')}</label>
              <textarea
                className="diagram-code-input"
                value={codeDraft}
                onChange={(event) => {
                  setCodeDraft(event.target.value);
                  if (codeError) setCodeError(null);
                }}
                placeholder={t(
                  language,
                  '여기에 Mermaid 코드를 그대로 붙여넣고 "코드 적용"을 누르면 캔버스로 가져옵니다.',
                  'Paste Mermaid code here, then click "Apply code" to load it into the canvas.',
                )}
              />
              <div className="diagram-code-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setCodeDraft(canvasMermaidCode.trim())} disabled={!isCanvasMode}>
                  {t(language, '캔버스 코드로 되돌리기', 'Reset to canvas')}
                </button>
                <button className="btn btn-primary btn-sm" onClick={applyCodeDraft} disabled={!codeDraft.trim()}>
                  {t(language, '코드 적용', 'Apply code')}
                </button>
              </div>
              {codeError && <p className="diagram-code-error">{codeError}</p>}
              <p className="diagram-code-hint">
                {t(
                  language,
                  '예: `graph TD`, `flowchart LR`, `A[Start] --> B{Check}` 같은 기본 Mermaid flowchart 문법을 바로 붙여넣을 수 있습니다.',
                  'Examples: `graph TD`, `flowchart LR`, or `A[Start] --> B{Check}` style Mermaid flowchart syntax.',
                )}
              </p>
            </div>
          )}
          </>
          )}
        </div>

        {labelEditTarget && (
          <div className="diagram-label-editor">
            <span>{labelEditTarget.kind === 'node' ? t(language, '도형 라벨', 'Shape label') : t(language, '엣지 라벨', 'Edge label')}</span>
            <input
              autoFocus
              value={labelEditTarget.label}
              onChange={(event) => setLabelEditTarget({ ...labelEditTarget, label: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitLabel();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setLabelEditTarget(null);
                }
              }}
              placeholder={t(language, '라벨 입력 후 Enter', 'Type a label then press Enter')}
            />
            <button className="btn btn-primary btn-xs" onClick={commitLabel}>OK</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setLabelEditTarget(null)}>
              {t(language, '취소', 'Cancel')}
            </button>
          </div>
        )}

        <div className="diagram-modal-footer">
          <span className="diagram-modal-stats">
            {isCanvasMode
              ? `${nodes.length} ${t(language, '도형', 'shapes')} / ${edges.length} ${t(language, '엣지', 'edges')}`
              : `${typeLabels[diagramType]} · ${codeDraft.length} ${t(language, '자', 'chars')}`}
          </span>
          <div className="diagram-storage-panel">
            <label className="diagram-storage-toggle">
              <input
                type="checkbox"
                checked={storageMode === 'external'}
                onChange={(event) => setStorageMode(event.target.checked ? 'external' : 'inline')}
              />
              <span>{t(language, '외부 .mmd 파일로 저장', 'Store as external .mmd file')}</span>
            </label>
            {storageMode === 'external' && (
              <input
                className="diagram-edge-inspector-input"
                value={externalPath}
                onChange={(event) => setExternalPath(event.target.value)}
                placeholder=".cotext/diagrams/diagram-name.mmd"
              />
            )}
          </div>
          <div className="diagram-modal-footer-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              {t(language, '취소', 'Cancel')}
            </button>
            <button
              className="btn btn-primary"
              disabled={!finalMermaidCode || (storageMode === 'external' && !externalPath.trim())}
              onClick={() => {
                const code = finalMermaidCode;
                if (!code) return;
                onInsert({
                  mermaidCode: code,
                  storage: storageMode,
                  externalPath: storageMode === 'external' ? externalPath.trim() : undefined,
                  markdown: storageMode === 'external'
                    ? buildExternalDiagramDraftMarkdown(externalPath.trim(), code)
                    : buildInlineMermaidMarkdown(code),
                });
              }}
            >
              <FloppyDisk size={14} />
              {t(language, '문서에 삽입', 'Insert into document')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
