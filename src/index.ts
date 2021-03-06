import ts from 'typescript/lib/tsserverlibrary';
import { Checker } from './checker';
import * as pluginApi from './plugin_api';
import { registerRules } from './runner';

// Installs the Tsetse language server plugin, which checks Tsetse rules in your
// editor and shows issues as semantic errors (red squiggly underline).

function init() {
  return {
    create(info: ts.server.PluginCreateInfo) {
      const oldService = info.languageService;
      const proxy = pluginApi.createProxy(oldService);
      proxy.getSemanticDiagnostics = (fileName: string) => {
        const program = oldService.getProgram();
        if (!program) {
          throw new Error(
            'Failed to initialize tsetse language_service_plugin: program is undefined',
          );
        }
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) {
          throw new Error(
            'Failed to initialize tsetse language_service_plugin: sourceFile is undefined',
          );
        }

        const checker = new Checker(program);

        // Add disabledRules to tsconfig to disable specific rules
        // "plugins": [
        //   {"name": "...", "disabledRules": ["equals-nan"]}
        // ]
        registerRules(checker, info.config.disabledRules || []);
        const result = [...oldService.getSemanticDiagnostics(fileName)];
        // Note that this ignores suggested fixes.
        result.push(
          ...checker.execute(sourceFile).map(failure => failure.toDiagnostic()),
        );
        return result;
      };
      return proxy;
    },
  };
}

export = init;
