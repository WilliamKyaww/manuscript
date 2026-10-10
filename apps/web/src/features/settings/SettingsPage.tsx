import { useQuery } from '@tanstack/react-query';
import { Keyboard, Monitor, Moon, Sun } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import { useLayoutStore } from '../../app/layout-store';
import { type ThemePreference, useThemeStore } from '../../app/theme/theme';
import { Button } from '../../components/Button';
import { Page, StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { formatUptime } from '../../lib/format';
import { healthQuery } from '../../lib/queries';
import { AgentSettingsSection } from '../agent/AgentSettingsSection';
import { AiSettingsSection } from '../ai/settings/AiSettingsSection';
import { NotesSettingsSection } from './NotesSettingsSection';
import { PlanSettingsSection } from './PlanSettingsSection';
import { ReviewSettingsSection } from './ReviewSettingsSection';

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  { value: 'light', label: 'Light', description: 'Warm paper tones', icon: <Sun size={18} /> },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Low glare for long sessions',
    icon: <Moon size={18} />,
  },
  {
    value: 'system',
    label: 'Match system',
    description: 'Follow the Windows setting',
    icon: <Monitor size={18} />,
  },
];

export function SettingsPage() {
  return (
    <Page
      title="Settings"
      description="Vault, notes, review, AI, assistant actions, appearance and information about this installation."
    >
      <VaultSection />
      <NotesSettingsSection />
      <ReviewSettingsSection />
      <PlanSettingsSection />
      <AiSettingsSection />
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

function AppearanceSection() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  return (
    <StickySection
      title="Appearance"
      description="Applies immediately and is remembered on this computer."
    >
      <div id="theme-label" className="mb-3 text-sm font-medium">
        Theme
      </div>
      <RadioGroup.Root
        aria-labelledby="theme-label"
        value={preference}
        onValueChange={(value) => setPreference(value as ThemePreference)}
        className="grid gap-3 sm:grid-cols-3"
      >
        {THEME_OPTIONS.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left',
              'hover:border-border-strong data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle',
            )}
          >
            <span aria-hidden="true" className="text-muted">
              {option.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted">{option.description}</span>
            </span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
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
    </StickySection>
  );
}
