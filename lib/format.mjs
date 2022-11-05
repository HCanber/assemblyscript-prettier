import assemblyscript from "assemblyscript";
import prettier from "prettier";
import * as fs from "node:fs";
import * as Path from "node:path";
import { fixWindowsSlashes } from "./fixWindowsSlashes.mjs";

const prefix = "/*MAGIC_CODE_ASSEMBLYSCRIPT_PRETTIER";
const postfix = "MAGIC_CODE_ASSEMBLYSCRIPT_PRETTIER*/";

function preProcess(code) {
  const program = assemblyscript.newProgram(assemblyscript.newOptions());
  try {
    assemblyscript.parse(program, code, "test.ts");
  } catch (e) {
    //not assemblyscript ts file
    return;
  }
  const source = program.sources[0];

  const NodeKind = assemblyscript.NodeKind;

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
      }
    };
    _visit(node);
    return list;
  }

  const decorators = visitDecorators(source);
  decorators.sort((a, b) => a.start - b.start);
  let cursor = 0;
  const removeDecoratorCodes = decorators.map((decorator) => {
    const s1 = code.slice(cursor, decorator.start);
    const s2 = code.slice(decorator.start, decorator.end);
    cursor = decorator.end;
    return `${s1}${prefix}${s2}`;
  });
  removeDecoratorCodes.push(code.slice(cursor));
  return removeDecoratorCodes.join(postfix);
}
/**
 * @param {string} code
 * @returns {string}
 */
function postProcess(code) {
  return code.split(prefix).join("").split(postfix).join("");
}

async function resolveConfig(path, { config }) {
  const prettierOptions = (await prettier.resolveConfig(path, { config })) || {};
  prettierOptions.filepath = path;
  // prettierOptions.parser = "typescript";
  return prettierOptions;
}

/**
 * @param {string} code
 * @param {Options} [prettierOptions]
 * @returns {Promise<string>}
 */
export async function formatCode(code, prettierOptions) {
  const tsCode = preProcess(code);
  const prettierFormattedCode = prettier.format(tsCode, prettierOptions);
  const formattedCode = postProcess(prettierFormattedCode);
  return formattedCode;
}

/**
 * @param {string} code
 * @param {Options} [prettierOptions]
 * @returns {Promise<string>}
 */
export async function checkCode(code, prettierOptions) {
  const tsCode = preProcess(code);
  return prettier.check(tsCode, prettierOptions);
}

/**
 * @param {string} path
 * @param {OptionsConfig} [opts]
 * @param {string | undefined} [opts.cwd] - Optional: Current working directory. Defaults to process.cwd()
 * @param {IgnorePartial | undefined} [opts.ignore] - Optional: Ignore object which has a ignores function
 * @param {string | undefined} [opts.ignorePath] - Optional: Path to the loaded ignore file. Only specify it if exists
 * @returns {boolean}
 */
export function isIgnored(path, { ignorePath, ignore, cwd = process.cwd() } = {}) {
  if (!ignore) return false;
  // If there's an ignore-path set, the filename must be relative to the
  // ignore path, not the current working directory.
  const relativePath = ignorePath ? Path.relative(Path.dirname(ignorePath), path) : Path.relative(cwd, path);

  if (relativePath && ignore.ignores(fixWindowsSlashes(relativePath))) {
    return true;
  }

  return false;
}

/**
 * @param {string} code
 * @param {string} path
 * @param {OptionsConfig} opts
 * @returns {Promise<string>}
 */
export async function format(code, path, { config, ignorePath, ignore, cwd = process.cwd() } = {}) {
  const filepath = Path.resolve(cwd, path);

  // If file is ignored, return the original code
  if (isIgnored(filepath, { ignorePath, ignore, cwd })) {
    return code;
  }

  const prettierOptions = await resolveConfig(filepath, { config });
  return await formatCode(code, prettierOptions);
}

/**
 * @param {string} code
 * @param {string} path
 * @param {OptionsConfig} opts
 * @returns {Promise<boolean>}
 */
export async function check(code, path, { config, ignorePath, ignore, cwd = process.cwd() } = {}) {
  const filepath = Path.resolve(cwd, path);

  // If file is ignored, return the original code
  if (isIgnored(filepath, { ignorePath, ignore, cwd })) {
    return true;
  }

  const prettierOptions = await resolveConfig(path, { config });
  return await checkCode(code, prettierOptions);
}

/**
 * Options object with an optional path to a prettier config file
 * @typedef {Object} OptionsConfig
 * @property {string | undefined} [cwd] - Optional: Current working directory. Defaults to process.cwd()
 * @property {string | undefined} [config] - Optional: Path of the prettier config file if you don't wish to search for it
 * @property {IgnorePartial | undefined} [ignore] - Optional: Ignore object which has a ignores function
 * @property {string | undefined} [ignorePath] - Optional: Path to the loaded ignore file. Only specify it if exists
 */

/**
 * @typedef { import("prettier").Options } Options
 */
/**
 * @typedef { import("./ignore.mjs").IgnorePartial } IgnorePartial
 */
