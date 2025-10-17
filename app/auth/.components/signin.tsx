"use client"

import { signIn } from "next-auth/react"

export default function SignIn() {
  return (
    <button
      type="button"
      onClick={() => void signIn("google", { redirectTo: "/mypage" })}
      className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow transition hover:brightness-105"
    >
      <span>Google でサインイン</span>
    </button>
  )
}
