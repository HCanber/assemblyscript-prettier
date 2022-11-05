import * as fs from "node:fs";
import ignore from "ignore";

export async function createIgnore(ignorePath) {
  const ig = ignore({ allowRelativePaths: true }).add("node_modules");
  const hasIgnoreFile = ignorePath && fs.existsSync(ignorePath);
  if (hasIgnoreFile) {
    ig.add(fs.readFileSync(ignorePath, { encoding: "utf8" }));
  }
  return { ignore: ig, hasIgnoreFile };
}

/**
 * Ignore object. This is a partial instance of the ignore package Ignore interface
 * @typedef {Object} IgnorePartial
 * @property {IgnorePartial~ignoresFn} ignores - A function that eturns Boolean whether pathname should be ignored.
 */

/** Returns Boolean whether pathname should be ignored.
 * @callback IgnorePartial~ignoresFn
 * @param  {string} pathname a path to check
 * @returns {boolean}
 */
