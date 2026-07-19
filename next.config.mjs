/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["googleapis", "google-auth-library", "googleapis-common"],
  experimental: {
    outputFileTracingExcludes: {
      "*": [
        "./node_modules/googleapis/build/src/apis/**",
      ],
    },
    outputFileTracingIncludes: {
      "*": [
        "./node_modules/googleapis/build/src/apis/sheets/**",
        "./node_modules/googleapis/build/src/apis/drive/**",
        "./node_modules/googleapis/build/src/apis/index.js",
      ],
    },
  },
}

export default nextConfig
