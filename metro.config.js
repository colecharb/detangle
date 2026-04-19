const https = require('https');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports a .wasm file directly; Metro needs it
// treated as an asset rather than a source module.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Dev-only proxy for GitHub's OAuth endpoints, which don't set CORS
// headers and therefore can't be called from a browser. On web, the app
// calls `/__gh/login/device/code` and `/__gh/login/oauth/access_token`
// and we forward to https://github.com/... with permissive CORS headers.
// Native platforms skip the proxy and hit github.com directly.
config.server = {
  ...config.server,
  enhanceMiddleware(middleware) {
    return (req, res, next) => {
      if (!req.url || !req.url.startsWith('/__gh/')) {
        return middleware(req, res, next);
      }

      const corsHeaders = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': 'content-type,accept,authorization',
        'access-control-max-age': '86400',
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      const path = req.url.slice('/__gh'.length);
      const forwardHeaders = { ...req.headers };
      delete forwardHeaders.host;
      delete forwardHeaders.origin;
      delete forwardHeaders.referer;
      delete forwardHeaders['content-length'];
      forwardHeaders.host = 'github.com';

      const upstream = https.request(
        {
          hostname: 'github.com',
          port: 443,
          path,
          method: req.method,
          headers: forwardHeaders,
        },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode || 502, {
            ...upstreamRes.headers,
            ...corsHeaders,
          });
          upstreamRes.pipe(res);
        },
      );
      upstream.on('error', (err) => {
        res.writeHead(502, { 'content-type': 'text/plain', ...corsHeaders });
        res.end(`Proxy error: ${err.message}`);
      });
      req.pipe(upstream);
    };
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
