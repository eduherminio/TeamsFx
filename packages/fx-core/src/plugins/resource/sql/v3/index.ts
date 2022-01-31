// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AzureSolutionSettings,
  err,
  FxError,
  Inputs,
  ok,
  Platform,
  QTreeNode,
  Result,
  TokenProvider,
  v2,
  v3,
  Void,
} from "@microsoft/teamsfx-api";
import * as path from "path";
import { Service } from "typedi";
import { ArmTemplateResult } from "../../../../common/armInterface";
import { Bicep } from "../../../../common/constants";
import {
  generateBicepFromFile,
  getResourceGroupNameFromResourceId,
  getSubscriptionIdFromResourceId,
  getUuid,
} from "../../../../common/tools";
import { getTemplatesFolder } from "../../../../folder";
import {
  BuiltInFeaturePluginNames,
  BuiltInSolutionNames,
} from "../../../solution/fx-solution/v3/constants";
import { AzureSqlBicep, AzureSqlBicepFile, Constants } from "../constants";
import fs from "fs-extra";
import { adminNameQuestion, adminPasswordQuestion, confirmPasswordQuestion } from "../questions";
import { SqlManagementClient, SqlManagementModels } from "@azure/arm-sql";
import { SqlResultFactory } from "../results";
import { ErrorMessage } from "../errors";
import axios from "axios";
import { AzureSQL } from "../../../../../../api/build/v3";
import { SqlConfig } from "../config";

@Service(BuiltInFeaturePluginNames.sql)
export class SqlPluginV3 implements v3.FeaturePlugin {
  name = BuiltInFeaturePluginNames.sql;
  displayName = "Azure SQL Database";
  description = "Azure SQL Database";
  totalFirewallRuleCount = 0;
  config: SqlConfig = new SqlConfig();

  public async generateNewSqlServerBicep(
    ctx: v3.ContextWithManifestProvider
  ): Promise<Result<v2.ResourceTemplate, FxError>> {
    const solutionSettings = ctx.projectSetting.solutionSettings as
      | AzureSolutionSettings
      | undefined;
    const pluginCtx = { plugins: solutionSettings ? solutionSettings.activeResourcePlugins : [] };
    const bicepTemplateDirectory = path.join(
      getTemplatesFolder(),
      "plugins",
      "resource",
      "sql",
      "bicep"
    );
    const provisionOrchestration = await generateBicepFromFile(
      path.join(bicepTemplateDirectory, AzureSqlBicepFile.moduleTemplateFileName),
      pluginCtx
    );
    const provisionModules = await generateBicepFromFile(
      path.join(bicepTemplateDirectory, AzureSqlBicepFile.ProvisionModuleTemplateFileName),
      pluginCtx
    );
    const result: ArmTemplateResult = {
      Provision: {
        Orchestration: provisionOrchestration,
        Modules: { azureSql: provisionModules },
      },
      Parameters: await fs.readJSON(path.join(bicepTemplateDirectory, Bicep.ParameterFileName)),
      Reference: {
        sqlResourceId: AzureSqlBicep.sqlResourceId,
        sqlEndpoint: AzureSqlBicep.sqlEndpoint,
        databaseName: AzureSqlBicep.databaseName,
      },
    };
    return ok({ kind: "bicep", template: result });
  }

