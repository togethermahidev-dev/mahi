import { msLeft } from './countdown';
import { timeLeftText } from './feedLock';

/**
 * "Your crew": the friends you're tied to right now, from data the app already reads fresh —
 * who tagged you and is waiting (with the time left), and who you tagged on your latest post
 * (and whether they've answered you since). Never "missed" or "late": it shows progress, not
 * blame. At most three, one entry per friend; nothing here is kept on the phone.
 */
export type CrewStatus = 'waiting' | 'answered' | 'open';
export type CrewMember = {
  id: string;
  username: string;
  name: string;
  avatar_url: string | null;
  status: CrewStatus;
  line: string;
};

type Person = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

const CREW_MAX = 3;

export function crewStrip({
  me,
  openTags,
  posts,
  serverOffsetMs,
  deviceNow = Date.now(),
}: {
  me: { id: string; username: string | null };
  openTags: (Person & { tagger_id: string; expires_at: string })[];
  posts: {
    created_at: string;
    profiles: Person & { id: string };
    tagged_users: (Person & { user_id: string })[];
    response?: { tagger_username: string } | null;
  }[];
  serverOffsetMs: number;
  deviceNow?: number;
}): CrewMember[] {
  const crew: CrewMember[] = [];
  const add = (id: string, p: Person, status: CrewStatus, line: string) => {
    if (crew.length >= CREW_MAX || crew.some((c) => c.id === id)) return;
    crew.push({
      id,
      username: p.username,
      name: p.display_name ?? p.username,
      avatar_url: p.avatar_url,
      status,
      line,
    });
  };

  [...openTags]
    .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at))
    .forEach((t) => {
      const left = timeLeftText(msLeft(t.expires_at, serverOffsetMs, deviceNow));
      add(t.tagger_id, t, 'waiting', left ? `${left} left` : 'Last minutes');
    });

  const latest = posts
    .filter((p) => p.profiles.id === me.id)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (latest) {
    const since = Date.parse(latest.created_at);
    const answered = new Set(
      posts
        .filter(
          (p) =>
            !!me.username &&
            p.response?.tagger_username === me.username &&
            Date.parse(p.created_at) >= since
        )
        .map((p) => p.profiles.id)
    );
    const tagged = [...latest.tagged_users].sort(
      (a, b) => Number(answered.has(b.user_id)) - Number(answered.has(a.user_id))
    );
    tagged.forEach((u) =>
      answered.has(u.user_id)
        ? add(u.user_id, u, 'answered', 'Answered you')
        : add(u.user_id, u, 'open', 'Your tag')
    );
  }
  return crew;
}
