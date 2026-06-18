// ============================================================
// Knowledge Studio — Phase 4: Studio → Workspace merge orchestrator
// 결정 D-009 / 계획서 §32 / Studio plan Phase 4
//
// Studio drafting graph를 워크스페이스 정본(.cotext/neural.json)에 안전하게 합류.
// 순수 union(mergeGraphs)은 lib/neural/graph.ts에 있고, 여기서는 GitHub fetch +
// push + Supabase 파생 인덱스 sync + NEURAL_INDEX.md 갱신을 묶는다.
//
// 정본 우선 원칙: 기존 cluster/node 라벨·색·desc는 절대 덮어쓰지 않는다.
// Studio import는 항상 "추가" 방향. 같은 id의 cluster/node는 정본 값 유지.
// ============================================================

import { githubApi, neuralApi } from '../supabase/functions';
import {
  parseGraph, serializeGraph, mergeGraphs, neuralFilePath, generateNeuralIndex, neuralIndexFilePath,
  emptyGraph, type NeuralGraph, type MergeStats,
} from '../neural';

export interface MergeWorkspace {
  id: string;
  github_owner: string;
  github_repo: string;
  default_branch: string;
  cotext_folder_name?: string | null;
}

export interface MergePreview {
  stats: MergeStats;
  /** Existing graph fetched from GitHub at preview time (used by the executor). */
  base: NeuralGraph;
  baseSha: string | null;
  /** Merged graph for confirmation; passed back to executor to avoid re-merge. */
  mergedGraph: NeuralGraph;
}

export interface MergeResult {
  ok: true;
  workspaceId: string;
  stats: MergeStats;
  pushed: { neuralJson: boolean; neuralIndex: boolean; supabaseSync: boolean };
}

/**
 * Phase 1 of merge: fetch the workspace's current neural.json, compute the union,
 * and return a preview the user can confirm. No writes yet.
 */
export async function previewWorkspaceMerge(
  ws: MergeWorkspace,
  studioGraph: NeuralGraph,
): Promise<MergePreview> {
  const folder = ws.cotext_folder_name || '.cotext';
  const path = neuralFilePath(folder);

  let base = emptyGraph();
  let baseSha: string | null = null;
  try {
    const existing = await githubApi.getRoomContent(
      ws.github_owner, ws.github_repo, ws.default_branch, path,
    );
    base = parseGraph(existing.content);
    baseSha = existing.sha;
  } catch {
    // First-time merge — workspace has no neural.json yet. base = empty.
  }

  const { graph, stats } = mergeGraphs(base, studioGraph);
  return { stats, base, baseSha, mergedGraph: graph, };
}

/**
 * Phase 2 of merge: takes the previewed merged graph and persists it.
 *   1. push merged neural.json (with the sha we captured at preview)
 *   2. regenerate + push NEURAL_INDEX.md (option-C grounding)
 *   3. mirror into the Supabase derived index (cross-repo search)
 *
 * Each step is best-effort and reported individually — partial success is fine
 * (e.g., GitHub push succeeded but Supabase sync hiccupped → user still has
 * the truth in repo, can resync from the workspace later).
 */
export async function executeWorkspaceMerge(
  ws: MergeWorkspace,
  preview: MergePreview,
  commitMessage = 'cotext: merge knowledge-studio graph',
): Promise<MergeResult> {
  const folder = ws.cotext_folder_name || '.cotext';
  const pathJson = neuralFilePath(folder);
  const pathIndex = neuralIndexFilePath(folder);
  const result: MergeResult = {
    ok: true,
    workspaceId: ws.id,
    stats: preview.stats,
    pushed: { neuralJson: false, neuralIndex: false, supabaseSync: false },
  };

  // 1. Push neural.json (the actual truth)
  await githubApi.pushRoom(
    ws.github_owner, ws.github_repo, ws.default_branch,
    pathJson, serializeGraph(preview.mergedGraph), preview.baseSha, commitMessage,
  );
  result.pushed.neuralJson = true;

  // 2. NEURAL_INDEX.md — non-blocking, separate try
  try {
    let idxSha: string | null = null;
    try {
      const ex = await githubApi.getRoomContent(
        ws.github_owner, ws.github_repo, ws.default_branch, pathIndex,
      );
      idxSha = ex.sha;
    } catch { /* first time, no existing index */ }
    const md = generateNeuralIndex(preview.mergedGraph, `${ws.github_owner}/${ws.github_repo}`);
    await githubApi.pushRoom(
      ws.github_owner, ws.github_repo, ws.default_branch,
      pathIndex, md, idxSha, `${commitMessage} (index)`,
    );
    result.pushed.neuralIndex = true;
  } catch (e) {
    console.warn('NEURAL_INDEX.md publish failed during merge:', e);
  }

  // 3. Supabase derived index — non-blocking
  try {
    await neuralApi.sync(ws.id, preview.mergedGraph);
    result.pushed.supabaseSync = true;
  } catch (e) {
    console.warn('Supabase neural index sync failed during merge:', e);
  }

  return result;
}
