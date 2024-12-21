# Shell

This is a simple browser shell to demonstrate tabs and extension functionality.

A `WebContentsView` is used for tab contents due to its stability for browsing remote content relative to the [buggy behaviors](https://github.com/electron/electron/issues?q=is%3Aissue+is%3Aopen+webview) found in Electron's `<webview>` API.

## License

MIT
