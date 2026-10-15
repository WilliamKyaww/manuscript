import { z } from 'zod';
import { webPageUrl } from './policy';

const Key = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/u);
const Issue = z
  .object({ kind: z.enum(['http', 'load', 'crash']), code: z.number().int() })
  .nullable();
export const NativeMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), available: z.boolean() }),
  z.object({
    type: z.literal('result'),
    requestId: z.number().int().positive(),
    ok: z.boolean(),
    value: z.unknown().optional(),
    error: z.enum(['bad-request', 'unavailable', 'failed']).optional(),
  }),
  z.object({
    type: z.literal('state'),
    key: Key,
    url: z.string().max(8192),
    title: z.string().max(512),
    loading: z.boolean(),
    canGoBack: z.boolean(),
    canGoForward: z.boolean(),
    issue: Issue,
    focused: z.boolean().optional(),
  }),
  z.object({ type: z.literal('focus-app'), key: Key, reverse: z.boolean() }),
]);
export type NativeMessage = z.infer<typeof NativeMessage>;
export type NativeState = Extract<NativeMessage, { type: 'state' }>;

export function readNativeMessage(line: string, appOrigin: string | null): NativeMessage | null {
  try {
    const parsed = NativeMessage.safeParse(JSON.parse(line));
    if (!parsed.success) return null;
    if (parsed.data.type === 'state' && !webPageUrl(parsed.data.url, appOrigin)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** SDK environment overrides must not redirect the profile or inject browser switches. */
export function nativeEnvironment(given: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(given).filter(
      ([name]) =>
        !/^WEBVIEW2_|^ELECTRON_RUN_AS_NODE$|^SKB_AUTH_TOKEN$|^SKB_SECRETS_KEY$|(?:API_KEY|ACCESS_TOKEN|SECRET|PASSWORD)$/iu.test(
          name,
        ),
    ),
  );
}

export const NativeInspection = z.object({
  bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  visible: z.boolean(),
  url: z.string(),
});
export const NativePicture = z
  .string()
  .startsWith('data:image/png;base64,')
  .max(16 * 1024 * 1024)
  .nullable();
