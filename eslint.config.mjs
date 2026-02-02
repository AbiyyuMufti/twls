import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import typescriptEslint from "typescript-eslint";

export default defineConfig(
  eslint.configs.recommended,
  typescriptEslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
  },
  {
    plugins: {
      "@typescript-eslint": typescriptEslint.plugin,
    },

    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        projectService: true,
      },
    },

    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],

      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "warn",

      "@typescript-eslint/explicit-function-return-type": "error",
    },
  },
  {
    files: ["eslint.config.mjs"],
    extends: [typescriptEslint.configs.disableTypeChecked],
  },
);
