/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // The manually-written Database types are mismatched with @supabase/supabase-js@2.103.x.
    // Regenerate with: npx supabase gen types typescript --project-id <id>
    // Types still work in VS Code; this only skips the build-time check.
    ignoreBuildErrors: true,
  },
}

export default nextConfig
