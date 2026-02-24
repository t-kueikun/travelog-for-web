"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { User } from "firebase/auth";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import PageShell from "@/components/PageShell";
import { format } from "date-fns";
import CommentForm from "@/components/CommentForm";
import CommentList from "@/components/CommentList";
import {
  deleteComment,
  getPlanById,
  getPlanByPath,
  postComment,
  subscribeComments,
  updatePlan,
  type Comment,
  type PlanUpdate,
  type TravelPlan
} from "@/lib/firestore";
import { formatDate, formatDateTime, formatYen } from "@/lib/format";

function getPlanProgress(plan: TravelPlan) {
  if (typeof plan.totalCost !== "number") {
    return null;
  }
  const savedAmount =
    Array.isArray(plan.savingsHistory)
      ? sumSavingsHistory(plan.savingsHistory)
      : typeof plan.savedAmount === "number"
        ? plan.savedAmount
        : typeof plan.amount === "number"
          ? plan.amount
          : 0;
  const remaining = Math.max(0, plan.totalCost - savedAmount);
  const percent =
    plan.totalCost > 0
      ? Math.min(100, Math.round((savedAmount / plan.totalCost) * 100))
      : 0;
  return { remaining, percent };
}

type ItemRecord = Record<string, unknown>;

type FieldDraft = {
  key: string;
  value: string;
  original: string;
};

type NumberDraft = {
  key: string;
  value: string;
  original: string;
};

type BooleanDraft = {
  key: string;
  value: boolean | null;
  original: boolean | null;
};

type TransferDraft = {
  raw: ItemRecord;
  id: string;
  station: FieldDraft;
  depTime: FieldDraft;
  arrTime: FieldDraft;
};

type TransportationDraft = {
  raw: ItemRecord;
  id: string;
  mode: FieldDraft;
  name: FieldDraft;
  serviceName: FieldDraft;
  seatNumber: FieldDraft;
  from: FieldDraft;
  to: FieldDraft;
  depTime: FieldDraft;
  arrTime: FieldDraft;
  price: NumberDraft;
  paid: BooleanDraft;
  notes: FieldDraft;
  transfers: TransferDraft[];
};

type HotelDraft = {
  raw: ItemRecord;
  name: FieldDraft;
  price: NumberDraft;
  checkIn: FieldDraft;
  checkOut: FieldDraft;
  notes: FieldDraft;
  link: FieldDraft;
};

type ActivityDraft = {
  raw: ItemRecord;
  title: FieldDraft;
  date: FieldDraft;
  notes: FieldDraft;
  link: FieldDraft;
};

type PackingDraft = {
  raw: Record<string, unknown> | string;
  isString: boolean;
  name: FieldDraft;
  checked: BooleanDraft;
};

type SavingsDraft = {
  raw: number | { amount?: number };
  value: string;
  original: string;
  isObject: boolean;
};

const TRANSPORT_NAME_KEYS = ["name", "title", "type"];
const TRANSPORT_MODE_KEYS = ["type", "category", "kind", "mode"];
const TRANSPORT_MODES = ["新幹線", "飛行機", "車", "船", "バス", "特急", "在来線"];
const TRANSPORT_MODE_CONFIG: Record<
  string,
  {
    serviceLabel?: string;
    serviceKeys?: string[];
    seatLabel?: string;
    seatKeys?: string[];
    icon: ReactNode;
  }
> = {
  新幹線: {
    serviceLabel: "列車名",
    serviceKeys: ["trainName", "lineName", "serviceName"],
    seatLabel: "座席番号",
    seatKeys: ["seatNumber", "seat", "seatNo"],
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ) // Placeholder, replacing with specific icons below
  },
  特急: {
    serviceLabel: "列車名",
    serviceKeys: ["trainName", "lineName", "serviceName"],
    seatLabel: "座席番号",
    seatKeys: ["seatNumber", "seat", "seatNo"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  },
  在来線: {
    serviceLabel: "列車名",
    serviceKeys: ["trainName", "lineName", "serviceName"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    )
  },
  飛行機: {
    serviceLabel: "便番号",
    serviceKeys: ["flightNumber", "flightNo", "serviceName"],
    seatLabel: "座席番号",
    seatKeys: ["seatNumber", "seat", "seatNo"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    )
  },
  バス: {
    serviceLabel: "便名",
    serviceKeys: ["busName", "serviceName"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    )
  },
  船: {
    serviceLabel: "便名",
    serviceKeys: ["shipName", "ferryName", "serviceName"],
    seatLabel: "座席/部屋",
    seatKeys: ["seatNumber", "cabin", "room"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </svg>
    )
  },
  車: {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    )
  }
};

// Update icons with proper paths
TRANSPORT_MODE_CONFIG["新幹線"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m 4,14 c 1,-4 3,-5 6,-5 1,0 2,0 2,2 l 1,2 h 6 c 2,1 3,2 3,4 v 4 H 6 V 19 l -2,-2 z M 4,17 h 4" /><circle cx="8" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /><path d="M 6.5,14 H 14" /></svg>
);
TRANSPORT_MODE_CONFIG["特急"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="16" rx="2" /><path d="M4 11h16M12 3v8m4-8v8m-8-8v8M8 19v3M16 19v3" /><path d="m 9,7 6,0" /></svg>
);
TRANSPORT_MODE_CONFIG["在来線"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="16" rx="2" /><path d="M4 11h16M12 3v8m4-8v8m-8-8v8M8 19v3M16 19v3" /></svg>
);
TRANSPORT_MODE_CONFIG["飛行機"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20M2 12l5-5m-5 5l5 5" style={{ display: 'none' }} /><path d="M21 14l-4 4H5l6-9H8L3 14v4l9-3 9-4z" style={{ display: 'none' }} /><path d="M2 12h20" style={{ display: 'none' }} /><path d="M20 12v3l-7-4-6 4 1-5-3-3h11l4 5z" /></svg>
);
TRANSPORT_MODE_CONFIG["バス"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="15" rx="2" /><path d="M5 18v3" /><path d="M19 18v3" /><path d="M3 11h18" /><path d="M3 15h18" /></svg>
);
TRANSPORT_MODE_CONFIG["船"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 21h20M22 21v-2c0-.6-.4-1.2-1-1.2h-1c-1.7 0-3.3-1.4-3.3-3.1V6a2 2 0 0 0-2-2H9.3a2 2 0 0 0-2 2v8.7c0 1.7-1.6 3.1-3.3 3.1H3c-.6 0-1 .6-1 1.2v2" /><path d="M9 10h6M12 6v10" /></svg>
);
TRANSPORT_MODE_CONFIG["車"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>
);
const TRANSPORT_FROM_KEYS = [
  "from",
  "departure",
  "origin",
  "start",
  "startPlace",
  "startLocation",
  "fromPlace",
  "departurePlace",
  "departPlace",
  "originPlace",
  "fromLocation",
  "departureLocation",
  "fromCity",
  "originCity",
  "fromAirport",
  "fromStation"
];
const TRANSPORT_FROM_PATTERNS = ["departure", "depart", "origin", "start", "from"];
const TRANSPORT_TO_KEYS = [
  "to",
  "arrival",
  "destination",
  "end",
  "endPlace",
  "endLocation",
  "toPlace",
  "arrivalPlace",
  "arrivePlace",
  "destinationPlace",
  "toLocation",
  "arrivalLocation",
  "toCity",
  "destinationCity",
  "toAirport",
  "toStation"
];
const TRANSPORT_TO_PATTERNS = ["arrival", "arrive", "destination", "dest", "end"];
const TRANSPORT_PRICE_KEYS = ["price", "amount", "cost", "fee", "fare", "total"];
const TRANSPORT_PAID_KEYS = [
  "isPaid",
  "paid",
  "isPaymentDone",
  "paymentDone",
  "isSettled"
];
const TRANSPORT_DEP_KEYS = [
  "departureTime",
  "depTime",
  "startTime",
  "departAt",
  "departureDate",
  "departDate"
];
const TRANSPORT_ARR_KEYS = [
  "arrivalTime",
  "arrTime",
  "endTime",
  "arriveAt",
  "arrivalDate",
  "arriveDate"
];
const TRANSFER_STATION_KEYS = ["station", "name", "title"];
const TRANSFER_DEP_KEYS = ["departureTime", "depTime", "departAt"];
const TRANSFER_ARR_KEYS = ["arrivalTime", "arrTime", "arriveAt"];

const HOTEL_NAME_KEYS = ["name", "title"];
const HOTEL_PRICE_KEYS = ["price", "amount", "cost", "fee", "total"];
const HOTEL_CHECKIN_KEYS = ["checkIn", "checkInDate", "startDate"];
const HOTEL_CHECKOUT_KEYS = ["checkOut", "checkOutDate", "endDate"];

const ACTIVITY_TITLE_KEYS = ["name", "title", "activity"];
const ACTIVITY_DATE_KEYS = ["date", "startDate", "time"];
const ACTIVITY_COST_KEYS = ["price", "amount", "cost", "fee", "fare", "total"];

const PACKING_NAME_KEYS = ["name", "title", "item"];
const PACKING_CHECK_KEYS = ["checked", "isChecked", "done", "packed"];

const NOTES_KEYS = ["notes", "memo", "detail"];
const LINK_KEYS = [
  "url",
  "link",
  "bookingUrl",
  "bookingLink",
  "reservationUrl",
  "reservationLink",
  "website",
  "ticketUrl",
  "ticketLink"
];

function sumSavingsHistory(items: Array<number | { amount?: number }>): number {
  return items.reduce<number>((sum, entry) => {
    if (typeof entry === "number") {
      return sum + entry;
    }
    if (entry && typeof entry === "object" && "amount" in entry) {
      const value = (entry as { amount?: number }).amount;
      return sum + (typeof value === "number" ? value : 0);
    }
    return sum;
  }, 0);
}

function formatSavingsEntry(entry: number | { amount?: number }) {
  if (typeof entry === "number") {
    return formatYen(entry);
  }
  if (entry && typeof entry === "object" && "amount" in entry) {
    const value = (entry as { amount?: number }).amount;
    return typeof value === "number" ? formatYen(value) : "—";
  }
  return "—";
}

function getStringField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function getLocationField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (value && typeof value === "object") {
      const record = value as ItemRecord;
      const nested = getStringField(record, [
        "name",
        "title",
        "label",
        "address",
        "city",
        "airport",
        "station",
        "place"
      ]);
      if (nested) {
        return nested;
      }
    }
  }

  return "";
}

function findLocationByPattern(item: ItemRecord, patterns: string[]) {
  const entries = Object.entries(item);
  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (!patterns.some((pattern) => lower.includes(pattern))) {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (value && typeof value === "object") {
      const nested = getStringField(value as ItemRecord, [
        "name",
        "title",
        "label",
        "address",
        "city",
        "airport",
        "station",
        "place"
      ]);
      if (nested) {
        return nested;
      }
    }
  }

  return "";
}

function getNumberField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function getBooleanField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
    }
  }
  return null;
}

function getDateField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value) {
      return value as Date | string;
    }
  }
  return null;
}

function formatShortDateTime(value?: Date | string | null) {
  if (!value) {
    return "";
  }
  const text = formatDateTime(value);
  return text || "";
}

