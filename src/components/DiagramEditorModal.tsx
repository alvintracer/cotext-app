/**
 * DiagramEditorModal — draw.io-style flowchart canvas that emits Mermaid.
 *
 * UX (per spec):
 *   - 4 node shapes (rectangle / rounded / diamond / circle)
 *   - drag to connect (React Flow native)
 *   - double-click node = edit label
 *   - single-click edge = edit label
 *   - TD/LR direction toggle
 *   - "코드 보기" toggle: raw mermaid pane on the right for power users
 *   - "삽입" closes the modal and emits the final mermaid string upstream
 *
 * Storage decision (Q1): only the mermaid string is persisted; positions are
 * re-laid-out by Dagre on next render. The visual editor uses positions just
 * for the editing session.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type EdgeChange, type NodeChange, type Node, type NodeProps,
  Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, Plus, Code, Eye, ArrowsHorizontal, ArrowsVertical, Trash, FloppyDisk } from '@phosphor-icons/react';
import {
  flowToMermaid, mermaidToFlow, newNodeId,
  type DiagramNode, type DiagramEdge, type NodeShape, type Direction, type DiagramNodeData,
} from '../lib/diagram/mermaid';

interface Props {
  open: boolean;
  /** Existing mermaid code to edit. If undefined → blank canvas. */
  initialCode?: string;
  language: 'ko' | 'en';
  onClose: () => void;
  onInsert: (mermaidCode: string) => void;
}

const SHAPE_LABELS_KO: Record<NodeShape, string> = {
  rectangle: '사각형',
  rounded: '둥근',
  diamond: '마름모',
  circle: '원',
};
const SHAPE_LABELS_EN: Record<NodeShape, string> = {
  rectangle: 'Rectangle',
  rounded: 'Rounded',
  diamond: 'Diamond',
  circle: 'Circle',
};

