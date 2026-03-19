export type AiPlanSuggestion = {
  name?: string;
  destination?: string;
  memo?: string;
  startDate?: string | null;
  endDate?: string | null;
  transportations?: Array<Record<string, unknown>>;
  hotels?: Array<Record<string, unknown>>;
  activities?: Array<Record<string, unknown>>;
  packingList?: Array<Record<string, unknown> | string>;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:\d{2})?$/;

function cleanString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const next = value.trim();
  return next ? next : undefined;
}

function cleanNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "").trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function cleanBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return undefined;
}

function cleanCurrency(value: unknown) {
  const normalized = cleanString(value)?.toUpperCase();
  if (normalized === "USD") {
    return "USD";
  }
  return "JPY";
}

function cleanDate(value: unknown) {
  const normalized = cleanString(value);
  if (!normalized) {
    return undefined;
  }
  if (ISO_DATE_PATTERN.test(normalized)) {
    return normalized;
  }
  if (ISO_DATETIME_PATTERN.test(normalized)) {
    return normalized.replace(" ", "T");
  }
  return undefined;
}

function cleanLink(value: unknown) {
  const normalized = cleanString(value);
  if (!normalized) {
    return undefined;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  return undefined;
}

function cleanObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function hasAirportSignal(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("airport") || value.includes("空港")) {
    return true;
  }
  return /\(([a-z]{3})\)/i.test(value);
}

function normalizeTransportMode(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes("shinkansen") || value.includes("新幹線")) {
    return "新幹線";
  }
  if (
    normalized.includes("limitedexpress") ||
    normalized.includes("ltdexp") ||
    value.includes("特急")
  ) {
    return "特急";
  }
  if (
    normalized.includes("flight") ||
    normalized.includes("plane") ||
    normalized.includes("airline") ||
    normalized.includes("airport") ||
    value.includes("飛行機") ||
    value.includes("航空")
  ) {
    return "飛行機";
  }
  if (normalized.includes("bus") || value.includes("バス")) {
    return "バス";
  }
  if (
    normalized.includes("ship") ||
    normalized.includes("ferry") ||
    normalized.includes("boat") ||
    value.includes("船")
  ) {
    return "船";
  }
  if (
    normalized.includes("car") ||
    normalized.includes("taxi") ||
    normalized.includes("drive") ||
    value.includes("車")
  ) {
    return "車";
  }
  if (
    normalized.includes("train") ||
    normalized.includes("rail") ||
    normalized.includes("metro") ||
    normalized.includes("subway") ||
    normalized.includes("jr") ||
    value.includes("在来線") ||
    value.includes("電車") ||
    value.includes("鉄道")
  ) {
    return "在来線";
  }
  return undefined;
}

function inferTransportModeFromSource({
  rawMode,
  from,
  to,
  name,
  serviceName,
  notes,
  price
}: {
  rawMode: string | undefined;
  from: string | undefined;
  to: string | undefined;
  name: string | undefined;
  serviceName: string | undefined;
  notes: string | undefined;
  price: number | undefined;
}) {
  const explicit = normalizeTransportMode(rawMode);

  const signalText = `${name ?? ""} ${serviceName ?? ""} ${notes ?? ""}`.trim();
  const normalizedSignal = signalText.toLowerCase();
  const flightNumberLike = /\b[a-z]{2,3}\s?\d{2,4}\b/i.test(signalText);
  const flightWordLike = /航空|flight|airline|便|plane/i.test(signalText);
  const railWordLike =
    /新幹線|特急|在来線|電車|鉄道|train|rail|metro|subway|jr/i.test(signalText);
  const busWordLike = /バス|bus|coach/i.test(signalText);
  const shipWordLike = /船|フェリー|ship|ferry|boat/i.test(signalText);
  const carWordLike =
    /車|タクシー|レンタカー|car|taxi|drive|uber|lyft|rideshare|ridehail/i.test(signalText);
  void normalizedSignal;
  void price;
  const hasFromAirport = hasAirportSignal(from ?? "");
  const hasToAirport = hasAirportSignal(to ?? "");

  if (flightNumberLike || flightWordLike) {
    return "飛行機";
  }
  if (hasFromAirport && hasToAirport) {
    return "飛行機";
  }

  // 非航空シグナルが強い場合は、既存typeよりこちらを優先する。
  if (carWordLike) {
    return "車";
  }
  if (busWordLike) {
    return "バス";
  }
  if (shipWordLike) {
    return "船";
  }
  if (railWordLike) {
    return signalText.includes("新幹線")
      ? "新幹線"
      : signalText.includes("特急")
        ? "特急"
        : "在来線";
  }
  if (explicit) {
    return explicit;
  }
  return undefined;
}