function formatFlightDateTime(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function extractDateOnly(value?: string) {
  if (!value) {
    return "";
  }
  const match = value.match(/\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
  if (!match) {
    return "";
  }
  const [, yyyy, mm, dd] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function extractTimeOnly(value?: string) {
  if (!value) {
    return "";
  }
  const match = value.match(/\b(\d{1,2}):(\d{1,2})(?::\d{2})?\b/);
  if (!match) {
    return "";
  }
  const [, hh, mm] = match;
  return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
}

function buildDateTimeValue(datePart: string, timePart: string) {
  const date = datePart.trim();
  const time = timePart.trim();
  if (date && time) {
    return `${date} ${time}`;
  }
  if (date) {
    return date;
  }
  if (time) {
    return time;
  }
  return "";
}

function updateDateTimeValue(
  currentValue: string,
  nextDate?: string,
  nextTime?: string
) {
  const date =
    nextDate !== undefined ? nextDate : extractDateOnly(currentValue);
  const time =
    nextTime !== undefined ? nextTime : extractTimeOnly(currentValue);
  return buildDateTimeValue(date, time);
}

function parseDateTimeForSort(value: string) {
  if (!value) {
    return null;
  }
  const date = extractDateOnly(value);
  if (!date) {
    return null;
  }
  const time = extractTimeOnly(value) || "00:00";
  const ms = Date.parse(`${date}T${time}:00`);
  return Number.isNaN(ms) ? null : ms;
}

function getTransportSortTime(draft: TransportationDraft) {
  return (
    parseDateTimeForSort(draft.depTime.value) ??
    parseDateTimeForSort(draft.arrTime.value)
  );
}

function getTransferSortTime(draft: TransferDraft) {
  return (
    parseDateTimeForSort(draft.arrTime.value) ??
    parseDateTimeForSort(draft.depTime.value)
  );
}

function sortTransferDrafts(drafts: TransferDraft[]) {
  const sorted = drafts
    .map((draft, index) => ({
      draft,
      index,
      time: getTransferSortTime(draft)
    }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) {
        return a.index - b.index;
      }
      if (a.time === null) {
        return 1;
      }
      if (b.time === null) {
        return -1;
      }
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.draft);

  return sorted;
}

function sortTransportationDrafts(drafts: TransportationDraft[]) {
  const sorted = drafts
    .map((draft, index) => {
      const sortedTransfers = sortTransferDrafts(draft.transfers);
      return {
        // Only recreate if transfers changed
        draft: sortedTransfers === draft.transfers
          ? draft
          : { ...draft, transfers: sortedTransfers },
        index,
        time: getTransportSortTime(draft)
      };
    })
    .sort((a, b) => {
      if (a.time === null && b.time === null) {
        return a.index - b.index;
      }
      if (a.time === null) {
        return 1;
      }
      if (b.time === null) {
        return -1;
      }
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.draft);

  // Deep comparison to avoid unnecessary re-renders if order/content logically didn't change
  // Note: Since we might have recreated draft objects above, we check IDs first for speed
  const isIdOrderChanged = sorted.some((d, i) => d.id !== drafts[i].id);

  if (!isIdOrderChanged) {
    // If IDs are same order, check if any content actually changed (referential equality of inner objects)
    const hasContentChange = sorted.some((d, i) => d !== drafts[i]);
    if (!hasContentChange) {
      return drafts;
    }
  }

  return sorted;
}

function getTransportItemSortTime(item: ItemRecord) {
  const depValue = buildDateDraft(item, TRANSPORT_DEP_KEYS).value;
  const arrValue = buildDateDraft(item, TRANSPORT_ARR_KEYS).value;
  return parseDateTimeForSort(depValue) ?? parseDateTimeForSort(arrValue);
}

function sortTransportItems(items: ItemRecord[]) {
  return items
    .map((item, index) => ({
      item,
      index,
      time: getTransportItemSortTime(item)
    }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) {
        return a.index - b.index;
      }
      if (a.time === null) {
        return 1;
      }
      if (b.time === null) {
        return -1;
      }
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function useFlipAnimation(ids: string[]) {
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const positionsRef = useRef(new Map<string, DOMRect>());
  const lastOrderKeyRef = useRef<string | null>(null);
  const idsKey = ids.join("|");

  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();
    ids.forEach((id) => {
      const node = nodesRef.current.get(id);
      if (node) {
        nextPositions.set(id, node.getBoundingClientRect());
      }
    });
    const shouldAnimate =
      lastOrderKeyRef.current !== null && lastOrderKeyRef.current !== idsKey;
    if (shouldAnimate) {
      ids.forEach((id) => {
        const node = nodesRef.current.get(id);
        const prev = positionsRef.current.get(id);
        const next = nextPositions.get(id);
        if (!node || !prev || !next) {
          return;
        }
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (dx !== 0 || dy !== 0) {
          node.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "translate(0, 0)" }
            ],
            { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }
          );
        }
      });
    }
    positionsRef.current = nextPositions;
    lastOrderKeyRef.current = idsKey;
  }, [idsKey]);

  return (id: string) => (node: HTMLElement | null) => {
    if (node) {
      nodesRef.current.set(id, node);
    } else {
      nodesRef.current.delete(id);
    }
  };
}

const AIRPORT_NAME_JA: Record<string, string> = {
  HND: "羽田空港",
  NRT: "成田国際空港",
  KIX: "関西国際空港",
  ITM: "大阪国際空港",
  NGO: "中部国際空港",
  CTS: "新千歳空港",
  FUK: "福岡空港",
  OKA: "那覇空港",
  SDJ: "仙台空港",
  HIJ: "広島空港",
  KOJ: "鹿児島空港",
  KMJ: "熊本空港",
  KMI: "宮崎空港",
  OIT: "大分空港",
  NGS: "長崎空港",
  HSG: "佐賀空港",
  KKJ: "北九州空港",
  UBJ: "山口宇部空港",
  KMQ: "小松空港",
  KIJ: "新潟空港",
  OKJ: "岡山空港",
  TKS: "徳島空港",
  TAK: "高松空港",
  MYJ: "松山空港",
  KCZ: "高知空港",
  AOJ: "青森空港",
  AXT: "秋田空港",
  HNA: "花巻空港",
  MMB: "女満別空港",
  OBO: "帯広空港",
  KUH: "釧路空港",
  WKJ: "稚内空港",
  OKD: "札幌丘珠空港",
  HKD: "函館空港",
  UKB: "神戸空港",
  ISG: "石垣空港",
  MMY: "宮古空港",
  ASJ: "奄美空港",
  TKN: "徳之島空港",
  UEO: "久米島空港",
  OGN: "与那国空港",
  RNJ: "与論空港",
  RIS: "利尻空港",
  FUJ: "福江空港",
  TSJ: "対馬空港",
  IKI: "壱岐空港",
  ICN: "仁川国際空港",
  GMP: "金浦国際空港",
  PEK: "北京首都国際空港",
  PKX: "北京大興国際空港",
  PVG: "上海浦東国際空港",
  SHA: "上海虹橋国際空港",
  HKG: "香港国際空港",
  TPE: "台湾桃園国際空港",
  TSA: "台北松山空港",
  SIN: "シンガポール・チャンギ空港",
  BKK: "スワンナプーム国際空港",
  DMK: "ドンムアン空港",
  KUL: "クアラルンプール国際空港",
  CGK: "スカルノ・ハッタ国際空港",
  MNL: "ニノイ・アキノ国際空港",
  HAN: "ノイバイ国際空港",
  SGN: "タンソンニャット国際空港",
  DPS: "ングラ・ライ国際空港",
  DEL: "インディラ・ガンディー国際空港",
  BOM: "チャトラパティ・シヴァージー国際空港",
  BLR: "ケンペゴウダ国際空港",
  HYD: "ラジーヴ・ガンディー国際空港",
  DXB: "ドバイ国際空港",
  AUH: "アブダビ国際空港",
  DOH: "ハマド国際空港",
  JED: "キング・アブドゥルアズィーズ国際空港",
  RUH: "キング・ハーリド国際空港",
  LHR: "ロンドン・ヒースロー空港",
  LGW: "ロンドン・ガトウィック空港",
  CDG: "パリ＝シャルル・ド・ゴール空港",
  ORY: "パリ＝オルリー空港",
  AMS: "アムステルダム・スキポール空港",
  FRA: "フランクフルト空港",
  MUC: "ミュンヘン空港",
  ZRH: "チューリッヒ空港",
  VIE: "ウィーン国際空港",
  MAD: "マドリード＝バラハス空港",
  BCN: "バルセロナ＝エル・プラット空港",
  FCO: "ローマ・フィウミチーノ空港",
  MXP: "ミラノ・マルペンサ空港",
  DUB: "ダブリン空港",
  ARN: "ストックホルム・アーランダ空港",
  CPH: "コペンハーゲン空港",
  OSL: "オスロ・ガーデモエン空港",
  HEL: "ヘルシンキ・ヴァンター空港",
  IST: "イスタンブール空港",
  SAW: "サビハ・ギョクチェン国際空港",
  YYZ: "トロント・ピアソン国際空港",
  YVR: "バンクーバー国際空港",
  YUL: "モントリオール・トルドー国際空港",
  JFK: "ジョン・F・ケネディ国際空港",
  EWR: "ニューアーク・リバティ国際空港",
  LGA: "ラガーディア空港",
  ORD: "シカゴ・オヘア国際空港",
  ATL: "ハーツフィールド・ジャクソン・アトランタ国際空港",
  DFW: "ダラス・フォートワース国際空港",
  DEN: "デンバー国際空港",
  SEA: "シアトル・タコマ国際空港",
  SFO: "サンフランシスコ国際空港",
  LAX: "ロサンゼルス国際空港",
  LAS: "ハリー・リード国際空港",
  PHX: "フェニックス・スカイハーバー国際空港",
  MIA: "マイアミ国際空港",
  IAD: "ワシントン・ダレス国際空港",
  IAH: "ジョージ・ブッシュ・インターコンチネンタル空港",
  BOS: "ローガン国際空港",
  SYD: "シドニー国際空港",
  MEL: "メルボルン空港",
  BNE: "ブリスベン空港",
  AKL: "オークランド国際空港"
};

const CITY_TO_AIRPORT_JA: Record<string, { code: string; name: string }> = {
  Tokyo: { code: "HND", name: "羽田空港" },
  "東京": { code: "HND", name: "羽田空港" },
  Osaka: { code: "KIX", name: "関西国際空港" },
  "大阪": { code: "KIX", name: "関西国際空港" },
  Sapporo: { code: "CTS", name: "新千歳空港" },
  "札幌": { code: "CTS", name: "新千歳空港" },
  Seoul: { code: "ICN", name: "仁川国際空港" },
  Incheon: { code: "ICN", name: "仁川国際空港" },
  "ソウル": { code: "ICN", name: "仁川国際空港" },
  "仁川": { code: "ICN", name: "仁川国際空港" },
  London: { code: "LHR", name: "ロンドン・ヒースロー空港" },
  Paris: { code: "CDG", name: "パリ＝シャルル・ド・ゴール空港" },
  Amsterdam: { code: "AMS", name: "アムステルダム・スキポール空港" },
  Frankfurt: { code: "FRA", name: "フランクフルト空港" },
  Munich: { code: "MUC", name: "ミュンヘン空港" },
  Zurich: { code: "ZRH", name: "チューリッヒ空港" },
  Vienna: { code: "VIE", name: "ウィーン国際空港" },
  Madrid: { code: "MAD", name: "マドリード＝バラハス空港" },
  Barcelona: { code: "BCN", name: "バルセロナ＝エル・プラット空港" },
  Rome: { code: "FCO", name: "ローマ・フィウミチーノ空港" },
  Milan: { code: "MXP", name: "ミラノ・マルペンサ空港" },
  Dublin: { code: "DUB", name: "ダブリン空港" },
  Stockholm: { code: "ARN", name: "ストックホルム・アーランダ空港" },
  Copenhagen: { code: "CPH", name: "コペンハーゲン空港" },
  Oslo: { code: "OSL", name: "オスロ・ガーデモエン空港" },
  Helsinki: { code: "HEL", name: "ヘルシンキ・ヴァンター空港" },
  Istanbul: { code: "IST", name: "イスタンブール空港" },
  Toronto: { code: "YYZ", name: "トロント・ピアソン国際空港" },
  Vancouver: { code: "YVR", name: "バンクーバー国際空港" },
  Montreal: { code: "YUL", name: "モントリオール・トルドー国際空港" },
  "New York": { code: "JFK", name: "ジョン・F・ケネディ国際空港" },
  "Los Angeles": { code: "LAX", name: "ロサンゼルス国際空港" },
  "San Francisco": { code: "SFO", name: "サンフランシスコ国際空港" },
  "Seattle": { code: "SEA", name: "シアトル・タコマ国際空港" },
  Chicago: { code: "ORD", name: "シカゴ・オヘア国際空港" },
  Atlanta: { code: "ATL", name: "ハーツフィールド・ジャクソン・アトランタ国際空港" },
  Dallas: { code: "DFW", name: "ダラス・フォートワース国際空港" },
  Denver: { code: "DEN", name: "デンバー国際空港" },
  Miami: { code: "MIA", name: "マイアミ国際空港" },
  Washington: { code: "IAD", name: "ワシントン・ダレス国際空港" },
  Boston: { code: "BOS", name: "ローガン国際空港" },
  Sydney: { code: "SYD", name: "シドニー国際空港" },
  Melbourne: { code: "MEL", name: "メルボルン空港" },
  Brisbane: { code: "BNE", name: "ブリスベン空港" },
  Auckland: { code: "AKL", name: "オークランド国際空港" },
  Beijing: { code: "PEK", name: "北京首都国際空港" },
  Shanghai: { code: "PVG", name: "上海浦東国際空港" },
  "Hong Kong": { code: "HKG", name: "香港国際空港" },
  Taipei: { code: "TPE", name: "台湾桃園国際空港" },
  Singapore: { code: "SIN", name: "シンガポール・チャンギ空港" },
  Bangkok: { code: "BKK", name: "スワンナプーム国際空港" },
  Manila: { code: "MNL", name: "ニノイ・アキノ国際空港" },
  Delhi: { code: "DEL", name: "インディラ・ガンディー国際空港" },
  Mumbai: { code: "BOM", name: "チャトラパティ・シヴァージー国際空港" },
  Dubai: { code: "DXB", name: "ドバイ国際空港" },
  Doha: { code: "DOH", name: "ハマド国際空港" }
};

const CITY_CODE_TO_AIRPORT: Record<string, { code: string; name: string }> = {
  TYO: { code: "HND", name: "羽田空港" },
  OSA: { code: "KIX", name: "関西国際空港" },
  NYC: { code: "JFK", name: "ジョン・F・ケネディ国際空港" },
  LON: { code: "LHR", name: "ロンドン・ヒースロー空港" },
  PAR: { code: "CDG", name: "パリ＝シャルル・ド・ゴール空港" }
};

function pickFirstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function extractIataFromText(text: string) {
  const match = text.match(/\b([A-Z0-9]{3})\b/);
  return match ? match[1].toUpperCase() : "";
}

function resolveCityAirport(name: string, code: string) {
  if (name) {
    const mapped = CITY_TO_AIRPORT_JA[name] ?? CITY_TO_AIRPORT_JA[name.trim()];
    if (mapped) {
      return mapped;
    }
  }
  if (code) {
    const mapped = CITY_CODE_TO_AIRPORT[code];
    if (mapped) {
      return mapped;
    }
  }
  return null;
}

function normalizeAirport(value: unknown) {
  if (!value) {
    return "";
  }
  let name = "";
  let code = "";
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return "";
    }
    code = extractIataFromText(text);
    if (!code || text.toUpperCase() !== code) {
      name = text;
    }
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const airport =
      record.airport && typeof record.airport === "object"
        ? (record.airport as Record<string, unknown>)
        : null;
    name = pickFirstString([
      airport?.name,
      airport?.airportName,
      record.name,
      record.airportName,
      record.fullName,
      record.shortName,
      record.municipalityName,
      record.city,
      record.locationName,
      record.airport
    ]);
    code = pickFirstString([
      airport?.iata,
      airport?.iataCode,
      airport?.code,
      record.iata,
      record.iataCode,
      record.code,
      airport?.icao,
      record.icao,
      record.airportCode,
      record.airportIata,
      record.airportIataCode,
      record.airportIcao
    ]).toUpperCase();
  }
  if (!code && name) {
    code = extractIataFromText(name);
  }
  if (!code && !name) {
    return "";
  }
  const isCityCode = Boolean(code && CITY_CODE_TO_AIRPORT[code]);
  // Prefer explicit airport code (e.g. ITM) over city-name mapping (e.g. Osaka -> KIX).
  const cityMapped = isCityCode || !code ? resolveCityAirport(name, code) : null;
  const jpName = code ? AIRPORT_NAME_JA[code] : "";
  const displayName = jpName || cityMapped?.name || name;
  const displayCode = code || cityMapped?.code || "";
  if (displayName && displayCode) {
    return `${displayName} (${displayCode})`;
  }
  if (displayName) {
    return displayName;
  }
  return displayCode;
}

