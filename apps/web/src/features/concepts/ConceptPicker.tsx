import { useQuery } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from '../../components/Input';
import { useApi } from '../../lib/api/context';
import { conceptsQuery } from './api';

/** Concepts as removable chips, with a field that adds one by name or alias (cards, questions). */
export function ConceptPicker({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange(next: string[]): void;
}) {
  const api = useApi();
  const concepts = useQuery(conceptsQuery(api));
  const listId = useId();
  const [text, setText] = useState('');
  const all = concepts.data?.concepts ?? [];

  const add = () => {
    const wanted = text.trim().toLowerCase();
    const match = all.find(
      (concept) =>
        concept.name.toLowerCase() === wanted ||
        concept.aliases.some((alias) => alias.toLowerCase() === wanted),
    );
    if (match && !value.includes(match.id)) onChange([...value, match.id]);
    setText('');
  };

  return (
    <div>
      <p className="mb-1 text-sm font-medium">Concepts</p>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((id) => {
          const concept = all.find((candidate) => candidate.id === id);
          return (
            <button
              key={id}
              type="button"
              className="flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs hover:bg-surface-hover"
              aria-label={`Remove concept ${concept?.name ?? id}`}
              onClick={() => onChange(value.filter((other) => other !== id))}
            >
              <Lightbulb aria-hidden="true" size={12} />
              {concept?.name ?? id} ×
            </button>
          );
        })}
        <Input
          aria-label="Add a concept"
          placeholder="Add a concept"
          list={listId}
          className="h-8 w-48"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          onBlur={() => text.trim() && add()}
        />
        <datalist id={listId}>
          {all.map((concept) => (
            <option key={concept.id} value={concept.name} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
