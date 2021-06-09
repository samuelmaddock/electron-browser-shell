import { ExtensionContext } from '../context'

/**
 * Stub implementation for chrome.commands API.
 */
export class CommandsAPI {
  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler(this.ctx)
    handle('commands.getAll', this.getAll)
  }

  getAll() {
    return []
  }
}
