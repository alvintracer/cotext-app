import { useState, useEffect, useRef } from 'react';
import { FileText, TextAa, Graph, CirclesThree } from '@phosphor-icons/react';

/* ── Count-up hook ─────────────────────────────────────────────── */

function useCountUp(target: number, duration = 600): number {
  const [current, setCurrent] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    let raf: number;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const val = Math.round(start + diff * eased);
      setCurrent(val);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prevRef.current = target;
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return current;
}

/* ── Formatter ─────────────────────────────────────────────────── */

const fmt = new Intl.NumberFormat();

/* ── Component ─────────────────────────────────────────────────── */

interface StatsBarProps {
  ko: boolean;
  extractedDocs: number;
  totalChars: number;
  generatedNodes: number;
  clusters: number;
}

export default function StatsBar({
  ko,
  extractedDocs,
  totalChars,
  generatedNodes,
  clusters,
}: StatsBarProps) {
  const docs = useCountUp(extractedDocs);
  const chars = useCountUp(totalChars);
  const nodes = useCountUp(generatedNodes);
  const clust = useCountUp(clusters);

  const cards = [
    {
      icon: <FileText size={20} />,
      label: ko ? '추출 완료' : 'Extracted',
      value: docs,
    },
    {
      icon: <TextAa size={20} />,
      label: ko ? '텍스트' : 'Text',
      value: chars,
    },
    {
      icon: <Graph size={20} />,
      label: ko ? '노드' : 'Nodes',
      value: nodes,
    },
    {
      icon: <CirclesThree size={20} />,
      label: ko ? '클러스터' : 'Clusters',
      value: clust,
    },
  ] as const;

  return (
    <section className="ms-stats">
      {cards.map((card) => (
        <article key={card.label} className="ms-stat-card ms-glass-card">
          <div className="ms-stat-icon">{card.icon}</div>
          <div className="ms-stat-content">
            <span className="ms-stat-label">{card.label}</span>
            <strong className="ms-stat-value">{fmt.format(card.value)}</strong>
          </div>
        </article>
      ))}
    </section>
  );
}
