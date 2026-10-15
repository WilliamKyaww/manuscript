import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Local browser mechanics only: this is deliberately not a Cloudflare challenge or solver. */
export async function createResearchSite() {
  const frame = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<button id="confirm">Confirm local test</button>
      <script>document.querySelector('button').onclick = () => parent.postMessage('confirmed', '*');</script>`);
  });
  await new Promise<void>((resolve) => frame.listen(0, '127.0.0.1', resolve));
  const frameOrigin = `http://127.0.0.1:${(frame.address() as AddressInfo).port}`;
  let fail = true;
  const site = createServer((request, response) => {
    if (request.url === '/unavailable' && fail) {
      request.socket.destroy();
      return;
    }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/paper' }).end();
      return;
    }
    if (request.url === '/accept') {
      response
        .writeHead(302, {
          location: '/paper',
          'set-cookie': 'paperAccess=yes; SameSite=Lax; Path=/',
        })
        .end();
      return;
    }
    if (request.url === '/paper' && !request.headers.cookie?.includes('paperAccess=yes')) {
      response.statusCode = 403;
      response.setHeader('set-cookie', 'researchSession=kept; SameSite=Lax; Path=/');
      response.end(`<title>Local verification</title><h1>Verification fixture</h1>
        <p>This local page tests browser interaction, not a real verification service.</p>
        <iframe src="${frameOrigin}" title="Local confirmation"></iframe>
        <button id="continue" disabled>Continue</button>
        <button id="popup">Open sign-in window</button>
        <script>
          localStorage.setItem('research', 'remembered');
          addEventListener('message', event => {
            if (event.origin === location.origin && event.data.kind === 'popup-ready') window.popupResult = event.data;
            if (event.origin === '${frameOrigin}' && event.data === 'confirmed') {
              document.querySelector('#continue').disabled = false;
            }
          });
          document.querySelector('#continue').onclick = () => location.href = '/accept';
          document.querySelector('#popup').onclick = () => { window.fixturePopup = window.open('/popup', '_blank', 'popup,width=520,height=680'); };
        </script>`);
      return;
    }
    if (request.url === '/popup') {
      response.end(`<title>Research sign-in</title><h1>Local sign-in window</h1>
        <script>opener.postMessage({ kind: 'popup-ready', storage: localStorage.getItem('research'),
          cookie: document.cookie, node: typeof window.require, bridge: typeof window.skbDesktop }, location.origin);</script>`);
      return;
    }
    response.end(
      '<title>Research paper</title><h1>Research paper</h1><a href="/ordinary">Ordinary page</a>',
    );
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(site.address() as AddressInfo).port}`,
    recover: () => {
      fail = false;
    },
    close: () => {
      site.close();
      frame.close();
    },
  };
}
