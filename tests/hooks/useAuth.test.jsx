// 対象: src/hooks/useAuth.js（名前付き export { useAuth }）
// 仕様: docs/02 4 章 hooks（useAuth）、docs/03 3 章 AuthRepository、FR-01・FR-02
// 契約: const { user, loading, signIn, signOut } = useAuth(auth)   auth は AuthRepository
//   - 初期は loading: true・user: null。getCurrentUser が返ったら loading: false・user を反映
//   - signIn(email, password) / signOut() は auth へ委譲（失敗は reject のまま伝え、user は変えない）
//   - onAuthChange を購読して user に反映し、アンマウント時に解除する
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAuth } from "../../src/hooks/useAuth.js";
import { LocalAuth } from "../../src/repositories/local/LocalAuth.js";
import { USERS } from "../repositories/contract/fixtures.js";

const ALICE = USERS[0];

describe("useAuth", () => {
  it("初期は loading で user は null、解決後に loading が false になる（未ログイン）", async () => {
    const auth = new LocalAuth({ users: USERS });
    const { result } = renderHook(() => useAuth(auth));
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("すでにログイン済みなら、そのユーザーを反映する", async () => {
    const auth = new LocalAuth({ users: USERS });
    await auth.signIn(ALICE.email, ALICE.password);
    const { result } = renderHook(() => useAuth(auth));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(
      expect.objectContaining({ id: "u-alice", displayName: "Alice" }),
    );
  });

  it("signIn に成功すると user が更新される。パスワードは user に含めない", async () => {
    const auth = new LocalAuth({ users: USERS });
    const { result } = renderHook(() => useAuth(auth));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signIn(ALICE.email, ALICE.password);
    });
    expect(result.current.user.id).toBe("u-alice");
    expect(result.current.user).not.toHaveProperty("password");
  });

  it("signIn に失敗したら reject し、user は null のまま", async () => {
    const auth = new LocalAuth({ users: USERS });
    const { result } = renderHook(() => useAuth(auth));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let error;
    await act(async () => {
      try {
        await result.current.signIn(ALICE.email, "wrong");
      } catch (e) {
        error = e;
      }
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("メールアドレスまたはパスワードが違います");
    expect(result.current.user).toBeNull();
  });

  it("signOut すると user が null に戻る", async () => {
    const auth = new LocalAuth({ users: USERS });
    await auth.signIn(ALICE.email, ALICE.password);
    const { result } = renderHook(() => useAuth(auth));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.user).toBeNull();
  });

  it("auth 側の変化（ユーザー切替）にも追従する", async () => {
    const auth = new LocalAuth({ users: USERS });
    await auth.signIn(ALICE.email, ALICE.password);
    const { result } = renderHook(() => useAuth(auth));
    await waitFor(() => expect(result.current.user?.id).toBe("u-alice"));
    await act(async () => {
      await auth.switchUser("u-bob");
    });
    expect(result.current.user.id).toBe("u-bob");
  });

  it("アンマウントで onAuthChange の購読を解除する", async () => {
    const unsubscribe = vi.fn();
    const auth = {
      getCurrentUser: vi.fn().mockResolvedValue(null),
      onAuthChange: vi.fn(() => unsubscribe),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
    const { result, unmount } = renderHook(() => useAuth(auth));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(auth.onAuthChange).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
