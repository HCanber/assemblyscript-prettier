#!/usr/bin/env node

import * as fs from "node:fs";
import * as Path from "node:path";
import { exit } from "node:process";
import assemblyscript from "assemblyscript";
import prettier from "prettier";
import { Command } from "commander";
import FastGlob from "fast-glob";
import chalk from "chalk";
import ignore from "ignore";
import { SingleBar } from "cli-progress";
import getStdin from "get-stdin";

const readFile = fs.promises.readFile;
const writeFile = fs.promises.writeFile;

const prefix = "/*MAGIC_CODE_ASSEMBLYSCRIPT_PRETTIER";
const postfix = "MAGIC_CODE_ASSEMBLYSCRIPT_PRETTIER*/";

const stdinFilePathArgument = "stdin-filepath";

const isWindows = Path.sep === "\\";
function fixWindowsSlashes(pattern) {
  return isWindows ? pattern.replace(/\\/g, "/") : pattern;
}

function preProcess(code) {
  let program = assemblyscript.newProgram(assemblyscript.newOptions());
  try {
    assemblyscript.parse(program, code, "test.ts");
  } catch (e) {
    //not assemblyscript ts file
    return;
  }
  let source = program.sources[0];

  let NodeKind = assemblyscript.NodeKind;

  function visitDecorators(node) {
    let list = [];
    let _visit = (_node) => {
      switch (_node.kind) {
        case NodeKind.Source:
        case NodeKind.SOURCE: {
          _node.statements.forEach((statement) => {
            _visit(statement);
          });
          break;
        }
        case NodeKind.ClassDeclaration:
        case NodeKind.CLASSDECLARATION:
        case NodeKind.InterfaceDeclaration:
        case NodeKind.INTERFACEDECLARATION:
        case NodeKind.NamespaceDeclaration:
        case NodeKind.NAMESPACEDECLARATION: {
          _node.members.forEach((statement) => {
            _visit(statement);
          });
          break;
        }
        case NodeKind.EnumDeclaration:
        case NodeKind.ENUMDECLARATION:
        case NodeKind.MethodDeclaration:
        case NodeKind.METHODDECLARATION:
        case NodeKind.FunctionDeclaration:
        case NodeKind.FUNCTIONDECLARATION: {
          if (_node.decorators) {
            list.push(
              ..._node.decorators.map((decorator) => {
                return {
                  start: decorator.range.start,
                  end: decorator.range.end,
                };
              })
            );
          }
          break;
        }
        default: {
          errorAndExit('Unknown node kind "' + _node.kind + '".');
        }
      }
    };
    _visit(node);
    return list;
  }

  const decorators = visitDecorators(source);
  decorators.sort((a, b) => a.start - b.start);
  let cursor = 0;
  const removeDecoratorCodes = decorators.map((decorator) => {
    let s1 = code.slice(cursor, decorator.start);
    let s2 = code.slice(decorator.start, decorator.end);
    cursor = decorator.end;
    return `${s1}${prefix}${s2}`;
  });
  removeDecoratorCodes.push(code.slice(cursor));
  return removeDecoratorCodes.join(postfix);
}
/**
 *
 * @param {string} code
 * @returns {string}
 */
function postProcess(code) {
  return code.split(prefix).join("").split(postfix).join("");
}
async function resolveConfig(path, opts) {
  let config = (await prettier.resolveConfig(path, { config: opts.config })) || {};
  config.filepath = path;
  config.parser = "typescript";
  return config;
}
/**
 *
 * @param {string} path
 * @returns {Promise<string>}
 */
async function formatFile(path, opts) {
  const code = await readFile(path, { encoding: "utf8" });
  return await formatCode(code, path, opts);
}

async function formatCode(code, path, opts) {
  const tsCode = preProcess(code);
  let config = await resolveConfig(path, opts);
  const formatTsCode = prettier.format(tsCode, config);
  const formattedCode = postProcess(formatTsCode);
  return formattedCode;
}

async function check(path, opts) {
  const code = await readFile(path, { encoding: "utf8" });
  const tsCode = preProcess(code);
  let config = await resolveConfig(path, opts);
  return prettier.check(tsCode, config);
}

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

async function processPath(inputPath, ig, opts) {
  if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
    inputPath += "/**/*.ts";
  }
  const files = FastGlob.sync(inputPath, { dot: true });
  if (opts.ignorePath && fs.existsSync(opts.ignorePath)) {
    ig.add(fs.readFileSync(opts.ignorePath, { encoding: "utf8" }));
  }
  const filterFiles = ig.filter(files).filter((v) => v.endsWith(".ts"));
  const b1 = new SingleBar({
    format: chalk.cyan("{bar}") + "| {percentage}% || {value}/{total} Files || formatting '{file}'",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  if (opts.check) {
    let failedFiles = [];
    b1.start(filterFiles.length, 0, { file: "N/A" });
    await Promise.all(
      filterFiles.map(async (file) => {
        try {
          const checkResult = await check(file, opts);
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
      warning("Code style issues found in following files. Forgot to run Prettier?");
      log(`${failedFiles.map((v) => `- '${v}'`).join("\n")}`);
      exit(-1);
    } else {
      success("Perfect code style!");
    }
  } else if (opts.write) {
    b1.start(filterFiles.length, 0, { file: "N/A" });
    const results = await Promise.all(
      filterFiles.map(async (file) => {
        try {
          let code = await formatFile(file, opts);
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
    }
  } else {
    for (const file of filterFiles) {
      try {
        let code = await formatFile(file, opts);
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

async function processStdin(ig, opts) {
  if (!opts.stdinFilepath) {
    errorAndExit(`--${stdinFilePathArgument} must be specified when pipeing to stdin`);
  }
  const cwd = process.cwd();
  const filepath = Path.resolve(cwd, opts.stdinFilepath);
  const hasIgnoreFile = opts.ignorePath && fs.existsSync(opts.ignorePath);

  // If there's an ignore-path set, the filename must be relative to the
  // ignore path, not the current working directory.
  const relativeFilepath = hasIgnoreFile
    ? Path.relative(Path.dirname(opts.ignorePath), filepath)
    : Path.relative(cwd, filepath);

  let input = await getStdin();
  if (relativeFilepath && ig.ignores(fixWindowsSlashes(relativeFilepath))) {
    // Write using process.stdout.write to av oid adding an extra newline at the end
    process.stdout.write(input);
    return;
  }
  try {
    let code = await formatCode(input, filepath, opts);
    // Write using process.stdout.write to avoid adding an extra newline at the end
    process.stdout.write(code);
  } catch (err) {
    // Write without using any formatting as the error message
    // likely already contains formatting
    console.error(`ERROR in [${filepath}]\n`, formatError(err));
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
    const hasInputFileDefined = inputPath?.length > 0;
    const useStdin = !hasInputFileDefined && (!process.stdin.isTTY || opts.stdinFilepath);
    const ig = ignore({ allowRelativePaths: true }).add("node_modules");

    if (useStdin) {
      await processStdin(ig, opts);
      return;
    }
    await processPath(inputPath, ig, opts);
  });

try {
  await cmd.parseAsync(process.argv);
} catch (err) {
  errorAndExit(err);
}
