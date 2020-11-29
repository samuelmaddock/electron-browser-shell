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

/**
 * @fileoverview A set of helper functions to make it easier to work
 * with events in async/await manner.
 */

/**
 * @param {!EventTarget} target
 * @param {string} eventName
 * @return {!Promise<!Event>}
 */
export const waitForEvent = (target: EventTarget, eventName: string) => {
  return new Promise((resolve) => {
    target.addEventListener(eventName, resolve, { once: true })
  })
}

/**
 * @param {!EventEmitter} emitter
 * @param {string} eventName
 * @return {!Promise<!Array>} With Event as the first item.
 */
export const emittedOnce = (
  emitter: NodeJS.EventEmitter,
  eventName: string,
  trigger?: () => void
) => {
  return emittedNTimes(emitter, eventName, 1, trigger).then(([result]) => result)
}

export const emittedNTimes = async (
  emitter: NodeJS.EventEmitter,
  eventName: string,
  times: number,
  trigger?: () => void
) => {
  const events: any[][] = []
  const p = new Promise<any[][]>((resolve) => {
    const handler = (...args: any[]) => {
      events.push(args)
      if (events.length === times) {
        emitter.removeListener(eventName, handler)
        resolve(events)
      }
    }
    emitter.on(eventName, handler)
  })
  if (trigger) {
    await Promise.resolve(trigger())
  }
  return p
}

export const emittedUntil = async (
  emitter: NodeJS.EventEmitter,
  eventName: string,
  untilFn: Function
) => {
  const p = new Promise<any[]>((resolve) => {
    const handler = (...args: any[]) => {
      if (untilFn(...args)) {
        emitter.removeListener(eventName, handler)
        resolve(args)
      }
    }
    emitter.on(eventName, handler)
  })
  return p
}
