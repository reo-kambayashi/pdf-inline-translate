const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = [
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  ...tseslint.configs.recommended,
];