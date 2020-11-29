// Copyright (c) 2013-2020 GitHub Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { expect } from 'chai'
import { BrowserWindow } from 'electron/main'
import { emittedOnce } from './events-helpers'

async function ensureWindowIsClosed(window: BrowserWindow | null) {
  if (window && !window.isDestroyed()) {
    if (window.webContents && !window.webContents.isDestroyed()) {
      // If a window isn't destroyed already, and it has non-destroyed WebContents,
      // then calling destroy() won't immediately destroy it, as it may have
      // <webview> children which need to be destroyed first. In that case, we
      // await the 'closed' event which signals the complete shutdown of the
      // window.
      const isClosed = emittedOnce(window, 'closed')
      window.destroy()
      await isClosed
    } else {
      // If there's no WebContents or if the WebContents is already destroyed,
      // then the 'closed' event has already been emitted so there's nothing to
      // wait for.
      window.destroy()
    }
  }
}

export const closeWindow = async (
  window: BrowserWindow | null = null,
  { assertNotWindows } = { assertNotWindows: true }
) => {
  await ensureWindowIsClosed(window)

  if (assertNotWindows) {
    const windows = BrowserWindow.getAllWindows()
    try {
      expect(windows).to.have.lengthOf(0)
    } finally {
      for (const win of windows) {
        await ensureWindowIsClosed(win)
      }
    }
  }
}

export async function closeAllWindows() {
  for (const w of BrowserWindow.getAllWindows()) {
    await closeWindow(w, { assertNotWindows: false })
  }
}
