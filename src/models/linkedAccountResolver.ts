import "reflect-metadata";

import axios, { AxiosError } from "axios";
import { Arg, Authorized, Ctx, Mutation, Query, Resolver } from "type-graphql";
import { Service } from "typedi";

import { AuthenticationError, NotFoundError } from "@frontendmonster/graphql-utils";
import pkg, { LinkedAccount as PRISMA_LinkedAccount } from "@prisma/client";

import { Context } from "../lib/context.js";
import { env } from "../lib/env.js";
import { Anilist } from "../lib/providers/anilist.js";
import { restrictUser } from "./helperTypes.js";
import {
  AddLinkedAccountInput,
  LinkedAccount,
  LinkedAccountFindManyInput,
  ProviderLoginUrlInput,
  ProviderLoginUrlResponse,
} from "./linkedAccount.js";

const { Role, Provider } = pkg;
export interface IAnilistAuthResponse {
  data: {
    token_type: string;
    expires_in: number;
    access_token: string;
    refresh_token: string;
  };
}

export interface IAnilistAuthVariables {
  grant_type: string;
  client_id: number;
  client_secret: string;
  redirect_uri: string;
  code: string;
}

@Service()
@Resolver(LinkedAccount)
export class LinkedAccountResolver {
  constructor(private readonly anilistService: Anilist) {}

  @Authorized(Role.ADMIN, Role.USER)
  @Query(() => [LinkedAccount])
  async linkedAccounts(
    @Arg("linkedAccountFindManyInput") linkedAccountFindManyInput: LinkedAccountFindManyInput,
    @Ctx() ctx: Context
  ): Promise<PRISMA_LinkedAccount[]> {
    if (!ctx.user) {
      throw new NotFoundError("User not found");
    }
    return await ctx.prisma.linkedAccount.findMany({
      ...restrictUser(linkedAccountFindManyInput, ctx.user.role, ctx.user.id),
      include: {
        scrobbles: true,
        user: true,
      },
    });
  }

  @Authorized(Role.ADMIN, Role.USER)
  @Query(() => [ProviderLoginUrlResponse])
  providerLoginUrl(
    @Arg("providerLoginUrlInput") providerLoginUrlInput: ProviderLoginUrlInput,
    @Ctx() ctx: Context
  ): ProviderLoginUrlResponse[] {
    return providerLoginUrlInput.providers.map((provider) => {
      let url: string;

      switch (provider) {
        case Provider.ANILIST:
          url = `https://anilist.co/api/v2/oauth/authorize?client_id=${env.ANILIST_ID}&redirect_uri=${env.ANILIST_REDIRECT_URL}&response_type=code`;
          break;
        case Provider.KITSU:
          url = "NOT YET IMPLEMENTED";
          break;
      }

      return {
        provider,
        url,
      };
    });
  }

  @Authorized(Role.ADMIN, Role.USER)
  @Mutation(() => LinkedAccount)
  async addLinkedAccount(
    @Arg("addLinkedAccountInput") addLinkedAccountInput: AddLinkedAccountInput,
    @Ctx() ctx: Context
  ): Promise<PRISMA_LinkedAccount> {
    if (!ctx.user) {
      throw new NotFoundError("User not found");
    }
    const anilistToken = await axios
      .post<IAnilistAuthVariables, IAnilistAuthResponse>(
        "https://anilist.co/api/v2/oauth/token",
        {
          grant_type: "authorization_code",
          client_id: env.ANILIST_ID,
          client_secret: env.ANILIST_SECRET,
          redirect_uri: env.ANILIST_REDIRECT_URL,
          code: addLinkedAccountInput.code,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      )
      .catch((error: Error | AxiosError) => {
        if (axios.isAxiosError(error)) {
          switch (error.response?.status) {
            case 403:
              throw new AuthenticationError("Invalid request");
            case 400:
              throw new AuthenticationError("Expired or already used code provided");
            default:
              throw new AuthenticationError(error.message);
          }
        } else {
          throw new Error(error.message);
        }
      });

    console.log(this.anilistService);

    const anilistTokenResponse = anilistToken.data;

    this.anilistService.setAccessToken(anilistTokenResponse.access_token);

    const accountId = await this.anilistService.getUserId();

    const linkedAccount = await ctx.prisma.linkedAccount.upsert({
      where: {
        accountId,
      },
      create: {
        accessToken: anilistTokenResponse.access_token,
        refreshToken: anilistTokenResponse.refresh_token,
        accessTokenExpires: new Date(new Date().getTime() + anilistTokenResponse.expires_in * 1000),
        accountId,
        provider: "ANILIST",
        user: {
          connect: {
            id: ctx.user.id,
          },
        },
      },
      update: {
        accessToken: anilistTokenResponse.access_token,
        refreshToken: anilistTokenResponse.refresh_token,
        accessTokenExpires: new Date(new Date().getTime() + anilistTokenResponse.expires_in * 1000),
      },
    });

    return linkedAccount;
  }
}
