> **Note**: This is a fork of https://github.com/HerrCai0907/assemblyscript-prettier thats been customized to work in vs-code with the [VSCode Custom Local Formatters](https://marketplace.visualstudio.com/items?itemName=jkillian.custom-local-formatters) extension.

---

# assemblyscript-prettier

[Prettier](https://prettier.io/) for [AssemblyScript](https://www.assemblyscript.org/).

## Install

~~npm i -D assemblyscript-prettier~~
See below

## Usage

```
as-prettier [options] [input-file]

Arguments:
  input-file               format file

Options:
  -c, --check              Check if the given files are formatted
  -w, --write              Edit files in-place. (Beware!)
  --config <path>          Path to a Prettier configuration file (.prettierrc, package.json,
                           prettier.config.js).
  --ignore-path <path>     Path to a file with patterns describing files to ignore. (default:
                           ".asprettierignore")
  --stdin-filepath <path>  Path to the file to pretend that stdin comes from. Must be set when
                           stdin is used
  -h, --help               display help for command

By default, output is written to stdout.
Stdin is read if it is piped to as-prettier and no files are given.
```

### as-prettier-stdin

For reading from stdin there is a slimmer version that also can run using bun

```
as-prettier-stdin filePath [--ignoreFile=path] [--prettierConfigPath=path]

Reads from stdin and writes output to stdout. The path to the file in stdin must be specified as first argument.

Options:
  --ignoreFile=path           Path to a ignore file with globs of paths to ignore
  --prettierConfigPath=path   Path to a prettier config file
```

### VS Code

To use this as a formatter in VS Code follow these steps.

1. Install the extension [VSCode Custom Local Formatters](https://marketplace.visualstudio.com/items?itemName=jkillian.custom-local-formatters)

2. Install this repo in your node_modules

   **Yarn 1:**

   ```sh
   yarn add -D https://github.com/HCanber/assemblyscript-prettier
   ```

   **Yarn 2+:**

   ```sh
   yarn add -D assemblyscript-prettier@github:HCanber/assemblyscript-prettier
   ```

   **NPM:**

   ```sh
   npm install -D git+https://github.com/HCanber/assemblyscript-prettier.git
   ```

3. Open the workspace (i.e. your code) in VS Code

4. Execute the command (Press <kbd>⇧</kbd><kbd>⌘</kbd><kbd>P</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> to open Command Palette in VS Code):

   _Preferences: Open Workspace Settings (JSON)_

   to open the json file with workspace settings.

5. Add the following settings

   ```json
   {
     "[typescript]": {
       "editor.defaultFormatter": "jkillian.custom-local-formatters"
     },
     "customLocalFormatters.formatters": [
       {
         "command": "node_modules/.bin/as-prettier-stdin \"${file}\"",
         "languages": ["typescript"]
       }
     ]
   }
   ```

   Specify the path to where `as-prettier-stdin` is installed. This might vary. The root of the current project will be working directory for the command. Note that this is true also for [Multi-root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces), i.e. it will be the root of the project for the file being formatted, not the root of all projects.

   So for a Multi-root Workspace you might need to specify:

   ```json
     "command": "../node_modules/.bin/as-prettier-stdin \"${file}\"",
   ```

   It's also possible to use `npm bin` to find the location (on osx/linux at least):

   ```json
     "command": "$(npm bin)/as-prettier-stdin \"${file}\"",
   ```

   ... or to use `npx`:

   ```json
     "command": "npx as-prettier-stdin \"${file}\"",
   ```

   All these alternatives are slower than just specifying a path, so go with that if possible. You may also specify an absolute path.

   It's also possible (at least at the time of writing this) to use [bun](https://bun.sh/) instead of node. Just insert `bun` before the path:

   ```json
     "command": "bun node_modules/.bin/as-prettier-stdin \"${file}\"",
   ```

   It's _slightly_ faster, than using node, but not much unfortunately.

Everytime you save an AssemblyScript file it will be formatted using as-prettier-stdin.
If error occurs, see _Output_ > _Custom Local Formatters_ window.

Unfortunately, since VS Code thinks the AssemblyScript files actually are TypeScript files, this means all Typescript files in your workspace will also be formatted using as-prettier-stdin. It will work fine, but will be slower than the prettier.

### Ignore file

It's possible to specify a file with globs of paths to ignore (just like `.prettierignore`). This is useful if you have a lot of files that you don't want to format. The default path is `.asprettierignore` in the root of the project (if you're in a [Multi-root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) you need one in each project root). You can specify a different path using the `--ignoreFile` option.

## How it works

AssemblyScripts syntax is the same as TypeScript except AssemblyScript allows [decorators](https://www.assemblyscript.org/concepts.html#code-annotations) on any non class members such as functions and constants, while [TypeScript only allows it on classes and its members](https://www.typescriptlang.org/docs/handbook/decorators.html).

This means Prettier will not be able to parse files with for example an `@inline` decorator on a top level function:

```ts
// @ts-ignore: decorator
@inline
export function add(a: i32, b: i32): i32 {
  return a + b;
}
```

The proper way would probably be to "inherit" from Prettiers Typescript parser and create an AssemblyScript parser, but that is in no way an easy task, or even possible.

So here is how as-prettier works

1. The file is parsed using AssemblyScript's parser
2. During parsing, if a decorator is found, it's replaced with a comment
3. Next, prettier is used to format the file.
4. In the formatted file the decorator comments are replaced with the original decorators.

This means that decorators will be positioned the same as comments.

Running both AssemblyScript's parser and then Prettier's parser and formatter is what makes as-prettier slower than the prettier-formatter inside VS Code
