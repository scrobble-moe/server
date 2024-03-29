import type { AuthService } from "@buf/scrobble-moe_protobufs.bufbuild_connect-es/moe/scrobble/auth/v1/auth_service_connect.js";
import type {
  AddAuthenticatorRequest,
  GetAuthenticatorRegistrationOptionsRequest,
  GetTokensRequest,
  PlexAuthRequest,
  RevokeAuthenticatorRequest,
  RevokeTokenRequest,
  WebAuthnRequest,
} from "@buf/scrobble-moe_protobufs.bufbuild_es/moe/scrobble/auth/v1/auth_pb.js";
import {
  AddAuthenticatorResponse,
  GetAuthenticatorRegistrationOptionsResponse,
  GetTokensResponse,
  PlexAuthResponse,
  RevokeAuthenticatorResponse,
  RevokeTokenResponse,
  WebAuthnResponse,
} from "@buf/scrobble-moe_protobufs.bufbuild_es/moe/scrobble/auth/v1/auth_pb.js";
import { Timestamp } from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  type HandlerContext,
  type ServiceImpl,
} from "@connectrpc/connect";
import { createId } from "@paralleldrive/cuid2";
import type { Transport } from "@prisma/client";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/typescript-types";
import { prisma, redis } from "../lib/index.js";
import {
  generateCooke,
  base64Decode,
  base64Encode,
  getPlexAccount,
} from "../utils/index.js";
import type { UserManager } from "../utils/index.js";
import { BaseService } from "./BaseService.js";

