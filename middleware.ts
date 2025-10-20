import { NextResponse } from "next/server"

import { auth } from "@/auth"

export const runtime = "nodejs"

const PUBLIC_PATHS = new Set([
  "/",
  "/api/auth/signin",
  "/api/auth/callback/google",
])

function isPublic(pathname: string) {
  if (pathname.startsWith("/_next")) return true
  if (pathname.startsWith("/api/auth")) return true
  if (PUBLIC_PATHS.has(pathname)) return true
  if (/\.(?:svg|png|jpg|jpeg|gif|webp)$/i.test(pathname)) return true
  return false
}

export default auth((req) => {
  const { pathname, search, hash } = req.nextUrl

  if (isPublic(pathname)) {
    if (pathname === "/" && req.auth) {
      const redirectUrl = new URL("/mypage", req.nextUrl)
      redirectUrl.search = ""
      redirectUrl.hash = ""
      return NextResponse.redirect(redirectUrl)
    }
    return NextResponse.next()
  }

  if (!req.auth) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl)
    signInUrl.searchParams.set("callbackUrl", `${pathname}${search}${hash}`)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
