module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json"
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/stylistic"
  ],
  env: {
    browser: true,
    node: true,
    es2020: true
  },
  rules: {
    "@typescript-eslint/explicit-module-boundary-types": "off"
  }
};
