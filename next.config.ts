import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Increase body size limit for file uploads (PDFs, images)
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
