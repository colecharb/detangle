const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports a .wasm file directly; Metro needs it
// treated as an asset rather than a source module.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Cross-origin isolation headers: required for expo-sqlite's OPFS
// access handles and SharedArrayBuffer to work reliably on web.
config.server = {
  ...config.server,
  enhanceMiddleware(middleware) {
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      return middleware(req, res, next);
    };
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
