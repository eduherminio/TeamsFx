// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as chai from "chai";
import * as nodeUtils from "../utils/node";
import { TestLogger } from "../adapters/testLogger";
import { TestTelemetry } from "../adapters/testTelemetry";
import { DepsType } from "../../../../src/common/deps-checker/depsChecker";
import { CheckerFactory } from "../../../../src/common/deps-checker/checkerFactory";
import "mocha";
import { func } from "ajv/dist/compile/util";

const functionsSupportedNodeVersions = ["10", "12", "14"];
const azureSupportedNodeVersions = ["10", "12", "14", "16"];

describe("NodeChecker E2E Test", async () => {
  it("Node supported version is installed", async function () {
    const nodeVersion = await nodeUtils.getNodeVersion();
    if (!(nodeVersion != null && functionsSupportedNodeVersions.includes(nodeVersion))) {
      this.skip();
    }
    const nodeChecker = CheckerFactory.createChecker(
      DepsType.FunctionNode,
      new TestLogger(),
      new TestTelemetry()
    );

    const res = await nodeChecker.resolve();

    chai.assert.isTrue(res.isOk() && res.value);
    chai.assert.isTrue(await nodeChecker.isInstalled());
  });

  it("Node supported version is installed for tab-only projects", async function () {
    const nodeVersion = await nodeUtils.getNodeVersion();
    if (!(nodeVersion != null && azureSupportedNodeVersions.includes(nodeVersion))) {
      this.skip();
    }
    const nodeChecker = CheckerFactory.createChecker(
      DepsType.AzureNode,
      new TestLogger(),
      new TestTelemetry()
    );

    const res = await nodeChecker.resolve();

    chai.assert.isTrue(res.isOk() && res.value);
    chai.assert.isTrue(await nodeChecker.isInstalled());
  });

  it("Node is not installed", async function (this: Mocha.Context) {
    if ((await nodeUtils.getNodeVersion()) !== null) {
      this.skip();
    }

    const functionNodeChecker = CheckerFactory.createChecker(
      DepsType.FunctionNode,
      new TestLogger(),
      new TestTelemetry()
    );
    const azureNodeChecker = CheckerFactory.createChecker(
      DepsType.AzureNode,
      new TestLogger(),
      new TestTelemetry()
    );

    const functionRes = await functionNodeChecker.resolve();
    const azureRes = await azureNodeChecker.resolve();
    chai.assert.isFalse(functionRes.isOk() && functionRes.value);
    chai.assert.isFalse(azureRes.isOk() && azureRes.value);
    chai.assert.isFalse(await functionNodeChecker.isInstalled());
    chai.assert.isFalse(await azureNodeChecker.isInstalled());
  });
});
