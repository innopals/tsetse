import * as path from 'path';
import ts from 'typescript';
import { Checker } from './checker';
import { createDiagnosticsReporter, FORMAT_DIAGNOSTIC_HOST } from './report';
import { registerRules } from './runner';

export function getConfiguredChecker(program: ts.Program): {
  checker: Checker;
  errors: ts.Diagnostic[];
} {
  const checker = new Checker(program);
  const errors: ts.Diagnostic[] = [];
  const compilerOptions = program.getCompilerOptions();
  const defaultNotConfiguredError = {
    source: 'tsetse',
    category: ts.DiagnosticCategory.Error,
    code: 21110,
    file: undefined,
    start: undefined,
    length: undefined,
    messageText: `Tsetse not configured in tsconfig plugins`,
  };
  if (!Array.isArray(compilerOptions.plugins)) {
    errors.push(defaultNotConfiguredError);
  } else {
    const tsetseConfig = (compilerOptions.plugins as any[]).find(
      plugin => plugin.name === 'tsetse',
    );
    if (!tsetseConfig) {
      errors.push(defaultNotConfiguredError);
    } else if (Array.isArray(tsetseConfig.disabledRules)) {
      registerRules(checker, tsetseConfig.disabledRules || []);
    } else {
      registerRules(checker, []);
    }
  }

  return { checker, errors };
}

/** Perform security checks on a single project. */
export function performCheck(program: ts.Program): ts.Diagnostic[] {
  const { checker, errors } = getConfiguredChecker(program);

  // Run all enabled checks and collect errors.
  for (const sf of program.getSourceFiles()) {
    // We don't emit errors for declarations, so might as well skip checking
    // declaration files all together.
    if (sf.isDeclarationFile) continue;
    errors.push(
      ...checker
        .execute(sf)
        .map(failure => failure.toDiagnosticWithStringifiedFix()),
    );
  }

  return errors;
}

/**
 * A simple tsc wrapper that runs Tsetse checks over the source files
 * and emits code for files without violations.
 */
function main(args: string[]) {
  let parsedConfig = ts.parseCommandLine(args);
  if (parsedConfig.errors.length !== 0) {
    // Same as tsc, do not emit colorful diagnostic texts for command line
    // parsing errors.
    ts.sys.write(
      ts.formatDiagnostics(parsedConfig.errors, FORMAT_DIAGNOSTIC_HOST),
    );
    return 1;
  }

  // If no source files are specified through command line arguments, there
  // must be a configuration file that tells the compiler what to do. Try
  // looking for this file and parse it.
  if (parsedConfig.fileNames.length === 0) {
    let tsConfigFilePath: string | undefined = parsedConfig.options.project;
    if (tsConfigFilePath === undefined) {
      tsConfigFilePath = ts.findConfigFile('.', ts.sys.fileExists);
      if (tsConfigFilePath === undefined) {
        ts.sys.write('tsetse: Cannot find project configuration.');
        ts.sys.write(ts.sys.newLine);
        return 1;
      }
    }
    if (ts.sys.directoryExists(tsConfigFilePath)) {
      tsConfigFilePath = path.resolve(tsConfigFilePath, 'tsconfig.json');
    }
    if (!ts.sys.fileExists(tsConfigFilePath)) {
      ts.sys.write('tsetse: Cannot find project configuration.');
      ts.sys.write(ts.sys.newLine);
      return 1;
    }
    const parseConfigFileHost: ts.ParseConfigFileHost = {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic: ts.Diagnostic) => {
        ts.sys.write(ts.formatDiagnostic(diagnostic, FORMAT_DIAGNOSTIC_HOST));
        ts.sys.exit(1);
      },
    };
    const parsedFromConfigFile = ts.getParsedCommandLineOfConfigFile(
      tsConfigFilePath,
      parsedConfig.options,
      parseConfigFileHost,
    );
    if (!parsedFromConfigFile) {
      ts.sys.write('tsetse: Fail to parse from find project configuration.');
      ts.sys.write(ts.sys.newLine);
      return 1;
    }
    parsedConfig = parsedFromConfigFile;
  }

  const diagnostics = [...parsedConfig.errors];
  const compilerHost = ts.createCompilerHost(parsedConfig.options, true);

  const program = ts.createProgram(
    parsedConfig.fileNames,
    parsedConfig.options,
    compilerHost,
  );

  diagnostics.push(
    ...ts.getPreEmitDiagnostics(program),
    ...performCheck(program),
  );

  // If there are errors while noEmitOnError is set, refrain from emitting code.
  if (diagnostics.length !== 0 && parsedConfig.options.noEmitOnError === true) {
    // We have to override this flag because tsetse errors are not visible
    // to the actual compiler. Without `noEmit` being set, the compiler will
    // emit JS code if no other errors are found, even though we already know
    // there are violations at this point.
    program.getCompilerOptions().noEmit = true;
  }

  const result = program.emit();
  diagnostics.push(...result.diagnostics);

  const reportDiagnostics = createDiagnosticsReporter(parsedConfig.options);
  const errorCount = reportDiagnostics(diagnostics, /*withSummary*/ true);

  return errorCount === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
