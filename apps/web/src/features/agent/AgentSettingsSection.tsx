import type { AgentAction, ToolInfo, ToolPermission } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Button } from '../../components/Button';
import { StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { formatDateTime } from '../../lib/format';
import { notifyError, notifySuccess } from '../../lib/notify';
import { selectClasses } from '../learning/Field';
import { agentActionsQuery, agentToolsQuery, useAgentActions } from './api';

/**
 * Settings → Assistant actions (task 12.12, agent-system.md §§7–8): what the assistant (and any MCP
 * client) has changed, with Undo while nothing has changed it since; and which tools it may use
 * without asking. Reading is always allowed unless switched off; changes are logged and can be
 * undone; deleting, merging and bulk changes always ask.
 */

const RISK: Record<ToolInfo['risk'], { label: string; tone: BadgeTone }> = {
  read: { label: 'Reads', tone: 'neutral' },
  write: { label: 'Changes', tone: 'info' },
  destructive: { label: 'Deletes or merges', tone: 'warning' },
};

const CATEGORY_TITLES: Record<string, string> = {
  knowledge: 'Notes',
  concepts: 'Concepts and graph',
  sources: 'Sources',
  learning: 'Course and learning',
  files: 'Files',
};

const STATUS: Record<AgentAction['status'], { label: string; tone: BadgeTone }> = {
  executed: { label: 'Done', tone: 'success' },
  undone: { label: 'Undone', tone: 'neutral' },
  denied: { label: 'Not allowed', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
};

function PermissionSelect({ tool }: { tool: ToolInfo }) {
  const { setPermission } = useAgentActions();
  const destructive = tool.risk === 'destructive';
  const value: ToolPermission | 'default' = tool.permission ?? 'default';
  return (
    <select
      aria-label={`Permission for ${tool.name}`}
      className={`${selectClasses} w-44`}
      value={destructive && value === 'auto' ? 'default' : value}
      disabled={setPermission.isPending}
      onChange={(event) => {
        const next = event.target.value;
        setPermission.mutate(
          { name: tool.name, permission: next === 'default' ? null : (next as ToolPermission) },
          { onError: notifyError },
        );
      }}
    >
      <option value="default">
        {destructive ? 'Ask every time' : tool.risk === 'read' ? 'Allowed' : 'Allowed, logged'}
      </option>
      {!destructive && <option value="ask">Ask each time</option>}
      <option value="deny">Off</option>
    </select>
  );
}

function ToolsTable({ tools }: { tools: readonly ToolInfo[] }) {
  const categories = [...new Set(tools.map((tool) => tool.category))];
  return (
    <div className="space-y-4">
      {categories.map((category) => (
        <section key={category} aria-label={CATEGORY_TITLES[category] ?? category}>
          <h4 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            {CATEGORY_TITLES[category] ?? category}
          </h4>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {tools
              .filter((tool) => tool.category === category)
              .map((tool) => (
                <li key={tool.name} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <code className="font-mono text-xs">{tool.name}</code>
                      <Badge tone={RISK[tool.risk].tone}>{RISK[tool.risk].label}</Badge>
                    </p>
                    <p className="line-clamp-2 text-xs text-muted">{tool.description}</p>
                  </div>
                  <PermissionSelect tool={tool} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ActionRow({ action }: { action: AgentAction }) {
  const { undo } = useAgentActions();
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2" data-action={action.tool}>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{action.summary}</p>
        <p className="text-xs text-muted">
          {formatDateTime(new Date(action.createdAt))} ·{' '}
          {action.actor === 'mcp' ? 'MCP client' : 'Assistant'} ·{' '}
          <code className="font-mono">{action.tool}</code>
          {action.approval === 'user' && ' · you approved it'}
          {action.error && action.status !== 'executed' && ` · ${action.error}`}
        </p>
      </div>
      <Badge tone={STATUS[action.status].tone}>{STATUS[action.status].label}</Badge>
      {action.status === 'executed' && (
        <Button
          size="sm"
          disabled={!action.undoable}
          loading={undo.isPending && undo.variables === action.id}
          title={
            action.undoable
              ? undefined
              : 'Something has changed since, so this cannot be undone safely.'
          }
          onClick={() =>
            undo.mutate(action.id, {
              onSuccess: () => notifySuccess('Undone', action.summary),
              onError: notifyError,
            })
          }
        >
          <Undo2 aria-hidden="true" size={14} />
          Undo
        </Button>
      )}
    </li>
  );
}

export function AgentSettingsSection() {
  const api = useApi();
  const tools = useQuery(agentToolsQuery(api));
  const actions = useQuery(agentActionsQuery(api));
  return (
    <StickySection
      title="Assistant actions"
      description="What the assistant and connected MCP clients have changed, and which tools they may use. Everything that changes something is logged and can be undone; deleting and merging always ask you first."
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recent actions</h3>
          {actions.isPending && <LoadingState label="Loading recent actions" />}
          {actions.isError && (
            <ErrorState
              message="Recent actions could not be loaded."
              onRetry={() => actions.refetch()}
            />
          )}
          {actions.data &&
            (actions.data.actions.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing yet. When the assistant or an MCP client changes your notes, concepts or
                cards, it appears here.
              </p>
            ) : (
              <ul
                aria-label="Recent actions"
                className="divide-y divide-border rounded-lg border border-border bg-surface"
              >
                {actions.data.actions.map((action) => (
                  <ActionRow key={action.id} action={action} />
                ))}
              </ul>
            ))}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Tools</h3>
          {tools.isPending && <LoadingState label="Loading tools" />}
          {tools.isError && (
            <ErrorState message="Tools could not be loaded." onRetry={() => tools.refetch()} />
          )}
          {tools.data && <ToolsTable tools={tools.data.tools} />}
        </div>
      </div>
    </StickySection>
  );
}
