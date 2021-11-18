// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export { ErrorWithCode, ErrorCode } from "./core/errors";

export {
  getAuthenticationConfiguration,
  getResourceConfiguration,
  loadConfiguration,
} from "./core/configurationProvider";

export { M365TenantCredential } from "./credential/m365TenantCredential.browser";
export { OnBehalfOfUserCredential } from "./credential/onBehalfOfUserCredential.browser";
export { TeamsUserCredential } from "./credential/teamsUserCredential.browser";

export { MsGraphAuthProvider } from "./core/msGraphAuthProvider";
export {
  createMicrosoftGraphClient,
  getMicrosoftGraphClient,
} from "./core/msGraphClientProvider.browser";
export { DefaultTediousConnectionConfiguration } from "./core/defaultTediousConnectionConfiguration";

export { TeamsBotSsoPrompt, TeamsBotSsoPromptSettings } from "./bot/teamsBotSsoPrompt.browser";
export { TeamsBotSsoPromptTokenResponse } from "./bot/teamsBotSsoPromptTokenResponse";

export { UserInfo } from "./models/userinfo";
export {
  Configuration,
  AuthenticationConfiguration,
  ResourceConfiguration,
  ResourceType,
} from "./models/configuration";

export {
  Logger,
  LogLevel,
  LogFunction,
  setLogLevel,
  getLogLevel,
  setLogger,
  setLogFunction,
} from "./util/logger";

export { initializeTeamsUserCredential, getTeamsUserCredential } from "./credential/index.browser";
