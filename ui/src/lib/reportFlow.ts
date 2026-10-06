/**
 * Report a post, comment or person: the phone's menu of reasons, then the server call, then a
 * toast (docs/moderation.md). One flow for PostCard, PostViewer, CommentSheet and profiles.
 */
import { reportContent, type ReportKind } from '@/api/moderation';
import { showNativeMenu } from '@/lib/nativeMenu';
import { REPORT_REASONS, reportToast } from '@/lib/reports';
import { posthog } from '@/lib/posthog';
import { Sentry } from '@/lib/sentry';
import { useToastStore } from '@/store/toastStore';

const TITLES: Record<ReportKind, string> = {
  post: 'Report this post?',
  comment: 'Report this comment?',
  user: 'Report this person?',
};

export function startReport(kind: ReportKind, id: string, title?: string, onDone?: () => void) {
  showNativeMenu({
    title: title ?? TITLES[kind],
    message: 'Why are you reporting it?',
    actions: REPORT_REASONS.map((r) => ({
      text: r.label,
      run: async () => {
        const result = await reportContent(kind, id, r.code);
        if (result.error) {
          Sentry.captureMessage(result.error.message, {
            level: 'warning',
            tags: { flow: 'moderation', step: 'report' },
            extra: { kind, id, reason: r.code },
          });
        } else {
          posthog.capture('content_reported', {
            kind,
            reason: r.code,
            repeat: !!result.data?.already_reported,
          });
        }
        useToastStore.getState().show(reportToast(result));
        onDone?.();
      },
    })),
  });
}
