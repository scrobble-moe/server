// import 'reflect-metadata';

// import { Field, ID, ObjectType, registerEnumType } from 'type-graphql';

// import { User } from './user';

// enum Transport {
//   USB,
//   BLE,
//   NFC,
//   INTERNAL,
// }

// registerEnumType(Transport, {
//   name: "Transport",
// });

// @ObjectType()
// export class Authenticator {
//   @Field()
//   credentialID: string; // @TODO: should be of type Bytes

//   @Field()
//   credentialPublicKey: string; // @TODO: should be of type Bytes

//   @Field()
//   counter: number;

//   @Field((type) => Transport)
//   transports: Transport;

//   @Field((type) => User)
//   user: User;
// }
