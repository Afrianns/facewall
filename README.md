This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Supabase feed setup

The feed expects `public.users` to have `id`, `auth_id`, `name`, `email`, and `profile_url`, and `public.feeds` to have `id`, `created_at`, `user_id`, `message`, and `image_url`. `users.auth_id` links to `auth.users.id`; `feeds.user_id` links to `users.id`. Passwords are handled only by Supabase Auth.

The app loads feed rows under the signed-in user's RLS policies. Apply `supabase/user_profiles.sql` to create a read-only view that exposes only profile IDs, names, and photo URLs for feed authors; this lets authors display without granting access to other users' email or password columns. Allow authenticated users to read their own `public.users` row, insert their own feed rows linked to their `users.id`, and update their own profile. If the Auth trigger did not create a profile, the app attempts to insert one using the authenticated user's `auth_id`, email, and name. That fallback needs an authenticated insert policy on `public.users`.

Post and profile image uploads use the `wall` Supabase Storage bucket. Each profile photo overwrites the single object at `users/{auth.uid()}/profile`; post images are stored at unique paths under `feeds/{auth.uid()}/...`. The app removes unused objects in the caller's `users/{auth.uid()}/` folder after profile changes. Allow authenticated select/list, insert, update, and delete access only in the matching caller-owned folder. The bucket must be public because the feed stores and displays public image URLs.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
