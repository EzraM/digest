import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from './vite.base.config';

// BlockNote's published CommonJS build currently mis-wraps Tiptap's default
// exports. Bundle the ESM dependency graph into the main process build instead.
// y-prosemirror must be part of that same graph: leaving it external makes it
// load ProseMirror from node_modules while BlockNote uses Rollup's bundled
// copy, and ProseMirror rejects nodes created by the other copy.
const mainExternal = external.filter(
  (dependency) =>
    typeof dependency !== 'string' ||
    (!dependency.startsWith('@blocknote/') &&
      !dependency.startsWith('@tiptap/') &&
      !dependency.startsWith('prosemirror-') &&
      dependency !== 'y-prosemirror'),
);

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'build'>;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);
  const config: UserConfig = {
    build: {
      lib: {
        entry: forgeConfigSelf.entry!,
        fileName: () => '[name].js',
        formats: ['cjs'],
      },
      rollupOptions: {
        external: mainExternal,
      },
    },
    plugins: [pluginHotRestart('restart')],
    define,
    resolve: {
      // Load the Node.js entry.
      mainFields: ['module', 'jsnext:main', 'jsnext'],
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