function normalizeTime(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct = pickFirstString([
      record.local,
      record.localTime,
      record.scheduledTimeLocal,
      record.scheduledTime,
      record.scheduledTimeUtc,
      record.utc,
      record.time,
      record.timeLocal,
      record.timeUtc,
      record.dateTime,
      record.dateTimeLocal,
      record.dateTimeUtc
    ]);
    if (direct) {
      return direct;
    }
    const nested =
      normalizeTime(record.local) ||
      normalizeTime(record.utc) ||
      normalizeTime(record.scheduledTimeLocal) ||
      normalizeTime(record.scheduledTimeUtc) ||
      normalizeTime(record.time);
    if (nested) {
      return nested;
    }
  }
  return "";
}

function pickTime(values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeTime(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function extractFlightInfo(payload: unknown) {
  const data = payload as Record<string, unknown>;
  const raw = Array.isArray(data?.data)
    ? data.data[0]
    : ((data?.data as Record<string, unknown>)?.flights as any[])?.[0] ??
    (data?.data as Record<string, unknown>) ??
    data;
  const record = raw as Record<string, unknown> | undefined;
  const departure = (record?.departure ??
    (record?.departures as Record<string, unknown>[] | undefined)?.[0] ??
    record?.departureAirport) as Record<string, unknown> | undefined;
  const arrival = (record?.arrival ??
    (record?.arrivals as Record<string, unknown>[] | undefined)?.[0] ??
    record?.arrivalAirport) as Record<string, unknown> | undefined;

  const departureAirport = normalizeAirport(departure);
  const arrivalAirport = normalizeAirport(arrival);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const depAny = departure as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arrAny = arrival as any;

  const departureTime =
    pickTime([
      departure?.scheduledTimeLocal,
      depAny?.scheduledTime?.local,
      depAny?.scheduledTime?.utc,
      departure?.scheduledTime,
      departure?.scheduledTimeUtc,
      departure?.time,
      record?.departureTime,
      record?.departureTimeUtc,
      record?.departureTimeLocal
    ]) || "";
  const arrivalTime =
    pickTime([
      arrival?.scheduledTimeLocal,
      arrAny?.scheduledTime?.local,
      arrAny?.scheduledTime?.utc,
      arrival?.scheduledTime,
      arrival?.scheduledTimeUtc,
      arrival?.time,
      record?.arrivalTime,
      record?.arrivalTimeUtc,
      record?.arrivalTimeLocal
    ]) || "";

  return {
    departureAirport,
    arrivalAirport,
    departureTime,
    arrivalTime
  };
}

function resolveKey(item: ItemRecord, keys: string[], patterns: string[] = []) {
  for (const key of keys) {
    if (key in item) {
      return key;
    }
  }
  if (patterns.length > 0) {
    const entries = Object.keys(item);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (patterns.some((pattern) => lower.includes(pattern))) {
        return entry;
      }
    }
  }
  return keys[0] ?? "";
}

function buildStringDraft(
  item: ItemRecord,
  keys: string[],
  patterns: string[] = []
) {
  const key = resolveKey(item, keys, patterns);
  const value = key ? getStringField(item, [key]) : "";
  return { key, value, original: value };
}

function buildModeDraft(item: ItemRecord) {
  const key = resolveKey(item, TRANSPORT_MODE_KEYS);
  const rawValue = key ? getStringField(item, [key]) : "";
  const value = TRANSPORT_MODES.includes(rawValue) ? rawValue : "新幹線";
  return { key: key || TRANSPORT_MODE_KEYS[0], value, original: value };
}

function getModeConfig(mode: string) {
  return TRANSPORT_MODE_CONFIG[mode] ?? TRANSPORT_MODE_CONFIG["新幹線"];
}

function buildLocationDraft(
  item: ItemRecord,
  keys: string[],
  patterns: string[] = []
) {
  const key = resolveKey(item, keys, patterns);
  let value = key ? getLocationField(item, [key]) : "";
  if (!value && patterns.length > 0) {
    value = findLocationByPattern(item, patterns);
  }
  return { key, value, original: value };
}

function createDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildTransferDrafts(items: ItemRecord[]) {
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const existingId = typeof item.id === "string" ? item.id : "";
    const id = existingId.trim() ? existingId : createDraftId();
    return {
      raw: item,
      id,
      station: buildStringDraft(item, TRANSFER_STATION_KEYS),
      depTime: buildDateDraft(item, TRANSFER_DEP_KEYS),
      arrTime: buildDateDraft(item, TRANSFER_ARR_KEYS)
    } satisfies TransferDraft;
  });
}

function buildDateDraft(item: ItemRecord, keys: string[], patterns: string[] = []) {
  const key = resolveKey(item, keys, patterns);
  let value = "";
  if (key) {
    value = formatShortDateTime(getDateField(item, [key]));
    if (!value) {
      value = getStringField(item, [key]);
    }
  }
  return { key, value, original: value };
}

function buildNumberDraft(
  item: ItemRecord,
  keys: string[],
  patterns: string[] = []
) {
  const key = resolveKey(item, keys, patterns);
  const value = key ? getNumberField(item, [key]) : null;
  const text = typeof value === "number" ? String(value) : "";
  return { key, value: text, original: text };
}

function buildBooleanDraft(
  item: ItemRecord,
  keys: string[],
  patterns: string[] = []
) {
  const key = resolveKey(item, keys, patterns);
  const value = key ? getBooleanField(item, [key]) : null;
  return { key, value, original: value };
}

function buildTransportationDrafts(items: ItemRecord[]) {
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const existingId = typeof item.id === "string" ? item.id : "";
    const id = existingId.trim() ? existingId : createDraftId();
    const mode = buildModeDraft(item);
    const config = getModeConfig(mode.value);
    const serviceKeys = config.serviceKeys ?? [];
    const seatKeys = config.seatKeys ?? [];
    const transfers = Array.isArray(item.transfers) ? item.transfers : [];
    return {
      raw: item,
      id,
      mode,
      name: buildStringDraft(item, TRANSPORT_NAME_KEYS),
      serviceName: serviceKeys.length
        ? buildStringDraft(item, serviceKeys)
        : { key: "", value: "", original: "" },
      seatNumber: seatKeys.length
        ? buildStringDraft(item, seatKeys)
        : { key: "", value: "", original: "" },
      from: buildLocationDraft(item, TRANSPORT_FROM_KEYS, TRANSPORT_FROM_PATTERNS),
      to: buildLocationDraft(item, TRANSPORT_TO_KEYS, TRANSPORT_TO_PATTERNS),
      depTime: buildDateDraft(item, TRANSPORT_DEP_KEYS),
      arrTime: buildDateDraft(item, TRANSPORT_ARR_KEYS),
      price: buildNumberDraft(item, TRANSPORT_PRICE_KEYS),
      paid: buildBooleanDraft(item, TRANSPORT_PAID_KEYS),
      notes: buildStringDraft(item, NOTES_KEYS),
      transfers: buildTransferDrafts(transfers as ItemRecord[])
    } satisfies TransportationDraft;
  });
}

function buildHotelDrafts(items: ItemRecord[]) {
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      raw: item,
      name: buildStringDraft(item, HOTEL_NAME_KEYS),
      price: buildNumberDraft(item, HOTEL_PRICE_KEYS),
      checkIn: buildDateDraft(item, HOTEL_CHECKIN_KEYS),
      checkOut: buildDateDraft(item, HOTEL_CHECKOUT_KEYS),
      notes: buildStringDraft(item, NOTES_KEYS),
      link: buildStringDraft(item, LINK_KEYS)
    } satisfies HotelDraft;
  });
}

