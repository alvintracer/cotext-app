import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';

interface Props {
  language: 'ko' | 'en';
  /** Called with a snippet (ending in \n) the modal should append to the code draft. */
  onInsert: (snippet: string) => void;
}

type MessageArrow = '->>' | '-->>' | '->' | '-->';
type NotePosition = 'over' | 'right of' | 'left of';

const ARROW_LABELS: Record<MessageArrow, { ko: string; en: string }> = {
  '->>': { ko: '→ 요청 (->>)', en: '→ Request (->>)' },
  '-->>': { ko: '⇠ 응답 (-->>)', en: '⇠ Response (-->>)' },
  '->': { ko: '→ 단순 (->)', en: '→ Plain (->)' },
  '-->': { ko: '⇢ 점선 (-->)', en: '⇢ Dashed (-->)' },
};

const NOTE_LABELS: Record<NotePosition, { ko: string; en: string }> = {
  'over': { ko: 'over (대상 위)', en: 'over (above target)' },
  'right of': { ko: 'right of (오른쪽)', en: 'right of' },
  'left of': { ko: 'left of (왼쪽)', en: 'left of' },
};

export default function SequenceDiagramBuilder({ language, onInsert }: Props) {
  const ko = language === 'ko';

  const [pKind, setPKind] = useState<'actor' | 'participant'>('participant');
  const [pId, setPId] = useState('');
  const [pLabel, setPLabel] = useState('');

  const [mFrom, setMFrom] = useState('');
  const [mTo, setMTo] = useState('');
  const [mType, setMType] = useState<MessageArrow>('->>');
  const [mLabel, setMLabel] = useState('');
  const [mActivate, setMActivate] = useState(false);
  const [mDeactivate, setMDeactivate] = useState(false);

  const [noteKind, setNoteKind] = useState<NotePosition>('over');
  const [noteTargets, setNoteTargets] = useState('');
  const [noteText, setNoteText] = useState('');

  const [rectColor, setRectColor] = useState('227, 242, 253');
  const [rectTargets, setRectTargets] = useState('');
  const [rectText, setRectText] = useState('');

  function addParticipant() {
    const id = pId.trim();
    if (!id) return;
    const label = pLabel.trim();
    onInsert(`    ${pKind} ${id}${label ? ` as ${label}` : ''}\n`);
    setPId('');
    setPLabel('');
  }

  function addMessage() {
    const from = mFrom.trim();
    const to = mTo.trim();
    if (!from || !to) return;
    const label = mLabel.trim() || (ko ? '메시지' : 'message');
    let block = `    ${from}${mType}${to}: ${label}\n`;
    if (mActivate) block += `    activate ${to}\n`;
    if (mDeactivate) block += `    deactivate ${to}\n`;
    onInsert(block);
    setMLabel('');
    setMActivate(false);
    setMDeactivate(false);
  }

  function addNote() {
    const targets = noteTargets.trim();
    const text = noteText.trim();
    if (!targets || !text) return;
    onInsert(`    Note ${noteKind} ${targets}: ${text}\n`);
    setNoteText('');
  }

  function addRect() {
    const text = rectText.trim();
    if (!text) return;
    const color = rectColor.trim() || '227, 242, 253';
    const targets = noteTargets.trim() || rectTargets.trim() || 'A,B';
    const snippet = `    rect rgb(${color})\n        Note over ${targets}: ${text}\n    end\n`;
    onInsert(snippet);
    setRectText('');
  }

  return (
    <div className="seq-builder">
      <section className="seq-builder-section">
        <h4>{ko ? '참가자 추가' : 'Add participant'}</h4>
        <div className="seq-builder-row">
          <select value={pKind} onChange={(event) => setPKind(event.target.value as 'actor' | 'participant')}>
            <option value="participant">participant</option>
            <option value="actor">actor</option>
          </select>
          <input
            value={pId}
            onChange={(event) => setPId(event.target.value.replace(/\s/g, ''))}
            placeholder={ko ? 'ID (예: U)' : 'ID (e.g. U)'}
            style={{ width: 80 }}
          />
          <input
            value={pLabel}
            onChange={(event) => setPLabel(event.target.value)}
            placeholder={ko ? '라벨 (예: 사용자)' : 'Label (e.g. User)'}
          />
          <button className="btn btn-primary btn-xs" onClick={addParticipant} disabled={!pId.trim()}>
            <Plus size={12} /> {ko ? '추가' : 'Add'}
          </button>
        </div>
      </section>

      <section className="seq-builder-section">
        <h4>{ko ? '메시지 추가' : 'Add message'}</h4>
        <div className="seq-builder-row">
          <input value={mFrom} onChange={(event) => setMFrom(event.target.value)} placeholder="From" style={{ width: 80 }} />
          <select value={mType} onChange={(event) => setMType(event.target.value as MessageArrow)}>
            {(Object.keys(ARROW_LABELS) as MessageArrow[]).map((key) => (
              <option key={key} value={key}>{ARROW_LABELS[key][ko ? 'ko' : 'en']}</option>
            ))}
          </select>
          <input value={mTo} onChange={(event) => setMTo(event.target.value)} placeholder="To" style={{ width: 80 }} />
        </div>
        <div className="seq-builder-row">
          <input
            value={mLabel}
            onChange={(event) => setMLabel(event.target.value)}
            placeholder={ko ? '메시지 내용' : 'Message text'}
            style={{ flex: 1 }}
          />
          <label className="seq-builder-check">
            <input type="checkbox" checked={mActivate} onChange={(event) => setMActivate(event.target.checked)} />
            activate
          </label>
          <label className="seq-builder-check">
            <input type="checkbox" checked={mDeactivate} onChange={(event) => setMDeactivate(event.target.checked)} />
            deactivate
          </label>
          <button className="btn btn-primary btn-xs" onClick={addMessage} disabled={!mFrom.trim() || !mTo.trim()}>
            <Plus size={12} /> {ko ? '추가' : 'Add'}
          </button>
        </div>
      </section>

      <section className="seq-builder-section">
        <h4>{ko ? '노트 추가' : 'Add note'}</h4>
        <div className="seq-builder-row">
          <select value={noteKind} onChange={(event) => setNoteKind(event.target.value as NotePosition)}>
            {(Object.keys(NOTE_LABELS) as NotePosition[]).map((key) => (
              <option key={key} value={key}>{NOTE_LABELS[key][ko ? 'ko' : 'en']}</option>
            ))}
          </select>
          <input
            value={noteTargets}
            onChange={(event) => setNoteTargets(event.target.value)}
            placeholder={ko ? '대상 (예: U,S)' : 'Targets (e.g. U,S)'}
            style={{ width: 120 }}
          />
          <input
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder={ko ? '노트 내용' : 'Note text'}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-xs" onClick={addNote} disabled={!noteTargets.trim() || !noteText.trim()}>
            <Plus size={12} /> {ko ? '추가' : 'Add'}
          </button>
        </div>
      </section>

      <section className="seq-builder-section">
        <h4>{ko ? '강조 구간 (rect)' : 'Highlight rect'}</h4>
        <div className="seq-builder-row">
          <input
            value={rectColor}
            onChange={(event) => setRectColor(event.target.value)}
            placeholder="r, g, b"
            style={{ width: 110 }}
          />
          <input
            value={rectTargets}
            onChange={(event) => setRectTargets(event.target.value)}
            placeholder={ko ? '대상' : 'Targets'}
            style={{ width: 100 }}
          />
          <input
            value={rectText}
            onChange={(event) => setRectText(event.target.value)}
            placeholder={ko ? '레이블' : 'Label'}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-xs" onClick={addRect} disabled={!rectText.trim()}>
            <Plus size={12} /> {ko ? '추가' : 'Add'}
          </button>
        </div>
      </section>

      <p className="seq-builder-hint">
        {ko
          ? '버튼을 누르면 우측 코드 패널 끝에 한 줄씩 추가됩니다. 미리보기는 즉시 갱신됩니다.'
          : 'Each button appends a line to the code panel on the right. Preview updates instantly.'}
      </p>
    </div>
  );
}
