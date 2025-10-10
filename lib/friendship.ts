import { prisma } from "@/lib/prisma"

export async function areUsersFriends(userId: string, targetUserId: string) {
  if (userId === targetUserId) {
    return true
  }

  const [first, second] = [userId, targetUserId].sort()

  const friendship = await prisma.friendship.findFirst({
    where: {
      user_a_id: first,
      user_b_id: second,
    },
    select: { id: true },
  })

  return Boolean(friendship)
}
