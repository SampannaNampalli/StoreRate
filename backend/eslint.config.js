import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Logging is the only observability this service has; the handful of
      // deliberate call sites carry an inline disable, and this keeps the rest
      // from creeping in unnoticed.
      'no-console': 'warn',

      // An unused argument is often deliberate in Express - an error handler
      // must declare four parameters to be recognised as one.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-await': 'error',
      'require-await': 'error',
      'no-throw-literal': 'error',
    },
  },

  {
    // Command-line scripts and tests: printing to the terminal is the point.
    files: ['src/db/**/*.js', 'test/**/*.js'],
    rules: { 'no-console': 'off' },
  },
];