  public async generateNewDatabaseBicep(
    ctx: v3.ContextWithManifestProvider
  ): Promise<Result<v2.ResourceTemplate, FxError>> {
    const suffix = getUuid().substring(0, 6);
    const compileCtx = {
      suffix: suffix,
    };
    const bicepTemplateDirectory = path.join(
      getTemplatesFolder(),
      "plugins",
      "resource",
      "sql",
      "bicep"
    );
    const provisionOrchestration = await generateBicepFromFile(
      path.join(bicepTemplateDirectory, AzureSqlBicepFile.newDatabaseOrchestrationTemplateFileName),
      compileCtx
    );
    const provisionModules = await generateBicepFromFile(
      path.join(bicepTemplateDirectory, AzureSqlBicepFile.newDatabaseProvisionTemplateFileName),
      compileCtx
    );
    const result: ArmTemplateResult = {
      Provision: {
        Orchestration: provisionOrchestration,
        Modules: { azureSql: provisionModules },
      },
      Reference: {
        sqlResourceId: AzureSqlBicep.sqlResourceId,
        sqlEndpoint: AzureSqlBicep.sqlEndpoint,
        databaseName: AzureSqlBicep.databaseName,
      },
    };
    return ok({ kind: "bicep", template: result });
  }
  async addFeature(
    ctx: v3.ContextWithManifestProvider,
    inputs: v2.InputsWithProjectPath,
    envInfo?: v3.EnvInfoV3
  ): Promise<Result<v2.ResourceTemplate | undefined, FxError>> {
    const solutionSettings = ctx.projectSetting.solutionSettings as AzureSolutionSettings;
    const activeResourcePlugins = solutionSettings.activeResourcePlugins;
    const firstTime = activeResourcePlugins.includes(this.name);
    const armRes = firstTime
      ? await this.generateNewSqlServerBicep(ctx)
      : await this.generateNewDatabaseBicep(ctx);
    if (armRes.isErr()) return err(armRes.error);
    if (!activeResourcePlugins.includes(this.name)) activeResourcePlugins.push(this.name);
    return ok(armRes.value);
  }
  async afterOtherFeaturesAdded(
    ctx: v3.ContextWithManifestProvider,
    inputs: v3.OtherFeaturesAddedInputs,
    envInfo?: v3.EnvInfoV3
  ): Promise<Result<v2.ResourceTemplate | undefined, FxError>> {
    const result: ArmTemplateResult = {
      Reference: {
        sqlResourceId: AzureSqlBicep.sqlResourceId,
        sqlEndpoint: AzureSqlBicep.sqlEndpoint,
        databaseName: AzureSqlBicep.databaseName,
      },
    };
    return ok({ kind: "bicep", template: result });
  }

  createSqlManagementClient(cred: string, subId: string) {}

  async getQuestionsForProvision(
    ctx: v2.Context,
    inputs: Inputs,
    tokenProvider: TokenProvider,
    envInfo?: v2.DeepReadonly<v3.EnvInfoV3Question>
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    let sqlExist = false;
    if (envInfo && envInfo.state && envInfo.state[BuiltInFeaturePluginNames.sql]) {
      const sqlResource = envInfo.state[BuiltInFeaturePluginNames.sql] as v3.AzureSQL;
      if (sqlResource.sqlEndpoint) {
        const sqlServer = sqlResource.sqlEndpoint.split(".")[0];
        const azureSubscriptionId = getSubscriptionIdFromResourceId(sqlResource.sqlResourceId);
        const credential = await tokenProvider.azureAccountProvider.getAccountCredentialAsync();
        const client = new SqlManagementClient(credential!, azureSubscriptionId);
        try {
          const result = await client.servers.checkNameAvailability({
            name: sqlServer,
          });
          if (result.available) {
          } else if (result.reason === "Invalid") {
            return err(
              SqlResultFactory.UserError(
                ErrorMessage.SqlEndpointError.name,
                ErrorMessage.SqlEndpointError.message(sqlResource.sqlEndpoint)
              )
            );
          } else {
            sqlExist = true;
          }
        } catch (error) {
          throw SqlResultFactory.SystemError(
            ErrorMessage.SqlCheckError.name,
            ErrorMessage.SqlCheckError.message(sqlResource.sqlEndpoint, error.message),
            error
          );
        }
      }
    }
    if (!sqlExist || inputs.platform === Platform.CLI_HELP) {
      // sql question will be returned in two cases:
      // 1. CLI_HELP; 2. SQL already exists
      const sqlNode = new QTreeNode({
        type: "group",
      });
      sqlNode.addChild(new QTreeNode(adminNameQuestion));
      sqlNode.addChild(new QTreeNode(adminPasswordQuestion));
      sqlNode.addChild(new QTreeNode(confirmPasswordQuestion));
      return ok(sqlNode);
    }
    return ok(undefined);
  }
  getRuleName(suffix: number): string {
    return Constants.firewall.localRule + suffix;
  }
  async addLocalFirewallRule(client: SqlManagementClient): Promise<void> {
    try {
      const response = await axios.get(Constants.echoIpAddress);
      const localIp: string = response.data;
      const partials: string[] = localIp.split(".");

      partials[2] = Constants.ipBeginToken;
      partials[3] = Constants.ipBeginToken;
      const startIp: string = partials.join(".");

      partials[2] = Constants.ipEndToken;
      partials[3] = Constants.ipEndToken;
      const endIp: string = partials.join(".");
      const model: SqlManagementModels.FirewallRule = {
        startIpAddress: startIp,
        endIpAddress: endIp,
      };
      const ruleName = this.getRuleName(this.totalFirewallRuleCount);
      await client.firewallRules.createOrUpdate(
        this.config.resourceGroup,
        this.config.sqlServer,
        ruleName,
        model
      );
      this.totalFirewallRuleCount++;
    } catch (error) {
      throw SqlResultFactory.UserError(
        ErrorMessage.SqlLocalFirwallError.name,
        ErrorMessage.SqlLocalFirwallError.message(this.config.sqlEndpoint, error.message),
        error
      );
    }
  }

