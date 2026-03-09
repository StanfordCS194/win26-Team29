export type TranscriptCourse = { code: string; title: string; units: number }
export type TranscriptData = {
  startYear: number
  planned: Record<string, TranscriptCourse[]>
}

const COMPONENT_TYPES = 'LEC|SEM|LNG|ISF|WKS|PRA|DIS|LAB|ACT|FLD|INS|COL|TUT|CAS|IND|WKP|STU|COR'

// Extracts text column-by-column (left then right) so two-column PDFs parse correctly
async function extractTextColumnSorted(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  let fullText = ''

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    const pageWidth = viewport.width
    const content = await page.getTextContent()

    type Item = { str: string; x: number; y: number }
    const leftItems: Item[] = []
    const rightItems: Item[] = []

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const x = item.transform[4]
      const y = item.transform[5]
      ;(x < pageWidth / 2 ? leftItems : rightItems).push({ str: item.str, x, y })
    }

    const sortByY = (a: Item, b: Item) => b.y - a.y

    const toText = (items: Item[]) => {
      if (items.length === 0) return ''
      items.sort(sortByY)
      const lines: string[] = []
      let line = ''
      let prevY = items[0].y
      for (const item of items) {
        if (Math.abs(item.y - prevY) > 3) {
          if (line.trim()) lines.push(line.trim())
          line = item.str
          prevY = item.y
        } else {
          line += ' ' + item.str
        }
      }
      if (line.trim()) lines.push(line.trim())
      return lines.join('\n')
    }

    fullText += toText(leftItems) + '\n' + toText(rightItems) + '\n'
  }

  return fullText
}

export async function parseTranscriptPDF(file: File): Promise<TranscriptData> {
  const text = await extractTextColumnSorted(file)
  console.log('[transcript] extracted text:\n', text)
  return parseTranscriptText(text)
}

export function parseTranscriptText(text: string): TranscriptData {
  const TERM_HEADER_REGEX = /^(\d{4})-\d{4}\s+(Autumn|Winter|Spring|Summer)/gm
  // Format: CMPT [DATE] SUBJECT NUMBER TITLE... ATTEMPTED EARNED [GRADE]
  // DATE only appears for withdrawals: e.g. "LEC 05/26/2023 MATH 51 ..."
  const COURSE_REGEX = new RegExp(
    `(?:${COMPONENT_TYPES})\\s+(?:\\d{2}/\\d{2}/\\d{4}\\s+)?([A-Z]+(?:\\s[A-Z]+)?)\\s+(\\d+\\w*)\\s+(.+?)\\s+(\\d+\\.\\d{2})\\s+\\d+\\.\\d{2}(?:\\s+(\\S+))?`,
    'g',
  )

  const termHeaders: Array<{ year: number; quarter: string; index: number }> = []
  let match: RegExpExecArray | null

  TERM_HEADER_REGEX.lastIndex = 0
  while ((match = TERM_HEADER_REGEX.exec(text)) !== null) {
    termHeaders.push({ year: parseInt(match[1], 10), quarter: match[2], index: match.index })
  }

  if (termHeaders.length === 0) {
    throw new Error('No terms found. Make sure you uploaded a Stanford unofficial transcript PDF.')
  }

  const startYear = termHeaders[0].year
  const planned: Record<string, TranscriptCourse[]> = {}

  for (let i = 0; i < termHeaders.length; i++) {
    const term = termHeaders[i]
    const section = text.slice(term.index, termHeaders[i + 1]?.index ?? text.length)
    const yearIndex = term.year - startYear
    const key = `${yearIndex}-${term.quarter}`
    const courses: TranscriptCourse[] = []

    COURSE_REGEX.lastIndex = 0
    while ((match = COURSE_REGEX.exec(section)) !== null) {
      const subject = match[1].trim()
      const number = match[2].trim()
      const title = match[3].trim()
      const units = parseFloat(match[4])
      const grade = match[5]?.trim()

      if (grade === 'W') continue // skip withdrawals

      courses.push({ code: `${subject} ${number}`, title, units })
    }

    if (courses.length > 0) {
      planned[key] = courses
    }
  }

  return { startYear, planned }
}
