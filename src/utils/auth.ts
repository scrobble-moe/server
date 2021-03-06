import jsonwebtoken from "jsonwebtoken";
import { AuthChecker } from "type-graphql";

import { PrismaClient, User } from "@prisma/client";

import { Context } from "../lib/context.js";
import { env } from "../lib/env.js";

export const generateTokens = async (prisma: PrismaClient, user: User): Promise<string> => {
  const accessTokenExpires = new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 3); // 3 days
  const refreshTokenExpires = new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 40); // 40 days

  // remove expired tokens
  await prisma.token.deleteMany({
    where: {
      AND: {
        user: {
          id: user.id,
        },
        expiresAt: {
          lt: new Date(),
        },
      },
    },
  });

  const accessToken = await prisma.token.create({
    data: {
      userId: user.id,
      type: "ACCESS",
      hashedToken: jsonwebtoken.sign(
        {
          exp: accessTokenExpires.getTime(),
          sub: user.id,
          type: "access",
        },
        env.JWT_SECRET
      ),
      expiresAt: accessTokenExpires,
    },
  });

  const refreshToken = await prisma.token.create({
    data: {
      userId: user.id,
      type: "REFRESH",
      hashedToken: jsonwebtoken.sign(
        {
          exp: refreshTokenExpires.getTime(),
          sub: user.id,
          type: "refresh",
        },
        env.JWT_SECRET
      ),
      expiresAt: refreshTokenExpires,
    },
  });

  return `${accessToken.hashedToken}~${refreshToken.hashedToken}`;
};

export const authCheck: AuthChecker<Context> = ({ root, args, context, info }, roles) => {
  return true;

  // const { user } = context;

  // if (!user) {
  //   return false;
  // }

  // if (roles.find((r) => r === user.role)) {
  //   return true;
  // }

  // return false;
};
