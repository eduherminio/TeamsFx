// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from "os";
import * as fs from "fs-extra";
import * as path from "path";
import * as child_process from "child_process";
import * as util from "util";
import { ConfigFolderName, Result, ok, err } from "@microsoft/teamsfx-api";
import { performance } from "perf_hooks";
import { dotnetFailToInstallHelpLink, dotnetExplanationHelpLink } from "../constant/helpLink";
import { DepsCheckerError, LinuxNotSupportedError } from "../depsError";
import { runWithProgressIndicator } from "../util/progressIndicator";
import { cpUtils } from "../util/cpUtils";
import { isLinux, isWindows, isArm64, isMacOS } from "../util/system";
import { DepsCheckerEvent, TelemtryMessages } from "../constant/telemetry";
import { DepsLogger } from "../depsLogger";
import { DepsTelemetry } from "../depsTelemetry";
import { DepsInfo, DepsChecker } from "../depsChecker";
import { Messages } from "../constant/message";
import { getResourceFolder } from "../../../folder";

const execFile = util.promisify(child_process.execFile);

export enum DotnetVersion {
  v21 = "2.1",
  v31 = "3.1",
  v50 = "5.0",
  v60 = "6.0",
}
type DotnetSDK = { version: string; path: string };
const DotnetCoreSDKName = ".NET Core SDK";
const installVersion = isMacOS() && isArm64() ? DotnetVersion.v60 : DotnetVersion.v31;
const supportedVersions = [DotnetVersion.v31, DotnetVersion.v50, DotnetVersion.v60];
const installedNameWithVersion = `${DotnetCoreSDKName} (v${DotnetVersion.v31})`;

export class DotnetChecker implements DepsChecker {
  private static encoding = "utf-8";
  private static timeout = 5 * 60 * 1000; // same as vscode-dotnet-runtime
  private static maxBuffer = 500 * 1024;

  private readonly _logger: DepsLogger;
  private readonly _telemetry: DepsTelemetry;

  constructor(logger: DepsLogger, telemetry: DepsTelemetry) {
    this._logger = logger;
    this._telemetry = telemetry;
  }

  public async getDepsInfo(): Promise<DepsInfo> {
    const map = new Map<string, string>();
    const execPath = await this.getDotnetExecPathFromConfig();
    if (execPath) {
      map.set("execPath", execPath);
    }
    map.set("configPath", DotnetChecker.getDotnetConfigPath());
    return {
      name: DotnetCoreSDKName,
      isLinuxSupported: false,
      installVersion: `${installVersion}`,
      supportedVersions: supportedVersions,
      details: map,
    };
  }

  public async isInstalled(): Promise<boolean> {
    const configPath = DotnetChecker.getDotnetConfigPath();
    await this._logger.debug(`[start] read dotnet path from '${configPath}'`);
    const dotnetPath = await this.getDotnetExecPathFromConfig();
    await this._logger.debug(
      `[end] read dotnet path from '${configPath}', dotnetPath = '${dotnetPath}'`
    );

    await this._logger.debug(`[start] check dotnet version`);
    if (dotnetPath !== null && (await this.isDotnetInstalledCorrectly())) {
      // filter out global sdk
      if (dotnetPath.includes(`.${ConfigFolderName}`)) {
        this._telemetry.sendEvent(DepsCheckerEvent.dotnetInstallCompleted);
      }
      return true;
    }
    await this._logger.debug(`[end] check dotnet version`);

    if ((await this.tryAcquireGlobalDotnetSdk()) && (await this.validate())) {
      this._telemetry.sendEvent(DepsCheckerEvent.dotnetAlreadyInstalled);
      await this._logger.info(
        `${Messages.useGlobalDotnet} '${await this.getDotnetExecPathFromConfig()}'`
      );
      return true;
    }

    return false;
  }

