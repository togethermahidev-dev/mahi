import { useEffect, useState } from 'react';
import { useSocialStore } from '@/store';
import type { CommentLiker } from '@/api';

export type CommentLikersState =
  { status: 'loading' } | { status: 'ready'; likers: CommentLiker[] } | { status: 'error' };

/**
 * Who liked a comment (flag comment-likes). Live server data: every opening shows a loading state,
 * then the fresh list. Nothing is kept on the device or between openings.
 */
export function useCommentLikers(commentId: string | null): CommentLikersState {
  const [state, setState] = useState<{ id: string | null; value: CommentLikersState }>({
    id: null,
    value: { status: 'loading' },
  });

  useEffect(() => {
    if (!commentId) return;
    let live = true;
    useSocialStore
      .getState()
      .getCommentLikers(commentId)
      .then(({ data, error }) => {
        if (!live) return;
        setState({
          id: commentId,
          value: error || !data ? { status: 'error' } : { status: 'ready', likers: data },
        });
      });
    return () => {
      live = false;
    };
  }, [commentId]);

  // A different comment (or a new opening) never shows the last list while it loads.
  return state.id === commentId ? state.value : { status: 'loading' };
}
