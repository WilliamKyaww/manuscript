import { useEffect, useId, useState } from 'react';
import { useThemeStore } from '../../../app/theme/theme';
import { Spinner } from '../../../components/Spinner';

type Mermaid = typeof import('mermaid').default;
let loading: Promise<Mermaid> | null = null;

/** Mermaid is large, so it is loaded only when a note actually contains a diagram. */
function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then((module) => module.default);
  return loading;
}

/** Renders a ```mermaid block. `securityLevel: 'strict'` makes Mermaid sanitise labels and links. */
export function MermaidDiagram({ source }: { source: string }) {
  const theme = useThemeStore((state) => state.resolved);
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'default',
        });
        return mermaid.render(id, source);
      })
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [id, source, theme]);

  if (error) {
    return (
      <div className="mermaid-error" role="note">
        <p>This diagram could not be drawn: {error}</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }
  if (!svg) return <Spinner label="Drawing diagram" />;
  return (
    <div
      className="mermaid"
      role="img"
      aria-label="Diagram"
      // Mermaid's own output, sanitised by Mermaid in strict mode.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered SVG from Mermaid (strict mode).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