  async configureResource(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath,
    envInfo: v3.EnvInfoV3,
    tokenProvider: TokenProvider
  ): Promise<Result<Void, FxError>> {
    this.loadConfig(envInfo);

    return ok(Void);
  }
  private loadConfigSubscription(sqlResource: v3.AzureSQL) {
    this.config.sqlResourceId = sqlResource.sqlResourceId;
    if (this.config.sqlResourceId) {
      try {
        this.config.azureSubscriptionId = getSubscriptionIdFromResourceId(
          this.config.sqlResourceId
        );
      } catch (error) {
        throw SqlResultFactory.UserError(
          ErrorMessage.SqlInvalidConfigError.name,
          ErrorMessage.SqlInvalidConfigError.message(this.config.sqlResourceId, error.message),
          error
        );
      }
    }
  }
  private loadConfigResourceGroup(sqlResource: v3.AzureSQL) {
    this.config.sqlResourceId = sqlResource.sqlResourceId;
    if (this.config.sqlResourceId) {
      try {
        this.config.resourceGroup = getResourceGroupNameFromResourceId(this.config.sqlResourceId);
      } catch (error) {
        throw SqlResultFactory.UserError(
          ErrorMessage.SqlInvalidConfigError.name,
          ErrorMessage.SqlInvalidConfigError.message(this.config.sqlResourceId, error.message),
          error
        );
      }
    }
  }
  private loadConfigSql(sqlResource: v3.AzureSQL) {
    this.config.sqlEndpoint = sqlResource.sqlEndpointg;
    this.config.databaseName = sqlResource.databaseName;
    if (this.config.sqlEndpoint) {
      this.config.sqlServer = this.config.sqlEndpoint.split(".")[0];
    }
  }
  private loadDatabases(sqlResource: v3.AzureSQL) {
    for (const key of Object.keys(sqlResource)) {
      if (key.startsWith(Constants.databaseName)) {
        const value = sqlResource[key];
        this.config.databases.push(value);
      }
    }
  }
  private loadConfig(envInfo: v3.EnvInfoV3) {
    const sqlResource = envInfo.state[BuiltInFeaturePluginNames.sql] as v3.AzureSQL;
    if (sqlResource) {
      this.loadConfigSubscription(sqlResource);
      this.loadConfigResourceGroup(sqlResource);
      this.loadConfigSql(sqlResource);
      this.loadDatabases(sqlResource);
    }
    const solutionConfig = envInfo.state[BuiltInSolutionNames.azure] as v3.AzureSolutionConfig;
    this.config.resourceNameSuffix = solutionConfig.resourceNameSuffix;
    this.config.location = solutionConfig.location;
    this.config.tenantId = solutionConfig.tenantId;
  }
}
