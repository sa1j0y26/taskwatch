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

export async function getFriendIdsForUser(userId: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ user_a_id: userId }, { user_b_id: userId }],
    },
    select: {
      user_a_id: true,
      user_b_id: true,
    },
  })

  const friendIds = new Set<string>([userId])

  friendships.forEach((friendship) => {
    friendIds.add(friendship.user_a_id === userId ? friendship.user_b_id : friendship.user_a_id)
  })

  return Array.from(friendIds)
}
