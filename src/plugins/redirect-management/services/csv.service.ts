/**
 * CSV Service
 *
 * Handles CSV parsing and generation for redirect import/export
 */

import { parse } from 'csv-parse/browser/esm/sync'
import { sanitizeCSVField } from '../utils/csv-sanitizer.js'
import type { Redirect, CSVParseResult, CSVError, ParsedRedirectRow, MatchType } from '../types.js'

/**
 * Parse CSV content into redirect rows
 *
 * @param content - Raw CSV content string
 * @returns Parse result with rows and any errors
 *
 * @example
 * const result = parseCSV(csvContent)
 * if (result.isValid) {
 *   // Process result.rows
 * } else {
 *   // Handle result.errors
 * }
 */
export function parseCSV(content: string): CSVParseResult {
  const errors: CSVError[] = []
  const rows: ParsedRedirectRow[] = []

  try {
    // Parse CSV with headers
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    })

    // Validate and map each row
    for (let i = 0; i < records.length; i++) {
      const lineNumber = i + 2 // +1 for 0-index, +1 for header row
      const record = records[i]

      // Check required fields
      if (!record.source_url || !record.destination_url) {
        errors.push({
          line: lineNumber,
          error: 'Missing required fields: source_url and destination_url'
        })
        continue
      }

      // Map to ParsedRedirectRow
      rows.push({
        source_url: record.source_url,
        destination_url: record.destination_url,
        match_type: record.match_type || 'exact',
        status_code: record.status_code || '301',
        active: record.active || 'true',
        include_query_params: record.include_query_params,
        preserve_query_params: record.preserve_query_params
      })
    }
  } catch (error) {
    errors.push({
      line: 1,
      error: `CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }

  return {
    isValid: errors.length === 0,
    rows,
    errors
  }
}

/**
 * Generate CSV content from redirect records
 *
 * @param redirects - Array of redirect records to export
 * @returns CSV content string with headers and sanitized data
 *
 * @example
 * const csv = generateCSV(redirects)
 * // Returns: "id,source_url,destination_url,match_type,..."
 */
export function generateCSV(redirects: Redirect[]): string {
  // Define headers
  const headers = [
    'id',
    'source_url',
    'destination_url',
    'match_type',
    'status_code',
    'active',
    'include_query_params',
    'preserve_query_params',
    'created_at',
    'updated_at'
  ]

  // Map redirects to CSV rows
  const rows = redirects.map(r => [
    r.id,
    sanitizeCSVField(r.source),
    sanitizeCSVField(r.destination),
    matchTypeToLabel(r.matchType),
    r.statusCode.toString(),
    r.isActive ? 'true' : 'false',
    r.includeQueryParams ? 'true' : 'false',
    r.preserveQueryParams ? 'true' : 'false',
    new Date(r.createdAt).toISOString(),
    new Date(r.updatedAt).toISOString()
  ])

  // Build CSV content
  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ]

  return csvLines.join('\n')
}

/**
 * Convert match type number to text label
 *
 * @param matchType - Numeric match type (0, 1, 2)
 * @returns Text label ('exact', 'partial', 'regex')
 */
export function matchTypeToLabel(matchType: MatchType): string {
  switch (matchType) {
    case 0:
      return 'exact'
    case 1:
      return 'partial'
    case 2:
      return 'regex'
    default:
      return 'exact'
  }
}

/**
 * Convert match type label to number
 *
 * @param label - Text label or numeric string
 * @returns Numeric match type (0, 1, 2) or undefined if invalid
 */
export function labelToMatchType(label: string): MatchType | undefined {
  const normalized = label.toLowerCase().trim()

  switch (normalized) {
    case 'exact':
    case '0':
      return 0
    case 'partial':
    case '1':
      return 1
    case 'regex':
    case '2':
      return 2
    default:
      return undefined
  }
}

/**
 * Build descriptive filename based on active filters
 *
 * @param filters - Active filter parameters
 * @returns Descriptive filename for CSV export
 *
 * @example
 * buildExportFilename({}) // "redirects.csv"
 * buildExportFilename({ statusCode: '301' }) // "redirects-301.csv"
 * buildExportFilename({ statusCode: '301', isActive: 'true' }) // "redirects-301-active.csv"
 * buildExportFilename({ matchType: '1' }) // "redirects-partial-match.csv"
 */
export function buildExportFilename(filters: {
  statusCode?: string
  matchType?: string
  isActive?: string
  search?: string
}): string {
  const parts = ['redirects']

  if (filters.statusCode) {
    parts.push(filters.statusCode)
  }

  if (filters.matchType !== undefined) {
    const labels = { '0': 'exact', '1': 'partial', '2': 'regex' }
    parts.push(`${labels[filters.matchType as keyof typeof labels] || filters.matchType}-match`)
  }

  if (filters.isActive === 'true') {
    parts.push('active')
  } else if (filters.isActive === 'false') {
    parts.push('inactive')
  }

  if (filters.search) {
    // Sanitize search term for filename (remove special chars)
    const sanitized = filters.search.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20)
    if (sanitized) {
      parts.push(`search-${sanitized}`)
    }
  }

  return `${parts.join('-')}.csv`
}
