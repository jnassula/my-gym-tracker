import { z } from 'zod'

// Messages are translation keys; see fieldMessage().
const email = z.string().trim().min(1, 'validation.required').email('validation.email')
const newPassword = z
  .string()
  .min(8, 'validation.passwordMin')
  .max(128, 'validation.passwordMax')
const anyPassword = z.string().min(1, 'validation.required').max(128, 'validation.passwordMax')

export const loginSchema = z.object({
  email,
  password: anyPassword,
  remember: z.boolean(),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(100, 'validation.nameMax'),
  email,
  password: newPassword,
})
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'validation.passwordsMismatch',
  })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = z
  .object({ current: anyPassword, password: newPassword, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'validation.passwordsMismatch',
  })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
