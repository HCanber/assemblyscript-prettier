#!/usr/bin/env node

import * as fs from "node:fs";
import { format, check } from "./format.mjs";

const readFile = fs.promises.readFile;

/**
 * @param {string} path
 * @param {OptionsConfig} opts
 * @returns {Promise<string>}
 */
export async function formatFile(path, { config, ignorePath, ignore, cwd }) {
  const code = await readFile(path, { encoding: "utf8" });
  return await format(code, path, { config, ignorePath, ignore, cwd });
}

/**
 * @param {string} path
 * @param {OptionsConfig} opts

 * @returns {Promise<boolean>}
 */
export async function checkFile(path, { config, ignorePath, ignore, cwd }) {
  const code = await readFile(path, { encoding: "utf8" });
  return await check(code, path, { config, ignorePath, ignore, cwd });
}

/**
 * @typedef { import("./format.mjs").OptionsConfig } OptionsConfig
 */
