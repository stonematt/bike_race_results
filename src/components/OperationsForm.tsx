'use client';
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';

export type OperationState = { error?: string; message?: string; href?: string };
export type OperationAction = (state: OperationState, data: FormData) => Promise<OperationState>;

/** Keeps failed form values in place and announces the result beside its action. */
export function OperationsForm({
  children,
  action,
  submitLabel,
}: {
  children: ReactNode;
  action: OperationAction;
  submitLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);
  return (
    <form
      action={submit}
      aria-busy={pending}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
    >
      {children}
      {state.error ? (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="border-danger border-l pl-3 text-sm font-bold"
        >
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm font-semibold">
          {state.message}
          {state.href ? (
            <>
              {' '}
              <Link href={state.href} className="underline underline-offset-4">
                Open squad
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-navy hover:bg-fg cursor-pointer rounded px-4 py-2 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

export function OperationNotice({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [message]);
  return (
    <p
      ref={ref}
      role="status"
      tabIndex={-1}
      className="border-navy mt-5 border-l pl-3 text-sm font-semibold"
    >
      {message}
    </p>
  );
}
