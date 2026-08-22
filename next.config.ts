import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';
const repositoryName = 'rulers-of-russia';
const publicBasePath = isGitHubPages ? `/${repositoryName}` : '';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: publicBasePath,
  assetPrefix: publicBasePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: publicBasePath
  },
  images: {
    unoptimized: true
  }
};

export default nextConfig;
