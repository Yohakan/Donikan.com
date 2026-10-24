export type SiteFile = { yol: string; icerik: string };

export type VersionInfo = { id: string; number: number; note: string; createdAt: string };

export type ProjectData = {
  id: string;
  title: string;
  prompt: string;
  analysis: any;
  published: boolean;
  slug: string | null;
  files: SiteFile[];
  version: number;
  versions: VersionInfo[];
};
