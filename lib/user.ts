import { Prisma } from "@prisma/client"

export const publicUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  email: true,
  avatar: true,
  avatar_color: true,
})

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>

export function serializePublicUser(user: PublicUser | null | undefined) {
  if (!user) {
    return null
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    avatarColor: user.avatar_color,
  }
}