  public async resolve(): Promise<Result<boolean, DepsCheckerError>> {
    try {
      if (!(await this.isInstalled())) {
        await this.install();
      }
    } catch (error) {
      await this._logger.printDetailLog();
      await this._logger.error(`${error.message}, error = '${error}'`);
      if (error instanceof DepsCheckerError) {
        return err(error);
      }
      return err(new DepsCheckerError(error.message, dotnetFailToInstallHelpLink));
    } finally {
      this._logger.cleanup();
    }

    return ok(true);
  }

  public async install(): Promise<void> {
    if (isLinux()) {
      throw new LinuxNotSupportedError(dotnetExplanationHelpLink);
    }

    await this._logger.debug(`[start] cleanup bin/dotnet and config`);
    await DotnetChecker.cleanup();
    await this._logger.debug(`[end] cleanup bin/dotnet and config`);

    const installDir = DotnetChecker.getDefaultInstallPath();
    await this._logger.debug(`[start] install dotnet ${installVersion}`);
    await this._logger.debug(
      Messages.dotnetNotFound
        .replace("@NameVersion", installedNameWithVersion)
        .replace("@HelpLink", dotnetExplanationHelpLink)
    );
    await this._logger.info(
      Messages.downloadDotnet
        .replace("@NameVersion", installedNameWithVersion)
        .replace("@InstallDir", installDir)
    );

    // TODO add progress log
    await runWithProgressIndicator(async () => {
      await this.handleInstall(installVersion, installDir);
    }, this._logger);

    await this._logger.info(
      Messages.finishInstallDotnet.replace("@NameVersion", installedNameWithVersion)
    );
    await this._logger.debug(`[end] install dotnet ${installVersion}`);

    await this._logger.debug(`[start] validate dotnet version`);
    if (!(await this.validate())) {
      this._telemetry.sendEvent(DepsCheckerEvent.dotnetInstallError);
      throw new DepsCheckerError(
        Messages.failToInstallDotnet.split("@NameVersion").join(installedNameWithVersion),
        dotnetFailToInstallHelpLink
      );
    }
    this._telemetry.sendEvent(DepsCheckerEvent.dotnetInstallCompleted);
  }

  public async command(): Promise<string> {
    const execPath = await this.getDotnetExecPathFromConfig();
    return execPath || "dotnet";
  }

