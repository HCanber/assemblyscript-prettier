#!/usr/bin/env node

import * as fs from "node:fs";
import { exit } from "node:process";
import { Command } from "commander";
import FastGlob from "fast-glob";
import chalk from "chalk";
import { createIgnore } from "./lib/ignore.mjs";
import { SingleBar } from "cli-progress";
import { formatFile, checkFile } from "./lib/formatFile.mjs";
import { format } from "./lib/format.mjs";

const writeFile = fs.promises.writeFile;

const stdinFilePathArgument = "stdin-filepath";

const formatError = (err) => (err.name === "SyntaxError" ? err.message : err.stack);
const formatLogArgs = (args) => args.map((a) => (a instanceof Error ? formatError(a) : a));

const log = (...args) => {
  console.log(...formatLogArgs(args));
};

const success = (...args) => {
  console.log(chalk.bold.greenBright(...formatLogArgs(args)));
};

const errorAndExit = (...args) => {
  console.error(chalk.bold.redBright(...formatLogArgs(args)));
  exit(-1);
};

const warning = (...args) => {
  console.log(chalk.bold.yellowBright(...formatLogArgs(args)));
};

async function processPath(inputPath, { config, ignorePath, ignore, cwd, opts }) {
  if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
    inputPath += "/**/*.ts";
  }
  const filterFiles = ignore.filter(files).filter((v) => v.endsWith(".ts"));
  const b1 = new SingleBar({
    format: chalk.cyan("{bar}") + "| {percentage}% || {value}/{total} Files || formatting '{file}'",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
    clearOnComplete: true,
  });

  if (opts.check) {
    let failedFiles = [];
    b1.start(filterFiles.length, 0, { file: "N/A" });
    await Promise.all(
      filterFiles.map(async (file) => {
        try {
          const checkResult = await checkFile(file, { config, ignorePath, ignore, cwd });
          if (!checkResult) {
            failedFiles.push(file);
          }
          b1.increment({ file });
        } catch (err) {
          errorAndExit("\n", err);
        }
      })
    );
    b1.stop();
    if (failedFiles.length > 0) {
      warning("Code style issues found in following files. Forgot to run as-prettier?");
      log(`${failedFiles.map((v) => `- '${v}'`).join("\n")}`);
      exit(-1);
    } else {
      success("Perfect code style! Checked", filterFiles.length, filterFiles.length === 1 ? "file" : "files");
    }
  } else if (opts.write) {
    b1.start(filterFiles.length, 0, { file: "N/A" });
    const results = await Promise.all(
      filterFiles.map(async (file) => {
        try {
          let code = await formatFile(file, { config, ignorePath, ignore, cwd });
          await writeFile(file, code);
          b1.increment({ file });
          return true;
        } catch (err) {
          // Write without using any formatting as the error message
          // likely already contains formatting
          console.error(`\nERROR [${file}]\n`, formatError(err));
          return false;
        }
      })
    );
    b1.stop();
    if (!results.reduce((b, c) => b && c, true)) {
      exit(1);
    } else {
      success("Formatted", filterFiles.length, filterFiles.length === 1 ? "file" : "files");
    }
  } else {
    for (const file of filterFiles) {
      try {
        let code = await formatFile(file, { config, ignorePath, ignore, cwd });
        // Write using process.stdout.write to avoid adding an extra newline
        // at the end
        process.stdout.write(code);
      } catch (err) {
        // Write without using any formatting as the error message
        // likely already contains formatting
        console.error(`ERROR in [${file}]\n`, formatError(err));
        exit(1);
      }
    }
  }
}

async function processStdIn(path, { config, ignorePath, ignore }) {
  try {
    const { default: getStdin } = await import("get-stdin");
    const input = await getStdin();
    const formattedCode = await format(input, path, {
      config,
      ignorePath,
      ignore,
    });
    // Write using process.stdout.write to avoid adding an extra newline at the end
    process.stdout.write(formattedCode);
    return;
  } catch (err) {
    // Write without using any formatting as the error message
    // likely already contains formatting
    console.error(`ERROR in [${path}]\n`, formatError(err));
    exit(1);
  }
}

const cmd = new Command();
cmd
  .argument("[input-file]", "format file")
  .option("-c, --check", "Check if the given files are formatted")
  .option("-w, --write", "Edit files in-place. (Beware!)")
  .option("--config <path>", "Path to a Prettier configuration file (.prettierrc, package.json, prettier.config.js).")
  .option("--ignore-path <path>", "Path to a file with patterns describing files to ignore.", ".asprettierignore")
  .option(
    `--${stdinFilePathArgument} <path>`,
    "Path to the file to pretend that stdin comes from. Must be set when stdin is used"
  )
  .addHelpText(
    "after",
    "\nBy default, output is written to stdout.\nStdin is read if it is piped to as-prettier and no files are given."
  )
  .action(async (inputPath, opts) => {
    const config = opts.config;
    const hasInputFileDefined = inputPath?.length > 0;
    const useStdin = !hasInputFileDefined && (!process.stdin.isTTY || opts.stdinFilepath);

    const { ignore, hasIgnoreFile } = await createIgnore(opts.ignorePath);
    const ignorePath = hasIgnoreFile ? opts.ignorePath : undefined;

    if (useStdin) {
      const stdinFilepath = opts.stdinFilepath;
      if (!stdinFilepath) {
        errorAndExit(`--${stdinFilePathArgument} must be specified when pipeing to stdin`);
      }
      await processStdIn(stdinFilepath, { config, ignorePath, ignore });
    } else {
      await processPath(inputPath, {
        config,
        ignorePath,
        ignore,
        opts,
      });
    }
  });

try {
  await cmd.parseAsync(process.argv);
} catch (err) {
  errorAndExit(err);
}
