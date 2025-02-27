// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { commands, MessageItem, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { hasTeamsfxBackend, hasTeamsfxBot } from "../commonUtils";

const configurationPrefix = "fx-extension";

class VSCodeHelper {
  public async showWarningMessage(message: string, button: MessageItem): Promise<boolean> {
    const input = await window.showWarningMessage(message, { modal: true }, button);
    return input == button;
  }

  public async openUrl(url: string): Promise<void> {
    await commands.executeCommand("vscode.open", Uri.parse(url));
  }

  public isDotnetCheckerEnabled(): boolean {
    return this.checkerEnabled("prerequisiteCheck.dotnetSdk");
  }

  public isFuncCoreToolsEnabled(): boolean {
    return this.checkerEnabled("prerequisiteCheck.funcCoreTools");
  }

  public isNodeCheckerEnabled(): boolean {
    return this.checkerEnabled("prerequisiteCheck.node");
  }

  public isNgrokCheckerEnabled(): boolean {
    return this.checkerEnabled("prerequisiteCheck.ngrok");
  }

  public isTrustDevCertEnabled(): boolean {
    return this.checkerEnabled("prerequisiteCheck.devCert");
  }

  public async hasFunction(): Promise<boolean> {
    return hasTeamsfxBackend();
  }

  public async hasBot(): Promise<boolean> {
    return await hasTeamsfxBot();
  }

  public checkerEnabled(key: string): boolean {
    const configuration: WorkspaceConfiguration = workspace.getConfiguration(configurationPrefix);
    const res = configuration.get<boolean>(key, false);
    return res;
  }
}

export const vscodeHelper = new VSCodeHelper();
