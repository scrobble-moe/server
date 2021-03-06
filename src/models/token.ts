import "reflect-metadata";

import { Field, InputType, ObjectType, registerEnumType } from "type-graphql";

import type { Prisma as PrismaType, TokenType as TokenTypeType } from "@prisma/client";
import pkg from "@prisma/client";

import { ArrayFilter } from "../utils/types/ArrayFilter.js";
import { DateTimeFilter } from "../utils/types/DateTimeFilter.js";
import { EnumFilter } from "../utils/types/EnumFilter.js";
import { StringFilter } from "../utils/types/StringFilter.js";
import {
  BasePrismaModel,
  FilterWhereInput,
  FindManyWithScopeInput,
  WhereUniqueInput,
} from "./helperTypes.js";
import { BaseUserFilterWhereInput, User } from "./user.js";

const { Prisma, TokenType } = pkg;
registerEnumType(TokenType, {
  name: "TokenType",
});

registerEnumType(Prisma.TokenScalarFieldEnum, {
  name: "TokenScalarFieldEnum",
});

@InputType()
export class TokenTypeEnumFilter extends EnumFilter(TokenType) {}

@InputType()
export class BaseTokenFilterWhereInput extends FilterWhereInput {
  @Field({ nullable: true })
  hashedToken?: StringFilter;

  @Field({ nullable: true })
  expiresAt?: DateTimeFilter;

  @Field(() => TokenTypeEnumFilter, { nullable: true })
  type?: TokenTypeEnumFilter;
}

@InputType()
export class TokenFilterWhereInput extends BaseTokenFilterWhereInput {
  @Field(() => BaseUserFilterWhereInput, { nullable: true })
  user?: BaseUserFilterWhereInput;
}

@InputType()
export class TokenArrayFilter extends ArrayFilter(BaseTokenFilterWhereInput) {}

@InputType()
export class TokenUniqueInput extends WhereUniqueInput {
  @Field({ nullable: true })
  hashedToken?: string;
}

@InputType()
export class TokenFindManyInput extends FindManyWithScopeInput {
  @Field(() => TokenFilterWhereInput, { nullable: true })
  where?: TokenFilterWhereInput;

  @Field(() => TokenUniqueInput, { nullable: true })
  cursor?: TokenUniqueInput;

  @Field(() => Prisma.TokenScalarFieldEnum, { nullable: true })
  distinct?: PrismaType.TokenScalarFieldEnum;
}

@ObjectType()
export class Token extends BasePrismaModel {
  @Field()
  expiresAt: Date;

  @Field(() => TokenType)
  type: TokenTypeType;

  @Field(() => User)
  user: User;
}
