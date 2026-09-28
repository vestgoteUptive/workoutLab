// Lighthouse budgets for NFR-PERF-5 (D-0046 §10). Runs against the static
// server over the already-built dist/ (package.json's test:browser script
// builds first), mobile form factor, default simulated throttling, median
// of 3 runs. Filesystem upload only — never temporary-public-storage.
module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      url: ["/index.html", "/privacy/index.html"],
      numberOfRuns: 3,
      // Mobile form factor with default simulated throttling is Lighthouse's
      // default when no preset is given ("mobile" isn't a valid --preset
      // value; "desktop" is what opts out of it).
      settings: {},
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./lighthouse-report",
    },
  },
};
