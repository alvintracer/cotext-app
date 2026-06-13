import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ title: string; generated: string; sourceFilter: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    const fetchContent = async () => {
      try {
        const baseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${baseUrl}/functions/v1/context-share?token=${token}&format=json`);
        const json = await res.json();

        if (json.error) {
          setError(json.error);
        } else {
          setContent(json.content);
          setMeta({
            title: json.title,
            generated: json.generated,
            sourceFilter: json.source_filter,
          });
        }
      } catch (err) {
        setError('Failed to load shared content');
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, [token]);

  if (loading) {
    return (
      <div className="share-page">
        <div className="share-loading">
          <div className="spinner" />
          <p>Loading shared context...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="share-page">
        <div className="share-error">
          <h2>:&gt;</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="share-page">
      <div className="share-container">
        <header className="share-header">
          <div className="share-logo">:&gt;</div>
          <h1>{meta?.title}</h1>
          <div className="share-meta">
            <span>Generated: {meta?.generated}</span>
            <span>Filter: {meta?.sourceFilter}</span>
          </div>
        </header>
        <div className="share-content">
          <button
            className="btn btn-primary share-copy-btn"
            onClick={async () => {
              if (content) {
                await navigator.clipboard.writeText(content);
              }
            }}
          >
            Copy as Markdown
          </button>
          <pre className="share-markdown">{content}</pre>
        </div>
      </div>
    </div>
  );
}
