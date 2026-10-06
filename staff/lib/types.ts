// Shapes the staff RPCs return (docs/moderation.md, "Calls for the staff portal").

export type Person = {
  id: string;
  username: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_banned?: boolean;
};

export type ReportItem = {
  id: string;
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  source: 'user' | 'ai';
  reason: string;
  details: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  ai_labels: string[] | null;
  ai_scores: Record<string, number> | null;
  target_type: 'user' | 'post' | 'comment' | 'message';
  target_id: string;
  snapshot: Record<string, unknown> | null;
  reporter: Person | null;
  owner: Person | null;
  target: Record<string, unknown> | null;
  open_reports_on_target: number;
};

export type Sanction = {
  id: string;
  user_id: string;
  kind: 'warning' | 'suspension' | 'ban';
  reason: string;
  report_id: string | null;
  created_by: string | null;
  created_at: string;
  ends_at: string | null;
  lifted_at: string | null;
  seen_at: string | null;
};

export type AuditRow = {
  id: string;
  staff_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  report_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Scan = {
  id: number;
  status: string;
  decision: string | null;
  labels: string[] | null;
  scores: Record<string, number> | null;
  error: string | null;
  created_at: string;
  done_at: string | null;
};

export type ReportDetail = ReportItem & {
  other_reports: ReportItem[];
  sanctions: Sanction[];
  actions: AuditRow[];
  scans: Scan[];
};

/** Is this sanction still running? */
export function isActive(s: Sanction, now = Date.now()): boolean {
  if (s.lifted_at || s.kind === 'warning') return false;
  return s.kind === 'ban' || (!!s.ends_at && Date.parse(s.ends_at) > now);
}
