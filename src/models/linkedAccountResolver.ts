import "reflect-metadata";

import { AuthenticationError } from "apollo-server";
import axios, { AxiosError } from "axios";
import { Arg, Authorized, Ctx, FieldResolver, Mutation, Query, Resolver, Root } from "type-graphql";

import { NotFoundError } from "@frontendmonster/graphql-utils";
import {
  LinkedAccount as PRISMA_LinkedAccount,
  Provider,
  Role,
  Scrobble,
  User,
} from "@prisma/client";

import { Context } from "../lib/context";
import { env } from "../lib/env";
import { restrictUser } from "./helperTypes";
import {
  AddLinkedAccountInput,
  LinkedAccount,
  LinkedAccountFindManyInput,
  ProviderLoginUrlInput,
  ProviderLoginUrlResponse,
} from "./linkedAccount";

export interface IAnilistAuthResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

@Resolver(LinkedAccount)
export class LinkedAccountResolver {
  @FieldResolver()
  async scrobbles(@Root() linkedAccount: LinkedAccount, @Ctx() ctx: Context): Promise<Scrobble[]> {
    return await ctx.prisma.linkedAccount
      .findUnique({
        where: {
          id: linkedAccount.id,
        },
      })
      .scrobbles();
  }

  @FieldResolver()
  async user(@Root() linkedAccount: LinkedAccount, @Ctx() ctx: Context): Promise<User> {
    const user = await ctx.prisma.linkedAccount
      .findUnique({
        where: {
          id: linkedAccount.id,
        },
      })
      .user();

    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  }

  @Authorized(Role.ADMIN, Role.USER)
  @Query(() => [LinkedAccount])
  async linkedAccounts(
    @Arg("linkedAccountFindManyInput") linkedAccountFindManyInput: LinkedAccountFindManyInput,
    @Ctx() ctx: Context
  ): Promise<PRISMA_LinkedAccount[]> {
    return await ctx.prisma.linkedAccount.findMany(
      restrictUser(linkedAccountFindManyInput, ctx.user.role, ctx.user.id)
    );
  }

  @Authorized(Role.ADMIN, Role.USER)
  @Query(() => ProviderLoginUrlResponse)
  providerLoginUrl(
    @Arg("providerLoginUrlInput") providerLoginUrlInput: ProviderLoginUrlInput,
    @Ctx() ctx: Context
  ): ProviderLoginUrlResponse {
    switch (providerLoginUrlInput.provider) {
      case Provider.ANILIST:
        return {
          url: `https://anilist.co/api/v2/oauth/authorize?client_id=${env.ANILIST_ID}&redirect_uri=${env.ANILIST_REDIRECT_URL}&response_type=code`,
        };
      case Provider.KITSU:
        return {
          url: "NOT YET IMPLEMENTED",
        };
    }
  }

  @Authorized(Role.ADMIN, Role.USER)
  @Mutation(() => LinkedAccount)
  async addLinkedAccount(
    @Arg("addLinkedAccountInput") addLinkedAccountInput: AddLinkedAccountInput,
    @Ctx() ctx: Context
  ): Promise<PRISMA_LinkedAccount> {
    const anilistToken = await axios
      .post(
        "https://anilist.co/api/v2/oauth/token",
        {
          grant_type: "authorization_code",
          client_id: env.ANILIST_ID,
          client_secret: env.ANILIST_SECRET,
          redirect_uri: "http://localhost:3000",
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
              throw new AuthenticationError("Unknown Error");
          }
        } else {
          throw new Error(error.message);
        }
      });

    const anilistTokenResponse = anilistToken.data as IAnilistAuthResponse;

    const linkedAccount = await ctx.prisma.linkedAccount.create({
      data: {
        accessToken: anilistTokenResponse.access_token,
        refreshToken: anilistTokenResponse.refresh_token,
        accessTokenExpires: new Date(anilistTokenResponse.expires_in),
        accountId: "abc",
        provider: "ANILIST",
        user: {
          connect: {
            id: ctx.user?.id,
          },
        },
      },
    });

    return linkedAccount;
  }
}
