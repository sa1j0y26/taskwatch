import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

type SessionCookie = {
  name: string
  value: string
}

function findSessionCookie(request: NextRequest): SessionCookie | null {
  const possibleNames = ["next-auth.session-token", "__Secure-next-auth.session-token"]
  for (const name of possibleNames) {
    const value = request.cookies.get(name)?.value
    if (value) {
      return { name, value }
    }
  }
  return null
}

function isProtectedPath(pathname: string) {
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/_next")) {
    return false
  }
  if (/\.(?:svg|png|jpg|jpeg|gif|webp)$/i.test(pathname)) {
    return false
  }
  return pathname !== "/"
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!isProtectedPath(pathname)) {
    return NextResponse.next()
  }

  const sessionCookie = findSessionCookie(request)
  if (!sessionCookie) {
    const loginUrl = new URL("/api/auth/signin", request.url)
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
