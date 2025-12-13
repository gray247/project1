// eslint.config.js — ESLint v9 Flat Config
import js from "@eslint/js";

const sharedGlobals = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  fetch: "readonly",
  Image: "readonly",
  location: "readonly",
  chrome: "readonly",
  Node: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  process: "readonly",
  Buffer: "readonly",
  URL: "readonly",
};

const nodeGlobals = {
  ...sharedGlobals,
  require: "readonly",
  module: "readonly",
  __dirname: "readonly",
};

const jestGlobals = {
  describe: "readonly",
  test: "readonly",
  jest: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
  expect: "readonly",
  global: "readonly",
};

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: sharedGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn"],
      "no-undef": ["error"],
      "prefer-const": "warn",
    },
  },

  {
    files: ["SnipBoardExtension/**/*.js"],
    languageOptions: {
      globals: {
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        location: "readonly",
        Node: "readonly",
        Image: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },

  {
    files: ["jest.config.js", "devtest.js", "main.js", "src/**/*.js", "tests/**/*.js", "preload.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
  },

  {
    files: ["renderer.js", "ui_*.js", "modals.js"],
    languageOptions: {
      sourceType: "module",
    },
  },

  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: jestGlobals,
    },
  },
  {
    files: ["state.js"],
    rules: {
      "no-useless-escape": "off",
    },
  },
];
