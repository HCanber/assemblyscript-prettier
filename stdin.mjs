#!/usr/bin/env node

import { exit } from "node:process";
import * as _ignored from "./lib/polyFillRequire.js";

let runningInBun = !!global.Bun;
let getStdin;
let writeStdOut;
if (runningInBun) {
  const bun = global.Bun;

  // Polyfill some things not yet implemented on Bun
  // const _ignored = await import("./lib/polyFillRequire.js");
  // await import("./lib/polyFillRequire.js");
  if (!global.require?.resolve) {
    // global.require = import.meta.require;
    // global.require.resolve = (request, options) => {
    //   return Module._resolveFilename(request, options);
    // };
  }
  if (typeof process.stderr == "undefined") {
    process.stderr = Bun.stderr;
  }

  getStdin = () => bun.readAllStdinSync();
  writeStdOut = (s) => bun.write(bun.stdout, s);
} else {
  getStdin = (await import("get-stdin")).default;
  writeStdOut = (s) => process.stdout.write(s);
}

function usage() {
  console.error(`Usage: ` + process.argv[1] + ` filePath [--ignoreFile=path] [--prettierConfigPath=path]\n`);
  console.error(
    "Reads from stdin and writes output to stdout. The path to the file in stdin must be specified as first argument.\n"
  );
  console.error("Options:");
  console.error("  --ignoreFile=path           Path to a ignore file with globs of paths to ignore");
  console.error("  --prettierConfigPath=path   Path to a prettier config file");
  exit(0);
}

try {
  const argv = process.argv;
  if (argv.includes("--help")) {
    usage();
  }
  let fileName = undefined;
  let config = undefined;
  let ignorePath = undefined;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("-")) {
      let validArgument = false;
      if (arg.startsWith("-", 1)) {
        if (arg.startsWith("prettierConfigPath=", 2)) {
          config = arg.split("=")[1];
          validArgument = true;
        } else if ((arg.startsWith("ignoreFile="), 2)) {
          ignorePath = arg.split("=")[1];
          validArgument = true;
        } else if (arg === "--help") {
          usage();
        }
      }
      if (!validArgument) {
        console.error("Unknown argument:", arg);
        usage();
      }
    } else {
      if (fileName) {
        console.error("Only one file can be specified");
        usage();
      }
      fileName = arg;
    }
  }
  if (!fileName) {
    console.error("No file specified");
    usage();
  }
  // Cannot import at top level because it will be evaluated before bun polyfills are in place
  const { createIgnore } = await import("./lib/ignore.mjs");
  const { format } = await import("./lib/format.mjs");

  const [input, { ignore, hasIgnoreFile }] = await Promise.all([getStdin(), createIgnore(ignorePath)]);

  const formattedCode = await format(input, fileName, {
    config,
    ignorePath: hasIgnoreFile ? ignorePath : undefined,
    ignore,
  });
  writeStdOut(formattedCode);
} catch (err) {
  console.error(err);
  exit(-1);
}