  public static escapeFilePath(path: string): string {
    if (isWindows()) {
      // Need to escape apostrophes with two apostrophes
      const dotnetInstallDirEscaped = path.replace(/'/g, `''`);

      // Surround with single quotes instead of double quotes (see https://github.com/dotnet/cli/issues/11521)
      return `'${dotnetInstallDirEscaped}'`;
    } else {
      return `"${path}"`;
    }
  }

  private static getDotnetConfigPath(): string {
    return path.join(os.homedir(), `.${ConfigFolderName}`, "dotnet.json");
  }

  private async getDotnetExecPathFromConfig(): Promise<string | null> {
    try {
      const config = await fs.readJson(DotnetChecker.getDotnetConfigPath(), {
        encoding: DotnetChecker.encoding,
      });
      if (typeof config.dotnetExecutablePath === "string") {
        return config.dotnetExecutablePath;
      }
      await this._logger.debug(
        `invalid dotnet config file format, config: '${JSON.stringify(config)}' `
      );
    } catch (error) {
      await this._logger.debug(`get dotnet path failed, error: '${error}'`);
    }
    return null;
  }

  // Do not print info level log in this method because it runs concurrently with the progress bar
  private async handleInstall(version: DotnetVersion, installDir: string): Promise<void> {
    try {
      if (isLinux()) {
        await this.handleLinuxDependency();
      }
      // NOTE: we don't need to handle directory creation since dotnet-install script will handle it.
      await this.runDotnetInstallScript(version, installDir);

      await this._logger.debug(`[start] write dotnet path to config`);
      const dotnetExecPath = DotnetChecker.getDotnetExecPathFromDotnetInstallationDir(installDir);
      await DotnetChecker.persistDotnetExecPath(dotnetExecPath);
      await this._logger.debug(`[end] write dotnet path to config`);
    } catch (error) {
      await this._logger.error(
        `${Messages.failToInstallDotnet
          .split("@NameVersion")
          .join(installedNameWithVersion)}, error = '${error}'`
      );
    }
  }

  private static async persistDotnetExecPath(dotnetExecPath: string): Promise<void> {
    const configPath = DotnetChecker.getDotnetConfigPath();
    await fs.ensureFile(configPath);
    await fs.writeJson(
      configPath,
      { dotnetExecutablePath: dotnetExecPath },
      {
        encoding: DotnetChecker.encoding,
        spaces: 4,
        EOL: os.EOL,
      }
    );
  }

  private async handleLinuxDependency(): Promise<void> {
    // do nothing
  }

  private static async cleanup(): Promise<void> {
    await fs.remove(DotnetChecker.getDotnetConfigPath());
    await fs.emptyDir(DotnetChecker.getDefaultInstallPath());
  }

  // from: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/vscode-dotnet-runtime-library/src/Acquisition/AcquisitionInvoker.ts
  private async runDotnetInstallScript(version: DotnetVersion, installDir: string): Promise<void> {
    const command = await this.getInstallCommand(version, installDir);
    const cwd = this.getResourceDir();

    const options: child_process.ExecFileOptions = {
      cwd: cwd,
      maxBuffer: DotnetChecker.maxBuffer,
      timeout: DotnetChecker.timeout,
      killSignal: "SIGKILL",
      shell: false,
    };

    const start = performance.now();
    try {
      fs.chmodSync(this.getDotnetInstallScriptPath(), "755");
      const { stdout, stderr } = await execFile(command[0], command.slice(1), options);
      await this._logger.debug(
        `Finished running dotnet-install script, command = '${command.join(
          " "
        )}', options = '${JSON.stringify(options)}', stdout = '${stdout}', stderr = '${stderr}'`
      );

      const timecost = Number(((performance.now() - start) / 1000).toFixed(2));

      if (stderr && stderr.length > 0) {
        const errorMessage = `${Messages.failToInstallDotnet
          .split("@NameVersion")
          .join(installedNameWithVersion)} ${
          Messages.dotnetInstallStderr
        } stdout = '${stdout}', stderr = '${stderr}', timecost = '${timecost}s'`;

        this._telemetry.sendSystemErrorEvent(
          DepsCheckerEvent.dotnetInstallScriptError,
          TelemtryMessages.failedToExecDotnetScript,
          errorMessage
        );
        await this._logger.error(errorMessage);
      } else {
        this._telemetry.sendEvent(DepsCheckerEvent.dotnetInstallScriptCompleted, {}, timecost);
      }
    } catch (error) {
      const timecost = Number(((performance.now() - start) / 1000).toFixed(2));
      const errorMessage =
        `${Messages.failToInstallDotnet.split("@NameVersion").join(installedNameWithVersion)} ${
          Messages.dotnetInstallErrorCode
        }, ` +
        `command = '${command.join(" ")}', options = '${JSON.stringify(
          options
        )}', error = '${error}', stdout = '${error.stdout}', stderr = '${
          error.stderr
        }', timecost = '${timecost}s'`;

      this._telemetry.sendSystemErrorEvent(
        DepsCheckerEvent.dotnetInstallScriptError,
        TelemtryMessages.failedToExecDotnetScript,
        errorMessage
      );
      // swallow the exception since later validate will find out the errors anyway
      await this._logger.error(errorMessage);
    }
  }

  private async isDotnetInstalledCorrectly(): Promise<boolean> {
    try {
      const dotnetExecPath = await this.getDotnetExecPathFromConfig();
      const dotnetSdks: DotnetSDK[] = await this.searchDotnetSdks(dotnetExecPath);
      const installedVersions = dotnetSdks
        .map((sdk) => DotnetChecker.parseDotnetVersion(sdk.version))
        .filter((version) => version !== null) as string[];
      return this.isDotnetVersionsInstalled(installedVersions);
    } catch (error) {
      const errorMessage = `validate private install failed, error = '${error}'`;
      this._telemetry.sendSystemErrorEvent(
        DepsCheckerEvent.dotnetValidationError,
        TelemtryMessages.failedToValidateDotnet,
        errorMessage
      );
      await this._logger.debug(errorMessage);
      return false;
    }
  }

  private async isDotnetVersionsInstalled(installedVersions: string[]): Promise<boolean> {
    try {
      const validVersions = DotnetChecker.arrayIntersection(installedVersions, supportedVersions);
      return validVersions.length > 0;
    } catch (error) {
      await this._logger.error(
        `failed to check .NET, installedVersions = '${installedVersions}', supportedVersions = '${supportedVersions}', error = '${error}'`
      );
      return false;
    }
  }

  private static arrayIntersection<T>(lhs: T[], rhs: T[]): T[] {
    return lhs.filter((value) => rhs.includes(value));
  }

  private static isPrivateInstall(sdk: DotnetSDK): boolean {
    const privateInstallPath = DotnetChecker.getDotnetExecPathFromDotnetInstallationDir(
      DotnetChecker.getDefaultInstallPath()
    );
    return path.dirname(privateInstallPath) == path.dirname(sdk.path) && sdk.version !== null;
  }

  private async getGlobalDotnetSdks(): Promise<DotnetSDK[]> {
    const globalSdks: DotnetSDK[] = await this.searchDotnetSdks("dotnet");
    return globalSdks.filter((sdk) => !DotnetChecker.isPrivateInstall(sdk));
  }

  private async searchDotnetSdks(dotnetExecPath: string | null): Promise<DotnetSDK[]> {
    if (!dotnetExecPath) {
      return [];
    }
    const sdks: DotnetSDK[] = [];
    try {
      // shell = false to prevent shell escape issues in dotnetExecPath
      const dotnetListSdksOutput = await cpUtils.executeCommand(
        undefined,
        this._logger,
        { shell: false },
        dotnetExecPath,
        "--list-sdks"
      );

      // dotnet --list-sdks sample output:
      // > 5.0.200 [C:\Program Files\dotnet\sdk]
      // > 3.1.200 [C:\Program Files\dotnet\sdk]
      const regex = /(?<version>\d+\.\d+\.\d+)\s+\[(?<installPath>[^\]]+)\]/;

      // NOTE(aochengwang):
      // for default installation, we expect our dotnet should be installVersion.
      // for user specified dotnet path, check that installVersion exists in any dotnet installation from dotnet --list-sdks.
      dotnetListSdksOutput.split(/\r?\n/).forEach((line: string) => {
        const match = regex.exec(line.trim());
        if (match && match.groups) {
          const path = match.groups.installPath;
          const version = match.groups.version;
          if (DotnetChecker.isFullSdkVersion(version) && path) {
            sdks.push({ version: version, path: path });
          }
        }
      });
    } catch (error) {
      const errorMessage = `Failed to search dotnet sdk by dotnetPath = '${dotnetExecPath}', error = '${error}'`;
      await this._logger.debug(errorMessage);
      this._telemetry.sendSystemErrorEvent(
        DepsCheckerEvent.dotnetSearchDotnetSdks,
        TelemtryMessages.failedToSearchDotnetSdks,
        errorMessage
      );
    }
    return sdks;
  }

