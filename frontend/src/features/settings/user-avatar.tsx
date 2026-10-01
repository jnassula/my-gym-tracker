import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { User } from '@/lib/auth'

import { avatarQuery } from './api'

type UserAvatarProps = {
  user: Pick<User, 'name' | 'avatar_file_id'>
  /** Its size (`size-11`, `size-16`). */
  className?: string
  /** The initial's size (`text-lg`, `text-2xl`). */
  fallbackClassName?: string
}

/** The profile photo, or the name's initial while there is none (or while it loads). */
export function UserAvatar({ user, className, fallbackClassName }: UserAvatarProps) {
  const fileId = user.avatar_file_id
  const photo = useQuery({ ...avatarQuery(fileId ?? ''), enabled: fileId !== null })
  return (
    <Avatar className={className}>
      {/* Decorative: the name is always written next to it, or on the link around it. */}
      {fileId !== null && photo.data && <AvatarImage src={photo.data} alt="" />}
      <AvatarFallback className={cn('bg-accent text-accent-foreground', fallbackClassName)}>
        {user.name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