function buildActivityDrafts(items: ItemRecord[]) {
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      raw: item,
      title: buildStringDraft(item, ACTIVITY_TITLE_KEYS),
      date: buildDateDraft(item, ACTIVITY_DATE_KEYS),
      notes: buildStringDraft(item, NOTES_KEYS),
      link: buildStringDraft(item, LINK_KEYS)
    } satisfies ActivityDraft;
  });
}

function buildPackingDrafts(items: Array<Record<string, unknown> | string>) {
  return items.map((raw) => {
    const isString = typeof raw === "string";
    const record = isString ? { name: raw } : raw;
    const item = record && typeof record === "object" ? record : {};
    return {
      raw,
      isString,
      name: buildStringDraft(item, PACKING_NAME_KEYS),
      checked: buildBooleanDraft(item, PACKING_CHECK_KEYS)
    } satisfies PackingDraft;
  });
}

function buildSavingsDrafts(items: Array<number | { amount?: number }>) {
  return items.map((raw) => {
    const isObject = typeof raw === "object" && raw !== null;
    const value =
      typeof raw === "number"
        ? raw
        : typeof (raw as { amount?: number }).amount === "number"
          ? (raw as { amount?: number }).amount
          : null;
    const text = typeof value === "number" ? String(value) : "";
    return {
      raw,
      value: text,
      original: text,
      isObject
    } satisfies SavingsDraft;
  });
}

function hasInvalidNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return Number.isNaN(Number(trimmed));
}

function toNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function applyStringDraft(item: ItemRecord, draft: FieldDraft) {
  if (!draft.key || draft.value === draft.original) {
    return;
  }
  item[draft.key] = draft.value.trim();
}

function applyNumberDraft(item: ItemRecord, draft: NumberDraft) {
  if (!draft.key || draft.value === draft.original) {
    return;
  }
  item[draft.key] = toNumberOrNull(draft.value);
}

function applyBooleanDraft(item: ItemRecord, draft: BooleanDraft) {
  if (!draft.key || draft.value === draft.original) {
    return;
  }
  item[draft.key] = draft.value;
}

function applyTransferDrafts(drafts: TransferDraft[]) {
  return drafts.map((draft) => {
    const nextItem: ItemRecord = { ...draft.raw, id: draft.id };
    applyStringDraft(nextItem, draft.station);
    applyStringDraft(nextItem, draft.depTime);
    applyStringDraft(nextItem, draft.arrTime);
    return nextItem;
  });
}

function applyTransportationDrafts(drafts: TransportationDraft[]) {
  return drafts.map((draft) => {
    const nextItem: ItemRecord = { ...draft.raw, id: draft.id };
    applyStringDraft(nextItem, draft.mode);
    applyStringDraft(nextItem, draft.name);
    applyStringDraft(nextItem, draft.serviceName);
    applyStringDraft(nextItem, draft.seatNumber);
    applyStringDraft(nextItem, draft.from);
    applyStringDraft(nextItem, draft.to);
    applyStringDraft(nextItem, draft.depTime);
    applyStringDraft(nextItem, draft.arrTime);
    applyNumberDraft(nextItem, draft.price);
    applyBooleanDraft(nextItem, draft.paid);
    applyStringDraft(nextItem, draft.notes);
    if (draft.mode.value === "在来線" || Array.isArray(draft.raw.transfers)) {
      nextItem.transfers = applyTransferDrafts(draft.transfers);
    }
    return nextItem;
  });
}

function applyHotelDrafts(drafts: HotelDraft[]) {
  return drafts.map((draft) => {
    const nextItem: ItemRecord = { ...draft.raw };
    applyStringDraft(nextItem, draft.name);
    applyNumberDraft(nextItem, draft.price);
    applyStringDraft(nextItem, draft.checkIn);
    applyStringDraft(nextItem, draft.checkOut);
    applyStringDraft(nextItem, draft.notes);
    applyStringDraft(nextItem, draft.link);
    return nextItem;
  });
}

function applyActivityDrafts(drafts: ActivityDraft[]) {
  return drafts.map((draft) => {
    const nextItem: ItemRecord = { ...draft.raw };
    applyStringDraft(nextItem, draft.title);
    applyStringDraft(nextItem, draft.date);
    applyStringDraft(nextItem, draft.notes);
    applyStringDraft(nextItem, draft.link);
    return nextItem;
  });
}

function applyPackingDrafts(drafts: PackingDraft[]) {
  return drafts.map((draft) => {
    if (draft.isString) {
      const nameChanged = draft.name.value !== draft.name.original;
      const hasChecked = draft.checked.value !== null;
      if (!hasChecked) {
        return nameChanged ? draft.name.value.trim() : draft.raw;
      }
      const checkedKey = draft.checked.key || "checked";
      const nameKey = draft.name.key || "name";
      return {
        [nameKey]: draft.name.value.trim(),
        [checkedKey]: draft.checked.value ?? false
      };
    }
    const nextItem: ItemRecord = { ...(draft.raw as Record<string, unknown>) };
    applyStringDraft(nextItem, draft.name);
    applyBooleanDraft(nextItem, draft.checked);
    return nextItem;
  });
}

function applySavingsDrafts(drafts: SavingsDraft[]) {
  return drafts.map((draft) => {
    if (draft.value === draft.original) {
      return draft.raw;
    }
    const parsed = toNumberOrNull(draft.value);
    if (draft.isObject) {
      return {
        ...(draft.raw as Record<string, unknown>),
        amount: parsed ?? undefined
      };
    }
    return parsed ?? 0;
  });
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="text-right text-base font-semibold text-slate-900">
        {value && value.length > 0 ? value : "—"}
      </span>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="text-sm font-semibold tracking-wide text-slate-500">
      {title}
    </h3>
  );
}

function resolvePlanParam(param: string) {
  if (!param) {
    return { planPath: null, planId: null };
  }
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    decoded = param;
  }

  if (decoded.includes("/")) {
    return { planPath: decoded, planId: null };
  }

  return { planPath: null, planId: decoded };
}

function toDateValue(value?: unknown) {
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
  if (typeof value === "object" && "toDate" in value) {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === "function") {
      return withToDate.toDate();
    }
  }
  return null;
}

