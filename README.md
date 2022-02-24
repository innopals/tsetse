# tsetse

tsetse checker from https://github.com/bazelbuild/rules_typescript/tree/master/internal/tsetse

## Supported checks

https://tsetse.info

## Use it as LSP

1.  Add tsetse as a dev dependency: `yarn add tsetse --dev`
2.  Use workspace version of TypeScript
3.  Add the plugin via
    [plugins](https://www.typescriptlang.org/tsconfig#plugins) compiler option
    in the tsconfig. If you are using tsetse as a package then the path to the
    plugin might look like this:

    ```jsonc
    {
      "compilerOptions": {
        "plugins": [
          {
            "name": "tsetse"
          }
        ]
      }
    }
    ```

4.  Restart the editor to reload TS initialization features.

Make sure the LSP is using (requiring) the same workspace version of TS used by the IDE.
