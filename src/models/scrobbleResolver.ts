import "reflect-metadata";

import { Arg, Authorized, Ctx, FieldResolver, Query, Resolver, Root } from "type-graphql";

import { NotFoundError } from "@frontendmonster/graphql-utils";
import {
  LinkedAccount,
  Role,
  Scrobble as PRISMA_Scrobble,
  ScrobbleProviderStatus,
  Server,
  User,
} from "@prisma/client";

import { Context } from "../lib/context";
import { restrictUser } from "./helperTypes";
import { Scrobble, ScrobbleFindManyInput } from "./scrobble";

@Resolver(Scrobble)
export class ScrobbleResolver {
  @FieldResolver()
  async user(@Root() scrobble: Scrobble, @Ctx() ctx: Context): Promise<User> {
    const user = await ctx.prisma.scrobble
      .findUnique({
        where: {
          id: scrobble.id,
        },
      })
      .user();

    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  }

  @FieldResolver()
  async server(@Root() scrobble: Scrobble, @Ctx() ctx: Context): Promise<Server> {
    const server = await ctx.prisma.scrobble
      .findUnique({
        where: {
          id: scrobble.id,
        },
      })
      .server();

    if (!server) {
      throw new NotFoundError("Server not found");
    }
    return server;
  }

  @FieldResolver()
  async accounts(@Root() scrobble: Scrobble, @Ctx() ctx: Context): Promise<LinkedAccount[]> {
    return await ctx.prisma.scrobble
      .findUnique({
        where: {
          id: scrobble.id,
        },
      })
      .accounts();
  }

  @FieldResolver()
  async status(@Root() scrobble: Scrobble, @Ctx() ctx: Context): Promise<ScrobbleProviderStatus[]> {
    return await ctx.prisma.scrobble
      .findUnique({
        where: {
          id: scrobble.id,
        },
      })
      .status();
  }

  @Authorized(Role.ADMIN, Role.USER)
  @Query(() => [Scrobble])
  async scrobbles(
    @Arg("scrobbleFindManyInput") scrobbleFindManyInput: ScrobbleFindManyInput,
    @Ctx() ctx: Context
  ): Promise<PRISMA_Scrobble[]> {
    return await ctx.prisma.scrobble.findMany(
      restrictUser(scrobbleFindManyInput, ctx.user.role, ctx.user.id)
    );
  }
}
