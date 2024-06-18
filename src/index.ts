import { StrategyVerifyCallback } from "remix-auth";

import {
  OAuth2Profile,
  OAuth2Strategy,
  OAuth2StrategyOptions,
  OAuth2StrategyVerifyParams,
  TokenResponseBody,
} from "remix-auth-oauth2";

/**
 * @see https://learn.microsoft.com/en-us/azure/active-directory/develop/scopes-oidc#openid-connect-scopes
 */
export type MicrosoftScope = "openid" | "email" | "profile" | "offline_access";

export interface MicrosoftStrategyOptions
  extends Omit<
    OAuth2StrategyOptions,
    "authorizationEndpoint" | "tokenEndpoint" | "tokenRevocationEndpoint"
  > {
  tenantId?: string;
  prompt?: string;
  domain?: string;
  policy?: string;
  userInfoEndpoint?: string;
}

export interface MicrosoftProfile extends OAuth2Profile {
  _json: {
    id: string;
    displayName: string;
    givenName: string;
    surname: string;
    mail: string;
    userPrincipalName?: string;
  };
}

export interface MicrosoftExtraParams extends Record<string, string | number> {
  expires_in: 3599;
  token_type: "Bearer";
  scope: string;
  id_token: string;
}

export const MicrosoftStrategyDefaultScopes: MicrosoftScope[] = [
  "openid",
  "profile",
  "email",
];
export const MicrosoftStrategyDefaultName = "microsoft";
export const MicrosoftStrategyScopeSeperator = " ";

export class MicrosoftStrategy<User> extends OAuth2Strategy<
  User,
  MicrosoftProfile,
  MicrosoftExtraParams
> {
  name = MicrosoftStrategyDefaultName;
  userInfoEndpoint: string;
  scope: string;
  prompt: string | undefined;

  constructor(
    {
      tenantId = "common",
      domain = "login.microsoftonline.com",
      userInfoEndpoint = "https://graph.microsoft.com/v1.0/me",
      policy,
      ...options
    }: MicrosoftStrategyOptions,
    verify: StrategyVerifyCallback<
      User,
      OAuth2StrategyVerifyParams<MicrosoftProfile, MicrosoftExtraParams>
    >,
  ) {
    const authorizationEndpoint = policy
      ? `https://${domain}/${tenantId}/${policy}/oauth2/v2.0/authorize`
      : `https://${domain}/${tenantId}/oauth2/v2.0/authorize`;

    const tokenEndpoint = policy
      ? `https://${domain}/${tenantId}/${policy}/oauth2/v2.0/token`
      : `https://${domain}/${tenantId}/oauth2/v2.0/token`;

    super({ authorizationEndpoint, tokenEndpoint, ...options }, verify);

    this.userInfoEndpoint = userInfoEndpoint;
    this.scope = this.getScope(options.scopes);
    this.prompt = options.prompt;
  }

  //Allow users the option to pass a scope string, or typed array
  private getScope(scope: MicrosoftStrategyOptions["scopes"]) {
    if (!scope) {
      return MicrosoftStrategyDefaultScopes.join(
        MicrosoftStrategyScopeSeperator,
      );
    } else if (typeof scope === "string") {
      return scope;
    }
    return scope.join(MicrosoftStrategyScopeSeperator);
  }

  protected authorizationParams(params: URLSearchParams): URLSearchParams {
    // Passing the 'prompt' value is needed to get correct logout behaviour
    // https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc#send-the-sign-in-request
    if (this.prompt) {
      params.set("prompt", this.prompt);
    } else {
      params.set("prompt", "");
    }

    params.set("scope", this.scope);

    return params;
  }

  protected async userProfile({
    access_token,
  }: TokenResponseBody): Promise<MicrosoftProfile> {
    const response = await fetch(this.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    const data: MicrosoftProfile["_json"] = await response.json();

    const {
      id,
      displayName,
      givenName,
      surname: familyName,
      mail,
      userPrincipalName,
    } = data;

    const emails = [];
    if (userPrincipalName)
      emails.push({ value: userPrincipalName, type: "primary" });
    if (mail)
      emails.push({
        value: mail,
        type: userPrincipalName ? "secondary" : "primary",
      });

    const profile = {
      provider: MicrosoftStrategyDefaultName,
      displayName,
      id,
      emails,
      name:
        familyName || givenName
          ? {
              familyName,
              givenName,
            }
          : undefined,
      _json: data,
    };

    return profile;
  }
}
