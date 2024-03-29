-- CreateEnum
CREATE TYPE "Transport" AS ENUM ('USB', 'BLE', 'NFC', 'INTERNAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ScrobbleStatus" AS ENUM ('IGNORED', 'TRACKED', 'ERRORED');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('ANILIST', 'KITSU');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "plexId" INTEGER NOT NULL,
    "plexAuthToken" TEXT NOT NULL,
    "thumb" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "AAGUID" TEXT NOT NULL,
    "credentialID" BYTEA NOT NULL,
    "credentialPublicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL,
    "revoked" BOOLEAN NOT NULL,
    "transports" "Transport"[],
    "userId" TEXT NOT NULL,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uuid" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrobbleGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "providerMediaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ScrobbleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrobbleEpisode" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "episode" INTEGER NOT NULL,
    "scrobbleGroupId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,

    CONSTRAINT "ScrobbleEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrobbleProviderStatus" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ScrobbleStatus" NOT NULL,
    "provider" "Provider" NOT NULL,
    "scrobbleEpisodeId" TEXT NOT NULL,

    CONSTRAINT "ScrobbleProviderStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedAccount" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" "Provider" NOT NULL,
    "accountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "accessTokenExpires" TIMESTAMP(3),
    "refreshToken" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "LinkedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ServerToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_LinkedAccountToScrobbleEpisode" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_plexId_key" ON "User"("plexId");

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- CreateIndex
CREATE UNIQUE INDEX "Server_uuid_key" ON "Server"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Server_secret_key" ON "Server"("secret");

-- CreateIndex
CREATE UNIQUE INDEX "ScrobbleGroup_userId_providerMediaId_key" ON "ScrobbleGroup"("userId", "providerMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedAccount_accountId_key" ON "LinkedAccount"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "_ServerToUser_AB_unique" ON "_ServerToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_ServerToUser_B_index" ON "_ServerToUser"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_LinkedAccountToScrobbleEpisode_AB_unique" ON "_LinkedAccountToScrobbleEpisode"("A", "B");

-- CreateIndex
CREATE INDEX "_LinkedAccountToScrobbleEpisode_B_index" ON "_LinkedAccountToScrobbleEpisode"("B");

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrobbleGroup" ADD CONSTRAINT "ScrobbleGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrobbleEpisode" ADD CONSTRAINT "ScrobbleEpisode_scrobbleGroupId_fkey" FOREIGN KEY ("scrobbleGroupId") REFERENCES "ScrobbleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrobbleEpisode" ADD CONSTRAINT "ScrobbleEpisode_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrobbleProviderStatus" ADD CONSTRAINT "ScrobbleProviderStatus_scrobbleEpisodeId_fkey" FOREIGN KEY ("scrobbleEpisodeId") REFERENCES "ScrobbleEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedAccount" ADD CONSTRAINT "LinkedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServerToUser" ADD CONSTRAINT "_ServerToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServerToUser" ADD CONSTRAINT "_ServerToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LinkedAccountToScrobbleEpisode" ADD CONSTRAINT "_LinkedAccountToScrobbleEpisode_A_fkey" FOREIGN KEY ("A") REFERENCES "LinkedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LinkedAccountToScrobbleEpisode" ADD CONSTRAINT "_LinkedAccountToScrobbleEpisode_B_fkey" FOREIGN KEY ("B") REFERENCES "ScrobbleEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
