import { cleanupVitestTmp, redirectVitestTmp } from "../../vitest.tmp";
cleanupVitestTmp(redirectVitestTmp(import.meta.url));
export default {};
