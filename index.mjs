#!/usr/bin/env node

import assemblyscript from "assemblyscript";
import prettier from "prettier";
import * as fs from "fs";
import { Command } from "commander";
import FastGlob from "fast-glob";
import { exit } from "process";
import chalk from "chalk";
import ignore from "ignore";
import { SingleBar } from "cli-progress";

const readFile = fs.promises.readFile;
const writeFile = fs.promises.writeFile;

const prefix = "/*MAGIC_CODE_ASSEMBLYSCRIPT_PRETTIER";
const postfix = "MAGIC_CODE_ASSEMBLYSCRIPT_PRETTIER*/";

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
          error('Unknown node kind "' + _node.kind + '".');
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
async function resolveConfig(path) {
  let config = (await prettier.resolveConfig(path)) || {};
  config.parser = "typescript";
  return config;
}

/**
 *
 * @param {string} path
 * @returns {Promise<string>}
 */
async function format(path) {
  const code = await readFile(path, { encoding: "utf8" });
  const tsCode = preProcess(code);
  let config = await resolveConfig(path);
  const formatTsCode = prettier.format(tsCode, config);
  const foramtCode = postProcess(formatTsCode);
  return foramtCode;
}
async function check(path) {
  const code = await readFile(path, { encoding: "utf8" });
  const tsCode = preProcess(code);
  let config = await resolveConfig(path);
  return prettier.check(tsCode, config);
}

const log = (...args) => {
  console.log(...args);
};
const success = (...args) => {
  console.log(chalk.bold.greenBright(...args));
};
const error = (...args) => {
  console.error(chalk.bold.redBright(...args));
  exit(-1);
};
const warning = (...args) => {
  console.log(chalk.bold.yellowBright(...args));
};

const cmd = new Command();
cmd
  .argument("<input-file>", "format file")
  .option("-c, --check", "Check if the given files are formatted")
  .option("-w, --write", "Edit files in-place. (Beware!)")
  .option("--ignore-path <path>", "Path to a file with patterns describing files to ignore.", ".asprettierignore")
  .action(async (inputPath, opts) => {
    if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
      inputPath += "/**/*.ts";
    }
    const files = FastGlob.sync(inputPath, { dot: true });
    const ig = ignore().add("node_modules");
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
          let checkResult;
          checkResult = await check(file);
          if (!checkResult) {
            failedFiles.push(file);
          }
          b1.increment({ file });
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
      await Promise.all(
        filterFiles.map(async (file) => {
          let code = await format(file);
          await writeFile(file, code);
          b1.increment({ file });
        })
      );
      b1.stop();
    } else {
      for (const file of filterFiles) {
        try {
          let code = await format(file);
          // Write using process.stdout.write to avoid adding an extra newline
          // at the end
          process.stdout.write(code);
        } catch (err) {
          // Write without using any formatting as the error message
          // likely already contains formatting
          console.error(file, "\n", err.toString());
          exit(1);
        }
      }
    }
  });

try {
  cmd.parse(process.argv);
} catch (e) {
  error(`${e}`);
}
