import nginxHeaders from '../../nginx.security-headers.conf?raw';
import vercelConfig from '../../../../vercel.json?raw';

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/** nginx (compose) and Vercel each need the headers in their own format. */
it('sends the same security headers from nginx and from Vercel', () => {
  const nginx = [...nginxHeaders.matchAll(/^add_header (\S+) "(.*)" always;$/gm)].map(
    ([, key, value]) => ({ key, value }),
  );
  const config = JSON.parse(vercelConfig) as { services: { web: { headers: HeaderRule[] } } };
  const vercel = config.services.web.headers.find((rule) => rule.source === '/(.*)')?.headers;

  expect(nginx.length).toBeGreaterThan(0);
  expect(vercel).toEqual(nginx);
});
