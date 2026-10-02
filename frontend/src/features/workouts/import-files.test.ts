import { describe, expect, it } from 'vitest'

import { checkFiles, MAX_FILE_BYTES } from './import-files'

const file = (name: string, type: string, size = 1000) => {
  const f = new File([new Uint8Array(1)], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('checkFiles', () => {
  it('takes one PDF, or photos', () => {
    expect(checkFiles([file('plano.pdf', 'application/pdf')])).toBeNull()
    expect(checkFiles([file('IMG_1.jpeg', 'image/jpeg'), file('IMG_2.png', 'image/png')])).toBeNull()
    // iOS sometimes sends a photo without a type.
    expect(checkFiles([file('IMG_3.JPG', '')])).toBeNull()
  })

  it('refuses a PDF with company, too many photos, other kinds and big files', () => {
    expect(checkFiles([file('plano.pdf', 'application/pdf'), file('a.jpeg', 'image/jpeg')])?.code).toBe('too_many_files')
    expect(checkFiles(Array.from({ length: 11 }, (_, i) => file(`${i}.jpeg`, 'image/jpeg')))?.code).toBe('too_many_files')
    expect(checkFiles([file('notas.docx', 'application/msword')])).toEqual({
      code: 'unsupported_file_type',
      file: expect.objectContaining({ name: 'notas.docx' }),
    })
    expect(checkFiles([file('a.jpeg', 'image/jpeg', MAX_FILE_BYTES + 1)])?.code).toBe('file_too_large')
  })
})
