import globals from "globals";

export default [
  {
    files: ["src/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-implicit-globals": "error",
      "no-redeclare": "error",
      "no-dupe-keys": "warn",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-var": "warn",
      "prefer-const": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "prototype/**"],
  },
];
