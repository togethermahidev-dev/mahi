import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import type { Person } from '@/lib/types';
import { Badge, Empty, ErrorNote, Section } from '@/components/bits';
import { cardClass, inputClass, primaryButtonClass } from '@/components/styles';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = 'id, username, display_name, avatar_url, is_banned';

function PersonRow({ p }: { p: Person }) {
  return (
    <Link href={`/users/${p.id}`} className={`${cardClass} flex flex-wrap items-center gap-s8`}>
      <span className="text-f16 font-semi-bold">{`@${p.username ?? '?'}`}</span>
      {p.display_name && <span className="text-f14 text-grey888">{p.display_name}</span>}
      {p.is_banned && <Badge tone="danger">Suspended or banned</Badge>}
    </Link>
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
  const { data: blocked, error: blockedError } = await db
    .from('profiles')
    .select(COLUMNS)
    .eq('is_banned', true)
    .order('username')
    .limit(200);

  return (
    <>
      <h1 className="text-f24 font-bold">People</h1>
      <form className="mt-s16 flex flex-wrap items-end gap-s12" method="get">
        <label className="flex flex-col gap-s4 text-f13 font-semi-bold">
          Username, name or id
          <input name="q" defaultValue={q} className={inputClass} />
        </label>
        <button type="submit" className={primaryButtonClass}>
          Search
        </button>
      </form>
      {q && (
        <Section title="Results">
          {searchError && <ErrorNote message={`Couldn't search: ${searchError}`} />}
          {!searchError && found.length === 0 && <Empty>No one matches.</Empty>}
          <div className="flex flex-col gap-s8">
            {found.map((p) => (
              <PersonRow key={p.id} p={p} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Suspended or banned now">
        {blockedError && <ErrorNote message={`Couldn't load: ${blockedError.message}`} />}
        {!blockedError && !blocked?.length && <Empty>No one.</Empty>}
        <div className="flex flex-col gap-s8">
          {((blocked ?? []) as Person[]).map((p) => (
            <PersonRow key={p.id} p={p} />
          ))}
        </div>
      </Section>
    </>
  );
}
