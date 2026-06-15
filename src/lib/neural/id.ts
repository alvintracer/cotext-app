// Neural Link — id helpers (P0)

/** crypto.getRandomValues 우선, 없으면 Math.random fallback (브라우저+Node 공용). */
function randHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 안정 노드 id. 예: "n_a1b2c3d4" */
export function newNodeId(): string {
  return `n_${randHex(4)}`;
}

/**
 * 클러스터 이름 → slug id. 한글/영문/숫자 보존, 공백·기타는 하이픈.
 * 예: "가격 정책" → "가격-정책", "Go To Market" → "go-to-market"
 */
export function slugifyClusterId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `c_${randHex(3)}`;
}
