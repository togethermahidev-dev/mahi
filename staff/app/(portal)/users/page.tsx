import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import { standingOf } from '@/lib/present';
import type { Person, Sanction } from '@/lib/types';
import { Empty, ErrorNote, PageTitle, Section, StandingBadge } from '@/components/bits';
import { cardClass, inputClass, primaryButtonClass } from '@/components/styles';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = 'id, username, display_name, avatar_url, is_banned';

function PersonList({ people, sanctions }: { people: Person[]; sanctions: Sanction[] }) {
  return (
    <ul className="flex flex-col gap-s8">
      {people.map((p) => (
        <li key={p.id}>
          <Link href={`/users/${p.id}`} className={`${cardClass} flex min-h-z44 flex-wrap items-center gap-s8`}>
            <span className="text-f16 font-semi-bold">{`@${p.username ?? '?'}`}</span>
            {p.display_name && <span className="shrinkable truncate text-f14 text-grey888">{p.display_name}</span>}
            <span className="ml-auto">
              <StandingBadge standing={standingOf(sanctions.filter((s) => s.user_id === p.id), !!p.is_banned)} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Find a person by username, name or id; below, everyone suspended or banned right now.
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { db } = await requireStaff();
  const q = ((await searchParams).q ?? '').trim();
  // Only letters, numbers, spaces, dots and underscores reach the filter (no PostgREST syntax).
  const safe = q.replace(/^@/, '').replace(/[^\p{L}\p{N} ._]/gu, '').replace(/_/g, '\\_').slice(0, 50);

  let found: Person[] = [];
  let searchError: string | null = null;
  if (q) {
    const query = UUID.test(q)
      ? db.from('profiles').select(COLUMNS).eq('id', q)
      : db.from('profiles').select(COLUMNS).or(`username.ilike.*${safe}*,display_name.ilike.*${safe}*`).order('username').limit(50);
    const { data, error } = await query;
    found = (data ?? []) as Person[];
    searchError = error?.message ?? null;
  }
  const { data: blockedData, error: blockedError } = await db.from('profiles').select(COLUMNS).eq('is_banned', true).order('username').limit(200);
  const blocked = (blockedData ?? []) as Person[];

  // Their warnings, suspensions and bans, for the standing badges.
  const ids = [...new Set([...found, ...blocked].map((p) => p.id))];
  const { data: sanctionData } = ids.length
    ? await db.from('user_sanctions').select('*').in('user_id', ids)
    : { data: [] };
  const sanctions = (sanctionData ?? []) as Sanction[];

  return (
    <>
      <PageTitle title="People" intro="Find someone to see their history and act on their account." />
      <form method="get" role="search" className="flex gap-s8">
        <label className="sr-only" htmlFor="q">
          Username, name or id
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Username, name or id" className={inputClass} />
        <button type="submit" className={primaryButtonClass}>
          Search
        </button>
      </form>
      {q && (
        <Section title="Results">
          {searchError && <ErrorNote message={`Couldn't search. Try again in a moment. (${searchError})`} />}
          {!searchError && found.length === 0 && <Empty>{`No one matches "${q}".`}</Empty>}
          <PersonList people={found} sanctions={sanctions} />
        </Section>
      )}
      <div id="blocked">
        <Section title="Suspended or banned now">
          {blockedError && <ErrorNote message={`Couldn't load this list. Try again in a moment. (${blockedError.message})`} />}
          {!blockedError && !blocked.length && <Empty>No one is suspended or banned.</Empty>}
          <PersonList people={blocked} sanctions={sanctions} />
        </Section>
      </div>
    </>
  );
}
