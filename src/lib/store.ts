import { prisma } from './db';
import type { ProjectData, SiteFile } from './types';

export async function loadProject(id: string): Promise<ProjectData | null> {
  const p = await prisma.project.findUnique({ where: { id } });
  if (!p) return null;
  const versions = await prisma.version.findMany({
    where: { projectId: id },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, note: true, createdAt: true },
  });
  const latest = await prisma.version.findFirst({ where: { projectId: id }, orderBy: { number: 'desc' } });
  if (!latest) return null;
  return {
    id: p.id,
    title: p.title,
    prompt: p.prompt,
    analysis: p.analysis ? JSON.parse(p.analysis) : null,
    published: p.published,
    slug: p.slug,
    files: JSON.parse(latest.files) as SiteFile[],
    version: latest.number,
    versions: versions.map((v) => ({ id: v.id, number: v.number, note: v.note, createdAt: v.createdAt.toISOString() })),
  };
}

export async function addVersion(projectId: string, files: SiteFile[], note: string) {
  const last = await prisma.version.findFirst({ where: { projectId }, orderBy: { number: 'desc' } });
  await prisma.version.create({
    data: { projectId, number: (last?.number ?? 0) + 1, note: note.slice(0, 160), files: JSON.stringify(files) },
  });
  await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
}
