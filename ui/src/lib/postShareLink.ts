/** A universal link: installed phones open Mahi; the web page sends everyone else to a store. */
export function postShareUrl(postId: string): string {
  return `https://togethermahi.com/p/${encodeURIComponent(postId)}`;
}

export function postShareMessage(post: {
  id: string;
  profiles: { username: string; display_name: string | null };
}): string {
  const name = post.profiles.display_name ?? `@${post.profiles.username}`;
  return `See ${name}’s workout on Mahi:\n${postShareUrl(post.id)}`;
}
