/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@culturespark/shared"],
  env: {
    NEXT_PUBLIC_TIME_ZONE: "Europe/Istanbul",
  },
};

export default nextConfig;
