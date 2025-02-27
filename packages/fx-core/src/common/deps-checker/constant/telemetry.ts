// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export enum DepsCheckerEvent {
  clickLearnMore = "env-checker-click-learn-more",
  clickCancel = "env-checker-click-cancel",

  nodeNotFound = "node-not-found",
  nodeNotSupportedForAzure = "node-not-supported-for-azure",
  nodeNotSupportedForSPFx = "node-not-supported-for-spfx",

  npmNotFound = "npm-not-found",
  npmAlreadyInstalled = "npm-already-installed",

  funcCheckSkipped = "func-check-skipped",
  funcAlreadyInstalled = "func-already-installed",
  funcInstallCompleted = "func-install-completed",
  funcInstallError = "func-install-error",
  funcInstallScriptCompleted = "func-install-script-completed",
  funcInstallScriptError = "func-install-script-error",
  funcValidationError = "func-validation-error",

  dotnetCheckSkipped = "dotnet-check-skipped",
  dotnetAlreadyInstalled = "dotnet-already-installed",
  dotnetInstallCompleted = "dotnet-install-completed",
  dotnetInstallError = "dotnet-install-error",
  dotnetInstallScriptCompleted = "dotnet-install-script-completed",
  dotnetInstallScriptError = "dotnet-install-script-error",
  dotnetValidationError = "dotnet-validation-error",
  dotnetSearchDotnetSdks = "dotnet-search-dotnet-sdks",

  ngrokInstallCompleted = "ngrok-install-completed",
  ngrokInstallError = "ngrok-install-error",
  ngrokInstallScriptCompleted = "ngrok-install-script-completed",
  ngrokInstallScriptError = "ngrok-install-script-error",
  ngrokValidationError = "ngrok-validation-error",
}

export enum TelemtryMessages {
  failedToInstallFunc = "failed to install Func core tools.",
  failedToValidateFunc = "failed to validate func.",
  NPMNotFound = "npm is not found.",
  failedToExecDotnetScript = "failed to exec dotnet script.",
  failedToValidateDotnet = "failed to validate dotnet.",
  failedToSearchDotnetSdks = "failed to search dotnet sdks.",
  failedToInstallNgrok = "failed to install ngrok.",
  failedToValidateNgrok = "failed to validate ngrok.",
}

export enum TelemetryMessurement {
  completionTime = "completion-time",
}
