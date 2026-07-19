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
        "node_modules/googleapis/build/src/apis/!(sheets|drive)/**/*",
      ],
    },
  },
}

export default nextConfig