export class Auth
  extends BaseService<string>
  implements ServiceImpl<typeof AuthService>
{
  constructor(protected userManager: UserManager) {
    super(userManager);
  }

  private tokenExpiration = 60 * 60 * 24 * 7; // 7 days
  private challengeExpiration = 60 * 5; // 5 minutes

  public async plexAuth(req: PlexAuthRequest): Promise<PlexAuthResponse> {
    try {
      const plexAccountData = await getPlexAccount(req.plexToken);

      const user = await prisma.user.upsert({
        where: {
          plexId: plexAccountData.user.id,
        },
        include: {
          authenticators: true,
        },
        update: {
          email: plexAccountData.user.email,
          plexAuthToken: req.plexToken,
          thumb: plexAccountData.user.thumb,
          username: plexAccountData.user.username,
        },
        create: {
          id: createId(),
          email: plexAccountData.user.email,
          plexAuthToken: req.plexToken,
          plexId: plexAccountData.user.id,
          thumb: plexAccountData.user.thumb,
          username: plexAccountData.user.username,
        },
      });

      const isRegistering = user.authenticators.length === 0;

      let webauthnOptions:
        | PublicKeyCredentialCreationOptionsJSON
        | PublicKeyCredentialRequestOptionsJSON;

      if (isRegistering) {
        webauthnOptions = await generateRegistrationOptions({
          rpID: process.env.RP_ID,
          rpName: process.env.RP_NAME,
          userID: user.id,
          userName: user.username,
          attestationType: "direct",
          authenticatorSelection: {
            requireResidentKey: true,
          },
        });
      } else {
        webauthnOptions = await generateAuthenticationOptions({
          rpID: process.env.RP_ID,
          userVerification: "required",
          allowCredentials: user.authenticators
            .filter((a) => !a.revoked)
            .map((authenticator) => {
              return {
                id: authenticator.credentialID,
                transports: authenticator.transports.map(
                  (transport) =>
                    transport.toLowerCase() as AuthenticatorTransport,
                ),
                type: "public-key",
              };
            }),
        });
      }

      await redis.set(`challenge:${user.id}`, webauthnOptions.challenge, {
        EX: this.challengeExpiration,
      });

      return new PlexAuthResponse({
        username: plexAccountData.user.username,
        avatarUrl: plexAccountData.user.thumb,
        webauthnOptions: {
          case: isRegistering ? "create" : "request",
          value: base64Encode(JSON.stringify(webauthnOptions)),
        },
      });
    } catch (error) {
      throw new ConnectError((error as Error).message, Code.Internal);
    }
  }

  public async webAuthn(
    req: WebAuthnRequest,
    ctx: HandlerContext,
  ): Promise<WebAuthnResponse> {
    try {
      const plexAccountData = await getPlexAccount(req.plexToken);

      const user = await prisma.user.findUnique({
        where: {
          plexId: plexAccountData.user.id,
        },
        include: {
          _count: {
            select: {
              authenticators: true,
            },
          },
        },
      });

      if (!user) {
        throw new ConnectError("User not found.", Code.NotFound);
      }

      this.userManager.setUserId(user.id);

      const challenge = await redis.get(`challenge:${user.id}`);

      if (!challenge) {
        throw new ConnectError(
          "Challenge has not been generated yet.",
          Code.FailedPrecondition,
        );
      }

      if (user._count.authenticators > 0) {
        const response = JSON.parse(
          base64Decode(req.verification),
        ) as AuthenticationResponseJSON;
        const authenticator = await prisma.authenticator.findUnique({
          where: {
            credentialID: Buffer.from(response.rawId, "base64url"),
          },
        });

        if (!authenticator) {
          throw new ConnectError("Authenticator not found", Code.NotFound);
        }

        const { transports, ...rest } = authenticator;

        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: process.env.RP_ORIGIN,
          expectedRPID: process.env.RP_ID,
          authenticator: {
            ...rest,
            transports: transports.map(
              (transport) => transport.toLowerCase() as AuthenticatorTransport,
            ),
          },
        });

        if (!verification.verified)
          throw new ConnectError("Verification Failed", Code.PermissionDenied);

        await prisma.authenticator.update({
          where: {
            credentialID: authenticator.credentialID,
          },
          data: {
            counter: verification.authenticationInfo.newCounter,
          },
        });
      } else {
        const authenticatorData = JSON.parse(
          base64Decode(req.verification),
        ) as RegistrationResponseJSON;
        const verification = await verifyRegistrationResponse({
          response: authenticatorData,
          expectedChallenge: challenge,
          expectedOrigin: process.env.RP_ORIGIN,
          expectedRPID: process.env.RP_ID,
        });

        if (!verification.verified)
          throw new ConnectError("Challenge Failed", Code.PermissionDenied);

        if (!verification.registrationInfo)
          throw new ConnectError(
            "Registration data malformed",
            Code.InvalidArgument,
          );

        await prisma.authenticator.create({
          data: {
            id: createId(),
            friendlyName: "Primary",
            AAGUID: verification.registrationInfo.aaguid,
            credentialID: Buffer.from(
              verification.registrationInfo.credentialID,
            ),
            credentialPublicKey: Buffer.from(
              verification.registrationInfo.credentialPublicKey,
            ),
            counter: verification.registrationInfo.counter,
            revoked: false,
            transports: authenticatorData.response.transports?.map(
              (transport) => {
                return transport.toUpperCase() as Transport;
              },
            ),
            user: {
              connect: {
                id: user.id,
              },
            },
          },
        });
      }

      const tokenId = createId();

      const token = this.userManager.generateToken(tokenId);

      await redis.set(`token:${tokenId}`, user.id, {
        EX: this.tokenExpiration,
      });

      const cookie = generateCooke("Token", token, this.tokenExpiration);

      ctx.responseHeader.set("Set-Cookie", cookie.toString());

      return new WebAuthnResponse();
    } catch (error) {
      throw new ConnectError((error as Error).message, Code.Internal);
    }
  }

  public async getAuthenticatorRegistrationOptions(
    req: GetAuthenticatorRegistrationOptionsRequest,
    ctx: HandlerContext,
  ): Promise<GetAuthenticatorRegistrationOptionsResponse> {
    try {
      await this.authorization(ctx);

      const user = this.userManager.user;

      const registrationOptions = await generateRegistrationOptions({
        rpID: process.env.RP_ID,
        rpName: process.env.RP_NAME,
        userID: user.id,
        userName: user.username,
        attestationType: "direct",
        authenticatorSelection: {
          requireResidentKey: true,
        },
        // excludeCredentials
      });

      await redis.set(`challenge:${user.id}`, registrationOptions.challenge, {
        EX: 60 * 5,
      });

      return new GetAuthenticatorRegistrationOptionsResponse({
        options: base64Encode(JSON.stringify(registrationOptions)),
      });
    } catch (error) {
      throw new ConnectError((error as Error).message, Code.Internal);
    }
  }

  public async addAuthenticator(
    req: AddAuthenticatorRequest,
    ctx: HandlerContext,
  ): Promise<AddAuthenticatorResponse> {
    try {
      await this.authorization(ctx);

      const user = this.userManager.user;

      const challenge = await redis.get(`challenge:${user.id}`);

      if (!challenge)
        throw new ConnectError(
          "Challenge has not been generated yet.",
          Code.FailedPrecondition,
        );

      const registrationResponse = JSON.parse(
        base64Decode(req.verification),
      ) as RegistrationResponseJSON;

      const verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: challenge,
        expectedOrigin: process.env.RP_ORIGIN,
        expectedRPID: process.env.RP_ID,
      });

      await redis.del(`challenge:${user.id}`);

      if (!verification.verified) {
        throw new ConnectError("Verification Failed", Code.PermissionDenied);
      }

      if (!verification.registrationInfo) {
        throw new ConnectError(
          "Registration data malformed",
          Code.InvalidArgument,
        );
      }

      await prisma.authenticator.create({
        data: {
          id: createId(),
          friendlyName: req.name,
          AAGUID: verification.registrationInfo.aaguid,
          credentialID: Buffer.from(verification.registrationInfo.credentialID),
          credentialPublicKey: Buffer.from(
            verification.registrationInfo.credentialPublicKey,
          ),
          counter: verification.registrationInfo.counter,
          revoked: false,
          transports: registrationResponse.response.transports?.map(
            (transport) => {
              return transport.toUpperCase() as Transport;
            },
          ),
          user: {
            connect: {
              id: user.id,
            },
          },
        },
      });

      return new AddAuthenticatorResponse();
    } catch (error) {
      throw new ConnectError((error as Error).message, Code.Internal);
    }
  }

  public async revokeAuthenticator(
    req: RevokeAuthenticatorRequest,
    ctx: HandlerContext,
  ): Promise<RevokeAuthenticatorResponse> {
    try {
      await this.authorization(ctx);

      const authenticators = await prisma.authenticator.findMany({
        where: {
          user: {
            id: this.userManager.user.id,
          },
        },
      });

      if (authenticators.length < 2) {
        throw new ConnectError(
          "Cannot remove the last authenticator.",
          Code.PermissionDenied,
        );
      }

      if (
        authenticators.filter((authenticator) => !authenticator.revoked)
          .length < 2
      ) {
        throw new ConnectError(
          "Cannot revoke the last active authenticator.",
          Code.PermissionDenied,
        );
      }

      const authenticator = authenticators.find(
        (authenticator) => authenticator.id === req.id,
      );

      if (!authenticator) {
        throw new ConnectError("Authenticator not found.", Code.NotFound);
      }

      if (authenticator.userId !== this.userManager.user.id) {
        throw new ConnectError(
          "Authenticator does not belong to the authenticated user.",
          Code.PermissionDenied,
        );
      }

      await prisma.authenticator.update({
        where: {
          id: req.id,
        },
        data: {
          revoked: true,
        },
      });

      return new RevokeAuthenticatorResponse();
    } catch (error) {
      throw new ConnectError((error as Error).message, Code.Internal);
    }
  }

  public async getTokens(
    req: GetTokensRequest,
    ctx: HandlerContext,
  ): Promise<GetTokensResponse> {
    try {
      await this.authorization(ctx);

      const tokens: string[] = [];

      const scanIterator = redis.scanIterator({
        MATCH: "token:*",
      });

      for await (const key of scanIterator) {
        const userId = await redis.get(key);

        if (userId === this.userManager.user.id) {
          tokens.push(key);
        }
      }

      const data = await Promise.all(
        tokens.map(async (token) => {
          return {
            id: token.split(":")[1],
            expires: Timestamp.fromDate(new Date(await redis.ttl(token))),
            current: token.split(":")[1] === this.userManager.tokenId,
          };
        }),
      );

      return new GetTokensResponse({
        tokens: data,
      });
    } catch (error) {
      throw new ConnectError((error as Error).message, Code.Internal);
    }
  }

  public async revokeToken(
    req: RevokeTokenRequest,
    ctx: HandlerContext,
  ): Promise<RevokeTokenResponse> {
    try {
      await this.authorization(ctx);

      const userId = await redis.get(`token:${req.id}`);

      if (!userId) {
        throw new ConnectError("Token not found.", Code.NotFound);
      }

      if (req.id === this.userManager.tokenId) {
        throw new ConnectError(
          "Cannot revoke the current token.",
          Code.PermissionDenied,
        );
      }

      if (userId !== this.userManager.user.id) {
        throw new ConnectError(
          "Token does not belong to the authenticated user.",
          Code.PermissionDenied,
        );
      }

      await redis.del(`token:${req.id}`);

      return new RevokeTokenResponse();
    } catch (error) {
      throw new ConnectError((error as Error).message, Code.Internal);
    }
  }
}
