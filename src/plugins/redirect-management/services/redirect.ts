import manifest from '../manifest.json'
import type { RedirectSettings } from '../types'
import type { D1Database } from '@cloudflare/workers-types'

export class RedirectService {
  constructor(private db: D1Database) {}

  /**
   * Get plugin settings from the database
   */
  async getSettings(): Promise<{ status: string; data: RedirectSettings }> {
    try {
      const record = await this.db
        .prepare(`SELECT settings, status FROM plugins WHERE id = ?`)
        .bind(manifest.id)
        .first()

      if (!record) {
        return {
          status: 'inactive',
          data: this.getDefaultSettings()
        }
      }

      return {
        status: (record?.status as string) || 'inactive',
        data: record?.settings ? JSON.parse(record.settings as string) : this.getDefaultSettings()
      }
    } catch (error) {
      console.error('Error getting redirect management settings:', error)
      return {
        status: 'inactive',
        data: this.getDefaultSettings()
      }
    }
  }

  /**
   * Get default settings
   */
  getDefaultSettings(): RedirectSettings {
    return {
      enabled: true
    }
  }

  /**
   * Save plugin settings to the database
   */
  async saveSettings(settings: RedirectSettings): Promise<void> {
    try {
      console.log('[RedirectService.saveSettings] Starting save for plugin:', manifest.id)
      console.log('[RedirectService.saveSettings] Settings:', JSON.stringify(settings))

      // Check if plugin row exists
      const existing = await this.db
        .prepare(`SELECT id, status FROM plugins WHERE id = ?`)
        .bind(manifest.id)
        .first()

      console.log('[RedirectService.saveSettings] Existing row:', JSON.stringify(existing))

      if (existing) {
        // Update existing row
        console.log('[RedirectService.saveSettings] Updating existing row...')
        const result = await this.db
          .prepare(`UPDATE plugins SET settings = ?, last_updated = ? WHERE id = ?`)
          .bind(JSON.stringify(settings), Date.now(), manifest.id)
          .run()
        console.log('[RedirectService.saveSettings] UPDATE result:', JSON.stringify(result))
        console.log('[RedirectService.saveSettings] Successfully updated')
      } else {
        // Insert new row
        console.log('[RedirectService.saveSettings] No existing row, inserting new...')
        const result = await this.db
          .prepare(`
            INSERT INTO plugins (id, name, display_name, description, version, author, category, status, settings, installed_at, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?, ?)
          `)
          .bind(
            manifest.id,
            manifest.id,
            manifest.name,
            manifest.description || '',
            manifest.version || '1.0.0',
            manifest.author || 'Unknown',
            manifest.category || 'other',
            JSON.stringify(settings),
            Date.now(),
            Date.now()
          )
          .run()
        console.log('[RedirectService.saveSettings] INSERT result:', JSON.stringify(result))
        console.log('[RedirectService.saveSettings] Successfully inserted')
      }
      console.log('[RedirectService.saveSettings] Settings saved successfully')
    } catch (error) {
      console.error('[RedirectService.saveSettings] ERROR:', error)
      console.error('[RedirectService.saveSettings] Error message:', error instanceof Error ? error.message : String(error))
      console.error('[RedirectService.saveSettings] Error stack:', error instanceof Error ? error.stack : 'No stack')
      throw new Error(`Failed to save redirect management settings: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Lifecycle methods
  /**
   * Install the plugin (create database entry)
   */
  async install(): Promise<void> {
    try {
      const defaultSettings = this.getDefaultSettings()
      await this.db
        .prepare(`
          INSERT INTO plugins (
            id, name, display_name, description, version, author,
            category, status, settings, installed_at, last_updated
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            display_name = excluded.display_name,
            description = excluded.description,
            version = excluded.version,
            updated_at = excluded.last_updated
        `)
        .bind(
          manifest.id,
          manifest.id,
          manifest.name,
          manifest.description,
          manifest.version,
          manifest.author,
          manifest.category,
          JSON.stringify(defaultSettings),
          Date.now(),
          Date.now()
        )
        .run()
      console.log('Redirect management plugin installed successfully')
    } catch (error) {
      console.error('Error installing redirect management plugin:', error)
      throw new Error('Failed to install redirect management plugin')
    }
  }

  /**
   * Activate the plugin
   */
  async activate(): Promise<void> {
    try {
      await this.db
        .prepare(`
          UPDATE plugins
          SET status = 'active', last_updated = ?
          WHERE id = ?
        `)
        .bind(Date.now(), manifest.id)
        .run()
      console.log('Redirect management plugin activated')
    } catch (error) {
      console.error('Error activating redirect management plugin:', error)
      throw new Error('Failed to activate redirect management plugin')
    }
  }

  /**
   * Deactivate the plugin
   */
  async deactivate(): Promise<void> {
    try {
      await this.db
        .prepare(`
          UPDATE plugins
          SET status = 'inactive', last_updated = ?
          WHERE id = ?
        `)
        .bind(Date.now(), manifest.id)
        .run()
      console.log('Redirect management plugin deactivated')
    } catch (error) {
      console.error('Error deactivating redirect management plugin:', error)
      throw new Error('Failed to deactivate redirect management plugin')
    }
  }

  /**
   * Uninstall the plugin (remove database entry)
   */
  async uninstall(): Promise<void> {
    try {
      await this.db
        .prepare(`DELETE FROM plugins WHERE id = ?`)
        .bind(manifest.id)
        .run()
      console.log('Redirect management plugin uninstalled')
    } catch (error) {
      console.error('Error uninstalling redirect management plugin:', error)
      throw new Error('Failed to uninstall redirect management plugin')
    }
  }
}
