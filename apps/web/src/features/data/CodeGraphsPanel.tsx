import { useQuery } from '@tanstack/react-query';
import { FileJson, RefreshCw, Trash2 } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { InlineError } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { formatCount } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { Field } from '../learning/Field';
import { codeGraphsQuery, useCodeActions } from './api';

/**
 * Code graphs (task 16.06): a Graphify `graph.json` of a coursework or dissertation repository, so that
 * the code can be linked to the concepts it implements. Suggested links come from names alone and
 * wait on the concept's page for a decision.
 */
export function CodeGraphsPanel() {
  const api = useApi();
  const graphs = useQuery(codeGraphsQuery(api));
  const actions = useCodeActions();
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [module, setModule] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    actions.importGraph.mutate(
      { file, ...(name.trim() ? { name } : {}), ...(module.trim() ? { module } : {}) },
      {
        onSuccess: (value) => {
          setResult(
            value.duplicate
              ? `“${value.graph.name}” was imported before; nothing was added.`
              : `Imported “${value.graph.name}”: ${formatCount(value.graph.entities, 'piece')} of code, ${formatCount(value.graph.edges, 'connection')}. ${formatCount(value.graph.links.proposed, 'link')} to concepts suggested.`,
          );
          setFile(null);
          setName('');
          if (picker.current) picker.current.value = '';
        },
        onError: notifyError,
      },
    );
  };

  return (
    <section aria-label="Code graphs" className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Code graphs</h3>
        <p className="text-xs text-muted">
          Map a repository with Graphify, then import its <code>graph.json</code> here. Its files,
          classes and functions become nodes of the graph (shown when “Code” is ticked there), and
          names that match your concepts are suggested as links.
        </p>
      </div>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem]"
        onSubmit={submit}
        aria-label="Import a graph"
      >
        <label className="grid gap-1 text-sm sm:col-span-3">
          graph.json
          <input
            ref={picker}
            type="file"
            accept=".json,application/json"
            className="text-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Field label="Name (optional)">
          {(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />}
        </Field>
        <Field label="Module (optional)">
          {(id) => (
            <Input
              id={id}
              value={module}
              placeholder="COC251"
              onChange={(event) => setModule(event.target.value)}
            />
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={!file} loading={actions.importGraph.isPending}>
            <FileJson aria-hidden="true" size={16} />
            Import
          </Button>
        </div>
      </form>
      {result && (
        <p role="status" className="text-sm">
          {result}
        </p>
      )}
      {graphs.isError && (
        <InlineError
          message="The imported code graphs could not be loaded."
          onRetry={() => void graphs.refetch()}
        />
      )}
      {graphs.data && graphs.data.graphs.length === 0 && (
        <p className="text-sm text-muted">No code graphs imported.</p>
      )}
      {graphs.data && graphs.data.graphs.length > 0 && (
        <ul
          aria-label="Imported graphs"
          className="divide-y divide-border rounded-md border border-border"
        >
          {graphs.data.graphs.map((graph) => (
            <li key={graph.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{graph.name}</span>
                <span className="block text-xs text-muted">
                  {formatCount(graph.entities, 'piece')} of code ·{' '}
                  {formatCount(graph.edges, 'connection')}
                  {graph.module && ` · ${graph.module.code}`} · {graph.fileName}
                </span>
              </span>
              {graph.links.proposed > 0 && (
                <Badge tone="warning">{graph.links.proposed} suggested</Badge>
              )}
              {graph.links.accepted > 0 && (
                <Badge tone="success">{graph.links.accepted} linked</Badge>
              )}
              <Button
                size="sm"
                loading={actions.rematch.isPending && actions.rematch.variables === graph.id}
                onClick={() => actions.rematch.mutate(graph.id, { onError: notifyError })}
              >
                <RefreshCw aria-hidden="true" size={14} />
                Look for matches again
              </Button>
              <IconButton
                label={`Remove ${graph.name}`}
                icon={<Trash2 size={14} />}
                size="sm"
                onClick={() => actions.remove.mutate(graph.id, { onError: notifyError })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
