import { spawn } from 'node:child_process';

/**
 * Opens a URL in the user's default browser. On Windows `rundll32 url.dll,FileProtocolHandler`
 * avoids `cmd.exe` parsing of characters such as `&` in URLs.
 */
export function openInBrowser(url: string): void {
  if (!/^https?:\/\//.test(url)) throw new Error(`Refusing to open a non-HTTP URL: ${url}`);
  const [command, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    // Opening a browser is a convenience; the URL is also printed to the console.
  });
  child.unref();
}
