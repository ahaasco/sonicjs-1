import { Hono } from 'hono'
import { RedirectService } from '../services/redirect'
import { renderRedirectListPage } from '../templates/redirect-list.template'
import type { RedirectFilter, MatchType, StatusCode } from '../types'

/**
 * Create admin route handlers for redirect management UI
 */
export function createRedirectAdminRoutes(): Hono {
  const admin = new Hono()

  /**
   * GET /admin/redirects
   * Display the redirect list page with filtering and pagination
   */
  admin.get('/', async (c: any) => {
    try {
      // Get DB from context
      const db = c.get('db') || c.env?.DB
      if (!db) {
        return c.html('<h1>Database not available</h1>', 500)
      }

      // Parse query parameters
      const page = parseInt(c.req.query('page') || '1')
      const limit = parseInt(c.req.query('limit') || '20')
      const search = c.req.query('search') || undefined
      const statusCodeParam = c.req.query('statusCode')
      const matchTypeParam = c.req.query('matchType')
      const isActiveParam = c.req.query('isActive')

      // Parse status code filter
      let statusCode: StatusCode | undefined
      if (statusCodeParam && ['301', '302', '307', '308', '410'].includes(statusCodeParam)) {
        statusCode = parseInt(statusCodeParam) as StatusCode
      }

      // Parse match type filter
      let matchType: MatchType | undefined
      if (matchTypeParam && ['0', '1', '2'].includes(matchTypeParam)) {
        matchType = parseInt(matchTypeParam) as MatchType
      }

      // Parse active status filter
      let isActive: boolean | undefined
      if (isActiveParam === 'true') {
        isActive = true
      } else if (isActiveParam === 'false') {
        isActive = false
      }

      // Build filter object with only defined properties
      const filter: RedirectFilter = {
        limit,
        offset: (page - 1) * limit
      }

      if (search !== undefined) filter.search = search
      if (statusCode !== undefined) filter.statusCode = statusCode
      if (matchType !== undefined) filter.matchType = matchType
      if (isActive !== undefined) filter.isActive = isActive

      // Fetch redirects and count in parallel
      const service = new RedirectService(db)
      const [redirects, total] = await Promise.all([
        service.list(filter),
        service.count(filter)
      ])

      // Calculate pagination
      const totalPages = Math.ceil(total / limit)

      // Render page
      const html = renderRedirectListPage({
        redirects,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        filters: {
          search,
          statusCode: statusCodeParam,
          matchType: matchTypeParam,
          isActive: isActiveParam
        },
        user: c.get('user')
      })

      return c.html(html)
    } catch (error) {
      console.error('Error loading redirect list page:', error)
      return c.html('<h1>Error loading redirects</h1>', 500)
    }
  })

  /**
   * DELETE /admin/redirects/:id
   * Delete a single redirect
   */
  admin.delete('/:id', async (c: any) => {
    try {
      const id = c.req.param('id')
      const db = c.get('db') || c.env?.DB
      if (!db) {
        return c.json({ success: false, error: 'Database not available' }, 500)
      }

      const service = new RedirectService(db)
      const result = await service.delete(id)

      if (result.success) {
        return c.json({ success: true, message: 'Redirect deleted successfully' })
      } else {
        return c.json({ success: false, error: result.error }, 404)
      }
    } catch (error) {
      console.error('Error deleting redirect:', error)
      return c.json({ success: false, error: 'Failed to delete redirect' }, 500)
    }
  })

  /**
   * POST /admin/redirects/bulk-delete
   * Delete multiple redirects in bulk
   */
  admin.post('/bulk-delete', async (c: any) => {
    try {
      const db = c.get('db') || c.env?.DB
      if (!db) {
        return c.json({ success: false, error: 'Database not available' }, 500)
      }

      // Parse request body to get IDs
      const body = await c.req.json()
      const ids: string[] = body.ids || []

      if (!Array.isArray(ids) || ids.length === 0) {
        return c.json({ success: false, error: 'No redirect IDs provided' }, 400)
      }

      const service = new RedirectService(db)
      let deleted = 0
      let failed = 0
      const errors: string[] = []

      // Delete each redirect
      for (const id of ids) {
        try {
          const result = await service.delete(id)
          if (result.success) {
            deleted++
          } else {
            failed++
            errors.push(`ID ${id}: ${result.error || 'Unknown error'}`)
          }
        } catch (error) {
          failed++
          errors.push(`ID ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // Return summary
      if (failed === ids.length) {
        // All failed
        return c.json({
          success: false,
          error: `Failed to delete all ${failed} redirects`,
          details: errors
        }, 400)
      } else {
        // At least some succeeded
        return c.json({
          success: true,
          deleted,
          failed,
          total: ids.length,
          errors: failed > 0 ? errors : undefined
        })
      }
    } catch (error) {
      console.error('Error in bulk delete:', error)
      return c.json({ success: false, error: 'Failed to process bulk delete request' }, 500)
    }
  })

  return admin
}

export default createRedirectAdminRoutes
