import { useEffect, useState } from 'react';
import { getAppConfig, apiUrl } from '../config';

type TemplateMeta = {
  name: string;
  frontend: string;
  backend: string;
  databaseEnabled: boolean;
  notes: string[];
};

export default function HomePage() {
  const config = getAppConfig();
  const [meta, setMeta] = useState<TemplateMeta | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch(apiUrl('/api/template/meta'));
        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.message || 'Failed to load template metadata');
        }

        setMeta(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error');
      }
    };

    void run();
  }, []);

  return (
    <section className="page-stack">
      <article className="panel feature-hero">
        <div>
          <p className="eyebrow">Runtime config</p>
          <h2>{config.app.name}</h2>
          <p className="muted-copy">{config.app.subtitle}</p>
        </div>
        <div className="pill-row">
          <span className="pill">Frontend: React + Vite</span>
          <span className="pill">Backend: Fastify</span>
          <span className="pill">Static hosting: enabled</span>
        </div>
      </article>

      {error ? <p className="message error">{error}</p> : null}

      <section className="panel-grid">
        <article className="panel">
          <p className="eyebrow">Template flow</p>
          <h3>What to replace first</h3>
          <ul className="clean-list">
            <li>Rename app metadata in frontend and backend package/config files.</li>
            <li>Swap the example item feature for your first real model and route.</li>
            <li>Keep the Fastify static hosting flow and point Vite build output at Backend/public/dist.</li>
          </ul>
        </article>

        <article className="panel">
          <p className="eyebrow">Backend status</p>
          <h3>{meta?.name || 'Loading template metadata'}</h3>
          <p className="muted-copy">
            {meta
              ? `${meta.backend} serves the frontend build and exposes a small example API.`
              : 'Waiting for the backend metadata endpoint.'}
          </p>
          <div className="status-card">
            <strong>{meta?.databaseEnabled ? 'Database mode available' : 'Database disabled by config'}</strong>
            <span>
              {meta?.databaseEnabled
                ? 'Configure credentials and sync settings when you want DB-backed examples.'
                : 'Set database.enabled=true in Backend/config.json when you are ready to use Sequelize.'}
            </span>
          </div>
        </article>
      </section>

      {meta?.notes?.length ? (
        <article className="panel">
          <p className="eyebrow">Backend notes</p>
          <h3>API guidance</h3>
          <ul className="clean-list">
            {meta.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}