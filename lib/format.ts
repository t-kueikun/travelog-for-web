import type { Timestamp } from "firebase/firestore";

export function formatYen(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(value);
}

function toDate(value?: Timestamp | Date | string | null) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if ("toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

export function formatDateTime(value?: Timestamp | Date | string | null) {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatDate(value?: Timestamp | Date | string | null) {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium"
  }).format(date);
}
