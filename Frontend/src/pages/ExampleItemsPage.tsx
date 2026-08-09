import { useEffect, useState } from 'react';
import { apiUrl } from '../config';

type TemplateItem = {
  uuid: string;
  rolling_id: number;
  name: string;
  summary: string;
  status: 'draft' | 'active' | 'archived';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
};

const EMPTY_FORM = {
  name: '',
  summary: '',
  status: 'draft',
  priority: 'medium',
};

export default function ExampleItemsPage() {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedItem = items.find((item) => item.uuid === selectedUuid) || null;

  const loadItems = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(apiUrl('/api/template-items?limit=100'));
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || 'Failed to load example items');
      }

      const rows: TemplateItem[] = result.data || [];
      setItems(rows);

      if (rows.length > 0 && !selectedUuid) {
        setSelectedUuid(rows[0].uuid);
        setForm({
          name: rows[0].name,
          summary: rows[0].summary,
          status: rows[0].status,
          priority: rows[0].priority,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    setForm({
      name: selectedItem.name,
      summary: selectedItem.summary,
      status: selectedItem.status,
      priority: selectedItem.priority,
    });
  }, [selectedItem?.uuid]);

  const saveNewItem = async () => {
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(apiUrl('/api/template-items'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || 'Failed to create item');
      }

      const created: TemplateItem = result.data;
      const nextItems = [created, ...items];
      setItems(nextItems);
      setSelectedUuid(created.uuid);
      setMessage('Created a new example item. Replace this flow with your own domain create action.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const updateItem = async () => {
    if (!selectedUuid) {
      setError('Choose an item before saving changes.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(apiUrl(`/api/template-items/${selectedUuid}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || 'Failed to update item');
      }

      const updated: TemplateItem = result.data;
      setItems((current) => current.map((item) => item.uuid === updated.uuid ? updated : item));
      setMessage('Updated the selected example item.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-stack">
      <article className="panel panel-header-row">
        <div>
          <p className="eyebrow">Example feature</p>
          <h2>Template Items</h2>
          <p className="muted-copy">
            This page demonstrates the full-stack path: React form state, Fastify API routes, Sequelize model, and DB seed data.
          </p>
        </div>
        <button className="secondary-btn" onClick={() => void loadItems()} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </article>

      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <section className="workspace-grid">
        <article className="panel">
          <p className="eyebrow">Seeded records</p>
          <h3>Available items</h3>
          {loading ? <p className="muted-copy">Loading items...</p> : null}
          {!loading && items.length === 0 ? (
            <p className="muted-copy">No items found. Enable the database and run the seed script to populate examples.</p>
          ) : null}
          <div className="item-list">
            {items.map((item) => (
              <button
                key={item.uuid}
                className={item.uuid === selectedUuid ? 'item-card active' : 'item-card'}
                onClick={() => setSelectedUuid(item.uuid)}
              >
                <strong>{item.name}</strong>
                <span>{item.summary || 'No summary yet.'}</span>
                <div className="pill-row compact">
                  <span className="pill">#{item.rolling_id}</span>
                  <span className="pill">{item.status}</span>
                  <span className="pill">{item.priority}</span>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Editor</p>
          <h3>{selectedItem ? `Edit item #${selectedItem.rolling_id}` : 'Create an item'}</h3>

          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Add your feature or model name"
            />
          </label>

          <label className="field">
            <span>Summary</span>
            <textarea
              value={form.summary}
              onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
              rows={5}
              placeholder="Describe what this example represents in the template"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as 'draft' | 'active' | 'archived' }))}
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </label>

            <label className="field">
              <span>Priority</span>
              <select
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as 'low' | 'medium' | 'high' }))}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
          </div>

          <div className="button-row">
            <button className="primary-btn" onClick={() => void saveNewItem()} disabled={saving}>
              {saving ? 'Saving...' : 'Create new item'}
            </button>
            <button className="secondary-btn" onClick={() => void updateItem()} disabled={saving || !selectedUuid}>
              {saving ? 'Saving...' : 'Update selected item'}
            </button>
          </div>
        </article>
      </section>
    </section>
  );
}
