import { NextResponse } from "next/server";

interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
}

interface GitHubDetail {
  stats: { additions: number; deletions: number; total: number };
  files: GitHubFile[];
}

export async function GET() {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;

  const commitsRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`,
    { headers }
  );
  const commits: GitHubCommit[] = await commitsRes.json();

  if (!Array.isArray(commits)) {
    return NextResponse.json({ error: "Ошибка получения коммитов" }, { status: 500 });
  }

  const detailed = await Promise.all(
    commits.map(async (c) => {
      const detailRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${c.sha}`,
        { headers }
      );
      const detail: GitHubDetail = await detailRes.json();
      return {
        sha:     c.sha.slice(0, 7),
        message: c.commit.message,
        author:  c.commit.author.name,
        date:    c.commit.author.date,
        stats:   detail.stats,
        files:   (detail.files ?? []).map((f) => ({
          filename:  f.filename,
          status:    f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes:   f.changes,
        })),
      };
    })
  );

  return NextResponse.json(detailed);
}