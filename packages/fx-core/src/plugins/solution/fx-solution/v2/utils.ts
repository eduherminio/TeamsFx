import {
  v2,
  Inputs,
  FxError,
  Result,
  ok,
  err,
  AzureSolutionSettings,
  Void,
  returnUserError,
  PermissionRequestProvider,
  returnSystemError,
  Json,
  SolutionContext,
  Plugin,
  AppStudioTokenProvider,
  ProjectSettings,
} from "@microsoft/teamsfx-api";
import { LocalSettingsTeamsAppKeys } from "../../../../common/localSettingsConstants";
import { getStrings, isMultiEnvEnabled } from "../../../../common/tools";
import {
  GLOBAL_CONFIG,
  SolutionError,
  SOLUTION_PROVISION_SUCCEEDED,
  SolutionSource,
} from "../constants";
import {
  AzureResourceApim,
  AzureResourceFunction,
  AzureResourceSQL,
  AzureSolutionQuestionNames,
  BotOptionItem,
  HostTypeOptionAzure,
  HostTypeOptionSPFx,
  MessageExtensionItem,
  TabOptionItem,
  TabSPFxItem,
} from "../question";
import { getActivatedV2ResourcePlugins, getAllV2ResourcePlugins } from "../ResourcePluginContainer";
import { PluginsWithContext } from "../solution";
import { getPluginContext } from "../utils/util";
import * as util from "util";

export function getSelectedPlugins(projectSettings: ProjectSettings): v2.ResourcePlugin[] {
  return getActivatedV2ResourcePlugins(projectSettings);
}

export function getAzureSolutionSettings(ctx: v2.Context): AzureSolutionSettings | undefined {
  return ctx.projectSetting.solutionSettings as AzureSolutionSettings | undefined;
}

export function isAzureProject(azureSettings: AzureSolutionSettings | undefined): boolean {
  return azureSettings !== undefined && HostTypeOptionAzure.id === azureSettings.hostType;
}

export function combineRecords<T>(records: { name: string; result: T }[]): Record<string, T> {
  const ret: Record<v2.PluginName, T> = {};
  for (const record of records) {
    ret[record.name] = record.result;
  }

  return ret;
}

export function extractSolutionInputs(record: Json): v2.SolutionInputs {
  return {
    resourceNameSuffix: record["resourceNameSuffix"],
    resourceGroupName: record["resourceGroupName"],
    location: record["location"],
    teamsAppTenantId: record["teamsAppTenantId"],
    remoteTeamsAppId: undefined,
    subscriptionId: record["subscriptionId"],
    provisionSucceeded: record[SOLUTION_PROVISION_SUCCEEDED],
    tenantId: record["tenantId"],
  };
}

export function setActivatedResourcePluginsV2(projectSettings: ProjectSettings): void {
  const activatedPluginNames = getAllV2ResourcePlugins()
    .filter((p) => p.activate && p.activate(projectSettings) === true)
    .map((p) => p.name);
  projectSettings.solutionSettings!.activeResourcePlugins = activatedPluginNames;
}

export async function ensurePermissionRequest(
  solutionSettings: AzureSolutionSettings,
  permissionRequestProvider: PermissionRequestProvider
): Promise<Result<Void, FxError>> {
  if (solutionSettings.migrateFromV1) {
    return ok(Void);
  }

  if (!isAzureProject(solutionSettings)) {
    return err(
      returnUserError(
        new Error("Cannot update permission for SPFx project"),
        SolutionSource,
        SolutionError.CannotUpdatePermissionForSPFx
      )
    );
  }

  const result = await permissionRequestProvider.checkPermissionRequest();
  if (result && result.isErr()) {
    return result.map(err);
  }

  return ok(Void);
}

export function parseTeamsAppTenantId(
  appStudioToken?: Record<string, unknown>
): Result<string, FxError> {
  if (appStudioToken === undefined) {
    return err(
      returnSystemError(
        new Error("Graph token json is undefined"),
        SolutionSource,
        SolutionError.NoAppStudioToken
      )
    );
  }

  const teamsAppTenantId = appStudioToken["tid"];
  if (
    teamsAppTenantId === undefined ||
    !(typeof teamsAppTenantId === "string") ||
    teamsAppTenantId.length === 0
  ) {
    return err(
      returnSystemError(
        new Error("Cannot find teams app tenant id"),
        SolutionSource,
        SolutionError.NoTeamsAppTenantId
      )
    );
  }
  return ok(teamsAppTenantId);
}

