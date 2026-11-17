"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Camera,
  ImagePlus,
  LogOut,
  Mail,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createClient as createSupabaseClient } from "@/utils/supabase/client";

type Post = {
  id: number | string;
  userId: number;
  author: string;
  avatar: string;
  createdAt: number;
  text: string;
  image?: string;
};

type Profile = {
  id: number;
  name: string;
  email: string | null;
  profileUrl: string | null;
};

type SelectedImage = {
  file: File;
  previewUrl: string;
};

type FeedRow = {
  id: number;
  created_at: string;
  user_id: number;
  message: string | null;
  image_url: string | null;
};

type UserRow = {
  id: number;
  name: string | null;
  profile_url: string | null;
};

const STORAGE_BUCKET = "wall";

async function deleteProfileImages(
  client: ReturnType<typeof createSupabaseClient>,
  paths: string[],
) {
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .remove(batch);

    if (error) {
      throw new Error(`Storage rejected deletion: ${error.message}`);
    }

    if (data?.length !== batch.length) {
      throw new Error(
        "Supabase did not confirm deleting all profile images. Check that the signed-in user has SELECT and DELETE policies on storage.objects for bucket wall and users/{auth.uid()}/.",
      );
    }
  }
}

async function removeUnusedProfileImages(
  client: ReturnType<typeof createSupabaseClient>,
  authId: string,
  keepPath: string | null,
) {
  const directory = `users/${authId}`;
  const allPaths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .list(directory, { limit: 1000, offset });

    if (error) {
      throw new Error(`Unable to check profile image storage: ${error.message}`);
    }

    const entries = data ?? [];
    allPaths.push(
      ...entries
        .filter((entry) => entry.id !== null)
        .map((entry) => `${directory}/${entry.name}`),
    );

    if (entries.length < 1000) break;
    offset += entries.length;
  }

  await deleteProfileImages(
    client,
    allPaths.filter((path) => path !== keepPath),
  );
}

async function saveProfileImageUrl(
  client: ReturnType<typeof createSupabaseClient>,
  authId: string,
  profileUrl: string | null,
) {
  const { data, error } = await client
    .from("users")
    .update({ profile_url: profileUrl })
    .eq("auth_id", authId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(
      "The profile image was not saved. Check that public.users has an UPDATE policy allowing auth_id = auth.uid() and that the user's row is visible under its SELECT policy.",
    );
  }
}

function getRelativeTime(createdAt: number, now: number) {
  const minutes = Math.floor(Math.max(0, now - createdAt) / 60_000);
  if (minutes === 0) return "now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "a day ago" : `${days} days ago`;
}

