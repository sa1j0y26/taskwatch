import { signOut } from "@/auth"
 
export default function SignOut() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/" })
      }}
    >
      <button
        type="submit"
        className="rounded-full border border-strap/50 px-4 py-2 text-sm font-medium text-forest/80 transition hover:bg-accent-soft"
      >
        サインアウト
      </button>
    </form>
  )
} 
