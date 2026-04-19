const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports a .wasm file directly; Metro needs it
// treated as an asset rather than a source module.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Expo serves the public/ directory at the root in production, but not
// during `expo start`. This middleware adds the same behavior in dev so
// `/sql-wasm.wasm` (and any other vendored static asset) is reachable.
const publicDir = path.join(__dirname, 'public');
const mimeTypes = {
  '.wasm': 'application/wasm',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
};

config.server = {
  ...config.server,
  enhanceMiddleware(middleware) {
    return (req, res, next) => {
      if (req.url) {
        const urlPath = req.url.split('?')[0];
        const filePath = path.join(publicDir, urlPath);
        if (
          filePath.startsWith(publicDir) &&
          fs.existsSync(filePath) &&
          fs.statSync(filePath).isFile()
        ) {
          const ext = path.extname(filePath);
          res.setHeader(
            'Content-Type',
            mimeTypes[ext] || 'application/octet-stream',
          );
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