export default function WallFeed({
  authId,
  email,
  initialName,
}: {
  authId: string;
  email: string | null;
  initialName: string;
}) {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createSupabaseClient(),
  );
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [draft, setDraft] = useState("");
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const imageUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = imageUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    let cancelled = false;

    async function loadFeed() {
      setFeedLoading(true);
      setFeedError("");

      try {
        let { data: profileData, error: profileError } = await client
          .from("users")
          .select("id, name, email, profile_url")
          .eq("auth_id", authId)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profileData) {
          if (!email) {
            throw new Error(
              "This Auth account has no email, so a public.users profile cannot be created.",
            );
          }

          const { error: insertError } = await client.from("users").insert({
            auth_id: authId,
            email,
            name: initialName,
          });

          if (insertError && insertError.code !== "23505") {
            throw new Error(
              `No profile is linked to this account, and profile creation failed: ${insertError.message}. Check the authenticated INSERT policy on public.users.`,
            );
          }

          const profileResult = await client
            .from("users")
            .select("id, name, email, profile_url")
            .eq("auth_id", authId)
            .maybeSingle();

          profileData = profileResult.data;
          profileError = profileResult.error;

          if (profileError) {
            throw new Error(
              `The profile was created, but it could not be read: ${profileError.message}. Check the SELECT policy for the user's own public.users row.`,
            );
          }

          if (!profileData) {
            throw new Error(
              "Profile creation completed, but no public.users row is visible. Add a SELECT policy allowing authenticated users to read their own row by auth_id = auth.uid().",
            );
          }
        }

        const currentProfile: Profile = {
          id: Number(profileData.id),
          name:
            typeof profileData.name === "string" && profileData.name.trim()
              ? profileData.name.trim()
              : initialName,
          email:
            typeof profileData.email === "string" ? profileData.email : null,
          profileUrl:
            typeof profileData.profile_url === "string"
              ? profileData.profile_url
              : null,
        };

        if (!Number.isSafeInteger(currentProfile.id)) {
          throw new Error("The linked public.users row has an invalid id.");
        }

        const { data: feedData, error: feedsError } = await client
          .from("feeds")
          .select("id, created_at, user_id, message, image_url")
          .order("created_at", { ascending: false });

        if (feedsError) throw feedsError;

        const feedRows = (feedData ?? []) as FeedRow[];
        const userIds = [...new Set(feedRows.map((feed) => feed.user_id))];
        let authors = new Map<number, UserRow>();

        if (userIds.length > 0) {
          const { data: usersData, error: usersError } = await client
            .from("users")
            .select("id, name, profile_url")
            .in("id", userIds);

          if (usersError) throw usersError;
          authors = new Map(
            ((usersData ?? []) as UserRow[]).map((author) => [
              author.id,
              author,
            ]),
          );
        }

        const loadedPosts = feedRows.map((feed) => {
          const author = authors.get(feed.user_id);
          const createdAt = Date.parse(feed.created_at);

          return {
            id: feed.id,
            userId: feed.user_id,
            author: author?.name?.trim() || "Wall member",
            avatar: author?.profile_url ?? "",
            createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
            text: feed.message ?? "",
            image: feed.image_url ?? undefined,
          };
        });

        if (!cancelled) {
          setProfile(currentProfile);
          setProfileImage(currentProfile.profileUrl);
          setPosts(loadedPosts);
          setNow(Date.now());
        }
      } catch (error) {
        if (!cancelled) {
          setFeedError(
            error instanceof Error ? error.message : "Unable to load the feed.",
          );
        }
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    }

    void loadFeed();
    return () => {
      cancelled = true;
    };
  }, [authId, email, initialName, supabase]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  async function signOut() {
    if (!supabase) return;
    const client = supabase;

    try {
      const { error } = await client.auth.signOut();
      if (error) {
        showNotice(`Unable to sign out: ${error.message}`);
        return;
      }

      router.replace("/login");
    } catch (error) {
      showNotice(
        `Unable to sign out: ${
          error instanceof Error ? error.message : "Please try again."
        }`,
      );
    }
  }

  async function uploadImage(file: File, folder: "users" | "feeds") {
    if (!supabase) {
      throw new Error("Supabase is not ready yet. Please try again.");
    }
    const client = supabase;

    const extension =
      file.type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") ||
      "image";
    const isProfileImage = folder === "users";
    const path = isProfileImage
      ? `users/${authId}/profile`
      : `feeds/${authId}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: isProfileImage ? "0" : "3600",
        contentType: file.type,
        upsert: isProfileImage,
      });

    if (error) {
      throw new Error(
        `Image upload failed. Check the "${STORAGE_BUCKET}" bucket and its storage policies: ${error.message}`,
      );
    }

    const publicUrl = client.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(data.path).data.publicUrl;

    return {
      path: data.path,
      url: isProfileImage
        ? `${publicUrl}?v=${Date.now()}`
        : publicUrl,
    };
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showNotice("Choose an image file.");
      return;
    }

    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
      imageUrls.current.delete(selectedImage.previewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    imageUrls.current.add(previewUrl);
    setSelectedImage({ file, previewUrl });
  }

  async function selectProfileImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!supabase || !profile) return;
    const client = supabase;

    if (!file.type.startsWith("image/")) {
      showNotice("Choose an image file.");
      return;
    }

    setProfileUploading(true);
    let uploadedPath: string | null = null;
    let profileUrlSaved = false;

    try {
      const uploadedImage = await uploadImage(file, "users");
      uploadedPath = uploadedImage.path;

      await saveProfileImageUrl(client, authId, uploadedImage.url);
      profileUrlSaved = true;

      setProfileImage(uploadedImage.url);
      setProfile((currentProfile) =>
        currentProfile ? { ...currentProfile, profileUrl: uploadedImage.url } : currentProfile,
      );
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.userId === profile.id
            ? { ...post, avatar: uploadedImage.url }
            : post,
        ),
      );

      try {
        await removeUnusedProfileImages(client, authId, uploadedPath);
      } catch (error) {
        showNotice(
          `Profile photo updated, but unused images could not be removed: ${error instanceof Error ? error.message : "Unknown storage error."}`,
        );
        return;
      }

      showNotice("Profile photo updated.");
    } catch (error) {
      if (uploadedPath && !profileUrlSaved) {
        const { error: cleanupError } = await client.storage
          .from(STORAGE_BUCKET)
          .remove([uploadedPath]);
        if (cleanupError) {
          showNotice(
            `${error instanceof Error ? error.message : "Unable to update profile photo."} Cleanup failed: ${cleanupError.message}`,
          );
          return;
        }
      }
      showNotice(
        error instanceof Error ? error.message : "Unable to update profile photo.",
      );
    } finally {
      setProfileUploading(false);
    }
  }

  async function removeProfileImage() {
    if (!supabase || !profile || !profileImage || profileUploading) return;
    const client = supabase;

    setProfileUploading(true);

    try {
      await saveProfileImageUrl(client, authId, null);

      try {
        await removeUnusedProfileImages(client, authId, null);
      } catch (cleanupError) {
        setProfileImage(null);
        setProfile((currentProfile) =>
          currentProfile ? { ...currentProfile, profileUrl: null } : currentProfile,
        );
        setPosts((currentPosts) =>
          currentPosts.map((post) =>
            post.userId === profile.id ? { ...post, avatar: "" } : post,
          ),
        );
        showNotice(
          `Profile photo removed, but unused images could not be deleted: ${cleanupError instanceof Error ? cleanupError.message : "Unknown storage error."}`,
        );
        return;
      }

      setProfileImage(null);
      setProfile((currentProfile) =>
        currentProfile ? { ...currentProfile, profileUrl: null } : currentProfile,
      );
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.userId === profile.id ? { ...post, avatar: "" } : post,
        ),
      );

      showNotice("Profile photo removed.");
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Unable to remove profile photo.",
      );
    } finally {
      setProfileUploading(false);
    }
  }

  function removeSelectedImage() {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
      imageUrls.current.delete(selectedImage.previewUrl);
    }
    setSelectedImage(null);
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!supabase || !profile || (!text && !selectedImage) || posting) return;
    const client = supabase;

    setPosting(true);
    let uploadedPath: string | null = null;

    try {
      let imageUrl: string | null = null;
      if (selectedImage) {
        const uploadedImage = await uploadImage(selectedImage.file, "feeds");
        imageUrl = uploadedImage.url;
        uploadedPath = uploadedImage.path;
      }

      const { error } = await client.from("feeds").insert({
        user_id: profile.id,
        message: text || null,
        image_url: imageUrl,
      });

      if (error) throw error;

      const createdAt = Date.now();
      setNow(createdAt);
      setPosts((currentPosts) => [
        {
          id: createdAt,
          userId: profile.id,
          author: profile.name,
          avatar: profile.profileUrl ?? "",
          createdAt,
          text,
          image: imageUrl ?? undefined,
        },
        ...currentPosts,
      ]);
      if (selectedImage) {
        URL.revokeObjectURL(selectedImage.previewUrl);
        imageUrls.current.delete(selectedImage.previewUrl);
      }
      setDraft("");
      setSelectedImage(null);
      showNotice("Post added to the wall.");
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await client.storage
          .from(STORAGE_BUCKET)
          .remove([uploadedPath]);
        if (cleanupError) {
          showNotice(
            `${error instanceof Error ? error.message : "Unable to create post."} Cleanup failed: ${cleanupError.message}`,
          );
          return;
        }
      }
      showNotice(
        error instanceof Error ? error.message : "Unable to create post.",
      );
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 h-[68px] border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex justify-between h-full max-w-[1440px] items-center px-4 sm:px-6 lg:px-[38px]">
          <a className="flex items-center gap-2 text-2xl font-extrabold tracking-[-1.4px]" href="#" aria-label="Wall home">
            <span>Facewall<span className="text-primary">.</span></span>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 gap-1.5 font-sm text-red-500"
            onClick={signOut}
          >
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-start justify-center gap-4 px-3 py-4 sm:px-5 md:grid-cols-[250px_minmax(0,720px)] md:gap-5 md:px-6 md:py-6 lg:grid-cols-[280px_minmax(400px,760px)] lg:gap-[26px] lg:px-[34px] lg:py-[30px]">
        <aside className="md:sticky md:top-[92px]" aria-label="Profile">
          <Card className="overflow-hidden rounded-2xl border border-border p-0 text-center ring-0">
            <input
              ref={profileImageInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              aria-label="Choose a profile photo"
              onChange={selectProfileImage}
            />
            <div className="relative aspect-[4/3] w-full bg-muted text-muted-foreground">
              {profileImage ? (
                <span
                  className="absolute inset-0 bg-cover bg-center"
                  role="img"
                  aria-label="Current profile photo"
                  style={{ backgroundImage: `url("${profileImage}")` }}
                />
              ) : (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <UserRound className="size-12" strokeWidth={1.3} />
                  <span className="text-sm font-medium">Add a profile photo</span>
                </span>
              )}
              <button
                type="button"
                disabled={profileUploading}
                className="absolute right-3 bottom-3 inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background/95 px-2.5 text-xs font-medium text-foreground disabled:opacity-60"
                aria-label={profileImage ? "Change profile photo" : "Upload profile photo"}
                onClick={() => profileImageInputRef.current?.click()}
              >
                <Camera className="size-3.5" />
                {profileUploading
                  ? "Uploading…"
                  : profileImage
                    ? "Change photo"
                    : "Upload photo"}
              </button>
              {profileImage && (
                <button
                  type="button"
                  disabled={profileUploading}
                  className="absolute bottom-3 left-3 inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background/95 px-2.5 text-xs font-medium text-foreground disabled:opacity-60"
                  aria-label="Remove profile photo"
                  onClick={removeProfileImage}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </button>
              )}
            </div>
            <div className="px-5 py-5">
              <h1 className="m-0 text-base font-semibold tracking-tight">
                {profile?.name ?? initialName}
              </h1>
              <p className="mt-2 mb-0 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="break-all">{profile?.email ?? "—"}</span>
              </p>
            </div>
          </Card>
        </aside>

        <section className="min-w-0" aria-label="Wall feed">
          <Card className="gap-0 rounded-2xl border border-border p-3 ring-0 sm:p-[18px]">
            <form onSubmit={createPost}>
              <div className="flex items-start">
                <Textarea
                  aria-label="Write a post"
                  placeholder="Write something..."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  className="min-h-[78px] max-h-[220px] resize-y border-0 bg-transparent px-0 py-2 text-sm leading-[1.55] shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm"
                />
              </div>

              {selectedImage && (
                <div className="relative mb-3 mt-2 sm:ml-[52px]">
                  <div
                    className="aspect-[1.8/1] max-h-[340px] w-full rounded-xl bg-muted bg-cover bg-center"
                    role="img"
                    aria-label="Selected post attachment"
                    style={{ backgroundImage: `url("${selectedImage.previewUrl}")` }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="absolute right-2 top-2 rounded-full bg-background/95"
                    aria-label="Remove selected image"
                    onClick={removeSelectedImage}
                  >
                    <X />
                  </Button>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-3 border-t pt-3">
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  aria-label="Choose an image"
                  onChange={selectImage}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 gap-2 px-1 text-emerald-700 hover:text-emerald-800"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus />
                  Add image
                </Button>
                <Button
                  type="submit"
                  disabled={feedLoading || !profile || posting || (!draft.trim() && !selectedImage)}
                >
                  {posting ? "Posting…" : "Post"}
                </Button>
              </div>
            </form>
          </Card>

          {feedError && (
            <Card className="mt-4 border border-destructive/40 p-4 text-sm text-destructive ring-0" role="alert">
              {feedError}
            </Card>
          )}

          <div className="grid gap-3 pt-4">
            {feedLoading ? (
              <Card className="rounded-2xl border border-border p-5 text-sm text-muted-foreground ring-0" role="status">
                Loading feed…
              </Card>
            ) : posts.length === 0 ? (
              <Card className="rounded-2xl border border-border p-5 text-sm text-muted-foreground ring-0">
                No posts yet. Share the first one.
              </Card>
            ) : posts.map((post) => (
              <Card className="gap-0 overflow-hidden rounded-2xl border border-border p-3 ring-0 sm:p-[18px]" key={post.id}>
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-9">
                    {post.avatar && <AvatarImage src={post.avatar} alt={post.author} />}
                    <AvatarFallback>{post.author.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="flex justify-between w-full">
                    <strong className="text-xs font-semibold text-foreground">{post.author}</strong>
                    <time
                      className="text-[10px] text-muted-foreground"
                      dateTime={new Date(post.createdAt).toISOString()}
                    >
                      {getRelativeTime(post.createdAt, now)}
                    </time>
                  </div>
                </div>
                {post.text && (
                  <p className="mt-3 mb-0 wrap-anywhere text-sm leading-[1.7] text-foreground">
                    {post.text}
                  </p>
                )}
                {post.image && (
                  <div
                    className="mt-3 aspect-[1.65/1] min-h-[160px] w-full rounded-xl bg-muted bg-cover bg-center sm:min-h-[200px]"
                    role="img"
                    aria-label="Post attachment"
                    style={{ backgroundImage: `url("${post.image}")` }}
                  />
                )}
              </Card>
            ))}
          </div>
        </section>
      </main>

      {notice && (
        <div
          className="fixed right-4 bottom-4 z-40 max-w-[calc(100vw-2rem)] rounded-xl bg-foreground px-4 py-3 text-xs text-background sm:right-6 sm:bottom-6"
          role="status"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
