"use client";

import { useState } from "react";

type CommentFormProps = {
  onSubmit: (text: string) => Promise<void> | void;
  disabled?: boolean;
};

export default function CommentForm({ onSubmit, disabled }: CommentFormProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="rounded-2xl bg-white p-4 shadow-cardSoft"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || submitting || disabled) {
          return;
        }
        setSubmitting(true);
        try {
          await onSubmit(trimmed);
          setText("");
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="コメントを入力"
        rows={3}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      />
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={submitting || disabled}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          投稿
        </button>
      </div>
    </form>
  );
}