function toDateInputValue(value?: unknown) {
  const date = toDateValue(value);
  if (!date) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeLink(raw: string) {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
}

function getLinkField(item: ItemRecord) {
  return getStringField(item, LINK_KEYS);
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, button, label"));
}

function SwipeDeleteCard({
  enabled,
  onDelete,
  children
}: {
  enabled: boolean;
  onDelete: () => void;
  children: ReactNode;
}) {
  const [translateX, setTranslateX] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteTimerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const swipingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || isDeleting || isInteractiveTarget(event.target)) {
      return;
    }
    draggingRef.current = true;
    swipingRef.current = false;
    startRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !enabled || isDeleting) {
      return;
    }
    const deltaX = event.clientX - startRef.current.x;
    const deltaY = event.clientY - startRef.current.y;
    if (!swipingRef.current) {
      if (Math.abs(deltaX) < 6) {
        return;
      }
      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        draggingRef.current = false;
        return;
      }
      swipingRef.current = true;
    }
    const nextTranslate = Math.max(-120, Math.min(0, deltaX));
    setTranslateX(nextTranslate);
  };

  const handlePointerEnd = () => {
    if (!draggingRef.current || isDeleting) {
      return;
    }
    draggingRef.current = false;
    if (translateX <= -80) {
      setIsDeleting(true);
      setTranslateX(0);
      if (deleteTimerRef.current) {
        window.clearTimeout(deleteTimerRef.current);
      }
      deleteTimerRef.current = window.setTimeout(() => {
        onDelete();
      }, 220);
      return;
    }
    setTranslateX(0);
  };

  const deleteOpacity =
    enabled && !isDeleting ? Math.min(1, Math.abs(translateX) / 80) : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${isDeleting ? "pointer-events-none animate-slide-out" : ""
        }`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl bg-rose-500"
        style={{ opacity: deleteOpacity }}
      />
      {enabled ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end pr-6 text-sm font-semibold text-white">
          削除
        </div>
      ) : null}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative z-10 transition-transform duration-200"
        style={{ transform: `translateX(${translateX}px)`, touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}

function PlanDetailContent({ user }: { user: User }) {
  const params = useParams();
  const planParam = typeof params?.id === "string" ? params.id : "";
  const { planPath, planId } = resolvePlanParam(planParam);
  const [plan, setPlan] = useState<TravelPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transportSortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const skipApplyRef = useRef(false);
  const [editValues, setEditValues] = useState({
    name: "",
    destination: "",
    memo: "",
    startDate: "",
    endDate: "",
    isPublic: false
  });
  const [transportEdits, setTransportEdits] = useState<TransportationDraft[]>([]);
  const [hotelEdits, setHotelEdits] = useState<HotelDraft[]>([]);
  const [activityEdits, setActivityEdits] = useState<ActivityDraft[]>([]);
  const [packingEdits, setPackingEdits] = useState<PackingDraft[]>([]);
  const [savingsEdits, setSavingsEdits] = useState<SavingsDraft[]>([]);
  const [flightFetchingId, setFlightFetchingId] = useState<string | null>(null);
  const [flightFetchError, setFlightFetchError] = useState<string | null>(null);
  const [flightFetchErrorId, setFlightFetchErrorId] = useState<string | null>(null);

  const applyPlanToEdits = (current: TravelPlan) => {
    setEditValues({
      name: current.name ?? "",
      destination: current.destination ?? "",
      memo: current.memo ?? "",
      startDate: toDateInputValue(current.startDate),
      endDate: toDateInputValue(current.endDate),
      isPublic: Boolean(current.isPublic)
    });
    const transportations = Array.isArray(current.transportations)
      ? current.transportations
      : [];
    const hotels = Array.isArray(current.hotels) ? current.hotels : [];
    const activities = Array.isArray(current.activities) ? current.activities : [];
    const packingList = Array.isArray(current.packingList) ? current.packingList : [];
    const savingsHistory = Array.isArray(current.savingsHistory)
      ? current.savingsHistory
      : [];
    setTransportEdits(sortTransportationDrafts(buildTransportationDrafts(transportations)));
    setHotelEdits(buildHotelDrafts(hotels));
    setActivityEdits(buildActivityDrafts(activities));
    setPackingEdits(buildPackingDrafts(packingList));
    setSavingsEdits(buildSavingsDrafts(savingsHistory));
  };

  const updateTransport = (
    index: number,
    updater: (draft: TransportationDraft) => TransportationDraft,
    options?: { sort?: boolean }
  ) => {
    setTransportEdits((prev) => {
      const next = prev.map((draft, i) => (i === index ? updater(draft) : draft));
      if (options?.sort) {
        return sortTransportationDrafts(next);
      }
      return next;
    });
  };

  const updateTransportById = (
    id: string,
    updater: (draft: TransportationDraft) => TransportationDraft,
    options?: { sort?: boolean }
  ) => {
    setTransportEdits((prev) => {
      const next = prev.map((draft) => (draft.id === id ? updater(draft) : draft));
      if (options?.sort) {
        return sortTransportationDrafts(next);
      }
      return next;
    });
  };

  const scheduleTransportSort = () => {
    if (transportSortTimerRef.current) {
      clearTimeout(transportSortTimerRef.current);
    }
    transportSortTimerRef.current = setTimeout(() => {
      setTransportEdits((prev) => sortTransportationDrafts(prev));
    }, 1);
  };

  const handleTransportSortBlur = (event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) {
      return;
    }
    scheduleTransportSort();
  };

  const updateHotel = (index: number, updater: (draft: HotelDraft) => HotelDraft) => {
    setHotelEdits((prev) =>
      prev.map((draft, i) => (i === index ? updater(draft) : draft))
    );
  };

  const updateActivity = (
    index: number,
    updater: (draft: ActivityDraft) => ActivityDraft
  ) => {
    setActivityEdits((prev) =>
      prev.map((draft, i) => (i === index ? updater(draft) : draft))
    );
  };

  const updatePacking = (
    index: number,
    updater: (draft: PackingDraft) => PackingDraft
  ) => {
    setPackingEdits((prev) =>
      prev.map((draft, i) => (i === index ? updater(draft) : draft))
    );
  };

  const updateSavings = (
    index: number,
    updater: (draft: SavingsDraft) => SavingsDraft
  ) => {
    setSavingsEdits((prev) =>
      prev.map((draft, i) => (i === index ? updater(draft) : draft))
    );
  };
  const removeTransport = (index: number) => {
    setTransportEdits((prev) =>
      sortTransportationDrafts(prev.filter((_, i) => i !== index))
    );
  };
  const removeHotel = (index: number) => {
    setHotelEdits((prev) => prev.filter((_, i) => i !== index));
  };
  const removeActivity = (index: number) => {
    setActivityEdits((prev) => prev.filter((_, i) => i !== index));
  };
  const removePacking = (index: number) => {
    setPackingEdits((prev) => prev.filter((_, i) => i !== index));
  };
  const removeSavings = (index: number) => {
    setSavingsEdits((prev) => prev.filter((_, i) => i !== index));
  };

  const fetchFlightInfo = async (transportId: string) => {
    const draft = transportEdits.find((item) => item.id === transportId);
    if (!draft) {
      return;
    }
    const flightNumber = draft.serviceName.value.trim();
    if (!flightNumber) {
      setFlightFetchError("便番号を入力してください。");
      setFlightFetchErrorId(transportId);
      return;
    }
    const date =
      extractDateOnly(draft.depTime.value) ||
      extractDateOnly(editValues.startDate) ||
      new Date().toISOString().slice(0, 10);

    setFlightFetchingId(transportId);
    setFlightFetchError(null);
    setFlightFetchErrorId(null);
    try {
      const response = await fetch(
        `/api/aerodatabox?flight=${encodeURIComponent(
          flightNumber
        )}&date=${encodeURIComponent(date)}`
      );
      if (!response.ok) {
        throw new Error("fetch_failed");
      }
      const payload = await response.json();
      const info = extractFlightInfo(payload);
      if (
        !info.departureAirport &&
        !info.arrivalAirport &&
        !info.departureTime &&
        !info.arrivalTime
      ) {
        setFlightFetchError("便情報が見つかりませんでした。");
        setFlightFetchErrorId(transportId);
        return;
      }

      updateTransportById(transportId, (current) => {
        const departureTimeOnly = info.departureTime
          ? extractTimeOnly(info.departureTime)
          : "";
        const arrivalTimeOnly = info.arrivalTime
          ? extractTimeOnly(info.arrivalTime)
          : "";
        return {
          ...current,
          from: {
            ...current.from,
            value: info.departureAirport || current.from.value
          },
          to: {
            ...current.to,
            value: info.arrivalAirport || current.to.value
          },
          depTime: {
            ...current.depTime,
            value: departureTimeOnly
              ? updateDateTimeValue(current.depTime.value, undefined, departureTimeOnly)
              : current.depTime.value
          },
          arrTime: {
            ...current.arrTime,
            value: arrivalTimeOnly
              ? updateDateTimeValue(current.arrTime.value, undefined, arrivalTimeOnly)
              : current.arrTime.value
          }
        };
      });
      scheduleTransportSort();
    } catch (error) {
      if (error instanceof TypeError) {
        setFlightFetchError("通信に失敗しました。時間をおいて再試行してください。");
      } else {
        setFlightFetchError("便情報の取得に失敗しました。");
      }
      setFlightFetchErrorId(transportId);
    } finally {
      setFlightFetchingId(null);
    }
  };

  const buildAutoSaveUpdates = () => {
    const updates: PlanUpdate = {
      name: editValues.name,
      destination: editValues.destination,
      memo: editValues.memo.trim() ? editValues.memo.trim() : null,
      startDate: parseDateInput(editValues.startDate),
      endDate: parseDateInput(editValues.endDate),
      totalCost: computedTotalCost,
      isPublic: editValues.isPublic
    };

    if (transportEdits.length > 0 || Array.isArray(plan?.transportations)) {
      updates.transportations = applyTransportationDrafts(transportEdits);
    }
    if (hotelEdits.length > 0 || Array.isArray(plan?.hotels)) {
      updates.hotels = applyHotelDrafts(hotelEdits);
    }
    if (activityEdits.length > 0 || Array.isArray(plan?.activities)) {
      updates.activities = applyActivityDrafts(activityEdits);
    }
    if (packingEdits.length > 0 || Array.isArray(plan?.packingList)) {
      updates.packingList = applyPackingDrafts(packingEdits);
    }
    if (savingsEdits.length > 0 || Array.isArray(plan?.savingsHistory)) {
      updates.savingsHistory = applySavingsDrafts(savingsEdits);
    }

    return updates;
  };

  const addTransport = () => {
    setTransportEdits((prev) => {
      const base = prev[0];
      const modeValue = base?.mode.value ?? "新幹線";
      const modeKey = base?.mode.key || TRANSPORT_MODE_KEYS[0];
      const modeConfig = getModeConfig(modeValue);
      const serviceKey =
        modeConfig.serviceKeys?.find((key) => key === base?.serviceName.key) ??
        modeConfig.serviceKeys?.[0] ??
        "";
      const seatKey =
        modeConfig.seatKeys?.find((key) => key === base?.seatNumber.key) ??
        modeConfig.seatKeys?.[0] ??
        "";
      const item: ItemRecord = {
        [modeKey]: modeValue,
        [base?.name.key || TRANSPORT_NAME_KEYS[0]]: "",
        [base?.from.key || TRANSPORT_FROM_KEYS[0]]: "",
        [base?.to.key || TRANSPORT_TO_KEYS[0]]: "",
        [base?.depTime.key || TRANSPORT_DEP_KEYS[0]]: "",
        [base?.arrTime.key || TRANSPORT_ARR_KEYS[0]]: "",
        [base?.price.key || TRANSPORT_PRICE_KEYS[0]]: null,
        [base?.paid.key || TRANSPORT_PAID_KEYS[0]]: false,
        [base?.notes.key || NOTES_KEYS[0]]: ""
      };
      if (serviceKey) {
        item[serviceKey] = "";
      }
      if (seatKey) {
        item[seatKey] = "";
      }
      if (modeValue === "在来線") {
        item.transfers = [];
      }
      return sortTransportationDrafts([...prev, ...buildTransportationDrafts([item])]);
    });
  };

  const addHotel = () => {
    setHotelEdits((prev) => {
      const base = prev[0];
      const item: ItemRecord = {
        [base?.name.key || HOTEL_NAME_KEYS[0]]: "",
        [base?.price.key || HOTEL_PRICE_KEYS[0]]: null,
        [base?.checkIn.key || HOTEL_CHECKIN_KEYS[0]]: "",
        [base?.checkOut.key || HOTEL_CHECKOUT_KEYS[0]]: "",
        [base?.notes.key || NOTES_KEYS[0]]: "",
        [base?.link.key || LINK_KEYS[0]]: ""
      };
      return [...prev, ...buildHotelDrafts([item])];
    });
  };

  const addActivity = () => {
    setActivityEdits((prev) => {
      const base = prev[0];
      const item: ItemRecord = {
        [base?.title.key || ACTIVITY_TITLE_KEYS[0]]: "",
        [base?.date.key || ACTIVITY_DATE_KEYS[0]]: "",
        [base?.notes.key || NOTES_KEYS[0]]: "",
        [base?.link.key || LINK_KEYS[0]]: ""
      };
      return [...prev, ...buildActivityDrafts([item])];
    });
  };

  const addPacking = () => {
    setPackingEdits((prev) => {
      const base = prev[0];
      const item: ItemRecord = {
        [base?.name.key || PACKING_NAME_KEYS[0]]: "",
        [base?.checked.key || PACKING_CHECK_KEYS[0]]: false
      };
      return [...prev, ...buildPackingDrafts([item])];
    });
  };

  const addSavings = () => {
    setSavingsEdits((prev) => {
      const usesObject = prev.some((draft) => draft.isObject);
      const item = usesObject ? { amount: 0 } : 0;
      return [...prev, ...buildSavingsDrafts([item])];
    });
  };

  useEffect(() => {
    let active = true;
    if (!planPath && !planId) {
      return;
    }
    setLoadingPlan(true);
    setPlanError(null);

    const request = planPath
      ? getPlanByPath(planPath)
      : getPlanById(planId ?? "", user.uid);

    request
      .then((data) => {
        if (!active) {
          return;
        }
        setPlan(data);
        if (!data) {
          setPlanError("プランが見つかりませんでした。");
        }
      })
      .catch((err: Error) => {
        if (active) {
          setPlanError("プランの読み込みに失敗しました。");
        }
        console.error(err);
      })
      .finally(() => {
        if (active) {
          setLoadingPlan(false);
        }
      });

    return () => {
      active = false;
    };
  }, [planId, planPath, user.uid]);

  useEffect(() => {
    if (!plan) {
      return;
    }
    if (skipApplyRef.current) {
      skipApplyRef.current = false;
      return;
    }
    applyPlanToEdits(plan);
  }, [plan]);

  useEffect(() => {
    if (!plan?.path) {
      return;
    }
    setCommentsError(null);
    const unsubscribe = subscribeComments(
      plan.path,
      (data) => {
        setComments(data);
      },
      () => {
        setCommentsError("コメントの取得に失敗しました。");
      }
    );

    return () => {
      unsubscribe();
    };
  }, [plan?.path]);

  const authorName = user.displayName ?? user.email ?? "ユーザー";
  const savedTotal =
    Array.isArray(plan?.savingsHistory) && plan.savingsHistory.length > 0
      ? sumSavingsHistory(plan.savingsHistory)
      : typeof plan?.savedAmount === "number"
        ? plan.savedAmount
        : typeof plan?.amount === "number"
          ? plan.amount
          : 0;
  const ownsByPath =
    typeof plan?.path === "string" &&
    (plan.path.startsWith(`users/${user.uid}/travelPlans/`) ||
      plan.path.startsWith(`Users/${user.uid}/travelPlans/`));
  const isOwner =
    Boolean(plan) &&
    (plan?.userId === user.uid || plan?.ownerId === user.uid || ownsByPath);
  const canEdit = Boolean(plan?.path) && isOwner;
  const computedTotalCost = useMemo(() => {
    let sum = 0;
    transportEdits.forEach((draft) => {
      const value = toNumberOrNull(draft.price.value);
      if (value !== null) {
        sum += value;
      }
    });
    hotelEdits.forEach((draft) => {
      const value = toNumberOrNull(draft.price.value);
      if (value !== null) {
        sum += value;
      }
    });
    activityEdits.forEach((draft) => {
      const value = getNumberField(draft.raw as ItemRecord, ACTIVITY_COST_KEYS);
      if (value !== null) {
        sum += value;
      }
    });
    return sum;
  }, [transportEdits, hotelEdits, activityEdits]);
  const totalCost = canEdit
    ? computedTotalCost
    : typeof plan?.totalCost === "number"
      ? plan.totalCost
      : null;
  const remainingCost =
    totalCost !== null ? Math.max(0, totalCost - savedTotal) : null;
  const transportations = Array.isArray(plan?.transportations)
    ? plan.transportations
    : [];
  const hotels = Array.isArray(plan?.hotels) ? plan.hotels : [];
  const activities = Array.isArray(plan?.activities) ? plan.activities : [];
  const packingList = Array.isArray(plan?.packingList) ? plan.packingList : [];
  const hasEditError = Boolean(editError);
  const transportIds = transportEdits.map((draft) => draft.id);
  const transportCardRef = useFlipAnimation(transportIds);
  const sortedTransportations = useMemo(
    () => sortTransportItems(transportations),
    [transportations]
  );

  const progress = plan
    ? getPlanProgress({
      ...plan,
      totalCost: typeof totalCost === "number" ? totalCost : plan.totalCost
    })
    : null;

  useEffect(() => {
    lastSavedRef.current = null;
    setAutoSaveState("idle");
  }, [plan?.path]);

  useEffect(() => {
    if (!canEdit || !plan?.path) {
      return;
    }

    const hasInvalid =
      transportEdits.some((draft) => hasInvalidNumberInput(draft.price.value)) ||
      hotelEdits.some((draft) => hasInvalidNumberInput(draft.price.value)) ||
      savingsEdits.some((draft) => hasInvalidNumberInput(draft.value));

    if (hasInvalid) {
      setAutoSaveState("error");
      setEditError("数値の入力を確認してください。");
      return;
    }

    setEditError(null);

    const updates = buildAutoSaveUpdates();
    const signature = JSON.stringify(updates);

    if (lastSavedRef.current === null) {
      lastSavedRef.current = signature;
      return;
    }

    if (lastSavedRef.current === signature) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    setAutoSaveState("saving");
    autoSaveTimerRef.current = setTimeout(() => {
      setSaving(true);
      updatePlan(plan.path, updates)
        .then(() => {
          lastSavedRef.current = signature;
          skipApplyRef.current = true;
          setPlan((prev) => (prev ? { ...prev, ...updates } : prev));
          setAutoSaveState("saved");
        })
        .catch((err) => {
          setAutoSaveState("error");
          setEditError("自動保存に失敗しました。");
          console.error(err);
        })
        .finally(() => {
          setSaving(false);
        });
    }, 700);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    canEdit,
    plan?.path,
    editValues,
    transportEdits,
    hotelEdits,
    activityEdits,
    packingEdits,
    savingsEdits,
    computedTotalCost
  ]);

  return (
    <PageShell title={plan?.name || "プラン詳細"}>
      <div className="space-y-6">
        {planError ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-rose-500 shadow-cardSoft">
            {planError}
          </div>
        ) : null}
        {loadingPlan ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
            読み込み中...
          </div>
        ) : plan ? (
          <div className="rounded-2xl bg-white p-5 shadow-cardSoft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {plan.name || "Untitled"}
                </h2>
                <p className="text-sm text-slate-500">
                  {plan.destination || "Destination"}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <span className="block text-base font-semibold text-slate-900">
                  {typeof plan.commentsCount === "number" ? plan.commentsCount : 0}
                </span>
                コメント
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {progress ? `あと ${formatYen(progress.remaining)}` : "あと —"}
                </span>
                <span>{progress ? `${progress.percent}%` : "—"}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-slate-900/80"
                  style={{ width: `${progress ? progress.percent : 0}%` }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {plan ? (
          <div className="space-y-6">
            {!canEdit ? (
              <div className="rounded-2xl bg-white p-4 text-xs text-slate-500 shadow-cardSoft">
                このログは編集できません。ログイン中のUIDと ownerId / userId が一致しているか確認してください。
              </div>
            ) : null}
            {canEdit ? (
              <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-500">
                    旅行名
                    <input
                      value={editValues.name}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          name: event.target.value
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-500">
                    目的地
                    <input
                      value={editValues.destination}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          destination: event.target.value
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-500">
                    メモ
                    <textarea
                      value={editValues.memo}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          memo: event.target.value
                        }))
                      }
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-xs font-semibold text-slate-500">
                      出発日
                      <input
                        type="date"
                        value={editValues.startDate}
                        onChange={(event) =>
                          setEditValues((prev) => ({
                            ...prev,
                            startDate: event.target.value
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-500">
                      帰宅日
                      <input
                        type="date"
                        value={editValues.endDate}
                        onChange={(event) =>
                          setEditValues((prev) => ({
                            ...prev,
                            endDate: event.target.value
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                    合計費用（自動）
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {formatYen(computedTotalCost)}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <input
                      type="checkbox"
                      checked={editValues.isPublic}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          isPublic: event.target.checked
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    公開する
                  </label>
                  {hasEditError ? (
                    <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
                      {editError}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <span>
                      {saving || autoSaveState === "saving"
                        ? "自動保存中..."
                        : autoSaveState === "error"
                          ? "自動保存エラー"
                          : autoSaveState === "saved"
                            ? "保存済み"
                            : "自動保存"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (plan) {
                          applyPlanToEdits(plan);
                        }
                        setEditError(null);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                    >
                      リセット
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {!canEdit ? (
              <>
                <div className="space-y-2">
                  <SectionTitle title="基本情報" />
                  <div className="rounded-2xl bg-white px-4 shadow-cardSoft">
                    <InfoRow label="旅行名" value={plan.name} />
                    <div className="h-px bg-slate-100" />
                    <InfoRow label="目的地" value={plan.destination} />
                    <div className="h-px bg-slate-100" />
                    <InfoRow label="メモ" value={plan.memo ?? ""} />
                  </div>
                </div>

                <div className="space-y-2">
                  <SectionTitle title="旅行日程" />
                  <div className="rounded-2xl bg-white px-4 shadow-cardSoft">
                    <InfoRow
                      label="出発日"
                      value={formatDate(plan.startDate) || ""}
                    />
                    <div className="h-px bg-slate-100" />
                    <InfoRow
                      label="帰宅日"
                      value={formatDate(plan.endDate) || ""}
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <SectionTitle title="移動手段" />
              {canEdit ? (
                transportEdits.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                    まだ移動手段が登録されていません。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transportEdits.map((draft, index) => {
                      const depDate = extractDateOnly(draft.depTime.value);
                      const depTime = extractTimeOnly(draft.depTime.value);
                      const arrDate = extractDateOnly(draft.arrTime.value);
                      const arrTime = extractTimeOnly(draft.arrTime.value);
                      return (
                        <div
                          key={draft.id}
                          ref={transportCardRef(draft.id)}
                          className="will-change-transform"
                        >
                          <SwipeDeleteCard
                            enabled={canEdit}
                            onDelete={() => removeTransport(index)}
                          >
                            <div
                              className="rounded-2xl bg-white p-4 shadow-cardSoft"
                              onBlur={handleTransportSortBlur}
                            >
                              <div className="mb-4">
                                <p className="text-xs font-semibold text-slate-500">
                                  移動手段の種類
                                </p>
                                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                                  {TRANSPORT_MODES.map((mode) => {
                                    const selected = draft.mode.value === mode;
                                    return (
                                      <button
                                        key={`${mode}-${index}`}
                                        type="button"
                                        onClick={() =>
                                          updateTransport(index, (current) => {
                                            if (current.mode.value === mode) {
                                              return current;
                                            }
                                            const config = getModeConfig(mode);
                                            const serviceKey = config.serviceKeys?.[0] ?? "";
                                            const seatKey = config.seatKeys?.[0] ?? "";
                                            const nextRaw = { ...current.raw };
                                            if (mode !== "在来線") {
                                              delete nextRaw.transfers;
                                            }
                                            return {
                                              ...current,
                                              raw: nextRaw,
                                              mode: { ...current.mode, value: mode },
                                              serviceName: {
                                                key: serviceKey,
                                                value: "",
                                                original: ""
                                              },
                                              seatNumber: {
                                                key: seatKey,
                                                value: "",
                                                original: ""
                                              },
                                              transfers:
                                                mode === "在来線" ? current.transfers : []
                                            };
                                          })
                                        }
                                        className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-3 text-xs font-bold transition-all ${selected
                                          ? "bg-slate-900 text-white shadow-md scale-[1.02]"
                                          : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                          }`}
                                      >
                                        {mode}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {draft.mode.value === "在来線" ? (
                                <>
                                  <label className="block text-xs font-semibold text-slate-500">
                                    金額
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      value={draft.price.value}
                                      onChange={(event) =>
                                        updateTransport(index, (current) => ({
                                          ...current,
                                          price: {
                                            ...current.price,
                                            value: event.target.value
                                          }
                                        }))
                                      }
                                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    />
                                  </label>
                                  <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs font-semibold text-slate-500">
                                        乗換駅
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            transfers: [
                                              ...current.transfers,
                                              ...buildTransferDrafts([
                                                {
                                                  id: createDraftId(),
                                                  station: "",
                                                  arrivalTime: "",
                                                  departureTime: ""
                                                }
                                              ])
                                            ]
                                          }))
                                        }
                                        className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
                                      >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                        乗換を追加
                                      </button>
                                    </div>
                                    {draft.transfers.length === 0 ? (
                                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                        まだ乗換駅がありません。
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {draft.transfers.map((transfer, transferIndex) => {
                                          const transferArrDate = extractDateOnly(transfer.arrTime.value);
                                          const transferArrTime = extractTimeOnly(transfer.arrTime.value);
                                          const transferDepDate = extractDateOnly(transfer.depTime.value);
                                          const transferDepTime = extractTimeOnly(transfer.depTime.value);
                                          return (
                                            <div
                                              key={`${transfer.id}-${transferIndex}`}
                                              className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold text-slate-500">
                                                  乗換 {transferIndex + 1}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    updateTransport(index, (current) => ({
                                                      ...current,
                                                      transfers: current.transfers.filter(
                                                        (_, idx) => idx !== transferIndex
                                                      )
                                                    }))
                                                  }
                                                  className="text-xs font-semibold text-rose-500"
                                                >
                                                  削除
                                                </button>
                                              </div>
                                              <div className="mt-2">
                                                <p className="text-xs font-semibold text-slate-500">
                                                  駅名
                                                </p>
                                                <div className="mt-2">
                                                  <label className="block text-[11px] font-semibold text-transparent select-none">
                                                    Station
                                                    <div className="relative mt-1 text-slate-900">
                                                      <input
                                                        value={transfer.station.value}
                                                        onChange={(event) =>
                                                          updateTransport(index, (current) => ({
                                                            ...current,
                                                            transfers: current.transfers.map(
                                                              (item, idx) =>
                                                                idx === transferIndex
                                                                  ? {
                                                                    ...item,
                                                                    station: {
                                                                      ...item.station,
                                                                      value: event.target.value
                                                                    }
                                                                  }
                                                                  : item
                                                            )
                                                          }))
                                                        }
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100 placeholder-transparent"
                                                      />
                                                    </div>
                                                  </label>
                                                </div>
                                              </div>
                                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                                  <p className="text-[11px] font-bold text-slate-500">
                                                    1. この駅に到着
                                                  </p>
                                                  <p className="mt-1 text-[11px] text-slate-400">
                                                    乗換駅に着いた時刻
                                                  </p>
                                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                    <label className="block text-[11px] font-semibold text-slate-500">
                                                      日付
                                                      <div className="mt-1">
                                                        <input
                                                          type="date"
                                                          value={transferArrDate}
                                                          onChange={(event) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      arrTime: {
                                                                        ...item.arrTime,
                                                                        value: updateDateTimeValue(
                                                                          item.arrTime.value,
                                                                          event.target.value,
                                                                          undefined
                                                                        )
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }), { sort: true })
                                                          }
                                                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                                        />
                                                      </div>
                                                    </label>
                                                    <label className="block text-[11px] font-semibold text-slate-500">
                                                      時刻
                                                      <div className="mt-1">
                                                        <input
                                                          type="time"
                                                          value={transferArrTime}
                                                          onChange={(event) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      arrTime: {
                                                                        ...item.arrTime,
                                                                        value: updateDateTimeValue(
                                                                          item.arrTime.value,
                                                                          undefined,
                                                                          event.target.value
                                                                        )
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }), { sort: true })
                                                          }
                                                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                                        />
                                                      </div>
                                                    </label>
                                                  </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                                  <p className="text-[11px] font-bold text-slate-500">
                                                    2. この駅を出発
                                                  </p>
                                                  <p className="mt-1 text-[11px] text-slate-400">
                                                    次の列車が出る時刻
                                                  </p>
                                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                    <label className="block text-[11px] font-semibold text-slate-500">
                                                      日付
                                                      <div className="mt-1">
                                                        <input
                                                          type="date"
                                                          value={transferDepDate}
                                                          onChange={(event) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      depTime: {
                                                                        ...item.depTime,
                                                                        value: updateDateTimeValue(
                                                                          item.depTime.value,
                                                                          event.target.value,
                                                                          undefined
                                                                        )
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }))
                                                          }
                                                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                                        />
                                                      </div>
                                                    </label>
                                                    <label className="block text-[11px] font-semibold text-slate-500">
                                                      時刻
                                                      <div className="mt-1">
                                                        <input
                                                          type="time"
                                                          value={transferDepTime}
                                                          onChange={(event) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      depTime: {
                                                                        ...item.depTime,
                                                                        value: updateDateTimeValue(
                                                                          item.depTime.value,
                                                                          undefined,
                                                                          event.target.value
                                                                        )
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }))
                                                          }
                                                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                                        />
                                                      </div>
                                                    </label>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-[11px] font-bold text-slate-500">到着情報</p>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                      最終目的地と到着時刻
                                    </p>
                                    <label className="mt-2 block text-xs font-semibold text-slate-500">
                                      到着地
                                      <input
                                        value={draft.to.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            to: { ...current.to, value: event.target.value }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                                      <label className="block text-[11px] font-semibold text-slate-500">
                                        到着日
                                        <div className="mt-1">
                                          <input
                                            type="date"
                                            value={arrDate}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                arrTime: {
                                                  ...current.arrTime,
                                                  value: updateDateTimeValue(
                                                    current.arrTime.value,
                                                    event.target.value,
                                                    undefined
                                                  )
                                                }
                                              }), { sort: true })
                                            }
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                          />
                                        </div>
                                      </label>
                                      <label className="block text-[11px] font-semibold text-slate-500">
                                        到着時刻
                                        <div className="mt-1">
                                          <input
                                            type="time"
                                            value={arrTime}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                arrTime: {
                                                  ...current.arrTime,
                                                  value: updateDateTimeValue(
                                                    current.arrTime.value,
                                                    undefined,
                                                    event.target.value
                                                  )
                                                }
                                              }), { sort: true })
                                            }
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                          />
                                        </div>
                                      </label>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  {(() => {
                                    const modeConfig = getModeConfig(draft.mode.value);
                                    const hasService = Boolean(modeConfig.serviceLabel);
                                    const hasSeat = Boolean(modeConfig.seatLabel);
                                    return hasService || hasSeat ? (
                                      <div className="mb-3 grid gap-3 md:grid-cols-2">
                                        {hasService ? (
                                          <label className="block text-xs font-semibold text-slate-500">
                                            {modeConfig.serviceLabel}
                                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                              <input
                                                value={draft.serviceName.value}
                                                onChange={(event) =>
                                                  updateTransport(index, (current) => ({
                                                    ...current,
                                                    serviceName: {
                                                      ...current.serviceName,
                                                      value: event.target.value
                                                    }
                                                  }))
                                                }
                                                className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                              />
                                              {draft.mode.value === "飛行機" ? (
                                                <button
                                                  type="button"
                                                  onClick={() => fetchFlightInfo(draft.id)}
                                                  disabled={flightFetchingId === draft.id}
                                                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                                                >
                                                  {flightFetchingId === draft.id
                                                    ? "取得中..."
                                                    : "便情報"}
                                                </button>
                                              ) : null}
                                            </div>
                                            {draft.mode.value === "飛行機" ? (
                                              null
                                            ) : null}
                                            {flightFetchError &&
                                              flightFetchErrorId === draft.id ? (
                                              <p className="mt-2 text-xs text-rose-500">
                                                {flightFetchError}
                                              </p>
                                            ) : null}
                                          </label>
                                        ) : null}
                                        {hasSeat ? (
                                          <label className="block text-xs font-semibold text-slate-500">
                                            {modeConfig.seatLabel}
                                            <input
                                              value={draft.seatNumber.value}
                                              onChange={(event) =>
                                                updateTransport(index, (current) => ({
                                                  ...current,
                                                  seatNumber: {
                                                    ...current.seatNumber,
                                                    value: event.target.value
                                                  }
                                                }))
                                              }
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                            />
                                          </label>
                                        ) : null}
                                      </div>
                                    ) : null;
                                  })()}
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block text-xs font-semibold text-slate-500">
                                      移動名
                                      <input
                                        value={draft.name.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            name: {
                                              ...current.name,
                                              value: event.target.value
                                            }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <label className="block text-xs font-semibold text-slate-500">
                                      金額
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        value={draft.price.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            price: {
                                              ...current.price,
                                              value: event.target.value
                                            }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                  </div>
                                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <label className="block text-xs font-semibold text-slate-500">
                                      出発地
                                      <input
                                        value={draft.from.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            from: {
                                              ...current.from,
                                              value: event.target.value
                                            }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <label className="block text-xs font-semibold text-slate-500">
                                      到着地
                                      <input
                                        value={draft.to.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            to: { ...current.to, value: event.target.value }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                  </div>
                                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <div>
                                      <p className="text-xs font-semibold text-slate-500">
                                        出発時刻
                                      </p>
                                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <label className="block text-[11px] font-semibold text-slate-400">
                                          日付
                                          <input
                                            type="date"
                                            value={depDate}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                depTime: {
                                                  ...current.depTime,
                                                  value: updateDateTimeValue(
                                                    current.depTime.value,
                                                    event.target.value,
                                                    undefined
                                                  )
                                                }
                                              }), { sort: true })
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                          />
                                        </label>
                                        <label className="block text-[11px] font-semibold text-slate-400">
                                          時刻
                                          <input
                                            type="time"
                                            value={depTime}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                depTime: {
                                                  ...current.depTime,
                                                  value: updateDateTimeValue(
                                                    current.depTime.value,
                                                    undefined,
                                                    event.target.value
                                                  )
                                                }
                                              }), { sort: true })
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                          />
                                        </label>
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold text-slate-500">
                                        到着時刻
                                      </p>
                                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <label className="block text-[11px] font-semibold text-slate-400">
                                          日付
                                          <input
                                            type="date"
                                            value={arrDate}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                arrTime: {
                                                  ...current.arrTime,
                                                  value: updateDateTimeValue(
                                                    current.arrTime.value,
                                                    event.target.value,
                                                    undefined
                                                  )
                                                }
                                              }), { sort: true })
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                          />
                                        </label>
                                        <label className="block text-[11px] font-semibold text-slate-400">
                                          時刻
                                          <input
                                            type="time"
                                            value={arrTime}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                arrTime: {
                                                  ...current.arrTime,
                                                  value: updateDateTimeValue(
                                                    current.arrTime.value,
                                                    undefined,
                                                    event.target.value
                                                  )
                                                }
                                              }), { sort: true })
                                            }
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                  <label className="mt-3 block text-xs font-semibold text-slate-500">
                                    メモ
                                    <textarea
                                      value={draft.notes.value}
                                      onChange={(event) =>
                                        updateTransport(index, (current) => ({
                                          ...current,
                                          notes: {
                                            ...current.notes,
                                            value: event.target.value
                                          }
                                        }))
                                      }
                                      rows={2}
                                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    />
                                  </label>
                                </>
                              )}
                              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                                <input
                                  type="checkbox"
                                  checked={draft.paid.value === true}
                                  onChange={(event) =>
                                    updateTransport(index, (current) => ({
                                      ...current,
                                      paid: {
                                        ...current.paid,
                                        value: event.target.checked
                                      }
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                支払い済み
                              </label>
                            </div>
                          </SwipeDeleteCard>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : transportations.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                  まだ移動手段が登録されていません。
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedTransportations.map((item, index) => {
                    const name =
                      getStringField(item, TRANSPORT_NAME_KEYS) ||
                      `移動 ${index + 1}`;
                    const mode = getStringField(item, TRANSPORT_MODE_KEYS);
                    const modeConfig = getModeConfig(mode || "新幹線");
                    const serviceLabel = modeConfig.serviceLabel;
                    const seatLabel = modeConfig.seatLabel;
                    const serviceValue =
                      serviceLabel && modeConfig.serviceKeys?.length
                        ? getStringField(item, modeConfig.serviceKeys)
                        : "";
                    const seatValue =
                      seatLabel && modeConfig.seatKeys?.length
                        ? getStringField(item, modeConfig.seatKeys)
                        : "";
                    const price = getNumberField(item, TRANSPORT_PRICE_KEYS);
                    const isPaid = getBooleanField(item, TRANSPORT_PAID_KEYS);
                    let from = getLocationField(item, TRANSPORT_FROM_KEYS);
                    if (!from) {
                      from = findLocationByPattern(item, TRANSPORT_FROM_PATTERNS);
                    }
                    let to = getLocationField(item, TRANSPORT_TO_KEYS);
                    if (!to) {
                      to = findLocationByPattern(item, TRANSPORT_TO_PATTERNS);
                    }
                    const depTime = formatShortDateTime(
                      getDateField(item, TRANSPORT_DEP_KEYS)
                    );
                    const arrTime = formatShortDateTime(
                      getDateField(item, TRANSPORT_ARR_KEYS)
                    );
                    const transfers = Array.isArray(item.transfers)
                      ? (item.transfers as ItemRecord[])
                      : [];
                    const notes = getStringField(item, NOTES_KEYS);

                    return (
                      <div
                        key={`${name}-${index}`}
                        className="rounded-2xl bg-white p-4 shadow-cardSoft"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-base font-semibold text-slate-900">
                            {name}
                          </h4>
                          {price !== null ? (
                            <span className="text-base font-semibold text-slate-900">
                              {formatYen(price)}
                            </span>
                          ) : null}
                        </div>
                        {mode ? (
                          <p className="mt-2 text-xs font-semibold text-slate-500">
                            {mode}
                          </p>
                        ) : null}
                        {isPaid !== null ? (
                          <p className="mt-2 text-xs font-semibold text-emerald-600">
                            {isPaid ? "支払い済み" : "未払い"}
                          </p>
                        ) : null}
                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                          {serviceLabel && serviceValue ? (
                            <div className="flex items-center justify-between gap-4">
                              <span>
                                {serviceLabel}: {serviceValue}
                              </span>
                              {seatLabel && seatValue ? (
                                <span>
                                  {seatLabel}: {seatValue}
                                </span>
                              ) : null}
                            </div>
                          ) : seatLabel && seatValue ? (
                            <div className="flex items-center justify-between gap-4">
                              <span>
                                {seatLabel}: {seatValue}
                              </span>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-4">
                            <span>出発地: {from || "—"}</span>
                            <span>到着地: {to || "—"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>DEP: {depTime || "—"}</span>
                            <span>ARR: {arrTime || "—"}</span>
                          </div>
                          {mode === "在来線" && transfers.length > 0 ? (
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                              <p className="font-semibold text-slate-500">
                                乗換駅
                              </p>
                              <div className="mt-2 space-y-1">
                                {transfers.map((transfer, transferIndex) => {
                                  const station = getStringField(transfer, [
                                    "station",
                                    "name",
                                    "title"
                                  ]);
                                  const transferArr = formatShortDateTime(
                                    getDateField(transfer, TRANSFER_ARR_KEYS)
                                  );
                                  const transferDep = formatShortDateTime(
                                    getDateField(transfer, TRANSFER_DEP_KEYS)
                                  );
                                  return (
                                    <div
                                      key={`transfer-${transferIndex}`}
                                      className="flex flex-wrap items-center justify-between gap-2"
                                    >
                                      <span>
                                        {transferIndex + 1}. {station || "駅名未設定"}
                                      </span>
                                      <span className="text-slate-400">
                                        {transferArr || "—"} → {transferDep || "—"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          {notes ? <p>メモ: {notes}</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={addTransport}
                  className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                >
                  移動手段を追加
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <SectionTitle title="宿泊" />
              {canEdit ? (
                hotelEdits.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                    まだ宿泊先が登録されていません。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {hotelEdits.map((draft, index) => (
                      <SwipeDeleteCard
                        key={`hotel-edit-${index}`}
                        enabled={canEdit}
                        onDelete={() => removeHotel(index)}
                      >
                        <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="block text-xs font-semibold text-slate-500">
                              宿泊名
                              <input
                                value={draft.name.value}
                                onChange={(event) =>
                                  updateHotel(index, (current) => ({
                                    ...current,
                                    name: { ...current.name, value: event.target.value }
                                  }))
                                }
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="block text-xs font-semibold text-slate-500">
                              金額
                              <input
                                type="number"
                                inputMode="numeric"
                                value={draft.price.value}
                                onChange={(event) =>
                                  updateHotel(index, (current) => ({
                                    ...current,
                                    price: { ...current.price, value: event.target.value }
                                  }))
                                }
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="block text-xs font-semibold text-slate-500">
                              チェックイン
                              <input
                                value={draft.checkIn.value}
                                onChange={(event) =>
                                  updateHotel(index, (current) => ({
                                    ...current,
                                    checkIn: {
                                      ...current.checkIn,
                                      value: event.target.value
                                    }
                                  }))
                                }
                                placeholder="例: 2025-11-23 15:00"
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="block text-xs font-semibold text-slate-500">
                              チェックアウト
                              <input
                                value={draft.checkOut.value}
                                onChange={(event) =>
                                  updateHotel(index, (current) => ({
                                    ...current,
                                    checkOut: {
                                      ...current.checkOut,
                                      value: event.target.value
                                    }
                                  }))
                                }
                                placeholder="例: 2025-11-24 10:00"
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                          </div>
                          <label className="mt-3 block text-xs font-semibold text-slate-500">
                            メモ
                            <textarea
                              value={draft.notes.value}
                              onChange={(event) =>
                                updateHotel(index, (current) => ({
                                  ...current,
                                  notes: { ...current.notes, value: event.target.value }
                                }))
                              }
                              rows={2}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                          <label className="mt-3 block text-xs font-semibold text-slate-500">
                            予約リンク
                            <input
                              value={draft.link.value}
                              onChange={(event) =>
                                updateHotel(index, (current) => ({
                                  ...current,
                                  link: { ...current.link, value: event.target.value }
                                }))
                              }
                              placeholder="https://..."
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                        </div>
                      </SwipeDeleteCard>
                    ))}
                  </div>
                )
              ) : hotels.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                  まだ宿泊先が登録されていません。
                </div>
              ) : (
                <div className="space-y-3">
                  {hotels.map((item, index) => {
                    const name =
                      getStringField(item, HOTEL_NAME_KEYS) ||
                      `宿泊 ${index + 1}`;
                    const price = getNumberField(item, HOTEL_PRICE_KEYS);
                    const checkIn = formatShortDateTime(
                      getDateField(item, HOTEL_CHECKIN_KEYS)
                    );
                    const checkOut = formatShortDateTime(
                      getDateField(item, HOTEL_CHECKOUT_KEYS)
                    );
                    const notes = getStringField(item, NOTES_KEYS);
                    const link = getLinkField(item);
                    const linkHref = link ? normalizeLink(link) : null;

                    return (
                      <div
                        key={`${name}-${index}`}
                        className="rounded-2xl bg-white p-4 shadow-cardSoft"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-base font-semibold text-slate-900">
                            {name}
                          </h4>
                          {price !== null ? (
                            <span className="text-base font-semibold text-slate-900">
                              {formatYen(price)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                          {(checkIn || checkOut) && (
                            <div className="flex items-center justify-between gap-4">
                              <span>チェックイン: {checkIn || "—"}</span>
                              <span>チェックアウト: {checkOut || "—"}</span>
                            </div>
                          )}
                          {notes ? <p>メモ: {notes}</p> : null}
                          {linkHref ? (
                            <a
                              href={linkHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-900 underline underline-offset-4"
                            >
                              予約リンクを開く
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={addHotel}
                  className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                >
                  宿泊を追加
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <SectionTitle title="アクティビティ" />
              {canEdit ? (
                activityEdits.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                    まだアクティビティが登録されていません。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activityEdits.map((draft, index) => (
                      <SwipeDeleteCard
                        key={`activity-edit-${index}`}
                        enabled={canEdit}
                        onDelete={() => removeActivity(index)}
                      >
                        <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="block text-xs font-semibold text-slate-500">
                              タイトル
                              <input
                                value={draft.title.value}
                                onChange={(event) =>
                                  updateActivity(index, (current) => ({
                                    ...current,
                                    title: { ...current.title, value: event.target.value }
                                  }))
                                }
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="block text-xs font-semibold text-slate-500">
                              日時
                              <input
                                value={draft.date.value}
                                onChange={(event) =>
                                  updateActivity(index, (current) => ({
                                    ...current,
                                    date: { ...current.date, value: event.target.value }
                                  }))
                                }
                                placeholder="例: 2025-11-23 10:00"
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                          </div>
                          <label className="mt-3 block text-xs font-semibold text-slate-500">
                            メモ
                            <textarea
                              value={draft.notes.value}
                              onChange={(event) =>
                                updateActivity(index, (current) => ({
                                  ...current,
                                  notes: { ...current.notes, value: event.target.value }
                                }))
                              }
                              rows={2}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                          <label className="mt-3 block text-xs font-semibold text-slate-500">
                            予約リンク
                            <input
                              value={draft.link.value}
                              onChange={(event) =>
                                updateActivity(index, (current) => ({
                                  ...current,
                                  link: { ...current.link, value: event.target.value }
                                }))
                              }
                              placeholder="https://..."
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                        </div>
                      </SwipeDeleteCard>
                    ))}
                  </div>
                )
              ) : activities.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                  まだアクティビティが登録されていません。
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((item, index) => {
                    const title =
                      getStringField(item, ACTIVITY_TITLE_KEYS) ||
                      `アクティビティ ${index + 1}`;
                    const date = formatShortDateTime(
                      getDateField(item, ACTIVITY_DATE_KEYS)
                    );
                    const notes = getStringField(item, NOTES_KEYS);
                    const link = getLinkField(item);
                    const linkHref = link ? normalizeLink(link) : null;

                    return (
                      <div
                        key={`${title}-${index}`}
                        className="rounded-2xl bg-white p-4 shadow-cardSoft"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-base font-semibold text-slate-900">
                            {title}
                          </h4>
                          {date ? (
                            <span className="text-xs text-slate-500">{date}</span>
                          ) : null}
                        </div>
                        {notes ? (
                          <p className="mt-2 text-xs text-slate-500">メモ: {notes}</p>
                        ) : null}
                        {linkHref ? (
                          <a
                            href={linkHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block text-xs text-slate-900 underline underline-offset-4"
                          >
                            予約リンクを開く
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={addActivity}
                  className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                >
                  アクティビティを追加
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <SectionTitle title="持ち物" />
              {canEdit ? (
                packingEdits.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                    まだ持ち物が登録されていません。
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                    <div className="space-y-3">
                      {packingEdits.map((draft, index) => (
                        <SwipeDeleteCard
                          key={`packing-edit-${index}`}
                          enabled={canEdit}
                          onDelete={() => removePacking(index)}
                        >
                          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                            <label className="block text-xs font-semibold text-slate-500">
                              持ち物
                              <input
                                value={draft.name.value}
                                onChange={(event) =>
                                  updatePacking(index, (current) => ({
                                    ...current,
                                    name: { ...current.name, value: event.target.value }
                                  }))
                                }
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                              <input
                                type="checkbox"
                                checked={draft.checked.value === true}
                                onChange={(event) =>
                                  updatePacking(index, (current) => ({
                                    ...current,
                                    checked: {
                                      ...current.checked,
                                      value: event.target.checked
                                    }
                                  }))
                                }
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              準備済み
                            </label>
                          </div>
                        </SwipeDeleteCard>
                      ))}
                    </div>
                  </div>
                )
              ) : packingList.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                  まだ持ち物が登録されていません。
                </div>
              ) : (
                <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                  <ul className="space-y-2 text-sm">
                    {packingList.map((item, index) => {
                      const record =
                        typeof item === "string" ? { name: item } : item;
                      const name =
                        getStringField(record, PACKING_NAME_KEYS) ||
                        `持ち物 ${index + 1}`;
                      const checked = getBooleanField(record, PACKING_CHECK_KEYS);
                      return (
                        <li
                          key={`${name}-${index}`}
                          className="flex items-center justify-between"
                        >
                          <span className="text-slate-900">{name}</span>
                          <span className="text-xs text-slate-500">
                            {checked ? "準備済み" : "未準備"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={addPacking}
                  className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                >
                  持ち物を追加
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <SectionTitle title="支払い履歴" />
              <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">貯金額</span>
                  <span className="font-semibold text-slate-900">
                    {formatYen(savedTotal)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">あと</span>
                  <span className="font-semibold text-slate-900">
                    {remainingCost !== null ? formatYen(remainingCost) : "—"}
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-900/80"
                    style={{
                      width: `${totalCost
                        ? Math.min(100, Math.round((savedTotal / totalCost) * 100))
                        : 0
                        }%`
                    }}
                  />
                </div>
                {canEdit ? (
                  savingsEdits.length === 0 ? (
                    <div className="mt-3 text-xs text-slate-500">
                      まだ貯金履歴がありません。
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {savingsEdits.map((draft, index) => (
                        <SwipeDeleteCard
                          key={`save-edit-${index}`}
                          enabled={canEdit}
                          onDelete={() => removeSavings(index)}
                        >
                          <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                            <p className="text-xs font-semibold text-slate-500">
                              貯金 {index + 1}
                            </p>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={draft.value}
                              onChange={(event) =>
                                updateSavings(index, (current) => ({
                                  ...current,
                                  value: event.target.value
                                }))
                              }
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                            />
                          </div>
                        </SwipeDeleteCard>
                      ))}
                    </div>
                  )
                ) : plan.savingsHistory && plan.savingsHistory.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {plan.savingsHistory.map((value, index) => (
                      <span
                        key={`save-${index}`}
                        className="rounded-full bg-slate-100 px-3 py-1"
                      >
                        {formatSavingsEntry(value)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={addSavings}
                    className="mt-4 w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                  >
                    貯金履歴を追加
                  </button>
                ) : null}
              </div>
            </div>

            {!canEdit ? (
              <div className="space-y-2">
                <SectionTitle title="合計費用" />
                <div className="rounded-2xl bg-white px-4 shadow-cardSoft">
                  <InfoRow
                    label="合計"
                    value={totalCost !== null ? formatYen(totalCost) : "—"}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">コメント</h3>
            {commentsError ? (
              <span className="text-xs text-rose-500">{commentsError}</span>
            ) : null}
          </div>
          {actionError ? (
            <div className="rounded-2xl bg-white p-3 text-xs text-rose-500 shadow-cardSoft">
              {actionError}
            </div>
          ) : null}
          <CommentForm
            onSubmit={async (text) => {
              if (!plan?.path) {
                setActionError("プラン情報が取得できません。");
                return;
              }
              setActionError(null);
              try {
                await postComment(plan.path, text, authorName);
              } catch (err) {
                setActionError("コメントの投稿に失敗しました。");
                console.error(err);
              }
            }}
          />
          <CommentList
            comments={comments}
            onDelete={async (commentId) => {
              if (!plan?.path) {
                setActionError("プラン情報が取得できません。");
                return;
              }
              setActionError(null);
              try {
                await deleteComment(plan.path, commentId);
              } catch (err) {
                setActionError("コメントの削除に失敗しました。");
                console.error(err);
              }
            }}
          />
        </section>
      </div>
    </PageShell>
  );
}

export default function PlanDetailPage() {
  return (
    <AuthGate>
      {(user) => <PlanDetailContent user={user} />}
    </AuthGate>
  );
}
