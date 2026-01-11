"use client";

import type { Comment } from "@/lib/firestore";
import { formatDateTime } from "@/lib/format";

type CommentListProps = {
  comments: Comment[];
  onDelete: (commentId: string) => void;
};

export default function CommentList({ comments, onDelete }: CommentListProps) {
  if (comments.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
        まだコメントがありません。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div
          key={comment.id}
          className="rounded-2xl bg-white p-4 shadow-cardSoft"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm text-slate-900">{comment.text}</p>
              <div className="text-xs text-slate-500">
                {comment.authorName ? `${comment.authorName} ・ ` : ""}
                {formatDateTime(comment.createdAt)}
              </div>
            </div>
            <button
              type="button"
              aria-label="コメントを削除"
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              onClick={() => {
                const ok = window.confirm("このコメントを削除しますか？");
                if (ok) {
                  onDelete(comment.id);
                }
              }}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 9v9.75m4.5-9v9.75M4.5 6.75h15m-13.5 0 1.2-2.1a1.5 1.5 0 0 1 1.3-.75h5.4a1.5 1.5 0 0 1 1.3.75l1.2 2.1m-12.9 0h12.9"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
