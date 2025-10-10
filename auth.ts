import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

import { prisma } from "@/lib/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const email =
        user.email ??
        (typeof account?.email === "string" ? account.email : null) ??
        (profile && typeof (profile as { email?: unknown }).email === "string"
          ? ((profile as { email: string }).email as string)
          : null)

      if (!email) {
        console.error("[auth.signIn] Missing email in OAuth profile")
        return false
      }

      const normalizedEmail = email.toLowerCase()
      const displayName =
        user.name?.trim() ||
        (typeof profile === "object" && profile && "name" in profile && typeof profile.name === "string"
          ? profile.name.trim()
          : "") ||
        normalizedEmail.split("@")[0] ||
        "User"

      const avatar =
        typeof user.image === "string" && user.image.trim()
          ? user.image.trim()
          : (typeof profile === "object" && profile && "picture" in profile && typeof profile.picture === "string"
              ? profile.picture.trim()
              : null)

      try {
        await prisma.user.upsert({
          where: { email: normalizedEmail },
          update: {
            name: displayName,
            avatar,
          },
          create: {
            email: normalizedEmail,
            name: displayName,
            avatar,
          },
        })
      } catch (error) {
        console.error("[auth.signIn] Failed to upsert user", error)
        return false
      }

      return true
    },
    async jwt({ token, user }) {
      if (user?.email && typeof user.email === "string") {
        token.email = user.email.toLowerCase()
      }

      const email = typeof token.email === "string" ? token.email.toLowerCase() : undefined

      if (!email) {
        return token
      }

      if (!token.userId || user) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, avatar: true },
        })

        if (dbUser) {
          token.userId = dbUser.id
          if (dbUser.name) {
            token.name = dbUser.name
          }
          if (dbUser.avatar) {
            token.picture = dbUser.avatar
          }
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId
        if (typeof token.name === "string") {
          session.user.name = token.name
        }
        if (typeof token.picture === "string") {
          session.user.image = token.picture
        }
        if (typeof token.email === "string") {
          session.user.email = token.email
        }
      }

      return session
    },
  },
})
