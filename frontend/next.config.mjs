/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: { styledComponents: true },
  transpilePackages: [
    '@make-software/csprclick-ui',
    '@make-software/csprclick-core-types',
  ],
};

export default nextConfig;