  private static isFullSdkVersion(version: string): boolean {
    const regex = /(?<major_version>\d+)\.(?<minor_version>\d+)\.(?<patch_version>\d+)/gm;
    const match = regex.exec(version);
    return match !== null && match.length > 0;
  }

  private static getDotnetExecPathFromDotnetInstallationDir(installDir: string): string {
    return path.join(installDir, isWindows() ? "dotnet.exe" : "dotnet");
  }

  private getDotnetInstallScriptPath(): string {
    return path.join(this.getResourceDir(), this.getDotnetInstallScriptName());
  }

  public getResourceDir(): string {
    return path.resolve(path.join(getResourceFolder(), "deps-checker"));
  }

  private getDotnetInstallScriptName(): string {
    return isWindows() ? "dotnet-install.ps1" : "dotnet-install.sh";
  }

  private static getDefaultInstallPath(): string {
    return path.join(os.homedir(), `.${ConfigFolderName}`, "bin", "dotnet");
  }

  private async getInstallCommand(
    version: DotnetVersion,
    dotnetInstallDir: string
  ): Promise<string[]> {
    if (isWindows()) {
      const command: string[] = [
        DotnetChecker.escapeFilePath(this.getDotnetInstallScriptPath()),
        "-InstallDir",
        DotnetChecker.escapeFilePath(dotnetInstallDir),
        "-Channel",
        version,
      ];
      return [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "unrestricted",
        "-Command",
        `& { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 ; & ${command.join(
          " "
        )} }`,
      ];
    } else {
      return [
        "bash",
        this.getDotnetInstallScriptPath(),
        "-InstallDir",
        dotnetInstallDir,
        "-Channel",
        version,
      ];
    }
  }

