import { signIn } from "@/auth"
 
export default function SignIn() {
  return (
    <form
      action={async () => {
        "use server"
        await signIn("google", { redirectTo: "/mypage" })
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow transition hover:brightness-105"
      >
        <span>Google でサインイン</span>
      </button>
    </form>
  )
}
