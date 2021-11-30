// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { registerLogger } from "./util/logger";

export { ErrorWithCode, ErrorCode } from "./core/errors";

export {
  getAuthenticationConfiguration,
  getResourceConfiguration,
  loadConfiguration,
  getConfigFromEnv,
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

export {
  initializeCredential,
  getUserCredential,
  getAppCredential,
  authorize,
} from "./credential/index.browser";

registerLogger();
