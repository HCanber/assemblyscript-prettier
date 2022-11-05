import * as Path from "node:path";

const isWindows = Path.sep === "\\";
export function fixWindowsSlashes(pattern) {
  return isWindows ? pattern.replace(/\\/g, "/") : pattern;
}
