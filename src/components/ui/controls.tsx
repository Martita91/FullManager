import type React from "react";
import { cn } from "@/lib/utils";

/**
 * A deliberately small kit. Phase 1 is forms and tables, and every screen wants
 * the same five things — so they live here once rather than as copied class
 * strings across a dozen route files.
 */

export function Button({
  variant = "primary",
  // HTML defaults a button to `submit`, so any button dropped inside a form
  // submits it — usually while doing something unrelated, like removing a row.
  // Submitting has to be asked for here, not inherited.
  type = "button",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "border border-input bg-transparent hover:bg-accent",
    ghost: "bg-transparent hover:bg-accent",
    danger: "bg-destructive text-destructive-foreground hover:opacity-90",
  }[variant];

  return (
    <button
      type={type}
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
        styles,
        className,
      )}
    />
  );
}

const fieldStyles =
  "border-input w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldStyles, className)} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(fieldStyles, className)} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldStyles, "min-h-20", className)} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="text-muted-foreground mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("border-border rounded-xl border p-5", className)} />;
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="border-border rounded-xl border border-dashed p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="text-muted-foreground mt-1 text-sm">{body}</p>}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="text-destructive text-sm">{children}</p>;
}

/** Wide tables must scroll inside their own box, never the page. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "label-caps text-muted-foreground border-border border-b px-4 py-2.5 text-left text-[0.68rem]",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-border border-b px-4 py-2.5", className)}>{children}</td>;
}
