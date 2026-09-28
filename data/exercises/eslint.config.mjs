import base from "../../eslint.config.mjs";

export default [
  ...base,
  {
    ignores: ["library/**", "schema.json"],
  },
];
