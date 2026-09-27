import type { ESLint, Rule } from "eslint";

declare const plugin: ESLint.Plugin & { rules: { "no-raw-colour": Rule.RuleModule } };
export default plugin;