/** Custom node renderer — one component handles all four shapes via data.shape. */
function ShapeNode({ data, selected }: NodeProps<DiagramNode>) {
  const cls = `diagram-node diagram-node-${data.shape}${selected ? ' is-selected' : ''}`;
  return (
    <div className={cls}>
      <Handle type="target" position={Position.Top} />
      <span className="diagram-node-label">{data.label || ' '}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const NODE_TYPES = { shape: ShapeNode };

export default function DiagramEditorModal(props: Props) {
  if (!props.open) return null;
  // Provider must wrap any component using useReactFlow hooks. Modal re-mounts
  // on open so a fresh provider is OK.
  return (
    <ReactFlowProvider>
      <DiagramEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function DiagramEditorInner({ open, initialCode, language, onClose, onInsert }: Props) {
  const ko = language === 'ko';
  const shapeLabels = ko ? SHAPE_LABELS_KO : SHAPE_LABELS_EN;

  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [direction, setDirection] = useState<Direction>('TD');
  const [showCode, setShowCode] = useState(false);
  const [labelEditTarget, setLabelEditTarget] = useState<{ kind: 'node' | 'edge'; id: string; label: string } | null>(null);

  // Load initial code (Phase C: re-edit existing diagram).
  useEffect(() => {
    if (!open) return;
    if (initialCode && initialCode.trim()) {
      const parsed = mermaidToFlow(initialCode);
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setDirection(parsed.direction);
    } else {
      setNodes([]);
      setEdges([]);
      setDirection('TD');
    }
    setShowCode(false);
    setLabelEditTarget(null);
  }, [open, initialCode]);

  // React Flow callbacks — controlled mode so we own state.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as DiagramNode[]);
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds) as DiagramEdge[]);
  }, []);
  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({ ...conn, type: 'default' }, eds) as DiagramEdge[]);
  }, []);

  const addShape = useCallback((shape: NodeShape) => {
    const id = newNodeId();
    const x = 80 + (nodes.length % 5) * 160;
    const y = 60 + Math.floor(nodes.length / 5) * 110;
    const fresh: DiagramNode = {
      id, type: 'shape', position: { x, y },
      data: { label: shapeLabels[shape], shape } as DiagramNodeData,
    };
    setNodes((nds) => [...nds, fresh]);
    // Auto-open label editor so the user can type immediately.
    setLabelEditTarget({ kind: 'node', id, label: shapeLabels[shape] });
  }, [nodes.length, shapeLabels]);

  const deleteSelected = useCallback(() => {
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  }, []);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const data = node.data as DiagramNodeData;
    setLabelEditTarget({ kind: 'node', id: node.id, label: data.label });
  }, []);

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: DiagramEdge) => {
    setLabelEditTarget({ kind: 'edge', id: edge.id, label: String(edge.data?.label ?? '') });
  }, []);

  const commitLabel = useCallback(() => {
    if (!labelEditTarget) return;
    const { kind, id, label } = labelEditTarget;
    if (kind === 'node') {
      setNodes((nds) => nds.map((n) => n.id === id
        ? { ...n, data: { ...n.data, label } as DiagramNodeData }
        : n));
    } else {
      setEdges((eds) => eds.map((e) => e.id === id
        ? { ...e, label, data: { ...e.data, label } }
        : e));
    }
    setLabelEditTarget(null);
  }, [labelEditTarget]);

  const mermaidCode = useMemo(
    () => flowToMermaid(nodes, edges, direction),
    [nodes, edges, direction],
  );

  // Keyboard: Esc closes label edit, Delete removes selected.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && labelEditTarget) {
        e.preventDefault();
        setLabelEditTarget(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [labelEditTarget]);

  return (
    <div className="modal-overlay diagram-modal-overlay" onClick={onClose}>
      <div className="modal-content diagram-modal" onClick={(e) => e.stopPropagation()}>
        <div className="diagram-modal-header">
          <h3>{ko ? '도식도' : 'Diagram'}</h3>
          <div className="diagram-modal-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowCode((s) => !s)}>
              {showCode ? <Eye size={14} /> : <Code size={14} />}
              <span>{showCode ? (ko ? '캔버스만' : 'Canvas only') : (ko ? '코드 보기' : 'Show code')}</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="diagram-modal-toolbar">
          <div className="diagram-toolbar-group">
            {(['rectangle', 'rounded', 'diamond', 'circle'] as NodeShape[]).map((s) => (
              <button
                key={s}
                className="diagram-toolbar-btn"
                onClick={() => addShape(s)}
                title={shapeLabels[s]}
              >
                <span className={`diagram-shape-preview diagram-shape-preview-${s}`} />
                <span className="diagram-toolbar-label">{shapeLabels[s]}</span>
              </button>
            ))}
          </div>
          <div className="diagram-toolbar-group">
            <button
              className={`diagram-toolbar-btn ${direction === 'TD' ? 'is-active' : ''}`}
              onClick={() => setDirection('TD')}
              title={ko ? '위→아래' : 'Top → Down'}
            >
              <ArrowsVertical size={14} /> TD
            </button>
            <button
              className={`diagram-toolbar-btn ${direction === 'LR' ? 'is-active' : ''}`}
              onClick={() => setDirection('LR')}
              title={ko ? '왼쪽→오른쪽' : 'Left → Right'}
            >
              <ArrowsHorizontal size={14} /> LR
            </button>
          </div>
          <div className="diagram-toolbar-group diagram-toolbar-group-end">
            <button
              className="diagram-toolbar-btn"
              onClick={deleteSelected}
              disabled={!nodes.some((n) => n.selected) && !edges.some((e) => e.selected)}
              title={ko ? '선택 항목 삭제 (Del)' : 'Delete selected (Del)'}
            >
              <Trash size={14} /> {ko ? '삭제' : 'Delete'}
            </button>
          </div>
        </div>

        <div className="diagram-modal-body">
          <div className="diagram-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              onEdgeDoubleClick={onEdgeDoubleClick}
              nodeTypes={NODE_TYPES}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
            >
              <Background gap={16} size={1} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="diagram-canvas-empty">
                <Plus size={32} weight="bold" />
                <p>{ko ? '위 도구바에서 도형을 추가하세요' : 'Add a shape from the toolbar above'}</p>
              </div>
            )}
          </div>

          {showCode && (
            <div className="diagram-code-pane">
              <label>{ko ? 'Mermaid 코드 (자동 생성)' : 'Mermaid code (auto-generated)'}</label>
              <pre>{mermaidCode}</pre>
              <p className="diagram-code-hint">
                {ko
                  ? '※ 코드는 캔버스에서 자동으로 생성됩니다. 정밀 편집은 채팅에 삽입 후 raw markdown 모드에서 가능합니다.'
                  : '※ Auto-generated from canvas. For fine-grained edits, insert and edit in raw markdown mode.'}
              </p>
            </div>
          )}
        </div>

        {labelEditTarget && (
          <div className="diagram-label-editor">
            <span>{labelEditTarget.kind === 'node' ? (ko ? '도형 라벨' : 'Shape label') : (ko ? '화살표 라벨' : 'Edge label')}</span>
            <input
              autoFocus
              value={labelEditTarget.label}
              onChange={(e) => setLabelEditTarget({ ...labelEditTarget, label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitLabel(); }
                if (e.key === 'Escape') { e.preventDefault(); setLabelEditTarget(null); }
              }}
              placeholder={ko ? '라벨 입력 후 Enter' : 'Type label then Enter'}
            />
            <button className="btn btn-primary btn-xs" onClick={commitLabel}>OK</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setLabelEditTarget(null)}>
              {ko ? '취소' : 'Cancel'}
            </button>
          </div>
        )}

        <div className="diagram-modal-footer">
          <span className="diagram-modal-stats">
            {nodes.length} {ko ? '도형' : 'shapes'} · {edges.length} {ko ? '화살표' : 'edges'}
          </span>
          <div className="diagram-modal-footer-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              {ko ? '취소' : 'Cancel'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onInsert(mermaidCode)}
              disabled={nodes.length === 0}
            >
              <FloppyDisk size={14} />
              {ko ? '채팅에 삽입' : 'Insert into chat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