function cleanTransfer(value: unknown) {
  const source = cleanObject(value);
  if (!source) {
    return null;
  }
  const next: Record<string, unknown> = {};
  const station = cleanString(source.station ?? source.name);
  const serviceName = cleanString(
    source.serviceName ?? source.service ?? source.flightNumber ?? source.flightNo ?? source.lineName
  );
  const depTime = cleanDate(source.depTime ?? source.departureTime ?? source.departAt);
  const arrTime = cleanDate(source.arrTime ?? source.arrivalTime ?? source.arriveAt);

  if (station) {
    next.station = station;
  }
  if (serviceName) {
    next.serviceName = serviceName;
  }
  if (depTime) {
    next.depTime = depTime;
  }
  if (arrTime) {
    next.arrTime = arrTime;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function cleanTransportation(value: unknown) {
  const source = cleanObject(value);
  if (!source) {
    return null;
  }
  const next: Record<string, unknown> = {};
  const modeRaw = cleanString(source.type ?? source.mode ?? source.category ?? source.kind);
  const name = cleanString(source.name ?? source.title);
  const serviceName = cleanString(
    source.serviceName ??
      source.flightNumber ??
      source.flightNo ??
      source.trainName ??
      source.lineName ??
      source.busName
  );
  const seatNumber = cleanString(source.seatNumber ?? source.seat ?? source.seatNo);
  const from = cleanString(
    source.from ??
      source.departure ??
      source.origin ??
      source.start ??
      source.startPlace ??
      source.startLocation ??
      source.fromPlace ??
      source.departurePlace ??
      source.departureLocation ??
      source.fromAirport ??
      source.departureAirport ??
      source.fromStation
  );
  const to = cleanString(
    source.to ??
      source.arrival ??
      source.destination ??
      source.end ??
      source.endPlace ??
      source.endLocation ??
      source.toPlace ??
      source.arrivalPlace ??
      source.arrivalLocation ??
      source.toAirport ??
      source.arrivalAirport ??
      source.toStation
  );
  const depTime = cleanDate(source.depTime ?? source.departureTime ?? source.departAt);
  const arrTime = cleanDate(source.arrTime ?? source.arrivalTime ?? source.arriveAt);
  const price = cleanNumber(source.price ?? source.amount ?? source.cost ?? source.fare);
  const paid = cleanBoolean(source.paid ?? source.isPaid);
  const notes = cleanString(source.notes ?? source.memo ?? source.detail);
  const mode = inferTransportModeFromSource({
    rawMode: modeRaw,
    from,
    to,
    name,
    serviceName,
    notes,
    price
  });
  const transfers = Array.isArray(source.transfers)
    ? source.transfers.map(cleanTransfer).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];

  if (mode) {
    next.type = mode;
  }
  if (name) {
    next.name = name;
  }
  if (serviceName) {
    next.serviceName = serviceName;
  }
  if (seatNumber) {
    next.seatNumber = seatNumber;
  }
  if (from) {
    next.from = from;
  }
  if (to) {
    next.to = to;
  }
  if (depTime) {
    next.depTime = depTime;
  }
  if (arrTime) {
    next.arrTime = arrTime;
  }
  if (price !== undefined) {
    next.price = price;
  }
  next.currency = cleanCurrency(source.currency ?? source.currencyCode);
  if (paid !== undefined) {
    next.paid = paid;
  }
  if (notes) {
    next.notes = notes;
  }
  if (transfers.length > 0) {
    next.transfers = transfers;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function cleanHotel(value: unknown) {
  const source = cleanObject(value);
  if (!source) {
    return null;
  }
  const next: Record<string, unknown> = {};
  const name = cleanString(source.name ?? source.title);
  const price = cleanNumber(source.price ?? source.amount ?? source.cost);
  const paid = cleanBoolean(source.paid ?? source.isPaid);
  const checkIn = cleanDate(source.checkIn ?? source.checkInDate ?? source.startDate);
  const checkOut = cleanDate(source.checkOut ?? source.checkOutDate ?? source.endDate);
  const notes = cleanString(source.notes ?? source.memo ?? source.detail);
  const link = cleanLink(source.link ?? source.url);

  if (name) {
    next.name = name;
  }
  if (price !== undefined) {
    next.price = price;
  }
  next.currency = cleanCurrency(source.currency ?? source.currencyCode);
  if (paid !== undefined) {
    next.paid = paid;
  }
  if (checkIn) {
    next.checkIn = checkIn;
  }
  if (checkOut) {
    next.checkOut = checkOut;
  }
  if (notes) {
    next.notes = notes;
  }
  if (link) {
    next.link = link;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function cleanActivity(value: unknown) {
  const source = cleanObject(value);
  if (!source) {
    return null;
  }
  const next: Record<string, unknown> = {};
  const title = cleanString(source.title ?? source.name);
  const date = cleanDate(source.date ?? source.startDate ?? source.time);
  const notes = cleanString(source.notes ?? source.memo ?? source.detail);
  const link = cleanLink(source.link ?? source.url);

  if (title) {
    next.title = title;
  }
  if (date) {
    next.date = date;
  }
  if (notes) {
    next.notes = notes;
  }
  if (link) {
    next.link = link;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function cleanPackingItem(value: unknown): string | Record<string, unknown> | null {
  if (typeof value === "string") {
    const normalized = cleanString(value);
    return normalized ?? null;
  }
  const source = cleanObject(value);
  if (!source) {
    return null;
  }
  const name = cleanString(source.name ?? source.title ?? source.item);
  if (!name) {
    return null;
  }
  const checked = cleanBoolean(source.checked ?? source.done ?? source.packed);
  if (checked === undefined) {
    return { name };
  }
  return { name, checked };
}

function isPackingItem(
  value: string | Record<string, unknown> | null
): value is string | Record<string, unknown> {
  return Boolean(value);
}

export function sanitizeAiPlanSuggestion(value: unknown): AiPlanSuggestion {
  const source = cleanObject(value) ?? {};

  return {
    name: cleanString(source.name),
    destination: cleanString(source.destination),
    memo: cleanString(source.memo ?? source.notes),
    startDate: cleanDate(source.startDate) ?? null,
    endDate: cleanDate(source.endDate) ?? null,
    transportations: Array.isArray(source.transportations)
      ? source.transportations
          .map(cleanTransportation)
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [],
    hotels: Array.isArray(source.hotels)
      ? source.hotels.map(cleanHotel).filter((item): item is Record<string, unknown> => Boolean(item))
      : [],
    activities: Array.isArray(source.activities)
      ? source.activities
          .map(cleanActivity)
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [],
    packingList: Array.isArray(source.packingList)
      ? source.packingList
          .map(cleanPackingItem)
          .filter(isPackingItem)
      : []
  };
}

export function extractResponseText(value: unknown): string {
  const source = cleanObject(value);
  if (!source) {
    return "";
  }

  const direct = cleanString(source.output_text);
  if (direct) {
    return direct;
  }

  const output = Array.isArray(source.output) ? source.output : [];
  const parts: string[] = [];

  output.forEach((item) => {
    const outputItem = cleanObject(item);
    if (!outputItem || !Array.isArray(outputItem.content)) {
      return;
    }
    outputItem.content.forEach((contentItem) => {
      const content = cleanObject(contentItem);
      const text = cleanString(
        content?.text ?? cleanObject(content?.text)?.value ?? cleanObject(content?.text)?.content
      );
      if (text) {
        parts.push(text);
      }
    });
  });

  return parts.join("\n").trim();
}
