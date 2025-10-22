"use client"

import { signIn } from "next-auth/react"

export default function SignIn() {
  return (
    <button
      className="button-like flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow transition hover:brightness-105"
      type="button"
      onClick={() => void signIn("google", { redirectTo: "/mypage" })}
    >
      <span>Google でサインイン</span>
    </button>
  )
}
