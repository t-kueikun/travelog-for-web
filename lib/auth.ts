import {
  createUserWithEmailAndPassword,
  OAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export async function signInWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  return signOut(auth);
}

export async function signInWithApple() {
  const auth = getFirebaseAuth();
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");

  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export function formatAuthError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "ログインに失敗しました。";
  }
  const code =
    "code" in error && typeof (error as { code?: string }).code === "string"
      ? (error as { code?: string }).code
      : "";

  switch (code) {
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません。";
    case "auth/unauthorized-domain":
      return "このドメインはFirebase認証で許可されていません。";
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "メールアドレスまたはパスワードが違います。";
    case "auth/email-already-in-use":
      return "このメールアドレスは既に使われています。";
    case "auth/account-exists-with-different-credential":
      return "別のログイン方法で登録済みのメールアドレスです。";
    case "auth/weak-password":
      return "パスワードは6文字以上にしてください。";
    case "auth/too-many-requests":
      return "試行回数が多すぎます。しばらくしてから再試行してください。";
    case "auth/operation-not-allowed":
      return "このログイン方法は無効になっています。";
    case "auth/popup-blocked":
      return "ポップアップがブロックされました。";
    case "auth/popup-closed-by-user":
      return "ログインがキャンセルされました。";
    default:
      return "ログインに失敗しました。";
  }
}
