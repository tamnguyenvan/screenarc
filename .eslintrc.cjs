module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2020: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'react-refresh',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.node.json'], // Help ESLint understand project structure
  },
  settings: {
    react: {
      version: 'detect', // Automatically detect React version
    },
  },
  // Files and directories to ignore during linting
  ignorePatterns: [
    'dist',
    'dist-electron',
    'node_modules',
    '.eslintrc.cjs',
    'vite.config.ts',
  ],
  rules: {
    // Enforce only exporting components in .tsx files
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // Some suggestions to keep code clean
    '@typescript-eslint/no-explicit-any': 'warn', // Warn when using `any` type
    '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }], // Warn unused variables
  },
};