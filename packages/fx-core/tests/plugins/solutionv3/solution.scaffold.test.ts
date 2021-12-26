// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, ProjectSettings, v2 } from "@microsoft/teamsfx-api";
import { assert } from "chai";
import "mocha";
import "reflect-metadata";
import * as uuid from "uuid";
import { TeamsFxAzureSolutionNameV3 } from "../../../src/plugins/solution/fx-solution/v3/constants";
import {
  getQuestionsForScaffold,
  scaffold,
} from "../../../src/plugins/solution/fx-solution/v3/scaffold";
import { MockedV2Context } from "../solution/util";
import { MockScaffoldPluginNames } from "./mockPlugins";
import "./mockPlugins";
import * as path from "path";
import * as os from "os";
import { randomAppName } from "../../core/utils";
describe("SolutionV3 - scaffold", () => {
  it("scaffold", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: TeamsFxAzureSolutionNameV3,
        version: "3.0.0",
        capabilities: ["Tab", "Bot"],
        hostType: "",
        azureResources: [],
        modules: [{ capabilities: ["Tab"] }, { capabilities: ["Bot"] }],
        activeResourcePlugins: [],
      },
    };
    const ctx = new MockedV2Context(projectSettings);
    const inputs: v2.InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: path.join(os.tmpdir(), randomAppName()),
      module: "0",
      template: {
        id: "1",
        label: "1",
        data: {
          pluginName: MockScaffoldPluginNames.tab,
          templateName: "ReactTab_JS",
        },
      },
      test: true,
    };
    const res = await scaffold(ctx, inputs);
    assert.isTrue(res.isOk());
    assert.deepEqual(projectSettings.solutionSettings, {
      name: TeamsFxAzureSolutionNameV3,
      version: "3.0.0",
      capabilities: ["Tab", "Bot"],
      hostType: "",
      azureResources: [],
      modules: [
        { capabilities: ["Tab"], dir: "tabs", deployType: "folder" },
        { capabilities: ["Bot"] },
      ],
      activeResourcePlugins: [],
    });
    inputs.module = "1";
    inputs.template.data.pluginName = MockScaffoldPluginNames.bot;
    inputs.template.data.templateName = "NodejsBot_JS";
    const res2 = await scaffold(ctx, inputs);
    assert.isTrue(res2.isOk());
    assert.deepEqual(projectSettings.solutionSettings, {
      name: TeamsFxAzureSolutionNameV3,
      version: "3.0.0",
      capabilities: ["Tab", "Bot"],
      hostType: "",
      azureResources: [],
      modules: [
        { capabilities: ["Tab"], dir: "tabs", deployType: "folder" },
        { capabilities: ["Bot"], dir: "bot", deployType: "zip" },
      ],
      activeResourcePlugins: [],
    });
  });

  it("getQuestionsForScaffold", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: TeamsFxAzureSolutionNameV3,
        version: "3.0.0",
        capabilities: ["Tab"],
        hostType: "",
        azureResources: [],
        modules: [{ capabilities: ["Tab"] }],
        activeResourcePlugins: [],
      },
    };
    const ctx = new MockedV2Context(projectSettings);
    const inputs: v2.InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: path.join(os.tmpdir(), randomAppName()),
    };
    const res = await getQuestionsForScaffold(ctx, inputs);
    assert.isTrue(res.isOk());
  });
});
