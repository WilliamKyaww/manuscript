import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Keyboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLayoutStore } from '../../app/layout-store';
import { Button } from '../../components/Button';
import { Page, StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { desktopBridge } from '../../lib/desktop';
import { formatUptime } from '../../lib/format';
import { healthQuery } from '../../lib/queries';
import { AgentSettingsSection } from '../agent/AgentSettingsSection';
import { AiSettingsSection } from '../ai/settings/AiSettingsSection';
import { DataSection } from '../data/DataSection';
import { AppearanceSection } from './AppearanceSection';
import { NotesSettingsSection } from './NotesSettingsSection';
import { PipelineSettingsSection } from './PipelineSettingsSection';
import { PlanSettingsSection } from './PlanSettingsSection';
import { ReviewSettingsSection } from './ReviewSettingsSection';

export function SettingsPage() {
  return (
    <Page
      title="Settings"
      description="Vault, notes, review, AI, assistant actions, appearance and information about this installation."
    >
      <VaultSection />
      <DataSection />
      <NotesSettingsSection />
      <ReviewSettingsSection />
      <PlanSettingsSection />
      <AiSettingsSection />
      <PipelineSettingsSection />
      <AgentSettingsSection />
      <AppearanceSection />
      <KeyboardSection />
      <AboutSection />
    </Page>
  );
}

function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function useHealth() {
  return useQuery(healthQuery(useApi()));
}

function VaultSection() {
  const health = useHealth();
  return (
    <StickySection title="Vault" description="The folder that holds your notes and sources.">
      {health.isPending && <LoadingState label="Loading vault details" />}
      {health.isError && (
        <ErrorState message={health.error.message} onRetry={() => void health.refetch()} />
      )}
      {health.data && (
        <Details
          rows={[
            ['Name', health.data.vault.name],
            [
              'Location',
              <code key="path" className="font-mono text-xs">
                {health.data.vault.path}
              </code>,
            ],
            [
              'Identifier',
              <code key="id" className="font-mono text-xs">
                {health.data.vault.id}
              </code>,
            ],
          ]}
        />
      )}
    </StickySection>
  );
}

function KeyboardSection() {
  const openShortcuts = useLayoutStore((state) => state.setShortcutsOpen);
  return (
    <StickySection title="Keyboard" description="Everything can be reached from the keyboard.">
      <Button onClick={() => openShortcuts(true)}>
        <Keyboard aria-hidden="true" size={16} />
        Show keyboard shortcuts
      </Button>
    </StickySection>
  );
}

/** Rows that only the desktop app has: which shell this is, and how AI keys are protected. */
function DesktopAbout() {
  const bridge = desktopBridge();
  const info = useQuery({
    queryKey: ['desktop', 'info'],
    queryFn: () => bridge?.appInfo() ?? null,
    enabled: bridge !== null,
  });
  if (!bridge || !info.data) return null;
  return (
    <div className="mt-3">
      <Details
        rows={[
          [
            'Desktop app',
            `Manuscript ${info.data.version} on Electron ${info.data.electron} (${info.data.platform})`,
          ],
          [
            'AI keys',
            info.data.secrets === 'encrypted'
              ? 'Encrypted, with a key that this computer’s account protects'
              : 'Kept in a file that only you can read (this system offers no protection for them)',
          ],
        ]}
      />
    </div>
  );
}

function AboutSection() {
  const health = useHealth();
  return (
    <StickySection title="About" description="Diagnostics for this installation.">
      {health.isPending && <LoadingState label="Loading installation details" />}
      {health.isError && (
        <ErrorState message={health.error.message} onRetry={() => void health.refetch()} />
      )}
      {health.data && (
        <Details
          rows={[
            [
              'Server',
              <span key="status" className="font-medium text-success">
                Healthy
              </span>,
            ],
            ['Version', `${health.data.version} (${health.data.mode})`],
            [
              'Database',
              `SQLite ${health.data.database.sqliteVersion}, ${health.data.database.appliedMigrations} migration${health.data.database.appliedMigrations === 1 ? '' : 's'} applied`,
            ],
            ['Running for', formatUptime(health.data.uptimeSeconds)],
          ]}
        />
      )}
      <DesktopAbout />
      <ul className="mt-3 space-y-1 text-sm">
        <li>
          <Link to="/diagnostics" className="text-accent underline">
            Diagnostics, the log and a bundle for support
          </Link>
        </li>
        <li>
          <Link to="/design-system" className="text-accent underline">
            Design system: the colours, type and components
          </Link>
        </li>
      </ul>
    </StickySection>
  );
}
