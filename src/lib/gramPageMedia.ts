/** Shared public gram media URL builder (server-safe). */
export const mediaUrl = (path?: string | null) =>
  !path
    ? ""
    : /^https?:/.test(path)
      ? path
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gram/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;
