const esbuild = require('esbuild');
const process = require('process');
const isProd = process.env.BUILD === 'production';

const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'main.js',
  sourcemap: !isProd ? 'inline' : false,
  platform: 'node',
  format: 'cjs',
  external: ['obsidian'],
  minify: isProd,
};

if (!isProd) {
  buildOptions.watch = {
    onRebuild(error, result) {
      if (error) console.error('watch build failed:', error);
      else console.log('watch build succeeded:', result);
    },
  };
}

esbuild.build(buildOptions).catch(() => process.exit(1));

