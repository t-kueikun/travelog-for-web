const distDir = process.env.NEXT_DIST_DIR || ".next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir
};

export default nextConfig;
