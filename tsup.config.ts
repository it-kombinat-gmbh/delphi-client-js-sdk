import { defineConfig } from 'tsup'

export default defineConfig([
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Headless core (zero runtime dependencies)
    // ─────────────────────────────────────────────────────────────────────────
    {
        name: 'core',
        entry: { index: 'src/index.ts' },
        format: ['esm', 'cjs'],
        dts: true,
        clean: true,
        outDir: 'dist',
        treeshake: true,
        target: 'es2022',
        platform: 'browser',
        sourcemap: true,
        outExtension({ format }) {
            return { js: format === 'esm' ? '.mjs' : '.cjs' }
        },
        // React peer dep is not used in core
        external: ['react', 'react-dom'],
        esbuildOptions(options) {
            options.conditions = ['browser']
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 2. React bindings (/react sub-path)
    // ─────────────────────────────────────────────────────────────────────────
    {
        name: 'react',
        entry: { 'react/index': 'src/react/index.ts' },
        format: ['esm', 'cjs'],
        dts: true,
        clean: false,
        outDir: 'dist',
        treeshake: true,
        target: 'es2022',
        platform: 'browser',
        sourcemap: true,
        outExtension({ format }) {
            return { js: format === 'esm' ? '.mjs' : '.cjs' }
        },
        external: ['react', 'react-dom', 'react/jsx-runtime'],
        esbuildOptions(options) {
            options.jsx = 'automatic'
            options.conditions = ['browser']
        },
    },
])
