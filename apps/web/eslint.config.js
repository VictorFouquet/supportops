import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import root from '../../eslint.config.js';

export default [
  ...root,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
  { ignores: ['.next/**', 'next-env.d.ts'] },
];
