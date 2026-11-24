import { createHash } from "node:crypto";
import path from "node:path";

const GITHUB_HOSTS = new Set(["github.com", "raw.githubusercontent.com", "cdn.jsdelivr.net"]);

export function isAllowedRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && GITHUB_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export interface GithubRepository {
  owner: string;
  repo: string;
  ref: string;
  filePath?: string;
}

export function repositoryParts(sourceUrl?: string): GithubRepository | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 4 || !["blob", "tree"].includes(parts[2])) return null;
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/, ""),
      ref: parts[3],
      filePath: parts.slice(4).join("/") || undefined,
    };
  } catch {
    return null;
  }
}

function candidatePaths(repository: GithubRepository, assetPath: string): string[] {
  const normalized = assetPath.trim().replace(/^<|>$/g, "").replace(/^\/+/, "");
  if (!normalized) return [];

  const paths = new Set<string>();
  const documentDirectory = repository.filePath ? path.posix.dirname(repository.filePath) : "";
  const candidates = [];
  if (!assetPath.trim().startsWith("/") && repository.filePath) candidates.push(path.posix.join(documentDirectory, normalized));
  if (normalized.startsWith("images/")) candidates.push(`data/${normalized}`, normalized);
  else {
    candidates.push(normalized);
    if (!normalized.startsWith("data/")) candidates.push(`data/${normalized}`);
  }
  for (const candidate of candidates) {
    const value = path.posix.normalize(candidate);
    if (value !== ".." && !value.startsWith("../") && !value.startsWith("/")) paths.add(value);
  }
  return [...paths];
}

function remoteAssetCandidates(value: string): string[] {
  try {
    const url = new URL(value);
    if (url.hostname === "raw.githubusercontent.com" || url.hostname === "cdn.jsdelivr.net") return [value];
    if (url.hostname !== "github.com") return [];
    const repository = repositoryParts(value);
    if (!repository?.filePath) return [];
    return [
      `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${repository.ref}/${repository.filePath}`,
      `https://cdn.jsdelivr.net/gh/${repository.owner}/${repository.repo}@${repository.ref}/${repository.filePath}`,
    ];
  } catch {
    return [];
  }
}

export function resolveGithubAssetCandidates(sourceUrl: string | undefined, assetPath?: string): string[] {
  if (!assetPath) return [];
  if (/^https?:\/\//i.test(assetPath)) {
    return remoteAssetCandidates(assetPath);
  }

  const repository = repositoryParts(sourceUrl);
  if (!repository) return [];

  const paths = candidatePaths(repository, assetPath);

  return paths.flatMap((path) => [
    `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${repository.ref}/${path}`,
    `https://cdn.jsdelivr.net/gh/${repository.owner}/${repository.repo}@${repository.ref}/${path}`,
  ]);
}

export function resolveExampleCaseCandidates(sourceUrl: string | undefined, cases: string[]): string[] {
  const repository = repositoryParts(sourceUrl);
  if (!repository) return [];
  return cases.flatMap((caseId) => {
    const match = caseId.match(/case\s*(\d+)/i);
    if (!match) return [];
    return ["jpg", "png"].flatMap((extension) => [
      `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${repository.ref}/data/images/case${match[1]}.${extension}`,
      `https://cdn.jsdelivr.net/gh/${repository.owner}/${repository.repo}@${repository.ref}/data/images/case${match[1]}.${extension}`,
    ]);
  });
}

export function cacheKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
