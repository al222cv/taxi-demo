import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'trips-v7.json')
    const file = await readFile(filePath, 'utf-8')
    return new NextResponse(file, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate'
      }
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load trips' }, { status: 500 })
  }
}