export function parseUserName(appStudioToken?: Record<string, unknown>): Result<string, FxError> {
  if (appStudioToken === undefined) {
    return err(
      returnSystemError(
        new Error("Graph token json is undefined"),
        "Solution",
        SolutionError.NoAppStudioToken
      )
    );
  }

  const userName = appStudioToken["upn"];
  if (userName === undefined || !(typeof userName === "string") || userName.length === 0) {
    return err(
      returnSystemError(
        new Error("Cannot find user name from App Studio token."),
        "Solution",
        SolutionError.NoUserName
      )
    );
  }
  return ok(userName);
}

export async function checkWhetherLocalDebugM365TenantMatches(
  localDebugTenantId?: string,
  appStudioTokenProvider?: AppStudioTokenProvider
): Promise<Result<Void, FxError>> {
  if (localDebugTenantId) {
    const m365TenantId = parseTeamsAppTenantId(await appStudioTokenProvider?.getJsonObject());
    if (m365TenantId.isErr()) {
      throw err(m365TenantId.error);
    }

    const m365UserAccount = parseUserName(await appStudioTokenProvider?.getJsonObject());
    if (m365UserAccount.isErr()) {
      throw err(m365UserAccount.error);
    }

    if (m365TenantId.value !== localDebugTenantId) {
      const errorMessage: string = util.format(
        getStrings().solution.LocalDebugTenantConfirmNotice,
        localDebugTenantId,
        m365UserAccount.value,
        "localSettings.json"
      );

      return err(
        returnUserError(
          new Error(errorMessage),
          "Solution",
          SolutionError.CannotLocalDebugInDifferentTenant
        )
      );
    }
  }

  return ok(Void);
}

// Loads teams app tenant id into local settings.
export function loadTeamsAppTenantIdForLocal(
  localSettings: v2.LocalSettings,
  appStudioToken?: Record<string, unknown>
): Result<Void, FxError> {
  return parseTeamsAppTenantId(appStudioToken as Record<string, unknown> | undefined).andThen(
    (teamsAppTenantId) => {
      localSettings.teamsApp[LocalSettingsTeamsAppKeys.TenantId] = teamsAppTenantId;
      return ok(Void);
    }
  );
}

export function fillInSolutionSettings(
  projectSettings: ProjectSettings,
  answers: Inputs
): Result<Void, FxError> {
  const solutionSettings = (projectSettings.solutionSettings as AzureSolutionSettings) || {};
  let capabilities = (answers[AzureSolutionQuestionNames.Capabilities] as string[]) || [];
  if (!capabilities || capabilities.length === 0) {
    return err(
      returnSystemError(
        new Error("capabilities is empty"),
        SolutionSource,
        SolutionError.InternelError
      )
    );
  }
  let hostType = answers[AzureSolutionQuestionNames.HostType] as string;
  if (
    capabilities.includes(BotOptionItem.id) ||
    capabilities.includes(MessageExtensionItem.id) ||
    capabilities.includes(TabOptionItem.id)
  ) {
    hostType = HostTypeOptionAzure.id;
  } else if (capabilities.includes(TabSPFxItem.id)) {
    // set capabilities to TabOptionItem in case of TabSPFx item, so donot impact capabilities.includes() check overall
    capabilities = [TabOptionItem.id];
    hostType = HostTypeOptionSPFx.id;
  }
  if (!hostType) {
    return err(
      returnSystemError(
        new Error("hostType is undefined"),
        SolutionSource,
        SolutionError.InternelError
      )
    );
  }
  solutionSettings.hostType = hostType;
  let azureResources: string[] | undefined;
  if (hostType === HostTypeOptionAzure.id && capabilities.includes(TabOptionItem.id)) {
    azureResources = answers[AzureSolutionQuestionNames.AzureResources] as string[];
    if (azureResources) {
      if (
        (azureResources.includes(AzureResourceSQL.id) ||
          azureResources.includes(AzureResourceApim.id)) &&
        !azureResources.includes(AzureResourceFunction.id)
      ) {
        azureResources.push(AzureResourceFunction.id);
      }
    } else azureResources = [];
  }
  solutionSettings.azureResources = azureResources || [];
  solutionSettings.capabilities = capabilities || [];

  // fill in activeResourcePlugins
  setActivatedResourcePluginsV2(projectSettings);
  return ok(Void);
}

export function checkWetherProvisionSucceeded(config: Json): boolean {
  return config[GLOBAL_CONFIG] && config[GLOBAL_CONFIG][SOLUTION_PROVISION_SUCCEEDED];
}

export function getPluginAndContextArray(
  ctx: SolutionContext,
  selectedPlugins: Plugin[]
): PluginsWithContext[] {
  return selectedPlugins.map((plugin) => [plugin, getPluginContext(ctx, plugin.name)]);
}
