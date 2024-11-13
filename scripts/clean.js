const fs = require('fs')
const path = require('path')

function cleanDirectory(dirPath) {
  const resolvedPath = path.resolve(dirPath)

  const parentDir = path.basename(path.dirname(resolvedPath))
  if (parentDir !== 'packages') {
    console.error(`Error: Directory "${resolvedPath}" is not inside a "packages" folder`)
    return
  }

  const distPath = path.join(resolvedPath, 'dist')

  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true })
    console.log(`deleted: ${distPath}`)
  }
}

cleanDirectory(process.cwd())
