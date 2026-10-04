/**
 * The Content-Security-Policy allows no eval. zod compiles its object schemas with
 * `new Function` when it can, and finds out by trying: the browser blocks the attempt and
 * reports it, on every visit. Told up front, it never tries.
 */
import { z } from 'zod'

z.config({ jitless: true })
