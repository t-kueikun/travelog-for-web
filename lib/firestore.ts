import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export type TravelPlan = {
  id: string;
  path: string;
  name: string;
  destination?: string;
  totalCost?: number | null;
  amount?: number;
  savedAmount?: number;
  savingsHistory?: Array<number | { amount?: number }>;
  commentsCount?: number;
  isPublic?: boolean;
  userId?: string;
  ownerId?: string;
  memo?: string | null;
  startDate?: Timestamp | Date | string | null;
  endDate?: Timestamp | Date | string | null;
  activities?: Array<Record<string, unknown>>;
  transportations?: Array<Record<string, unknown>>;
  hotels?: Array<Record<string, unknown>>;
  packingList?: Array<Record<string, unknown> | string>;
  sharedWith?: Array<string>;
};

export type Comment = {
  id: string;
  text: string;
  createdAt?: Timestamp;
  authorName?: string | null;
};

export type PlanUpdate = Partial<
  Pick<
    TravelPlan,
    | "name"
    | "destination"
    | "memo"
    | "startDate"
    | "endDate"
    | "totalCost"
    | "isPublic"
    | "activities"
    | "transportations"
    | "hotels"
    | "packingList"
    | "savingsHistory"
  >
>;

function mapPlan(snapshot: {
  id: string;
  data: () => Record<string, unknown>;
  ref: { path: string };
}): TravelPlan {
  const data = snapshot.data() as Omit<TravelPlan, "id" | "path">;
  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    name: data.name ?? "",
    destination: data.destination,
    totalCost: data.totalCost,
    amount: data.amount,
    savedAmount: data.savedAmount,
    savingsHistory: data.savingsHistory,
    commentsCount: data.commentsCount,
    isPublic: data.isPublic,
    userId: data.userId,
    ownerId: data.ownerId,
    memo: data.memo ?? null,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    activities: Array.isArray(data.activities) ? data.activities : undefined,
    transportations: Array.isArray(data.transportations) ? data.transportations : undefined,
    hotels: Array.isArray(data.hotels) ? data.hotels : undefined,
    packingList: Array.isArray(data.packingList) ? data.packingList : undefined,
    sharedWith: Array.isArray(data.sharedWith) ? data.sharedWith : undefined
  };
}

export async function getMyPlans(userId: string): Promise<TravelPlan[]> {
  const db = getFirebaseDb();
  const sources = [
    collection(db, "Users", userId, "travelPlans"),
    collection(db, "users", userId, "travelPlans"),
    query(collection(db, "travelPlans"), where("userId", "==", userId)),
    query(collection(db, "travelPlans"), where("ownerId", "==", userId))
  ];
  const plans: TravelPlan[] = [];
  let lastError: unknown = null;
  let hadSuccess = false;

  for (const source of sources) {
    try {
      const snapshot = await getDocs(source);
      hadSuccess = true;
      plans.push(...snapshot.docs.map(mapPlan));
    } catch (error) {
      lastError = error;
    }
  }

  if (!hadSuccess && lastError) {
    throw lastError;
  }
  const deduped = new Map<string, TravelPlan>();

  plans.forEach((plan) => {
    deduped.set(plan.path, plan);
  });

  return Array.from(deduped.values());
}

export async function getPublicPlans(): Promise<TravelPlan[]> {
  const db = getFirebaseDb();
  const ref = collectionGroup(db, "travelPlans");
  const q = query(ref, where("isPublic", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapPlan);
}

export async function getPlanByPath(planPath: string): Promise<TravelPlan | null> {
  const db = getFirebaseDb();
  const ref = doc(db, planPath);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }
  return mapPlan(snapshot);
}

export async function getPlanById(
  planId: string,
  currentUserId?: string
): Promise<TravelPlan | null> {
  const candidates = [
    currentUserId ? `Users/${currentUserId}/travelPlans/${planId}` : null,
    currentUserId ? `users/${currentUserId}/travelPlans/${planId}` : null,
    `travelPlans/${planId}`
  ].filter((path): path is string => Boolean(path));

  for (const path of candidates) {
    const plan = await getPlanByPath(path);
    if (plan) {
      return plan;
    }
  }

  return null;
}

export function subscribeComments(
  planPath: string,
  onUpdate: (comments: Comment[]) => void,
  onError?: (error: Error) => void
) {
  const db = getFirebaseDb();
  const ref = collection(db, `${planPath}/comments`);
  const q = query(ref, orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const comments = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Comment, "id">)
      }));
      onUpdate(comments);
    },
    (error) => {
      onError?.(error as Error);
    }
  );
}

export async function postComment(
  planPath: string,
  text: string,
  authorName?: string
) {
  const db = getFirebaseDb();
  const ref = collection(db, `${planPath}/comments`);
  await addDoc(ref, {
    text,
    authorName: authorName ?? null,
    createdAt: serverTimestamp()
  });
}

export async function createPlan(userId: string) {
  const db = getFirebaseDb();
  const ref = collection(db, "users", userId, "travelPlans");
  const docRef = await addDoc(ref, {
    name: "新しいLog",
    destination: "",
    memo: "",
    isPublic: false,
    ownerId: userId,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.path;
}

export async function deleteComment(planPath: string, commentId: string) {
  const db = getFirebaseDb();
  const ref = doc(db, `${planPath}/comments/${commentId}`);
  await deleteDoc(ref);
}

export async function deletePlan(planPath: string) {
  const db = getFirebaseDb();
  const ref = doc(db, planPath);
  await deleteDoc(ref);
}

export async function updatePlan(planPath: string, updates: PlanUpdate) {
  const db = getFirebaseDb();
  const ref = doc(db, planPath);
  await updateDoc(ref, updates);
}

export async function resetMyPlans(userId: string) {
  const db = getFirebaseDb();
  const sources = [
    collection(db, "Users", userId, "travelPlans"),
    collection(db, "users", userId, "travelPlans"),
    query(collection(db, "travelPlans"), where("userId", "==", userId)),
    query(collection(db, "travelPlans"), where("ownerId", "==", userId))
  ];
  type DocsSnapshot = Awaited<ReturnType<typeof getDocs>>;
  const docs: Array<DocsSnapshot["docs"][number]> = [];
  let lastError: unknown = null;
  let hadSuccess = false;

  for (const source of sources) {
    try {
      const snapshot = await getDocs(source);
      hadSuccess = true;
      docs.push(...snapshot.docs);
    } catch (error) {
      lastError = error;
    }
  }

  if (!hadSuccess && lastError) {
    throw lastError;
  }
  const batch = writeBatch(db);

  docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  await batch.commit();
}
