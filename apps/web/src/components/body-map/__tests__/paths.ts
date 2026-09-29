import { resolve } from "node:path";

/** The component folder, relative to the package root (vitest runs with cwd = apps/web). */
export const COMPONENT_DIR = resolve(process.cwd(), "src/components/body-map");
export const CSS_PATH = resolve(COMPONENT_DIR, "body-map.css");