  private async validate(): Promise<boolean> {
    const isInstallationValid =
      (await this.isDotnetInstalledCorrectly()) && (await this.validateWithHelloWorld());
    if (!isInstallationValid) {
      this._telemetry.sendEvent(DepsCheckerEvent.dotnetValidationError);
      await DotnetChecker.cleanup();
    }
    return isInstallationValid;
  }

  private async validateWithHelloWorld(): Promise<boolean> {
    const dotnetPath = await this.getDotnetExecPathFromConfig();
    if (!dotnetPath) {
      return false;
    }

    const samplePath = path.join(os.homedir(), `.${ConfigFolderName}`, "dotnetSample");
    try {
      await fs.remove(samplePath);

      await cpUtils.executeCommand(
        undefined,
        this._logger,
        { shell: false },
        dotnetPath,
        "new",
        "console",
        "--output",
        `${samplePath}`,
        "--force"
      );
      await cpUtils.executeCommand(
        undefined,
        this._logger,
        { shell: false },
        dotnetPath,
        "run",
        "--project",
        `${samplePath}`,
        "--force"
      );
      return true;
    } catch (error) {
      this._telemetry.sendSystemErrorEvent(
        DepsCheckerEvent.dotnetValidationError,
        TelemtryMessages.failedToValidateDotnet,
        error
      );
      await this._logger.debug(
        `Failed to run hello world, dotnetPath = ${dotnetPath}, error = ${error}`
      );
    } finally {
      await fs.remove(samplePath);
    }

    return false;
  }

  private async tryAcquireGlobalDotnetSdk(): Promise<boolean> {
    try {
      const sdks: DotnetSDK[] = await this.getGlobalDotnetSdks();
      if (!sdks || sdks.length == 0) {
        return false;
      }
      // todo: by far, use first valid dotnet sdk
      // todo: write dotnetExecPath into user settings instead of into .fx/dotnet.json
      const selectedSdk: DotnetSDK = sdks[0];
      const dotnetExecPath: string = DotnetChecker.getDotnetExecPathFromDotnetInstallationDir(
        path.resolve(selectedSdk.path, "..")
      );
      await DotnetChecker.persistDotnetExecPath(dotnetExecPath);
      return true;
    } catch (error) {
      await this._logger.debug(`Failed to acquire global dotnet sdk, error = '${error}'`);
      return false;
    }
  }

  private static parseDotnetVersion(output: string): string | null {
    const regex = /(?<major_version>\d+)\.(?<minor_version>\d+)\.(?<patch_version>\d+)/gm;
    const match = regex.exec(output);
    if (!match) {
      return null;
    }
    return match.groups?.major_version + "." + match.groups?.minor_version;
  }
}
