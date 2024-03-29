import { gql } from "graphql-request";

import { ScrobbleStatus } from "@prisma/client";

import { BaseProvider, type LibraryEntry } from "./base.js";

const MEDIA_LIST_QUERY = gql`
  query MediaList($userId: Int, $mediaId: Int) {
    MediaList(userId: $userId, mediaId: $mediaId) {
      media {
        id
        title {
          userPreferred
        }
        episodes
      }
      progress
    }
  }
`;

const MEDIA_LIST_MUTATION = gql`
  mutation SaveMediaListEntry($mediaId: Int, $progress: Int, $status: MediaListStatus) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
      media {
        id
        title {
          userPreferred
        }
        episodes
      }
      progress
    }
  }
`;

interface ImediaListQuery {
  MediaList: {
    media: {
      id: number;
      title: {
        userPreferred: string;
      };
      episodes: number;
    };
    progress: number;
  };
}

export class Kitsu extends BaseProvider<"graphql"> {
  constructor(providerUserId: string, accessToken: string) {
    super("graphql", "https://kitsu.io/api/graphql/", accessToken);

    this.client.setHeader("authorization", `Bearer ${this.accessToken}`);
  }

  async getEntry(id: number): Promise<LibraryEntry> {
    const rawData: Promise<ImediaListQuery> = this.client.request(
      MEDIA_LIST_QUERY,
      {
        providerUserId: this.providerUserId,
        providerMediaId: id,
      },
    );

    return Promise.resolve({
      mediaProviderId: (await rawData).MediaList.media.id,
      progress: (await rawData).MediaList.progress,
      title: (await rawData).MediaList.media.title.userPreferred,
      total: (await rawData).MediaList.media.episodes,
    });
  }

  async setProgress(
    id: number,
    episode: number,
    entry?: LibraryEntry,
  ): Promise<ScrobbleStatus> {
    const localEntry = entry ?? (await this.getEntry(id));

    if (episode > localEntry.progress) {
      const rawData: Promise<ImediaListQuery> = this.client.request(
        MEDIA_LIST_MUTATION,
        {
          mediaId: id,
          progress: episode,
          status: episode === localEntry.total ? "COMPLETED" : "CURRENT",
        },
      );

      // return Promise.resolve({
      //   mediaProviderId: (await rawData).MediaList.media.id,
      //   progress: (await rawData).MediaList.progress,
      //   title: (await rawData).MediaList.media.title.userPreferred,
      //   total: (await rawData).MediaList.media.episodes,
      // });
    }

    return Promise.resolve(ScrobbleStatus.IGNORED);
  }
}
