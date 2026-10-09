import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../lib/api/context';
import { formatDateTime } from '../../../lib/format';
import { aiUsageQuery } from '../api';
import { ROLE_TEXT } from './RoleForm';

const money = (value: number) => `$${value.toFixed(value < 1 ? 3 : 2)}`;
const count = (value: number) => value.toLocaleString('en-GB');

/** What AI cost this month, by model, and the latest requests (task 10.03). */
export function UsagePanel() {
  const api = useApi();
  const usage = useQuery(aiUsageQuery(api));
  const data = usage.data;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Usage in {data.month}</h3>
      <p className="text-sm">
        {count(data.totals.requests)} requests · {count(data.totals.inputTokens)} tokens in ·{' '}
        {count(data.totals.outputTokens)} out · about {money(data.totals.cost)}
      </p>
      {data.byModel.length > 0 && (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Usage by model this month</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">Role</th>
              <th className="py-1 font-medium">Model</th>
              <th className="py-1 text-right font-medium">Requests</th>
              <th className="py-1 text-right font-medium">Tokens in / out</th>
              <th className="py-1 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.byModel.map((row) => (
              <tr
                key={`${row.role}-${row.provider}-${row.model}`}
                className="border-t border-border"
              >
                <td className="py-1">{ROLE_TEXT[row.role].title}</td>
                <td className="py-1">
                  {row.provider} · {row.model}
                </td>
                <td className="py-1 text-right tabular-nums">{count(row.requests)}</td>
                <td className="py-1 text-right tabular-nums">
                  {count(row.inputTokens)} / {count(row.outputTokens)}
                </td>
                <td className="py-1 text-right tabular-nums">{money(row.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.recent.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">Latest requests</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {data.recent.map((row) => (
              <li key={row.id}>
                {formatDateTime(new Date(row.createdAt))} · {row.purpose} · {row.model} ·{' '}
                {count(row.inputTokens)} in / {count(row.outputTokens)} out · {money(row.cost)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
