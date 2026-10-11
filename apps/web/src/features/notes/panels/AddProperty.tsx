import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';

/** A property of the student's own (task 23.08, "Add file property"): a name and a value. */
export function AddProperty({
  requested,
  onHandled,
  onAdd,
}: {
  requested: boolean;
  onHandled?(): void;
  onAdd(key: string, value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const valueId = useId();
  useEffect(() => {
    if (!requested) return;
    setOpen(true);
    // Already open: the name field takes focus again.
    nameRef.current?.focus();
    onHandled?.();
  }, [requested, onHandled]);
  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  if (!open)
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Add property
      </Button>
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = key.trim();
    if (!name) return;
    onAdd(name, value.trim());
    setKey('');
    setValue('');
    setOpen(false);
  };
  return (
    <form
      aria-label="Add a property"
      onSubmit={submit}
      className="space-y-2 rounded-md border border-border p-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={nameId} className="block text-xs font-medium">
            Property name
          </label>
          <Input
            id={nameId}
            ref={nameRef}
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={valueId} className="block text-xs font-medium">
            Value
          </label>
          <Input id={valueId} value={value} onChange={(event) => setValue(event.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" disabled={!key.trim()}>
          Add property
        </Button>
        <Button size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
