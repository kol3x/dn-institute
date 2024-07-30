import { Hono } from "hono"

interface SearchResult {
  title?: string | null
  link?: string | null
}

interface SearchResponse {
  items: Array<SearchResult>
}

interface PlagiarismResult {
  sentence: string
  matches: Array<SearchResult>
}

type PlagiarismResults = Array<PlagiarismResult | null>

type Env = {
  GOOGLE_API_KEY: string
  GOOGLE_SEARCH_ENGINE_CX: string
}

function formatPlagiarismResults(
  plagiarismResults: PlagiarismResults,
  plagiarismPercent: string
) {
  let formattedResponse = "## Plagiarism Check Results:\n\n"
  formattedResponse += `### ${plagiarismPercent}% plagiarism detected\n\n`

  if (plagiarismResults.length > 0) {
    plagiarismResults.forEach((result) => {
      formattedResponse += `Sentence: ${result.sentence}\n`

      result.matches.forEach((match) => {
        formattedResponse += `[${match.title}](${match.link})\n`
      })

      formattedResponse += "\n"
    })
  } else {
    formattedResponse += "### No plagiarism detected."
  }

  return formattedResponse
}

const app = new Hono<{ Bindings: Env }>()

app.use("*", async (c, next) => {
  const apiKey = c.env.GOOGLE_API_KEY
  if (!apiKey) {
    return c.text("API key not found", 400)
  }

  const searchEngine = c.env.GOOGLE_SEARCH_ENGINE_CX
  if (!searchEngine) {
    return c.text("Search engine not specified", 400)
  }

  return next()
})

app.post("/", async (c) => {
  const { text } = await c.req.json()

  if (typeof text !== "string") {
    return c.json({ error: "Invalid JSON format" }, 400)
  }

  const textWithoutHeaders = text.replace(/^#+\s*[A-Z].*$/gm, "")

  let sentences: string[] | null = textWithoutHeaders.match(
    /(?=[^])(?:\P{Sentence_Terminal}|\p{Sentence_Terminal}(?!['"`\p{Close_Punctuation}\p{Final_Punctuation}\s]))*(?:\p{Sentence_Terminal}+['"`\p{Close_Punctuation}\p{Final_Punctuation}]*|$)/guy
  )

  if (!sentences)
    return c.json({
      plagiarismResults: 0,
      results: "None",
    })

  sentences = sentences.map((sentence) => sentence.trim().replace(/(\r\n|\n|\r)/gm, "")) // remove new and empty lines

  let plagiarismResults: PlagiarismResults = await Promise.all(
    sentences.map(async (sentence) => {
      const query = encodeURIComponent(sentence.trim())
      const url = `https://www.googleapis.com/customsearch/v1?exactTerms=${query}&key=${c.env.GOOGLE_API_KEY}&cx=${c.env.GOOGLE_SEARCH_ENGINE_CX}&num=1`
      const response = await fetch(url)
      const searchResults: SearchResponse = await response.json()

      if (!searchResults.items) {
        return null
      }
      return {
        sentence,
        matches: searchResults.items.map((item: SearchResult) => ({
          title: item.title,
          link: item.link,
        })),
      }
    })
  )

  plagiarismResults = plagiarismResults.filter((result) => result !== null)

  let plagiarisedSentencesNum = 0

  if (plagiarismResults) {
    plagiarisedSentencesNum = plagiarismResults.reduce((total, current) => {
      if (current?.matches?.length && current?.matches?.length > 0) {
        total++
      }
      return total
    }, 0)
  }

  const plagiarismPercent = (
    (plagiarisedSentencesNum / sentences.length) *
    100
  ).toFixed(2)

  const mdFormattedText = formatPlagiarismResults(
    plagiarismResults,
    plagiarismPercent
  )

  return c.json({ results: mdFormattedText })
})

export default app